import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js';
import { AppState } from 'react-native';
import { addEventListener as addNetInfoListener, fetch as fetchNetInfo } from '@react-native-community/netinfo';
import { isLikelyNetworkError } from '@/lib/network';
import { isNetworkConnectionAvailable } from '@/lib/network-state';
import { addBreadcrumb, captureMessage } from '@/lib/telemetry/sentry';
import { isSupabaseAccessTokenUsable } from '@/lib/auth/session-token';
import { buildSupabasePublicHeaders } from '@/lib/supabase-public-headers';
import {
  createAuthFetchTransport,
  TERMINAL_REFRESH_ERROR_CODES,
} from '@/lib/auth/auth-transport';
import { createDurableAuthStorage } from '@/lib/auth/durable-auth-storage';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

const IS_DEV = typeof __DEV__ !== 'undefined' && __DEV__;
const EXPO_ENV = String(process.env.EXPO_PUBLIC_ENVIRONMENT || '').toLowerCase();
const IS_PROD = EXPO_ENV === 'production' || (!IS_DEV && EXPO_ENV !== 'development');

// Give release builds a bit more time on slower mobile networks, while still
// protecting against the "fetch hangs forever after resume" issue.
const SUPABASE_FETCH_TIMEOUT_MS = IS_DEV ? 15_000 : 30_000;
// Image moderation has its own bounded provider deadline (30s). Allow enough
// transport headroom for receipt persistence and a fast canonical commit.
const SAFETY_FUNCTION_FETCH_TIMEOUT_MS = 60_000;

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
  getAuthRetryState: () => authTransport.getState(),
  resetAuthTransportStateForTests: () => authTransport.resetForTests(),
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

const resolveFetchTimeoutMs = (path: string) =>
  path.endsWith('/functions/v1/chat-attachment-finalize')
    ? Math.max(SUPABASE_FETCH_TIMEOUT_MS, SAFETY_FUNCTION_FETCH_TIMEOUT_MS)
    : SUPABASE_FETCH_TIMEOUT_MS;

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
// Durable auth storage
// -----------------------------

const safeStorageKey = (key: string) => {
  try {
    const k = String(key || '');
    return k.length <= 24 ? k : `${k.slice(0, 24)}...`;
  } catch {
    return 'unknown';
  }
};

// Refresh tokens are single-use, rotated credentials. A storage adapter must
// never turn a slow read into "no session" or report a write as successful
// before it is durable. Keep slow-operation telemetry, but always await the
// native operation and propagate failures to Supabase Auth.
const AUTH_STORAGE_SLOW_MS = 2_000;
const durableAuthStorage = createDurableAuthStorage(AsyncStorage, {
  slowMs: AUTH_STORAGE_SLOW_MS,
  onSlow: (op, key, ms) => {
    logFetchIssueThrottled(
      'auth_storage_slow',
      { op, key: safeStorageKey(key), ms },
      `auth_storage_slow|${op}|${safeStorageKey(key)}`,
    );
  },
  onError: (op, key) => {
    logFetchIssueThrottled(
      'auth_storage_error',
      { op, key: safeStorageKey(key) },
      `auth_storage_error|${op}|${safeStorageKey(key)}`,
    );
  },
});

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
let lastAuthFailureStatus: 401 | null = null;

const recordAuthFailure = (status: 401) => {
  lastAuthFailureAt = Date.now();
  lastAuthFailureStatus = status;
};

