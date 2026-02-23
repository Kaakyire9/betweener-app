import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { AppState } from 'react-native';
import { addBreadcrumb, captureMessage } from '@/lib/telemetry/sentry';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

const IS_DEV = typeof __DEV__ !== 'undefined' && __DEV__;
const EXPO_ENV = String(process.env.EXPO_PUBLIC_ENVIRONMENT || '').toLowerCase();
const IS_PROD = EXPO_ENV === 'production' || (!IS_DEV && EXPO_ENV !== 'development');

// Give release builds a bit more time on slower mobile networks, while still
// protecting against the "fetch hangs forever after resume" issue.
const SUPABASE_FETCH_TIMEOUT_MS = IS_DEV ? 15_000 : 30_000;

// Extra safety: protect against rare hangs that occur *before* fetch is invoked.
// (Historically observed around auth/session plumbing on some iOS builds.)
const SUPABASE_CALL_TIMEOUT_MS = IS_DEV ? 12_000 : 10_000;

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
const APP_BOOT_AT = Date.now();
const STARTUP_SUPPRESS_MS = 20_000;

// In-memory ring buffer of recent Supabase activity.
// Helps debug "loading forever" states without logging PII.
type SupabaseNetEvent = {
  at: number;
  method: string;
  path: string;
  status: number;
  ms: number;
  // Synthetic error code when status=599 (e.g. missing_config, network_timeout).
  code?: string | null;
  // Rough source of the result (timeout/abort/race/etc) for debugging.
  via?: string;
};

const NET_EVENTS_MAX = 40;
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

  // Avoid turning routine telemetry into Sentry "issues". Keep those as breadcrumbs.
  // Only capture messages for actionable failures that we want to alert on.
  const shouldCapture =
    key === 'missing_config' ||
    key === 'network_timeout' ||
    key === 'network_error' ||
    key === 'client_timeout' ||
    key === 'exception' ||
    key === 'signal_unsupported' ||
    key.startsWith('auth_') ||
    (key.startsWith('http_') && (() => {
      const n = Number(key.slice(5));
      // 406 is common with PostgREST `.single()` and usually isn't a production incident.
      if (n === 406) return false;
      // Capture server errors + rate limiting; keep other 4xx as breadcrumbs.
      return n >= 500 || n === 429;
    })());

  // Suppress early auth noise during bootstrap; we'll still have ring buffer data.
  const withinStartup = now - APP_BOOT_AT <= STARTUP_SUPPRESS_MS;
  if (withinStartup && key.startsWith('auth_')) {
    addBreadcrumb(`[supabase] ${key}`, context);
    return;
  }

  if (shouldCapture) {
    captureMessage(`[supabase] ${key}`, context);
  } else {
    addBreadcrumb(`[supabase] ${key}`, context);
  }
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

// Synthetic "client timeout" for operations that time out *before* the HTTP layer.
// This helps distinguish "never reached Supabase" vs "Supabase returned an HTTP error".
const CLIENT_TIMEOUT_STATUS = 598;

const recordNetEvent = (
  method: string,
  path: string,
  status: number,
  ms: number,
  extra?: { code?: string | null; via?: string },
) => {
  try {
    if (!path) return;
    netEvents.push({ at: Date.now(), method, path, status, ms, ...extra });
    if (netEvents.length > NET_EVENTS_MAX) {
      netEvents.splice(0, netEvents.length - NET_EVENTS_MAX);
    }
  } catch {
    // ignore net event recording errors
  }
};

// -----------------------------
// AsyncStorage wrapper (timeout)
// -----------------------------

