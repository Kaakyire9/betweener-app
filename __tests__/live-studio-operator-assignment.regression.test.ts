import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(
  'supabase/migrations/20261016204403_live_studio_assign_operators.sql',
  'utf8',
);
const eventScreen = readFileSync('app/live/event/[sessionId].tsx', 'utf8');
const managementSheet = readFileSync(
  'features/live/components/LiveEventManagementSheet.tsx',
  'utf8',
);
const panel = readFileSync(
  'features/live/components/LiveOperatorAssignmentPanel.tsx',
  'utf8',
);
const studioPicker = readFileSync(
  'apps/studio/src/sessions/StudioSessionPicker.tsx',
  'utf8',
);

test('Studio operator assignments are scoped, expiring and private', () => {
  assert.match(migration, /create table public\.live_studio_session_operators/i);
  assert.match(migration, /unique \(session_id, user_id\)/i);
  assert.match(migration, /expires_at timestamptz not null/i);
  assert.match(migration, /force row level security/i);
  assert.match(
    migration,
    /revoke all on table public\.live_studio_session_operators[\s\S]*from public, anon, authenticated, service_role/i,
  );
  assert.match(migration, /where assignment\.session_id = p_session_id[\s\S]*assignment\.expires_at > timezone/i);
});

test('operator mutations require an admin and AAL2', () => {
  for (const rpc of [
    'rpc_admin_assign_live_studio_operator_v1',
    'rpc_admin_revoke_live_studio_operator_v1',
  ]) {
    const start = migration.indexOf(`function public.${rpc}`);
    assert.ok(start >= 0, `${rpc} must exist`);
    const body = migration.slice(start, start + 7000);
    assert.match(body, /public\.is_admin_user\(auth\.uid\(\)\)/i);
    assert.match(body, /public\.live_studio_has_aal2_v1\(\)/i);
  }
  assert.match(migration, /lower\(account\.email\) = lower\(btrim\(p_email\)\)/i);
  assert.match(migration, /p_operator_role not in \('viewer', 'producer', 'moderator'\)/i);
  assert.doesNotMatch(migration, /service_role.*rpc_admin_assign_live_studio_operator_v1/i);
});

test('session assignments are authoritative for discovery and role separation', () => {
  assert.match(migration, /v_assignment_role := public\.live_studio_session_operator_role_v1/i);
  assert.match(migration, /when 'control' then[\s\S]*v_assignment_role = 'producer'/i);
  assert.match(migration, /when 'publish' then[\s\S]*v_assignment_role = 'producer'/i);
  assert.match(migration, /when 'moderate' then v_assignment_role = 'moderator'/i);
  assert.match(migration, /public\.live_studio_session_operator_role_v1[\s\S]*access\.operator_role/i);
});

test('only Live admins see the operator assignment interface', () => {
  assert.match(eventScreen, /const canAssignOperators = adminAccess\.can\('live'\)/);
  assert.match(eventScreen, /const canOpenManagement = canManageSession \|\| canAssignOperators/);
  assert.match(eventScreen, /canAssignOperators=\{canAssignOperators\}/);
  assert.match(eventScreen, /canManageEvent=\{canManageSession\}/);
  assert.match(managementSheet, /canManageEvent \? <LiveHostingManagementPanel/);
  assert.match(managementSheet, /canAssignOperators \? <LiveOperatorAssignmentPanel/);
  assert.match(panel, /EXACT ACCOUNT EMAIL/);
  assert.match(panel, /Verify & assign/);
  assert.match(panel, /LiveStepUpSheet/);
});

test('Studio empty state distinguishes missing assignment from authentication', () => {
  assert.match(studioPicker, /No programmes assigned to this account/);
  assert.match(studioPicker, /Signing in and verifying your authenticator does not grant programme access/);
});