const clearAuthFailure = () => {
  lastAuthFailureAt = 0;
  lastAuthFailureStatus = null;
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

  if (status === 401) {
    recordAuthFailure(401);
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

  if (status === 403) {
    // A PostgREST/RPC 403 usually represents RLS or an application permission
    // decision. It is not evidence that the access token needs refreshing.
    logFetchIssueThrottled(
      'http_403',
      { path, status, ms, via, method, message: 'permission_denied' },
      `http_403|${baseThrottleKey}`,
    );
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
  const timeoutMs = resolveFetchTimeoutMs(path);
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
        setTimeout(() => resolve(makeSyntheticResponse('timeout', 'network_timeout')), timeoutMs),
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
  const timeoutMs = resolveFetchTimeoutMs(path);
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
      }, timeoutMs);
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

// Auth gets a dedicated transport contract. Unlike the data client wrapper,
// refresh timeouts/rejections must be thrown so Auth JS classifies them as
// retryable and retains the canonical persisted session. Refresh-only 429 and
// unknown/transient HTTP failures are gated before Auth JS can interpret them
// as terminal credential rejection.
const authTransport = createAuthFetchTransport({
  fetchImpl: (input, init) => fetch(input, init),
  timeoutMs: SUPABASE_FETCH_TIMEOUT_MS,
  isConfigured: SUPABASE_IS_CONFIGURED,
  onDiagnostic: (event) => {
    const status = event.status ?? 0;
    const context = {
      path: event.path,
      method: event.method,
      status: event.status,
      elapsedMs: event.elapsedMs,
      retryAt: event.retryAt,
      attempt: event.attempt,
      networkRequest: event.networkRequest,
      terminalCode: event.terminalCode ?? null,
    };
    recordNetEvent(event.method, event.path, status, event.elapsedMs, {
      code: event.code,
      via: `auth_${event.via}`,
    });

    if (event.code === 'success' || event.code === 'retry_deferred') {
      addBreadcrumb(`[auth-transport] ${event.code}`, context);
      return;
    }

    logFetchIssueThrottled(
      `auth_transport_${event.code}`,
      context,
      `auth_transport_${event.code}|${event.path}|${event.status ?? 0}`,
    );
  },
});

export const getSupabaseAuthRetryState = () => authTransport.getState();

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
      headers: buildSupabasePublicHeaders({ apiKey: SUPABASE_ANON_KEY }),
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
  cachedAccessToken = isSupabaseAccessTokenUsable(token) ? token : null;
};

let supabaseAuth: any;
let supabaseData: any;

const syncRealtimeAuth = (token: string | null) => {
  // Realtime auth isn't automatically wired up when we split auth/data clients.
  // Without this, postgres_changes subscriptions can connect "anon" and silently
  // stop delivering in-app notification events in release builds.
  try {
    if (!supabaseData?.realtime?.setAuth) return;
    if (isSupabaseAccessTokenUsable(token)) void supabaseData.realtime.setAuth(token);
    else void supabaseData.realtime.setAuth();
  } catch {
    // best-effort only
  }
};

const getDataAccessToken = async (): Promise<string | null> => {
  // Fast path: reuse the last known token from auth events.
  if (cachedAccessToken && isSupabaseAccessTokenUsable(cachedAccessToken)) {
    return cachedAccessToken;
  }
  if (cachedAccessToken) {
    setCachedAccessToken(null);
    syncRealtimeAuth(null);
  }

  // If auth isn't ready yet, fall back to null (supabase-js will use anon key).
  if (!supabaseAuth?.auth) return null;

  try {
    const { data, error } = await supabaseAuth.auth.getSession();
    if (error) throw error;
    const token = data?.session?.access_token ?? null;
    if (isSupabaseAccessTokenUsable(token)) {
      setCachedAccessToken(token);
      syncRealtimeAuth(token);
      return token;
    }
    return null;
  } catch (error) {
    // Authenticated operations must not silently downgrade to an anonymous
    // request when session storage is unavailable.
    throw error;
  }
};