const safeStorageKey = (key: string) => {
  try {
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
    } catch {
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

// -----------------------------
// Fetch wrapper (timeout + logs)
// -----------------------------

const looksLikeSignalUnsupported = (message: string) => {
  const m = message.toLowerCase();
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
  const baseThrottleKey = `${path}|${status}`;

  // PostgREST returns 406 for `.single()` when no rows are found. Treat as non-actionable.
  // Call sites should use `.maybeSingle()` when "no row" is expected.
  if (status === 406) return;

  if (status === 401 || status === 403) {
    recordAuthFailure(status);
    logFetchIssueThrottled(
      `auth_${status}`,
      { path, status, ms, via, method, message: 'auth_invalid_or_expired' },
      `auth_${status}|${baseThrottleKey}`,
    );

    // Best-effort: when we see auth failures, try to refresh in the background.
    // This is guarded by ensureFreshSession() cooldown/inFlight logic.
    try {
      void ensureFreshSession();
    } catch {
      // ignore
    }
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

const fetchWithRaceTimeout: typeof fetch = async (input, init) => {
  const start = Date.now();
  const path = safeUrlPath(input);
  const method = String((init as any)?.method || 'GET').toUpperCase();

  if (!SUPABASE_IS_CONFIGURED) {
    const res = makeSyntheticResponse('missing_config', 'missing_config');
    const ms = Date.now() - start;
    recordNetEvent(method, path, res.status, ms, { code: 'missing_config', via: 'missing_config' });
    logResponseIssue(method, path, res.status, ms, 'missing_config', res);
    return res;
  }

  try {
    const res = (await Promise.race([
      fetch(input, init as any),
      new Promise<Response>((resolve) =>
        setTimeout(() => resolve(makeSyntheticResponse('timeout', 'network_timeout')), SUPABASE_FETCH_TIMEOUT_MS),
      ),
    ])) as Response;

    const ms = Date.now() - start;
    const code = res.status === 599 ? getSyntheticCode(res) : null;
    recordNetEvent(method, path, res.status, ms, { code, via: 'race' });
    logResponseIssue(method, path, res.status, ms, 'race', res);
    return res;
  } catch (error) {
    const ms = Date.now() - start;
    const message = String((error as any)?.message || error || 'fetch_failed');
    logFetchIssueThrottled('exception', { path, via: 'race', method, message }, `exception|${path}`);
    const res = makeSyntheticResponse(message, 'network_error');
    recordNetEvent(method, path, 599, ms, { code: 'network_error', via: 'race_exception' });
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
    recordNetEvent(method, path, res.status, ms, { code: 'missing_config', via: 'missing_config' });
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
          // ignore abort errors
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
          logFetchIssueThrottled('signal_unsupported', { path, message }, `signal_unsupported|${path}`);
          return fetchWithRaceTimeout(input, init);
        }

        logFetchIssueThrottled('exception', { path, via: 'abort', method, message }, `exception|${path}`);
        return makeSyntheticResponse(message, 'network_error');
      }
    })();

    const res = await Promise.race([fetchPromise, timeoutPromise]);

    const ms = Date.now() - start;
    const via = timedOut ? 'timeout' : 'abort';
    const code = res.status === 599 ? getSyntheticCode(res) : null;
    recordNetEvent(method, path, res.status, ms, { code, via });
    logResponseIssue(method, path, res.status, ms, timedOut ? 'timeout' : 'abort', res);
    return res;
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
    if (callerSignal) {
      try {
        callerSignal.removeEventListener('abort', onCallerAbort as any);
      } catch {
        // ignore
      }
    }
  }
};

// Exported for the few places we still do direct `fetch()` to Supabase endpoints
// (e.g. edge functions) and want the same timeout + synthetic-response behavior.
export const supabaseFetch: typeof fetch = fetchWithTimeout;

// -----------------------------
// Connectivity probe (case 2)
// -----------------------------

let lastConnectivityProbeAt = 0;
const CONNECTIVITY_PROBE_COOLDOWN_MS = 60_000;

