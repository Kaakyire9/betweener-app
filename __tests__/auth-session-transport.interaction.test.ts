import AsyncStorage from '@react-native-async-storage/async-storage';
import { afterAll, beforeAll, expect, jest, test } from '@jest/globals';
import { createClient } from '@supabase/supabase-js';

import { createAuthFetchTransport } from '@/lib/auth/auth-transport';

process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://session-recovery-test.supabase.co';
process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'public-test-key';
process.env.EXPO_PUBLIC_ENVIRONMENT = 'development';

type TransportMode =
  | 'success'
  | 'native_rejection'
  | 'never_settles'
  | 'synthetic_599'
  | 'http_429'
  | 'http_503_malformed'
  | 'invalid_refresh'
  | 'data_403';

const STORAGE_KEY = 'sb-session-recovery-test-auth-token';
const USER_ID = '00000000-0000-4000-8000-000000000001';
let transportMode: TransportMode = 'success';
let requests: string[] = [];

const makeJwt = (expiresAt: number) => {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'none', typ: 'JWT' })}.${encode({ exp: expiresAt })}.test`;
};

const makeUser = () => ({
  id: USER_ID,
  aud: 'authenticated',
  role: 'authenticated',
  email: 'person@example.invalid',
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

const makeSession = (suffix: string, expiresInSeconds: number) => {
  const expiresAt = Math.floor(Date.now() / 1_000) + expiresInSeconds;
  return {
    access_token: makeJwt(expiresAt),
    refresh_token: `refresh-${suffix}`,
    token_type: 'bearer',
    expires_in: 3_600,
    expires_at: expiresAt,
    user: makeUser(),
  };
};

const refreshedSession = () => ({
  access_token: makeJwt(Math.floor(Date.now() / 1_000) + 3_600),
  refresh_token: 'refresh-rotated',
  token_type: 'bearer',
  expires_in: 3_600,
  user: makeUser(),
});

global.fetch = jest.fn(async (input: RequestInfo | URL) => {
  const url = new URL(String(input));
  requests.push(url.pathname);

  if (transportMode === 'native_rejection') throw new TypeError('Network request failed');
  if (transportMode === 'never_settles') return await new Promise<Response>(() => undefined);
  if (transportMode === 'synthetic_599') {
    return new Response(JSON.stringify({ message: 'timeout', code: 'network_timeout' }), {
      status: 599,
      headers: { 'content-type': 'application/json' },
    });
  }
  if (transportMode === 'http_429') {
    return new Response(JSON.stringify({ message: 'rate limited', code: 'over_request_rate_limit' }), {
      status: 429,
      headers: { 'content-type': 'application/json', 'retry-after': '600' },
    });
  }
  if (transportMode === 'http_503_malformed') {
    return new Response('temporarily unavailable', { status: 503 });
  }
  if (transportMode === 'invalid_refresh') {
    return new Response(
      JSON.stringify({
        message: 'Invalid Refresh Token: Already Used',
        code: 'refresh_token_already_used',
      }),
      {
        status: 400,
        headers: {
          'content-type': 'application/json',
          'x-supabase-api-version': '2024-01-01',
        },
      },
    );
  }
  if (transportMode === 'data_403') {
    return new Response(JSON.stringify({ message: 'permission denied', code: '42501' }), {
      status: 403,
      headers: { 'content-type': 'application/json' },
    });
  }
  return new Response(JSON.stringify(refreshedSession()), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}) as typeof fetch;

// Imported after the fake environment and network boundary are installed.
const {
  getSupabaseAuthRetryState,
  recoverSupabaseConnectivity,
  supabase,
  supabaseDebug,
} = require('@/lib/supabase') as typeof import('@/lib/supabase');

const authEvents: string[] = [];
const subscription = supabase.auth.onAuthStateChange((event) => authEvents.push(event));

const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

const advanceAuthTimers = async (totalMs = 60_000) => {
  for (let elapsed = 0; elapsed < totalMs; elapsed += 5_000) {
    await jest.advanceTimersByTimeAsync(5_000);
  }
};

const seed = async (suffix: string, expiresInSeconds: number) => {
  await AsyncStorage.clear();
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(makeSession(suffix, expiresInSeconds)));
  requests = [];
  authEvents.length = 0;
  supabaseDebug.resetAuthTransportStateForTests();
};

const runRefreshWithTimers = async () => {
  jest.useFakeTimers({ now: Date.now() });
  try {
    const pending = supabase.auth.getSession();
    await advanceAuthTimers();
    return await pending;
  } finally {
    jest.useRealTimers();
  }
};

beforeAll(async () => {
  await supabase.auth.getSession();
  await settle();
});

afterAll(() => {
  subscription.data.subscription.unsubscribe();
  supabase.auth.stopAutoRefresh();
});

test.each([
  ['native rejection', 'native_rejection'],
  ['former synthetic 599', 'synthetic_599'],
  ['malformed HTTP 503', 'http_503_malformed'],
] as const)('%s is retryable and retains expired-session credentials', async (_label, mode) => {
  await seed(mode, -120);
  transportMode = mode;

  const result = await runRefreshWithTimers();

  expect(result.error?.name).toBe('AuthRetryableFetchError');
  expect(await AsyncStorage.getItem(STORAGE_KEY)).not.toBeNull();
  expect(authEvents).not.toContain('SIGNED_OUT');
  expect(requests).toContain('/auth/v1/token');
});

test('auth timeout is bounded and retains credentials', async () => {
  await seed('timeout', -120);
  transportMode = 'never_settles';

  const result = await runRefreshWithTimers();

  expect(result.error?.name).toBe('AuthRetryableFetchError');
  expect(await AsyncStorage.getItem(STORAGE_KEY)).not.toBeNull();
  expect(authEvents).not.toContain('SIGNED_OUT');
});

test('HTTP 429 retains credentials and blocks network work until Retry-After', async () => {
  jest.useFakeTimers({ now: Date.now() });
  try {
    await seed('rate-limit', -120);
    transportMode = 'http_429';

    const pending = supabase.auth.getSession();
    await advanceAuthTimers();
    const result = await pending;
    const requestCountAtFailure = requests.length;

    expect(result.error?.name).toBe('AuthRetryableFetchError');
    expect(await AsyncStorage.getItem(STORAGE_KEY)).not.toBeNull();
    expect(authEvents).not.toContain('SIGNED_OUT');
    const retryAt = getSupabaseAuthRetryState().retryAt;
    expect(retryAt).not.toBeNull();

    const deferred = await recoverSupabaseConnectivity('manual_retry_during_rate_limit');
    expect(deferred.status).toBe('failed_recoverable');
    expect(deferred.failureKind).toBe('rate_limited');
    expect(requests).toHaveLength(requestCountAtFailure);

    transportMode = 'success';
    jest.setSystemTime((retryAt ?? Date.now()) + 60_001);
    const recoveryPromise = recoverSupabaseConnectivity('rate_limit_elapsed');
    await advanceAuthTimers();
    const recovered = await recoveryPromise;
    expect(['ok', 'refreshed']).toContain(recovered.status);
    expect(requests.length).toBeGreaterThan(requestCountAtFailure);
  } finally {
    jest.useRealTimers();
  }
});

test('structured invalid refresh credentials still remove the expired session', async () => {
  await seed('invalid', -120);
  transportMode = 'invalid_refresh';

  const result = await supabase.auth.getSession();
  await settle();

  expect(result.error?.name).toBe('AuthApiError');
  expect((result.error as any)?.code).toBe('refresh_token_already_used');
  expect(await AsyncStorage.getItem(STORAGE_KEY)).toBeNull();
  expect(authEvents).toContain('SIGNED_OUT');
});

test('a still-valid access token survives a transient proactive refresh failure', async () => {
  await seed('still-valid', 30);
  transportMode = 'native_rejection';

  const result = await runRefreshWithTimers();

  expect(result.error).toBeNull();
  expect(result.data.session?.user.id).toBe(USER_ID);
  expect(await AsyncStorage.getItem(STORAGE_KEY)).not.toBeNull();
  expect(authEvents).not.toContain('SIGNED_OUT');
});

test('connectivity restoration rotates credentials and resumes the same identity', async () => {
  jest.useFakeTimers({ now: Date.now() });
  try {
    await seed('offline-online', -120);
    transportMode = 'native_rejection';

    const initial = supabase.auth.getSession();
    await advanceAuthTimers();
    const failed = await initial;
    expect(failed.error?.name).toBe('AuthRetryableFetchError');
    expect(await AsyncStorage.getItem(STORAGE_KEY)).not.toBeNull();

    transportMode = 'success';
    const retryAt = getSupabaseAuthRetryState().retryAt;
    jest.setSystemTime((retryAt ?? Date.now()) + 60_001);
    const recoveryPromise = recoverSupabaseConnectivity('network_restored_test');
    await advanceAuthTimers();
    const recovery = await recoveryPromise;
    const current = await supabase.auth.getSession();

    expect(['ok', 'refreshed']).toContain(recovery.status);
    expect(current.data.session?.user.id).toBe(USER_ID);
    expect(JSON.parse((await AsyncStorage.getItem(STORAGE_KEY))!).refresh_token).toBe('refresh-rotated');
  } finally {
    jest.useRealTimers();
  }
});

test('a data-client 403 does not refresh or sign out the auth session', async () => {
  await seed('data-permission', 3_600);
  transportMode = 'data_403';

  const result = await supabase.from('profiles').select('id');
  await settle();

  expect(result.error).not.toBeNull();
  expect(requests).toEqual(['/rest/v1/profiles']);
  expect(await AsyncStorage.getItem(STORAGE_KEY)).not.toBeNull();
  expect(authEvents).not.toContain('SIGNED_OUT');
});

test('foreground and network recovery share one SDK refresh request', async () => {
  await seed('coordinated', -120);
  transportMode = 'success';

  const [foreground, network] = await Promise.all([
    recoverSupabaseConnectivity('foreground_test'),
    recoverSupabaseConnectivity('network_restore_test'),
  ]);

  expect(['ok', 'refreshed']).toContain(foreground.status);
  expect(['ok', 'refreshed']).toContain(network.status);
  expect(requests.filter((path) => path === '/auth/v1/token')).toHaveLength(1);
  expect((await supabase.auth.getSession()).data.session?.user.id).toBe(USER_ID);
});

test('a new client bootstraps from persisted credentials without a false empty session', async () => {
  await seed('process-restart', 3_600);
  transportMode = 'success';
  const restartedTransport = createAuthFetchTransport({
    fetchImpl: (input, init) => fetch(input, init),
    timeoutMs: 1_000,
    isConfigured: true,
  });
  const restartedClient = createClient(
    process.env.EXPO_PUBLIC_SUPABASE_URL!,
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        storage: AsyncStorage,
        persistSession: true,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
      global: { fetch: restartedTransport.fetch },
    },
  );

  try {
    const result = await restartedClient.auth.getSession();
    expect(result.error).toBeNull();
    expect(result.data.session?.user.id).toBe(USER_ID);
    expect(requests).toHaveLength(0);
  } finally {
    restartedClient.auth.stopAutoRefresh();
  }
});
