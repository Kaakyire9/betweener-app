import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { captureMessage } from '@/lib/telemetry/sentry';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

// Give release builds a bit more time on slower mobile networks, while still
// protecting against the "fetch hangs forever after resume" issue.
const SUPABASE_FETCH_TIMEOUT_MS =
  typeof __DEV__ !== 'undefined' && __DEV__ ? 15_000 : 30_000;

export const SUPABASE_IS_CONFIGURED = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

const LOG_THROTTLE_MS = 60_000;
let lastLogAt = 0;
let lastLogKey = '';

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

const logFetchIssueOnce = (key: string, context: Record<string, unknown>) => {
  const now = Date.now();
  if (key === lastLogKey && now - lastLogAt < LOG_THROTTLE_MS) return;
  lastLogKey = key;
  lastLogAt = now;
  captureMessage(`[supabase] ${key}`, context);
};

const makeSyntheticResponse = (message: string, code: string) => {
  // Return a synthetic response so supabase-js returns `{ error }` instead of throwing.
  // 599 is a common "network connect timeout" sentinel in some stacks.
  return new Response(JSON.stringify({ message, code }), {
    status: 599,
    headers: { 'Content-Type': 'application/json' },
  });
};

const looksLikeSignalUnsupported = (message: string) => {
  const m = message.toLowerCase();
  // Different RN/iOS stacks surface different errors when `signal` isn't supported.
  return (
    (m.includes('signal') || m.includes('abortcontroller') || m.includes('abort')) &&
    (m.includes('not supported') || m.includes('unsupported') || m.includes('invalid'))
  );
};

const fetchWithRaceTimeout: typeof fetch = async (input, init) => {
  try {
    const res = (await Promise.race([
      fetch(input, init as any),
      new Promise<Response>((resolve) =>
        setTimeout(() => resolve(makeSyntheticResponse('timeout', 'network_timeout')), SUPABASE_FETCH_TIMEOUT_MS)
      ),
    ])) as Response;
    if (res.status >= 400) {
      const path = safeUrlPath(input);
      logFetchIssueOnce(`http_${res.status}`, { path, via: 'race' });
    }
    return res;
  } catch (error) {
    const message = String((error as any)?.message || error || 'fetch_failed');
    const path = safeUrlPath(input);
    logFetchIssueOnce('exception', { path, via: 'race', message });
    return makeSyntheticResponse(message, 'network_error');
  }
};

// React Native fetch can hang indefinitely when the app resumes from background or
// the network changes. Provide a timeout-aware fetch so UI never spins forever.
//
// Important: some RN builds/devices don't support `signal` yet. In that case, we
// fall back to a Promise.race timeout (cannot abort the underlying request).
const fetchWithTimeout: typeof fetch = async (input, init) => {
  const hasAbortController = typeof AbortController !== 'undefined';
  if (!hasAbortController) {
    return fetchWithRaceTimeout(input, init);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SUPABASE_FETCH_TIMEOUT_MS);

  // If the caller already provided a signal, abort our controller when theirs aborts.
  const callerSignal = (init as any)?.signal as AbortSignal | undefined;
  const onCallerAbort = () => controller.abort();

  try {
    if (callerSignal) {
      if (callerSignal.aborted) controller.abort();
      else callerSignal.addEventListener('abort', onCallerAbort, { once: true });
    }

    try {
      const res = await fetch(input, { ...(init || {}), signal: controller.signal } as any);
      if (res.status >= 400) {
        const path = safeUrlPath(input);
        logFetchIssueOnce(`http_${res.status}`, { path, via: 'abort' });
      }
      return res;
    } catch (error) {
      const message = String((error as any)?.message || error || 'fetch_failed');

      // If this RN runtime doesn't support `signal`, retry once without it.
      if (looksLikeSignalUnsupported(message)) {
        const path = safeUrlPath(input);
        logFetchIssueOnce('signal_unsupported', { path, message });
        return fetchWithRaceTimeout(input, init);
      }

      // Otherwise convert to a synthetic response so callers get `{ error }`.
      const path = safeUrlPath(input);
      logFetchIssueOnce('exception', { path, via: 'abort', message });
      return makeSyntheticResponse(message, 'network_error');
    }
  } finally {
    clearTimeout(timeout);
    if (callerSignal) {
      try {
        callerSignal.removeEventListener('abort', onCallerAbort as any);
      } catch {}
    }
  }
};

// Keep this client untyped for now to avoid forcing a full, repo-wide type migration.
// We still use generated DB types at API boundaries (e.g. updateProfile) for safety.
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false, // Keep false for React Native
  },
  global: {
    fetch: fetchWithTimeout,
  },
});
