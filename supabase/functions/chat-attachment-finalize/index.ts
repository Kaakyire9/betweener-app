// @ts-nocheck
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.110.7'
import nacl from 'https://esm.sh/tweetnacl@1.0.3'
import naclUtil from 'https://esm.sh/tweetnacl-util@0.15.1'
import { corsHeaders } from '../_shared/cors.ts'
import {
  assessPrivateMessageRules,
  classifyImageSolicitation,
  classifyTextSolicitation,
  mergeContentSafetyAssessments,
  mergeChatImageSafetyAssessments,
  mergePrivateMessageSafetyAssessments,
  moderateWithOpenAI,
  shouldClassifyPrivateMessageSolicitation,
} from '../_shared/content-safety.ts'
import { assessMediaExtractedText, mergeExtractedTextPolicy } from '../_shared/media-extracted-text-policy.ts'
import { decodeQrPayloads } from '../_shared/qr-decoder.ts'
import {
  publishCapturedBytes,
  requireSafeViewOncePlaintextHash,
} from '../_shared/immutable-media-publication.ts'
import { runWithTransientContentSafetyRetry } from '../_shared/content-safety-retry.ts'

const json = (status: number, body: Record<string, unknown>) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, 'Content-Type': 'application/json' },
})

const LIMITS = { image: 15 * 1024 * 1024, video: 90 * 1024 * 1024, document: 50 * 1024 * 1024, audio: 25 * 1024 * 1024 }
const DOCUMENT_MIMES = new Set([
  'application/pdf', 'application/rtf', 'text/rtf', 'text/plain', 'text/csv',
  'application/msword', 'application/vnd.ms-excel', 'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.apple.pages', 'application/vnd.apple.numbers', 'application/vnd.apple.keynote',
  'application/x-unknown', 'application/octet-stream',
])
const SAFE_DOCUMENT_EXTENSIONS = new Set([
  'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'csv', 'rtf', 'pages', 'numbers', 'key',
])

const SAFE_VIEW_ONCE_IMAGE_MIMES = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/gif',
])
const { decodeBase64, encodeBase64 } = naclUtil
const VIEW_ONCE_PLAINTEXT_LIMIT = LIMITS.image - nacl.secretbox.overheadLength
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const CLIENT_CONTENT_ID_PATTERN = /^[a-zA-Z0-9_-]{1,160}$/
const CHAT_ATTACHMENT_STAGING_BUCKET = 'chat-attachment-staging-v1-2'
const CHAT_ATTACHMENT_GUARD_CONTRACT_V1_2 = '1.2.0'
const CHAT_IMAGE_POLICY_VERSION = 'chat-image-safety-v1.2.1'
const requiresChildSafetyEvidenceHold = (assessment) => assessment?.categories?.some(
  (category: string) => ['known_illegal_media', 'suspected_child_sexual_content'].includes(category),
)

const sha256Hex = async (bytes: Uint8Array) => {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))
  return [...digest].map((value) => value.toString(16).padStart(2, '0')).join('')
}

const encryptApprovedViewOnceImage = (
  plainBytes: Uint8Array,
  senderPublicKeyB64: string,
  receiverPublicKeyB64: string,
) => {
  const senderPublicKey = decodeBase64(senderPublicKeyB64)
  const receiverPublicKey = decodeBase64(receiverPublicKeyB64)
  if (senderPublicKey.length !== nacl.box.publicKeyLength || receiverPublicKey.length !== nacl.box.publicKeyLength) {
    throw new Error('view_once_public_key_invalid')
  }
  const mediaKey = crypto.getRandomValues(new Uint8Array(nacl.secretbox.keyLength))
  const mediaNonce = crypto.getRandomValues(new Uint8Array(nacl.secretbox.nonceLength))
  const keyNonce = crypto.getRandomValues(new Uint8Array(nacl.box.nonceLength))
  const encryptionKeypair = nacl.box.keyPair()
  try {
    return {
      cipherBytes: nacl.secretbox(plainBytes, mediaNonce, mediaKey),
      encryptedKeySender: encodeBase64(nacl.box(
        mediaKey, keyNonce, senderPublicKey, encryptionKeypair.secretKey,
      )),
      encryptedKeyReceiver: encodeBase64(nacl.box(
        mediaKey, keyNonce, receiverPublicKey, encryptionKeypair.secretKey,
      )),
      encryptedKeyNonce: encodeBase64(keyNonce),
      encryptedMediaNonce: encodeBase64(mediaNonce),
      encryptionPublicKey: encodeBase64(encryptionKeypair.publicKey),
    }
  } finally {
    mediaKey.fill(0)
    encryptionKeypair.secretKey.fill(0)
  }
}

const receiptToFinalizeInput = (receipt: Record<string, unknown>, replyToMessageId: unknown) => ({
  mode: 'finalize_single',
  receiverId: receipt.receiver_user_id,
  clientMessageId: receipt.client_message_id,
  attachmentId: receipt.attachment_id,
  attachmentType: 'image',
  bucketId: 'chat-media',
  storagePath: receipt.encrypted_storage_path,
  originalName: receipt.original_name,
  mimeType: receipt.mime_type,
  byteSize: receipt.encrypted_byte_size,
  replyToMessageId: replyToMessageId || null,
  isViewOnce: true,
  encryptedKeySender: receipt.encrypted_key_sender,
  encryptedKeyReceiver: receipt.encrypted_key_receiver,
  encryptedKeyNonce: receipt.encrypted_key_nonce,
  encryptedMediaNonce: receipt.encrypted_media_nonce,
  encryptedMediaAlg: 'nacl-secretbox',
  senderPublicKey: receipt.encryption_public_key,
  attachmentIndex: 0,
  expectedCount: 1,
})

const assessChatImages = async (
  assets: Array<{ imageUrl: string; bytes: Uint8Array; mime: string }>,
) => {
  const startedAt = performance.now()
  const providerStartedAt = performance.now()
  const harmAsset = assets[0]
  const solicitationAsset = assets[assets.length - 1]
  const solicitationController = new AbortController()
  const harmPromise = moderateWithOpenAI([{
      type: 'image_url', image_url: { url: harmAsset.imageUrl },
    }])
  const solicitationPromise = classifyImageSolicitation(
    solicitationAsset.imageUrl,
    'chat_image',
    { signal: solicitationController.signal },
  )
  const qrPromise = decodeQrPayloads(solicitationAsset.bytes, solicitationAsset.mime)
  const harm = await harmPromise

  // A definitive dedicated-harm block cannot be made safer by waiting for the
  // slower solicitation/OCR pass. Cancel that request and reject immediately.
  // ALLOW/REVIEW decisions still wait for every policy signal below.
  if (harm.decision === 'BLOCK' && !harm.failureReason) {
    solicitationController.abort()
    void solicitationPromise.catch(() => undefined)
    void qrPromise.catch(() => undefined)
    const totalMs = Math.round(performance.now() - startedAt)
    console.log('[chat-attachment-finalize] image-assessment-timing', {
      assetCount: assets.length,
      byteSize: assets.reduce((total, asset) => total + asset.bytes.byteLength, 0),
      mime: assets.map((asset) => asset.mime).join(','),
      providerMs: Math.round(performance.now() - providerStartedAt),
      totalMs,
      decision: harm.decision,
      earlyHarmBlock: true,
      harmFailure: harm.failureReason,
      solicitationFailure: 'cancelled_after_harm_block',
    })
    return harm
  }

  const [solicitation, qr] = await Promise.all([solicitationPromise, qrPromise])
  const providerMs = Math.round(performance.now() - providerStartedAt)
  const merged = mergeChatImageSafetyAssessments(harm, solicitation)
  const extracted = [merged.extractedText, ...qr.payloads].filter(Boolean).join(' ')
  const result = mergeExtractedTextPolicy(
    merged,
    assessMediaExtractedText(extracted, 'private_chat_media'),
  )
  console.log('[chat-attachment-finalize] image-assessment-timing', {
    assetCount: assets.length,
    byteSize: assets.reduce((total, asset) => total + asset.bytes.byteLength, 0),
    mime: assets.map((asset) => asset.mime).join(','),
    providerMs,
    totalMs: Math.round(performance.now() - startedAt),
    decision: result.decision,
    harmFailure: harm.failureReason,
    solicitationFailure: solicitation.failureReason,
  })
  return result
}

const assessChatImagesWithRetry = async (
  assets: Array<{ imageUrl: string; bytes: Uint8Array; mime: string }>,
) => runWithTransientContentSafetyRetry(
  () => assessChatImages(assets),
  {
    maxRetries: 1,
    minDelayMs: 250,
    maxDelayMs: 750,
    onRetry: ({ attempt, delayMs, failureReason }) => {
      console.warn('[chat-attachment-finalize] image-assessment-retry', {
        attempt,
        delayMs,
        failureReason,
        assetCount: assets.length,
      })
    },
  },
)

const assessChatImage = async (imageUrl: string, bytes: Uint8Array, mime: string) =>
  assessChatImagesWithRetry([{ imageUrl, bytes, mime }])

const consumeContentGuardRateLimit = async (service, userId: string, scope: string) => {
  const { data, error } = await service.rpc('rpc_service_consume_content_guard_rate_limit', {
    p_user_id: userId,
    p_scope: scope,
  })
  if (error || !data) return { available: false, allowed: false, retryAfterSeconds: 0 }
  return {
    available: true,
    allowed: data.allowed === true,
    retryAfterSeconds: Number(data.retry_after_seconds || 0),
  }
}

const resolveLimitedMediaPolicy = async (service, cache: Map<string, unknown>, kind: string) => {
  if (cache.has(kind)) return cache.get(kind)
  const { data, error } = await service.from('content_guard_media_policies')
    .select('attachment_type,enabled,enforcement_mode,inspection_strategy')
    .eq('attachment_type', kind).maybeSingle()
  if (error || !data) throw new Error('media_policy_unavailable')
  cache.set(kind, data)
  return data
}

const assessChatCaption = async (caption: string) => {
  const rules = assessPrivateMessageRules(caption)
  if (rules.decision === 'BLOCK') return rules
  const harm = await moderateWithOpenAI(caption)
  if (harm.failureReason) return harm
  const solicitation = shouldClassifyPrivateMessageSolicitation(caption)
    ? await classifyTextSolicitation(caption)
    : undefined
  return mergePrivateMessageSafetyAssessments(rules, harm, solicitation)
}

const enforceChatCaption = async ({ service, userId, receiverId, clientMessageId, caption }) => {
  const normalized = String(caption || '').trim()
  if (!normalized) return null
  const clientContentId = `${clientMessageId}:caption`
  const { data: prior } = await service.from('content_moderation_events')
    .select('status').eq('actor_user_id', userId).eq('content_type', 'chat_caption')
    .eq('client_content_id', clientContentId).maybeSingle()
  if (prior?.status === 'APPROVED') return null
  if (prior?.status === 'PENDING_REVIEW') return json(409, {
    error: 'caption_review_required', stage: 'caption_moderation', retryable: false,
  })
  if (prior?.status === 'REJECTED') return json(422, {
    error: 'caption_content_not_allowed', stage: 'caption_moderation', retryable: false,
  })
  const rateLimit = await consumeContentGuardRateLimit(service, userId, 'private_message')
  if (!rateLimit.available) return json(503, {
    error: 'caption_moderation_unavailable', stage: 'caption_moderation', retryable: true,
  })
  if (!rateLimit.allowed) return json(429, {
    error: 'caption_moderation_rate_limited', retry_after_seconds: rateLimit.retryAfterSeconds,
    stage: 'caption_moderation', retryable: true,
  })
  const assessment = await assessChatCaption(normalized)
  if (assessment.failureReason) {
    return json(503, {
      error: 'caption_moderation_unavailable', stage: 'caption_moderation', retryable: true,
    })
  }
  if (assessment.decision === 'REVIEW') {
    return json(422, {
      error: 'caption_rephrase_required', categories: assessment.categories,
      stage: 'caption_moderation', retryable: false,
    })
  }
  if (assessment.decision === 'BLOCK') {
    const { error } = await service.rpc('rpc_service_record_content_moderation_event', {
      p_actor_user_id: userId, p_target_user_id: receiverId,
      p_content_type: 'chat_caption', p_content_id: null,
      p_client_content_id: clientContentId, p_storage_bucket: null, p_storage_path: null,
      p_decision: assessment.decision, p_categories: assessment.categories,
      p_risk_score: assessment.riskScore, p_extracted_text: assessment.extractedText,
      p_evidence_snapshot: { text: normalized, receiver_user_id: receiverId },
      p_provider: assessment.provider, p_provider_model: assessment.model,
      p_provider_request_id: assessment.providerRequestId,
      p_failure_reason: assessment.failureReason,
    })
    if (error) return json(503, {
      error: 'content_moderation_record_failed', stage: 'caption_moderation', retryable: true,
    })
    return json(422, {
      error: 'caption_content_not_allowed', categories: assessment.categories,
      stage: 'caption_moderation', retryable: false,
    })
  }
  return null
}

const recordImageDecision = async ({ service, userId, receiverId, clientMessageId,
  attachmentId, bucket, path, caption, sha256, assessment }) => {
  const { error } = await service.rpc('rpc_service_record_content_moderation_event', {
    p_actor_user_id: userId,
    p_target_user_id: receiverId,
    p_content_type: 'chat_image',
    p_content_id: null,
    p_client_content_id: `${clientMessageId}:${attachmentId}`,
    p_storage_bucket: bucket,
    p_storage_path: path,
    p_decision: assessment.decision,
    p_categories: assessment.categories,
    p_risk_score: assessment.riskScore,
    p_extracted_text: assessment.extractedText,
    p_evidence_snapshot: {
      caption: String(caption || '').slice(0, 2000),
      sha256: sha256 || null,
      scores: assessment.scores,
    },
    p_provider: assessment.provider,
    p_provider_model: assessment.model,
    p_provider_request_id: assessment.providerRequestId,
    p_failure_reason: assessment.failureReason,
  })
  return error
}

const priorImageReview = async (service, userId: string, clientMessageId: string, attachmentId: string) => {
  const { data } = await service
    .from('content_moderation_events')
    .select('status,storage_bucket,storage_path')
    .eq('actor_user_id', userId)
    .eq('content_type', 'chat_image')
    .eq('client_content_id', `${clientMessageId}:${attachmentId}`)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return data
}

const readImageModerationReceipt = async ({ service, userId, clientMessageId,
  attachmentId, sha256, mime }) => {
  const { data, error } = await service
    .from('chat_image_moderation_receipts')
    .select('decision,categories,risk_score,provider,provider_model,expires_at')
    .eq('sender_user_id', userId)
    .eq('client_message_id', clientMessageId)
    .eq('attachment_id', attachmentId)
    .eq('sha256', sha256)
    .eq('mime_type', mime)
    .eq('policy_version', CHAT_IMAGE_POLICY_VERSION)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle()
  if (error || !data) return null
  return {
    decision: data.decision,
    categories: Array.isArray(data.categories) ? data.categories : [],
    riskScore: Number(data.risk_score || 0),
    provider: data.provider || 'receipt',
    model: data.provider_model || CHAT_IMAGE_POLICY_VERSION,
    providerRequestId: null,
    extractedText: null,
    scores: { receipt_reused: 1 },
    failureReason: null,
  }
}

const storeImageModerationReceipt = async ({ service, userId, clientMessageId,
  attachmentId, sha256, mime, assessment }) => {
  if (assessment?.failureReason || !['ALLOW', 'BLOCK', 'REVIEW'].includes(assessment?.decision)) {
    return false
  }
  const now = Date.now()
  const { error } = await service.from('chat_image_moderation_receipts').upsert({
    sender_user_id: userId,
    client_message_id: clientMessageId,
    attachment_id: attachmentId,
    sha256,
    mime_type: mime,
    policy_version: CHAT_IMAGE_POLICY_VERSION,
    decision: assessment.decision,
    categories: assessment.categories || [],
    risk_score: Number(assessment.riskScore || 0),
    provider: String(assessment.provider || 'unknown'),
    provider_model: String(assessment.model || 'unknown'),
    created_at: new Date(now).toISOString(),
    expires_at: new Date(now + 7 * 24 * 60 * 60 * 1000).toISOString(),
  }, {
    onConflict: 'sender_user_id,client_message_id,attachment_id,sha256,mime_type,policy_version',
  })
  if (error) {
    console.error('[chat-attachment-finalize] moderation-receipt-write-failed', {
      code: error.code || null,
    })
  }
  return !error
}

