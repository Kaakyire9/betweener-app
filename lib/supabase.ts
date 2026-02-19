import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { captureMessage } from '@/lib/telemetry/sentry';
import { AppState } from 'react-native';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

const IS_DEV = typeof __DEV__ !== 'undefined' && __DEV__;
const EXPO_ENV = String(process.env.EXPO_PUBLIC_ENVIRONMENT || '').toLowerCase();
const IS_PROD = EXPO_ENV === 'production' || (!IS_DEV && EXPO_ENV !== 'development');

// Give release builds a bit more time on slower mobile networks, while still
// protecting against the "fetch hangs forever after resume" issue.
const SUPABASE_FETCH_TIMEOUT_MS =
  IS_DEV ? 15_000 : 30_000;

// Extra safety: supabase-js can hang *before* network fetch is invoked (most often
// due to storage reads during auth/session initialization). Wrap high-level client
// calls like `supabase.rpc(...)` with a deterministic timeout so the UI never waits
// forever even when `fetchWithTimeout` can't help.
const SUPABASE_CALL_TIMEOUT_MS =
  IS_DEV ? 12_000 : 10_000;

export const SUPABASE_IS_CONFIGURED = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

export const getSupabaseConfigStatus = () => {
  const urlPresent = Boolean(SUPABASE_URL);
  const keyPresent = Boolean(SUPABASE_ANON_KEY);
  return {
    configured: urlPresent && keyPresent,
    urlPresent,
    keyPresent,
  } as const;
};

// Log missing config once in production so testers don't silently spin forever.
if (IS_PROD && !SUPABASE_IS_CONFIGURED) {
  try {
    captureMessage('[supabase] missing_config', getSupabaseConfigStatus());
  } catch {
    // best-effort only
  }
}

const LOG_THROTTLE_MS = 60_000;
const logLastAtByKey = new Map<string, number>();

// In-memory ring buffer of recent Supabase HTTP activity.
// Helps debug "loading forever" states in production without logging PII.
type SupabaseNetEvent = {
  at: number;
  method: string;
  path: string;
  status: number;
  ms: number;
};

const NET_EVENTS_MAX = 30;
const netEvents: SupabaseNetEvent[] = [];

export const getSupabaseNetEvents = (): SupabaseNetEvent[] => netEvents.slice();

export const supabaseDebug = {
  getSupabaseNetEvents,
  getSupabaseConfigStatus,
};

const safeUrlPath = (input: RequestInfo | URL) => {
  try {
    const urlStr =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : (input as any)?.url
            ? String((input as any).url)
            : '';
    if (!urlStr) return '';
    const u = new URL(urlStr);
    return `${u.host}${u.pathname}`;
  } catch {
    return '';
  }
};

const logFetchIssueThrottled = (key: string, context: Record<string, unknown>, throttleKey?: string) => {
  const now = Date.now();
  const tk = throttleKey || key;
  const lastAt = logLastAtByKey.get(tk) || 0;
  if (now - lastAt < LOG_THROTTLE_MS) return;
  logLastAtByKey.set(tk, now);
  captureMessage(`[supabase] ${key}`, context);
};

const SYNTHETIC_HEADER = 'x-betweener-synthetic';
const SYNTHETIC_CODE_HEADER = 'x-betweener-synthetic-code';

const makeSyntheticResponse = (message: string, code: string) => {
  // Return a synthetic response so supabase-js returns `{ error }` instead of throwing.
  // 599 is a common "network connect timeout" sentinel in some stacks.
  return new Response(JSON.stringify({ message, code }), {
    status: 599,
    headers: {
      'Content-Type': 'application/json',
      [SYNTHETIC_HEADER]: '1',
      [SYNTHETIC_CODE_HEADER]: code,
    },
  });
};

// We also use a synthetic "client timeout" status for operations that time out
// *before* the HTTP layer. This makes it obvious in logs when the call never
// reached Supabase (and thus won't appear in Supabase gateway logs).
const CLIENT_TIMEOUT_STATUS = 598;

