import {
  type OfflineEnvelope as CoreOfflineEnvelope,
  peekOfflineData,
  readOfflineData,
  removeOfflineEnvelope,
  writeOfflineEnvelope,
} from "@/lib/offline/core";
import { removeCache } from "@/lib/persisted-cache";
import * as FileSystem from "expo-file-system/legacy";

export type OfflineEnvelope<T> = CoreOfflineEnvelope<T>;

const OFFLINE_VERSION = 1;
const OFFLINE_CHAT_UPLOAD_DIR = `${FileSystem.documentDirectory ?? ''}offline-chat-uploads/`;
const offlineSnapshotMemory = new Map<string, unknown>();
const offlineSnapshotListeners = new Map<string, Set<() => void>>();

const notifyOfflineSnapshotListeners = (key: string) => {
  const listeners = offlineSnapshotListeners.get(key);
  if (!listeners || listeners.size === 0) return;
  listeners.forEach((listener) => {
    try {
      listener();
    } catch {
      // Listener errors must not break cache propagation.
    }
  });
};

const cacheOfflineSnapshot = <T>(key: string, data: T) => {
  offlineSnapshotMemory.set(key, data);
  notifyOfflineSnapshotListeners(key);
};

export const buildChatConversationListStoreKey = (userId: string) =>
  `offline:chat:list:v${OFFLINE_VERSION}:${userId}`;

export const buildChatThreadStoreKey = (userId: string, peerUserId: string) =>
  `offline:chat:thread:v${OFFLINE_VERSION}:${userId}:${peerUserId}`;

export const buildChatPeerStoreKey = (userId: string, peerUserId: string) =>
  `offline:chat:peer:v${OFFLINE_VERSION}:${userId}:${peerUserId}`;

const buildLegacyChatThreadCacheKey = (userId: string, peerUserId: string) =>
  `cache:chat_thread:v1:${userId}:${peerUserId}`;

export function peekOfflineSnapshot<T>(key: string): T | null {
  return offlineSnapshotMemory.has(key) ? (offlineSnapshotMemory.get(key) as T) : null;
}

export function subscribeOfflineSnapshot(key: string, listener: () => void): () => void {
  const listeners = offlineSnapshotListeners.get(key) ?? new Set<() => void>();
  listeners.add(listener);
  offlineSnapshotListeners.set(key, listeners);

  return () => {
    const current = offlineSnapshotListeners.get(key);
    if (!current) return;
    current.delete(listener);
    if (current.size === 0) {
      offlineSnapshotListeners.delete(key);
    }
  };
}

export async function readOfflineSnapshot<T>(key: string): Promise<T | null> {
  const inMemory = peekOfflineSnapshot<T>(key);
  if (inMemory !== null) return inMemory;
  const data = await readOfflineData<T>(key);
  if (data !== null) {
    cacheOfflineSnapshot(key, data);
  }
  return data;
}

export async function writeOfflineSnapshot<T>(key: string, data: T): Promise<void> {
  cacheOfflineSnapshot(key, data);
  await writeOfflineEnvelope(key, data, { kind: 'snapshot' });
}

export async function removeOfflineSnapshot(key: string): Promise<void> {
  offlineSnapshotMemory.delete(key);
  notifyOfflineSnapshotListeners(key);
  await removeOfflineEnvelope(key);
}

export async function patchChatConversationPresenceSnapshot(
  userId: string,
  peerUserId: string,
  presence: { isOnline: boolean; lastSeen?: string | null; typingExpiresAt?: string | null },
) {
  const key = buildChatConversationListStoreKey(userId);
  const cached = await readOfflineSnapshot<any[]>(key);
  if (!Array.isArray(cached) || cached.length === 0) return;

  let changed = false;
  const next = cached.map((item) => {
    if (!item || typeof item !== 'object' || item.id !== peerUserId || !item.matchedUser) {
      return item;
    }

    const nextLastSeen =
      presence.isOnline ? item.matchedUser.lastSeen ?? new Date().toISOString() : presence.lastSeen ?? item.matchedUser.lastSeen;
    const sameOnline = Boolean(item.matchedUser.isOnline) === presence.isOnline;
    const sameLastSeen = (item.matchedUser.lastSeen ?? null) === (nextLastSeen ?? null);
    const sameTypingExpiresAt =
      (item.matchedUser.typingExpiresAt ?? null) === (presence.typingExpiresAt ?? null);
    if (sameOnline && sameLastSeen && sameTypingExpiresAt) {
      return item;
    }

    changed = true;
    return {
      ...item,
      matchedUser: {
        ...item.matchedUser,
        isOnline: presence.isOnline,
        lastSeen: nextLastSeen,
        typingExpiresAt: presence.typingExpiresAt ?? null,
      },
    };
  });

  if (!changed) return;
  await writeOfflineSnapshot(key, next);
}

