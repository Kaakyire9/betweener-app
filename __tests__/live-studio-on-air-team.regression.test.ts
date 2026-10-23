import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(
  'supabase/migrations/20261018222415_live_studio_on_air_team.sql',
  'utf8',
);
const rlsHardeningMigration = readFileSync(
  'supabase/migrations/20261019113811_live_studio_team_rls_helper_private.sql',
  'utf8',
);
const api = readFileSync('apps/studio/src/api/studio-api.ts', 'utf8');
const panel = readFileSync('apps/studio/src/panels/StudioTeamPanel.tsx', 'utf8');
const workspace = readFileSync('apps/studio/src/workspace/StudioWorkspace.tsx', 'utf8');
const eventScreen = readFileSync('app/live/event/[sessionId].tsx', 'utf8');
const liveRoom = readFileSync('app/live/[sessionId].tsx', 'utf8');

test('on-air co-hosts are expiring and do not replace creator ownership', () => {
  assert.match(migration, /create table public\.live_session_on_air_hosts/i);
  assert.match(migration, /expires_at timestamptz not null/i);
  assert.match(migration, /status in \('active', 'revoked'\)/i);
  assert.match(migration, /select 'host'[\s\S]*live_session_has_active_on_air_host_v1/i);

  const assignStart = migration.indexOf('function public.rpc_admin_assign_live_on_air_host_v1');
  const assignBody = migration.slice(assignStart, assignStart + 9000);
  assert.match(assignBody, /'backstage', 'live'/i);
  assert.doesNotMatch(assignBody, /update public\.live_sessions[\s\S]*created_by_user_id/i);
});

test('team mutations retain admin and AAL2 boundaries with immutable audit', () => {
  for (const rpc of [
    'rpc_admin_assign_live_on_air_host_v1',
    'rpc_admin_revoke_live_on_air_host_v1',
  ]) {
    const start = migration.indexOf(`function public.${rpc}`);
    assert.ok(start >= 0, `${rpc} must exist`);
    const body = migration.slice(start, start + 6500);
    assert.match(body, /public\.is_admin_user\(auth\.uid\(\)\)/i);
    assert.match(body, /public\.live_studio_has_aal2_v1\(\)/i);
    assert.match(body, /live_studio_operational_events/i);
    assert.match(body, /live_session_events/i);
  }
});

test('team changes have a private Realtime invalidation stream', () => {
  assert.match(migration, /create table public\.live_studio_team_updates/i);
  assert.match(migration, /enable row level security/i);
  assert.match(migration, /live_studio_team_updates_select_authorized/i);
  assert.match(migration, /alter publication supabase_realtime add table public\.live_studio_team_updates/i);
  assert.match(migration, /live_studio_session_operators_team_revision/i);
  assert.match(migration, /live_session_on_air_hosts_team_revision/i);
  assert.match(api, /subscribeTeam\(sessionId[\s\S]*live_studio_team_updates/i);
  assert.match(rlsHardeningMigration, /function private\.live_studio_can_receive_team_updates_v1/i);
  assert.match(rlsHardeningMigration, /drop function public\.live_studio_can_receive_team_updates_v1/i);
});

test('Studio exposes one AAL2-protected Team and Roles surface', () => {
  assert.match(workspace, /<StudioTeamPanel sessionId=\{sessionId\} authorize=\{stepUp\.runWithStepUp\}/);
  assert.match(panel, /TEAM &amp; ROLES/);
  assert.match(panel, /Assign operator/);
  assert.match(panel, /Add co-host/);
  assert.match(panel, /ownership preserved/);
  assert.match(panel, /authorize\('assign on-air co-host'/);
});

test('mobile management follows server host capability while live', () => {
  assert.match(migration, /'canManageSession', v_can_manage/i);
  assert.match(eventScreen, /hosting\.snapshot\?\.canManageSession === true/);
  assert.match(liveRoom, /const hasHostAuthority = canManageStage[\s\S]*live\.view_host_console/);
  assert.match(liveRoom, /const isRoomHost =[\s\S]*\|\| hasHostAuthority/);
});
