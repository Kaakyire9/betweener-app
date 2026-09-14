import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const foundation = readFileSync('supabase/migrations/20260910120000_live_phase10g_program_foundation.sql', 'utf8');
const access = readFileSync('supabase/migrations/20260910121000_live_phase10g_studio_access_snapshot.sql', 'utf8');
const control = readFileSync('supabase/migrations/20260910122000_live_phase10g_program_control.sql', 'utf8');
const recovery = readFileSync('supabase/migrations/20260910123000_live_phase10g_media_and_recovery.sql', 'utf8');
const audience = readFileSync('supabase/migrations/20260910124000_live_phase10g_audience_program_snapshot.sql', 'utf8');
const clock = readFileSync('supabase/migrations/20260910125000_live_phase10g_maintenance_clock.sql', 'utf8');
const musicControlCoreRestore = readFileSync(
  'supabase/migrations/20260914122000_live_music_control_core_restore.sql',
  'utf8',
);
const maintenanceRepair = readFileSync(
  'supabase/migrations/20260910130000_live_phase10g_phase10f_maintenance_repair.sql',
  'utf8',
);
const hostDisconnect = readFileSync(
  'supabase/migrations/20260911100000_live_phase10g_host_disconnect_and_capacity.sql',
  'utf8',
);
const audioTransport = readFileSync(
  'supabase/migrations/20260912090000_live_program_audio_transport.sql',
  'utf8',
);
const lifecycleRecovery = readFileSync(
  'supabase/migrations/20260912100000_live_studio_media_lifecycle_recovery.sql',
  'utf8',
);
const musicLibraryAtmosphere = readFileSync(
  'supabase/migrations/20260912110000_live_music_library_and_stage_atmosphere.sql',
  'utf8',
);
const musicStagePresentation = readFileSync(
  'supabase/migrations/20260912190000_live_music_stage_presentation.sql',
  'utf8',
);
const liveRoute = readFileSync('app/live/[sessionId].tsx', 'utf8');
const repository = readFileSync('features/live/application/live-repository.ts', 'utf8');
const directorHook = readFileSync(
  'features/live/odo/show/use-live-odo-show-director.ts',
  'utf8',
);
const directorPanel = readFileSync('features/live/components/OdoShowDirectorPanel.tsx', 'utf8');
const musicAdminFunction = readFileSync(
  'supabase/functions/live-music-library-admin/index.ts',
  'utf8',
);
const health = readFileSync('supabase/verification/live_odo_phase10g_health.sql', 'utf8');

const functionBody = (source: string, name: string): string => source.match(
  new RegExp(`create or replace function public\\.${name}[\\s\\S]*?\\n\\$\\$;`, 'i'),
)?.[0] ?? '';

test('10G starts closed and configuration dependencies fail closed', () => {
  assert.match(foundation, /studio_session_discovery_enabled boolean not null default false/i);
  assert.match(foundation, /studio_media_publishing_enabled boolean not null default false/i);
  assert.match(foundation, /studio_screen_audio_enabled boolean not null default false/i);
  assert.match(foundation, /studio_external_audio_enabled boolean not null default false/i);
  assert.match(foundation, /not screen_share_enabled or studio_media_publishing_enabled/i);
  assert.match(foundation, /studio_closed_beta boolean not null default true/i);
});

