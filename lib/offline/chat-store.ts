import {
  type OfflineEnvelope as CoreOfflineEnvelope,
  peekOfflineData,
  readOfflineData,
  removeOfflineEnvelope,
  writeOfflineEnvelope,
} from "@/lib/offline/core";
import { removeCache } from "@/lib/persisted-cache";

export type OfflineEnvelope<T> = CoreOfflineEnvelope<T>;

const OFFLINE_VERSION = 1;

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
