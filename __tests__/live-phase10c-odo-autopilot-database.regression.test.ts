import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(
  'supabase/migrations/20260908120000_live_odo_phase10c_guarded_autopilot.sql',
  'utf8',
);
const policyClearanceMigration = readFileSync(
  'supabase/migrations/20260908123000_live_odo_phase10c_policy_clearance.sql',
  'utf8',
);
const runtimeReconciliationMigration = readFileSync(
  'supabase/migrations/20260908130000_live_odo_phase10c_runtime_reconciliation.sql',
  'utf8',
);
const edge = readFileSync('supabase/functions/live-odo-autopilot/index.ts', 'utf8');
const hook = readFileSync(
  'features/live/odo/autopilot/use-live-odo-autopilot.ts', 'utf8',
);
const studio = readFileSync('features/live/components/LiveStudioModal.tsx', 'utf8');

const functionBody = (name: string): string => migration.match(
  new RegExp(`create or replace function public\\.${name}[\\s\\S]*?\\n\\$\\$;`, 'i'),
)?.[0] ?? '';

test('rollout is off by default and full Autopilot is structurally disabled', () => {
  assert.match(migration, /guarded_autopilot_enabled boolean not null default false/i);
  assert.match(migration, /full_autopilot_enabled boolean not null default false/i);
  assert.match(migration, /check \(not full_autopilot_enabled\)/i);
  assert.match(migration, /guarded_autopilot_internal_only boolean not null default true/i);
});

test('the server-owned whitelist contains only the approved ten actions', () => {
  const allowed = functionBody('live_odo_guarded_action_allowed_v1');
  for (const action of [
    'NO_ACTION', 'WAIT', 'SESSION_NARRATION', 'ANNOUNCE_EXISTING_PAIR',
    'REQUEST_SCENE', 'SHOW_CONVERSATION_SPARK', 'SHOW_AUDIENCE_PULSE',
    'SHOW_INTERMISSION', 'TIME_CUE', 'TRANSITION_COPY',
  ]) assert.match(allowed, new RegExp(`'${action}'`));
  for (const forbidden of [
    'OPEN_POOL', 'CREATE_PAIR', 'CLOSE_ROUND', 'RETURN_TO_POOL',
    'REMOVE_PARTICIPANT', 'CREATE_PRIVATE_SPARK', 'ISSUE_RTC_TOKEN', 'END_SESSION',
  ]) assert.doesNotMatch(allowed, new RegExp(`'${forbidden}'`));
});