// Auth-capable client (used only for supabase.auth.* and session refresh).
supabaseAuth = createClient(SUPABASE_URL_FOR_CLIENT, SUPABASE_ANON_KEY_FOR_CLIENT, {
  auth: {
    storage: durableAuthStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
  global: {
    fetch: authTransport.fetch,
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
    if (session?.access_token) clearAuthFailure();
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
          { fn: String(fn), ms, message: 'client_hang_or_fetch_stall' },
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
    try {
      supabase.realtime.connect();
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
    try {
      // Push owns background delivery. Closing the socket prevents retained
      // screen channels from continuing database change work while hidden;
      // existing channels rejoin when start() reconnects the client.
      supabase.realtime.disconnect();
    } catch {
      // ignore
    }
  };

  let currentAppState = AppState.currentState;
  let isReachable: boolean | null = null;

  const syncAutoRefresh = () => {
    if (currentAppState === 'active' && isReachable === true) {
      start();
      return;
    }
    stop();
  };

  syncAutoRefresh();

  const sub = AppState.addEventListener('change', (state) => {
    currentAppState = state;
    syncAutoRefresh();
  });

  const netInfoSubscription = addNetInfoListener((state) => {
    isReachable = isNetworkConnectionAvailable(state);
    syncAutoRefresh();
  });

  void fetchNetInfo()
    .then((state) => {
      isReachable = isNetworkConnectionAvailable(state);
      syncAutoRefresh();
    })
    .catch(() => {
      // keep the current auth refresh state when connectivity cannot be probed
    });

  authLifecycleCleanup = () => {
    try {
      stop();
    } catch {}
    try {
      supabase.realtime.disconnect();
    } catch {}
    try {
      (sub as any)?.remove?.();
    } catch {}
    try {
      netInfoSubscription();
    } catch {}
  };

  return release;
};

// -----------------------------
// Session sanity check helper
// -----------------------------

const REFRESH_COOLDOWN_MS = 60_000;
const EXPIRY_SOON_SECONDS = 90;
const AUTH_FAILURE_GRACE_MS = 5 * 60_000;

type AuthRefreshAttempt =
  | { status: 'refreshed'; session: Session }
  | { status: 'failed'; error: unknown };

let refreshInFlight: Promise<AuthRefreshAttempt> | null = null;
let lastRefreshAttemptAt = 0;
type EnsureFreshSessionStatus = 'ok' | 'no_session' | 'refreshed' | 'failed';
let ensureSessionInFlight: Promise<EnsureFreshSessionStatus> | null = null;

export type SupabaseSessionRecoveryStatus =
  | 'ok'
  | 'refreshed'
  | 'failed_recoverable'
  | 'failed_unrecoverable';

export type SupabaseSessionRecoveryResult = {
  status: SupabaseSessionRecoveryStatus;
  reason: string;
  attempts: number;
  errorMessage?: string | null;
  failureKind?: AuthRecoveryFailureKind | null;
  retryAt?: number | null;
};

export type AuthRecoveryFailureKind =
  | 'absent_credentials'
  | 'network'
  | 'rate_limited'
  | 'storage'
  | 'superseded'
  | 'terminal_credentials'
  | 'unknown';

export const getRecentSupabaseAuthFailure = () => {
  if (!lastAuthFailureStatus || !lastAuthFailureAt) return null;
  const ageMs = Date.now() - lastAuthFailureAt;
  if (ageMs > AUTH_FAILURE_GRACE_MS) return null;
  return {
    status: lastAuthFailureStatus,
    at: lastAuthFailureAt,
    ageMs,
  } as const;
};

const refreshAuthSession = async (): Promise<AuthRefreshAttempt> => {
  if (refreshInFlight) return await refreshInFlight;

  const attempt = (async (): Promise<AuthRefreshAttempt> => {
    try {
      // Auth JS owns refresh single-flight, retry duration, token rotation and
      // stale-commit guards. The dedicated fetch transport is already bounded;
      // an outer timeout race would release this guard while SDK work continues.
      const result: any = await supabaseAuth.auth.refreshSession();
      if (result?.error) return { status: 'failed', error: result.error };
      if (!result?.data?.session) {
        return { status: 'failed', error: new Error('refresh_session_empty') };
      }

      const refreshedSession = result.data.session as Session;
      setCachedAccessToken(refreshedSession.access_token ?? null);
      syncRealtimeAuth(refreshedSession.access_token ?? null);
      clearAuthFailure();
      return { status: 'refreshed', session: refreshedSession };
    } catch (error) {
      return { status: 'failed', error };
    }
  })();

  refreshInFlight = attempt;
  try {
    return await attempt;
  } finally {
    if (refreshInFlight === attempt) refreshInFlight = null;
  }
};

const logSessionRecoveryEvent = (event: string, data?: Record<string, unknown>) => {
  addBreadcrumb(`[auth-recovery] ${event}`, data);
  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    console.log('[auth-recovery]', { event, ...(data ?? {}) });
  }
};

const getAuthRecoveryErrorSummary = (error: unknown) => {
  const name = typeof (error as any)?.name === 'string' ? (error as any).name : 'Error';
  const code = typeof (error as any)?.code === 'string' ? (error as any).code : null;
  const status = typeof (error as any)?.status === 'number' ? (error as any).status : null;
  return [name, code, status].filter((value) => value !== null && value !== '').join(':');
};

export const classifyAuthRecoveryError = (error: unknown): AuthRecoveryFailureKind => {
  const code = typeof (error as any)?.code === 'string' ? (error as any).code : null;
  const name = typeof (error as any)?.name === 'string' ? (error as any).name : '';
  const status = typeof (error as any)?.status === 'number' ? (error as any).status : null;
  const transportState = authTransport.getState();

  if (code === 'auth_storage_failed' || name === 'AuthStorageError') return 'storage';
  if (name === 'AuthRefreshDiscardedError' || code === 'refresh_superseded') return 'superseded';
  if (code && TERMINAL_REFRESH_ERROR_CODES.has(code)) return 'terminal_credentials';
  if (status === 429 || transportState.retryCode === 'rate_limited') return 'rate_limited';
  if (
    name === 'AuthRetryableFetchError' ||
    name === 'AuthTransientTransportError' ||
    status === 0 ||
    status === 408 ||
    status === 425 ||
    status === 598 ||
    status === 599 ||
    (typeof status === 'number' && status >= 500) ||
    isLikelyNetworkError(error)
  ) {
    return 'network';
  }
  return 'unknown';
};

const getCurrentSession = async () => await supabaseAuth.auth.getSession();

const ensureFreshSessionOnce = async (): Promise<EnsureFreshSessionStatus> => {
  try {
    const { data, error } = await getCurrentSession();
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

    if (!expiresSoon && !recent401) {
      clearAuthFailure();
      return 'ok';
    }

    const retryState = authTransport.getState();
    if (retryState.retryAt && retryState.retryAt > Date.now()) return 'failed';

    if (refreshInFlight) {
      const activeRefresh = await refreshInFlight;
      return activeRefresh.status === 'refreshed' ? 'refreshed' : 'failed';
    }

    const now = Date.now();
    if (now - lastRefreshAttemptAt < REFRESH_COOLDOWN_MS) return 'failed';
    lastRefreshAttemptAt = now;

    const out = await refreshAuthSession();
    return out.status === 'refreshed' ? 'refreshed' : 'failed';
  } catch {
    return 'failed';
  }
};

export async function ensureFreshSession(): Promise<EnsureFreshSessionStatus> {
  if (ensureSessionInFlight) return await ensureSessionInFlight;

  const attempt = ensureFreshSessionOnce();
  ensureSessionInFlight = attempt;
  try {
    return await attempt;
  } finally {
    if (ensureSessionInFlight === attempt) ensureSessionInFlight = null;
  }
}

export async function recoverSupabaseConnectivity(
  reason: string = 'network_restored',
  options?: {
    onStateChange?: (state: 'get_session' | 'session_refreshing') => void;
  },
): Promise<SupabaseSessionRecoveryResult> {
  const failedRecoverable = (
    kind: Exclude<AuthRecoveryFailureKind, 'terminal_credentials' | 'absent_credentials'>,
    attempts: number,
    error?: unknown,
  ): SupabaseSessionRecoveryResult => {
    const retryState = authTransport.getState();
    const errorMessage = error ? getAuthRecoveryErrorSummary(error) : kind;
    logSessionRecoveryEvent('supabase_refresh_failed_recoverable', {
      reason,
      attempts,
      failureKind: kind,
      retryAt: retryState.retryAt,
      error: errorMessage,
    });
    return {
      status: 'failed_recoverable',
      reason,
      attempts,
      failureKind: kind,
      retryAt: retryState.retryAt,
      errorMessage,
    };
  };

  const failedTerminal = (
    kind: 'terminal_credentials' | 'absent_credentials',
    attempts: number,
    error?: unknown,
  ): SupabaseSessionRecoveryResult => {
    const transportState = authTransport.getState();
    const errorMessage = error
      ? getAuthRecoveryErrorSummary(error)
      : transportState.lastTerminalCode ?? 'session_missing';
    logSessionRecoveryEvent('supabase_refresh_failed_unrecoverable', {
      reason,
      attempts,
      failureKind: kind,
      error: errorMessage,
      precedingTerminalCode: transportState.lastTerminalCode,
      precedingTerminalStatus: transportState.lastTerminalStatus,
    });
    return {
      status: 'failed_unrecoverable',
      reason,
      attempts,
      failureKind: kind,
      retryAt: null,
      errorMessage,
    };
  };

  try {
    const networkState = await fetchNetInfo().catch(() => null);
    if (!isNetworkConnectionAvailable(networkState)) {
      logSessionRecoveryEvent('supabase_refresh_deferred_offline', { reason });
      return {
        status: 'failed_recoverable',
        reason,
        attempts: 0,
        failureKind: 'network',
        retryAt: authTransport.getState().retryAt,
        errorMessage: 'network_unavailable',
      };
    }

    const retryState = authTransport.getState();
    if (retryState.retryAt && retryState.retryAt > Date.now()) {
      return failedRecoverable(
        retryState.retryCode === 'rate_limited' ? 'rate_limited' : 'network',
        0,
      );
    }

    options?.onStateChange?.('get_session');
    logSessionRecoveryEvent('supabase_get_session_attempted', { reason });

    const { data, error } = await getCurrentSession();
    const session = data?.session ?? null;
    const nowSec = Math.floor(Date.now() / 1000);
    const expiresAt = typeof (session as any)?.expires_at === 'number' ? (session as any).expires_at : null;
    const expiresSoon = typeof expiresAt === 'number' ? expiresAt - nowSec <= EXPIRY_SOON_SECONDS : false;
    const recent401 =
      lastAuthFailureStatus === 401 && Date.now() - lastAuthFailureAt <= AUTH_FAILURE_GRACE_MS;

    try {
      const token = session?.access_token ?? null;
      setCachedAccessToken(token);
      syncRealtimeAuth(token);
    } catch {
      // best effort only
    }

    if (error) {
      const failureKind = classifyAuthRecoveryError(error);
      if (failureKind === 'terminal_credentials') {
        return failedTerminal('terminal_credentials', 0, error);
      }
      return failedRecoverable(
        failureKind === 'absent_credentials' ? 'unknown' : failureKind,
        0,
        error,
      );
    }

    if (!session) {
      const transportState = authTransport.getState();
      return transportState.lastTerminalCode
        ? failedTerminal('terminal_credentials', 0)
        : failedTerminal('absent_credentials', 0);
    }

    if (session && !expiresSoon && !recent401) {
      try {
        const realtime = supabaseData?.realtime;
        realtime?.connect?.();
      } catch {
        // best effort only
      }
      logSessionRecoveryEvent('supabase_refresh_succeeded', {
        reason,
        mode: 'get_session',
      });
      addBreadcrumb('[supabase] recover_connectivity', { reason, status: 'ok' });
      clearAuthFailure();
      return {
        status: 'ok',
        reason,
        attempts: 0,
        failureKind: null,
        retryAt: null,
      };
    }

    // One app-owned attempt only. Auth JS already owns refresh single-flight,
    // retry duration and rotation. Additional app loops stack retry windows and
    // can cause a resume/network/manual-retry storm.
    options?.onStateChange?.('session_refreshing');
    logSessionRecoveryEvent('supabase_refresh_attempted', { reason, attempt: 1 });
    lastRefreshAttemptAt = Date.now();
    const refresh = await refreshAuthSession();
    if (refresh.status === 'failed') {
      const failureKind = classifyAuthRecoveryError(refresh.error);
      if (failureKind === 'terminal_credentials') {
        return failedTerminal('terminal_credentials', 1, refresh.error);
      }
      return failedRecoverable(
        failureKind === 'absent_credentials' ? 'unknown' : failureKind,
        1,
        refresh.error,
      );
    }

    try {
      supabaseData?.realtime?.connect?.();
    } catch {
      // best effort only
    }
    logSessionRecoveryEvent('supabase_refresh_succeeded', { reason, attempt: 1 });
    addBreadcrumb('[supabase] recover_connectivity', { reason, status: 'refreshed', attempt: 1 });
    return {
      status: 'refreshed',
      reason,
      attempts: 1,
      failureKind: null,
      retryAt: null,
    };
  } catch (error) {
    const failureKind = classifyAuthRecoveryError(error);
    if (failureKind === 'terminal_credentials') {
      return failedTerminal('terminal_credentials', 0, error);
    }
    return failedRecoverable(
      failureKind === 'absent_credentials' ? 'unknown' : failureKind,
      0,
      error,
    );
  }
}
