import {
  type OfflineEnvelope,
  peekOfflineData,
  readOfflineEnvelope,
  readOfflineState,
  removeOfflineEnvelope,
  writeOfflineEnvelope,
} from '@/lib/offline/core';

// Backward-compatible cached-first wrapper used across the app.
// Consumers still decide freshness with maxAgeMs, but the envelope format is now shared.

export type CacheEnvelope<T> = OfflineEnvelope<T>;

export async function peekCacheEnvelope<T>(key: string): Promise<CacheEnvelope<T> | null> {
  return readOfflineEnvelope<T>(key);
}

export async function readCache<T>(key: string, maxAgeMs: number): Promise<T | null> {
  const state = await readOfflineState<T>(key);
  if (!state.data || state.savedAt == null) return null;
  if (Date.now() - state.savedAt > maxAgeMs) return null;
  return state.data;
}

export async function peekCache<T>(key: string): Promise<T | null> {
  return peekOfflineData<T>(key);
}

export async function writeCache<T>(key: string, data: T): Promise<void> {
  await writeOfflineEnvelope(key, data, { kind: 'cache' });
}

export async function removeCache(key: string): Promise<void> {
  await removeOfflineEnvelope(key);
}