test('automatic tables are RLS protected and authenticated clients cannot write them', () => {
  for (const table of [
    'live_odo_guarded_autopilot_settings',
    'live_odo_guarded_autopilot_events',
    'live_odo_guarded_autopilot_actions',
  ]) {
    assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`, 'i'));
  }
  assert.match(migration, /revoke all on table[\s\S]*live_odo_guarded_autopilot_actions[\s\S]*authenticated/i);
  assert.match(migration, /content-free Realtime wake signal/i);
});

test('fresh execution gate rechecks every authority fence', () => {
  const complete = functionBody('rpc_service_complete_live_odo_guarded_action_v1');
  assert.match(complete, /v_action\.expires_at <= v_now/i);
  assert.match(complete, /v_state\.lease_generation <> v_action\.lease_generation/i);
  assert.match(complete, /v_state\.state_version <> v_action\.snapshot_version/i);
  assert.match(complete, /v_session\.version <> v_action\.session_version/i);
  assert.match(complete, /v_source_version is distinct from v_action\.source_version/i);
  assert.match(complete, /live_odo_guarded_feature_allowed_v1/i);
  assert.match(complete, /live_odo_guarded_action_allowed_v1/i);
  assert.match(complete, /automatic_action_density_exceeded/i);
  assert.match(complete, /scene_dwell_active/i);
  assert.match(complete, /host_scene_suppression_active/i);
  assert.match(complete, /spark_round_limit_reached/i);
  assert.match(complete, /pulse_cooldown_active/i);
  assert.doesNotMatch(complete, /rpc_(?:open|close|create).*quick_connect/i);
  assert.doesNotMatch(complete, /rpc_.*(?:rtc|private_spark|moderate|remove_participant)/i);
});

test('Host takeover and Safety pause immediately fence all pending work', () => {
  const takeover = functionBody('rpc_take_over_live_odo_v1');
  const policyPause = functionBody('rpc_service_pause_live_odo_policy_v1');
  for (const body of [takeover, policyPause]) {
    assert.match(body, /lease_generation = lease_generation \+ 1/i);
    assert.match(body, /lease_owner = null/i);
    assert.match(body, /live_odo_guarded_autopilot_events set/i);
    assert.match(body, /live_odo_guarded_autopilot_actions set/i);
    assert.match(body, /live_odo_ai_usage set/i);
  }
  assert.match(policyPause, /live_odo_is_service_role/i);
  assert.match(policyClearanceMigration, /old\.autopilot_state = 'paused_by_policy'/i);
  assert.match(policyClearanceMigration, /live_odo_policy_clearance_required/i);
  assert.match(policyClearanceMigration, /live_odo_is_service_role/i);
  assert.match(policyClearanceMigration, /autopilot_state = 'paused_by_host'/i);
  assert.doesNotMatch(policyClearanceMigration, /autopilot_state = 'active'/i);
});

test('the Edge worker accepts only sessionId and cannot choose actions or models', () => {
  assert.match(edge, /Object\.keys\(value\)\.length !== 1/i);
  assert.match(edge, /return \{ sessionId: String\(value\.sessionId\) \}/i);
  assert.doesNotMatch(edge, /body\.(?:action|task|model|prompt|profile)/i);
  assert.doesNotMatch(edge, /service\.from\(/i);
  const claimIndex = edge.indexOf('rpc_service_claim_live_odo_guarded_event_v1');
  const providerIndex = edge.indexOf('const run = await runOdoCopilotProvider', claimIndex);
  const completeIndex = edge.indexOf(
    'rpc_service_complete_live_odo_guarded_action_v1',
    providerIndex,
  );
  assert.ok(claimIndex >= 0 && providerIndex > claimIndex && completeIndex > providerIndex);
});

test('the loop is Realtime/event-driven and the clock uses a one-shot timer', () => {
  assert.match(migration, /live_odo_guarded_hosted_round_event/i);
  assert.match(migration, /live_odo_guarded_quick_pair_event/i);
  assert.match(migration, /live_odo_guarded_quick_round_event/i);
  assert.match(hook, /subscribeOdoGuardedAutopilot/i);
  assert.match(hook, /setTimeout\(/i);
  assert.doesNotMatch(hook, /setInterval\(/i);
});

test('activation and authoritative stage changes reconcile a predefined scene', () => {
  assert.match(runtimeReconciliationMigration, /live_odo_guarded_activation_scene/i);
  assert.match(runtimeReconciliationMigration, /live_odo_fence_stage_composition_v1/i);
  assert.match(runtimeReconciliationMigration, /trigger_type <> 'SCENE_CHANGED'/i);
  assert.match(runtimeReconciliationMigration, /new\.action_type := 'REQUEST_SCENE'/i);
  assert.match(runtimeReconciliationMigration, /v_target_scene := 'pair_forming'/i);
  assert.match(runtimeReconciliationMigration, /v_target_scene := 'quick_connect_active'/i);
  assert.doesNotMatch(runtimeReconciliationMigration, /PROMOTE_TO_STAGE|REMOVE_FROM_STAGE|CREATE_PAIR/i);
});

test('Studio requires intentional activation and keeps Take Control one tap away', () => {
  assert.match(studio, /<OdoAutopilotPanel controller=\{autopilot\}/i);
  const panel = readFileSync('features/live/components/OdoAutopilotPanel.tsx', 'utf8');
  assert.match(panel, /Alert\.alert\([\s\S]*Enable Odo Autopilot/i);
  assert.match(panel, /Take Control/i);
  assert.match(panel, /Resume Odo/i);
  assert.match(panel, /Waiting for the next eligible moment/i);
  assert.match(studio, /key=\{activeTab\}/i);
  assert.doesNotMatch(panel, /token|policy gate score|raw json/i);
});