export async function patchChatConversationReadSnapshot(
  userId: string,
  peerUserId: string,
  options?: { readAt?: string | null },
) {
  const key = buildChatConversationListStoreKey(userId);
  const cached = await readOfflineSnapshot<any[]>(key);
  if (!Array.isArray(cached) || cached.length === 0) return;

  let changed = false;
  const readAt = options?.readAt ?? new Date().toISOString();
  const next = cached.map((item) => {
    if (!item || typeof item !== 'object' || item.id !== peerUserId) {
      return item;
    }

    const unreadCount = Number(item.unreadCount) || 0;
    const lastMessage = item.lastMessage && typeof item.lastMessage === 'object' ? item.lastMessage : null;
    const isIncomingLastMessage = Boolean(lastMessage?.senderId) && lastMessage.senderId !== userId;
    const nextLastMessage =
      lastMessage && isIncomingLastMessage && lastMessage.isRead !== true
        ? {
            ...lastMessage,
            isRead: true,
            deliveredAt: lastMessage.deliveredAt ?? readAt,
          }
        : lastMessage;

    if (unreadCount === 0 && nextLastMessage === lastMessage) {
      return item;
    }

    changed = true;
    return {
      ...item,
      unreadCount: 0,
      lastMessage: nextLastMessage ?? item.lastMessage,
    };
  });

  if (!changed) return;
  await writeOfflineSnapshot(key, next);
}

export async function migrateLegacyChatThreadSnapshot<T>(
  userId: string,
  peerUserId: string,
): Promise<T | null> {
  const nextKey = buildChatThreadStoreKey(userId, peerUserId);
  const existing = await readOfflineSnapshot<T>(nextKey);
  if (existing) return existing;

  const legacyKey = buildLegacyChatThreadCacheKey(userId, peerUserId);
  const legacy = await peekOfflineData<T>(legacyKey);
  if (!legacy) return null;

  await writeOfflineSnapshot(nextKey, legacy);
  await removeCache(legacyKey);
  return legacy;
}

const sanitizeFileName = (fileName: string) =>
  fileName
    .replace(/[^\w.\-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 120) || `upload-${Date.now()}`;

async function ensureOfflineChatUploadDir() {
  if (!FileSystem.documentDirectory) return null;
  const info = await FileSystem.getInfoAsync(OFFLINE_CHAT_UPLOAD_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(OFFLINE_CHAT_UPLOAD_DIR, { intermediates: true });
  }
  return OFFLINE_CHAT_UPLOAD_DIR;
}

export async function stageOfflineChatUpload(sourceUri: string, fileName: string) {
  const dir = await ensureOfflineChatUploadDir();
  if (!dir) return sourceUri;
  if (sourceUri.startsWith(dir)) return sourceUri;

  const safeName = sanitizeFileName(fileName);
  const stagedUri = `${dir}${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeName}`;
  await FileSystem.copyAsync({ from: sourceUri, to: stagedUri });
  return stagedUri;
}

export async function removeStagedOfflineChatUpload(uri?: string | null) {
  if (!uri || !uri.startsWith(OFFLINE_CHAT_UPLOAD_DIR)) return;
  try {
    await FileSystem.deleteAsync(uri, { idempotent: true });
  } catch {
    // Best effort cleanup; queued sends must not fail because cleanup failed.
  }
}
