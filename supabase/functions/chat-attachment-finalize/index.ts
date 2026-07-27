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
      hasAscii(bytes, 'ftyp', 4) || startsWith(bytes, [0xff, 0xf1]) || startsWith(bytes, [0xff, 0xf9])
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

    const service = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
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
