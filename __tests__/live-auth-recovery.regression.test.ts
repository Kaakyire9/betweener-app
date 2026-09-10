import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const authContext = readFileSync(
  new URL('../lib/auth-context.tsx', import.meta.url),
  'utf8',
);
const supabaseSource = readFileSync(
  new URL('../lib/supabase.ts', import.meta.url),
  'utf8',
);
const liveSessionsHook = readFileSync(
  new URL('../features/live/hooks/use-live-sessions.ts', import.meta.url),
  'utf8',
);
const liveHome = readFileSync(
  new URL('../app/live/index.tsx', import.meta.url),
  'utf8',
);
const liveSchedule = readFileSync(
  new URL('../app/live/schedule.tsx', import.meta.url),
  'utf8',
);

test('persisted profile fallback never authorizes protected writes', () => {
  assert.match(
    authContext,
    /canPerformAuthenticatedWrites:\s*authStatus === 'authenticated' && !!session\?\.user/,
  );
  assert.match(authContext, /retrySessionRecovery: \(reason = 'manual_retry'\)/);
  assert.match(authContext, /maxRefreshAttempts: 2/);
  assert.doesNotMatch(authContext, /RESUME_REFRESH_TIMEOUT_MS/);

  assert.match(
    supabaseSource,
    /AUTH_REFRESH_GUARD_TIMEOUT_MS = SUPABASE_FETCH_TIMEOUT_MS \+ 2_000/,
  );
  assert.match(supabaseSource, /const refreshAuthSession = async/);
  assert.doesNotMatch(supabaseSource, /processLock|lockAcquireTimeout/);
  assert.match(authContext, /allowWithoutSnapshot: true,[\s\S]*force: true/);
});

test('Live catalogue waits for real auth and reloads after auth recovery', () => {
  assert.match(
    liveSessionsHook,
    /authUnavailable = authStatus !== 'authenticated' \|\| !canPerformAuthenticatedWrites/,
  );
  assert.match(liveSessionsHook, /if \(authUnavailable\)[\s\S]*setCanSchedule\(false\)/);
  assert.match(liveSessionsHook, /refresh\(\{ attemptRecovery: false \}\)/);
  assert.match(liveSessionsHook, /live_catalog_manual_retry/);
  assert.doesNotMatch(liveSessionsHook, /canSchedule\(\)\.catch\(\(\) => false\)/);
});

test('Live UI distinguishes reconnecting auth from an empty catalogue', () => {
  assert.match(liveHome, /Ghana Meets has not been removed/);
  assert.match(liveHome, /showEmptyCatalogue = !loading && !authUnavailable && !error/);
  assert.match(liveHome, /Try again securely/);
});

test('Live scheduling recovers auth before attempting the protected RPC', () => {
  assert.match(liveSchedule, /retrySessionRecovery\('live_studio_manual_retry'\)/);
  assert.match(liveSchedule, /if \(!sessionReady\)/);
  assert.match(liveSchedule, /Reconnect to publish/);
});
