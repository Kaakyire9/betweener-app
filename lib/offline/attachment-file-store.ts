import * as Crypto from 'expo-crypto';
import * as FileSystem from 'expo-file-system/legacy';

import { readOfflineData, writeOfflineEnvelope } from '@/lib/offline/core';
import { getOfflineCacheOwnerId, scopeOfflineCacheKey } from '@/lib/offline/cache-scope';

const ATTACHMENT_CACHE_KEY = 'offline:attachment-file-store:v1';
const ATTACHMENT_CACHE_DIR =
  `${FileSystem.cacheDirectory ?? ''}offline-attachments/`;
const ATTACHMENT_CACHE_MAX_BYTES = 220 * 1024 * 1024;
const ATTACHMENT_CACHE_MAX_ENTRIES = 150;

export type OfflineAttachmentCategory = 'audio' | 'document';

type AttachmentCacheEntry = {
  localUri: string;
  sourceKey: string;
  category: OfflineAttachmentCategory;
  savedAt: number;
  lastAccessedAt: number;
  byteSize: number;
};

type AttachmentCacheMap = Record<string, AttachmentCacheEntry>;

const downloads = new Map<string, Promise<string | null>>();
let manifestMutation: Promise<void> = Promise.resolve();

const queueManifestMutation = <T>(operation: () => Promise<T>): Promise<T> => {
  const queued = manifestMutation.then(operation, operation);
  manifestMutation = queued.then(
    () => undefined,
    () => undefined,
  );
  return queued;
};

const readManifest = async (): Promise<AttachmentCacheMap> => {
  try {
    const raw = await readOfflineData<unknown>(ATTACHMENT_CACHE_KEY);
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
    return raw as AttachmentCacheMap;
  } catch {
    return {};
  }
};

const writeManifest = async (entries: AttachmentCacheMap) => {
  await writeOfflineEnvelope(ATTACHMENT_CACHE_KEY, entries, {
    kind: 'attachment-file-manifest',
  });
};

const ensureCacheDirectory = async () => {
  const info = await FileSystem.getInfoAsync(ATTACHMENT_CACHE_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(ATTACHMENT_CACHE_DIR, { intermediates: true });
  }
};

const safeExtension = (value?: string | null) => {
  const clean = String(value ?? '').split('?')[0].split('#')[0];
  const extension = clean.split('.').pop()?.toLowerCase() ?? '';
  return /^[a-z0-9]{2,8}$/.test(extension) ? extension : 'bin';
};

const buildLocalPath = async (sourceKey: string, extension: string) => {
  const hash = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    sourceKey,
  );
  return `${ATTACHMENT_CACHE_DIR}${hash}.${extension}`;
};

const pruneManifest = async (entries: AttachmentCacheMap) => {
  const existing: AttachmentCacheEntry[] = [];
  for (const entry of Object.values(entries)) {
    const info = await FileSystem.getInfoAsync(entry.localUri);
    if (!info.exists) continue;
    existing.push({
      ...entry,
      byteSize: 'size' in info && typeof info.size === 'number'
        ? info.size
        : Math.max(0, entry.byteSize),
    });
  }

  existing.sort((a, b) => b.lastAccessedAt - a.lastAccessedAt);
  const retained: AttachmentCacheMap = {};
  let retainedBytes = 0;
  for (const entry of existing) {
    const canRetain =
      Object.keys(retained).length < ATTACHMENT_CACHE_MAX_ENTRIES &&
      retainedBytes + entry.byteSize <= ATTACHMENT_CACHE_MAX_BYTES;
    if (canRetain) {
      retained[entry.sourceKey] = entry;
      retainedBytes += entry.byteSize;
    } else {
      await FileSystem.deleteAsync(entry.localUri, { idempotent: true }).catch(() => undefined);
    }
  }
  return retained;
};

export const findOfflineAttachment = async (sourceKey: string) => {
  if (!sourceKey.trim()) return null;
  sourceKey = await scopeOfflineCacheKey(sourceKey);
  return queueManifestMutation(async () => {
    const entries = await readManifest();
    const entry = entries[sourceKey];
    if (!entry) return null;
    const info = await FileSystem.getInfoAsync(entry.localUri);
    if (!info.exists) {
      delete entries[sourceKey];
      await writeManifest(entries);
      return null;
    }
    const now = Date.now();
    if (now - entry.lastAccessedAt > 60 * 60 * 1000) {
      entries[sourceKey] = { ...entry, lastAccessedAt: now };
      await writeManifest(entries);
    }
    return entry.localUri;
  });
};