const recordNetEvent = (method: string, path: string, status: number, ms: number) => {
  try {
    if (!path) return;
    netEvents.push({ at: Date.now(), method, path, status, ms });
    if (netEvents.length > NET_EVENTS_MAX) {
      netEvents.splice(0, netEvents.length - NET_EVENTS_MAX);
    }
  } catch {
    // ignore net event recording errors
  }
};

const safeStorageKey = (key: string) => {
  try {
    // Avoid logging full keys; keep a short prefix for diagnostics only.
    const k = String(key || '');
    return k.length <= 24 ? k : `${k.slice(0, 24)}...`;
  } catch {
    return 'unknown';
  }
};

// AsyncStorage can occasionally hang on iOS after backgrounding/OS upgrades.
// Supabase auth reads from storage on many code paths; if storage hangs,
// supabase-js calls can hang *without ever reaching fetch()*.
const AUTH_STORAGE_TIMEOUT_MS = IS_DEV ? 2500 : 1800;

const storageWithTimeout = {
  async getItem(key: string) {
    try {
      let didTimeout = false;
      const value = await Promise.race([
        AsyncStorage.getItem(key),
        new Promise<string | null>((resolve) =>
          setTimeout(() => {
            didTimeout = true;
            resolve(null);
          }, AUTH_STORAGE_TIMEOUT_MS),
        ),
      ]);
      if (didTimeout) {
        logFetchIssueThrottled(
          'storage_timeout',
          { op: 'getItem', key: safeStorageKey(key), timeoutMs: AUTH_STORAGE_TIMEOUT_MS },
          `storage_timeout|getItem|${safeStorageKey(key)}`,
        );
      }
      return value as any;
    } catch (e) {
      return null;
    }
  },

  async setItem(key: string, value: string) {
    try {
      let didTimeout = false;
      await Promise.race([
        AsyncStorage.setItem(key, value),
        new Promise<void>((resolve) =>
          setTimeout(() => {
            didTimeout = true;
            resolve();
          }, AUTH_STORAGE_TIMEOUT_MS),
        ),
      ]);
      if (didTimeout) {
        logFetchIssueThrottled(
          'storage_timeout',
          { op: 'setItem', key: safeStorageKey(key), timeoutMs: AUTH_STORAGE_TIMEOUT_MS },
          `storage_timeout|setItem|${safeStorageKey(key)}`,
        );
      }
    } catch {
      // best-effort only
    }
  },

  async removeItem(key: string) {
    try {
      let didTimeout = false;
      await Promise.race([
        AsyncStorage.removeItem(key),
        new Promise<void>((resolve) =>
          setTimeout(() => {
            didTimeout = true;
            resolve();
          }, AUTH_STORAGE_TIMEOUT_MS),
        ),
      ]);
      if (didTimeout) {
        logFetchIssueThrottled(
          'storage_timeout',
          { op: 'removeItem', key: safeStorageKey(key), timeoutMs: AUTH_STORAGE_TIMEOUT_MS },
          `storage_timeout|removeItem|${safeStorageKey(key)}`,
        );
      }
    } catch {
      // best-effort only
    }
  },
};

const looksLikeSignalUnsupported = (message: string) => {
  const m = message.toLowerCase();
  // Different RN/iOS stacks surface different errors when `signal` isn't supported.
  return (
    (m.includes('signal') || m.includes('abortcontroller') || m.includes('abort')) &&
    (m.includes('not supported') || m.includes('unsupported') || m.includes('invalid'))
  );
};

let lastAuthFailureAt = 0;
let lastAuthFailureStatus: 401 | 403 | null = null;

const recordAuthFailure = (status: 401 | 403) => {
  lastAuthFailureAt = Date.now();
  lastAuthFailureStatus = status;
};

const getSyntheticCode = (res: Response) => {
  try {
    return res.headers.get(SYNTHETIC_CODE_HEADER) || null;
  } catch {
    return null;
  }
};

