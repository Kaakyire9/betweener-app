import * as Crypto from 'expo-crypto';
import * as FileSystem from 'expo-file-system/legacy';

import { readOfflineData, writeOfflineEnvelope } from '@/lib/offline/core';
import {
  buildScopedOfflineCacheKey,
  scopeOfflineCacheKey,
} from '@/lib/offline/cache-scope';

const VIDEO_CACHE_KEY = 'offline:video-store:v1';
// Videos are intentionally durable after download, but remain LRU bounded.
const VIDEO_CACHE_DIR = `${FileSystem.cacheDirectory ?? ''}offline-videos/`;
const VIDEO_CACHE_MAX_BYTES = 450 * 1024 * 1024;
const VIDEO_CACHE_MAX_ENTRIES = 80;
const VIDEO_CACHE_TOUCH_INTERVAL_MS = 60 * 60 * 1000;

type VideoCacheEntry = {
  localUri: string;
  sourceKey: string;
  remoteUri?: string | null;
  extension?: string;
  savedAt?: number;
};

type VideoCacheMap = Record<string, VideoCacheEntry>;
const videoDownloads = new Map<string, Promise<string | null>>();
let videoManifestMutationQueue: Promise<void> = Promise.resolve();
let videoManifestCache: VideoCacheMap | null = null;
let videoManifestLoad: Promise<VideoCacheMap> | null = null;

const normalizeLocalFileUri = (value: string) =>
  value.startsWith('/') ? `file://${value}` : value;

const queueVideoManifestMutation = <T>(mutation: () => Promise<T>): Promise<T> => {
  const operation = videoManifestMutationQueue.then(mutation, mutation);
  videoManifestMutationQueue = operation.then(
    () => undefined,
    () => undefined,
  );
  return operation;
};

const normalizeVideoCacheMap = (raw: unknown): VideoCacheMap => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const next: VideoCacheMap = {};
  Object.entries(raw as Record<string, unknown>).forEach(([key, value]) => {
    if (typeof value === 'string') {
      next[key] = {
        localUri: value,
        sourceKey: key,
      };
      return;
    }
    if (!value || typeof value !== 'object' || Array.isArray(value)) return;
    const record = value as Partial<VideoCacheEntry>;
    if (typeof record.localUri !== 'string' || !record.localUri.trim()) return;
    next[key] = {
      localUri: record.localUri,
      sourceKey: typeof record.sourceKey === 'string' && record.sourceKey.trim() ? record.sourceKey : key,
      remoteUri: typeof record.remoteUri === 'string' ? record.remoteUri : undefined,
      extension: typeof record.extension === 'string' ? record.extension : undefined,
      savedAt: typeof record.savedAt === 'number' ? record.savedAt : undefined,
    };
  });
  return next;
};

const readVideoCacheMap = async (): Promise<VideoCacheMap> => {
  if (videoManifestCache) return { ...videoManifestCache };
  if (!videoManifestLoad) {
    videoManifestLoad = readOfflineData<unknown>(VIDEO_CACHE_KEY)
      .then(normalizeVideoCacheMap)
      .then((map) => {
        videoManifestCache = map;
        return map;
      })
      .finally(() => {
        videoManifestLoad = null;
      });
  }
  return { ...(await videoManifestLoad) };
};

const writeVideoCacheMap = async (next: VideoCacheMap) => {
  await writeOfflineEnvelope(VIDEO_CACHE_KEY, next, { kind: 'video-manifest' });
  videoManifestCache = { ...next };
};

export const primeOfflineVideoStore = async () => {
  await readVideoCacheMap();
};

export const peekOfflineVideoUri = (
  ownerUserId: string | null | undefined,
  sourceKey: string | null | undefined,
) => {
  if (!ownerUserId || !sourceKey || !videoManifestCache) return null;
  return videoManifestCache[buildScopedOfflineCacheKey(ownerUserId, sourceKey)]?.localUri ?? null;
};

