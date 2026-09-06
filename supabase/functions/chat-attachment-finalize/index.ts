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
  moderateWithOpenAI,
} from '../_shared/content-safety.ts'

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

const assessChatImage = async (imageUrl: string) => {
  const [harm, solicitation] = await Promise.all([
    moderateWithOpenAI([{ type: 'image_url', image_url: { url: imageUrl } }]),
    classifyImageSolicitation(imageUrl, 'chat_image'),
  ])
  return mergeChatImageSafetyAssessments(harm, solicitation)
}

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
  const [harm, solicitation] = await Promise.all([
    moderateWithOpenAI(caption),
    classifyTextSolicitation(caption),
  ])
  return mergeContentSafetyAssessments(rules, harm, solicitation)
}

const enforceChatCaption = async ({ service, userId, receiverId, clientMessageId, caption }) => {
  const normalized = String(caption || '').trim()
  if (!normalized) return null
  const clientContentId = `${clientMessageId}:caption`
  const { data: prior } = await service.from('content_moderation_events')
    .select('status').eq('actor_user_id', userId).eq('content_type', 'chat_caption')
    .eq('client_content_id', clientContentId).maybeSingle()
  if (prior?.status === 'APPROVED') return null
  if (prior?.status === 'PENDING_REVIEW') return json(409, { error: 'caption_review_required' })
  if (prior?.status === 'REJECTED') return json(422, { error: 'caption_content_not_allowed' })
  const rateLimit = await consumeContentGuardRateLimit(service, userId, 'private_message')
  if (!rateLimit.available) return json(503, { error: 'caption_moderation_unavailable' })
  if (!rateLimit.allowed) return json(429, {
    error: 'caption_moderation_rate_limited', retry_after_seconds: rateLimit.retryAfterSeconds,
  })
  const assessment = await assessChatCaption(normalized)
  if (assessment.decision !== 'ALLOW' || assessment.failureReason) {
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
    if (error) return json(503, { error: 'content_moderation_record_failed' })
    if (assessment.decision !== 'ALLOW') {
      return json(assessment.failureReason ? 503 : 422, {
        error: assessment.failureReason ? 'caption_moderation_unavailable'
          : assessment.decision === 'REVIEW' ? 'caption_review_required'
            : 'caption_content_not_allowed',
        categories: assessment.categories,
      })
    }
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

const holdChatImage = async ({ service, bucket, path, userId, clientMessageId, attachmentId, mime }) => {
  const { data, error } = await service.storage.from(bucket).download(path)
  if (error || !data) throw new Error('image_hold_failed')
  const bytes = new Uint8Array(await data.arrayBuffer())
  if (bytes.byteLength === 0 || bytes.byteLength > LIMITS.image) throw new Error('image_hold_failed')
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
    sha256: await sha256Hex(bytes) }
}

const restoreApprovedChatImage = async ({ service, review, bucket, path, mime }) => {
  if (review?.storage_bucket !== 'moderation-quarantine' || !review?.storage_path) {
    throw new Error('approved_image_evidence_missing')
  }
  const { data, error } = await service.storage.from('moderation-quarantine')
    .download(review.storage_path)
  if (error || !data) throw new Error('approved_image_evidence_missing')
  const bytes = new Uint8Array(await data.arrayBuffer())
  const { error: uploadError } = await service.storage.from(bucket)
    .upload(path, bytes, { contentType: mime, upsert: true })
  if (uploadError) throw new Error('approved_image_restore_failed')
  return { sha256: await sha256Hex(bytes), byteSize: bytes.byteLength }
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
    let preModeratedImageSafety = null
    let preModerationReceiptId: string | null = null
    const atomicFinalizationEnabled =
      String(Deno.env.get('CHAT_ATTACHMENT_ATOMIC_FINALIZATION_ENABLED') || 'true').toLowerCase() !== 'false'

    if (['finalize_single', 'finalize_batch'].includes(mode)) {
      const captionResponse = await enforceChatCaption({
        service,
        userId: user.id,
        receiverId: String(input.receiverId || ''),
        clientMessageId: String(input.clientMessageId || ''),
        caption: input.caption,
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
          const assessment = await assessChatImage(inspectionUrl.signedUrl)
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
              sha256: await sha256Hex(plainBytes), assessment,
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
          const encryptedPath = `${user.id}/${receiverId}/${clientMessageId}/${attachmentId}-attachment-${receiptId}.enc`
          try {
            const { error: uploadError } = await service.storage.from('chat-media').upload(
              encryptedPath,
              encrypted.cipherBytes,
              { contentType: mime, upsert: false },
            )
            if (uploadError) return json(503, { error: 'view_once_encrypted_upload_failed' })
            const plaintextSha256 = await sha256Hex(plainBytes)
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
              await service.storage.from('chat-media').remove([encryptedPath])
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
      if (!receiverId || !clientMessageId || !attachmentId || bucket !== 'chat-media' || paths.length < 1) {
        return json(400, { error: 'invalid_cancel_item_request' })
      }
      const { error: cancellationError } = await service.rpc('rpc_cancel_chat_media_album_item', {
        p_sender_id: user.id,
        p_receiver_id: receiverId,
        p_client_message_id: clientMessageId,
        p_attachment_id: attachmentId,
      })
      if (cancellationError) {
        return json(409, { error: cancellationError.message || 'attachment_item_cancel_rejected' })
      }
      const { error: cleanupError } = await service.storage.from('chat-media').remove([...new Set(paths)])
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
        if (!attachmentId || !['chat-media', 'voice-messages'].includes(bucket) || candidates.length === 0) {
          return json(400, { error: 'invalid_cancel_attachment' })
        }
        for (const candidate of candidates) {
          const targetBucket = candidate.endsWith('-preview.jpg') ? 'chat-media' : bucket
          paths.set(targetBucket, [...(paths.get(targetBucket) || []), candidate])
        }
      }
      const { error: cancellationError } = await service.rpc('rpc_cancel_chat_attachment_batch', {
        p_sender_id: user.id,
        p_receiver_id: receiverId,
        p_client_message_id: clientMessageId,
        p_attachments: attachments,
      })
      if (cancellationError) {
        console.log('[chat-attachment-finalize] cancellation-rpc-error', {
          clientMessageId,
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
        userId: user.id,
        receiverId,
        clientMessageId,
        objectCount: [...paths.values()].reduce((sum, values) => sum + values.length, 0),
      })
      return json(200, { cancelled: true })
    }

    if (mode === 'finalize_batch') {
      const receiverId = String(input.receiverId || '')
      const clientMessageId = String(input.clientMessageId || '')
      const kind = String(input.attachmentType || '')
      const mediaGroupId = String(input.mediaGroupId || '')
      const attachments = Array.isArray(input.attachments) ? input.attachments : []
      const expectedCount = Number(input.expectedCount || attachments.length)
      const isMediaAlbum = expectedCount > 1 && Boolean(mediaGroupId)
      if (
        !receiverId || !clientMessageId || !['image', 'video', 'document', 'audio'].includes(kind) ||
        expectedCount !== attachments.length || expectedCount < 1 || expectedCount > 10 ||
        (expectedCount > 1 && !isMediaAlbum)
      ) {
        return json(400, { error: 'invalid_attachment_batch' })
      }

      const validated: Record<string, unknown>[] = []
      for (let index = 0; index < attachments.length; index += 1) {
        const raw = attachments[index] || {}
        const attachmentId = String(raw.attachmentId || '')
        const itemKind = String(raw.attachmentType || kind)
        const bucket = String(raw.bucketId || '')
        const path = String(raw.storagePath || '')
        const mime = String(raw.mimeType || '').split(';')[0].trim().toLowerCase()
        const expectedPrefix = `${user.id}/${receiverId}/${clientMessageId}/${attachmentId}-`
        if (
          Number(raw.attachmentIndex) !== index ||
          !['image', 'video', 'document', 'audio'].includes(itemKind) ||
          (isMediaAlbum && !['image', 'video'].includes(itemKind)) ||
          (!isMediaAlbum && itemKind !== kind) ||
          bucket !== (itemKind === 'audio' ? 'voice-messages' : 'chat-media') ||
          !path.startsWith(expectedPrefix) || !mime
        ) {
          return json(400, { error: 'invalid_attachment_batch_item' })
        }

        const { data: signed, error: signedError } = await service.storage.from(bucket).createSignedUrl(path, 60)
        if (signedError || !signed?.signedUrl) return json(404, { error: 'attachment_object_not_found' })
        const sampleResponse = await fetch(signed.signedUrl, { headers: { Range: 'bytes=0-65535' } })
        if (!sampleResponse.ok) return json(422, { error: 'attachment_unreadable' })
        let contentLength = authoritativeResponseSize(sampleResponse)
        const sample = new Uint8Array(await sampleResponse.arrayBuffer())
        if (
          contentLength === null || contentLength <= 0 || contentLength > LIMITS[itemKind] ||
          !validateSignature(itemKind, mime, sample, false, String(raw.originalName || '')) ||
          !signatureMatchesDeclaredMime(itemKind, mime, sample, false)
        ) {
          return json(415, { error: 'attachment_content_mismatch' })
        }

        let imageSafety = null
        let limitedMediaSafety = null
        if (itemKind === 'image') {
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
            imageSafety = await assessChatImage(hold.signedUrl)
            if (imageSafety.decision !== 'ALLOW' || imageSafety.failureReason) {
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
                const rejectedPaths = [path, String(raw.previewStoragePath || '')]
                  .filter((value) => value.startsWith(expectedPrefix))
                await service.storage.from(bucket).remove(rejectedPaths)
                await service.storage.from(hold.bucket).remove([hold.path])
              }
              if (imageSafety.decision !== 'ALLOW') {
                return json(imageSafety.failureReason ? 503 : 422, {
                  error: imageSafety.failureReason
                    ? 'image_moderation_unavailable'
                    : imageSafety.decision === 'REVIEW'
                      ? 'image_review_required'
                      : 'image_content_not_allowed',
                  categories: imageSafety.categories,
                })
              }
            }
            await service.storage.from(hold.bucket).remove([hold.path])
          }
        } else {
          let policy
          try {
            policy = await resolveLimitedMediaPolicy(service, mediaPolicyCache, itemKind)
          } catch {
            return json(503, { error: 'attachment_moderation_policy_unavailable' })
          }
          if (policy.enabled !== true || policy.enforcement_mode === 'ENFORCE') {
            return json(422, { error: 'attachment_inspection_not_available', attachment_type: itemKind })
          }
          limitedMediaSafety = {
            decision: 'ALLOW_LIMITED_INSPECTION',
            coverage: 'limited_inspection',
            strategy: policy.inspection_strategy,
          }
        }

        const previewPath = String(raw.previewStoragePath || '')
        let previewLength: number | null = null
        const previewDimensions = normalizePreviewDimensions(raw.previewWidth, raw.previewHeight)
        if (itemKind === 'image' || itemKind === 'video') {
          if (!previewPath.startsWith(expectedPrefix) || String(raw.previewMimeType || '') !== 'image/jpeg') {
            return json(422, { error: 'attachment_preview_required' })
          }
          const { data: previewSigned, error: previewSignedError } =
            await service.storage.from('chat-media').createSignedUrl(previewPath, 60)
          if (previewSignedError || !previewSigned?.signedUrl) {
            return json(404, { error: 'attachment_preview_not_found' })
          }
          const previewResponse = await fetch(previewSigned.signedUrl, { headers: { Range: 'bytes=0-1048576' } })
          const previewBytes = new Uint8Array(await previewResponse.arrayBuffer())
          previewLength = authoritativeResponseSize(previewResponse)
          if (
            !previewResponse.ok || previewLength === null || previewLength <= 0 || previewLength > 1048576 ||
            !validateSignature('image', 'image/jpeg', previewBytes, false)
          ) {
            return json(415, { error: 'attachment_preview_invalid' })
          }
        }

        validated.push({
          attachmentId,
          attachmentIndex: index,
          attachmentType: itemKind,
          bucketId: bucket,
          storagePath: path,
          originalName: raw.originalName || null,
          mimeType: mime,
          byteSize: contentLength,
          width: positiveIntegerOrNull(raw.width),
          height: positiveIntegerOrNull(raw.height),
          durationMs: positiveIntegerOrNull(raw.durationMs),
          sha256: raw.sha256 || null,
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
        const atomicResult = await service.rpc('rpc_finalize_chat_attachment_batch_v3', {
          ...batchRpcInput,
          p_request_payload: batchFinalizationPayload,
        })
        data = atomicResult.data
        error = atomicResult.error
      }
      if ((!atomicFinalizationEnabled || isMissingAtomicFinalizationRpc(error)) && !isMediaAlbum) {
        const { error: keyError } = await service.rpc('rpc_claim_chat_attachment_finalization', {
          p_sender_id: user.id,
          p_client_message_id: clientMessageId,
          p_request_payload: batchFinalizationPayload,
        })
        if (keyError) return json(409, { error: keyError.message || 'attachment_idempotency_conflict' })
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
          clientMessageId,
          code: error.code ?? null,
          message: databaseMessage,
        })
        return json(status, {
          error: error.code === '23514'
            ? safeDatabaseError || 'attachment_metadata_invalid'
            : error.message || 'attachment_finalize_rejected',
          databaseCode: error.code ?? null,
        })
      }
      const message = Array.isArray(data) ? data[0] : data
      console.log('[chat-attachment-finalize] batch-success', {
        clientMessageId,
        messageId: message?.id ?? null,
        attachmentCount: validated.length,
      })
      return json(200, { message })
    }

    const kind = String(input.attachmentType || '')
    const mime = String(input.mimeType || '').split(';')[0].trim().toLowerCase()
    const bucket = String(input.bucketId || '')
    const path = String(input.storagePath || '')
    const receiverId = String(input.receiverId || '')
    const clientMessageId = String(input.clientMessageId || '')
    const attachmentId = String(input.attachmentId || '')
    const isViewOnce = input.isViewOnce === true
    const attachmentIndex = Number.isInteger(input.attachmentIndex) ? Number(input.attachmentIndex) : 0
    const expectedCount = Number.isInteger(input.expectedCount) ? Number(input.expectedCount) : 1
    console.log('[chat-attachment-finalize] request', {
      userId: user.id,
      receiverId,
      clientMessageId,
      attachmentId,
      kind,
      bucket,
      path,
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
    if (bucket !== expectedBucket || !path.startsWith(expectedPrefix)) {
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
        attachmentId,
        clientMessageId,
        message: signedError?.message ?? 'attachment_object_not_found',
      })
      return json(404, { error: 'attachment_object_not_found' })
    }

    const sampleResponse = await fetch(signed.signedUrl, { headers: { Range: 'bytes=0-65535' } })
    if (!sampleResponse.ok) {
      console.log('[chat-attachment-finalize] sample-read-error', {
        attachmentId,
        clientMessageId,
        status: sampleResponse.status,
      })
      return json(422, { error: 'attachment_unreadable' })
    }
    let contentLength = authoritativeResponseSize(sampleResponse)
    if (contentLength === null || contentLength <= 0 || contentLength > LIMITS[kind]) {
      console.log('[chat-attachment-finalize] size-invalid', {
        attachmentId,
        clientMessageId,
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
        attachmentId,
        clientMessageId,
        kind,
        mime,
        sampleBytes: sample.length,
      })
      await service.storage.from(bucket).remove([path])
      return json(415, { error: 'attachment_content_mismatch' })
    }

    let imageSafety = null
    let limitedMediaSafety = null
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
          imageSafety = await assessChatImage(hold.signedUrl)
          if (imageSafety.decision !== 'ALLOW' || imageSafety.failureReason) {
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
              await service.storage.from(hold.bucket).remove([hold.path])
            }
            if (imageSafety.decision !== 'ALLOW') {
              return json(imageSafety.failureReason ? 503 : 422, {
                error: imageSafety.failureReason
                  ? 'image_moderation_unavailable'
                  : imageSafety.decision === 'REVIEW'
                    ? 'image_review_required'
                    : 'image_content_not_allowed',
                categories: imageSafety.categories,
              })
            }
          }
          await service.storage.from(hold.bucket).remove([hold.path])
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
    } else {
      let policy
      try {
        policy = await resolveLimitedMediaPolicy(service, mediaPolicyCache, kind)
      } catch {
        return json(503, { error: 'attachment_moderation_policy_unavailable' })
      }
      if (policy.enabled !== true || policy.enforcement_mode === 'ENFORCE') {
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
      console.log('[chat-attachment-finalize] rpc-error', {
        attachmentId,
        clientMessageId,
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
    if (preModerationReceiptId) {
      const { error: receiptUpdateError } = await service
        .from('view_once_moderation_receipts')
        .update({ finalized_at: new Date().toISOString() })
        .eq('id', preModerationReceiptId)
      if (receiptUpdateError) {
        console.error('[chat-attachment-finalize] receipt-finalize-error', {
          receiptId: preModerationReceiptId,
          message: receiptUpdateError.message,
        })
      }
    }
    console.log('[chat-attachment-finalize] success', {
      attachmentId,
      clientMessageId,
      messageId: message?.id ?? null,
      isViewOnce,
    })
    return json(200, { message })
  } catch (error) {
    console.error('chat attachment finalize failed', error)
    return json(500, { error: 'attachment_finalize_failed' })
  }
})
