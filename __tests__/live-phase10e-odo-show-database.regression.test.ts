import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const foundation = readFileSync(
  'supabase/migrations/20260908213000_live_odo_phase10e_show_music_foundation.sql', 'utf8',
);
const orchestrator = readFileSync(
  'supabase/migrations/20260908214000_live_odo_phase10e_show_orchestrator.sql', 'utf8',
);
const hardening = readFileSync(
  'supabase/migrations/20260908215000_live_odo_phase10e_runtime_hardening.sql', 'utf8',
);
const musicPolicyHardening = readFileSync(
  'supabase/migrations/20260908216000_live_odo_phase10e_music_policy_hardening.sql', 'utf8',
);
const configurationAuthority = readFileSync(
  'supabase/migrations/20260908217000_live_odo_phase10e_configuration_authority.sql', 'utf8',
);
const controlRecovery = readFileSync(
  'supabase/migrations/20260908218000_live_odo_phase10e_program_control_recovery.sql', 'utf8',
);
const showEdge = readFileSync('supabase/functions/live-odo-show-director/index.ts', 'utf8');
const musicEdge = readFileSync('supabase/functions/live-music-playback/index.ts', 'utf8');
const showDeno = readFileSync('supabase/functions/live-odo-show-director/deno.json', 'utf8');
const musicDeno = readFileSync('supabase/functions/live-music-playback/deno.json', 'utf8');
const route = readFileSync('app/live/[sessionId].tsx', 'utf8');

const functionBody = (source: string, name: string): string => source.match(
  new RegExp(`create or replace function public\\.${name}[\\s\\S]*?\\n\\$\\$;`, 'i'),
)?.[0] ?? '';

test('10E is independently gated with voice and screen sharing disabled', () => {
  assert.match(foundation, /show_director_enabled boolean not null default false/i);
  assert.match(foundation, /music_auto_enabled boolean not null default false/i);
  assert.match(foundation, /odo_voice_enabled boolean not null default false/i);
  assert.match(foundation, /screen_share_enabled boolean not null default false/i);
  assert.match(foundation, /check \(not odo_voice_enabled\)/i);
  assert.match(configurationAuthority, /drop constraint if exists live_odo_phase10b_human_loop_invariant/i);
  assert.match(configurationAuthority,
    /not music_enabled or \(odo_enabled and show_director_enabled\)/i);
});

test('Show Director and music storage are private, bounded and audited', () => {
  for (const table of [
    'live_odo_show_sessions', 'live_odo_show_actions', 'live_music_tracks',
    'live_music_session_state', 'live_music_events', 'live_odo_show_updates',
  ]) assert.match(foundation, new RegExp(`alter table public\\.${table} enable row level security`, 'i'));
  assert.match(foundation, /jsonb_array_length\(scene_history\) <= 12/i);
  assert.match(foundation, /idempotency_key uuid not null unique/i);
  assert.match(foundation, /alter publication supabase_realtime add table public\.live_odo_show_updates/i);
});

