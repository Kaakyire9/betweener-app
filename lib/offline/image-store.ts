import * as Crypto from 'expo-crypto';
import * as FileSystem from 'expo-file-system/legacy';

import { readOfflineData, writeOfflineEnvelope } from '@/lib/offline/core';

const IMAGE_CACHE_KEY = 'offline:image-store:v1';
const IMAGE_CACHE_DIR = `${FileSystem.documentDirectory ?? FileSystem.cacheDirectory ?? ''}offline-images/`;
const IMAGE_CACHE_MAX_BYTES = 120 * 1024 * 1024;
const IMAGE_CACHE_MAX_ENTRIES = 250;
const IMAGE_CACHE_TOUCH_INTERVAL_MS = 60 * 60 * 1000;

type ImageCacheEntry = {
  localUri: string;
  sourceKey: string;
  remoteUri?: string | null;
  extension?: string;
  savedAt?: number;
};

type ImageCacheMap = Record<string, ImageCacheEntry>;

const normalizeImageCacheMap = (raw: unknown): ImageCacheMap => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const next: ImageCacheMap = {};
  Object.entries(raw as Record<string, unknown>).forEach(([key, value]) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return;
    const record = value as Partial<ImageCacheEntry>;
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

const readImageCacheMap = async (): Promise<ImageCacheMap> => {
  const raw = await readOfflineData<unknown>(IMAGE_CACHE_KEY);
  return normalizeImageCacheMap(raw);
};

const writeImageCacheMap = async (next: ImageCacheMap) => {
  await writeOfflineEnvelope(IMAGE_CACHE_KEY, next, { kind: 'image-manifest' });
};

const ensureImageCacheDir = async () => {
  const info = await FileSystem.getInfoAsync(IMAGE_CACHE_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(IMAGE_CACHE_DIR, { intermediates: true });
  }
};

const guessImageExtension = (value?: string | null) => {
  if (!value) return 'jpg';
  const clean = String(value).split('?')[0].split('#')[0];
  const ext = clean.split('.').pop()?.toLowerCase() || 'jpg';
  if (ext.length < 2 || ext.length > 5) return 'jpg';
  return ext;
};

const buildCachePath = async (sourceKey: string, extension: string) => {
  const hash = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, sourceKey);
  return `${IMAGE_CACHE_DIR}${hash}.${extension}`;
};

const pruneImageCacheMap = async (map: ImageCacheMap): Promise<ImageCacheMap> => {
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
    entry: ImageCacheEntry & { savedAt: number };
    size: number;
  }[];
  validEntries.sort((a, b) => (b.entry.savedAt ?? 0) - (a.entry.savedAt ?? 0));

  const kept: ImageCacheMap = {};
  let totalBytes = 0;
  let keptEntries = 0;

  for (const candidate of validEntries) {
    const fitsEntryBudget = keptEntries < IMAGE_CACHE_MAX_ENTRIES;
    const fitsByteBudget =
      keptEntries === 0 || totalBytes + candidate.size <= IMAGE_CACHE_MAX_BYTES;
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

const writePrunedImageCacheMap = async (map: ImageCacheMap) => {
  const pruned = await pruneImageCacheMap(map);
  await writeImageCacheMap(pruned);
  return pruned;
};

export const getOfflineImageUri = async (sourceKey?: string | null): Promise<string | null> => {
  if (!sourceKey) return null;
  if (sourceKey.startsWith('file://')) return sourceKey;
  const map = await readImageCacheMap();
  const cached = map[sourceKey];
  if (!cached?.localUri) return null;
  try {
    const info = await FileSystem.getInfoAsync(cached.localUri);
    if (info.exists) {
      const lastTouchedAt = typeof cached.savedAt === 'number' ? cached.savedAt : 0;
      if (Date.now() - lastTouchedAt >= IMAGE_CACHE_TOUCH_INTERVAL_MS) {
        await writeImageCacheMap({
          ...map,
          [sourceKey]: {
            ...cached,
            savedAt: Date.now(),
          },
        });
      }
      return cached.localUri;
    }
  } catch {}
  const next = { ...map };
  delete next[sourceKey];
  await writeImageCacheMap(next);
  return null;
};

export const cacheOfflineImage = async (sourceKey: string, remoteUri?: string | null): Promise<string | null> => {
  if (!sourceKey || !remoteUri) return null;
  if (!remoteUri.startsWith('http')) return remoteUri;
  try {
    await ensureImageCacheDir();
    const extension = guessImageExtension(remoteUri) || guessImageExtension(sourceKey);
    const targetUri = await buildCachePath(sourceKey, extension);
    const existing = await FileSystem.getInfoAsync(targetUri);
    if (!existing.exists) {
      await FileSystem.downloadAsync(remoteUri, targetUri);
    }
    const next = await readImageCacheMap();
    next[sourceKey] = {
      localUri: targetUri,
      sourceKey,
      remoteUri,
      extension,
      savedAt: Date.now(),
    };
    await writePrunedImageCacheMap(next);
    return targetUri;
  } catch {
    return null;
  }
};

export const resolveOfflineImageUri = async (
  sourceKey: string,
  remoteUri?: string | null,
): Promise<string | null> => {
  if (!sourceKey || !remoteUri) return remoteUri ?? null;
  if (!remoteUri.startsWith('http')) return remoteUri;
  const cached = await getOfflineImageUri(sourceKey);
  if (cached) return cached;
  const downloaded = await cacheOfflineImage(sourceKey, remoteUri);
  return downloaded ?? remoteUri;
};

export const rememberOfflineImageUri = async (
  sourceKey: string,
  localUri?: string | null,
  remoteUri?: string | null,
): Promise<string | null> => {
  if (!sourceKey || !localUri) return null;
  try {
    const info = await FileSystem.getInfoAsync(localUri);
    if (!info.exists) return null;
    const next = await readImageCacheMap();
    next[sourceKey] = {
      localUri,
      sourceKey,
      remoteUri,
      extension: guessImageExtension(remoteUri) || guessImageExtension(localUri),
      savedAt: Date.now(),
    };
    await writePrunedImageCacheMap(next);
    return localUri;
  } catch {
    return null;
  }
};

export const persistOfflineImageCopy = async (
  sourceKey: string,
  localUri?: string | null,
  remoteUri?: string | null,
): Promise<string | null> => {
  if (!sourceKey || !localUri) return null;
  try {
    const info = await FileSystem.getInfoAsync(localUri);
    if (!info.exists) return null;
    await ensureImageCacheDir();
    const extension = guessImageExtension(remoteUri) || guessImageExtension(localUri);
    const targetUri = await buildCachePath(sourceKey, extension);
    if (targetUri !== localUri) {
      await FileSystem.deleteAsync(targetUri, { idempotent: true });
      await FileSystem.copyAsync({ from: localUri, to: targetUri });
    }
    const next = await readImageCacheMap();
    next[sourceKey] = {
      localUri: targetUri,
      sourceKey,
      remoteUri,
      extension,
      savedAt: Date.now(),
    };
    await writePrunedImageCacheMap(next);
    return targetUri;
  } catch {
    return null;
  }
};
