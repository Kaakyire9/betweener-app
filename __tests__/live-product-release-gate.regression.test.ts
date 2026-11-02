import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const root = process.cwd();
const read = (path: string) => readFileSync(`${root}/${path}`, 'utf8');

test('the mobile release fence keeps Live staging-only', () => {
  const gate = read('features/live/config/live-product-release.ts');
  assert.match(gate, /APP_VARIANT === 'staging'/);
  assert.match(gate, /configured !== 'false'/);
  assert.doesNotMatch(gate, /configured === 'true'\s*\|\|/);
});

test('all public Live routes redirect when the release gate is closed', () => {
  const layout = read('app/live/_layout.tsx');
  assert.match(layout, /if \(!LIVE_PRODUCT_ENABLED\)/);
  assert.match(layout, /<Redirect href="\/live-unavailable"/);

  const adminLive = read('app/admin-live.tsx');
  assert.match(adminLive, /LIVE_PRODUCT_ENABLED/);
  assert.match(adminLive, /<Redirect href="\/live-unavailable"/);
});

test('production discovery surfaces and background subscriptions honor the gate', () => {
  assert.match(read('app/studio.tsx'), /live: LIVE_PRODUCT_ENABLED && canSchedule/);
  assert.match(read('app/admin.tsx'), /module\.capability !== 'live' \|\| LIVE_PRODUCT_ENABLED/);
  assert.match(read('app/(tabs)/explore.tsx'), /LIVE_PRODUCT_ENABLED && homeMode === 'mine'/);
  assert.match(read('app/circles/[id].tsx'), /LIVE_PRODUCT_ENABLED && activeTab === 'live'/);
  assert.match(read('features/live/hooks/use-live-sessions.ts'), /enabled = LIVE_PRODUCT_ENABLED/);
  assert.match(read('features/live/hooks/use-circle-live.ts'), /LIVE_PRODUCT_ENABLED && enabled/);
});

test('Live notification delivery and deep links are suppressed while closed', () => {
  const routing = read('lib/notifications/notification-routing.ts');
  assert.match(routing, /pushType\?\.startsWith\("live_"\)/);
  assert.match(routing, /route === "\/live" \|\| route\.startsWith\("\/live\/"\)/);

  const toasts = read('components/InAppToasts.tsx');
  assert.match(toasts, /if \(!LIVE_PRODUCT_ENABLED \|\| !user\?\.id\) return/);
  assert.match(toasts, /if \(!LIVE_PRODUCT_ENABLED\) return/);
});

test('the server gate fails closed across discovery, admission and media tokens', () => {
  const migration = read('supabase/migrations/20261027102730_live_product_release_gate.sql');
  assert.match(migration, /live_product_enabled boolean not null default false/);
  assert.match(migration, /live_sessions_product_gate_v1/);
  assert.match(migration, /live_participants_product_gate_v1/);
  assert.match(migration, /if not public\.live_product_is_enabled_v1\(\) then return false/);
  assert.match(migration, /grant execute on function public\.rpc_get_live_product_availability_v1\(\)/);

  for (const functionName of [
    'live-rtc-token',
    'live-studio-media-token',
    'live-quick-connect-token',
    'live-private-spark-token',
  ]) {
    const source = read(`supabase/functions/${functionName}/index.ts`);
    assert.match(source, /isLiveProductEnabled/);
    assert.match(source, /live_product_disabled/);
  }
});