// When we detect a client_timeout (often pre-fetch hangs), run a cheap probe using the
// same fetch wrapper. This helps distinguish "backend unreachable" vs "specific call hung".
const probeSupabaseConnectivity = async (reason: string) => {
  if (!SUPABASE_IS_CONFIGURED) return;
  const now = Date.now();
  if (now - lastConnectivityProbeAt < CONNECTIVITY_PROBE_COOLDOWN_MS) return;
  lastConnectivityProbeAt = now;

  try {
    const url = `${SUPABASE_URL}/rest/v1/profiles?select=id&limit=1`;
    const start = Date.now();
    const res = await fetchWithTimeout(url, {
      method: 'GET',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
    } as any);

    logFetchIssueThrottled(
      'connectivity_probe',
      { reason, status: res.status, ms: Date.now() - start },
      `connectivity_probe|${reason}|${res.status}`,
    );
  } catch {
    // best-effort only
  }
};

// -----------------------------
// Clients: auth + data
// -----------------------------

// Keep this client untyped for now to avoid forcing a full, repo-wide type migration.
const SUPABASE_URL_FOR_CLIENT = SUPABASE_URL || 'https://example.invalid';
const SUPABASE_ANON_KEY_FOR_CLIENT = SUPABASE_ANON_KEY || 'missing-config';

let cachedAccessToken: string | null = null;

const setCachedAccessToken = (token: string | null) => {
  cachedAccessToken = token;
};

let supabaseAuth: any;
let supabaseData: any;

const syncRealtimeAuth = (token: string | null) => {
  // Realtime auth isn't automatically wired up when we split auth/data clients.
  // Without this, postgres_changes subscriptions can connect "anon" and silently
  // stop delivering in-app notification events in release builds.
  try {
    if (!supabaseData?.realtime?.setAuth) return;
    if (token) void supabaseData.realtime.setAuth(token);
    else void supabaseData.realtime.setAuth();
  } catch {
    // best-effort only
  }
};

const getDataAccessToken = async (): Promise<string | null> => {
  // Fast path: reuse the last known token from auth events.
  if (cachedAccessToken) return cachedAccessToken;

  // If auth isn't ready yet, fall back to null (supabase-js will use anon key).
  if (!supabaseAuth?.auth) return null;

  // Avoid long stalls here - this path is hit on data requests.
  try {
    const { data } = await Promise.race([
      supabaseAuth.auth.getSession(),
      new Promise<{ data: { session: null } }>((resolve) => setTimeout(() => resolve({ data: { session: null } }), 1200)),
    ]);
    const token = data?.session?.access_token ?? null;
    if (token) {
      setCachedAccessToken(token);
      syncRealtimeAuth(token);
    }
    return token;
  } catch {
    return null;
  }
};