const readChatImageBytes = async ({ service, bucket, path }) => {
  const { data, error } = await service.storage.from(bucket).download(path)
  if (error || !data) throw new Error('image_hold_failed')
  const bytes = new Uint8Array(await data.arrayBuffer())
  if (bytes.byteLength === 0 || bytes.byteLength > LIMITS.image) throw new Error('image_hold_failed')
  return { bytes, sha256: await sha256Hex(bytes) }
}

const createChatImageHold = async ({ service, bytes, sha256, userId, clientMessageId,
  attachmentId, mime }) => {
  const extension = mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp'
    : mime === 'image/gif' ? 'gif' : 'jpg'
  const holdPath = `${userId}/${clientMessageId}/${attachmentId}.${extension}`
  const { error: uploadError } = await service.storage.from('moderation-quarantine')
    .upload(holdPath, bytes, { contentType: mime, upsert: true })
  if (uploadError) throw new Error('image_hold_failed')
  const { data: signed, error: signedError } = await service.storage
    .from('moderation-quarantine').createSignedUrl(holdPath, 180)
  if (signedError || !signed?.signedUrl) {
    await service.storage.from('moderation-quarantine').remove([holdPath])
    throw new Error('image_hold_failed')
  }
  return { bucket: 'moderation-quarantine', path: holdPath, signedUrl: signed.signedUrl,
    sha256, bytes }
}

const holdChatImage = async ({ service, bucket, path, userId, clientMessageId, attachmentId, mime }) => {
  const captured = await readChatImageBytes({ service, bucket, path })
  return createChatImageHold({
    service, ...captured, userId, clientMessageId, attachmentId, mime,
  })
}

const mapBounded = async <T, R>(items: T[], concurrency: number, worker: (item: T) => Promise<R>) => {
  const results = new Array<R>(items.length)
  let cursor = 0
  const run = async () => {
    while (cursor < items.length) {
      const index = cursor
      cursor += 1
      results[index] = await worker(items[index])
    }
  }
  await Promise.all(Array.from(
    { length: Math.min(Math.max(1, concurrency), items.length) },
    () => run(),
  ))
  return results
}

const CHAT_IMAGE_PREPARATION_CONCURRENCY = 4
// Each worker starts one harm and one solicitation request. Four workers cap
// the provider fan-out at eight requests while still processing large albums
// in a small number of waves.
const CHAT_IMAGE_PROVIDER_CONCURRENCY = 4

const completeChatImagePairModeration = async ({ service, userId, receiverId,
  clientMessageId, bucket, path, previewPath, assets, holds,
  missingIndexes, matchedIndex, assessment }) => {
  const cleanupHolds = () => Promise.all(holds.map((hold) =>
    service.storage.from(hold.bucket).remove([hold.path]).catch(() => undefined)))
  if (assessment.failureReason) {
    await cleanupHolds()
    return { code: 'image_moderation_unavailable', retryable: true, categories: [],
      stage: 'content_moderation' }
  }
  const receiptWrites = await Promise.all(missingIndexes.map((index) =>
    storeImageModerationReceipt({
      service, userId, clientMessageId, attachmentId: assets[index].attachmentId,
      sha256: holds[index].sha256, mime: assets[index].mime, assessment,
    })))
  const failedReceiptIndex = receiptWrites.findIndex((stored) => !stored)
  if (failedReceiptIndex >= 0) {
    await cleanupHolds()
    return { code: 'image_moderation_receipt_unavailable', retryable: true,
      categories: [], stage: assets[missingIndexes[failedReceiptIndex]].stage }
  }
  if (assessment.decision === 'ALLOW') {
    await cleanupHolds()
    return null
  }

  const evidenceIndex = matchedIndex >= 0 ? matchedIndex : (missingIndexes[0] ?? 0)
  const recordError = await recordImageDecision({
    service, userId, receiverId, clientMessageId,
    attachmentId: assets[evidenceIndex].attachmentId,
    bucket: holds[evidenceIndex].bucket, path: holds[evidenceIndex].path,
    caption: '', sha256: holds[evidenceIndex].sha256, assessment,
  })
  if (recordError) {
    await cleanupHolds()
    return { code: 'content_moderation_record_failed', retryable: true, categories: [],
      stage: assets[evidenceIndex].stage }
  }
  const removableHoldPaths = holds
    .filter((_, index) => index !== evidenceIndex ||
      (assessment.decision === 'BLOCK' && !requiresChildSafetyEvidenceHold(assessment)))
    .map((hold) => hold.path)
  if (removableHoldPaths.length > 0) {
    await service.storage.from('moderation-quarantine').remove(removableHoldPaths)
      .catch(() => undefined)
  }
  if (assessment.decision === 'BLOCK') {
    await service.storage.from(bucket).remove([path, previewPath]).catch(() => undefined)
  }
  return {
    code: assessment.decision === 'REVIEW' ? 'image_review_required' : 'image_content_not_allowed',
    retryable: false,
    categories: assessment.categories,
    stage: assets[evidenceIndex].stage,
  }
}

const preflightChatImageModeration = async ({ service, userId, receiverId,
  clientMessageId, attachmentId, bucket, path, mime, consumeRateLimit = true,
  rateLimitGate = null }) => {
  const priorReview = await priorImageReview(service, userId, clientMessageId, attachmentId)
  if (priorReview?.status === 'PENDING_REVIEW') {
    return { code: 'image_review_required', retryable: false, categories: [] }
  }
  if (priorReview?.status === 'REJECTED') {
    return { code: 'image_content_not_allowed', retryable: false, categories: [] }
  }
  if (priorReview?.status === 'APPROVED') return null

  let hold
  try {
    hold = await holdChatImage({
      service, bucket, path, userId, clientMessageId, attachmentId, mime,
    })
  } catch {
    return { code: 'image_moderation_unavailable', retryable: true, categories: [] }
  }
  const sample = hold.bytes.slice(0, 65536)
  if (
    !validateSignature('image', mime, sample, false) ||
    !signatureMatchesDeclaredMime('image', mime, sample, false)
  ) {
    await service.storage.from(hold.bucket).remove([hold.path]).catch(() => undefined)
    return { code: 'attachment_content_mismatch', retryable: false, categories: [] }
  }

  const cached = await readImageModerationReceipt({
    service, userId, clientMessageId, attachmentId, sha256: hold.sha256, mime,
  })
  if (cached?.decision === 'ALLOW') {
    await service.storage.from(hold.bucket).remove([hold.path]).catch(() => undefined)
    return null
  }
  if (cached && cached.decision !== 'ALLOW') {
    await service.storage.from(hold.bucket).remove([hold.path]).catch(() => undefined)
    return {
      code: cached.decision === 'REVIEW' ? 'image_review_required' : 'image_content_not_allowed',
      retryable: false,
      categories: cached.categories,
    }
  }

  if (consumeRateLimit) {
    const rateLimit = rateLimitGate
      ? await rateLimitGate()
      : await consumeContentGuardRateLimit(service, userId, 'chat_image')
    if (!rateLimit.available || !rateLimit.allowed) {
      await service.storage.from(hold.bucket).remove([hold.path]).catch(() => undefined)
      return {
        code: rateLimit.available ? 'image_moderation_rate_limited' : 'image_moderation_unavailable',
        retryable: true,
        retryAfterSeconds: rateLimit.retryAfterSeconds,
        categories: [],
      }
    }
  }
  const { data: hashMatch, error: hashError } = await service.rpc(
    'rpc_service_match_unsafe_media_hash', { p_sha256: hold.sha256 },
  )
  if (hashError || hashMatch?.authorized !== true) {
    await service.storage.from(hold.bucket).remove([hold.path]).catch(() => undefined)
    return { code: 'image_moderation_unavailable', retryable: true, categories: [] }
  }
  const assessment = hashMatch.matched === true
    ? { decision: 'BLOCK', categories: ['known_illegal_media'], riskScore: 1,
        provider: 'hash_blocklist', model: 'sha256-v1', providerRequestId: null,
        extractedText: null, scores: { known_illegal_media: 1 }, failureReason: null }
    : await assessChatImage(hold.signedUrl, hold.bytes, mime)
  if (assessment.failureReason) {
    await service.storage.from(hold.bucket).remove([hold.path]).catch(() => undefined)
    return { code: 'image_moderation_unavailable', retryable: true, categories: [] }
  }
  const receiptStored = await storeImageModerationReceipt({
    service, userId, clientMessageId, attachmentId,
    sha256: hold.sha256, mime, assessment,
  })
  if (!receiptStored) {
    await service.storage.from(hold.bucket).remove([hold.path]).catch(() => undefined)
    return {
      code: 'image_moderation_receipt_unavailable',
      retryable: true,
      categories: [],
    }
  }
  if (assessment.decision === 'ALLOW') {
    await service.storage.from(hold.bucket).remove([hold.path]).catch(() => undefined)
    return null
  }
  const recordError = await recordImageDecision({
    service, userId, receiverId, clientMessageId, attachmentId,
    bucket: hold.bucket, path: hold.path, caption: '', sha256: hold.sha256, assessment,
  })
  if (recordError) {
    await service.storage.from(hold.bucket).remove([hold.path]).catch(() => undefined)
    return { code: 'content_moderation_record_failed', retryable: true, categories: [] }
  }
  if (assessment.decision === 'BLOCK' && !requiresChildSafetyEvidenceHold(assessment)) {
    await service.storage.from(hold.bucket).remove([hold.path]).catch(() => undefined)
  }
  return {
    code: assessment.decision === 'REVIEW' ? 'image_review_required' : 'image_content_not_allowed',
    retryable: false,
    categories: assessment.categories,
  }
}

const preflightChatImagePairModeration = async ({ service, userId, receiverId,
  clientMessageId, attachmentId, bucket, path, mime, previewPath,
  rateLimitGate = null, deferFreshAssessment = false }) => {
  const previewAttachmentId = `${attachmentId}-preview`
  const assets = [
    { attachmentId, path, mime, stage: 'content_moderation' },
    { attachmentId: previewAttachmentId, path: previewPath, mime: 'image/jpeg',
      stage: 'preview_moderation' },
  ]
  const priorReviews = await Promise.all(assets.map((asset) => priorImageReview(
    service, userId, clientMessageId, asset.attachmentId,
  )))
  const priorFailureIndex = priorReviews.findIndex((review) =>
    review?.status === 'PENDING_REVIEW' || review?.status === 'REJECTED')
  if (priorFailureIndex >= 0) {
    const review = priorReviews[priorFailureIndex]
    return {
      code: review?.status === 'PENDING_REVIEW'
        ? 'image_review_required'
        : 'image_content_not_allowed',
      retryable: false,
      categories: [],
      stage: assets[priorFailureIndex].stage,
    }
  }
  if (priorReviews.every((review) => review?.status === 'APPROVED')) return null

  // Human-review state is intentionally handled by the established per-asset
  // path. Fresh uploads use the lower-latency paired provider assessment below.
  if (priorReviews.some((review) => review?.status === 'APPROVED')) {
    let rateLimitPending = true
    for (let index = 0; index < assets.length; index += 1) {
      const asset = assets[index]
      const result = await preflightChatImageModeration({
        service, userId, receiverId, clientMessageId,
        attachmentId: asset.attachmentId, bucket, path: asset.path, mime: asset.mime,
        consumeRateLimit: priorReviews[index]?.status === 'APPROVED'
          ? false
          : rateLimitPending,
        rateLimitGate,
      })
      if (priorReviews[index]?.status !== 'APPROVED') rateLimitPending = false
      if (result) return { ...result, stage: asset.stage }
    }
    return null
  }

  const holdResults = await Promise.allSettled(assets.map((asset) => holdChatImage({
        service, bucket, path: asset.path, userId, clientMessageId,
        attachmentId: asset.attachmentId, mime: asset.mime,
      })))
  const holds = holdResults
    .filter((result) => result.status === 'fulfilled')
    .map((result) => result.value)
  if (holdResults.some((result) => result.status === 'rejected')) {
    await Promise.all(holds.map((hold) => service.storage.from(hold.bucket)
      .remove([hold.path]).catch(() => undefined)))
    return { code: 'image_moderation_unavailable', retryable: true, categories: [],
      stage: 'content_moderation' }
  }
  const cleanupHolds = () => Promise.all(holds.map((hold) =>
    service.storage.from(hold.bucket).remove([hold.path]).catch(() => undefined)))

  for (let index = 0; index < assets.length; index += 1) {
    const sample = holds[index].bytes.slice(0, 65536)
    if (
      !validateSignature('image', assets[index].mime, sample, false) ||
      !signatureMatchesDeclaredMime('image', assets[index].mime, sample, false)
    ) {
      await cleanupHolds()
      return { code: 'attachment_content_mismatch', retryable: false, categories: [],
        stage: assets[index].stage }
    }
  }

  const receipts = await Promise.all(assets.map((asset, index) =>
    readImageModerationReceipt({
      service, userId, clientMessageId, attachmentId: asset.attachmentId,
      sha256: holds[index].sha256, mime: asset.mime,
    })))
  const cachedFailureIndex = receipts.findIndex((receipt) =>
    receipt && receipt.decision !== 'ALLOW')
  if (cachedFailureIndex >= 0) {
    await cleanupHolds()
    const receipt = receipts[cachedFailureIndex]
    return {
      code: receipt.decision === 'REVIEW' ? 'image_review_required' : 'image_content_not_allowed',
      retryable: false,
      categories: receipt.categories,
      stage: assets[cachedFailureIndex].stage,
    }
  }
  if (receipts.every((receipt) => receipt?.decision === 'ALLOW')) {
    await cleanupHolds()
    return null
  }

  const rateLimit = rateLimitGate
    ? await rateLimitGate()
    : await consumeContentGuardRateLimit(service, userId, 'chat_image')
  if (!rateLimit.available || !rateLimit.allowed) {
    await cleanupHolds()
    return {
      code: rateLimit.available ? 'image_moderation_rate_limited' : 'image_moderation_unavailable',
      retryable: true,
      retryAfterSeconds: rateLimit.retryAfterSeconds,
      categories: [],
      stage: 'content_moderation',
    }
  }

  const hashResults = await Promise.all(holds.map((hold) => service.rpc(
      'rpc_service_match_unsafe_media_hash', { p_sha256: hold.sha256 },
    )))
  const hashMatches = []
  for (const { data, error } of hashResults) {
    if (error || data?.authorized !== true) {
      await cleanupHolds()
      return { code: 'image_moderation_unavailable', retryable: true, categories: [],
        stage: 'content_moderation' }
    }
    hashMatches.push(data.matched === true)
  }
  const matchedIndex = hashMatches.findIndex(Boolean)
  const missingIndexes = receipts
    .map((receipt, index) => receipt ? -1 : index)
    .filter((index) => index >= 0)
  if (matchedIndex < 0 && deferFreshAssessment && missingIndexes.length === assets.length) {
    const assessmentAssets = missingIndexes.map((index) => ({
      imageUrl: holds[index].signedUrl,
      bytes: holds[index].bytes,
      mime: assets[index].mime,
    }))
    // Harm moderation only needs the original's immutable signed URL. Keep the
    // small preview bytes for QR decoding, then release the original before the
    // album starts its one-wave provider fan-out.
    holds[missingIndexes[0]].bytes = new Uint8Array()
    assessmentAssets[0].bytes = new Uint8Array()
    return { deferredAssessment: {
      service, userId, receiverId, clientMessageId, bucket, path, previewPath,
      assets, holds, missingIndexes, matchedIndex, assessmentAssets,
    } }
  }
  const assessment = matchedIndex >= 0
    ? { decision: 'BLOCK', categories: ['known_illegal_media'], riskScore: 1,
        provider: 'hash_blocklist', model: 'sha256-v1', providerRequestId: null,
        extractedText: null, scores: { known_illegal_media: 1 }, failureReason: null }
    : await assessChatImagesWithRetry(missingIndexes.map((index) => ({
        imageUrl: holds[index].signedUrl,
        bytes: holds[index].bytes,
        mime: assets[index].mime,
      })))
  return completeChatImagePairModeration({
    service, userId, receiverId, clientMessageId, bucket, path, previewPath,
    assets, holds, missingIndexes, matchedIndex, assessment,
  })
}

