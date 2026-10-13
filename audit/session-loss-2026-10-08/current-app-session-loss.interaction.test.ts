import AsyncStorage from '@react-native-async-storage/async-storage';
import { afterAll, beforeAll, expect, jest, test } from '@jest/globals';

process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://audit-session-loss.supabase.co';
process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'audit-public-key';
process.env.EXPO_PUBLIC_ENVIRONMENT = 'development';

type TransportMode =
  | 'synthetic_599'
  | 'native_rejection'
  | 'http_503'
  | 'invalid_refresh'
  | 'success';

type SafeEvidence = {
  scenario: string;
  errorName: string | null;
  errorStatus: number | null;
  errorCode: string | null;
  credentialRetained: boolean;
  finalSessionPresent: boolean;
  events: string[];
  requestPaths: string[];
  attempts: number;
};

const STORAGE_KEY = 'sb-audit-session-loss-auth-token';
const requestPaths: string[] = [];
let transportMode: TransportMode = 'success';
let attempts = 0;

const makeJwt = (expiresAtSeconds: number) => {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'none', typ: 'JWT' })}.${encode({ exp: expiresAtSeconds })}.audit`;
};

const makeUser = () => ({
  id: '00000000-0000-4000-8000-000000000001',
  aud: 'authenticated',
  role: 'authenticated',
  email: 'audit@example.invalid',
  email_confirmed_at: '2026-01-01T00:00:00.000Z',
  phone: '',
  confirmed_at: '2026-01-01T00:00:00.000Z',
  last_sign_in_at: '2026-01-01T00:00:00.000Z',
  app_metadata: { provider: 'email', providers: ['email'] },
  user_metadata: {},
  identities: [],
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  is_anonymous: false,
});

const makeStoredSession = (suffix: string, expiresInSeconds: number) => {
  const expiresAt = Math.floor(Date.now() / 1000) + expiresInSeconds;
  return {
    access_token: makeJwt(expiresAt),
    refresh_token: `audit-refresh-${suffix}`,
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: expiresAt,
    user: makeUser(),
  };
};

const successResponse = () => ({
  access_token: makeJwt(Math.floor(Date.now() / 1000) + 3600),
  refresh_token: 'audit-rotated-refresh',
  token_type: 'bearer',
  expires_in: 3600,
  user: makeUser(),
});

global.fetch = jest.fn(async (input: RequestInfo | URL) => {
  attempts += 1;
  requestPaths.push(new URL(String(input)).pathname);

  if (transportMode === 'native_rejection') {
    throw new TypeError('Network request failed');
  }
  if (transportMode === 'synthetic_599') {
    return new Response(JSON.stringify({ message: 'timeout', code: 'network_timeout' }), {
      status: 599,
      headers: {
        'content-type': 'application/json',
        'x-betweener-synthetic': '1',
        'x-betweener-synthetic-code': 'network_timeout',
      },
    });
  }
  if (transportMode === 'http_503') {
    return new Response(JSON.stringify({ message: 'temporarily unavailable' }), {
      status: 503,
      headers: { 'content-type': 'application/json' },
    });
  }
  if (transportMode === 'invalid_refresh') {
    return new Response(
      JSON.stringify({ message: 'Invalid Refresh Token: Already Used', code: 'refresh_token_already_used' }),
      {
        status: 400,
        headers: {
          'content-type': 'application/json',
          'x-supabase-api-version': '2024-01-01',
        },
      },
    );
  }
  return new Response(JSON.stringify(successResponse()), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}) as typeof fetch;

// Import after the safe fake environment and transport are installed so this
// exercises the production-used wrapper and client construction unchanged.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { recoverSupabaseConnectivity, supabase } = require('@/lib/supabase') as typeof import('@/lib/supabase');

const events: string[] = [];
const subscription = supabase.auth.onAuthStateChange((event) => {
  events.push(event);
});

const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

const seed = async (suffix: string, expiresInSeconds: number) => {
  await AsyncStorage.clear();
  await AsyncStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(makeStoredSession(suffix, expiresInSeconds)),
  );
  attempts = 0;
  requestPaths.length = 0;
  events.length = 0;
};

const evidenceFor = async (
  scenario: string,
  result: Awaited<ReturnType<typeof supabase.auth.getSession>>,
): Promise<SafeEvidence> => {
  await settle();
  const stored = await AsyncStorage.getItem(STORAGE_KEY);
  const evidence = {
    scenario,
    errorName: result.error?.name ?? null,
    errorStatus: typeof (result.error as any)?.status === 'number' ? (result.error as any).status : null,
    errorCode: typeof (result.error as any)?.code === 'string' ? (result.error as any).code : null,
    credentialRetained: stored !== null,
    finalSessionPresent: result.data.session !== null,
    events: events.filter((event) => event !== 'INITIAL_SESSION'),
    requestPaths: [...requestPaths],
    attempts,
  } satisfies SafeEvidence;
  console.log('AUDIT_EVIDENCE', JSON.stringify(evidence));
  return evidence;
};

beforeAll(async () => {
  await supabase.auth.getSession();
  await settle();
});

afterAll(() => {
  subscription.data.subscription.unsubscribe();
});

test('expired access token plus synthetic HTTP 599 removes credentials', async () => {
  await seed('synthetic-599', -120);
  transportMode = 'synthetic_599';

  const evidence = await evidenceFor('expired_synthetic_599', await supabase.auth.getSession());

  expect(evidence.errorName).toBe('AuthApiError');
  expect(evidence.errorStatus).toBe(599);
  expect(evidence.credentialRetained).toBe(false);
  expect(evidence.events).toContain('SIGNED_OUT');
  expect(evidence.requestPaths).toEqual(['/auth/v1/token']);
});

test('expired access token plus native fetch rejection is converted by the app wrapper to terminal 599', async () => {
  await seed('native-rejection', -120);
  transportMode = 'native_rejection';

  const evidence = await evidenceFor('expired_native_rejection', await supabase.auth.getSession());

  expect(evidence.errorName).toBe('AuthApiError');
  expect(evidence.errorStatus).toBe(599);
  expect(evidence.credentialRetained).toBe(false);
  expect(evidence.events).toContain('SIGNED_OUT');
  expect(evidence.attempts).toBe(1);
});

test('expired access token plus HTTP 503 is retryable and retains credentials', async () => {
  jest.useFakeTimers({ now: Date.now() });
  try {
    await seed('http-503', -120);
    transportMode = 'http_503';

    const pending = supabase.auth.getSession();
    await jest.runAllTimersAsync();
    const result = await pending;
    const stored = await AsyncStorage.getItem(STORAGE_KEY);
    const evidence = {
      scenario: 'expired_http_503',
      errorName: result.error?.name ?? null,
      errorStatus: typeof (result.error as any)?.status === 'number' ? (result.error as any).status : null,
      errorCode: typeof (result.error as any)?.code === 'string' ? (result.error as any).code : null,
      credentialRetained: stored !== null,
      finalSessionPresent: result.data.session !== null,
      events: events.filter((event) => event !== 'INITIAL_SESSION'),
      requestPaths: [...requestPaths],
      attempts,
    } satisfies SafeEvidence;
    console.log('AUDIT_EVIDENCE', JSON.stringify(evidence));

    expect(evidence.errorName).toBe('AuthRetryableFetchError');
    expect(evidence.errorStatus).toBe(503);
    expect(evidence.credentialRetained).toBe(true);
    expect(evidence.events).not.toContain('SIGNED_OUT');
    expect(evidence.attempts).toBeGreaterThan(1);
  } finally {
    jest.useRealTimers();
  }
});

test('genuine invalid refresh credentials remove the expired session', async () => {
  await seed('invalid-refresh', -120);
  transportMode = 'invalid_refresh';

  const evidence = await evidenceFor('expired_invalid_refresh', await supabase.auth.getSession());

  expect(evidence.errorName).toBe('AuthApiError');
  expect(evidence.errorStatus).toBe(400);
  expect(evidence.errorCode).toBe('refresh_token_already_used');
  expect(evidence.credentialRetained).toBe(false);
  expect(evidence.events).toContain('SIGNED_OUT');
});

test('still-valid access token survives a proactive synthetic 599 failure', async () => {
  await seed('valid-synthetic-599', 30);
  transportMode = 'synthetic_599';

  const evidence = await evidenceFor('valid_synthetic_599', await supabase.auth.getSession());

  expect(evidence.errorName).toBeNull();
  expect(evidence.credentialRetained).toBe(true);
  expect(evidence.finalSessionPresent).toBe(true);
  expect(evidence.events).not.toContain('SIGNED_OUT');
});

test('expired session cannot resume the same identity after rejection is converted to 599', async () => {
  await seed('offline-then-online', -120);
  transportMode = 'native_rejection';

  const offlineResult = await supabase.auth.getSession();
  const retainedAfterOffline = (await AsyncStorage.getItem(STORAGE_KEY)) !== null;
  const attemptsAfterOffline = attempts;

  transportMode = 'success';
  const recovery = await recoverSupabaseConnectivity('audit_network_restored');
  const restoredResult = await supabase.auth.getSession();
  const evidence = {
    scenario: 'offline_then_restored',
    errorName: offlineResult.error?.name ?? null,
    errorStatus:
      typeof (offlineResult.error as any)?.status === 'number'
        ? (offlineResult.error as any).status
        : null,
    errorCode: typeof (offlineResult.error as any)?.code === 'string' ? (offlineResult.error as any).code : null,
    credentialRetained: retainedAfterOffline,
    finalSessionPresent: restoredResult.data.session !== null,
    events: events.filter((event) => event !== 'INITIAL_SESSION'),
    requestPaths: [...requestPaths],
    attempts: attemptsAfterOffline,
  } satisfies SafeEvidence;
  console.log('AUDIT_EVIDENCE', JSON.stringify(evidence));

  expect(evidence.errorStatus).toBe(599);
  expect(evidence.credentialRetained).toBe(false);
  expect(evidence.finalSessionPresent).toBe(false);
  expect(recovery.status).toBe('failed_unrecoverable');
  expect(recovery.errorMessage).toBe('session_missing');
  expect(attempts).toBe(attemptsAfterOffline);
});
