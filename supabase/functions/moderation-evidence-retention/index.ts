// @ts-nocheck
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.110.7'

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json' },
})

const sha256 = async (value: string) => new Uint8Array(await crypto.subtle.digest(
  'SHA-256', new TextEncoder().encode(value),
))

const secretsMatch = async (provided: string, expected: string) => {
  const [left, right] = await Promise.all([sha256(provided), sha256(expected)])
  let difference = 0
  for (let index = 0; index < left.length; index += 1) {
    difference |= left[index] ^ right[index]
  }
  return difference === 0
}

serve(async (request) => {
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  const expected = (Deno.env.get('MODERATION_RETENTION_SECRET') || '').trim()
  if (expected.length < 32) return json({ error: 'retention_worker_not_configured' }, 503)
  const provided = (request.headers.get('x-cron-secret') || '').trim()
  if (!provided || !(await secretsMatch(provided, expected))) {
    return json({ error: 'unauthorized' }, 401)
  }

  const url = Deno.env.get('SUPABASE_URL') || ''
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
  if (!url || !serviceKey) return json({ error: 'missing_service_configuration' }, 500)

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } })
  const input = await request.json().catch(() => ({}))
  const execute = input?.execute === true
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

  if (!execute) {
    const [{ data: events, error }, { data: profileRows, error: profileError }] = await Promise.all([
      admin.from('content_moderation_events').select('id,storage_bucket,storage_path')
        .neq('status', 'PENDING_REVIEW').is('evidence_redacted_at', null)
        .eq('evidence_hold', false).eq('legal_hold', false)
        .lt('created_at', cutoff).order('created_at').limit(100),
      admin.from('profile_moderation_events').select('id').not('resolved_at', 'is', null)
        .is('evidence_redacted_at', null).lt('created_at', cutoff).order('created_at').limit(100),
    ])
    if (error || profileError) return json({ error: 'retention_read_failed' }, 500)
    return json({
      dry_run: true,
      cutoff,
      content_candidates: events?.length || 0,
      content_objects: (events || []).filter((event) => event.storage_bucket && event.storage_path).length,
      profile_candidates: profileRows?.length || 0,
    })
  }

  let runId: string | null = null
  let redacted = 0
  let failed = 0
  let deadLetter = 0

  const releaseFailure = async (table: string, row: { id: string; attempts?: number }, reason: string) => {
    failed += 1
    if ((row.attempts || 0) >= 8) deadLetter += 1
    if (!runId) return
    await admin.from(table).update({
      evidence_retention_claim_id: null,
      evidence_retention_claimed_at: null,
      evidence_retention_failure: reason.slice(0, 500),
    }).eq('id', row.id).eq('evidence_retention_claim_id', runId)
  }

  try {
    const { data: claim, error: claimError } = await admin.rpc(
      'rpc_service_claim_moderation_evidence_retention',
      { p_limit: 100, p_retention: '30 days' },
    )
    if (claimError || !claim?.run_id) throw new Error('retention_claim_failed')

    runId = claim.run_id
    const contentRows = Array.isArray(claim.content) ? claim.content : []
    const profileRows = Array.isArray(claim.profiles) ? claim.profiles : []

    for (const event of contentRows) {
      if (event.storage_bucket && event.storage_path) {
        const { error: storageError } = await admin.storage
          .from(event.storage_bucket).remove([event.storage_path])
        if (storageError) {
          await releaseFailure('content_moderation_events', event, 'storage_delete_failed')
          continue
        }
      }

      const { error: updateError } = await admin.from('content_moderation_events').update({
        storage_bucket: null,
        storage_path: null,
        extracted_text: null,
        evidence_snapshot: { retention_redacted: true },
        evidence_redacted_at: new Date().toISOString(),
        evidence_retention_claim_id: null,
        evidence_retention_claimed_at: null,
        evidence_retention_failure: null,
      }).eq('id', event.id).eq('evidence_retention_claim_id', runId)
        .neq('status', 'PENDING_REVIEW').eq('evidence_hold', false).eq('legal_hold', false)
      if (updateError) await releaseFailure('content_moderation_events', event, 'redaction_update_failed')
      else redacted += 1
    }

    for (const event of profileRows) {
      const { error: updateError } = await admin.from('profile_moderation_events').update({
        evidence_snapshot: { retention_redacted: true },
        evidence_redacted_at: new Date().toISOString(),
        evidence_retention_claim_id: null,
        evidence_retention_claimed_at: null,
        evidence_retention_failure: null,
      }).eq('id', event.id).eq('evidence_retention_claim_id', runId)
        .not('resolved_at', 'is', null)
      if (updateError) await releaseFailure('profile_moderation_events', event, 'redaction_update_failed')
      else redacted += 1
    }

    const status = failed > 0 ? 'failed' : 'succeeded'
    await admin.from('moderation_evidence_retention_runs').update({
      completed_at: new Date().toISOString(),
      redacted_count: redacted,
      failed_count: failed,
      dead_letter_count: deadLetter,
      status,
      error: failed > 0 ? 'one_or_more_items_failed' : null,
    }).eq('id', runId)

    return json({
      dry_run: false,
      run_id: runId,
      processed: contentRows.length + profileRows.length,
      redacted,
      failed,
      dead_letter: deadLetter,
    }, failed > 0 ? 207 : 200)
  } catch (error) {
    if (runId) {
      await admin.from('moderation_evidence_retention_runs').update({
        completed_at: new Date().toISOString(),
        redacted_count: redacted,
        failed_count: failed,
        dead_letter_count: deadLetter,
        status: 'failed',
        error: String(error instanceof Error ? error.message : error).slice(0, 500),
      }).eq('id', runId)
    }
    return json({ error: 'retention_worker_failed', run_id: runId }, 500)
  }
})
