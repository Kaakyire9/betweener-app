// @ts-nocheck
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json' },
})

serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  const expectedSecret = (Deno.env.get('VERIFICATION_RETENTION_SECRET') || '').trim()
  const providedSecret = (req.headers.get('x-cron-secret') || '').trim()
  if (!expectedSecret) return json({ error: 'retention_worker_not_configured' }, 503)
  if (providedSecret !== expectedSecret) return json({ error: 'unauthorized' }, 401)

  const url = Deno.env.get('SUPABASE_URL') || ''
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
  if (!url || !serviceKey) return json({ error: 'missing_service_configuration' }, 500)

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: rows, error: selectError } = await admin
    .rpc('rpc_claim_verification_evidence_retention', { p_limit: 50 })

  if (selectError) return json({ error: 'queue_read_failed' }, 500)

  let deleted = 0
  let failed = 0
  for (const row of rows || []) {
    const { error: storageError } = await admin.storage
      .from(row.bucket_id)
      .remove([row.object_path])

    if (storageError) {
      failed += 1
      await admin.from('verification_evidence_retention').update({
        status: 'failed',
        processing_started_at: null,
        last_error: String(storageError.message || 'storage_delete_failed').slice(0, 500),
      }).eq('request_id', row.request_id)
      continue
    }

    deleted += 1
    await admin.from('verification_evidence_retention').update({
      status: 'deleted',
      deleted_at: new Date().toISOString(),
      processing_started_at: null,
      last_error: null,
    }).eq('request_id', row.request_id)
  }

  return json({ processed: (rows || []).length, deleted, failed })
})
