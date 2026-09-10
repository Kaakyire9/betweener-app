import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const authority = readFileSync(
  'supabase/migrations/20260909120000_live_odo_phase10f_system_session_authority.sql', 'utf8',
);
const storage = readFileSync(
  'supabase/migrations/20260909121000_live_odo_phase10f_availability_opportunities.sql', 'utf8',
);
const engine = readFileSync(
  'supabase/migrations/20260909122000_live_odo_phase10f_opportunity_engine.sql', 'utf8',
);
const orchestrator = readFileSync(
  'supabase/migrations/20260909123000_live_odo_phase10f_system_orchestrator.sql', 'utf8',
);
const operations = readFileSync(
  'supabase/migrations/20260909124000_live_odo_phase10f_operations_and_studio_contract.sql', 'utf8',
);
const musicPolicy = readFileSync(
  'supabase/migrations/20260909125000_live_odo_phase10f_music_session_policy.sql', 'utf8',
);
const activeExperienceHardening = readFileSync(
  'supabase/migrations/20260910100000_live_odo_phase10f_active_experience_conflict.sql', 'utf8',
);
const maintenanceClock = readFileSync(
  'supabase/migrations/20260910101000_live_odo_phase10f_maintenance_clock.sql', 'utf8',
);
const worker = readFileSync(
  'supabase/functions/live-odo-always-on-quick-connect/index.ts', 'utf8',
);
const workerDeno = readFileSync(
  'supabase/functions/live-odo-always-on-quick-connect/deno.json', 'utf8',
);
const notificationRouting = readFileSync('lib/notifications/notification-routing.ts', 'utf8');
const opportunityScreen = readFileSync('app/live/opportunity/[opportunityId].tsx', 'utf8');
const availabilityCard = readFileSync(
  'features/live/components/LiveAlwaysOnQuickConnectCard.tsx', 'utf8',
);
const health = readFileSync('supabase/verification/live_odo_phase10f_health.sql', 'utf8');

const functionBody = (source: string, name: string): string => source.match(
  new RegExp(`create or replace function public\\.${name}[\\s\\S]*?\\n\\$\\$;`, 'i'),
)?.[0] ?? '';

test('availability is explicit, time-bounded, private, and never inferred from presence', () => {
  assert.match(storage, /default false[\s\S]*circuit_breaker_open boolean not null default true/i);
  assert.match(storage, /not odo_start_enabled or automatic_ending_enabled/i);
  assert.match(storage, /expires_at timestamptz not null/i);
  assert.match(storage, /Private, explicit, time-bounded permission/i);
  assert.match(storage, /revoke all on table[\s\S]*live_quick_connect_availability[\s\S]*from public, anon, authenticated/i);
  const setAvailability = functionBody(engine, 'rpc_set_live_quick_connect_availability_v1');
  assert.match(setAvailability, /p_duration_minutes = any\(v_configuration\.availability_durations_minutes\)/i);
  assert.doesNotMatch(setAvailability, /user_presence[\s\S]*status = 'available'/i);
  assert.match(engine, /presence never grants availability/i);
  assert.match(engine,
    /rpc_get_live_quick_connect_availability_v1\(\)[\s\S]*rpc_respond_live_quick_connect_opportunity_v1\(uuid, text, bigint\)[\s\S]*from public, anon, service_role/i);
});

