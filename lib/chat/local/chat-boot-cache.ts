import {
  deleteKey,
  getAllKeys,
  getBoolean,
  getNumber,
  getString,
  setBoolean,
  setNumber,
  setString,
} from '@/lib/storage/mmkv';

export const CHAT_BOOT_KEYS = {
  lastOpenedThreadId: 'chat.lastOpenedThreadId',
  lastThreadListPaintAt: 'chat.lastThreadListPaintAt',
  lastSuccessfulSyncAt: 'chat.lastSuccessfulSyncAt',
  lastKnownUserId: 'chat.lastKnownUserId',
  hasLocalChatData: 'chat.hasLocalChatData',
  offlineModeHint: 'chat.offlineModeHint',
  lastSyncCursorGlobal: 'chat.lastSyncCursorGlobal',
  asyncSnapshotMigratedV1: 'chat.asyncSnapshotMigrated.v1',
} as const;

const userScopedKey = (key: string, userId?: string | null) => {
  if (!userId) return key;
  return `${key}.${userId}`;
};

export const getLastOpenedThreadId = () => getString(CHAT_BOOT_KEYS.lastOpenedThreadId) ?? null;

export const setLastOpenedThreadId = (threadId: string | null) => {
  if (!threadId) {
    deleteKey(CHAT_BOOT_KEYS.lastOpenedThreadId);
    return;
  }
  setString(CHAT_BOOT_KEYS.lastOpenedThreadId, threadId);
};

export const getLastThreadListPaintAt = () => getNumber(CHAT_BOOT_KEYS.lastThreadListPaintAt) ?? null;

export const markThreadListPainted = (paintedAt = Date.now()) => {
  setNumber(CHAT_BOOT_KEYS.lastThreadListPaintAt, paintedAt);
};

export const getLastSuccessfulSyncAt = () => getNumber(CHAT_BOOT_KEYS.lastSuccessfulSyncAt) ?? null;

export const markChatSyncSucceeded = (syncedAt = Date.now()) => {
  setNumber(CHAT_BOOT_KEYS.lastSuccessfulSyncAt, syncedAt);
};

export const getLastKnownUserId = () => getString(CHAT_BOOT_KEYS.lastKnownUserId) ?? null;

export const setLastKnownUserId = (userId: string | null) => {
  if (!userId) {
    deleteKey(CHAT_BOOT_KEYS.lastKnownUserId);
    return;
  }
  setString(CHAT_BOOT_KEYS.lastKnownUserId, userId);
};

export const getHasLocalChatData = () => getBoolean(CHAT_BOOT_KEYS.hasLocalChatData) === true;

export const setHasLocalChatData = (hasLocalData: boolean) => {
  setBoolean(CHAT_BOOT_KEYS.hasLocalChatData, hasLocalData);
};

export const getOfflineModeHint = () => getBoolean(CHAT_BOOT_KEYS.offlineModeHint) === true;

export const setOfflineModeHint = (offline: boolean) => {
  setBoolean(CHAT_BOOT_KEYS.offlineModeHint, offline);
};

export const getLastSyncCursorGlobal = () => getString(CHAT_BOOT_KEYS.lastSyncCursorGlobal) ?? null;

export const setLastSyncCursorGlobal = (cursor: string | null) => {
  if (!cursor) {
    deleteKey(CHAT_BOOT_KEYS.lastSyncCursorGlobal);
    return;
  }
  setString(CHAT_BOOT_KEYS.lastSyncCursorGlobal, cursor);
};

export const getAsyncSnapshotMigratedV1 = (userId?: string | null) => {
  if (userId && getBoolean(userScopedKey(CHAT_BOOT_KEYS.asyncSnapshotMigratedV1, userId)) === true) {
    return true;
  }

  return (
    getBoolean(CHAT_BOOT_KEYS.asyncSnapshotMigratedV1) === true &&
    (!userId || getLastKnownUserId() === userId)
  );
};

export const setAsyncSnapshotMigratedV1 = (migrated: boolean, userId?: string | null) => {
  setBoolean(userScopedKey(CHAT_BOOT_KEYS.asyncSnapshotMigratedV1, userId), migrated);
};

export const clearChatBootCache = () => {
  Object.values(CHAT_BOOT_KEYS).forEach(deleteKey);
};

export const clearChatBootCacheForUser = (userId: string) => {
  Object.values(CHAT_BOOT_KEYS).forEach((key) => deleteKey(userScopedKey(key, userId)));
  clearChatBootCache();
};

export const getChatBootCacheSnapshot = (userId?: string | null) => ({
  lastOpenedThreadId: getLastOpenedThreadId(),
  lastThreadListPaintAt: getLastThreadListPaintAt(),
  lastSuccessfulSyncAt: getLastSuccessfulSyncAt(),
  lastKnownUserId: getLastKnownUserId(),
  hasLocalChatData: getHasLocalChatData(),
  offlineModeHint: getOfflineModeHint(),
  lastSyncCursorGlobal: getLastSyncCursorGlobal(),
  asyncSnapshotMigratedV1: getAsyncSnapshotMigratedV1(userId),
  scopedAsyncSnapshotKey: userScopedKey(CHAT_BOOT_KEYS.asyncSnapshotMigratedV1, userId),
  allChatKeys: getAllKeys()
    .filter((key) => key.startsWith('chat.'))
    .sort(),
});
