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
