import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(
  'supabase/migrations/20261018034746_live_phase_c_broadcast_foundation.sql',
  'utf8',
);
const orchestrator = readFileSync(
  'supabase/functions/live-broadcast-orchestrator/index.ts',
  'utf8',
);

const functionBody = (name: string): string => migration.match(
  new RegExp(`create or replace function public\\.${name}[\\s\\S]*?\\n\\$\\$;`, 'i'),
)?.[0] ?? '';

test('Phase C capabilities ship closed with dependency constraints', () => {
  for (const flag of [
    'broadcast_compositor_enabled', 'broadcast_hls_enabled',
    'broadcast_recording_enabled', 'broadcast_captions_enabled',
    'broadcast_translation_enabled', 'broadcast_clips_enabled',
    'broadcast_highlights_enabled',
  ]) assert.match(migration, new RegExp(`${flag} boolean not null default false`, 'i'));
  assert.match(migration, /not broadcast_hls_enabled or broadcast_compositor_enabled/i);
  assert.match(migration, /not broadcast_translation_enabled or broadcast_captions_enabled/i);
  assert.match(migration, /not broadcast_highlights_enabled or broadcast_clips_enabled/i);
});

// Keep admission assertions colocated with the server boundary fixture.
test('compositor work is service-only, fenced and version-aware', () => {
  const claim = functionBody('rpc_service_claim_live_broadcast_v1');
  const heartbeat = functionBody('rpc_service_heartbeat_live_broadcast_v1');
  for (const body of [claim, heartbeat]) {
    assert.match(body, /live_odo_is_service_role/i);
    assert.match(body, /pg_advisory_xact_lock/i);
  }
  assert.match(claim, /lease_generation = case/i);
  assert.match(claim, /live_odo_show_sessions/i);
  assert.match(claim, /sourceAssignments/i);
  assert.match(heartbeat, /broadcast_lease_lost/i);
  assert.match(migration, /rpc_service_maintain_live_broadcast_v1/i);
  assert.match(migration, /for update skip locked/i);
  assert.match(migration, /run_live_maintenance_without_broadcast_phase_c_v1/i);
  assert.match(migration, /revoke all on function public\.rpc_service_claim_live_broadcast_v1\([\s\S]*?\) from public, anon, authenticated;/i);
  assert.match(migration, /grant execute on function public\.rpc_service_claim_live_broadcast_v1[\s\S]*to service_role/i);
});
test('audience delivery keeps interactive members on RTC and reveals HLS only when ready', () => {
  const delivery = functionBody('rpc_get_live_audience_delivery_v1');
  assert.match(delivery, /when v_interactive then 'rtc_interactive'/i);
  assert.match(delivery, /when v_hls_ready then 'hls_passive'/i);
  assert.match(delivery, /else 'rtc_fallback'/i);
  assert.match(delivery, /v_runtime\.compositor_status = 'live'/i);
  assert.match(delivery, /v_runtime\.hls_status = 'live'/i);
  assert.match(delivery, /'engagementTransport', 'supabase_realtime'/i);
});
test('recording and clip consent is explicit and private media has no artifact path', () => {
  assert.match(migration, /purpose in \('recording', 'clip'\)/i);
  assert.match(migration, /live_public_media_consent_ready_v1/i);
  assert.match(migration, /participant\.state in \('backstage', 'on_stage'\)/i);
  assert.doesNotMatch(migration, /private_spark_id|private_room_id|private_recording/i);
});
test('artifact metadata is allowlisted and storage rows have no direct member access', () => {
  const metadataGuard = functionBody('live_broadcast_artifact_metadata_safe_v1');
  assert.match(metadataGuard, /translationLanguages/i);
  assert.match(metadataGuard, /return false/i);
  for (const forbidden of [
    'reactions', 'comments', 'privateMessages', 'sparkDecision', 'audiencePulseBallots',
  ]) assert.doesNotMatch(metadataGuard, new RegExp(forbidden, 'i'));
  assert.match(migration, /revoke all on table public\.live_broadcast_runtimes,[\s\S]*from public, anon, authenticated/i);
});

test('worker admission is secret-gated and returns scoped Stream credentials', () => {
  assert.match(orchestrator, /x-broadcast-worker-token/i);
  assert.match(orchestrator, /constantTimeEqual/i);
  assert.match(orchestrator, /BROADCAST_COMPOSITOR_WORKER_TOKEN/i);
  assert.match(orchestrator, /rpc_service_claim_live_broadcast_v1/i);
  assert.match(orchestrator, /generateCallToken/i);
  assert.match(orchestrator, /grant_permissions: \['send-audio', 'send-video'\]/i);
  assert.match(orchestrator, /revoke_permissions: \['screenshare'\]/i);
  assert.doesNotMatch(orchestrator, /console\.(?:log|info|warn|error)\([^\n]*(?:streamKey|callToken|rtmpAddress)/i);
});