test('10G preserves the executable Phase 10F opportunity maintenance chain', () => {
  assert.match(
    maintenanceRepair,
    /create or replace function public\.live_odo_maintain_opportunities_base_10f_v1\(\)/i,
  );
  assert.match(maintenanceRepair, /live_odo_is_service_role\(\)/i);
  assert.match(maintenanceRepair, /status = 'expired'/i);
  assert.match(maintenanceRepair, /opportunity\.state in \(/i);
  assert.match(maintenanceRepair, /revoke all on function[\s\S]*service_role/i);
});

test('Programme Audio retains an executable private host music control chain', () => {
  assert.match(musicControlCoreRestore, /create or replace function public\.live_odo_host_music_control_base_10f_v1/i);
  assert.match(musicControlCoreRestore, /update public\.live_music_session_state/i);
  assert.match(musicControlCoreRestore, /insert into public\.live_music_events/i);
  assert.doesNotMatch(musicControlCoreRestore, /rpc_host_control_live_music_without_always_on_10f_v1/i);
  assert.match(musicControlCoreRestore, /revoke all on function[\s\S]*authenticated, service_role/i);
});

test('Studio storage is RLS protected with no authenticated direct writes', () => {
  for (const table of [
    'live_studio_access', 'live_program_sources', 'live_program_command_events',
    'live_program_source_updates',
  ]) assert.match(foundation, new RegExp(`alter table public\\.${table} enable row level security`, 'i'));
  assert.match(foundation, /revoke all on table public\.live_program_sources, public\.live_program_command_events[\s\S]*authenticated/i);
  assert.match(foundation, /revoke insert, update, delete on table public\.live_program_source_updates[\s\S]*authenticated/i);
});

test('closed-beta authorization combines rollout, role and narrow capability', () => {
  const body = functionBody(access, 'live_studio_is_authorized_v1');
  assert.match(body, /studio_session_discovery_enabled/i);
  assert.match(body, /studio_closed_beta/i);
  assert.match(body, /live\.view_host_console/i);
  assert.match(body, /live\.publish/i);
  assert.match(body, /live\.view_safety_console/i);
  assert.match(body, /p_capability not in \('view','control','publish','screen_share','external_audio','moderate'\)/i);
});

test('TAKE and controller acquisition are fenced, serialized and idempotent', () => {
  const takeControl = functionBody(control, 'rpc_studio_take_live_program_control_v1');
  const take = functionBody(control, 'rpc_studio_take_live_program_v1');
  for (const body of [takeControl, take]) {
    assert.match(body, /pg_advisory_xact_lock/i);
    assert.match(body, /p_expected_controller_generation/i);
    assert.match(body, /p_expected_program_version/i);
    assert.match(body, /p_command_id/i);
    assert.match(body, /live_program_command_events/i);
  }
  assert.match(take, /controller_instance_id <> p_controller_instance_id/i);
  assert.match(take, /control_lease_expires_at <= v_now/i);
  assert.match(take, /live_program_assignment_error_v1/i);
  assert.match(control, /studio_versioned_control_required/i);
});

test('browser sources are bound to their owner and lost sources trigger audited fallback', () => {
  const upsert = functionBody(control, 'rpc_studio_upsert_live_program_source_v1');
  const endSource = functionBody(control, 'rpc_studio_end_live_program_source_v1');
  const maintain = functionBody(recovery, 'rpc_service_maintain_live_studio_program_v1');
  assert.match(upsert, /'studio-' \|\| replace\(auth\.uid\(\)::text, '-', ''\) \|\| '-%'/i);
  assert.match(upsert, /where public\.live_program_sources\.owner_user_id = auth\.uid\(\)/i);
  assert.match(endSource, /program_version = program_version \+ 1/i);
  assert.match(maintain, /source\.source_key like 'studio:%'/i);
  assert.match(maintain, /'FALLBACK'[\s\S]*'program_source_lost'/i);
  assert.match(clock, /rpc_service_maintain_live_studio_program_v1\(100\)/i);
});

test('Studio recovery tolerates background sharing without bypassing Odo safety', () => {
  const takeControl = functionBody(
    lifecycleRecovery,
    'rpc_studio_take_live_program_control_v1',
  );
  const endSource = functionBody(
    lifecycleRecovery,
    'rpc_studio_end_live_program_source_v1',
  );
  const resumeOdo = functionBody(lifecycleRecovery, 'rpc_studio_resume_live_odo_v1');
  const maintain = functionBody(
    lifecycleRecovery,
    'rpc_service_maintain_live_studio_program_v1',
  );
  assert.match(lifecycleRecovery, /studio_controller_lease_seconds, 90/i);
  assert.match(lifecycleRecovery, /studio_controller_grace_seconds, 30/i);
  assert.match(takeControl, /autopilot_state = 'paused_by_policy'[\s\S]*then 'paused_by_policy'/i);
  assert.match(resumeOdo, /v_odo\.autopilot_state = 'paused_by_policy'/i);
  assert.match(maintain, /interval '120 seconds'/i);
  assert.match(maintain, /v_command_id := gen_random_uuid\(\);[\s\S]*program_source_lost/i);
  assert.match(endSource, /v_source\.source_role <> 'visual'/i);
  assert.match(endSource, /live_program_safe_fallback_v1/i);
});

test('mobile Host can disconnect Studio without ending the Live', () => {
  const body = functionBody(hostDisconnect, 'rpc_host_disconnect_live_studio_v1');
  assert.match(body, /live_odo_show_host_allowed_v1\(p_session_id, auth\.uid\(\)\)/i);
  assert.match(body, /pg_advisory_xact_lock/i);
  assert.match(body, /source_key like 'studio:%'/i);
  assert.match(body, /during that preparation window/i);
  assert.match(body, /\('studio-host'\), \('dj-audio'\)/i);
  assert.match(body, /readiness = 'ended', health = 'lost', muted = true/i);
  assert.match(body, /current_scene = fallback_scene/i);
  assert.match(body, /when v_show\.enabled[\s\S]*then 'odo'[\s\S]*else 'mobile_host'/i);
  assert.match(body, /'RELEASE_CONTROL', 'mobile_host'/i);
  assert.match(body, /command_already_applied/i);
  assert.doesNotMatch(body, /status\s*=\s*'ended'/i);
  assert.match(repository, /functions\.invoke\('live-studio-disconnect'/i);
  assert.match(directorHook, /disconnectStudio/i);
  assert.match(directorPanel, /Disconnect Betweener Studio\?/i);
  assert.match(directorPanel, /state\.controlSource === 'studio_host'/i);
});

test('public stage remains four people while Program permits one Studio screen', () => {
  assert.match(hostDisconnect, /complete human panel; a screen never becomes guest_4/i);
  assert.match(hostDisconnect, /program_visual_capacity_exceeded/i);
  assert.match(hostDisconnect, /\) > 5/i);
  assert.match(hostDisconnect, /'host','guest_1','guest_2','guest_3'\)\) > 4/i);
});