const logResponseIssue = (method: string, path: string, status: number, ms: number, via: string, res?: Response) => {
  // Avoid log spam: throttle by path+status+key.
  const baseThrottleKey = `${path}|${status}`;

  if (status === 401 || status === 403) {
    recordAuthFailure(status);
    logFetchIssueThrottled(`auth_${status}`, { path, status, ms, via, method, message: 'auth_invalid_or_expired' }, `auth_${status}|${baseThrottleKey}`);
    return;
  }

  if (status === 599) {
    const code = res ? getSyntheticCode(res) : null;
    if (code === 'missing_config') {
      logFetchIssueThrottled('missing_config', { path, status, ms, via, method }, `missing_config|${baseThrottleKey}`);
      return;
    }
    if (code === 'network_timeout') {
      logFetchIssueThrottled('network_timeout', { path, status, ms, via, method }, `network_timeout|${baseThrottleKey}`);
      return;
    }
    logFetchIssueThrottled('network_error', { path, status, ms, via, method, code }, `network_error|${baseThrottleKey}`);
    return;
  }

  if (status >= 400) {
    logFetchIssueThrottled(`http_${status}`, { path, status, ms, via, method }, `http_${status}|${baseThrottleKey}`);
  }
};

const makeClientTimeoutRpcResult = () => {
  return {
    data: null,
    error: {
      message: 'client_timeout',
      code: 'client_timeout',
      details: null,
      hint: null,
    },
    status: CLIENT_TIMEOUT_STATUS,
    count: null,
  } as any;
};

const fetchWithRaceTimeout: typeof fetch = async (input, init) => {
  const start = Date.now();
  const path = safeUrlPath(input);
  const method = String((init as any)?.method || 'GET').toUpperCase();
  if (!SUPABASE_IS_CONFIGURED) {
    const res = makeSyntheticResponse('missing_config', 'missing_config');
    const ms = Date.now() - start;
    recordNetEvent(method, path, res.status, ms);
    logResponseIssue(method, path, res.status, ms, 'missing_config', res);
    return res;
  }
  try {
    const res = (await Promise.race([
      fetch(input, init as any),
      new Promise<Response>((resolve) =>
        setTimeout(() => resolve(makeSyntheticResponse('timeout', 'network_timeout')), SUPABASE_FETCH_TIMEOUT_MS)
      ),
    ])) as Response;
    const ms = Date.now() - start;
    recordNetEvent(method, path, res.status, ms);
    logResponseIssue(method, path, res.status, ms, 'race', res);
    return res;
  } catch (error) {
    const ms = Date.now() - start;
    const message = String((error as any)?.message || error || 'fetch_failed');
    logFetchIssueThrottled('exception', { path, via: 'race', method, message }, `exception|${path}`);
    recordNetEvent(method, path, 599, ms);
    const res = makeSyntheticResponse(message, 'network_error');
    logResponseIssue(method, path, 599, ms, 'race_exception', res);
    return res;
  }
};

