// @ts-nocheck
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.110.7'
import { corsHeaders } from '../_shared/cors.ts'

const json = (status: number, body: Record<string, unknown>) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, 'Content-Type': 'application/json' },
})

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
    const { messageId, mode: rawMode } = await req.json()
    const mode = rawMode === 'prepare' || rawMode === 'consume' ? 'consume' : rawMode
    if (!messageId) return json(400, { error: 'message_id_required' })
    console.log('[chat-attachment-consume] request', {
      userId: user.id,
      messageId,
      mode,
    })
    const service = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })

    if (mode !== 'consume') return json(400, { error: 'invalid_consume_mode' })

    // The database writes the unique view receipt before a signed URL is
    // released. This intentionally fails closed if the response is lost.
    const { data, error } = await authClient.rpc('rpc_claim_view_once_attachment', { p_message_id: messageId })
    if (error) {
      console.log('[chat-attachment-consume] prepare-rpc-error', {
        userId: user.id,
        messageId,
        code: error.code ?? null,
        message: error.message || 'view_once_unavailable',
      })
      return json(409, { error: error.message || 'view_once_unavailable' })
    }
    const row = Array.isArray(data) ? data[0] : data
    if (!row?.attachment_id || !row?.bucket_id || !row?.storage_path) {
      console.log('[chat-attachment-consume] prepare-rpc-empty', {
        userId: user.id,
        messageId,
      })
      return json(404, { error: 'view_once_unavailable' })
    }

    const { data: signed, error: signedError } = await service.storage
      .from(row.bucket_id)
      .createSignedUrl(row.storage_path, 30)
    if (signedError || !signed?.signedUrl) {
      console.log('[chat-attachment-consume] signed-url-error', {
        userId: user.id,
        messageId,
        attachmentId: row.attachment_id,
        message: signedError?.message ?? 'view_once_object_unavailable',
      })
      return json(410, { error: 'view_once_object_unavailable' })
    }

    console.log('[chat-attachment-consume] prepare-success', {
      userId: user.id,
      messageId,
      attachmentId: row.attachment_id,
      hasSenderPublicKey: Boolean(row.sender_public_key),
      mimeType: row.mime_type,
      byteSize: row.byte_size,
    })
    return json(200, {
      attachmentId: row.attachment_id,
      signedUrl: signed.signedUrl,
      attachmentType: row.attachment_type,
      mimeType: row.mime_type,
      byteSize: row.byte_size,
      encryptedKeyReceiver: row.encrypted_key_receiver,
      encryptedKeyNonce: row.encrypted_key_nonce,
      encryptedMediaNonce: row.encrypted_media_nonce,
      encryptedMediaAlg: row.encrypted_media_alg,
      senderPublicKey: row.sender_public_key,
    })
  } catch (error) {
    console.error('chat attachment consume failed', error)
    return json(500, { error: 'view_once_consume_failed' })
  }
})
