import AsyncStorage from "@react-native-async-storage/async-storage";

// Tiny, dependency-free AsyncStorage cache with TTL.
// Used to render cached content immediately (cached-first) and refresh in background.

export type CacheEnvelope<T> = {
  v: 1;
  savedAt: number;
  data: T;
};

export async function readCache<T>(key: string, maxAgeMs: number): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CacheEnvelope<T> | null;
    if (!parsed || parsed.v !== 1 || typeof parsed.savedAt !== "number") return null;
    if (Date.now() - parsed.savedAt > maxAgeMs) return null;
    return parsed.data ?? null;
  } catch {
    return null;
  }
}

export async function writeCache<T>(key: string, data: T): Promise<void> {
  try {
    const env: CacheEnvelope<T> = { v: 1, savedAt: Date.now(), data };
    await AsyncStorage.setItem(key, JSON.stringify(env));
  } catch {
    // ignore cache write errors
  }
}

export async function removeCache(key: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(key);
  } catch {
    // ignore cache remove errors
  }
}