test('dormant backstage memberships do not block Always-on Quick Connect', () => {
  const classifier = functionBody(activeExperienceHardening,
    'live_odo_always_on_has_active_experience_v1');
  const setAvailability = functionBody(activeExperienceHardening,
    'rpc_set_live_quick_connect_availability_v1');
  const pairEligibility = functionBody(activeExperienceHardening,
    'live_odo_always_on_pair_is_eligible_v1');
  const prepare = functionBody(activeExperienceHardening,
    'live_odo_prepare_always_on_session_base_10f_v1');
  const finalize = functionBody(activeExperienceHardening,
    'live_odo_finalize_always_on_session_base_10f_v1');
  const maintenance = functionBody(activeExperienceHardening,
    'rpc_service_maintain_live_quick_connect_opportunities_v1');

  assert.match(classifier, /participant\.joined_at is not null/i);
  assert.match(classifier,
    /participant\.state in \([\s\S]*'backstage'[\s\S]*'temporarily_disconnected'[\s\S]*\)/i);
  assert.match(classifier, /spark\.consent_expires_at[\s\S]*spark\.active_expires_at/i);
  assert.doesNotMatch(classifier, /participant\.state not in \('left','removed','banned'\)/i);
  assert.match(setAvailability, /live_odo_always_on_has_active_experience_v1\(auth\.uid\(\)\)/i);
  assert.match(pairEligibility, /has_active_experience_v1\(p_user_a\)/i);
  assert.match(pairEligibility, /has_active_experience_v1\(p_user_b\)/i);
  assert.match(prepare, /has_active_experience_v1\(member\.user_id\)/i);
  assert.match(finalize, /has_active_experience_v1\([\s\S]*member\.user_id, v_session\.id/i);
  assert.match(maintenance, /has_active_experience_v1\([\s\S]*availability\.user_id/i);
  assert.match(health, /active_experience_contract_release_blockers/i);
});

test('Always-on expiry and detection retain a single database maintenance clock', () => {
  assert.match(maintenanceClock, /job\.jobname = 'live-maintenance'/i);
  assert.match(maintenanceClock, /'\* \* \* \* \*'/i);
  assert.match(maintenanceClock, /select public\.run_live_maintenance\(\);/i);
  assert.match(health, /scheduler_release_blockers/i);
});

test('opportunity detection is deterministic, bounded, pairability-aware and LLM-free', () => {
  const detection = functionBody(engine, 'rpc_service_detect_live_quick_connect_opportunity_v1');
  assert.match(detection, /limit v_configuration\.candidate_scan_limit/i);
  assert.match(detection, /limit v_configuration\.edge_scan_limit/i);
  assert.match(detection, /live_odo_always_on_pair_is_eligible_v1/i);
  assert.match(detection, /pg_advisory_xact_lock/i);
  assert.match(storage, /live_qc_opportunity_active_market_idx/i);
  assert.doesNotMatch(`${engine}\n${worker}`, /openai|anthropic|prompt|completion|embedding/i);
});

test('reservations, consent, cooldowns and quorum fail closed', () => {
  assert.match(storage, /user_id uuid primary key references auth\.users/i);
  assert.match(engine, /on conflict\(user_id\) do nothing/i);
  assert.match(engine, /p_response not in \('accept','not_now','not_tonight','withdraw'\)/i);
  assert.match(engine, /invitation_cooldown_active/i);
  assert.match(engine, /maximum_invitations_per_day/i);
  assert.match(engine, /is_quiet_hours/i);
  assert.match(engine, /accepted_pair_edge_count/i);
  assert.match(engine, /pairability_quorum_reached/i);
});

test('system sessions have no fake Supabase Host and are one-per-opportunity', () => {
  assert.match(authority, /ownership_type = 'system'[\s\S]*created_by_user_id is null[\s\S]*created_by_profile_id is null/i);
  assert.match(storage, /live_session_id uuid unique/i);
  assert.match(orchestrator, /opportunity_id uuid not null unique/i);
  const prepare = functionBody(orchestrator,
    'rpc_service_prepare_live_quick_connect_opportunity_session_v1');
  assert.match(prepare, /null, null, 'system', 'odo_always_on_quick_connect'/i);
  assert.doesNotMatch(`${authority}\n${orchestrator}`, /insert into auth\.users|odo@|fake[_ ]host/i);
});

test('Stream exists only after accepted quorum and media consent remains separate', () => {
  const prepare = functionBody(orchestrator,
    'rpc_service_prepare_live_quick_connect_opportunity_session_v1');
  assert.match(prepare, /member\.state = 'accepted'/i);
  assert.match(prepare, /quorum_revalidation_failed/i);
  assert.match(worker, /getOrCreate/i);
  assert.match(worker, /notify: false/i);
  assert.match(worker, /ring: false/i);
  assert.match(workerDeno, /npm:@stream-io\/node-sdk@0\.7\.63/i);
  assert.match(workerDeno, /npm:@supabase\/supabase-js@2\.110\.7/i);
  assert.match(orchestrator, /pool_intent_requires_explicit_join/i);
  assert.doesNotMatch(prepare, /live_quick_connect_participants/i);
});

test('safety is rechecked before prepare and final launch', () => {
  assert.match(operations, /live_odo_always_on_safety_preflight_v1/i);
  assert.match(operations, /safety_coverage_mode = 'selected_test_cohort'/i);
  assert.match(operations, /safety_coverage_preflight_failed/i);
  assert.match(orchestrator, /start_revalidation_failed/i);
});

test('Odo reuses the 10D/10E engines without choosing a pair', () => {
  const finalize = functionBody(orchestrator,
    'rpc_service_finalize_live_quick_connect_opportunity_session_v1');
  assert.match(finalize, /live_odo_full_quick_connect_settings/i);
  assert.match(finalize, /live_odo_show_sessions/i);
  assert.match(finalize, /live_music_session_state/i);
  assert.match(finalize, /control_source = 'odo'/i);
  assert.doesNotMatch(finalize, /insert into public\.live_quick_connect_pairings/i);
  assert.match(musicPolicy, /live_odo_always_on_music_allowed_v1/i);
  assert.match(musicPolicy, /always_on_music_disabled/i);
});

test('ending drains conversations and acknowledges Stream cleanup', () => {
  const maintenance = functionBody(orchestrator,
    'rpc_service_maintain_live_odo_always_on_sessions_v1');
  assert.match(maintenance, /maximum_runtime_reached/i);
  assert.match(maintenance, /empty_room_timeout/i);
  assert.match(maintenance, /low_liquidity_timeout/i);
  assert.match(maintenance, /v_active_pairs = 0/i);
  assert.match(operations, /rpc_service_get_live_odo_always_on_cleanup_work_v1/i);
  assert.match(worker, /\.call\(callType, callId\)\.end\(\)/i);
});

test('mobile exposes private choices and notification deep links without a Studio UI', () => {
  assert.match(opportunityScreen, /I’m in/i);
  assert.match(opportunityScreen, /Not now/i);
  assert.match(opportunityScreen, /Not tonight/i);
  assert.match(opportunityScreen, /camera and microphone remain under your control/i);
  assert.match(notificationRouting, /live_quick_connect_opportunity/i);
  assert.match(notificationRouting, /live_quick_connect_ready/i);
  assert.match(availabilityCard, /Your availability window ended/i);
  assert.doesNotMatch(opportunityScreen, /Studio|compatibility graph|declined by/i);
});

test('Phase 10G receives a read-safe snapshot and generic controller vocabulary', () => {
  assert.match(operations, /rpc_get_live_odo_system_program_snapshot_v1/i);
  assert.match(operations, /program_output_source/i);
  assert.match(operations, /'host_camera','active_pair','quick_connect_pool','odo_stage'/i);
  assert.match(authority, /'odo','mobile_host','studio_host','system'/i);
  assert.doesNotMatch(functionBody(operations, 'rpc_get_live_odo_system_program_snapshot_v1'),
    /participant_a_user_id|participant_b_user_id|compatibilityGraph|prompt|transcript/i);
  assert.match(health, /release_blockers/i);
  assert.match(health, /expected\(signature, authenticated_execute, service_execute\)/i);
});
