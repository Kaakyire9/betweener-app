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
const packageManifest = readFileSync(
  new URL('../package.json', import.meta.url),
  'utf8',
);
const authCallback = readFileSync(
  new URL('../app/(auth)/callback.tsx', import.meta.url),
  'utf8',
);
const authGate = readFileSync(
  new URL('../app/(auth)/gate.tsx', import.meta.url),
  'utf8',
);
const phoneVerification = readFileSync(
  new URL('../lib/phone-verification.ts', import.meta.url),
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

test('rotated refresh credentials have one durable storage authority', () => {
  const storageBlock = supabaseSource.match(
    /const durableAuthStorage = \{([\s\S]*?)\n\};/,
  )?.[0] ?? '';
  const dataTokenBlock = supabaseSource.match(
    /const getDataAccessToken = async[\s\S]*?\n\};/,
  )?.[0] ?? '';
  const snapshotType = authContext.match(
    /type PersistedAuthSnapshot = \{([\s\S]*?)\n\};/,
  )?.[0] ?? '';

  assert.match(storageBlock, /await AsyncStorage\.getItem\(key\)/);
  assert.match(storageBlock, /await AsyncStorage\.setItem\(key, value\)/);
  assert.match(storageBlock, /await AsyncStorage\.removeItem\(key\)/);
  assert.doesNotMatch(storageBlock, /Promise\.race|setTimeout|return null|best-effort only/);
  assert.doesNotMatch(supabaseSource, /AUTH_STORAGE_TIMEOUT_MS|storageWithTimeout/);
  assert.match(dataTokenBlock, /await supabaseAuth\.auth\.getSession\(\)/);
  assert.match(dataTokenBlock, /catch \(error\)[\s\S]*throw error/);
  assert.doesNotMatch(dataTokenBlock, /Promise\.race|setTimeout/);

  assert.match(snapshotType, /version: 2/);
  assert.match(snapshotType, /userId: string/);
  assert.doesNotMatch(snapshotType, /session: Session|access_token|refresh_token/);
  assert.match(authContext, /LEGACY_AUTH_SNAPSHOT_KEY = "auth_snapshot_v1"/);
  assert.match(authContext, /AsyncStorage\.removeItem\(LEGACY_AUTH_SNAPSHOT_KEY\)/);
  assert.doesNotMatch(
    authCallback,
    /AsyncStorage\.setItem\(\s*(?:AUTH|LEGACY_AUTH)_PENDING_TOKENS_KEY/,
  );
  assert.doesNotMatch(authGate, /supabase\.auth\.setSession\(/);
  assert.doesNotMatch(
    `${authCallback}\n${authGate}\n${phoneVerification}`,
    /Promise\.race\(\[(?:(?!\]\);)[\s\S])*supabase\.auth\.(?:getSession|setSession)/,
  );
  assert.doesNotMatch(authCallback, /\.slice\(/);
});

test('session recovery is single-flight and missing credentials require reauthentication', () => {
  assert.match(supabaseSource, /let ensureSessionInFlight:/);
  assert.match(
    supabaseSource,
    /if \(ensureSessionInFlight\) return await ensureSessionInFlight/,
  );
  assert.match(
    supabaseSource,
    /if \(!session && !error\)[\s\S]*status: 'failed_unrecoverable'[\s\S]*errorMessage: 'session_missing'/,
  );
  assert.doesNotMatch(supabaseSource, /fallbackSession|sessionForRefresh/);
  assert.match(authContext, /supabase\.auth\.signOut\(\{ scope: 'local' \}\)/);
  assert.match(authContext, /finally \{[\s\S]*applySignedOutState\(\)/);
  assert.match(packageManifest, /"@supabase\/supabase-js": "2\.117\.1"/);
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
