// @ts-nocheck
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from '@supabase/supabase-js'
import { getSupabaseAdminKey } from '../_shared/supabase-admin-key.ts'

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json' },
})

serve(async (request) => {
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)
  const expectedSecret = (Deno.env.get('CIRCLE_MEDIA_LIFECYCLE_SECRET') || '').trim()
  if (!expectedSecret) return json({ error: 'worker_not_configured' }, 503)
  if ((request.headers.get('x-cron-secret') || '').trim() !== expectedSecret) {
    return json({ error: 'unauthorized' }, 401)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
  const serviceKey = getSupabaseAdminKey()
  if (!supabaseUrl || !serviceKey) return json({ error: 'server_configuration_incomplete' }, 500)
  const service = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: run, error: runError } = await service
    .from('circle_media_lifecycle_runs')
    .insert({ status: 'running' })
    .select('id')
    .single()
  if (runError || !run?.id) return json({ error: 'lifecycle_observability_unavailable' }, 500)

  try {
    const { data: scheduled, error: scheduleError } = await service.rpc(
      'rpc_service_schedule_circle_media_cleanup',
      { p_limit: 500 },
    )
    if (scheduleError) throw scheduleError

    const { data: rows, error: claimError } = await service.rpc(
      'rpc_service_claim_circle_media_cleanup',
      { p_limit: 100 },
    )
    if (claimError) throw claimError

    let deleted = 0
    let failed = 0
    for (const row of rows || []) {
      const { error: removeError } = await service.storage
        .from(String(row.bucket_id))
        .remove([String(row.object_path)])
      if (removeError) {
        failed += 1
        await service.rpc('rpc_service_fail_circle_media_cleanup', {
          p_queue_id: row.queue_id,
          p_error: String(removeError.message || 'delete_failed'),
        })
        continue
      }
      const { error: completeError } = await service.rpc(
        'rpc_service_complete_circle_media_cleanup',
        { p_queue_id: row.queue_id },
      )
      if (completeError) throw completeError
      deleted += 1
    }

    const now = new Date().toISOString()
    await service.from('circle_media_lifecycle_runs').update({
      status: 'succeeded',
      scheduled_count: Number(scheduled || 0),
      claimed_count: (rows || []).length,
      deleted_count: deleted,
      failed_count: failed,
      completed_at: now,
    }).eq('id', run.id)

    return json({ scheduled: Number(scheduled || 0), claimed: (rows || []).length, deleted, failed })
  } catch (error) {
    await service.from('circle_media_lifecycle_runs').update({
      status: 'failed',
      completed_at: new Date().toISOString(),
      error: String((error as { message?: unknown } | null)?.message || 'lifecycle_worker_failed').slice(0, 500),
    }).eq('id', run.id)
    return json({ error: 'lifecycle_worker_failed' }, 500)
  }
})
