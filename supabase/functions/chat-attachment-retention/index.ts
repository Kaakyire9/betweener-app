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
  const { data: run, error: runError } = await service
    .from('chat_attachment_retention_runs')
    .insert({ status: 'running' })
    .select('id')
    .single()
  if (runError || !run?.id) return json({ error: 'retention_observability_unavailable' }, 500)
  const failRun = async (error: unknown) => {
    await service.from('chat_attachment_retention_runs').update({
      status: 'failed',
      completed_at: new Date().toISOString(),
      error: String((error as { message?: unknown } | null)?.message || error || 'retention_worker_failed').slice(0, 500),
    }).eq('id', run.id)
  }
  try {
    const { data: scheduledData, error: scheduleError } = await service.rpc('rpc_schedule_orphaned_chat_attachments', { p_limit: 250 })
    if (scheduleError) throw scheduleError
    const { data: rows, error } = await service.rpc('rpc_claim_chat_attachment_cleanup', { p_limit: 100 })
    if (error) throw error
    let deleted = 0
    let failed = 0
    let deadLetter = 0
    for (const row of rows || []) {
      const { error: removeError } = await service.storage.from(row.bucket_id).remove([row.storage_path])
      if (removeError) {
        failed += 1
        const { data: failureStatus } = await service.rpc('rpc_fail_chat_attachment_cleanup', {
          p_queue_id: row.queue_id,
          p_error: String(removeError.message || 'delete_failed'),
        })
        if (failureStatus === 'dead_letter') deadLetter += 1
        continue
      }
      deleted += 1
      const now = new Date().toISOString()
      const { error: queueUpdateError } = await service.from('chat_attachment_cleanup_queue').update({
        status: 'deleted', deleted_at: now, processing_started_at: null, last_error: null, updated_at: now,
      }).eq('id', row.queue_id)
      if (queueUpdateError) throw queueUpdateError
      if (row.attachment_id) {
        const { error: attachmentUpdateError } = await service.from('message_attachments').update({
          lifecycle_status: row.reason === 'view_once_consumed' ? 'expired' : 'deleted', deleted_at: now, updated_at: now,
        }).eq('id', row.attachment_id)
        if (attachmentUpdateError) throw attachmentUpdateError
      }
    }
    const { error: runUpdateError } = await service.from('chat_attachment_retention_runs').update({
      status: 'succeeded', completed_at: new Date().toISOString(),
      scheduled_count: Number(scheduledData || 0), claimed_count: (rows || []).length,
      deleted_count: deleted, failed_count: failed, dead_letter_count: deadLetter,
    }).eq('id', run.id)
    if (runUpdateError) throw runUpdateError
    return json({ processed: (rows || []).length, deleted, failed, deadLetter })
  } catch (error) {
    await failRun(error)
    return json({ error: 'retention_worker_failed' }, 500)
  }
})
