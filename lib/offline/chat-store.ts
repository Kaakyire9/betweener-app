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

export const buildChatConversationListStoreKey = (userId: string) =>
  `offline:chat:list:v${OFFLINE_VERSION}:${userId}`;

export const buildChatThreadStoreKey = (userId: string, peerUserId: string) =>
  `offline:chat:thread:v${OFFLINE_VERSION}:${userId}:${peerUserId}`;

export const buildChatPeerStoreKey = (userId: string, peerUserId: string) =>
  `offline:chat:peer:v${OFFLINE_VERSION}:${userId}:${peerUserId}`;

const buildLegacyChatThreadCacheKey = (userId: string, peerUserId: string) =>
  `cache:chat_thread:v1:${userId}:${peerUserId}`;

export async function readOfflineSnapshot<T>(key: string): Promise<T | null> {
  return readOfflineData<T>(key);
}

export async function writeOfflineSnapshot<T>(key: string, data: T): Promise<void> {
  await writeOfflineEnvelope(key, data, { kind: 'snapshot' });
}

export async function removeOfflineSnapshot(key: string): Promise<void> {
  await removeOfflineEnvelope(key);
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
