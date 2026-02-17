import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

const SUPABASE_FETCH_TIMEOUT_MS = 15_000;

// React Native fetch can hang indefinitely when the app resumes from background or
// the network changes. Provide a timeout-aware fetch so UI never spins forever.
const fetchWithTimeout: typeof fetch = async (input, init) => {
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

    const res = await fetch(input, { ...(init || {}), signal: controller.signal } as any);
    return res;
  } catch (error) {
    const message = String((error as any)?.message || error || 'fetch_failed');
    // Return a synthetic response so supabase-js returns `{ error }` instead of throwing.
    // 599 is a common "network connect timeout" sentinel in some stacks.
    try {
      return new Response(JSON.stringify({ message, code: 'network_timeout' }), {
        status: 599,
        headers: { 'Content-Type': 'application/json' },
      });
    } catch {
      // If Response isn't available for some reason, rethrow.
      throw error;
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
