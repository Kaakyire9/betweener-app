type ChatListMessageStatus =
  | 'queued'
  | 'sending'
  | 'sent'
  | 'delivered'
  | 'read'
  | 'failed';

type MergeableChatListMessage = {
  id: string;
  timestamp: Date;
  isRead: boolean;
  deliveredAt: Date | null;
  editedAt?: Date | null;
  reactionPreview?: unknown;
  localStatus?: ChatListMessageStatus;
};

type MergeableChatListActivity = {
  kind: 'edit' | 'reaction';
  messageId: string;
  createdAt: Date;
};

const getStatusRank = (status?: ChatListMessageStatus) => {
  switch (status) {
    case 'read':
      return 6;
    case 'delivered':
      return 5;
    case 'sent':
      return 4;
    case 'sending':
      return 3;
    case 'queued':
      return 2;
    case 'failed':
      return 1;
    default:
      return 0;
  }
};

export const selectChatListLastMessage = <T extends MergeableChatListMessage>(
  remoteMessage: T,
  localMessage: T,
): T => {
  const isSameMessage =
    Boolean(localMessage.id) && localMessage.id === remoteMessage.id;

  if (!isSameMessage) {
    return localMessage.timestamp.getTime() > remoteMessage.timestamp.getTime()
      ? localMessage
      : remoteMessage;
  }

  const localStatusIsNewer =
    getStatusRank(localMessage.localStatus) >
    getStatusRank(remoteMessage.localStatus);

  return {
    ...remoteMessage,
    isRead: remoteMessage.isRead || localMessage.isRead,
    deliveredAt: remoteMessage.deliveredAt ?? localMessage.deliveredAt,
    editedAt: remoteMessage.editedAt ?? localMessage.editedAt,
    reactionPreview:
      localMessage.reactionPreview ?? remoteMessage.reactionPreview,
    localStatus: localStatusIsNewer
      ? localMessage.localStatus
      : remoteMessage.localStatus,
  };
};

export const selectLatestChatListActivity = <
  T extends MergeableChatListActivity,
>(
  lastMessage: MergeableChatListMessage,
  activities: (T | null | undefined)[],
): T | null =>
  activities
    .filter(
      (activity): activity is T =>
        Boolean(
          activity &&
            activity.createdAt.getTime() > lastMessage.timestamp.getTime() &&
            (activity.kind === 'reaction' ||
              activity.messageId === lastMessage.id),
        ),
    )
    .sort(
      (left, right) =>
        right.createdAt.getTime() - left.createdAt.getTime(),
    )[0] ?? null;
