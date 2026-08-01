// @ts-nocheck
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.110.7'
import { corsHeaders } from '../_shared/cors.ts'

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

const startsWith = (bytes: Uint8Array, signature: number[]) =>
  signature.every((value, index) => bytes[index] === value)

const hasAscii = (bytes: Uint8Array, value: string, offset = 0) =>
  value.split('').every((character, index) => bytes[offset + index] === character.charCodeAt(0))

const positiveIntegerOrNull = (value: unknown) => {
  const numeric = Number(value)
  if (!Number.isFinite(numeric) || numeric <= 0) return null
  return Math.round(numeric)
}

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

    const input = await req.json()
    const service = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
    const mode = String(input.mode || 'finalize_single')

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
      const attachments = Array.isArray(input.attachments) ? input.attachments : []
      const expectedCount = Number(input.expectedCount || attachments.length)
      if (
        !receiverId || !clientMessageId || !['image', 'video', 'document', 'audio'].includes(kind) ||
        expectedCount !== attachments.length || expectedCount < 1 || expectedCount > 10 ||
        (expectedCount > 1 && kind !== 'image')
      ) {
        return json(400, { error: 'invalid_attachment_batch' })
      }

      const validated: Record<string, unknown>[] = []
      for (let index = 0; index < attachments.length; index += 1) {
        const raw = attachments[index] || {}
        const attachmentId = String(raw.attachmentId || '')
        const bucket = String(raw.bucketId || '')
        const path = String(raw.storagePath || '')
        const mime = String(raw.mimeType || '').split(';')[0].trim().toLowerCase()
        const expectedPrefix = `${user.id}/${receiverId}/${clientMessageId}/${attachmentId}-`
        if (
          Number(raw.attachmentIndex) !== index || String(raw.attachmentType || '') !== kind ||
          bucket !== (kind === 'audio' ? 'voice-messages' : 'chat-media') ||
          !path.startsWith(expectedPrefix) || !mime
        ) {
          return json(400, { error: 'invalid_attachment_batch_item' })
        }

        const { data: signed, error: signedError } = await service.storage.from(bucket).createSignedUrl(path, 60)
        if (signedError || !signed?.signedUrl) return json(404, { error: 'attachment_object_not_found' })
        const sampleResponse = await fetch(signed.signedUrl, { headers: { Range: 'bytes=0-65535' } })
        if (!sampleResponse.ok) return json(422, { error: 'attachment_unreadable' })
        const contentRange = sampleResponse.headers.get('content-range') || ''
        const contentLength = Number(contentRange.split('/').pop() || sampleResponse.headers.get('content-length') || raw.byteSize || 0)
        const sample = new Uint8Array(await sampleResponse.arrayBuffer())
        if (
          !Number.isFinite(contentLength) || contentLength <= 0 || contentLength > LIMITS[kind] ||
          !validateSignature(kind, mime, sample, false, String(raw.originalName || ''))
        ) {
          return json(415, { error: 'attachment_content_mismatch' })
        }

        const previewPath = String(raw.previewStoragePath || '')
        let previewLength: number | null = null
        if (kind === 'image' || kind === 'video') {
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
          previewLength = Number(
            (previewResponse.headers.get('content-range') || '').split('/').pop() ||
            previewResponse.headers.get('content-length') || raw.previewByteSize || 0,
          )
          if (
            !previewResponse.ok || previewLength <= 0 || previewLength > 1048576 ||
            !validateSignature('image', 'image/jpeg', previewBytes, false)
          ) {
            return json(415, { error: 'attachment_preview_invalid' })
          }
        }

        validated.push({
          attachmentId,
          attachmentIndex: index,
          attachmentType: kind,
          bucketId: bucket,
          storagePath: path,
          originalName: raw.originalName || null,
          mimeType: mime,
          byteSize: contentLength,
          width: positiveIntegerOrNull(raw.width),
          height: positiveIntegerOrNull(raw.height),
          durationMs: positiveIntegerOrNull(raw.durationMs),
          sha256: raw.sha256 || null,
          validationDetails: { validator: 'signature-v2', sampled_bytes: sample.length },
          ...(previewPath ? {
            previewStoragePath: previewPath,
            previewMimeType: 'image/jpeg',
            previewByteSize: previewLength,
            previewWidth: positiveIntegerOrNull(raw.previewWidth),
            previewHeight: positiveIntegerOrNull(raw.previewHeight),
          } : {}),
          waveform: kind === 'audio' && Array.isArray(raw.waveform) ? raw.waveform.slice(0, 240) : null,
        })
      }

      const batchFinalizationPayload = {
        protocol: 'attachment-finalization-v2', mode: 'batch', receiverId,
        clientMessageId, attachmentType: kind, expectedCount,
        caption: String(input.caption || ''),
        replyToMessageId: input.replyToMessageId || null,
        attachments: validated,
      }
      const { error: keyError } = await service.rpc('rpc_claim_chat_attachment_finalization', {
        p_sender_id: user.id,
        p_client_message_id: clientMessageId,
        p_request_payload: batchFinalizationPayload,
      })
      if (keyError) return json(409, { error: keyError.message || 'attachment_idempotency_conflict' })

      const { data, error } = await service.rpc('rpc_finalize_chat_attachment_batch', {
        p_sender_id: user.id,
        p_receiver_id: receiverId,
        p_client_message_id: clientMessageId,
        p_attachment_type: kind,
        p_expected_count: expectedCount,
        p_attachments: validated,
        p_caption: input.caption || '',
        p_reply_to_message_id: input.replyToMessageId || null,
      })
      if (error) {
        const status = error.code === '42501' ? 403 : error.code === '22023' || error.code === '23514' ? 422 : 409
        console.log('[chat-attachment-finalize] batch-rpc-error', {
          clientMessageId,
          code: error.code ?? null,
          message: error.message,
        })
        return json(status, {
          error: error.code === '23514'
            ? 'attachment_metadata_invalid'
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
    const contentRange = sampleResponse.headers.get('content-range') || ''
    const contentLength = Number(contentRange.split('/').pop() || sampleResponse.headers.get('content-length') || input.byteSize || 0)
    if (!Number.isFinite(contentLength) || contentLength <= 0 || contentLength > LIMITS[kind]) {
      console.log('[chat-attachment-finalize] size-invalid', {
        attachmentId,
        clientMessageId,
        contentLength,
        limit: LIMITS[kind],
      })
      return json(413, { error: 'attachment_size_invalid' })
    }
    const sample = new Uint8Array(await sampleResponse.arrayBuffer())
    if (!validateSignature(kind, mime, sample, isViewOnce, String(input.originalName || ''))) {
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
    const { error: keyError } = await service.rpc('rpc_claim_chat_attachment_finalization', {
      p_sender_id: user.id,
      p_client_message_id: clientMessageId,
      p_request_payload: singleFinalizationPayload,
    })
    if (keyError) return json(409, { error: keyError.message || 'attachment_idempotency_conflict' })

    const rpcName = attachmentIndex === 0
      ? 'rpc_finalize_chat_attachment'
      : 'rpc_append_chat_album_attachment'
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
      p_validation_details: { validator: 'signature-v1', sampled_bytes: sample.length },
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
      p_validation_details: { validator: 'signature-v1', sampled_bytes: sample.length },
    }
    const { data, error } = await service.rpc(rpcName, rpcInput)
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