const completeDeferredChatImagePairModeration = async (prepared) => {
  const assessment = await assessChatImagesWithRetry(prepared.assessmentAssets)
  return completeChatImagePairModeration({ ...prepared, assessment })
}

const restoreApprovedChatImage = async ({ service, review, bucket, path, mime }) => {
  if (review?.storage_bucket !== 'moderation-quarantine' || !review?.storage_path) {
    throw new Error('approved_image_evidence_missing')
  }
  const { data, error } = await service.storage.from('moderation-quarantine')
    .download(review.storage_path)
  if (error || !data) throw new Error('approved_image_evidence_missing')
  const bytes = new Uint8Array(await data.arrayBuffer())
  return { sha256: await sha256Hex(bytes), byteSize: bytes.byteLength, bytes }
}

const readReceiptBackedApprovedImage = async ({ service, userId, receiverId, clientMessageId,
  attachmentId, bucket, path, mime }) => {
  const review = await priorImageReview(service, userId, clientMessageId, attachmentId)
  if (review?.status === 'PENDING_REVIEW') {
    return { ok: false, status: 409, code: 'image_review_required', retryable: false, categories: [] }
  }
  if (review?.status === 'REJECTED') {
    return { ok: false, status: 422, code: 'image_content_not_allowed', retryable: false, categories: [] }
  }
  if (review?.status === 'APPROVED') {
    try {
      const restored = await restoreApprovedChatImage({ service, review, bucket, path, mime })
      return {
        ok: true,
        bytes: restored.bytes,
        sha256: restored.sha256,
        assessment: { decision: 'ALLOW', categories: ['human_approved'], riskScore: 0,
          provider: 'human_review', model: 'admin', providerRequestId: null,
          extractedText: null, scores: {}, failureReason: null },
      }
    } catch {
      return { ok: false, status: 503, code: 'approved_image_evidence_missing', retryable: true,
        categories: [] }
    }
  }

  let captured
  try {
    captured = await readChatImageBytes({ service, bucket, path })
  } catch {
    return { ok: false, status: 503, code: 'image_moderation_unavailable', retryable: true,
      categories: [] }
  }
  const { data: hashMatch, error: hashError } = await service.rpc(
    'rpc_service_match_unsafe_media_hash', { p_sha256: captured.sha256 },
  )
  if (hashError || hashMatch?.authorized !== true) {
    return { ok: false, status: 503, code: 'image_moderation_unavailable', retryable: true,
      categories: [] }
  }
  if (hashMatch.matched === true) {
    const assessment = {
      decision: 'BLOCK', categories: ['known_illegal_media'], riskScore: 1,
      provider: 'hash_blocklist', model: 'sha256-v1', providerRequestId: null,
      extractedText: null, scores: { known_illegal_media: 1 }, failureReason: null,
    }
    let hold
    try {
      hold = await createChatImageHold({
        service, ...captured, userId, clientMessageId, attachmentId, mime,
      })
    } catch {
      return { ok: false, status: 503, code: 'image_moderation_unavailable', retryable: true,
        categories: [] }
    }
    const receiptStored = await storeImageModerationReceipt({
      service, userId, clientMessageId, attachmentId,
      sha256: captured.sha256, mime, assessment,
    })
    if (!receiptStored) {
      await service.storage.from(hold.bucket).remove([hold.path]).catch(() => undefined)
      return { ok: false, status: 503, code: 'image_moderation_receipt_unavailable',
        retryable: true, categories: [] }
    }
    const recordError = await recordImageDecision({
      service, userId, receiverId, clientMessageId, attachmentId,
      bucket: hold.bucket, path: hold.path, caption: '', sha256: captured.sha256, assessment,
    })
    if (recordError) {
      await service.storage.from(hold.bucket).remove([hold.path]).catch(() => undefined)
      return { ok: false, status: 503, code: 'content_moderation_record_failed',
        retryable: true, categories: [] }
    }
    await service.storage.from(bucket).remove([path]).catch(() => undefined)
    if (!requiresChildSafetyEvidenceHold(assessment)) {
      await service.storage.from(hold.bucket).remove([hold.path]).catch(() => undefined)
    }
    return { ok: false, status: 422, code: 'image_content_not_allowed', retryable: false,
      categories: ['known_illegal_media'] }
  }
  const assessment = await readImageModerationReceipt({
    service, userId, clientMessageId, attachmentId,
    sha256: captured.sha256, mime,
  })
  if (!assessment) {
    return { ok: false, status: 503, code: 'image_moderation_receipt_required', retryable: true,
      categories: [] }
  }
  if (assessment.decision !== 'ALLOW') {
    return {
      ok: false,
      status: assessment.decision === 'REVIEW' ? 409 : 422,
      code: assessment.decision === 'REVIEW'
        ? 'image_review_required'
        : 'image_content_not_allowed',
      retryable: false,
      categories: assessment.categories,
    }
  }
  return { ok: true, bytes: captured.bytes, sha256: captured.sha256, assessment }
}

const storageAdapter = (service) => ({
  async read(bucket: string, path: string) {
    const { data, error } = await service.storage.from(bucket).download(path)
    if (error || !data) throw new Error('immutable_publication_read_failed')
    return new Uint8Array(await data.arrayBuffer())
  },
  async write(bucket: string, path: string, bytes: Uint8Array, mime: string) {
    const { error } = await service.storage.from(bucket)
      .upload(path, bytes, { contentType: mime, upsert: false })
    if (error) throw new Error('immutable_publication_write_failed')
  },
  async remove(bucket: string, paths: string[]) {
    const { error } = await service.storage.from(bucket).remove(paths)
    if (error) throw new Error('immutable_publication_remove_failed')
  },
})

const approvedChatImagePath = ({ userId, receiverId, clientMessageId, attachmentId,
  sha256, mime, preview = false }) => {
  const extension = mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp'
    : mime === 'image/gif' ? 'gif' : 'jpg'
  return `${userId}/${receiverId}/${clientMessageId}/${attachmentId}-${preview ? 'preview-' : ''}${sha256}.${extension}`
}

const publishApprovedChatImage = async ({ service, bytes, userId, receiverId,
  clientMessageId, attachmentId, sha256, mime, preview = false }) => {
  const startedAt = performance.now()
  const finalPath = approvedChatImagePath({ userId, receiverId, clientMessageId,
    attachmentId, sha256, mime, preview })
  await publishCapturedBytes({
    store: storageAdapter(service), capturedBytes: bytes,
    finalBucket: 'chat-media', finalPath, mime, allowExistingExact: true,
  })
  const { data: registered, error: registrationError } = await service.rpc(
    'rpc_service_register_approved_chat_media', {
      p_sender_id: userId,
      p_receiver_id: receiverId,
      p_client_message_id: clientMessageId,
      p_attachment_id: attachmentId,
      p_variant: preview ? 'preview' : 'original',
      p_object_path: finalPath,
      p_sha256: sha256,
      p_byte_size: bytes.byteLength,
      p_mime_type: mime,
    },
  )
  if (registrationError || registered !== true) {
    await service.storage.from('chat-media').remove([finalPath]).catch(() => undefined)
    throw new Error('approved_chat_media_provenance_registration_failed')
  }
  console.log('[chat-attachment-finalize] approved-publication-timing', {
    variant: preview ? 'preview' : 'original',
    byteSize: bytes.byteLength,
    durationMs: Math.round(performance.now() - startedAt),
  })
  return finalPath
}

const removeApprovedChatImages = async (service, paths: string[]) => {
  const uniquePaths = [...new Set(paths.filter(Boolean))]
  if (!uniquePaths.length) return
  try {
    await service.from('approved_chat_media_objects')
      .delete()
      .in('object_path', uniquePaths)
  } catch {
    // Best-effort rollback. An orphaned private provenance row does not make a
    // missing object publishable, and a later identical retry can reuse it.
  }
  await service.storage.from('chat-media').remove(uniquePaths).catch(() => undefined)
}

const startsWith = (bytes: Uint8Array, signature: number[]) =>
  signature.every((value, index) => bytes[index] === value)

const hasAscii = (bytes: Uint8Array, value: string, offset = 0) =>
  value.split('').every((character, index) => bytes[offset + index] === character.charCodeAt(0))

const positiveIntegerOrNull = (value: unknown) => {
  const numeric = Number(value)
  if (!Number.isFinite(numeric) || numeric <= 0) return null
  return Math.round(numeric)
}

const authoritativeResponseSize = (response: Response) => {
  const rangeTotal = (response.headers.get('content-range') || '').split('/').pop() || ''
  if (/^[0-9]+$/.test(rangeTotal)) return Number(rangeTotal)
  const contentLength = response.headers.get('content-length') || ''
  if (response.status === 200 && /^[0-9]+$/.test(contentLength)) return Number(contentLength)
  return null
}

type RpcError = {
  code?: string | null
  message?: string | null
  details?: string | null
  hint?: string | null
}

const normalizePreviewDimensions = (width: unknown, height: unknown, maxEdge = 640) => {
  const numericWidth = Number(width)
  const numericHeight = Number(height)
  if (!Number.isFinite(numericWidth) || numericWidth <= 0 ||
      !Number.isFinite(numericHeight) || numericHeight <= 0) {
    return { width: maxEdge, height: maxEdge }
  }
  const scale = Math.min(1, maxEdge / Math.max(numericWidth, numericHeight))
  return {
    width: Math.max(1, Math.round(numericWidth * scale)),
    height: Math.max(1, Math.round(numericHeight * scale)),
  }
}

const classifyAttachmentConstraintError = (error: RpcError) => {
  const diagnostic = `${error.message || ''} ${error.details || ''} ${error.hint || ''}`
  const knownConstraints: Array<[string, string]> = [
    ['chat_attachment_event_type_valid', 'attachment_lifecycle_event_invalid'],
    ['message_attachments_preview_valid', 'attachment_preview_metadata_invalid'],
    ['message_attachments_validation_evidence_v3_valid', 'attachment_validation_evidence_invalid'],
    ['message_attachments_dimensions_valid', 'attachment_dimensions_invalid'],
    ['message_attachments_duration_valid', 'attachment_duration_invalid'],
    ['message_attachments_byte_size_valid', 'attachment_byte_size_invalid'],
    ['message_attachments_mime_length', 'attachment_mime_invalid'],
  ]
  return knownConstraints.find(([constraint]) => diagnostic.includes(constraint))?.[1] ?? null
}

const isMissingAtomicFinalizationRpc = (error: RpcError | null) =>
  Boolean(
    error && (
      error.code === 'PGRST202' ||
      error.code === '42883' ||
      String(error.message || '').includes('rpc_finalize_chat_attachment_batch_v3') ||
      String(error.message || '').includes('rpc_finalize_chat_attachment_batch_v4') ||
      String(error.message || '').includes('rpc_finalize_chat_attachment_v3')
    )
  )

const buildValidationDetails = (args: {
  sampleBytes: number
  encrypted?: boolean
  hasDimensions?: boolean
  hasDuration?: boolean
  previewVerified?: boolean
}) => ({
  validator: 'signature-v3',
  sampled_bytes: args.sampleBytes,
  byte_size_verified: true,
  signature_verified: args.encrypted !== true,
  ciphertext_verified: args.encrypted === true,
  mime_signature_verified: args.encrypted !== true,
  dimensions_source: args.hasDimensions ? 'client_provisional' : 'absent',
  duration_source: args.hasDuration ? 'client_provisional' : 'absent',
  preview_verified: args.previewVerified === true,
})

const validateSignature = (kind: string, mime: string, bytes: Uint8Array, encrypted: boolean, fileName = '') => {
  if (encrypted) return true
  if (kind === 'image') {
    return startsWith(bytes, [0xff, 0xd8, 0xff]) ||
      startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) ||
      hasAscii(bytes, 'GIF8') ||
      (hasAscii(bytes, 'RIFF') && hasAscii(bytes, 'WEBP', 8)) ||
      (hasAscii(bytes, 'ftyp', 4) && ['heic', 'heix', 'mif1', 'avif'].some((brand) => hasAscii(bytes, brand, 8)))
  }
  if (kind === 'video') {
    return hasAscii(bytes, 'ftyp', 4) || startsWith(bytes, [0x1a, 0x45, 0xdf, 0xa3])
  }
  if (kind === 'audio') {
    return hasAscii(bytes, 'ID3') || hasAscii(bytes, 'RIFF') || hasAscii(bytes, 'OggS') ||
      hasAscii(bytes, 'fLaC') || hasAscii(bytes, 'caff') || hasAscii(bytes, '#!AMR') ||
      hasAscii(bytes, 'ftyp', 4) || startsWith(bytes, [0x1a, 0x45, 0xdf, 0xa3]) ||
      startsWith(bytes, [0xff, 0xf1]) || startsWith(bytes, [0xff, 0xf9])
  }
  if (kind === 'document') {
    if (!DOCUMENT_MIMES.has(mime)) return false
    const extension = fileName.split('.').pop()?.trim().toLowerCase() || ''
    if (!SAFE_DOCUMENT_EXTENSIONS.has(extension)) return false
    if (mime === 'application/pdf') return hasAscii(bytes, '%PDF-')
    if (mime.includes('openxmlformats') || mime.includes('vnd.apple') || mime === 'application/x-unknown' || mime === 'application/octet-stream') {
      return startsWith(bytes, [0x50, 0x4b, 0x03, 0x04])
    }
    if (mime === 'application/msword' || mime === 'application/vnd.ms-excel' || mime === 'application/vnd.ms-powerpoint') {
      return startsWith(bytes, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])
    }
    if (mime.includes('rtf')) return hasAscii(bytes, '{\\rtf')
    return mime.startsWith('text/') && !bytes.slice(0, 4096).some((value) => value === 0)
  }
  return false
}

const signatureMatchesDeclaredMime = (
  kind: string,
  mime: string,
  bytes: Uint8Array,
  encrypted: boolean,
) => {
  if (encrypted) return true
  if (kind === 'image') {
    if (startsWith(bytes, [0xff, 0xd8, 0xff])) return ['image/jpeg', 'image/jpg'].includes(mime)
    if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47])) return mime === 'image/png'
    if (hasAscii(bytes, 'GIF8')) return mime === 'image/gif'
    if (hasAscii(bytes, 'RIFF') && hasAscii(bytes, 'WEBP', 8)) return mime === 'image/webp'
    if (hasAscii(bytes, 'ftyp', 4)) {
      if (hasAscii(bytes, 'avif', 8)) return mime === 'image/avif'
      return ['image/heic', 'image/heif'].includes(mime)
    }
  }
  if (kind === 'video') {
    if (startsWith(bytes, [0x1a, 0x45, 0xdf, 0xa3])) {
      return ['video/webm', 'video/x-matroska'].includes(mime)
    }
    if (hasAscii(bytes, 'ftyp', 4)) {
      return ['video/mp4', 'video/quicktime', 'video/x-m4v', 'video/3gpp'].includes(mime)
    }
  }
  if (kind === 'audio') {
    if (hasAscii(bytes, 'ID3') || startsWith(bytes, [0xff, 0xf1]) || startsWith(bytes, [0xff, 0xf9])) {
      return ['audio/mpeg', 'audio/mp3', 'audio/aac'].includes(mime)
    }
    if (hasAscii(bytes, 'RIFF')) return ['audio/wav', 'audio/x-wav', 'audio/wave'].includes(mime)
    if (hasAscii(bytes, 'OggS')) return ['audio/ogg', 'audio/opus'].includes(mime)
    if (hasAscii(bytes, 'fLaC')) return ['audio/flac', 'audio/x-flac'].includes(mime)
    if (hasAscii(bytes, 'caff')) return ['audio/x-caf', 'audio/caf'].includes(mime)
    if (hasAscii(bytes, '#!AMR')) return ['audio/amr', 'audio/amr-wb'].includes(mime)
    if (hasAscii(bytes, 'ftyp', 4)) return ['audio/mp4', 'audio/m4a', 'audio/x-m4a'].includes(mime)
    if (startsWith(bytes, [0x1a, 0x45, 0xdf, 0xa3])) return ['audio/webm', 'audio/x-matroska'].includes(mime)
  }
  if (kind === 'document') return true
  return false
}

