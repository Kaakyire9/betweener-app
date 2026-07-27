import type { MessageType } from '@/components/chat/types';

const isPersistedRemoteMessage = (message: MessageType) =>
  !message.isSystem &&
  message.type !== 'system' &&
  !String(message.id).startsWith('temp-') &&
  message.status !== 'queued' &&
  message.status !== 'sending';

export const hasIncompleteCachedAttachment = (messages: MessageType[]) =>
  messages.some((message) => {
    if (message.deletedForAll) return false;
    if (message.isViewOnce && message.encryptedMedia !== true) return true;
    if (message.type === 'image') {
      return !message.encryptedMedia && !message.storagePath && !message.imageUrl && !message.offlineImageUri;
    }
    if (message.type === 'video') {
      return !message.encryptedMedia && !message.storagePath && !message.videoUrl && !message.offlineVideoUri;
    }
    if (message.type === 'document') {
      return !message.encryptedMedia && !message.storagePath && !message.document?.url;
    }
    if (message.type === 'voice') {
      return !message.encryptedMedia && !message.storagePath && !message.voiceMessage?.audioPath;
    }
    return false;
  });

export const shouldFetchThreadIncrementally = ({
  syncCursor,
  currentMessages,
}: {
  syncCursor?: string | null;
  currentMessages: MessageType[];
}) =>
  Boolean(syncCursor) &&
  currentMessages.some(isPersistedRemoteMessage) &&
  !hasIncompleteCachedAttachment(currentMessages);

export const resolveThreadSyncCursor = ({
  storedCursor,
  syncStateTimedOut,
  currentMessages,
}: {
  storedCursor?: string | null;
  syncStateTimedOut: boolean;
  currentMessages: MessageType[];
}): string | null => {
  if (storedCursor) return storedCursor;
  if (!syncStateTimedOut || hasIncompleteCachedAttachment(currentMessages)) return null;

  const latestTimestamp = currentMessages.reduce<number | null>((latest, message) => {
    if (!isPersistedRemoteMessage(message)) return latest;
    const timestamp = message.timestamp?.getTime();
    if (!Number.isFinite(timestamp) || timestamp > Date.now() + 5 * 60 * 1000) return latest;
    return latest == null || timestamp > latest ? timestamp : latest;
  }, null);

  return latestTimestamp == null ? null : new Date(latestTimestamp).toISOString();
};

const OPTIONAL_CHAT_MEDIA_COLUMNS = ['media_items', 'media_expected_count'] as const;

export const isMissingOptionalChatMediaColumnsError = (
  error?: { code?: string | null; message?: string | null } | null,
) => {
  if (error?.code !== '42703') return false;
  const message = String(error.message ?? '').toLowerCase();
  return OPTIONAL_CHAT_MEDIA_COLUMNS.some((column) => message.includes(column));
};
