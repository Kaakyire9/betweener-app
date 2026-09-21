import type { MessageType } from '@/components/chat/types';

const PENDING_LOCAL_MESSAGE_STATUSES: ReadonlySet<NonNullable<MessageType['status']>> = new Set([
  'sending',
  'queued',
  'failed',
]);

export const mergeOfflineMediaIntoMessage = (
  nextMessage: MessageType,
  previous?: MessageType | null,
): MessageType => {
  if (!previous) return nextMessage;
  if (nextMessage.type === 'image' && (nextMessage.mediaItems?.length || previous.mediaItems?.length)) {
    const previousByAttachment = new Map(
      (previous.mediaItems ?? []).map((mediaItem) => [mediaItem.attachmentId, mediaItem]),
    );
    const nextItems = (nextMessage.mediaItems ?? previous.mediaItems ?? []).map((mediaItem) => {
      const previousItem = previousByAttachment.get(mediaItem.attachmentId);
      return {
        ...mediaItem,
        localUri: mediaItem.localUri ?? previousItem?.localUri,
        signedUrl: mediaItem.signedUrl ?? previousItem?.signedUrl,
      };
    });
    return {
      ...nextMessage,
      mediaItems: nextItems,
      offlineImageUri: nextMessage.offlineImageUri ?? previous.offlineImageUri ?? nextItems[0]?.localUri,
    };
  }
  if (nextMessage.type === 'image' && !nextMessage.offlineImageUri && previous.offlineImageUri) {
    return { ...nextMessage, offlineImageUri: previous.offlineImageUri };
  }
  if (nextMessage.type === 'video' && !nextMessage.offlineVideoUri && previous.offlineVideoUri) {
    return { ...nextMessage, offlineVideoUri: previous.offlineVideoUri };
  }
  return nextMessage;
};

const hasLikelyServerMatch = (
  localMessage: MessageType,
  serverMessages: MessageType[],
  currentUserId: string,
) => {
  if (localMessage.senderId !== currentUserId) return false;
  if (localMessage.clientMessageId) {
    return serverMessages.some(
      (serverMessage) => serverMessage.senderId === currentUserId
        && serverMessage.clientMessageId === localMessage.clientMessageId,
    );
  }
  const localTimestamp = localMessage.timestamp.getTime();
  return serverMessages.some((serverMessage) => {
    if (serverMessage.senderId !== currentUserId) return false;
    if (serverMessage.type !== localMessage.type) return false;
    if ((serverMessage.replyToId ?? null) !== (localMessage.replyToId ?? null)) return false;
    if (Math.abs(serverMessage.timestamp.getTime() - localTimestamp) > 120000) return false;

    switch (localMessage.type) {
      case 'voice':
        return true;
      case 'image':
        return Boolean(localMessage.imageUrl) ? localMessage.imageUrl === serverMessage.imageUrl : true;
      case 'video':
        return Boolean(localMessage.videoUrl) ? localMessage.videoUrl === serverMessage.videoUrl : true;
      case 'document':
        return localMessage.document?.name
          ? localMessage.document.name === serverMessage.document?.name
          : localMessage.text === serverMessage.text;
      case 'location':
      case 'date_plan':
      case 'mood_sticker':
      case 'text':
        return localMessage.text === serverMessage.text;
      case 'system':
        return false;
      default:
        return localMessage.text === serverMessage.text;
    }
  });
};

type PendingMergeDebugPayload = {
  preservedPendingCount: number;
  droppedPendingCount: number;
  preservedPendingIds: string[];
  droppedPendingIds: string[];
  preservedPendingTypes: string[];
  droppedPendingTypes: string[];
};

export const mergeFetchedMessagesWithLocalPending = ({
  fetchedMessages,
  previousMessages,
  currentUserId,
  debug,
}: {
  fetchedMessages: MessageType[];
  previousMessages: MessageType[];
  currentUserId: string;
  debug?: (payload: PendingMergeDebugPayload) => void;
}) => {
  const fetchedIds = new Set(fetchedMessages.map((message) => message.id));
  const preservedPending: MessageType[] = [];
  const droppedPending: MessageType[] = [];
  const pendingLocals = previousMessages.filter((message) => {
    if (fetchedIds.has(message.id)) return false;
    if (!message.status || !PENDING_LOCAL_MESSAGE_STATUSES.has(message.status)) return false;
    if (message.senderId !== currentUserId) return false;
    if (message.type === 'system' || message.isSystem) return false;
    const shouldKeep = !message.id.startsWith('temp-')
      ? message.status === 'failed'
      : !hasLikelyServerMatch(message, fetchedMessages, currentUserId);
    if (shouldKeep) preservedPending.push(message);
    else droppedPending.push(message);
    return shouldKeep;
  });

  if (debug && (preservedPending.length > 0 || droppedPending.length > 0)) {
    debug({
      preservedPendingCount: preservedPending.length,
      droppedPendingCount: droppedPending.length,
      preservedPendingIds: preservedPending.map((message) => message.id),
      droppedPendingIds: droppedPending.map((message) => message.id),
      preservedPendingTypes: preservedPending.map((message) => `${message.type}:${message.status ?? 'none'}`),
      droppedPendingTypes: droppedPending.map((message) => `${message.type}:${message.status ?? 'none'}`),
    });
  }

  if (pendingLocals.length === 0) return fetchedMessages;
  return [...fetchedMessages, ...pendingLocals].sort(
    (left, right) => left.timestamp.getTime() - right.timestamp.getTime(),
  );
};