// React Native fetch can hang indefinitely when the app resumes from background or
// the network changes. Provide a timeout-aware fetch so UI never spins forever.
//
// Important: some RN builds/devices don't support `signal` yet. In that case, we
// fall back to a Promise.race timeout (cannot abort the underlying request).
const fetchWithTimeout: typeof fetch = async (input, init) => {
  const start = Date.now();
  const path = safeUrlPath(input);
  const method = String((init as any)?.method || 'GET').toUpperCase();
  if (!SUPABASE_IS_CONFIGURED) {
    const res = makeSyntheticResponse('missing_config', 'missing_config');
    const ms = Date.now() - start;
    recordNetEvent(method, path, res.status, ms);
    logResponseIssue(method, path, res.status, ms, 'missing_config', res);
    return res;
  }
  const hasAbortController = typeof AbortController !== 'undefined';
  if (!hasAbortController) {
    return fetchWithRaceTimeout(input, init);
  }

  const controller = new AbortController();
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let timedOut = false;

  // If the caller already provided a signal, abort our controller when theirs aborts.
  const callerSignal = (init as any)?.signal as AbortSignal | undefined;
  const onCallerAbort = () => controller.abort();

  try {
    if (callerSignal) {
      if (callerSignal.aborted) controller.abort();
      else if (typeof (callerSignal as any).addEventListener === 'function') {
        callerSignal.addEventListener('abort', onCallerAbort, { once: true });
      }
    }

    const timeoutPromise = new Promise<Response>((resolve) => {
      timeoutId = setTimeout(() => {
        timedOut = true;
        try {
          controller.abort();
        } catch {
          // ignore abort errors; the race still resolves
        }
        resolve(makeSyntheticResponse('timeout', 'network_timeout'));
      }, SUPABASE_FETCH_TIMEOUT_MS);
    });

    const fetchPromise = (async (): Promise<Response> => {
      try {
        return await fetch(input, { ...(init || {}), signal: controller.signal } as any);
      } catch (error) {
        const message = String((error as any)?.message || error || 'fetch_failed');

        // If this RN runtime doesn't support `signal`, retry once without it.
        if (looksLikeSignalUnsupported(message)) {
          const path = safeUrlPath(input);
          logFetchIssueThrottled('signal_unsupported', { path, message }, `signal_unsupported|${path}`);
          return fetchWithRaceTimeout(input, init);
        }

        // Otherwise convert to a synthetic response so callers get `{ error }`.
        const path = safeUrlPath(input);
        logFetchIssueThrottled('exception', { path, via: 'abort', method, message }, `exception|${path}`);
        return makeSyntheticResponse(message, 'network_error');
      }
    })();

    const res = await Promise.race([fetchPromise, timeoutPromise]);

    const ms = Date.now() - start;
    recordNetEvent(method, path, res.status, ms);
    logResponseIssue(method, path, res.status, ms, timedOut ? 'timeout' : 'abort', res);

    return res;
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
    if (callerSignal) {
      try {
        callerSignal.removeEventListener('abort', onCallerAbort as any);
      } catch {}
    }
  }
};

// React Native doesn't keep a browser tab open with a constantly running JS event loop.
// Apps are backgrounded/suspended, and "auto refresh" must be explicitly managed
// across AppState transitions so stale JWTs don't persist after resume/cold start.
let authLifecycleRefCount = 0;
let authLifecycleCleanup: (() => void) | null = null;

export const initSupabaseAuthLifecycle = () => {
  authLifecycleRefCount += 1;

  const release = () => {
    authLifecycleRefCount = Math.max(0, authLifecycleRefCount - 1);
    if (authLifecycleRefCount === 0 && authLifecycleCleanup) {
      const fn = authLifecycleCleanup;
      authLifecycleCleanup = null;
      try {
        fn();
      } catch {
        // ignore cleanup errors
      }
    }
  };

  if (authLifecycleCleanup) {
    return release;
  }

  const start = () => {
    try {
      // Safe to call multiple times.
      (supabase as any).auth?.startAutoRefresh?.();
    } catch {}
  };

  const stop = () => {
    try {
      (supabase as any).auth?.stopAutoRefresh?.();
    } catch {}
  };

  start();

  const sub = AppState.addEventListener('change', (state) => {
    if (state === 'active') start();
    else stop();
  });

  authLifecycleCleanup = () => {
    try {
      stop();
    } catch {}
    try {
      // RN returns { remove() } subscription.
      (sub as any)?.remove?.();
    } catch {}
  };

  return release;
};

const REFRESH_TIMEOUT_MS = 8_000;
const REFRESH_COOLDOWN_MS = 60_000;
const EXPIRY_SOON_SECONDS = 90;
const AUTH_FAILURE_GRACE_MS = 5 * 60_000;

let refreshInFlight: Promise<'refreshed' | 'failed'> | null = null;
let lastRefreshAttemptAt = 0;

const withTimeout = async <T,>(p: Promise<T>, timeoutMs: number): Promise<T> => {
  return await Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('timeout')), timeoutMs)),
  ]);
};

