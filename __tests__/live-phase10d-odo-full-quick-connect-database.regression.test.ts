import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const foundation = readFileSync(
  'supabase/migrations/20260908140000_live_odo_phase10d_full_quick_connect.sql',
  'utf8',
);
const orchestrator = readFileSync(
  'supabase/migrations/20260908141000_live_odo_phase10d_orchestrator.sql',
  'utf8',
);
const edge = readFileSync('supabase/functions/live-odo-full-quick-connect/index.ts', 'utf8');
const hook = readFileSync(
  'features/live/odo/full-quick-connect/use-live-odo-full-quick-connect.ts',
  'utf8',
);
const panel = readFileSync('features/live/components/OdoFullQuickConnectPanel.tsx', 'utf8');
const privateScreen = readFileSync('app/live/quick-connect/[sessionId].tsx', 'utf8');
const participantNotices = readFileSync(
  'features/live/odo/copilot/odo-copilot-participant-notice.ts',
  'utf8',
);

const functionBody = (source: string, name: string): string => source.match(
  new RegExp(`create or replace function public\\.${name}[\\s\\S]*?\\n\\$\\$;`, 'i'),
)?.[0] ?? '';

test('10D is separately gated, internal-only and off by default', () => {
  assert.match(foundation, /full_quick_connect_autopilot_enabled boolean not null default false/i);
  assert.match(foundation, /full_quick_connect_internal_only boolean not null default true/i);
  assert.match(foundation, /full_quick_connect_maximum_runtime_minutes/i);
  assert.match(orchestrator, /fullAutopilotEnabled.*v_config\.full_autopilot_enabled/is);
  assert.match(orchestrator, /musicEnabled.*v_config\.music_enabled/is);
});

test('durable lifecycle state and action ledger are private and RLS protected', () => {
  for (const table of [
    'live_odo_full_quick_connect_settings',
    'live_odo_full_quick_connect_actions',
    'live_odo_full_quick_connect_updates',
  ]) assert.match(foundation, new RegExp(`alter table public\\.${table} enable row level security`, 'i'));
  assert.match(foundation, /revoke all on table[\s\S]*live_odo_full_quick_connect_actions[\s\S]*authenticated/i);
  assert.match(foundation, /action_key text not null unique/i);
  assert.match(foundation, /lease_generation bigint not null/i);
});

test('the service boundary delegates WHO pairing to the existing AutoMatcher', () => {
  const reconcile = functionBody(
    orchestrator,
    'rpc_service_reconcile_live_odo_full_quick_connect_v1',
  );
  const eligibility = functionBody(foundation, 'live_odo_full_quick_eligible_pairs_v1');
  assert.match(reconcile, /live_odo_is_service_role\(\)/i);
  assert.match(reconcile, /perform public\.live_quick_connect_sync\(p_session_id\)/i);
  assert.match(eligibility, /live_quick_connect_pair_is_eligible/i);
  assert.doesNotMatch(reconcile, /participant_a_user_id\s*=|participant_b_user_id\s*=/i);
  assert.doesNotMatch(reconcile, /insert into public\.live_quick_connect_pairings/i);
  assert.doesNotMatch(reconcile, /live_quick_connect_decisions/i);
  assert.doesNotMatch(reconcile, /ISSUE_RTC|provider_call_id\s*=/i);
});

test('takeover fences Odo and preserves the existing Quick Connect pair', () => {
  const takeover = functionBody(orchestrator, 'rpc_take_over_live_odo_v1');
  assert.match(takeover, /rpc_take_over_live_odo_without_full_quick_v1/i);
  assert.match(takeover, /lifecycle_state = 'paused_by_host'/i);
  assert.match(takeover, /activePairPreserved/i);
  assert.doesNotMatch(takeover, /update public\.live_quick_connect_pairings set/i);
  assert.doesNotMatch(takeover, /update public\.live_quick_connect_rounds set/i);
});

test('draining finishes current pairs and never ends the Live session', () => {
  const finish = functionBody(foundation, 'rpc_finish_live_odo_quick_connect_v1');
  const reconcile = functionBody(
    orchestrator,
    'rpc_service_reconcile_live_odo_full_quick_connect_v1',
  );
  assert.match(finish, /state = 'draining'/i);
  assert.match(finish, /live_quick_connect_sync/i);
  assert.match(reconcile, /QUICK_CONNECT_CLOSING/i);
  assert.match(reconcile, /CLOSE_QUICK_CONNECT/i);
  assert.doesNotMatch(`${finish}\n${reconcile}`, /update public\.live_sessions set[\s\S]*status\s*=\s*'ended'/i);
});

test('the Edge input cannot select an action, pair, model or prompt', () => {
  assert.match(edge, /Object\.keys\(value\)\.length !== 1/i);
  assert.match(edge, /return \{ sessionId: String\(value\.sessionId\) \}/i);
  assert.doesNotMatch(edge, /body\.(?:action|pair|model|prompt|profile|decision)/i);
  assert.doesNotMatch(edge, /service\.from\(/i);
  assert.match(edge, /rpc_service_reconcile_live_odo_full_quick_connect_v1/i);
  assert.match(edge, /presentation.*best-effort/is);
});

test('private Odo Sparks are pair-scoped and never become room Director content', () => {
  const projection = functionBody(orchestrator, 'rpc_get_live_quick_connect');
  assert.match(projection, /v_user_id in \(pairing\.participant_a_user_id, pairing\.participant_b_user_id\)/i);
  assert.match(orchestrator, /odo_conversation_spark/i);
  assert.doesNotMatch(functionBody(orchestrator, 'live_odo_append_full_quick_event_v1'), /question/i);
  assert.match(privateScreen, /A SPARK FROM ODO/i);
});

test('the Host loop is Realtime plus one-shot scheduling with explicit controls', () => {
  assert.match(hook, /subscribeOdoFullQuickConnect/i);
  assert.match(hook, /subscribeQuickConnect/i);
  assert.match(hook, /setTimeout\(/i);
  assert.doesNotMatch(hook, /setInterval\(/i);
  assert.match(panel, /Start Full Quick Connect/i);
  assert.match(panel, /Finish Current Connections/i);
  assert.match(panel, /Take Control/i);
  assert.match(panel, /Resume Odo/i);
});

test('the consolidated server clock recovers full Quick Connect without a Host poll', () => {
  const maintenance = functionBody(orchestrator, 'run_live_maintenance');
  assert.match(maintenance, /run_live_maintenance_without_full_quick_v1/i);
  assert.match(maintenance, /rpc_service_reconcile_live_odo_full_quick_connect_v1/i);
  assert.match(maintenance, /next_wake_at <= timezone\('utc', now\(\)\)/i);
  assert.doesNotMatch(maintenance, /http|fetch|net\./i);
});

test('public lifecycle presentation is predefined and contains no pair identity', () => {
  const appendEvent = functionBody(orchestrator, 'live_odo_append_full_quick_event_v1');
  assert.match(orchestrator, /QUICK_CONNECT_PAIR_FORMING/i);
  assert.match(orchestrator, /QUICK_CONNECT_ROUND_COMPLETED/i);
  assert.match(participantNotices, /No connection will be forced/i);
  assert.doesNotMatch(appendEvent, /participant_a_user_id|participant_b_user_id|full_name/i);
});