test('screen audio and Programme Music repeat stay separately gated and authoritative', () => {
  const repeatControl = functionBody(audioTransport, 'rpc_host_control_live_music_v1');
  const completion = functionBody(
    audioTransport,
    'rpc_service_complete_live_music_playback_v1',
  );
  assert.match(audioTransport, /repeat_mode text not null default 'off'/i);
  assert.match(repeatControl, /'repeat_off', 'repeat_one', 'repeat_all'/i);
  assert.match(repeatControl, /live_odo_host_music_control_base_10f_v1/i);
  assert.match(completion, /p_expected_state_version/i);
  assert.match(completion, /track_still_playing/i);
  assert.match(completion, /music_repeat_all_advanced/i);
  assert.match(completion, /live_odo_is_service_role/i);
  assert.match(liveRoute, /allowMusicPlayback: false/i);
});

test('global music catalogue is licensed, sanitized and reusable by every authorized Live', () => {
  const catalogue = functionBody(musicLibraryAtmosphere, 'rpc_get_live_music_catalogue_v1');
  assert.match(catalogue, /live\.view_host_console/i);
  assert.match(catalogue, /live_studio_is_authorized_v1/i);
  assert.match(catalogue, /license_status = 'approved'/i);
  assert.match(catalogue, /licensed_regions @> array\['\*'\]/i);
  assert.match(catalogue, /live_music_playlists/i);
  assert.doesNotMatch(catalogue, /storage_path|storage_bucket|license_reference/i);
  const publish = functionBody(
    musicLibraryAtmosphere,
    'rpc_admin_publish_live_music_track_v2',
  );
  assert.match(publish, /is_admin_user\(auth\.uid\(\)\)/i);
  assert.match(publish, /storage\.objects/i);
  assert.match(publish, /license_status, license_reference/i);
  assert.match(publish, /contains_vocals/i);
  assert.match(musicAdminFunction, /caller\.auth\.getUser\(\)/i);
  assert.match(musicAdminFunction, /service\.rpc\('is_admin_user'/i);
  assert.match(musicAdminFunction, /MAX_BYTES = 50 \* 1024 \* 1024/i);
  assert.match(musicAdminFunction, /rpc_admin_publish_live_music_track_v2/i);
  assert.match(musicAdminFunction, /remove\(\[uploadedPath\]\)/i);
  assert.doesNotMatch(musicAdminFunction, /p_enabled/i);
  assert.match(health, /configuration\.music_enabled/i);
});

test('Host Music stage is fenced, reversible and restored when programme audio stops', () => {
  const setMusicStage = functionBody(
    musicStagePresentation,
    'rpc_host_set_live_music_stage_v1',
  );
  const restoreMusicStage = functionBody(
    musicStagePresentation,
    'live_program_restore_music_stage_v1',
  );
  const restoreOnStop = functionBody(
    musicStagePresentation,
    'live_program_restore_music_stage_on_stop_v1',
  );
  assert.match(setMusicStage, /live_odo_show_host_allowed_v1/i);
  assert.match(setMusicStage, /p_expected_version/i);
  assert.match(setMusicStage, /pg_advisory_xact_lock/i);
  assert.match(setMusicStage, /studio_control_active/i);
  assert.match(setMusicStage, /active_music_required/i);
  assert.match(setMusicStage, /music_stage_return_state = jsonb_build_object/i);
  assert.match(setMusicStage, /'SHOW_MUSIC'/i);
  assert.match(restoreMusicStage, /source_assignments = v_assignments/i);
  assert.match(restoreMusicStage, /music_stage_return_state = '\{\}'::jsonb/i);
  assert.match(restoreMusicStage, /'RESTORE_STAGE'/i);
  assert.match(restoreOnStop, /new\.status = 'stopped'/i);
  assert.match(restoreOnStop, /music_stage_return_state <> '\{\}'::jsonb/i);
  assert.match(musicStagePresentation, /after update of status, track_id/i);
  assert.match(health, /20260912190000/i);
  assert.match(health, /rpc_host_set_live_music_stage_v1\(uuid,boolean,bigint,uuid\)/i);
});

test('Stage Atmosphere is host-controlled, version-fenced and participant-readable', () => {
  const setter = functionBody(
    musicLibraryAtmosphere,
    'rpc_host_set_live_stage_atmosphere_v1',
  );
  const snapshot = functionBody(
    musicLibraryAtmosphere,
    'rpc_get_live_stage_atmosphere_v1',
  );
  assert.match(musicLibraryAtmosphere, /alter table public\.live_stage_atmospheres enable row level security/i);
  assert.match(musicLibraryAtmosphere, /alter publication supabase_realtime add table public\.live_stage_atmospheres/i);
  assert.match(setter, /live\.manage_stage/i);
  assert.match(setter, /p_expected_version/i);
  assert.match(setter, /pg_advisory_xact_lock/i);
  assert.match(setter, /live_stage_atmosphere_events/i);
  assert.match(setter, /event_media,poster_path/i);
  assert.match(snapshot, /live_participants/i);
});

test('audience Program output exposes no Studio access or private matching data', () => {
  const body = functionBody(audience, 'rpc_get_live_program_snapshot_v2');
  assert.match(body, /live_participants/i);
  assert.match(body, /'ownerUserId', null/i);
  assert.match(body, /'sourceAssignments'/i);
  assert.doesNotMatch(body, /live_studio_access|compatibility_edges|private_spark|decision_graph/i);
  assert.match(repository, /rpc_get_live_program_snapshot_v2/i);
  assert.match(repository, /live_program_source_updates/i);
});

test('Program changes only the media-stage boundary, not Pulse or active media controls', () => {
  const mediaStart = liveRoute.indexOf('const renderMediaStage');
  const program = liveRoute.indexOf('program={liveProgram.state?.program', mediaStart);
  const pulse = liveRoute.indexOf('<LiveConversationPanel');
  const footer = liveRoute.indexOf('<LiveControlDock');
  assert.ok(mediaStart >= 0 && program > mediaStart);
  assert.ok(pulse > program);
  assert.ok(footer > program);
  assert.match(liveRoute, /accessibilityLabel="Leave stage"/);
  assert.match(liveRoute, /media\.setAudioEnabled/);
  assert.match(liveRoute, /media\.setVideoEnabled/);
  assert.doesNotMatch(liveRoute, /Ask to join stage/);
});