export async function ensureFreshSession(): Promise<'ok' | 'no_session' | 'refreshed' | 'failed'> {
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error) {
      // getSession is local, but treat an error as a failure state.
      return 'failed';
    }

    const session = data?.session ?? null;
    if (!session) return 'no_session';

    const nowSec = Math.floor(Date.now() / 1000);
    const expiresAt = typeof (session as any).expires_at === 'number' ? (session as any).expires_at : null;
    const expiresSoon = typeof expiresAt === 'number' ? (expiresAt - nowSec) <= EXPIRY_SOON_SECONDS : false;
    const recent401 = lastAuthFailureStatus === 401 && (Date.now() - lastAuthFailureAt) <= AUTH_FAILURE_GRACE_MS;

    if (!expiresSoon && !recent401) return 'ok';

    if (refreshInFlight) {
      const r = await refreshInFlight;
      return r === 'refreshed' ? 'refreshed' : 'failed';
    }

    const now = Date.now();
    if (now - lastRefreshAttemptAt < REFRESH_COOLDOWN_MS) {
      // Avoid refresh storms; caller can retry later or rely on autoRefresh.
      return 'failed';
    }
    lastRefreshAttemptAt = now;

    refreshInFlight = (async () => {
      try {
        const res: any = await withTimeout(supabase.auth.refreshSession(), REFRESH_TIMEOUT_MS);
        if (res?.error) return 'failed';
        return res?.data?.session ? 'refreshed' : 'failed';
      } catch {
        return 'failed';
      } finally {
        refreshInFlight = null;
      }
    })();

    const out = await refreshInFlight;
    return out === 'refreshed' ? 'refreshed' : 'failed';
  } catch {
    return 'failed';
  }
}

// Keep this client untyped for now to avoid forcing a full, repo-wide type migration.
// We still use generated DB types at API boundaries (e.g. updateProfile) for safety.
const SUPABASE_URL_FOR_CLIENT = SUPABASE_URL || 'https://example.invalid';
const SUPABASE_ANON_KEY_FOR_CLIENT = SUPABASE_ANON_KEY || 'missing-config';

export const supabase = createClient(SUPABASE_URL_FOR_CLIENT, SUPABASE_ANON_KEY_FOR_CLIENT, {
  auth: {
    storage: storageWithTimeout as any,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false, // Keep false for React Native
  },
  global: {
    fetch: fetchWithTimeout,
  },
});

// Wrap `supabase.rpc` to protect against "pre-fetch" hangs (e.g. stuck storage/session reads).
// This keeps the app deterministic: either you get a response, a normal error, or a client_timeout.
try {
  const origRpc = (supabase as any).rpc?.bind(supabase);
  if (typeof origRpc === 'function') {
    (supabase as any).rpc = async (fn: string, args?: Record<string, unknown>, options?: Record<string, unknown>) => {
      const start = Date.now();
      const pseudoPath = `rpc/${String(fn)}`;
      let timedOut = false;

      const res = await Promise.race([
        origRpc(fn as any, args as any, options as any),
        new Promise<any>((resolve) =>
          setTimeout(() => {
            timedOut = true;
            resolve(makeClientTimeoutRpcResult());
          }, SUPABASE_CALL_TIMEOUT_MS)
        ),
      ]);

      const ms = Date.now() - start;
      const status = typeof (res as any)?.status === 'number'
        ? (res as any).status
        : ((res as any)?.error ? CLIENT_TIMEOUT_STATUS : 200);

      recordNetEvent('RPC', pseudoPath, status, ms);

      if (timedOut) {
        logFetchIssueThrottled(
          'client_timeout',
          { fn: String(fn), ms, message: 'pre_fetch_or_client_hang', storageTimeoutMs: AUTH_STORAGE_TIMEOUT_MS },
          `client_timeout|${pseudoPath}`,
        );
      }

      return res;
    };
  }
} catch (e) {
  // best-effort only
}