const ensureVideoCacheDir = async () => {
  const info = await FileSystem.getInfoAsync(VIDEO_CACHE_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(VIDEO_CACHE_DIR, { intermediates: true });
  }
};

const guessVideoExtension = (value?: string | null) => {
  if (!value) return 'mp4';
  const clean = String(value).split('?')[0].split('#')[0];
  const ext = clean.split('.').pop()?.toLowerCase() || 'mp4';
  if (ext.length < 2 || ext.length > 5) return 'mp4';
  return ext;
};

const buildCachePath = async (sourceKey: string, extension: string) => {
  const hash = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, sourceKey);
  return `${VIDEO_CACHE_DIR}${hash}.${extension}`;
};

const pruneVideoCacheMap = async (map: VideoCacheMap): Promise<VideoCacheMap> => {
  const entries = await Promise.all(
    Object.entries(map).map(async ([key, entry]) => {
      try {
        const info = await FileSystem.getInfoAsync(entry.localUri);
        if (!info.exists) return null;
        return {
          key,
          entry: {
            ...entry,
            savedAt: typeof entry.savedAt === 'number' ? entry.savedAt : Date.now(),
          },
          size: 'size' in info && typeof info.size === 'number' ? info.size : 0,
        };
      } catch {
        return null;
      }
    }),
  );

  const validEntries = entries.filter(Boolean) as {
    key: string;
    entry: VideoCacheEntry & { savedAt: number };
    size: number;
  }[];
  validEntries.sort((a, b) => (b.entry.savedAt ?? 0) - (a.entry.savedAt ?? 0));

  const kept: VideoCacheMap = {};
  let totalBytes = 0;
  let keptEntries = 0;

  for (const candidate of validEntries) {
    const fitsEntryBudget = keptEntries < VIDEO_CACHE_MAX_ENTRIES;
    const fitsByteBudget =
      keptEntries === 0 || totalBytes + candidate.size <= VIDEO_CACHE_MAX_BYTES;
    if (fitsEntryBudget && fitsByteBudget) {
      kept[candidate.key] = candidate.entry;
      totalBytes += candidate.size;
      keptEntries += 1;
      continue;
    }
    try {
      await FileSystem.deleteAsync(candidate.entry.localUri, { idempotent: true });
    } catch {
      // Best effort eviction only.
    }
  }

  return kept;
};

const writePrunedVideoCacheMap = async (map: VideoCacheMap) => {
  const pruned = await pruneVideoCacheMap(map);
  await writeVideoCacheMap(pruned);
  return pruned;
};

export const getOfflineVideoUri = async (sourceKey?: string | null): Promise<string | null> => {
  if (!sourceKey) return null;
  sourceKey = await scopeOfflineCacheKey(sourceKey);
  const map = await readVideoCacheMap();
  const cached = map[sourceKey];
  if (!cached?.localUri) return null;
  try {
    const info = await FileSystem.getInfoAsync(cached.localUri);
    if (info.exists) {
      const lastTouchedAt = typeof cached.savedAt === 'number' ? cached.savedAt : 0;
      if (Date.now() - lastTouchedAt >= VIDEO_CACHE_TOUCH_INTERVAL_MS) {
        await queueVideoManifestMutation(async () => {
          const current = await readVideoCacheMap();
          const latest = current[sourceKey];
          if (!latest) return;
          await writeVideoCacheMap({
            ...current,
            [sourceKey]: {
              ...latest,
              savedAt: Date.now(),
            },
          });
        });
      }
      return cached.localUri;
    }
  } catch {}
  await queueVideoManifestMutation(async () => {
    const current = await readVideoCacheMap();
    if (!current[sourceKey]) return;
    const next = { ...current };
    delete next[sourceKey];
    await writeVideoCacheMap(next);
  });
  return null;
};

export const removeOfflineVideo = async (sourceKey?: string | null) => {
  if (!sourceKey) return;
  sourceKey = await scopeOfflineCacheKey(sourceKey);
  await queueVideoManifestMutation(async () => {
    const map = await readVideoCacheMap();
    const entry = map[sourceKey];
    if (!entry) return;
    try {
      await FileSystem.deleteAsync(entry.localUri, { idempotent: true });
    } catch {}
    const next = { ...map };
    delete next[sourceKey];
    await writeVideoCacheMap(next);
  });
};

