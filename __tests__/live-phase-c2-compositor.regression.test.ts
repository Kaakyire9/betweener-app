import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(
  'supabase/migrations/20261018041046_live_phase_c2_compositor_runtime.sql',
  'utf8',
);
const orchestrator = readFileSync(
  'supabase/functions/live-broadcast-orchestrator/index.ts',
  'utf8',
);
const worker = readFileSync('apps/program-compositor-worker/src/worker.mjs', 'utf8');
const renderer = readFileSync(
  'apps/program-compositor-worker/renderer/ProgramCanvas.tsx',
  'utf8',
);
const dockerfile = readFileSync('apps/program-compositor-worker/Dockerfile', 'utf8');

test('service snapshot is lease-fenced and unavailable to members', () => {
  assert.match(migration, /live_odo_is_service_role/i);
  assert.match(migration, /worker_instance_id = p_worker_instance_id/i);
  assert.match(migration, /lease_generation = p_lease_generation/i);
  assert.match(migration, /lease_expires_at > v_now/i);
  assert.match(migration, /revoke all on function public\.rpc_service_get_live_broadcast_snapshot_v1[\s\S]*from public, anon, authenticated/i);
  assert.match(migration, /grant execute on function public\.rpc_service_get_live_broadcast_snapshot_v1[\s\S]*to service_role/i);
});

test('credential refresh first proves the active compositor lease', () => {
  assert.match(orchestrator, /action === 'snapshot' \|\| action === 'credentials'/i);
  assert.match(orchestrator, /rpc_service_get_live_broadcast_snapshot_v1/i);
  assert.match(orchestrator, /snapshot\?\.available !== true/i);
  assert.match(orchestrator, /generateCallToken/i);
});

test('worker publishes one fenced RTMP programme and never logs credentials', () => {
  assert.match(worker, /buildFfmpegArguments/i);
  assert.match(worker, /buildRtmpTarget/i);
  assert.match(worker, /broadcast_compositor_lease_lost/i);
  assert.match(worker, /x-broadcast-worker-token/i);
  assert.match(worker, /x-compositor-nonce/i);
  assert.doesNotMatch(worker, /this\.log\([^\n]*(?:callToken|streamKey|rtmpAddress)/i);
});

test('renderer consumes only the public Program source graph', () => {
  assert.match(renderer, /sourceAssignments/i);
  assert.match(renderer, /providerUserId/i);
  assert.doesNotMatch(renderer, /roomParticipants\[0\]|roomParticipants\.slice\(0/i);
  assert.match(renderer, /Programme standby/i);
  assert.match(renderer, /\['audio_host', 'audio_screen', 'audio_atmosphere'\]/i);
  assert.match(renderer, /!source\.hasAudio/i);
  assert.doesNotMatch(renderer, /renderedParticipants\.forEach/i);
  for (const forbidden of ['reaction', 'privateMessage', 'sparkDecision', 'ballot']) {
    assert.doesNotMatch(renderer, new RegExp(forbidden, 'i'));
  }
});

test('container runs the compositor as an unprivileged user', () => {
  assert.match(dockerfile, /USER node/i);
  assert.match(dockerfile, /chromium dbus ffmpeg/i);
  assert.match(dockerfile, /pulseaudio pulseaudio-utils xvfb/i);
  assert.match(dockerfile, /ARG ADAPTIVE_STAGE_V2_SHADOW_ENABLED=false/i);
  assert.match(dockerfile, /VITE_ADAPTIVE_STAGE_V2_SHADOW_ENABLED=\$ADAPTIVE_STAGE_V2_SHADOW_ENABLED/i);
  assert.match(dockerfile, /ARG ADAPTIVE_STAGE_V2_DIAGNOSTICS_ENABLED=false/i);
  assert.match(dockerfile, /VITE_ADAPTIVE_STAGE_V2_DIAGNOSTICS_ENABLED=\$ADAPTIVE_STAGE_V2_DIAGNOSTICS_ENABLED/i);
  assert.match(dockerfile, /ARG ADAPTIVE_STAGE_V2_COMPOSITOR_RENDER_ENABLED=false/i);
  assert.match(dockerfile, /VITE_ADAPTIVE_STAGE_V2_COMPOSITOR_RENDER_ENABLED=\$ADAPTIVE_STAGE_V2_COMPOSITOR_RENDER_ENABLED/i);
});
