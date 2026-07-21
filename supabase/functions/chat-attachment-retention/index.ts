// @ts-nocheck
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.110.7'

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json' },
})

serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)
  const expected = (Deno.env.get('CHAT_ATTACHMENT_RETENTION_SECRET') || '').trim()
  if (!expected) return json({ error: 'worker_not_configured' }, 503)
  if ((req.headers.get('x-cron-secret') || '').trim() !== expected) return json({ error: 'unauthorized' }, 401)
  const url = Deno.env.get('SUPABASE_URL') || ''
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
  if (!url || !serviceKey) return json({ error: 'server_configuration_incomplete' }, 500)
  const service = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
  await service.rpc('rpc_schedule_orphaned_chat_attachments', { p_limit: 250 })
  const { data: rows, error } = await service.rpc('rpc_claim_chat_attachment_cleanup', { p_limit: 100 })
  if (error) return json({ error: 'queue_claim_failed' }, 500)
  let deleted = 0
  let failed = 0
  for (const row of rows || []) {
    const { error: removeError } = await service.storage.from(row.bucket_id).remove([row.storage_path])
    if (removeError) {
      failed += 1
      await service.from('chat_attachment_cleanup_queue').update({
        status: 'failed', processing_started_at: null,
        last_error: String(removeError.message || 'delete_failed').slice(0, 500),
        updated_at: new Date().toISOString(),
      }).eq('id', row.queue_id)
      continue
    }
    deleted += 1
    const now = new Date().toISOString()
    await service.from('chat_attachment_cleanup_queue').update({
      status: 'deleted', deleted_at: now, processing_started_at: null, last_error: null, updated_at: now,
    }).eq('id', row.queue_id)
    if (row.attachment_id) {
      await service.from('message_attachments').update({
        lifecycle_status: row.reason === 'view_once_consumed' ? 'expired' : 'deleted', deleted_at: now, updated_at: now,
      }).eq('id', row.attachment_id)
    }
  }
  return json({ processed: (rows || []).length, deleted, failed })
})