const downloadOfflineVideo = async (
  sourceKey: string,
  remoteUri: string,
): Promise<string | null> => {
  if (!sourceKey || !remoteUri) return null;
  sourceKey = await scopeOfflineCacheKey(sourceKey);
  if (!remoteUri.startsWith('http')) return remoteUri;
  try {
    await ensureVideoCacheDir();
    const extension = guessVideoExtension(remoteUri) || guessVideoExtension(sourceKey);
    const targetUri = await buildCachePath(sourceKey, extension);
    const existing = await FileSystem.getInfoAsync(targetUri);
    if (!existing.exists) {
      await FileSystem.downloadAsync(remoteUri, targetUri);
    }
    await queueVideoManifestMutation(async () => {
      const next = await readVideoCacheMap();
      next[sourceKey] = {
        localUri: targetUri,
        sourceKey,
        remoteUri,
        extension,
        savedAt: Date.now(),
      };
      await writePrunedVideoCacheMap(next);
    });
    return targetUri;
  } catch {
    return null;
  }
};

export const cacheOfflineVideo = async (
  sourceKey: string,
  remoteUri?: string | null,
): Promise<string | null> => {
  if (!sourceKey || !remoteUri) return null;
  sourceKey = await scopeOfflineCacheKey(sourceKey);
  if (!remoteUri.startsWith('http')) return remoteUri;
  const existing = videoDownloads.get(sourceKey);
  if (existing) return existing;
  const request = downloadOfflineVideo(sourceKey, remoteUri);
  videoDownloads.set(sourceKey, request);
  try {
    return await request;
  } finally {
    videoDownloads.delete(sourceKey);
  }
};

export const rememberOfflineVideoUri = async (
  sourceKey: string,
  localUri?: string | null,
  remoteUri?: string | null,
): Promise<string | null> =>
  persistOfflineVideoCopy(sourceKey, localUri, remoteUri);

export const persistOfflineVideoCopy = async (
  sourceKey: string,
  localUri?: string | null,
  remoteUri?: string | null,
): Promise<string | null> => {
  if (!sourceKey || !localUri) return null;
  sourceKey = await scopeOfflineCacheKey(sourceKey);
  try {
    const normalizedLocalUri = normalizeLocalFileUri(localUri);
    const info = await FileSystem.getInfoAsync(normalizedLocalUri);
    if (!info.exists) return null;
    await ensureVideoCacheDir();
    const extension = guessVideoExtension(remoteUri) || guessVideoExtension(localUri);
    const targetUri = await buildCachePath(sourceKey, extension);
    if (targetUri !== normalizedLocalUri) {
      await FileSystem.deleteAsync(targetUri, { idempotent: true });
      await FileSystem.copyAsync({ from: normalizedLocalUri, to: targetUri });
    }
    await queueVideoManifestMutation(async () => {
      const next = await readVideoCacheMap();
      next[sourceKey] = {
        localUri: targetUri,
        sourceKey,
        remoteUri,
        extension,
        savedAt: Date.now(),
      };
      await writePrunedVideoCacheMap(next);
    });
    return targetUri;
  } catch {
    return null;
  }
};

export const clearOfflineVideosForOwner = async (ownerUserId: string) => {
  if (!ownerUserId) return;
  const ownerPrefix = `owner/${ownerUserId}/`;
  await queueVideoManifestMutation(async () => {
    const entries = await readVideoCacheMap();
    const retained: VideoCacheMap = {};
    await Promise.all(Object.entries(entries).map(async ([key, entry]) => {
      if (!key.startsWith(ownerPrefix)) {
        retained[key] = entry;
        return;
      }
      videoDownloads.delete(key);
      await FileSystem.deleteAsync(entry.localUri, { idempotent: true }).catch(() => undefined);
    }));
    await writeVideoCacheMap(retained);
  });
};