export const cacheOfflineAttachment = async ({
  sourceKey,
  remoteUri,
  category,
  fileName,
}: {
  sourceKey: string;
  remoteUri: string;
  category: OfflineAttachmentCategory;
  fileName?: string | null;
}): Promise<string | null> => {
  sourceKey = await scopeOfflineCacheKey(sourceKey);
  const existing = await findOfflineAttachment(sourceKey);
  if (existing) return existing;
  const active = downloads.get(sourceKey);
  if (active) return active;

  const operation = (async () => {
    await ensureCacheDirectory();
    const localUri = await buildLocalPath(sourceKey, safeExtension(fileName || remoteUri));
    try {
      await FileSystem.downloadAsync(remoteUri, localUri);
      const info = await FileSystem.getInfoAsync(localUri);
      if (!info.exists) return null;
      const now = Date.now();
      await queueManifestMutation(async () => {
        const entries = await readManifest();
        entries[sourceKey] = {
          localUri,
          sourceKey,
          category,
          savedAt: now,
          lastAccessedAt: now,
          byteSize: 'size' in info && typeof info.size === 'number' ? info.size : 0,
        };
        await writeManifest(await pruneManifest(entries));
      });
      return localUri;
    } catch {
      await FileSystem.deleteAsync(localUri, { idempotent: true }).catch(() => undefined);
      return null;
    } finally {
      downloads.delete(sourceKey);
    }
  })();

  downloads.set(sourceKey, operation);
  return operation;
};

export const persistOfflineAttachmentCopy = async ({
  sourceKey,
  localUri,
  category,
  fileName,
}: {
  sourceKey: string;
  localUri: string;
  category: OfflineAttachmentCategory;
  fileName?: string | null;
}): Promise<string | null> => {
  sourceKey = await scopeOfflineCacheKey(sourceKey);
  const existing = await findOfflineAttachment(sourceKey);
  if (existing) return existing;
  const active = downloads.get(sourceKey);
  if (active) return active;

  const operation = (async () => {
    await ensureCacheDirectory();
    const cachedUri = await buildLocalPath(sourceKey, safeExtension(fileName || localUri));
    try {
      const sourceInfo = await FileSystem.getInfoAsync(localUri);
      if (!sourceInfo.exists) return null;
      if (localUri !== cachedUri) {
        await FileSystem.deleteAsync(cachedUri, { idempotent: true }).catch(() => undefined);
        await FileSystem.copyAsync({ from: localUri, to: cachedUri });
      }
      const cachedInfo = await FileSystem.getInfoAsync(cachedUri);
      if (!cachedInfo.exists) return null;
      const now = Date.now();
      await queueManifestMutation(async () => {
        const entries = await readManifest();
        entries[sourceKey] = {
          localUri: cachedUri,
          sourceKey,
          category,
          savedAt: now,
          lastAccessedAt: now,
          byteSize:
            'size' in cachedInfo && typeof cachedInfo.size === 'number'
              ? cachedInfo.size
              : 0,
        };
        await writeManifest(await pruneManifest(entries));
      });
      return cachedUri;
    } catch {
      await FileSystem.deleteAsync(cachedUri, { idempotent: true }).catch(() => undefined);
      return null;
    } finally {
      downloads.delete(sourceKey);
    }
  })();

  downloads.set(sourceKey, operation);
  return operation;
};

export const getOfflineAttachmentUsage = async () => {
  const entries = await readManifest();
  const ownerPrefix = `owner/${await getOfflineCacheOwnerId()}/`;
  return Object.values(entries).filter((entry) => entry.sourceKey.startsWith(ownerPrefix)).reduce(
    (summary, entry) => ({
      bytes: summary.bytes + Math.max(0, entry.byteSize),
      entries: summary.entries + 1,
      audioEntries: summary.audioEntries + (entry.category === 'audio' ? 1 : 0),
      documentEntries: summary.documentEntries + (entry.category === 'document' ? 1 : 0),
    }),
    { bytes: 0, entries: 0, audioEntries: 0, documentEntries: 0 },
  );
};

export const clearOfflineAttachments = async (category?: OfflineAttachmentCategory) => {
  const ownerPrefix = `owner/${await getOfflineCacheOwnerId()}/`;
  await queueManifestMutation(async () => {
    const entries = await readManifest();
    const retained: AttachmentCacheMap = {};
    await Promise.all(
      Object.values(entries).map(async (entry) => {
        if (!entry.sourceKey.startsWith(ownerPrefix) || (category && entry.category !== category)) {
          retained[entry.sourceKey] = entry;
          return;
        }
        await FileSystem.deleteAsync(entry.localUri, { idempotent: true }).catch(() => undefined);
      }),
    );
    await writeManifest(retained);
  });
};

export const clearOfflineAttachmentsForOwner = async (ownerUserId: string) => {
  if (!ownerUserId) return;
  const ownerPrefix = `owner/${ownerUserId}/`;
  await queueManifestMutation(async () => {
    const entries = await readManifest();
    const retained: AttachmentCacheMap = {};
    await Promise.all(Object.values(entries).map(async (entry) => {
      if (!entry.sourceKey.startsWith(ownerPrefix)) {
        retained[entry.sourceKey] = entry;
        return;
      }
      downloads.delete(entry.sourceKey);
      await FileSystem.deleteAsync(entry.localUri, { idempotent: true }).catch(() => undefined);
    }));
    await writeManifest(retained);
  });
};
