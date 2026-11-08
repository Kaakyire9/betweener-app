import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const adminHub = readFileSync('app/admin.tsx', 'utf8');
const community = readFileSync('app/admin-community.tsx', 'utf8');
const editorial = readFileSync('app/admin-editorial.tsx', 'utf8');
const liveOperations = readFileSync('app/admin-live.tsx', 'utf8');
const commerce = readFileSync('app/admin-commerce.tsx', 'utf8');
const creatorWorkspace = readFileSync('app/circles/manage.tsx', 'utf8');
const studio = readFileSync('app/studio.tsx', 'utf8');
const studioModules = readFileSync('features/studio/config/studio-modules.ts', 'utf8');
const circleComposer = readFileSync('features/studio/circles/CircleComposer.tsx', 'utf8');
const gatheringComposer = readFileSync('features/studio/gatherings/GatheringComposer.tsx', 'utf8');
const explore = readFileSync('app/(tabs)/explore.tsx', 'utf8');
const access = readFileSync('lib/admin/admin-access.ts', 'utf8');
const internalTools = readFileSync('lib/internal-tools.ts', 'utf8');
const migration = readFileSync('supabase/migrations/20261007180000_admin_operations_context.sql', 'utf8');

test('operations hub routes each responsibility to a focused workspace', () => {
  for (const route of [
    '/studio',
    '/admin-community',
    '/admin-live',
    '/admin-trust',
    '/admin-accounts',
    '/admin-commerce',
  ]) {
    assert.match(adminHub, new RegExp(route));
  }
  assert.doesNotMatch(adminHub, /AdminVerificationDashboard/);
});

test('community and editorial queues are separated from personal creator work', () => {
  assert.match(community, /rpc_admin_get_circles_queue/);
  assert.match(community, /rpc_admin_get_gatherings_queue/);
  assert.match(editorial, /rpc_admin_get_relationship_gists/);
  assert.doesNotMatch(creatorWorkspace, /rpc_admin_get_relationship_gists/);
  assert.doesNotMatch(creatorWorkspace, /Relationship Gist editorial/);
  assert.match(creatorWorkspace, /Circle & Gathering Studio/);
  assert.doesNotMatch(creatorWorkspace, /router\.push\('\/admin-editorial'\)/);
  assert.doesNotMatch(explore, /Editorial studio/);
  assert.match(studioModules, /title: 'Relationship Gists'/);
  assert.match(studioModules, /AI Editorial Studio/);
});

test('Betweener Studio centralizes creation without centralizing backend authorization', () => {
  for (const label of ['Schedule Live', 'Create Circle', 'Create Gathering', 'Create Gist']) {
    assert.match(studioModules, new RegExp(label));
  }
  assert.match(studio, /access\.can\('editorial'\)/);
  assert.match(studio, /canCreateCircle/);
  assert.match(studio, /canCreateGathering/);
  assert.match(studio, /canSchedule/);
  assert.match(circleComposer, /Submit for review/);
  assert.match(gatheringComposer, /Submit for review/);
});

test('Circles overflow menu does not duplicate Studio creation actions', () => {
  const menuStart = explore.indexOf('visible={actionsMenuOpen}');
  const menuEnd = explore.indexOf('visible={commandOpen}', menuStart);
  const overflowMenu = explore.slice(menuStart, menuEnd);

  assert.ok(menuStart >= 0 && menuEnd > menuStart);
  assert.match(overflowMenu, /Betweener Studio/);
  assert.match(overflowMenu, /Circle Command/);
  assert.doesNotMatch(overflowMenu, />Create Circle</);
  assert.doesNotMatch(overflowMenu, />Create Gathering</);
});

test('admin access is server-authoritative and role-scoped', () => {
  assert.match(access, /rpc_get_my_admin_context/);
  assert.match(access, /rpc\('is_internal_admin'\)/);
  assert.doesNotMatch(internalTools, /EXPO_PUBLIC_ADMIN_EMAILS/);
  assert.match(migration, /from public\.internal_admins ia[\s\S]*where ia\.user_id = auth\.uid\(\)/i);
  assert.match(migration, /when 'super_admin'/);
  assert.match(migration, /when 'operations'/);
  assert.match(migration, /when 'moderation'/);
  assert.match(migration, /when 'support'/);
  assert.match(migration, /revoke all on function public\.rpc_get_my_admin_context\(\) from public, anon/i);
});

test('Live Operations is read-only and keeps rollout changes out of the app screen', () => {
  assert.match(liveOperations, /live_odo_configuration/);
  assert.match(liveOperations, /intentionally cannot change rollout flags/);
  assert.match(liveOperations, /Open Live Host Dashboard/);
  assert.match(liveOperations, /router\.push\('\/live'\)/);
  assert.doesNotMatch(liveOperations, /rpc_admin_update_live_studio_configuration_v1/);
  assert.doesNotMatch(liveOperations, /rpc_admin_set_live_studio_access_v1/);
});

test('eligible hosts always receive a discoverable Live entry from Circles', () => {
  assert.match(explore, /canSchedule: canHostLive/);
  assert.match(explore, /canHostLive \|\| gatheringLiveSessions\.length > 0/);
  assert.match(explore, /canSchedule=\{canHostLive\}/);
  assert.match(explore, /viewerProfileId=\{currentProfileId\}/);
  assert.match(explore, /onPress=\{\(\) => router\.push\('\/live'\)\}/);
  assert.doesNotMatch(explore, /canSchedule=\{false\}/);
});

test('Gathering and Live use distinct product language', () => {
  assert.match(studioModules, /Create Gathering/);
  assert.match(explore, /Host a Live/);
  assert.doesNotMatch(explore, />Request Gathering</);
  assert.doesNotMatch(explore, /handleCreateGatheringPress/);
  assert.doesNotMatch(explore, /rpc_create_circle_request/);
  assert.doesNotMatch(explore, /rpc_create_gathering_request/);
  assert.match(explore, /\/circles\/manage\?create=circle/);
});

test('membership repair derives RevenueCat provenance from the current runtime', () => {
  assert.match(commerce, /getRevenueCatBackfillEnvironment/);
  assert.match(access, /=== 'PRODUCTION' \? 'PRODUCTION' : 'SANDBOX'/);
  assert.doesNotMatch(commerce, /environment:\s*'PRODUCTION'/);
});
