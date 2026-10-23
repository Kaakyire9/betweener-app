import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const migration = readFileSync(
  'supabase/migrations/20260914127000_push_notification_expiry_lifecycle.sql',
  'utf8',
)
const baseMigration = readFileSync(
  'supabase/migrations/20260914123000_push_notification_event_security.sql',
  'utf8',
)
const health = readFileSync(
  'supabase/verification/push_notification_event_security_health.sql',
  'utf8',
)
const databaseRegression = readFileSync(
  'supabase/verification/push_notification_expiry_lifecycle_regression.sql',
  'utf8',
)

const functionBody = (source: string, schema: string, name: string) => source.match(
  new RegExp(`create or replace function ${schema}\\.${name}[\\s\\S]*?\\n\\$\\$;`, 'i'),
)?.[0] ?? ''

const expiryFinalizer = functionBody(
  migration,
  'private',
  'expire_pending_push_notification_events_v1',
)
const singleDispatcher = functionBody(
  migration,
  'private',
  'dispatch_push_notification_event_v1',
)
const pendingDispatcher = functionBody(
  migration,
  'private',
  'dispatch_pending_push_notification_events_v1',
)
const claim = functionBody(
  migration,
  'public',
  'rpc_service_claim_push_notification_event_v1',
)
const pruner = functionBody(
  migration,
  'private',
  'prune_push_notification_events_v1',
)

test('one private finalizer owns the pending-to-expired transition', () => {
  assert.match(expiryFinalizer, /event\.status = 'pending'/i)
  assert.match(expiryFinalizer, /event\.claimed_at is null/i)
  assert.match(expiryFinalizer, /event\.expires_at <= v_now/i)
  assert.match(expiryFinalizer, /not exists[\s\S]*push_notification_delivery_reservations/i)
  assert.match(expiryFinalizer, /for update skip locked/i)
  assert.match(expiryFinalizer, /set status = 'expired'/i)
  assert.match(expiryFinalizer, /outcome = 'expired_before_claim'/i)
  assert.match(
    migration,
    /revoke all on function private\.expire_pending_push_notification_events_v1\(integer, uuid\)[\s\S]*from public, anon, authenticated, service_role/i,
  )
})

test('claim and dispatch delegate expiry without retaining independent terminal writes', () => {
  assert.match(singleDispatcher, /expire_pending_push_notification_events_v1\(1, p_event_id\)/i)
  assert.match(claim, /expire_pending_push_notification_events_v1\(1, p_event_id\)/i)
  assert.doesNotMatch(singleDispatcher, /set status = 'expired'/i)
  assert.doesNotMatch(claim, /set status = 'expired'/i)
  assert.match(singleDispatcher, /where event\.id = p_event_id[\s\S]*for update/i)
  assert.match(claim, /pg_advisory_xact_lock[\s\S]*where event\.id = p_event_id[\s\S]*for update/i)
  assert.match(claim, /and expires_at > v_now[\s\S]*returning \* into v_event/i)
})

test('scheduled and retention paths sweep expiry independently of signing', () => {
  assert.match(
    pendingDispatcher,
    /perform private\.expire_pending_push_notification_events_v1\(1000, null\)[\s\S]*for v_event in/i,
  )
  assert.match(
    pruner,
    /perform private\.expire_pending_push_notification_events_v1\(5000, null\)/i,
  )
  assert.match(
    baseMigration,
    /'push-notification-event-dispatch',[\s\S]*'\* \* \* \* \*',[\s\S]*dispatch_pending_push_notification_events_v1\(100\)/i,
  )
  assert.doesNotMatch(expiryFinalizer, /push_config|webhook_url|signing/i)
})

test('cleanup and dispatch use row locks and fail closed at the expiry boundary', () => {
  assert.match(expiryFinalizer, /for update skip locked/i)
  assert.match(singleDispatcher, /for update[\s\S]*expires_at <= clock_timestamp\(\)/i)
  assert.match(
    singleDispatcher,
    /expires_at <= clock_timestamp\(\)[\s\S]*expire_pending_push_notification_events_v1\(1, p_event_id\)[\s\S]*return false/i,
  )
  assert.match(
    pendingDispatcher,
    /event\.status = 'pending'[\s\S]*event\.claimed_at is null[\s\S]*event\.expires_at > clock_timestamp\(\)/i,
  )
})

test('terminal expiry remains auditable and becomes pruneable only after retention', () => {
  assert.match(
    pruner,
    /event\.status in \('delivered','failed','expired','suppressed'\)[\s\S]*event\.completed_at < v_now - interval '30 days'/i,
  )
  assert.match(pruner, /for update skip locked/i)
  assert.doesNotMatch(expiryFinalizer, /delete from/i)
})

test('health separates actionable, grace, terminal-expired and stranded events', () => {
  assert.match(health, /actionable_pending_events/i)
  assert.match(health, /pending_expiry_grace_events/i)
  assert.match(health, /terminal_expired_events/i)
  assert.match(health, /stranded_pending_events/i)
  assert.match(health, /interval '2 minutes'/i)
  assert.match(health, /volume\.stranded_pending_events = 0/i)
  assert.match(health, /expiry_lifecycle_present/i)
})

test('database regression covers terminalization, idempotency and existing invariants', () => {
  assert.match(databaseRegression, /pending_expiry_transition_failed/i)
  assert.match(databaseRegression, /signing_independent_expiry_sweep_failed/i)
  assert.match(databaseRegression, /expired_event_was_dispatchable/i)
  assert.match(databaseRegression, /terminal_event_changed_by_expiry_sweep/i)
  assert.match(databaseRegression, /claim_reservation_expiry_race_invariant_failed/i)
  assert.match(databaseRegression, /replay_completion_invariant_failed/i)
  assert.match(databaseRegression, /terminal_expired_event_not_pruned_after_retention/i)
  assert.match(databaseRegression, /final_expiry_sweep_not_idempotent/i)
  assert.match(databaseRegression, /^--[^\n]*\n\s*begin;[\s\S]*rollback;\s*$/i)
})

test('HMAC envelope and rate-limit implementation remain present', () => {
  assert.match(singleDispatcher, /extensions\.hmac[\s\S]*'sha256'/i)
  assert.match(singleDispatcher, /x-betweener-signature/i)
  assert.doesNotMatch(singleDispatcher, /x-push-secret/i)
  assert.match(claim, /push-notification-rate-window/i)
  assert.match(claim, /v_global_claims >= 300/i)
  assert.match(claim, /v_recipient_claims >= 20/i)
})