serve(async (req) => {
  const requestStartedAt = performance.now()
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' })

  try {
    const url = Deno.env.get('SUPABASE_URL') || ''
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || ''
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    const authHeader = req.headers.get('Authorization') || ''
    if (!url || !anonKey || !serviceKey) return json(500, { error: 'server_configuration_incomplete' })

    const authClient = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } })
    const { data: { user }, error: authError } = await authClient.auth.getUser()
    if (authError || !user) return json(401, { error: 'unauthorized' })

    let input = await req.json()
    const service = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
    const mediaPolicyCache = new Map<string, unknown>()
    const mode = String(input.mode || 'finalize_single')
    const hardenedContract = String(input.contractVersion || '') === CHAT_ATTACHMENT_GUARD_CONTRACT_V1_2
    let preModeratedImageSafety = null
    let preModerationReceiptId: string | null = null
    const atomicFinalizationEnabled =
      String(Deno.env.get('CHAT_ATTACHMENT_ATOMIC_FINALIZATION_ENABLED') || 'true').toLowerCase() !== 'false'

    if (hardenedContract && String(input.caption || '').trim().length > 2000) {
      return json(422, {
        error: 'caption_too_long',
        stage: 'caption_validation',
        retryable: false,
      })
    }

    if (['finalize_single', 'finalize_batch'].includes(mode)) {
      const captionStartedAt = performance.now()
      const captionResponse = await enforceChatCaption({
        service,
        userId: user.id,
        receiverId: String(input.receiverId || ''),
        clientMessageId: String(input.clientMessageId || ''),
        caption: input.caption,
      })
      console.log('[chat-attachment-finalize] caption-timing', {
        mode,
        durationMs: Math.round(performance.now() - captionStartedAt),
        hasCaption: Boolean(String(input.caption || '').trim()),
      })
      if (captionResponse) return captionResponse
    }

    if (mode === 'finalize_view_once_plaintext') {
      const receiverId = String(input.receiverId || '')
      const clientMessageId = String(input.clientMessageId || '')
      const attachmentId = String(input.attachmentId || '')
      const declaredMime = String(input.mimeType || '').split(';')[0].trim().toLowerCase()
      const mime = declaredMime === 'image/jpg' ? 'image/jpeg' : declaredMime
      const originalName = String(input.originalName || '').slice(0, 255)
      const stagingBucket = String(input.stagingBucket || '')
      const stagingPath = String(input.stagingPath || '')
      const expectedStagingPrefix = `${user.id}/${receiverId}/${clientMessageId}/${attachmentId}-`
      if (
        !UUID_PATTERN.test(receiverId) || !UUID_PATTERN.test(attachmentId) ||
        !CLIENT_CONTENT_ID_PATTERN.test(clientMessageId) || receiverId === user.id ||
        stagingBucket !== 'view-once-moderation' ||
        !stagingPath.startsWith(expectedStagingPrefix) ||
        stagingPath.slice(expectedStagingPrefix.length).includes('/') ||
        !SAFE_VIEW_ONCE_IMAGE_MIMES.has(mime)
      ) {
        return json(400, { error: 'invalid_view_once_moderation_request' })
      }

      const { data: existingMessage } = await service
        .from('messages')
        .select('*')
        .eq('sender_id', user.id)
        .eq('client_message_id', clientMessageId)
        .maybeSingle()
      if (existingMessage) {
        await service.storage.from(stagingBucket).remove([stagingPath]).catch(() => undefined)
        return json(200, { message: existingMessage, idempotent: true })
      }

      const { data: existingReceipt, error: receiptReadError } = await service
        .from('view_once_moderation_receipts')
        .select('*')
        .eq('sender_user_id', user.id)
        .eq('client_message_id', clientMessageId)
        .eq('attachment_id', attachmentId)
        .maybeSingle()
      if (receiptReadError) return json(503, { error: 'view_once_receipt_unavailable' })

      let receipt = existingReceipt
      if (receipt) {
        if (
          receipt.receiver_user_id !== receiverId || receipt.mime_type !== mime ||
          new Date(receipt.expires_at).getTime() <= Date.now()
        ) {
          return json(409, { error: 'view_once_moderation_receipt_invalid' })
        }
        await service.storage.from(stagingBucket).remove([stagingPath]).catch(() => undefined)
      } else {
        let plainBytes: Uint8Array | null = null
        try {
          const { data: plainBlob, error: downloadError } = await service.storage
            .from(stagingBucket)
            .download(stagingPath)
          if (downloadError || !plainBlob) return json(404, { error: 'view_once_plaintext_not_found' })
          if (plainBlob.size <= 0 || plainBlob.size > VIEW_ONCE_PLAINTEXT_LIMIT) {
            return json(413, { error: 'attachment_size_invalid' })
          }
          plainBytes = new Uint8Array(await plainBlob.arrayBuffer())
          const sample = plainBytes.slice(0, 65536)
          if (
            !validateSignature('image', mime, sample, false, originalName) ||
            !signatureMatchesDeclaredMime('image', mime, sample, false)
          ) {
            return json(415, { error: 'attachment_content_mismatch' })
          }
          const plaintextSha256 = await sha256Hex(plainBytes)
          let exactHashBlocked = false
          try {
            await requireSafeViewOncePlaintextHash({
              sha256: plaintextSha256,
              match: async (sha256) => {
                const { data, error } = await service.rpc(
                  'rpc_service_match_unsafe_media_hash', { p_sha256: sha256 },
                )
                if (error || data?.authorized !== true) {
                  return { authorized: false, matched: false }
                }
                return { authorized: true, matched: data.matched === true }
              },
            })
          } catch (error) {
            if (String(error?.message || error) !== 'unsafe_hash_matched') {
              return json(503, { error: 'image_moderation_unavailable' })
            }
            exactHashBlocked = true
          }
          if (exactHashBlocked) {
            const evidencePath = `child-safety-hold/${user.id}/${clientMessageId}/${attachmentId}-${crypto.randomUUID()}.${mime.split('/')[1] || 'bin'}`
            const { error: evidenceError } = await service.storage.from('moderation-quarantine')
              .upload(evidencePath, plainBytes, { contentType: mime, upsert: false })
            if (evidenceError) return json(503, { error: 'content_moderation_evidence_failed' })
            const assessment = {
              decision: 'BLOCK', categories: ['known_illegal_media'], riskScore: 1,
              provider: 'hash_blocklist', model: 'sha256-v1', providerRequestId: null,
              extractedText: null, scores: { known_illegal_media: 1 }, failureReason: null,
            }
            const recordError = await recordImageDecision({
              service, userId: user.id, receiverId, clientMessageId, attachmentId,
              bucket: 'moderation-quarantine', path: evidencePath, caption: '',
              sha256: plaintextSha256, assessment,
            })
            if (recordError) {
              await service.storage.from('moderation-quarantine').remove([evidencePath])
              return json(503, { error: 'content_moderation_record_failed' })
            }
            return json(422, { error: 'image_content_not_allowed', categories: assessment.categories })
          }

          // Copy the exact downloaded bytes into a service-only, immutable object.
          // This avoids both base64 request inflation and a client replace-between-read-and-scan race.
          const inspectionBucket = 'moderation-quarantine'
          const inspectionPath = `chat-image-pending/${user.id}/${clientMessageId}/${attachmentId}-${crypto.randomUUID()}.${mime.split('/')[1] || 'bin'}`
          const { error: inspectionUploadError } = await service.storage
            .from(inspectionBucket)
            .upload(inspectionPath, plainBytes, { contentType: mime, upsert: false })
          if (inspectionUploadError) return json(503, { error: 'content_moderation_evidence_failed' })
          const { data: inspectionUrl, error: inspectionUrlError } = await service.storage
            .from(inspectionBucket)
            .createSignedUrl(inspectionPath, 120)
          if (inspectionUrlError || !inspectionUrl?.signedUrl) {
            await service.storage.from(inspectionBucket).remove([inspectionPath])
            return json(503, { error: 'image_moderation_unavailable' })
          }
          const rateLimit = await consumeContentGuardRateLimit(service, user.id, 'chat_image')
          if (!rateLimit.available || !rateLimit.allowed) {
            await service.storage.from(inspectionBucket).remove([inspectionPath])
            return !rateLimit.available
              ? json(503, { error: 'image_moderation_unavailable' })
              : json(429, { error: 'image_moderation_rate_limited',
                  retry_after_seconds: rateLimit.retryAfterSeconds })
          }
          const assessment = await assessChatImage(inspectionUrl.signedUrl, plainBytes, mime)
          if (assessment.decision !== 'ALLOW') {
            let evidenceBucket = stagingBucket
            let evidencePath = stagingPath
            if (assessment.decision === 'REVIEW') {
              evidenceBucket = inspectionBucket
              evidencePath = inspectionPath
            } else {
              await service.storage.from(inspectionBucket).remove([inspectionPath])
            }
            const recordError = await recordImageDecision({
              service, userId: user.id, receiverId, clientMessageId, attachmentId,
              bucket: evidenceBucket, path: evidencePath, caption: '',
              sha256: plaintextSha256, assessment,
            })
            if (recordError) return json(503, { error: 'content_moderation_record_failed' })
            return json(assessment.failureReason ? 503 : 422, {
              error: assessment.failureReason
                ? 'image_moderation_unavailable'
                : assessment.decision === 'REVIEW'
                  ? 'image_review_required'
                  : 'image_content_not_allowed',
              categories: assessment.categories,
            })
          }
          await service.storage.from(inspectionBucket).remove([inspectionPath])

          const { data: keyRows, error: keyError } = await service
            .from('profiles')
            .select('user_id,public_key')
            .in('user_id', [user.id, receiverId])
          if (keyError) return json(503, { error: 'view_once_keys_unavailable' })
          const senderPublicKey = keyRows?.find((row) => row.user_id === user.id)?.public_key
          const receiverPublicKey = keyRows?.find((row) => row.user_id === receiverId)?.public_key
          if (!senderPublicKey || !receiverPublicKey) {
            return json(422, { error: 'view_once_keys_unavailable' })
          }

          const encrypted = encryptApprovedViewOnceImage(
            plainBytes, String(senderPublicKey), String(receiverPublicKey),
          )
          const receiptId = crypto.randomUUID()
          const encryptedSha256 = await sha256Hex(encrypted.cipherBytes)
          const encryptedPath = approvedChatImagePath({
            userId: user.id,
            receiverId,
            clientMessageId,
            attachmentId,
            sha256: encryptedSha256,
            mime,
          })
          try {
            const { error: uploadError } = await service.storage.from('chat-media').upload(
              encryptedPath,
              encrypted.cipherBytes,
              { contentType: mime, upsert: false },
            )
            if (uploadError) return json(503, { error: 'view_once_encrypted_upload_failed' })
            const { data: registered, error: registrationError } = await service.rpc(
              'rpc_service_register_approved_chat_media', {
                p_sender_id: user.id,
                p_receiver_id: receiverId,
                p_client_message_id: clientMessageId,
                p_attachment_id: attachmentId,
                p_variant: 'original',
                p_object_path: encryptedPath,
                p_sha256: encryptedSha256,
                p_byte_size: encrypted.cipherBytes.length,
                p_mime_type: mime,
              },
            )
            if (registrationError || registered !== true) {
              await removeApprovedChatImages(service, [encryptedPath])
              return json(503, { error: 'approved_chat_media_provenance_registration_failed' })
            }
            const candidateReceipt = {
              id: receiptId,
              sender_user_id: user.id,
              receiver_user_id: receiverId,
              client_message_id: clientMessageId,
              attachment_id: attachmentId,
              original_name: originalName || null,
              mime_type: mime,
              plaintext_sha256: plaintextSha256,
              encrypted_storage_path: encryptedPath,
              encrypted_byte_size: encrypted.cipherBytes.length,
              encrypted_key_sender: encrypted.encryptedKeySender,
              encrypted_key_receiver: encrypted.encryptedKeyReceiver,
              encrypted_key_nonce: encrypted.encryptedKeyNonce,
              encrypted_media_nonce: encrypted.encryptedMediaNonce,
              encryption_public_key: encrypted.encryptionPublicKey,
              moderation_provider: assessment.provider,
              moderation_model: assessment.model,
              moderation_categories: assessment.categories,
              moderation_risk_score: assessment.riskScore,
            }
            const { data: insertedReceipt, error: insertError } = await service
              .from('view_once_moderation_receipts')
              .insert(candidateReceipt)
              .select('*')
              .single()
            if (insertError) {
              await removeApprovedChatImages(service, [encryptedPath])
              if (insertError.code !== '23505') {
                return json(503, { error: 'view_once_receipt_create_failed' })
              }
              const { data: concurrentReceipt, error: concurrentError } = await service
                .from('view_once_moderation_receipts')
                .select('*')
                .eq('sender_user_id', user.id)
                .eq('client_message_id', clientMessageId)
                .eq('attachment_id', attachmentId)
                .single()
              if (concurrentError || !concurrentReceipt) {
                return json(503, { error: 'view_once_receipt_unavailable' })
              }
              receipt = concurrentReceipt
            } else {
              receipt = insertedReceipt
            }
          } finally {
            encrypted.cipherBytes.fill(0)
          }
        } finally {
          plainBytes?.fill(0)
          await service.storage.from(stagingBucket).remove([stagingPath]).catch(() => undefined)
        }
      }

      if (!receipt) return json(503, { error: 'view_once_receipt_unavailable' })
      preModerationReceiptId = String(receipt.id)
      preModeratedImageSafety = {
        decision: 'ALLOW',
        categories: receipt.moderation_categories || [],
        riskScore: Number(receipt.moderation_risk_score || 0),
        provider: String(receipt.moderation_provider || 'unknown'),
        model: String(receipt.moderation_model || 'unknown'),
        providerRequestId: null,
        extractedText: null,
        scores: {},
        failureReason: null,
      }
      input = receiptToFinalizeInput(receipt, input.replyToMessageId)
    }

    if (mode === 'moderate_image_batch') {
      const receiverId = String(input.receiverId || '')
      const clientMessageId = String(input.clientMessageId || '')
      const rawAttachments = Array.isArray(input.attachments) ? input.attachments : []
      if (
        !hardenedContract || !UUID_PATTERN.test(receiverId) || receiverId === user.id ||
        !CLIENT_CONTENT_ID_PATTERN.test(clientMessageId) ||
        rawAttachments.length < 1 || rawAttachments.length > 10
      ) {
        return json(400, {
          error: 'invalid_image_moderation_batch',
          stage: 'request_validation',
          retryable: false,
        })
      }

      const attachments = rawAttachments.map((raw, attachmentIndex) => {
        const attachmentId = String(raw?.attachmentId || '')
        const bucket = String(raw?.bucketId || '')
        const path = String(raw?.storagePath || '')
        const mime = String(raw?.mimeType || '').split(';')[0].trim().toLowerCase()
        const previewPath = String(raw?.previewStoragePath || '')
        const previewMime = String(raw?.previewMimeType || '').split(';')[0].trim().toLowerCase()
        const expectedPrefix = `${user.id}/${receiverId}/${clientMessageId}/${attachmentId}-`
        const valid =
          (!raw?.receiverId || String(raw.receiverId) === receiverId) &&
          (!raw?.clientMessageId || String(raw.clientMessageId) === clientMessageId) &&
          UUID_PATTERN.test(attachmentId) &&
          [CHAT_ATTACHMENT_STAGING_BUCKET, 'chat-media'].includes(bucket) &&
          SAFE_VIEW_ONCE_IMAGE_MIMES.has(mime) && previewMime === 'image/jpeg' &&
          path.startsWith(expectedPrefix) && !path.slice(expectedPrefix.length).includes('/') &&
          previewPath.startsWith(expectedPrefix) &&
          !previewPath.slice(expectedPrefix.length).includes('/') && path !== previewPath
        return {
          valid, attachmentIndex, attachmentId, bucket, path, mime, previewPath,
        }
      })
      const invalid = attachments.find((attachment) => !attachment.valid)
      if (invalid) {
        return json(400, {
          error: 'invalid_image_moderation_preflight',
          attachmentId: invalid.attachmentId || null,
          attachmentIndex: invalid.attachmentIndex,
          stage: 'request_validation',
          retryable: false,
        })
      }
      const attachmentIds = new Set<string>()
      const storagePaths = new Set<string>()
      const duplicate = attachments.find((attachment) => {
        const repeated = attachmentIds.has(attachment.attachmentId) ||
          storagePaths.has(attachment.path) || storagePaths.has(attachment.previewPath)
        attachmentIds.add(attachment.attachmentId)
        storagePaths.add(attachment.path)
        storagePaths.add(attachment.previewPath)
        return repeated
      })
      if (duplicate) {
        return json(400, {
          error: 'duplicate_image_moderation_attachment',
          attachmentId: duplicate.attachmentId,
          attachmentIndex: duplicate.attachmentIndex,
          stage: 'request_validation',
          retryable: false,
        })
      }

      const { data: canChat, error: canChatError } = await service.rpc('can_users_chat', {
        p_sender_user_id: user.id,
        p_receiver_user_id: receiverId,
      })
      if (canChatError || canChat !== true) {
        return json(403, {
          error: 'messaging_unavailable',
          stage: 'authorization',
          retryable: false,
        })
      }

      // One accepted album consumes one actor quota unit. Every image still
      // receives an independent receipt/evidence pipeline, but concurrent
      // workers share this lazy promise so a 10-photo album cannot exhaust a
      // single-photo counter midway through the request. Fully cached retries
      // never call the gate.
      let albumRateLimitPromise: ReturnType<typeof consumeContentGuardRateLimit> | null = null
      const consumeAlbumRateLimit = () => {
        albumRateLimitPromise ??= consumeContentGuardRateLimit(service, user.id, 'chat_image_album')
        return albumRateLimitPromise
      }
      const preparationStartedAt = performance.now()
      const results = await mapBounded(
        attachments,
        CHAT_IMAGE_PREPARATION_CONCURRENCY,
        async (attachment) => ({
          attachment,
          result: await preflightChatImagePairModeration({
            service,
            userId: user.id,
            receiverId,
            clientMessageId,
            attachmentId: attachment.attachmentId,
            bucket: attachment.bucket,
            path: attachment.path,
            mime: attachment.mime,
            previewPath: attachment.previewPath,
            rateLimitGate: consumeAlbumRateLimit,
            deferFreshAssessment: true,
          }),
        }),
      )
      const preparationMs = Math.round(performance.now() - preparationStartedAt)
      const deferred = results.filter((entry) => entry.result?.deferredAssessment)
      const providerStartedAt = performance.now()
      const providerResults = await mapBounded(
        deferred,
        CHAT_IMAGE_PROVIDER_CONCURRENCY,
        async (entry) => completeDeferredChatImagePairModeration(
          entry.result.deferredAssessment,
        ),
      )
      deferred.forEach((entry, index) => {
        entry.result = providerResults[index]
      })
      const providerMs = Math.round(performance.now() - providerStartedAt)
      const rejected = results.find((entry) => entry.result !== null)
      if (rejected?.result) {
        return json(
          rejected.result.code === 'image_moderation_rate_limited'
            ? 429
            : rejected.result.retryable ? 503 : 422,
          {
            error: rejected.result.code,
            categories: rejected.result.categories,
            retryable: rejected.result.retryable,
            ...(rejected.result.retryAfterSeconds
              ? { retry_after_seconds: rejected.result.retryAfterSeconds }
              : {}),
            attachmentId: rejected.attachment.attachmentId,
            attachmentIndex: rejected.attachment.attachmentIndex,
            stage: rejected.result.stage || 'content_moderation',
          },
        )
      }
      console.log('[chat-attachment-finalize] moderation-batch-success', {
        attachmentCount: attachments.length,
        deferredProviderCount: deferred.length,
        preparationConcurrency: CHAT_IMAGE_PREPARATION_CONCURRENCY,
        providerConcurrency: CHAT_IMAGE_PROVIDER_CONCURRENCY,
        preparationMs,
        providerMs,
        totalDurationMs: Math.round(performance.now() - requestStartedAt),
      })
      return json(200, {
        approved: true,
        attachmentCount: attachments.length,
        performance: { totalMs: Math.round(performance.now() - requestStartedAt) },
      })
    }

    if (mode === 'moderate_image_item') {
      const receiverId = String(input.receiverId || '')
      const clientMessageId = String(input.clientMessageId || '')
      const attachmentId = String(input.attachmentId || '')
      const bucket = String(input.bucketId || '')
      const path = String(input.storagePath || '')
      const mime = String(input.mimeType || '').split(';')[0].trim().toLowerCase()
      const previewPath = String(input.previewStoragePath || '')
      const previewMime = String(input.previewMimeType || '').split(';')[0].trim().toLowerCase()
      const requestedAssetRole = input.assetRole == null ? null : String(input.assetRole)
      const expectedPrefix = `${user.id}/${receiverId}/${clientMessageId}/${attachmentId}-`
      if (
        !hardenedContract || !UUID_PATTERN.test(receiverId) || receiverId === user.id ||
        !UUID_PATTERN.test(attachmentId) || !CLIENT_CONTENT_ID_PATTERN.test(clientMessageId) ||
        (requestedAssetRole !== null && !['original', 'preview', 'pair'].includes(requestedAssetRole)) ||
        ![CHAT_ATTACHMENT_STAGING_BUCKET, 'chat-media'].includes(bucket) ||
        !SAFE_VIEW_ONCE_IMAGE_MIMES.has(mime) || previewMime !== 'image/jpeg' ||
        !path.startsWith(expectedPrefix) || path.slice(expectedPrefix.length).includes('/') ||
        !previewPath.startsWith(expectedPrefix) || previewPath.slice(expectedPrefix.length).includes('/') ||
        path === previewPath
      ) {
        return json(400, {
          error: 'invalid_image_moderation_preflight',
          attachmentId,
          stage: 'request_validation',
          retryable: false,
        })
      }
      const { data: canChat, error: canChatError } = await service.rpc('can_users_chat', {
        p_sender_user_id: user.id,
        p_receiver_user_id: receiverId,
      })
      if (canChatError || canChat !== true) {
        return json(403, {
          error: 'messaging_unavailable',
          attachmentId,
          stage: 'authorization',
          retryable: false,
        })
      }
      if (requestedAssetRole === 'pair') {
        const result = await preflightChatImagePairModeration({
          service,
          userId: user.id,
          receiverId,
          clientMessageId,
          attachmentId,
          bucket,
          path,
          mime,
          previewPath,
        })
        if (result) {
          return json(
            result.code === 'image_moderation_rate_limited'
              ? 429
              : result.retryable ? 503 : 422,
            {
              error: result.code,
              categories: result.categories,
              retryable: result.retryable,
              ...(result.retryAfterSeconds
                ? { retry_after_seconds: result.retryAfterSeconds }
                : {}),
              attachmentId,
              stage: result.stage || 'content_moderation',
            },
          )
        }
        console.log('[chat-attachment-finalize] moderation-preflight-success', {
          assetRole: 'pair',
          totalDurationMs: Math.round(performance.now() - requestStartedAt),
        })
        return json(200, {
          approved: true,
          attachmentId,
          assetRole: 'pair',
          performance: { totalMs: Math.round(performance.now() - requestStartedAt) },
        })
      }
      const tasks = [
        {
          assetRole: 'original',
          receiptAttachmentId: attachmentId,
          path,
          mime,
          stage: 'content_moderation',
          consumeRateLimit: true,
        },
        {
          assetRole: 'preview',
          receiptAttachmentId: `${attachmentId}-preview`,
          path: previewPath,
          mime: 'image/jpeg',
          stage: 'preview_moderation',
          consumeRateLimit: false,
        },
      ].filter((task) => requestedAssetRole === null || task.assetRole === requestedAssetRole)
      // One image pipeline per invocation prevents original + preview QR/OCR
      // decoding from multiplying worker memory. Current clients split the two
      // assets into separate calls; the sequential fallback protects older 1.2 clients.
      const results = await mapBounded(tasks, 1, async (task) => ({
        task,
        result: await preflightChatImageModeration({
          service,
          userId: user.id,
          receiverId,
          clientMessageId,
          attachmentId: task.receiptAttachmentId,
          bucket,
          path: task.path,
          mime: task.mime,
          consumeRateLimit: task.consumeRateLimit,
        }),
      }))
      const rejected = results.find((entry) => entry.result !== null)
      if (rejected?.result) {
        return json(
          rejected.result.code === 'image_moderation_rate_limited'
            ? 429
            : rejected.result.retryable ? 503 : 422,
          {
            error: rejected.result.code,
            categories: rejected.result.categories,
            retryable: rejected.result.retryable,
            ...(rejected.result.retryAfterSeconds
              ? { retry_after_seconds: rejected.result.retryAfterSeconds }
              : {}),
            attachmentId,
            stage: rejected.task.stage,
          },
        )
      }
      console.log('[chat-attachment-finalize] moderation-preflight-success', {
        assetRole: requestedAssetRole || 'both_sequential',
        totalDurationMs: Math.round(performance.now() - requestStartedAt),
      })
      return json(200, {
        approved: true,
        attachmentId,
        assetRole: requestedAssetRole || 'both_sequential',
        performance: { totalMs: Math.round(performance.now() - requestStartedAt) },
      })
    }

    if (mode === 'cancel_item') {
      const receiverId = String(input.receiverId || '')
      const clientMessageId = String(input.clientMessageId || '')
      const raw = input.attachment || {}
      const attachmentId = String(raw.attachmentId || '')
      const bucket = String(raw.bucketId || '')
      const prefix = `${user.id}/${receiverId}/${clientMessageId}/${attachmentId}-`
      const paths = [raw.storagePath, raw.previewStoragePath]
        .map((value) => String(value || ''))
        .filter((value) => value.startsWith(prefix))
      if (!receiverId || !clientMessageId || !attachmentId ||
          !['chat-media', CHAT_ATTACHMENT_STAGING_BUCKET].includes(bucket) || paths.length < 1) {
        return json(400, { error: 'invalid_cancel_item_request' })
      }
      // Always commit the cancellation tombstone before deleting bytes. Images
      // live in the moderation staging bucket before publication, but a stale
      // worker must still be prevented from finalising that removed item.
      const { error: cancellationError } = await service.rpc('rpc_cancel_chat_media_album_item', {
        p_sender_id: user.id,
        p_receiver_id: receiverId,
        p_client_message_id: clientMessageId,
        p_attachment_id: attachmentId,
      })
      if (cancellationError) {
        return json(409, { error: cancellationError.message || 'attachment_item_cancel_rejected' })
      }
      const { error: cleanupError } = await service.storage.from(bucket).remove([...new Set(paths)])
      if (cleanupError) return json(503, { error: 'attachment_item_cleanup_failed' })
      return json(200, { cancelled: true, attachmentId })
    }

    if (mode === 'cancel') {
      const receiverId = String(input.receiverId || '')
      const clientMessageId = String(input.clientMessageId || '')
      const attachments = Array.isArray(input.attachments) ? input.attachments : []
      if (!receiverId || !clientMessageId || attachments.length < 1 || attachments.length > 10) {
        return json(400, { error: 'invalid_cancel_request' })
      }
      const paths = new Map<string, string[]>()
      for (const raw of attachments) {
        const attachmentId = String(raw?.attachmentId || '')
        const bucket = String(raw?.bucketId || '')
        const expectedPrefix = `${user.id}/${receiverId}/${clientMessageId}/${attachmentId}-`
        const candidates = [raw?.storagePath, raw?.previewStoragePath]
          .map((value) => String(value || ''))
          .filter((value) => value.startsWith(expectedPrefix))
        if (!attachmentId || !['chat-media', 'voice-messages', CHAT_ATTACHMENT_STAGING_BUCKET].includes(bucket) || candidates.length === 0) {
          return json(400, { error: 'invalid_cancel_attachment' })
        }
        for (const candidate of candidates) {
          const targetBucket = bucket === CHAT_ATTACHMENT_STAGING_BUCKET
            ? CHAT_ATTACHMENT_STAGING_BUCKET
            : candidate.endsWith('-preview.jpg') ? 'chat-media' : bucket
          paths.set(targetBucket, [...(paths.get(targetBucket) || []), candidate])
        }
      }
      // Tombstone every batch before deleting bytes, including all-image
      // batches that still live entirely in the v1.2 moderation staging bucket.
      const { error: cancellationError } = await service.rpc('rpc_cancel_chat_attachment_batch', {
        p_sender_id: user.id,
        p_receiver_id: receiverId,
        p_client_message_id: clientMessageId,
        p_attachments: attachments,
      })
      if (cancellationError) {
        console.log('[chat-attachment-finalize] cancellation-rpc-error', {
          code: cancellationError.code ?? null,
          message: cancellationError.message,
        })
        return json(409, { error: cancellationError.message || 'attachment_cancel_rejected' })
      }
      for (const [bucket, bucketPaths] of paths) {
        const { error } = await service.storage.from(bucket).remove([...new Set(bucketPaths)])
        if (error) return json(503, { error: 'attachment_cancel_cleanup_failed' })
      }
      console.log('[chat-attachment-finalize] cancelled', {
        objectCount: [...paths.values()].reduce((sum, values) => sum + values.length, 0),
      })
      return json(200, { cancelled: true })
    }

    if (mode === 'finalize_batch') {
      const receiverId = String(input.receiverId || '')
      const clientMessageId = String(input.clientMessageId || '')
      const kind = String(input.attachmentType || '')
      const mediaGroupId = String(input.mediaGroupId || '')
      const mediaKind = input.mediaKind == null ? null : String(input.mediaKind)
      const attachments = Array.isArray(input.attachments) ? input.attachments : []
      const expectedCount = Number(input.expectedCount || attachments.length)
      const isMediaAlbum = expectedCount > 1 && Boolean(mediaGroupId)
      if (
        !receiverId || !clientMessageId || !['image', 'video', 'document', 'audio'].includes(kind) ||
        expectedCount !== attachments.length || expectedCount < 1 || expectedCount > 10 ||
        (expectedCount > 1 && !isMediaAlbum) ||
        (mediaKind !== null && (
          kind !== 'image' || expectedCount !== 1 ||
          !['giphy_gif', 'giphy_sticker', 'giphy_emoji', 'giphy_text'].includes(mediaKind)
        ))
      ) {
        return json(400, { error: 'invalid_attachment_batch' })
      }

      const validated: Record<string, unknown>[] = []
      const sourceObjects: Array<{ bucket: string; path: string }> = []
      const publishedObjects: string[] = []
      const failBatch = async (
        status: number,
        body: Record<string, unknown>,
        item?: { attachmentId: string; attachmentIndex: number; stage: string },
      ) => {
        if (publishedObjects.length) {
          await removeApprovedChatImages(service, publishedObjects)
        }
        return json(status, {
          ...body,
          mediaGroupId: mediaGroupId || null,
          ...(item ?? {}),
        })
      }
      const hardenedImagePreparations = new Map<number, {
        attachmentId: string
        bucket: string
        mime: string
        sourcePath: string
        sourcePreviewPath: string
        approvedPath: string
        approvedPreviewPath: string
        original: { bytes: Uint8Array; sha256: string; assessment: Record<string, unknown> }
        preview: { bytes: Uint8Array; sha256: string }
      }>()
      if (hardenedContract) {
        const imageCandidates = attachments
          .map((raw, attachmentIndex) => ({ raw: raw || {}, attachmentIndex }))
          .filter(({ raw }) => String(raw.attachmentType || kind) === 'image')
        const preparationResults = await mapBounded(imageCandidates, 4, async ({ raw, attachmentIndex }) => {
          const attachmentId = String(raw.attachmentId || '')
          const bucket = String(raw.bucketId || '')
          const sourcePath = String(raw.storagePath || '')
          const mime = String(raw.mimeType || '').split(';')[0].trim().toLowerCase()
          const sourcePreviewPath = String(raw.previewStoragePath || '')
          const expectedPrefix = `${user.id}/${receiverId}/${clientMessageId}/${attachmentId}-`
          if (
            Number(raw.attachmentIndex) !== attachmentIndex ||
            !UUID_PATTERN.test(attachmentId) ||
            ![CHAT_ATTACHMENT_STAGING_BUCKET, 'chat-media'].includes(bucket) ||
            !SAFE_VIEW_ONCE_IMAGE_MIMES.has(mime) ||
            !sourcePath.startsWith(expectedPrefix) ||
            sourcePath.slice(expectedPrefix.length).includes('/') ||
            !sourcePreviewPath.startsWith(expectedPrefix) ||
            sourcePreviewPath.slice(expectedPrefix.length).includes('/') ||
            String(raw.previewMimeType || '') !== 'image/jpeg' ||
            sourcePath === sourcePreviewPath
          ) {
            return {
              ok: false as const, status: 400,
              body: { error: 'invalid_attachment_batch_item', retryable: false },
              item: { attachmentId, attachmentIndex, stage: 'request_validation' },
            }
          }
          try {
            const [originalResult, previewResult] = await Promise.all([
              readReceiptBackedApprovedImage({
                service, userId: user.id, receiverId, clientMessageId, attachmentId,
                bucket, path: sourcePath, mime,
              }),
              readReceiptBackedApprovedImage({
                service, userId: user.id, receiverId, clientMessageId,
                attachmentId: `${attachmentId}-preview`, bucket,
                path: sourcePreviewPath, mime: 'image/jpeg',
              }),
            ])
            if (!originalResult.ok) {
              return {
                ok: false as const, status: originalResult.status,
                body: {
                  error: originalResult.code, categories: originalResult.categories,
                  retryable: originalResult.retryable,
                },
                item: { attachmentId, attachmentIndex, stage: 'content_moderation' },
              }
            }
            if (!previewResult.ok) {
              return {
                ok: false as const, status: previewResult.status,
                body: {
                  error: previewResult.code, categories: previewResult.categories,
                  retryable: previewResult.retryable,
                },
                item: { attachmentId, attachmentIndex, stage: 'preview_moderation' },
              }
            }
            const originalSample = originalResult.bytes.slice(0, 65536)
            if (
              originalResult.bytes.byteLength <= 0 ||
              originalResult.bytes.byteLength > LIMITS.image ||
              !validateSignature('image', mime, originalSample, false) ||
              !signatureMatchesDeclaredMime('image', mime, originalSample, false)
            ) {
              return {
                ok: false as const, status: 415,
                body: { error: 'attachment_content_mismatch', retryable: false },
                item: { attachmentId, attachmentIndex, stage: 'signature_validation' },
              }
            }
            if (
              previewResult.bytes.byteLength <= 0 ||
              previewResult.bytes.byteLength > 1048576 ||
              !validateSignature('image', 'image/jpeg', previewResult.bytes, false) ||
              !signatureMatchesDeclaredMime('image', 'image/jpeg', previewResult.bytes, false)
            ) {
              return {
                ok: false as const, status: 415,
                body: { error: 'attachment_preview_invalid', retryable: false },
                item: { attachmentId, attachmentIndex, stage: 'preview_validation' },
              }
            }
            const publicationResults = await Promise.allSettled([
              publishApprovedChatImage({
                service, bytes: originalResult.bytes, userId: user.id, receiverId,
                clientMessageId, attachmentId, sha256: originalResult.sha256, mime,
              }),
              publishApprovedChatImage({
                service, bytes: previewResult.bytes, userId: user.id, receiverId,
                clientMessageId, attachmentId, sha256: previewResult.sha256,
                mime: 'image/jpeg', preview: true,
              }),
            ])
            const completedPaths = publicationResults
              .filter((result) => result.status === 'fulfilled')
              .map((result) => result.value)
            if (publicationResults.some((result) => result.status === 'rejected')) {
              if (completedPaths.length > 0) {
                await removeApprovedChatImages(service, completedPaths)
              }
              return {
                ok: false as const, status: 503,
                body: { error: 'approved_image_publication_failed', retryable: true },
                item: { attachmentId, attachmentIndex, stage: 'publication' },
              }
            }
            return {
              ok: true as const,
              attachmentIndex,
              prepared: {
                attachmentId, bucket, mime, sourcePath, sourcePreviewPath,
                approvedPath: (publicationResults[0] as PromiseFulfilledResult<string>).value,
                approvedPreviewPath: (publicationResults[1] as PromiseFulfilledResult<string>).value,
                original: {
                  bytes: originalResult.bytes,
                  sha256: originalResult.sha256,
                  assessment: originalResult.assessment,
                },
                preview: { bytes: previewResult.bytes, sha256: previewResult.sha256 },
              },
            }
          } catch {
            return {
              ok: false as const, status: 503,
              body: { error: 'approved_image_publication_failed', retryable: true },
              item: { attachmentId, attachmentIndex, stage: 'publication' },
            }
          }
        })
        for (const result of preparationResults) {
          if (!result.ok) continue
          hardenedImagePreparations.set(result.attachmentIndex, result.prepared)
          publishedObjects.push(result.prepared.approvedPath, result.prepared.approvedPreviewPath)
          sourceObjects.push(
            { bucket: result.prepared.bucket, path: result.prepared.sourcePath },
            { bucket: result.prepared.bucket, path: result.prepared.sourcePreviewPath },
          )
        }
        const failedPreparation = preparationResults.find((result) => !result.ok)
        if (failedPreparation && !failedPreparation.ok) {
          return await failBatch(
            failedPreparation.status,
            failedPreparation.body,
            failedPreparation.item,
          )
        }
      }
      for (let index = 0; index < attachments.length; index += 1) {
        const raw = attachments[index] || {}
        const attachmentId = String(raw.attachmentId || '')
        const itemKind = String(raw.attachmentType || kind)
        const bucket = String(raw.bucketId || '')
        let path = String(raw.storagePath || '')
        const mime = String(raw.mimeType || '').split(';')[0].trim().toLowerCase()
        const expectedPrefix = `${user.id}/${receiverId}/${clientMessageId}/${attachmentId}-`
        if (
          Number(raw.attachmentIndex) !== index ||
          !['image', 'video', 'document', 'audio'].includes(itemKind) ||
          (isMediaAlbum && !['image', 'video'].includes(itemKind)) ||
          (!isMediaAlbum && itemKind !== kind) ||
          !(itemKind === 'image'
            ? [CHAT_ATTACHMENT_STAGING_BUCKET, 'chat-media'].includes(bucket)
            : bucket === (itemKind === 'audio' ? 'voice-messages' : 'chat-media')) ||
          !path.startsWith(expectedPrefix) || !mime
        ) {
          return await failBatch(400, { error: 'invalid_attachment_batch_item', retryable: false }, {
            attachmentId, attachmentIndex: index, stage: 'request_validation',
          })
        }

        let contentLength: number | null = null
        let sample = new Uint8Array()
        if (itemKind !== 'image') {
          const { data: signed, error: signedError } =
            await service.storage.from(bucket).createSignedUrl(path, 60)
          if (signedError || !signed?.signedUrl) return await failBatch(404, {
            error: 'attachment_object_not_found', retryable: true,
          }, { attachmentId, attachmentIndex: index, stage: 'source_read' })
          const sampleResponse = await fetch(signed.signedUrl, { headers: { Range: 'bytes=0-65535' } })
          if (!sampleResponse.ok) return await failBatch(422, {
            error: 'attachment_unreadable', retryable: true,
          }, { attachmentId, attachmentIndex: index, stage: 'source_read' })
          contentLength = authoritativeResponseSize(sampleResponse)
          sample = new Uint8Array(await sampleResponse.arrayBuffer())
          if (
            contentLength === null || contentLength <= 0 || contentLength > LIMITS[itemKind] ||
            !validateSignature(itemKind, mime, sample, false, String(raw.originalName || '')) ||
            !signatureMatchesDeclaredMime(itemKind, mime, sample, false)
          ) {
            return await failBatch(415, { error: 'attachment_content_mismatch', retryable: false }, {
              attachmentId, attachmentIndex: index, stage: 'signature_validation',
            })
          }
        }

        let imageSafety = null
        let capturedImage: { bytes: Uint8Array; sha256: string } | null = null
        let capturedHoldPath: string | null = null
        let receiptBackedPreview: { bytes: Uint8Array; sha256: string } | null = null
        const prepublishedImage = hardenedImagePreparations.get(index) || null
        let limitedMediaSafety = null
        if (itemKind === 'image') {
          if (hardenedContract) {
            const sourcePreviewPath = String(raw.previewStoragePath || '')
            if (
              !sourcePreviewPath.startsWith(expectedPrefix) ||
              sourcePreviewPath.slice(expectedPrefix.length).includes('/') ||
              String(raw.previewMimeType || '') !== 'image/jpeg'
            ) {
              return await failBatch(422, { error: 'attachment_preview_required', retryable: false }, {
                attachmentId, attachmentIndex: index, stage: 'preview_validation',
              })
            }
            if (!prepublishedImage) {
              return await failBatch(503, {
                error: 'approved_image_capture_missing', retryable: true,
              }, { attachmentId, attachmentIndex: index, stage: 'publication' })
            }
            capturedImage = {
              bytes: prepublishedImage.original.bytes,
              sha256: prepublishedImage.original.sha256,
            }
            imageSafety = prepublishedImage.original.assessment
            receiptBackedPreview = prepublishedImage.preview
          } else {
          const priorReview = await priorImageReview(service, user.id, clientMessageId, attachmentId)
          if (priorReview?.status === 'PENDING_REVIEW') {
            return await failBatch(409, { error: 'image_review_required', retryable: false }, {
              attachmentId, attachmentIndex: index, stage: 'content_moderation',
            })
          }
          if (priorReview?.status === 'REJECTED') {
            return await failBatch(422, { error: 'image_content_not_allowed', retryable: false }, {
              attachmentId, attachmentIndex: index, stage: 'content_moderation',
            })
          }
          if (priorReview?.status === 'APPROVED') {
            try {
              const restored = await restoreApprovedChatImage({ service, review: priorReview, bucket, path, mime })
              contentLength = restored.byteSize
              capturedImage = restored
              imageSafety = { decision: 'ALLOW', categories: ['human_approved'], riskScore: 0,
                provider: 'human_review', model: 'admin', providerRequestId: null,
                extractedText: null, scores: {}, failureReason: null }
            } catch {
              return await failBatch(503, { error: 'approved_image_evidence_missing', retryable: true }, {
                attachmentId, attachmentIndex: index, stage: 'content_moderation',
              })
            }
          } else {
            let captured
            try {
              captured = await readChatImageBytes({ service, bucket, path })
            } catch {
              return await failBatch(503, { error: 'image_moderation_unavailable', retryable: true }, {
                attachmentId, attachmentIndex: index, stage: 'content_moderation',
              })
            }
            const { data: hashMatch, error: hashError } = await service.rpc(
              'rpc_service_match_unsafe_media_hash', { p_sha256: captured.sha256 },
            )
            if (hashError || hashMatch?.authorized !== true) {
              return await failBatch(503, { error: 'image_moderation_unavailable', retryable: true }, {
                attachmentId, attachmentIndex: index, stage: 'content_moderation',
              })
            }
            const cachedAssessment = hashMatch.matched === true ? null : await readImageModerationReceipt({
              service, userId: user.id, clientMessageId, attachmentId,
              sha256: captured.sha256, mime,
            })
            if (hardenedContract && hashMatch.matched !== true && !cachedAssessment) {
              return await failBatch(503, {
                error: 'image_moderation_receipt_required',
                retryable: true,
              }, { attachmentId, attachmentIndex: index, stage: 'content_moderation' })
            }
            if (hashMatch.matched !== true && !cachedAssessment) {
              const rateLimit = await consumeContentGuardRateLimit(service, user.id, 'chat_image')
              if (!rateLimit.available || !rateLimit.allowed) {
                return await failBatch(rateLimit.available ? 429 : 503, {
                  error: rateLimit.available
                    ? 'image_moderation_rate_limited'
                    : 'image_moderation_unavailable',
                  retry_after_seconds: rateLimit.retryAfterSeconds,
                  retryable: true,
                }, { attachmentId, attachmentIndex: index, stage: 'content_moderation' })
              }
            }
            let hold = null
            const ensureHold = async () => {
              if (!hold) {
                hold = await createChatImageHold({
                  service, ...captured, userId: user.id, clientMessageId, attachmentId, mime,
                })
              }
              return hold
            }
            let moderationHold = null
            if (hashMatch.matched === true || !cachedAssessment || cachedAssessment.decision !== 'ALLOW') {
              try {
                moderationHold = await ensureHold()
              } catch {
                return await failBatch(503, {
                  error: 'image_moderation_unavailable', retryable: true,
                }, { attachmentId, attachmentIndex: index, stage: 'content_moderation' })
              }
            }
            imageSafety = hashMatch.matched === true
              ? { decision: 'BLOCK', categories: ['known_illegal_media'], riskScore: 1,
                  provider: 'hash_blocklist', model: 'sha256-v1', providerRequestId: null,
                  extractedText: null, scores: { known_illegal_media: 1 }, failureReason: null }
              : cachedAssessment || await assessChatImage(
                  moderationHold!.signedUrl, captured.bytes, mime,
                )
            if (!cachedAssessment) {
              await storeImageModerationReceipt({
                service, userId: user.id, clientMessageId, attachmentId,
                sha256: captured.sha256, mime, assessment: imageSafety,
              })
            }
            capturedImage = captured
            capturedHoldPath = hold?.path || null
            if (imageSafety.failureReason) {
              if (hold) await service.storage.from(hold.bucket).remove([hold.path])
              return await failBatch(503, {
                error: 'image_moderation_unavailable', retryable: true,
              }, { attachmentId, attachmentIndex: index, stage: 'content_moderation' })
            }
            if (imageSafety.decision !== 'ALLOW') {
              const recordError = await recordImageDecision({
                service, userId: user.id, receiverId, clientMessageId, attachmentId,
                bucket: hold!.bucket, path: hold!.path, caption: input.caption,
                sha256: captured.sha256, assessment: imageSafety,
              })
              if (recordError) {
                await service.storage.from(hold!.bucket).remove([hold!.path])
                return await failBatch(503, { error: 'content_moderation_record_failed', retryable: true }, {
                  attachmentId, attachmentIndex: index, stage: 'content_moderation',
                })
              }
              if (imageSafety.decision === 'BLOCK') {
                const rejectedPaths = [path, String(raw.previewStoragePath || '')]
                  .filter((value) => value.startsWith(expectedPrefix))
                await service.storage.from(bucket).remove(rejectedPaths)
                if (!requiresChildSafetyEvidenceHold(imageSafety)) {
                  await service.storage.from(hold!.bucket).remove([hold!.path])
                }
              }
              if (imageSafety.decision !== 'ALLOW') {
                return await failBatch(422, {
                  error: imageSafety.decision === 'REVIEW'
                    ? 'image_review_required'
                    : 'image_content_not_allowed',
                  categories: imageSafety.categories,
                  retryable: false,
                }, { attachmentId, attachmentIndex: index, stage: 'content_moderation' })
              }
            }
            if (imageSafety.decision !== 'ALLOW') {
              await service.storage.from(hold!.bucket).remove([hold!.path])
            }
          }
          }
          if (imageSafety?.decision === 'ALLOW' && capturedImage) {
            contentLength = capturedImage.bytes.byteLength
            sample = capturedImage.bytes.slice(0, 65536)
            if (
              contentLength <= 0 || contentLength > LIMITS.image ||
              !validateSignature('image', mime, sample, false) ||
              !signatureMatchesDeclaredMime('image', mime, sample, false)
            ) {
              return await failBatch(415, {
                error: 'attachment_content_mismatch', retryable: false,
              }, { attachmentId, attachmentIndex: index, stage: 'signature_validation' })
            }
          }
        } else {
          let policy
          try {
            policy = await resolveLimitedMediaPolicy(service, mediaPolicyCache, itemKind)
          } catch {
            return await failBatch(503, { error: 'attachment_moderation_policy_unavailable', retryable: true }, {
              attachmentId, attachmentIndex: index, stage: 'policy',
            })
          }
          if (
            policy.enabled !== true || policy.enforcement_mode === 'ENFORCE' ||
            (hardenedContract && ['video', 'document'].includes(itemKind))
          ) {
            return await failBatch(422, {
              error: 'attachment_inspection_not_available', attachment_type: itemKind, retryable: false,
            }, { attachmentId, attachmentIndex: index, stage: 'policy' })
          }
          limitedMediaSafety = {
            decision: 'ALLOW_LIMITED_INSPECTION',
            coverage: 'limited_inspection',
            strategy: policy.inspection_strategy,
          }
        }

        let previewPath = String(raw.previewStoragePath || '')
        let previewLength: number | null = null
        const previewDimensions = normalizePreviewDimensions(raw.previewWidth, raw.previewHeight)
        if (itemKind === 'image' || itemKind === 'video') {
          if (!previewPath.startsWith(expectedPrefix) || String(raw.previewMimeType || '') !== 'image/jpeg') {
            return await failBatch(422, { error: 'attachment_preview_required', retryable: false }, {
              attachmentId, attachmentIndex: index, stage: 'preview_validation',
            })
          }
          const sourcePreviewPath = previewPath
          let previewBytes: Uint8Array
          let previewSha256: string
          let previewHoldPath: string | null = null
          if (itemKind === 'image') {
            if (receiptBackedPreview) {
              previewBytes = receiptBackedPreview.bytes
              previewSha256 = receiptBackedPreview.sha256
            } else {
            const previewAttachmentId = `${attachmentId}-preview`
            const previewReview = await priorImageReview(
              service, user.id, clientMessageId, previewAttachmentId,
            )
            if (previewReview?.status === 'PENDING_REVIEW') {
              return await failBatch(409, { error: 'image_review_required', retryable: false }, {
                attachmentId, attachmentIndex: index, stage: 'preview_moderation',
              })
            }
            if (previewReview?.status === 'REJECTED') {
              return await failBatch(422, { error: 'image_content_not_allowed', retryable: false }, {
                attachmentId, attachmentIndex: index, stage: 'preview_moderation',
              })
            }
            if (previewReview?.status === 'APPROVED') {
              try {
                const restored = await restoreApprovedChatImage({
                  service, review: previewReview, bucket, path: sourcePreviewPath, mime: 'image/jpeg',
                })
                previewBytes = restored.bytes
                previewSha256 = restored.sha256
              } catch {
                return await failBatch(503, { error: 'approved_image_evidence_missing', retryable: true }, {
                  attachmentId, attachmentIndex: index, stage: 'preview_moderation',
                })
              }
            } else {
              let capturedPreview
              try {
                capturedPreview = await readChatImageBytes({
                  service, bucket, path: sourcePreviewPath,
                })
              } catch {
                return await failBatch(503, { error: 'image_moderation_unavailable', retryable: true }, {
                  attachmentId, attachmentIndex: index, stage: 'preview_moderation',
                })
              }
              const { data: previewHashMatch, error: previewHashError } = await service.rpc(
                'rpc_service_match_unsafe_media_hash', { p_sha256: capturedPreview.sha256 },
              )
              if (previewHashError || previewHashMatch?.authorized !== true) {
                return await failBatch(503, { error: 'image_moderation_unavailable', retryable: true }, {
                  attachmentId, attachmentIndex: index, stage: 'preview_moderation',
                })
              }
              const cachedPreviewAssessment = previewHashMatch.matched === true ? null
                : await readImageModerationReceipt({
                    service, userId: user.id, clientMessageId,
                    attachmentId: previewAttachmentId, sha256: capturedPreview.sha256,
                    mime: 'image/jpeg',
                  })
              if (hardenedContract && previewHashMatch.matched !== true && !cachedPreviewAssessment) {
                return await failBatch(503, {
                  error: 'image_moderation_receipt_required',
                  retryable: true,
                }, { attachmentId, attachmentIndex: index, stage: 'preview_moderation' })
              }
              let previewHold = null
              if (
                previewHashMatch.matched === true || !cachedPreviewAssessment ||
                cachedPreviewAssessment.decision !== 'ALLOW'
              ) {
                try {
                  previewHold = await createChatImageHold({
                    service, ...capturedPreview, userId: user.id, clientMessageId,
                    attachmentId: previewAttachmentId, mime: 'image/jpeg',
                  })
                } catch {
                  return await failBatch(503, {
                    error: 'image_moderation_unavailable', retryable: true,
                  }, { attachmentId, attachmentIndex: index, stage: 'preview_moderation' })
                }
              }
              const previewSafety = previewHashMatch.matched === true
                ? { decision: 'BLOCK', categories: ['known_illegal_media'], riskScore: 1,
                    provider: 'hash_blocklist', model: 'sha256-v1', providerRequestId: null,
                    extractedText: null, scores: { known_illegal_media: 1 }, failureReason: null }
                : cachedPreviewAssessment || await assessChatImage(
                    previewHold!.signedUrl, capturedPreview.bytes, 'image/jpeg',
                  )
              if (!cachedPreviewAssessment) {
                await storeImageModerationReceipt({
                  service, userId: user.id, clientMessageId,
                  attachmentId: previewAttachmentId, sha256: capturedPreview.sha256,
                  mime: 'image/jpeg', assessment: previewSafety,
                })
              }
              if (previewSafety.failureReason) {
                await service.storage.from(previewHold!.bucket).remove([previewHold!.path])
                return await failBatch(503, {
                  error: 'image_moderation_unavailable', retryable: true,
                }, { attachmentId, attachmentIndex: index, stage: 'preview_moderation' })
              }
              if (previewSafety.decision !== 'ALLOW') {
                const recordError = await recordImageDecision({
                  service, userId: user.id, receiverId, clientMessageId,
                  attachmentId: previewAttachmentId, bucket: previewHold!.bucket,
                  path: previewHold!.path, caption: '', sha256: capturedPreview.sha256,
                  assessment: previewSafety,
                })
                if (recordError) {
                  await service.storage.from(previewHold!.bucket).remove([previewHold!.path])
                  return await failBatch(503, { error: 'content_moderation_record_failed', retryable: true }, {
                    attachmentId, attachmentIndex: index, stage: 'preview_moderation',
                  })
                }
                if (previewSafety.decision === 'BLOCK') {
                  await service.storage.from(bucket).remove([sourcePreviewPath])
                  if (!requiresChildSafetyEvidenceHold(previewSafety)) {
                    await service.storage.from(previewHold!.bucket).remove([previewHold!.path])
                  }
                }
                return await failBatch(422, {
                  error: previewSafety.decision === 'REVIEW'
                    ? 'image_review_required'
                    : 'image_content_not_allowed',
                  categories: previewSafety.categories,
                  retryable: false,
                }, { attachmentId, attachmentIndex: index, stage: 'preview_moderation' })
              }
              previewBytes = capturedPreview.bytes
              previewSha256 = capturedPreview.sha256
              previewHoldPath = previewHold?.path || null
            }
            }
          } else {
            const { data: previewSigned, error: previewSignedError } =
              await service.storage.from(bucket).createSignedUrl(previewPath, 60)
            if (previewSignedError || !previewSigned?.signedUrl) {
              return await failBatch(404, { error: 'attachment_preview_not_found', retryable: true }, {
                attachmentId, attachmentIndex: index, stage: 'preview_read',
              })
            }
            const previewResponse = await fetch(previewSigned.signedUrl, { headers: { Range: 'bytes=0-1048576' } })
            previewBytes = new Uint8Array(await previewResponse.arrayBuffer())
            const responseLength = authoritativeResponseSize(previewResponse)
            if (
              !previewResponse.ok || responseLength === null || responseLength <= 0 || responseLength > 1048576 ||
              !validateSignature('image', 'image/jpeg', previewBytes, false)
            ) {
              return await failBatch(415, { error: 'attachment_preview_invalid', retryable: false }, {
                attachmentId, attachmentIndex: index, stage: 'preview_validation',
              })
            }
            previewSha256 = await sha256Hex(previewBytes)
          }
          previewLength = previewBytes.length
          if (itemKind === 'image') {
            if (!capturedImage || imageSafety?.decision !== 'ALLOW') {
              return await failBatch(503, {
                error: 'approved_image_capture_missing', retryable: true,
              }, { attachmentId, attachmentIndex: index, stage: 'publication' })
            }
            if (prepublishedImage) {
              path = prepublishedImage.approvedPath
              previewPath = prepublishedImage.approvedPreviewPath
            } else {
              const sourceImagePath = path
              const publicationResults = await Promise.allSettled([
              publishApprovedChatImage({
                service, bytes: capturedImage.bytes, userId: user.id, receiverId,
                clientMessageId, attachmentId, sha256: capturedImage.sha256, mime,
              }),
              publishApprovedChatImage({
                service, bytes: previewBytes, userId: user.id, receiverId,
                clientMessageId, attachmentId, sha256: previewSha256,
                mime: 'image/jpeg', preview: true,
              }),
              ])
              const completedPaths = publicationResults
                .filter((result) => result.status === 'fulfilled')
                .map((result) => result.value)
              if (publicationResults.some((result) => result.status === 'rejected')) {
                if (completedPaths.length > 0) {
                  await removeApprovedChatImages(service, completedPaths)
                }
                return await failBatch(503, {
                  error: 'approved_image_publication_failed', retryable: true,
                }, { attachmentId, attachmentIndex: index, stage: 'publication' })
              }
              const [approvedImagePath, approvedPreviewPath] = completedPaths
              path = approvedImagePath
              previewPath = approvedPreviewPath
              publishedObjects.push(path, previewPath)
              sourceObjects.push(
                { bucket, path: sourceImagePath },
                { bucket, path: sourcePreviewPath },
              )
              const holdPaths = [capturedHoldPath, previewHoldPath].filter(Boolean) as string[]
              if (holdPaths.length > 0) {
                await service.storage.from('moderation-quarantine').remove(holdPaths)
              }
            }
          } else {
            previewPath = await publishApprovedChatImage({
              service, bytes: previewBytes, userId: user.id, receiverId,
              clientMessageId, attachmentId, sha256: previewSha256,
              mime: 'image/jpeg', preview: true,
            })
            publishedObjects.push(previewPath)
            sourceObjects.push({ bucket, path: sourcePreviewPath })
            if (previewHoldPath) {
              await service.storage.from('moderation-quarantine').remove([previewHoldPath])
            }
          }
        }

        validated.push({
          attachmentId,
          attachmentIndex: index,
          attachmentType: itemKind,
          bucketId: itemKind === 'audio' ? bucket : 'chat-media',
          storagePath: path,
          originalName: raw.originalName || null,
          mimeType: mime,
          byteSize: contentLength,
          width: positiveIntegerOrNull(raw.width),
          height: positiveIntegerOrNull(raw.height),
          durationMs: positiveIntegerOrNull(raw.durationMs),
          sha256: capturedImage?.sha256 || raw.sha256 || null,
          validationDetails: {
            ...buildValidationDetails({
              sampleBytes: sample.length,
              hasDimensions: positiveIntegerOrNull(raw.width) !== null && positiveIntegerOrNull(raw.height) !== null,
              hasDuration: positiveIntegerOrNull(raw.durationMs) !== null,
              previewVerified: previewLength !== null,
            }),
            ...(imageSafety ? {
              content_moderation: {
                decision: imageSafety.decision,
                provider: imageSafety.provider,
                model: imageSafety.model,
                risk_score: imageSafety.riskScore,
                categories: imageSafety.categories,
              },
            } : limitedMediaSafety ? { content_moderation: limitedMediaSafety } : {}),
          },
          ...(previewPath ? {
            previewStoragePath: previewPath,
            previewMimeType: 'image/jpeg',
            previewByteSize: previewLength,
            previewWidth: previewDimensions.width,
            previewHeight: previewDimensions.height,
          } : {}),
          waveform: itemKind === 'audio' && Array.isArray(raw.waveform) ? raw.waveform.slice(0, 240) : null,
        })
      }

      const batchFinalizationPayload = {
        protocol: 'attachment-finalization-v2', mode: 'batch', receiverId,
        clientMessageId, attachmentType: isMediaAlbum ? 'album' : kind, mediaGroupId: mediaGroupId || null, expectedCount,
        caption: String(input.caption || ''),
        replyToMessageId: input.replyToMessageId || null,
        ...(mediaKind ? { mediaKind } : {}),
        // Keep the idempotency payload byte-for-byte compatible with the v2
        // server contract. Verification evidence is authoritative server data
        // and is persisted separately on message_attachments.
        attachments: validated.map((item) => ({
          ...item,
          validationDetails: {
            validator: 'signature-v2',
            sampled_bytes: (item.validationDetails as { sampled_bytes?: number })?.sampled_bytes ?? 0,
          },
        })),
      }
      const batchRpcInput = {
        p_sender_id: user.id,
        p_receiver_id: receiverId,
        p_client_message_id: clientMessageId,
        p_attachment_type: kind,
        p_expected_count: expectedCount,
        p_attachments: validated,
        p_caption: input.caption || '',
        p_reply_to_message_id: input.replyToMessageId || null,
      }
      let data = null
      let error: RpcError | null = null
      if (atomicFinalizationEnabled && isMediaAlbum) {
        const albumResult = await service.rpc('rpc_finalize_chat_media_album_v4', {
          p_sender_id: user.id,
          p_receiver_id: receiverId,
          p_client_message_id: clientMessageId,
          p_media_group_id: mediaGroupId,
          p_expected_count: expectedCount,
          p_attachments: validated,
          p_caption: input.caption || '',
          p_reply_to_message_id: input.replyToMessageId || null,
          p_request_payload: batchFinalizationPayload,
        })
        data = albumResult.data
        error = albumResult.error
      } else if (atomicFinalizationEnabled) {
        const atomicResult = await service.rpc(
          mediaKind ? 'rpc_finalize_chat_attachment_batch_v4' : 'rpc_finalize_chat_attachment_batch_v3',
          {
            ...batchRpcInput,
            ...(mediaKind ? { p_media_kind: mediaKind } : {}),
            p_request_payload: batchFinalizationPayload,
          },
        )
        data = atomicResult.data
        error = atomicResult.error
      }
      if (mediaKind && isMissingAtomicFinalizationRpc(error)) {
        return await failBatch(503, {
          error: 'chat_expression_presentation_unavailable',
          retryable: true,
        })
      }
      if ((!atomicFinalizationEnabled || isMissingAtomicFinalizationRpc(error)) && !isMediaAlbum) {
        const { error: keyError } = await service.rpc('rpc_claim_chat_attachment_finalization', {
          p_sender_id: user.id,
          p_client_message_id: clientMessageId,
          p_request_payload: batchFinalizationPayload,
        })
        if (keyError) return await failBatch(409, {
          error: keyError.message || 'attachment_idempotency_conflict', retryable: false,
        })
        const legacyResult = await service.rpc('rpc_finalize_chat_attachment_batch', batchRpcInput)
        data = legacyResult.data
        error = legacyResult.error
      }
      if (error) {
        const status = error.code === '42501' ? 403 : error.code === '22023' || error.code === '23514' ? 422 : 409
        const databaseMessage = String(error.message || '').trim()
        const safeDatabaseError = /^(attachment_|chat_media_|invalid_|messaging_|service_role_)/.test(databaseMessage)
          ? databaseMessage
          : classifyAttachmentConstraintError(error)
        console.log('[chat-attachment-finalize] batch-rpc-error', {
          code: error.code ?? null,
          message: databaseMessage,
        })
        return await failBatch(status, {
          error: error.code === '23514'
            ? safeDatabaseError || 'attachment_metadata_invalid'
            : error.message || 'attachment_finalize_rejected',
          databaseCode: error.code ?? null,
          retryable: false,
        })
      }
      const message = Array.isArray(data) ? data[0] : data
      const cleanupByBucket = new Map<string, string[]>()
      for (const source of sourceObjects) {
        cleanupByBucket.set(source.bucket, [
          ...(cleanupByBucket.get(source.bucket) || []),
          source.path,
        ])
      }
      await Promise.all([...cleanupByBucket].map(([sourceBucket, paths]) =>
        service.storage.from(sourceBucket).remove([...new Set(paths)]).catch(() => undefined)
      ))
      console.log('[chat-attachment-finalize] batch-success', {
        attachmentCount: validated.length,
        totalDurationMs: Math.round(performance.now() - requestStartedAt),
      })
      return json(200, {
        message,
        performance: { totalMs: Math.round(performance.now() - requestStartedAt) },
      })
    }

    const kind = String(input.attachmentType || '')
    const mime = String(input.mimeType || '').split(';')[0].trim().toLowerCase()
    let bucket = String(input.bucketId || '')
    let path = String(input.storagePath || '')
    const receiverId = String(input.receiverId || '')
    const clientMessageId = String(input.clientMessageId || '')
    const attachmentId = String(input.attachmentId || '')
    const isViewOnce = input.isViewOnce === true
    const attachmentIndex = Number.isInteger(input.attachmentIndex) ? Number(input.attachmentIndex) : 0
    const expectedCount = Number.isInteger(input.expectedCount) ? Number(input.expectedCount) : 1
    console.log('[chat-attachment-finalize] request', {
      kind,
      bucket,
      mime,
      isViewOnce,
      attachmentIndex,
      expectedCount,
      hasSenderPublicKey: Boolean(input.senderPublicKey),
    })
    if (!(kind in LIMITS) || !mime || !path || !receiverId || !clientMessageId || !attachmentId) {
      return json(400, { error: 'invalid_attachment_request' })
    }
    const expectedBucket = kind === 'audio' ? 'voice-messages' : 'chat-media'
    const expectedPrefix = `${user.id}/${receiverId}/${clientMessageId}/${attachmentId}-`
    if (!(kind === 'image'
      ? [expectedBucket, CHAT_ATTACHMENT_STAGING_BUCKET].includes(bucket)
      : bucket === expectedBucket) || !path.startsWith(expectedPrefix)) {
      return json(400, { error: 'invalid_attachment_identity' })
    }
    if (
      attachmentIndex < 0 || attachmentIndex > 9 ||
      expectedCount < 1 || expectedCount > 10 ||
      attachmentIndex >= expectedCount ||
      (expectedCount > 1 && (kind !== 'image' || isViewOnce))
    ) {
      return json(400, { error: 'invalid_album_position' })
    }
    if (expectedCount > 1) {
      return json(409, { error: 'album_requires_atomic_batch' })
    }

    const { data: signed, error: signedError } = await service.storage.from(bucket).createSignedUrl(path, 60)
    if (signedError || !signed?.signedUrl) {
      console.log('[chat-attachment-finalize] signed-url-error', {
        message: signedError?.message ?? 'attachment_object_not_found',
      })
      return json(404, { error: 'attachment_object_not_found' })
    }

    const sampleResponse = await fetch(signed.signedUrl, { headers: { Range: 'bytes=0-65535' } })
    if (!sampleResponse.ok) {
      console.log('[chat-attachment-finalize] sample-read-error', {
        status: sampleResponse.status,
      })
      return json(422, { error: 'attachment_unreadable' })
    }
    let contentLength = authoritativeResponseSize(sampleResponse)
    if (contentLength === null || contentLength <= 0 || contentLength > LIMITS[kind]) {
      console.log('[chat-attachment-finalize] size-invalid', {
        contentLength,
        limit: LIMITS[kind],
      })
      return json(413, { error: 'attachment_size_invalid' })
    }
    const sample = new Uint8Array(await sampleResponse.arrayBuffer())
    if (
      !validateSignature(kind, mime, sample, isViewOnce, String(input.originalName || '')) ||
      !signatureMatchesDeclaredMime(kind, mime, sample, isViewOnce)
    ) {
      console.log('[chat-attachment-finalize] signature-mismatch', {
        kind,
        mime,
        sampleBytes: sample.length,
      })
      await service.storage.from(bucket).remove([path])
      return json(415, { error: 'attachment_content_mismatch' })
    }

    let imageSafety = null
    let limitedMediaSafety = null
    let capturedImage: { bytes: Uint8Array; sha256: string } | null = null
    let capturedHoldPath: string | null = null
    let publishedFinalPath: string | null = null
    const sourceObject = { bucket, path }
    if (kind === 'image') {
      if (isViewOnce) {
        imageSafety = preModeratedImageSafety || {
            decision: 'REVIEW', categories: ['encrypted_media_uninspectable'], riskScore: 1,
            provider: 'server', model: 'content-safety-v1', providerRequestId: null,
            extractedText: null, scores: {}, failureReason: 'ENCRYPTED_IMAGE_UNINSPECTABLE',
          }
      } else {
        const priorReview = await priorImageReview(service, user.id, clientMessageId, attachmentId)
        if (priorReview?.status === 'PENDING_REVIEW') {
          return json(409, { error: 'image_review_required' })
        }
        if (priorReview?.status === 'REJECTED') {
          return json(422, { error: 'image_content_not_allowed' })
        }
        if (priorReview?.status === 'APPROVED') {
          try {
            const restored = await restoreApprovedChatImage({ service, review: priorReview, bucket, path, mime })
            contentLength = restored.byteSize
            capturedImage = restored
            imageSafety = { decision: 'ALLOW', categories: ['human_approved'], riskScore: 0,
              provider: 'human_review', model: 'admin', providerRequestId: null,
              extractedText: null, scores: {}, failureReason: null }
          } catch {
            return json(503, { error: 'approved_image_evidence_missing' })
          }
        } else {
          let hold
          try {
            hold = await holdChatImage({ service, bucket, path, userId: user.id,
              clientMessageId, attachmentId, mime })
          } catch {
            return json(503, { error: 'image_moderation_unavailable' })
          }
          const rateLimit = await consumeContentGuardRateLimit(service, user.id, 'chat_image')
          if (!rateLimit.available || !rateLimit.allowed) {
            await service.storage.from(hold.bucket).remove([hold.path])
            return !rateLimit.available
              ? json(503, { error: 'image_moderation_unavailable' })
              : json(429, { error: 'image_moderation_rate_limited',
                  retry_after_seconds: rateLimit.retryAfterSeconds })
          }
          const { data: hashMatch, error: hashError } = await service.rpc(
            'rpc_service_match_unsafe_media_hash', { p_sha256: hold.sha256 },
          )
          if (hashError || hashMatch?.authorized !== true) {
            await service.storage.from(hold.bucket).remove([hold.path])
            return json(503, { error: 'image_moderation_unavailable' })
          }
          imageSafety = hashMatch.matched === true
            ? { decision: 'BLOCK', categories: ['known_illegal_media'], riskScore: 1,
                provider: 'hash_blocklist', model: 'sha256-v1', providerRequestId: null,
                extractedText: null, scores: { known_illegal_media: 1 }, failureReason: null }
            : await assessChatImage(hold.signedUrl, hold.bytes, mime)
          capturedImage = { bytes: hold.bytes, sha256: hold.sha256 }
          capturedHoldPath = hold.path
          if (imageSafety.failureReason) {
            await service.storage.from(hold.bucket).remove([hold.path])
            return json(503, { error: 'image_moderation_unavailable', retryable: true })
          }
          if (imageSafety.decision !== 'ALLOW') {
            const recordError = await recordImageDecision({
              service, userId: user.id, receiverId, clientMessageId, attachmentId,
              bucket: hold.bucket, path: hold.path, caption: input.caption,
              sha256: hold.sha256, assessment: imageSafety,
            })
            if (recordError) {
              await service.storage.from(hold.bucket).remove([hold.path])
              return json(503, { error: 'content_moderation_record_failed' })
            }
          if (imageSafety.decision === 'BLOCK') {
            await service.storage.from(bucket).remove([path])
            if (!requiresChildSafetyEvidenceHold(imageSafety)) {
              await service.storage.from(hold.bucket).remove([hold.path])
            }
            }
            if (imageSafety.decision !== 'ALLOW') {
            return json(422, {
              error: imageSafety.decision === 'REVIEW'
                ? 'image_review_required'
                : 'image_content_not_allowed',
              categories: imageSafety.categories,
              retryable: false,
            })
            }
          }
          if (imageSafety.decision !== 'ALLOW') {
            await service.storage.from(hold.bucket).remove([hold.path])
          }
        }
      }
      if (imageSafety.decision !== 'ALLOW') {
        const recordError = await recordImageDecision({
          service, userId: user.id, receiverId, clientMessageId, attachmentId,
          bucket, path, caption: input.caption, sha256: input.sha256, assessment: imageSafety,
        })
        if (recordError) return json(503, { error: 'content_moderation_record_failed' })
        if (imageSafety.decision === 'BLOCK') await service.storage.from(bucket).remove([path])
        return json(imageSafety.failureReason ? 503 : 422, {
          error: imageSafety.failureReason === 'ENCRYPTED_IMAGE_UNINSPECTABLE'
            ? 'encrypted_image_moderation_unavailable'
            : imageSafety.failureReason
              ? 'image_moderation_unavailable'
              : imageSafety.decision === 'REVIEW'
                ? 'image_review_required'
                : 'image_content_not_allowed',
          categories: imageSafety.categories,
        })
      }
      if (!isViewOnce && capturedImage) {
        publishedFinalPath = await publishApprovedChatImage({
          service, bytes: capturedImage.bytes, userId: user.id, receiverId,
          clientMessageId, attachmentId, sha256: capturedImage.sha256, mime,
        })
        path = publishedFinalPath
        bucket = 'chat-media'
        contentLength = capturedImage.bytes.length
        input.sha256 = capturedImage.sha256
        if (capturedHoldPath) {
          await service.storage.from('moderation-quarantine').remove([capturedHoldPath])
        }
      }
    } else {
      let policy
      try {
        policy = await resolveLimitedMediaPolicy(service, mediaPolicyCache, kind)
      } catch {
        return json(503, { error: 'attachment_moderation_policy_unavailable' })
      }
      if (
        policy.enabled !== true || policy.enforcement_mode === 'ENFORCE' ||
        (hardenedContract && ['video', 'document'].includes(kind))
      ) {
        return json(422, { error: 'attachment_inspection_not_available', attachment_type: kind })
      }
      limitedMediaSafety = {
        decision: 'ALLOW_LIMITED_INSPECTION', coverage: 'limited_inspection',
        strategy: policy.inspection_strategy,
      }
    }

    const singleFinalizationPayload = {
      protocol: 'attachment-finalization-v2', mode: 'single', receiverId,
      clientMessageId, attachmentId, attachmentType: kind, bucketId: bucket,
      storagePath: path, originalName: input.originalName || null, mimeType: mime,
      byteSize: contentLength, width: positiveIntegerOrNull(input.width),
      height: positiveIntegerOrNull(input.height), durationMs: positiveIntegerOrNull(input.durationMs),
      caption: String(input.caption || ''), replyToMessageId: input.replyToMessageId || null,
      sha256: input.sha256 || null, isViewOnce,
      encryptedKeySender: input.encryptedKeySender || null,
      encryptedKeyReceiver: input.encryptedKeyReceiver || null,
      encryptedKeyNonce: input.encryptedKeyNonce || null,
      encryptedMediaNonce: input.encryptedMediaNonce || null,
      encryptedMediaAlg: input.encryptedMediaAlg || null,
      senderPublicKey: input.senderPublicKey || null,
      waveform: Array.isArray(input.waveform) ? input.waveform.slice(0, 240) : null,
    }
    const validationDetails = {
      ...buildValidationDetails({
        sampleBytes: sample.length,
        encrypted: isViewOnce,
        hasDimensions: positiveIntegerOrNull(input.width) !== null && positiveIntegerOrNull(input.height) !== null,
        hasDuration: positiveIntegerOrNull(input.durationMs) !== null,
      }),
      ...(imageSafety ? {
        content_moderation: {
          decision: imageSafety.decision,
          provider: imageSafety.provider,
          model: imageSafety.model,
          risk_score: imageSafety.riskScore,
          categories: imageSafety.categories,
        },
      } : limitedMediaSafety ? { content_moderation: limitedMediaSafety } : {}),
    }
    const rpcInput = attachmentIndex === 0 ? {
      p_sender_id: user.id,
      p_receiver_id: receiverId,
      p_client_message_id: clientMessageId,
      p_attachment_id: attachmentId,
      p_attachment_type: kind,
      p_bucket_id: bucket,
      p_storage_path: path,
      p_original_name: input.originalName || null,
      p_mime_type: mime,
      p_byte_size: contentLength,
      p_width: positiveIntegerOrNull(input.width),
      p_height: positiveIntegerOrNull(input.height),
      p_duration_ms: positiveIntegerOrNull(input.durationMs),
      p_caption: input.caption || '',
      p_reply_to_message_id: input.replyToMessageId || null,
      p_sha256: input.sha256 || null,
      p_validation_details: validationDetails,
      p_is_view_once: isViewOnce,
      p_encrypted_key_sender: input.encryptedKeySender || null,
      p_encrypted_key_receiver: input.encryptedKeyReceiver || null,
      p_encrypted_key_nonce: input.encryptedKeyNonce || null,
      p_encrypted_media_nonce: input.encryptedMediaNonce || null,
      p_encrypted_media_alg: input.encryptedMediaAlg || null,
      p_audio_waveform: Array.isArray(input.waveform) ? input.waveform : null,
      p_sender_public_key: input.senderPublicKey || null,
    } : {
      p_sender_id: user.id,
      p_receiver_id: receiverId,
      p_client_message_id: clientMessageId,
      p_attachment_id: attachmentId,
      p_attachment_index: attachmentIndex,
      p_expected_count: expectedCount,
      p_bucket_id: bucket,
      p_storage_path: path,
      p_original_name: input.originalName || null,
      p_mime_type: mime,
      p_byte_size: contentLength,
      p_width: positiveIntegerOrNull(input.width),
      p_height: positiveIntegerOrNull(input.height),
      p_sha256: input.sha256 || null,
      p_validation_details: validationDetails,
    }
    let data = null
    let error: RpcError | null = null
    if (attachmentIndex === 0 && atomicFinalizationEnabled) {
      const atomicResult = await service.rpc('rpc_finalize_chat_attachment_v3', {
          ...rpcInput,
          p_request_payload: singleFinalizationPayload,
        })
      data = atomicResult.data
      error = atomicResult.error
    } else if (attachmentIndex !== 0) {
      error = { code: '22023', message: 'album_requires_atomic_batch' }
    }
    if (
      attachmentIndex === 0 &&
      (!atomicFinalizationEnabled || isMissingAtomicFinalizationRpc(error))
    ) {
      const { error: keyError } = await service.rpc('rpc_claim_chat_attachment_finalization', {
        p_sender_id: user.id,
        p_client_message_id: clientMessageId,
        p_request_payload: singleFinalizationPayload,
      })
      if (keyError) return json(409, { error: keyError.message || 'attachment_idempotency_conflict' })
      const legacyResult = await service.rpc('rpc_finalize_chat_attachment', rpcInput)
      data = legacyResult.data
      error = legacyResult.error
    }
    if (error) {
      if (publishedFinalPath) {
        await removeApprovedChatImages(service, [publishedFinalPath])
      }
      console.log('[chat-attachment-finalize] rpc-error', {
        code: error.code ?? null,
        message: error.message || 'attachment_finalize_rejected',
      })
      // Preserve a valid upload across transient database/function failures so
      // the durable outbox can retry the same idempotency key and object path.
      // The retention worker removes genuinely orphaned uploads after 24h.
      const status = error.code === '42501' ? 403 : error.code === '22023' || error.code === '23514' ? 422 : 409
      return json(status, { error: error.message || 'attachment_finalize_rejected' })
    }
    const message = Array.isArray(data) ? data[0] : data
    if (publishedFinalPath) {
      await service.storage.from(sourceObject.bucket).remove([sourceObject.path]).catch(() => undefined)
    }
    if (preModerationReceiptId) {
      const { error: receiptUpdateError } = await service
        .from('view_once_moderation_receipts')
        .update({ finalized_at: new Date().toISOString() })
        .eq('id', preModerationReceiptId)
      if (receiptUpdateError) {
        console.error('[chat-attachment-finalize] receipt-finalize-error', {
          message: receiptUpdateError.message,
        })
      }
    }
    console.log('[chat-attachment-finalize] success', {
      isViewOnce,
      totalDurationMs: Math.round(performance.now() - requestStartedAt),
    })
    return json(200, {
      message,
      performance: { totalMs: Math.round(performance.now() - requestStartedAt) },
    })
  } catch (error) {
    console.error('chat attachment finalize failed', error)
    return json(500, { error: 'attachment_finalize_failed' })
  }
})