// Auth-capable client (used only for supabase.auth.* and session refresh).
supabaseAuth = createClient(SUPABASE_URL_FOR_CLIENT, SUPABASE_ANON_KEY_FOR_CLIENT, {
  auth: {
    storage: storageWithTimeout as any,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
  global: {
    fetch: fetchWithTimeout,
  },
});

// Data client (used for rest/rpc/storage/realtime).
// Critical: uses `accessToken` option so data calls do NOT depend on supabase.auth.getSession()
// for every request. This avoids a class of "pre-network" hangs on some iOS builds.
supabaseData = createClient(SUPABASE_URL_FOR_CLIENT, SUPABASE_ANON_KEY_FOR_CLIENT, {
  accessToken: getDataAccessToken,
  global: {
    fetch: fetchWithTimeout,
  },
});

// Keep our token cache up to date (TOKEN_REFRESHED events included).
try {
  supabaseAuth.auth.onAuthStateChange((_event: any, session: any) => {
    const token = session?.access_token ?? null;
    setCachedAccessToken(token);
    syncRealtimeAuth(token);
  });
} catch {
  // best-effort only
}

// Warm cached token once on module load.
try {
  void (async () => {
    const token = await getDataAccessToken();
    if (token) {
      // Breadcrumb only: useful when debugging auth/bootstrap order without creating Sentry issues.
      addBreadcrumb('[supabase] token_warm', { ok: true });
    }
  })();
} catch {
  // ignore
}

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

// Wrap `rpc` to protect against "pre-fetch" hangs.
try {
  const origRpc = supabaseData.rpc?.bind(supabaseData);
  if (typeof origRpc === 'function') {
    supabaseData.rpc = async (fn: string, args?: Record<string, unknown>, options?: Record<string, unknown>) => {
      const start = Date.now();
      const pseudoPath = `rpc/${String(fn)}`;
      let timedOut = false;

      const res = await Promise.race([
        origRpc(fn as any, args as any, options as any),
        new Promise<any>((resolve) =>
          setTimeout(() => {
            timedOut = true;
            resolve(makeClientTimeoutRpcResult());
          }, SUPABASE_CALL_TIMEOUT_MS),
        ),
      ]);

      const ms = Date.now() - start;
      const status = typeof res?.status === 'number' ? res.status : (res?.error ? CLIENT_TIMEOUT_STATUS : 200);
      recordNetEvent('RPC', pseudoPath, status, ms);

      if (timedOut) {
        logFetchIssueThrottled(
          'client_timeout',
          { fn: String(fn), ms, message: 'client_hang_or_fetch_stall', storageTimeoutMs: AUTH_STORAGE_TIMEOUT_MS },
          `client_timeout|${pseudoPath}`,
        );
        void probeSupabaseConnectivity('rpc_client_timeout');
      }

      return res;
    };
  }
} catch {
  // best-effort only
}

// Public facade: keep existing import sites working.
// - supabase.auth.* uses the auth client.
// - everything else uses the data client (with accessToken override).
const supabaseFacade = new Proxy({}, {
  get(_target, prop: string) {
    if (prop === 'auth') return supabaseAuth.auth;
    const v = supabaseData[prop];
    if (typeof v === 'function') return v.bind(supabaseData);
    return v;
  },
});

// Keep the client effectively untyped (`Database = any`) while preserving the
// supabase-js return shapes (e.g. `{ data, error }`). We cast to the concrete
// client type (not `ReturnType<typeof createClient>`) to avoid type-level
// generics collapsing into `never` under moduleResolution=bundler.
export const supabase = supabaseFacade as unknown as SupabaseClient<any>;

// -----------------------------
// Auth lifecycle (RN background)
// -----------------------------

let authLifecycleRefCount = 0;
let authLifecycleCleanup: (() => void) | null = null;

export const initSupabaseAuthLifecycle = () => {
  authLifecycleRefCount += 1;

  const release = () => {
    authLifecycleRefCount -= 1;
    if (authLifecycleRefCount > 0) return;
    authLifecycleRefCount = 0;

    if (authLifecycleCleanup) {
      const cleanup = authLifecycleCleanup;
      authLifecycleCleanup = null;
      try {
        cleanup();
      } catch {
        // ignore
      }
    }
  };

  if (authLifecycleCleanup) return release;

  const start = () => {
    try {
      supabaseAuth.auth?.startAutoRefresh?.();
    } catch {
      // ignore
    }
  };

  const stop = () => {
    try {
      supabaseAuth.auth?.stopAutoRefresh?.();
    } catch {
      // ignore
    }
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
      (sub as any)?.remove?.();
    } catch {}
  };

  return release;
};

// -----------------------------
// Session sanity check helper
// -----------------------------

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
    const { data, error } = await supabaseAuth.auth.getSession();
    if (error) return 'failed';

    const session = data?.session ?? null;
    if (!session) return 'no_session';

    // Always keep the shared token cache hot so RPC/realtime do not fall back to anon.
    try {
      const token = (session as any)?.access_token ?? null;
      if (token) {
        setCachedAccessToken(token);
        syncRealtimeAuth(token);
      }
    } catch {}

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
    if (now - lastRefreshAttemptAt < REFRESH_COOLDOWN_MS) return 'failed';
    lastRefreshAttemptAt = now;

    refreshInFlight = (async () => {
      try {
        const res: any = await withTimeout(supabaseAuth.auth.refreshSession(), REFRESH_TIMEOUT_MS);
        if (res?.error) return 'failed';
        const ok = Boolean(res?.data?.session);
        if (ok) {
          setCachedAccessToken(res.data.session.access_token ?? null);
        }
        return ok ? 'refreshed' : 'failed';
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
