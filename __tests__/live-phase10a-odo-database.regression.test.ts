import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const foundation = readFileSync('supabase/migrations/20260907100000_live_odo_phase10a_foundation.sql', 'utf8');
const indexes = readFileSync('supabase/migrations/20260907101000_live_odo_phase10a_indexes_concurrently.sql', 'utf8');
const policy = readFileSync('supabase/migrations/20260907102000_live_odo_phase10a_policy.sql', 'utf8');
const hardening = readFileSync('supabase/migrations/20260907103000_live_odo_phase10a_protocol_hardening.sql', 'utf8');
const edge = readFileSync('supabase/functions/live-odo-director/index.ts', 'utf8');

test('Phase 10A defaults and database constraint enforce shadow-only behavior', () => {
  assert.match(foundation, /odo_enabled boolean not null default false/i);
  assert.match(foundation, /shadow_mode boolean not null default true/i);
  assert.match(foundation, /live_odo_phase10a_shadow_invariant/i);
  assert.match(foundation, /not autopilot_enabled[\s\S]*not conversation_spark_enabled[\s\S]*not audience_pulse_enabled[\s\S]*not music_enabled/i);
});

test('all mutable Odo tables deny direct authenticated and service-role writes', () => {
  assert.match(foundation, /revoke all on public\.live_odo_configuration[\s\S]*from anon, authenticated, service_role/i);
  assert.doesNotMatch(foundation, /grant (insert|update|delete|all)[\s\S]*live_odo_/i);
  assert.match(policy, /live_odo_service_role_required/g);
});

test('AI calls are split across acquire and evaluate transactions', () => {
  assert.match(policy, /rpc_service_begin_live_odo_call_v1/i);
  assert.match(policy, /rpc_service_evaluate_live_odo_action_v1/i);
  assert.match(edge, /RPC 1 is a short transaction/i);
  assert.match(edge, /RPC 2 opens a new short transaction/i);
  assert.match(edge, /await runOdoShadowProvider/i);
  assert.doesNotMatch(policy, /api\.openai\.com|fetch\s*\(/i);
});

test('lease RPCs acquire the session fence before taking durable row locks', () => {
  for (const functionName of [
    'rpc_service_renew_live_odo_lease_v1',
    'rpc_service_fail_live_odo_call_v1',
    'rpc_service_evaluate_live_odo_action_v1',
  ]) {
    const body = policy.match(new RegExp(
      `create or replace function public\\.${functionName}[\\s\\S]*?\\n\\$\\$;`,
      'i',
    ))?.[0] ?? '';
    const beforeFence = body.split(/perform pg_advisory_xact_lock/i)[0];
    assert.doesNotMatch(beforeFence, /for update/i, functionName);
  }
});

test('lease fencing, snapshots and budgets are checked before and after inference', () => {
  assert.match(policy, /pg_advisory_xact_lock/i);
  assert.match(policy, /lease_generation = lease_generation \+ 1/i);
  assert.match(policy, /v_state\.lease_owner is not null[\s\S]*v_state\.lease_expires_at > v_now then v_reason := 'lease_held'/i);
  assert.match(policy, /stale_or_expired_lease/i);
  assert.match(policy, /snapshot_stale/i);
  assert.match(policy, /session_input_budget_exhausted/i);
  assert.match(policy, /session_output_budget_exhausted/i);
  assert.match(policy, /terra_budget_exhausted/i);
  assert.match(hardening, /live_odo_ai_usage_task_budget_guard/i);
  assert.match(hardening, /live_odo_task_budget_exhausted/i);
});

test('shadow policy cannot invoke legacy Live, matcher, RTC or Stream mutations', () => {
  const evaluate = policy.match(/create or replace function public\.rpc_service_evaluate_live_odo_action_v1[\s\S]*?\n\$\$;/i)?.[0] ?? '';
  assert.doesNotMatch(evaluate, /perform\s+public\.rpc_transition_live_session/i);
  assert.doesNotMatch(evaluate, /live_quick_connect_sync\s*\(/i);
  assert.doesNotMatch(evaluate, /streamclient|\.video\.call|rpc_.*(?:rtc|private_spark)/i);
  assert.doesNotMatch(evaluate, /insert into public\.live_director_events/i);
  assert.match(foundation, /p_source = 'odo'[\s\S]*live_odo_phase10a_shadow_only/i);
});

test('director event order and idempotency have concurrent indexes', () => {
  assert.match(foundation, /unique \(session_id, sequence\)/i);
  assert.match(indexes, /create unique index concurrently[\s\S]*\(session_id, idempotency_key\)[\s\S]*where idempotency_key is not null/i);
  assert.match(foundation, /content-free invalidation row/i);
  assert.match(foundation, /create table public\.live_director_updates[\s\S]*latest_sequence bigint/i);
});

test('Studio protocol carries explicit visibility and stable wire field names', () => {
  assert.match(hardening, /visibility in \('participant','host','moderator','admin','internal'\)/i);
  assert.match(hardening, /source in \('odo','host','system','moderator'\)/i);
  assert.match(hardening, /'latestSequenceNumber', state_row\.latest_sequence/i);
  assert.match(hardening, /'sequenceNumber', e\.sequence/i);
  assert.match(hardening, /candidate\.visibility = 'participant'/i);
  assert.match(hardening, /candidate\.visibility = 'admin' and v_is_admin/i);
});

test('Edge worker has a narrow body and uses service role only through RPCs', () => {
  assert.match(edge, /Object\.keys\(value\)\.length !== 1/i);
  assert.doesNotMatch(edge, /body\.(model|provider|complexity|prompt|action)/i);
  assert.doesNotMatch(edge, /service\.from\(/i);
  assert.match(edge, /service\.rpc\('rpc_service_begin_live_odo_call_v1'/i);
  assert.match(edge, /service\.rpc\('rpc_service_evaluate_live_odo_action_v1'/i);
});

test('admin trace stores operational metadata without action payload or prompts', () => {
  assert.match(foundation, /Never contains prompts or member content/i);
  assert.doesNotMatch(foundation.match(/create table public\.live_odo_trace_events[\s\S]*?\);/i)?.[0] ?? '', /prompt|copy|profile|response_body/i);
  assert.match(policy, /jsonb_build_object\('actionType', v_action_type, 'shadow', true\)/i);
});

test('required Odo operational telemetry uses stable event names', () => {
  for (const traceType of [
    'odo_director_call_started',
    'odo_director_call_succeeded',
    'odo_director_call_failed',
    'odo_director_timeout',
    'odo_action_proposed',
    'odo_action_rejected_by_policy',
    'odo_action_shadow_approved',
    'odo_fallback_used',
    'odo_model_routed',
    'odo_model_escalated',
    'odo_autopilot_state_changed',
  ]) assert.match(policy, new RegExp(traceType, 'i'));
});
