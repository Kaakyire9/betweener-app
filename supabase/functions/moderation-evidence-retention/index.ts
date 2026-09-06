// @ts-nocheck
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.110.7'

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json' },
})

serve(async (request) => {
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)
  const expected = (Deno.env.get('MODERATION_RETENTION_SECRET') || '').trim()
  if (!expected) return json({ error: 'retention_worker_not_configured' }, 503)
  if ((request.headers.get('x-cron-secret') || '').trim() !== expected) {
    return json({ error: 'unauthorized' }, 401)
  }
  const url = Deno.env.get('SUPABASE_URL') || ''
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
  if (!url || !serviceKey) return json({ error: 'missing_service_configuration' }, 500)
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } })
  const input = await request.json().catch(() => ({}))
  const execute = input?.execute === true
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const { data: events, error } = await admin.from('content_moderation_events')
    .select('id,storage_bucket,storage_path').neq('status', 'PENDING_REVIEW')
    .is('evidence_redacted_at', null)
    .lt('created_at', cutoff).order('created_at').limit(100)
  if (error) return json({ error: 'retention_read_failed' }, 500)

  const { data: profileRows, error: profileError } = await admin
    .from('profile_moderation_events').select('id').not('resolved_at', 'is', null)
    .is('evidence_redacted_at', null).lt('created_at', cutoff).order('created_at').limit(100)
  if (profileError) return json({ error: 'retention_read_failed' }, 500)
  if (!execute) return json({ dry_run: true, cutoff,
    content_candidates: events?.length || 0,
    content_objects: (events || []).filter((event) => event.storage_bucket && event.storage_path).length,
    profile_candidates: profileRows?.length || 0 })

  let redacted = 0
  let failed = 0
  for (const event of events || []) {
    if (event.storage_bucket && event.storage_path) {
      const { error: storageError } = await admin.storage
        .from(event.storage_bucket).remove([event.storage_path])
      if (storageError) { failed += 1; continue }
    }
    const { error: updateError } = await admin.from('content_moderation_events').update({
      storage_bucket: null, storage_path: null, extracted_text: null,
      evidence_snapshot: { retention_redacted: true },
      evidence_redacted_at: new Date().toISOString(),
    }).eq('id', event.id).neq('status', 'PENDING_REVIEW')
    if (updateError) failed += 1
    else redacted += 1
  }

  if (profileRows?.length) {
    await admin.from('profile_moderation_events')
      .update({ evidence_snapshot: { retention_redacted: true },
        evidence_redacted_at: new Date().toISOString() })
      .in('id', profileRows.map((row) => row.id))
  }
  return json({ dry_run: false, processed: (events || []).length, redacted, failed,
    profile_redacted: profileRows?.length || 0 })
})