test('the approved catalogue accepts paths, never arbitrary URLs', () => {
  assert.match(foundation, /storage_bucket = 'live-program-music'/i);
  assert.match(foundation, /storage_path !~\* '\^\(https\?\|file\):'/i);
  assert.match(foundation, /license_status = 'approved'/i);
  assert.match(foundation, /licensed_regions @> array\['\*'\]::text\[\]/i);
  assert.doesNotMatch(functionBody(foundation, 'rpc_host_control_live_music_v1'),
    /p_(?:url|uri)|https?:\/\//i);
});

test('the deterministic Show Director cannot select a pair or mutate RTC', () => {
  const reconcile = functionBody(orchestrator, 'rpc_service_reconcile_live_odo_show_v1');
  assert.match(reconcile, /live_odo_full_quick_eligible_pairs_v1/i);
  assert.match(reconcile, /private_conversation_active/i);
  assert.doesNotMatch(reconcile, /participant_a_user_id\s*=|participant_b_user_id\s*=/i);
  assert.doesNotMatch(reconcile, /insert into public\.live_quick_connect_pairings/i);
  assert.doesNotMatch(reconcile, /provider_call_id|ISSUE_RTC|update public\.live_sessions set/i);
});

test('one shared Odo lease and server maintenance recover Show Director', () => {
  const reconcile = functionBody(orchestrator, 'rpc_service_reconcile_live_odo_show_v1');
  assert.match(reconcile, /live_odo_session_state/i);
  assert.match(reconcile, /lease_generation = lease_generation \+ 1/i);
  assert.match(orchestrator, /run_live_maintenance_without_show_director_v1/i);
  assert.match(orchestrator, /next_wake_at <= timezone\('utc', now\(\)\)/i);
  const acquire = functionBody(controlRecovery, 'rpc_acquire_live_program_control_v1');
  const maintenance = functionBody(controlRecovery, 'run_live_maintenance');
  assert.match(acquire, /next_wake_at = timezone\('utc', now\(\)\) \+ interval '30 seconds'/i);
  assert.match(maintenance, /control_lease_expires_at <= timezone\('utc', now\(\)\)/i);
});

test('Edge requests cannot inject a scene, person, track, prompt or action', () => {
  assert.match(showDeno, /npm:@supabase\/supabase-js@2\.110\.7/i);
  assert.match(musicDeno, /npm:@supabase\/supabase-js@2\.110\.7/i);
  assert.match(showEdge, /Object\.keys\(value\)\.length !== 1/i);
  assert.match(showEdge, /rpc_service_reconcile_live_odo_show_v1/i);
  assert.doesNotMatch(showEdge, /body\.(?:scene|action|track|pair|person|prompt|model)/i);
  assert.match(musicEdge, /rpc_service_get_live_music_playback_v1/i);
  assert.match(musicEdge, /createSignedUrl/i);
  assert.doesNotMatch(musicEdge, /body\.(?:track|path|bucket|url|uri)/i);
});

test('private experiences and publisher devices fail closed for music', () => {
  const playback = functionBody(musicPolicyHardening, 'rpc_service_get_live_music_playback_v1');
  assert.match(playback, /private_experience_music_forbidden/i);
  assert.match(playback, /publisher_device_mix_unsupported/i);
  assert.match(playback, /live_private_sparks/i);
  assert.match(route, /allowMusicPlayback: isLive && !canPublish/i);
});

test('music kill switches are rechecked and Host overrides suppress Odo', () => {
  const playback = functionBody(musicPolicyHardening,
    'rpc_service_get_live_music_playback_v1');
  const hostMusic = functionBody(musicPolicyHardening,
    'rpc_host_control_live_music_v1');
  assert.match(playback, /not coalesce\(v_config\.music_enabled, false\)/i);
  assert.match(playback, /v_config\.circuit_breaker_open/i);
  assert.match(hostMusic, /host_suppression_ends_at = greatest/i);
  assert.match(hostMusic, /p_action <> 'stop'/i);
});

test('runtime hardening audits automatic music and cleans up ended shows', () => {
  const reconcile = functionBody(hardening, 'rpc_service_reconcile_live_odo_show_v1');
  assert.match(reconcile, /insert into public\.live_music_events/i);
  assert.match(reconcile, /SHOW_INTERMISSION_ENDED/i);
  assert.match(reconcile, /enabled = case when v_session\.status = 'live'/i);
});

test('Odo Stage is code-native and respects reduced motion', () => {
  const stage = readFileSync('features/live/components/OdoProgramStage.tsx', 'utf8');
  assert.match(stage, /AccessibilityInfo\.isReduceMotionEnabled/i);
  assert.match(stage, /reduceMotionChanged/i);
  assert.match(stage, /BETWEENER · INTERMISSION/i);
  assert.doesNotMatch(stage, /require\(['"].*\.(?:png|jpe?g|gif)['"]\)/i);
});
