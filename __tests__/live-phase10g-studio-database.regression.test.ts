import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const foundation = readFileSync('supabase/migrations/20260910120000_live_phase10g_program_foundation.sql', 'utf8');
const access = readFileSync('supabase/migrations/20260910121000_live_phase10g_studio_access_snapshot.sql', 'utf8');
const control = readFileSync('supabase/migrations/20260910122000_live_phase10g_program_control.sql', 'utf8');
const recovery = readFileSync('supabase/migrations/20260910123000_live_phase10g_media_and_recovery.sql', 'utf8');
const audience = readFileSync('supabase/migrations/20260910124000_live_phase10g_audience_program_snapshot.sql', 'utf8');
const clock = readFileSync('supabase/migrations/20260910125000_live_phase10g_maintenance_clock.sql', 'utf8');
const maintenanceRepair = readFileSync(
  'supabase/migrations/20260910130000_live_phase10g_phase10f_maintenance_repair.sql',
  'utf8',
);
const liveRoute = readFileSync('app/live/[sessionId].tsx', 'utf8');
const repository = readFileSync('features/live/application/live-repository.ts', 'utf8');

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

test('audience Program output exposes no Studio access or private matching data', () => {
  const body = functionBody(audience, 'rpc_get_live_program_snapshot_v2');
  assert.match(body, /live_participants/i);
  assert.match(body, /'ownerUserId', null/i);
  assert.match(body, /'sourceAssignments'/i);
  assert.doesNotMatch(body, /live_studio_access|compatibility_edges|private_spark|decision_graph/i);
  assert.match(repository, /rpc_get_live_program_snapshot_v2/i);
  assert.match(repository, /live_program_source_updates/i);
});

test('Program changes only the media-stage boundary, not Pulse or the footer', () => {
  const mediaStart = liveRoute.indexOf('const renderMediaStage');
  const program = liveRoute.indexOf('program={liveProgram.state?.program', mediaStart);
  const pulse = liveRoute.indexOf('<LiveConversationPanel');
  const footer = liveRoute.indexOf('<LiveControlDock');
  assert.ok(mediaStart >= 0 && program > mediaStart);
  assert.ok(pulse > program);
  assert.ok(footer > program);
});
