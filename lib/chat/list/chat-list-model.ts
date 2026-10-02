import type { ChatListMessageRealtimeRow } from '@/lib/chat/hooks/use-chat-list-sync';
import { resolveThreadUnreadCount } from '@/lib/chat/active-thread';
import type { ChatMessageRow, ChatThreadRow } from '@/lib/chat/local/chat-db';
import {
  selectChatListLastMessage,
  selectLatestChatListActivity,
} from '@/lib/chat/chat-list-message-merge';
import { getChatMessagePreviewText } from '@/lib/message-preview';
import type { ChatExpressionMediaKind } from '@/lib/chat/expressions/chat-gif-provider';
import { parseChatExpressionMediaKind } from '@/lib/chat/expressions/chat-expression-presentation';

export type ConversationType = {
  id: string;
  isArchived: boolean;
  peerHasLeft: boolean;
  matchedUser: {
    id: string;
    userId: string;
    profileId: string | null;
    name: string;
    avatar_url: string;
    age: number;
    isOnline: boolean;
    lastSeen: Date;
    typingExpiresAt?: Date | null;
  };
  blockStatus?: 'blocked_by_me' | 'blocked_me' | null;
  latestActivity?: {
    kind: 'edit' | 'reaction';
    messageId: string;
    preview: string;
    createdAt: Date;
  } | null;
  lastMessage: {
    id: string;
    text: string;
    timestamp: Date;
    senderId: string;
    type: 'text' | 'voice' | 'image' | 'mood_sticker' | 'video' | 'document' | 'location';
    mediaKind?: ChatExpressionMediaKind | null;
    isViewOnce?: boolean;
    isRead: boolean;
    deliveredAt: Date | null;
    editedAt?: Date | null;
    localStatus?: 'deleted' | 'queued' | 'sending' | 'sent' | 'delivered' | 'read' | 'failed';
    deletedForAll?: boolean;
    reactionPreview?: {
      emoji: string;
      userId: string;
      createdAt: Date;
      targetType?: ConversationType['lastMessage']['type'];
    };
  };
  unreadCount: number;
  isMuted: boolean;
  isPinned: boolean;
  matchedAt: Date;
};

export type MessageRow = ChatListMessageRealtimeRow;

export type NewMatch = {
  userId: string;
  profileId: string;
  name: string;
  avatar_url: string | null;
  isOnline: boolean;
  lastSeen: Date;
  age?: number | null;
  location?: string | null;
};

export type ThreadPreviewMessage = ConversationType['lastMessage'] & {
  localStatus?: 'deleted' | 'queued' | 'sending' | 'sent' | 'delivered' | 'read' | 'failed';
};

export const getListRowPreviewText = (
  row?: Pick<MessageRow, 'deleted_for_all' | 'text' | 'message_type' | 'media_kind' | 'is_view_once'> | null,
) => {
  if (!row) return '';
  if (row.deleted_for_all) return 'Message deleted';
  return (
    getChatMessagePreviewText({
      text: row.text,
      messageType: row.message_type,
      mediaKind: row.media_kind,
      isViewOnce: Boolean(row.is_view_once),
    }) || row.text || ''
  );
};

export const messageRowToLocalChatMessage = (
  ownerUserId: string,
  row: MessageRow,
): ChatMessageRow => {
  const threadId = row.sender_id === ownerUserId ? row.receiver_id : row.sender_id;
  const isMine = row.sender_id === ownerUserId;
  const status: ChatMessageRow['status'] = row.deleted_for_all
    ? 'deleted'
    : isMine
    ? row.is_read
      ? 'read'
      : row.delivered_at
      ? 'delivered'
      : 'sent'
    : row.is_read
    ? 'read'
    : 'delivered';

  return {
    id: row.id,
    local_id: row.client_message_id ?? null,
    thread_id: threadId,
    owner_user_id: ownerUserId,
    sender_user_id: row.sender_id,
    receiver_user_id: row.receiver_id,
    body: row.deleted_for_all ? 'Message deleted' : row.text ?? '',
    message_type: row.message_type === 'voice' ? 'voice' : ((row.message_type ?? 'text') as ChatMessageRow['message_type']),
    status,
    direction: isMine ? 'outgoing' : 'incoming',
    created_at: row.created_at,
    server_created_at: row.created_at,
    edited_at: row.edited_at ?? null,
    deleted_at: row.deleted_at ?? (row.deleted_for_all ? row.created_at : null),
    reply_to_message_id: null,
    is_view_once: row.is_view_once ? 1 : 0,
    local_only: 0,
    error_code: null,
    metadata_json: row.media_kind ? JSON.stringify({ mediaKind: row.media_kind }) : null,
    remote_updated_at: row.created_at,
    local_updated_at: new Date().toISOString(),
  };
};

export const rewriteReactionActivityPreview = (
  preview: string | null | undefined,
  kind: ConversationType['latestActivity'] extends infer Activity
    ? Activity extends { kind: infer Kind }
      ? Kind | null | undefined
      : null | undefined
    : null | undefined,
  peerName: string | null | undefined,
) => {
  if (!preview || kind !== 'reaction') return preview ?? '';
  if (!preview.startsWith('Someone reacted ')) return preview;
  const resolvedPeerName = peerName && peerName !== 'Unknown' ? peerName : 'Someone';
  return preview.replace('Someone reacted ', `${resolvedPeerName} reacted `);
};

export const deserializeConversations = (raw: unknown): ConversationType[] => {
  if (!Array.isArray(raw)) return [];
  return (raw as any[]).map((conversation) => {
    const matchedUser = conversation?.matchedUser || {};
    const lastMessage = conversation?.lastMessage || {};
    const reaction = lastMessage?.reactionPreview || undefined;
    return {
      ...conversation,
      isArchived: Boolean(conversation?.isArchived),
      peerHasLeft: Boolean(conversation?.peerHasLeft),
      matchedUser: {
        ...matchedUser,
        lastSeen: matchedUser?.lastSeen ? new Date(matchedUser.lastSeen) : new Date(),
        typingExpiresAt: matchedUser?.typingExpiresAt ? new Date(matchedUser.typingExpiresAt) : null,
      },
      lastMessage: {
        ...lastMessage,
        timestamp: lastMessage?.timestamp ? new Date(lastMessage.timestamp) : new Date(),
        deliveredAt: lastMessage?.deliveredAt ? new Date(lastMessage.deliveredAt) : null,
        editedAt: lastMessage?.editedAt ? new Date(lastMessage.editedAt) : null,
        reactionPreview: reaction
          ? {
              ...reaction,
              createdAt: reaction?.createdAt ? new Date(reaction.createdAt) : new Date(),
            }
          : undefined,
      },
      latestActivity: conversation?.latestActivity
        ? {
            ...conversation.latestActivity,
            preview: rewriteReactionActivityPreview(
              conversation.latestActivity?.preview,
              conversation.latestActivity?.kind,
              matchedUser?.name,
            ),
            createdAt: conversation.latestActivity?.createdAt
              ? new Date(conversation.latestActivity.createdAt)
              : new Date(),
          }
        : null,
      matchedAt: conversation?.matchedAt ? new Date(conversation.matchedAt) : new Date(),
    } as ConversationType;
  });
};

export const serializeConversations = (conversations: ConversationType[]) =>
  conversations.map((conversation) => ({
    ...conversation,
    matchedUser: {
      ...conversation.matchedUser,
      lastSeen: conversation.matchedUser.lastSeen.toISOString(),
      typingExpiresAt: conversation.matchedUser.typingExpiresAt?.toISOString() ?? null,
    },
    lastMessage: {
      ...conversation.lastMessage,
      timestamp: conversation.lastMessage.timestamp.toISOString(),
      deliveredAt: conversation.lastMessage.deliveredAt?.toISOString() ?? null,
      editedAt: conversation.lastMessage.editedAt?.toISOString() ?? null,
      reactionPreview: conversation.lastMessage.reactionPreview
        ? {
            ...conversation.lastMessage.reactionPreview,
            createdAt: conversation.lastMessage.reactionPreview.createdAt.toISOString(),
          }
        : undefined,
    },
    latestActivity: conversation.latestActivity
      ? {
          ...conversation.latestActivity,
          createdAt: conversation.latestActivity.createdAt.toISOString(),
        }
      : null,
    matchedAt: conversation.matchedAt.toISOString(),
  }));

export const coerceValidDate = (value?: string | Date | null) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
};

export const getProfileLastSeen = (profileRow: any, fallback?: Date | null) => (
  coerceValidDate(profileRow?.last_active)
  || coerceValidDate(profileRow?.updated_at)
  || coerceValidDate(fallback)
  || new Date(0)
);

export const localThreadToConversation = (row: ChatThreadRow): ConversationType => {
  const timestamp =
    coerceValidDate(row.last_message_at)
    || coerceValidDate(row.remote_updated_at)
    || coerceValidDate(row.created_at)
    || coerceValidDate(row.local_updated_at)
    || new Date();
  const rawPreview = row.last_message_status === 'deleted' ? 'Message deleted' : row.last_message_preview || '';
  const preview = /^https?:\/\//i.test(rawPreview) ? 'Photo' : rawPreview;
  const previewType: ConversationType['lastMessage']['type'] =
    preview === 'Photo' || preview === 'Queued photo' || preview === 'View once photo'
      ? 'image'
      : preview === 'Video' || preview === 'Queued video' || preview === 'View once video'
      ? 'video'
      : preview === 'Voice message' || preview === 'Queued voice message'
      ? 'voice'
      : preview === 'Document' || preview === 'Queued document'
      ? 'document'
      : preview === 'Location'
      ? 'location'
      : 'text';
  const localStatus: ThreadPreviewMessage['localStatus'] =
    row.last_message_status === 'deleted'
      ? 'deleted'
      : row.last_message_status === 'pending'
      ? 'queued'
      : row.last_message_status === 'sending'
        || row.last_message_status === 'sent'
        || row.last_message_status === 'delivered'
        || row.last_message_status === 'read'
        || row.last_message_status === 'failed'
      ? row.last_message_status
      : undefined;
  const reactionPreview = row.last_message_reaction_emoji && row.last_message_reaction_user_id
    ? {
        emoji: row.last_message_reaction_emoji,
        userId: row.last_message_reaction_user_id,
        createdAt: coerceValidDate(row.last_message_reaction_created_at) || timestamp,
        targetType: (row.last_message_reaction_target_type as ConversationType['lastMessage']['type'] | null) ?? undefined,
      }
    : undefined;

  return {
    id: row.id,
    isArchived: row.is_archived === 1,
    peerHasLeft: false,
    matchedUser: {
      id: row.peer_user_id || row.id,
      userId: row.peer_user_id || row.id,
      profileId: row.peer_profile_id,
      name: row.peer_name || 'Unknown',
      avatar_url: row.peer_avatar_url || '',
      age: 0,
      isOnline: row.peer_presence_status === 'online',
      lastSeen: coerceValidDate(row.peer_last_active) || new Date(0),
      typingExpiresAt: null,
    },
    blockStatus: null,
    latestActivity: row.last_activity_kind
      && row.last_activity_message_id
      && row.last_activity_preview
      && row.last_activity_at
      ? {
          kind: row.last_activity_kind,
          messageId: row.last_activity_message_id,
          preview: rewriteReactionActivityPreview(row.last_activity_preview, row.last_activity_kind, row.peer_name),
          createdAt: coerceValidDate(row.last_activity_at) || timestamp,
        }
      : null,
    lastMessage: {
      id: row.last_message_id || '',
      text: preview,
      timestamp,
      senderId: row.last_message_sender_id || '',
      type: previewType,
      mediaKind: parseChatExpressionMediaKind(row.last_message_media_kind),
      isViewOnce: preview === 'View once photo' || preview === 'View once video',
      isRead: row.last_message_status === 'read'
        || (row.last_message_sender_id !== row.owner_user_id && row.unread_count === 0),
      deliveredAt: row.last_message_status === 'delivered' || row.last_message_status === 'read' ? timestamp : null,
      editedAt: coerceValidDate(row.last_message_edited_at),
      localStatus,
      deletedForAll: row.last_message_status === 'deleted',
      reactionPreview,
    },
    unreadCount: resolveThreadUnreadCount(
      row.owner_user_id,
      row.peer_user_id,
      row.unread_count,
      timestamp,
    ),
    isMuted: row.is_muted === 1,
    isPinned: row.is_pinned === 1,
    matchedAt: coerceValidDate(row.created_at) || timestamp,
  };
};

export const conversationToLocalThread = (
  ownerUserId: string,
  conversation: ConversationType,
): ChatThreadRow => {
  const localUpdatedAt = new Date().toISOString();
  const lastMessageAt = conversation.lastMessage.timestamp instanceof Date
    ? conversation.lastMessage.timestamp.toISOString()
    : localUpdatedAt;
  const lastMessagePreview = conversation.lastMessage.deletedForAll
    ? 'Message deleted'
    : conversation.lastMessage.isViewOnce && conversation.lastMessage.type === 'image'
    ? 'View once photo'
    : conversation.lastMessage.isViewOnce && conversation.lastMessage.type === 'video'
    ? 'View once video'
    : conversation.lastMessage.type === 'image'
    ? getChatMessagePreviewText({
        text: conversation.lastMessage.text,
        messageType: 'image',
        mediaKind: conversation.lastMessage.mediaKind,
      })
    : conversation.lastMessage.type === 'video'
    ? 'Video'
    : conversation.lastMessage.type === 'voice'
    ? 'Voice message'
    : conversation.lastMessage.type === 'document'
    ? 'Document'
    : conversation.lastMessage.type === 'location'
    ? 'Location'
    : conversation.lastMessage.text || '';
  const localStatus = (conversation.lastMessage as ThreadPreviewMessage).localStatus;
  const reactionPreview = conversation.lastMessage.reactionPreview;
  const lastMessageStatus: ChatThreadRow['last_message_status'] =
    conversation.lastMessage.deletedForAll || localStatus === 'deleted'
      ? 'deleted'
      : localStatus === 'queued'
      ? 'pending'
      : localStatus ?? (conversation.lastMessage.isRead
        ? 'read'
        : conversation.lastMessage.deliveredAt
        ? 'delivered'
        : 'sent');

  return {
    id: conversation.id,
    owner_user_id: ownerUserId,
    peer_user_id: conversation.matchedUser.userId || conversation.id,
    peer_profile_id: conversation.matchedUser.profileId ?? null,
    peer_name: conversation.matchedUser.name || null,
    peer_avatar_url: conversation.matchedUser.avatar_url || null,
    peer_verified: 0,
    peer_presence_status: conversation.matchedUser.isOnline ? 'online' : null,
    peer_last_active: conversation.matchedUser.lastSeen instanceof Date
      ? conversation.matchedUser.lastSeen.toISOString()
      : null,
    title: null,
    thread_type: 'direct',
    last_message_id: conversation.lastMessage.id || null,
    last_message_preview: lastMessagePreview,
    last_message_sender_id: conversation.lastMessage.senderId || null,
    last_message_status: lastMessageStatus,
    last_message_media_kind: parseChatExpressionMediaKind(conversation.lastMessage.mediaKind),
    last_message_edited_at: conversation.lastMessage.editedAt instanceof Date
      ? conversation.lastMessage.editedAt.toISOString()
      : null,
    last_message_reaction_emoji: reactionPreview?.emoji ?? null,
    last_message_reaction_user_id: reactionPreview?.userId ?? null,
    last_message_reaction_created_at: reactionPreview?.createdAt instanceof Date
      ? reactionPreview.createdAt.toISOString()
      : null,
    last_message_reaction_target_type: reactionPreview?.targetType ?? null,
    last_activity_kind: conversation.latestActivity?.kind ?? null,
    last_activity_message_id: conversation.latestActivity?.messageId ?? null,
    last_activity_preview: conversation.latestActivity?.preview ?? null,
    last_activity_at: conversation.latestActivity?.createdAt instanceof Date
      ? conversation.latestActivity.createdAt.toISOString()
      : null,
    last_message_at: lastMessageAt,
    unread_count: conversation.unreadCount,
    is_muted: conversation.isMuted ? 1 : 0,
    is_pinned: conversation.isPinned ? 1 : 0,
    is_archived: conversation.isArchived ? 1 : 0,
    local_status: 'active',
    remote_updated_at: lastMessageAt,
    local_updated_at: localUpdatedAt,
    created_at: conversation.matchedAt instanceof Date ? conversation.matchedAt.toISOString() : lastMessageAt,
  };
};

const getConversationLocalMergeKey = (conversation: ConversationType) => [
  conversation.id,
  conversation.isArchived ? 'archived' : 'active',
  conversation.isMuted ? 'muted' : 'unmuted',
  conversation.isPinned ? 'pinned' : 'unpinned',
  conversation.unreadCount,
  conversation.lastMessage.id,
  conversation.lastMessage.text,
  conversation.lastMessage.senderId,
  conversation.lastMessage.timestamp.getTime(),
  conversation.lastMessage.type,
  conversation.lastMessage.isRead ? 'read' : 'unread',
  conversation.lastMessage.deliveredAt?.getTime() ?? 0,
  conversation.lastMessage.editedAt?.getTime() ?? 0,
  conversation.lastMessage.deletedForAll ? 'deleted' : 'active',
  conversation.lastMessage.reactionPreview?.emoji ?? '',
  conversation.lastMessage.reactionPreview?.userId ?? '',
  conversation.lastMessage.reactionPreview?.createdAt.getTime() ?? 0,
  conversation.lastMessage.reactionPreview?.targetType ?? '',
  conversation.latestActivity?.kind ?? '',
  conversation.latestActivity?.messageId ?? '',
  conversation.latestActivity?.preview ?? '',
  conversation.latestActivity?.createdAt.getTime() ?? 0,
  (conversation.lastMessage as ThreadPreviewMessage).localStatus ?? 'server',
  conversation.matchedUser.isOnline ? 'online' : 'offline',
  conversation.matchedUser.lastSeen.getTime(),
].join(':');

export const mergeLocalThreadsIntoConversations = (
  current: ConversationType[],
  localThreads: ChatThreadRow[],
): ConversationType[] => {
  if (localThreads.length === 0) return current;

  const mergedById = new Map(current.map((conversation) => [conversation.id, conversation] as const));
  localThreads.forEach((thread) => {
    const localConversation = localThreadToConversation(thread);
    const existing = mergedById.get(thread.id);
    if (!existing) {
      mergedById.set(thread.id, localConversation);
      return;
    }

    const hasUsefulLocalIdentity = localConversation.matchedUser.name !== 'Unknown'
      || Boolean(localConversation.matchedUser.avatar_url);
    const resolvedLastMessage = selectChatListLastMessage(existing.lastMessage, localConversation.lastMessage);
    const resolvedLatestActivity = selectLatestChatListActivity(
      resolvedLastMessage,
      [localConversation.latestActivity, existing.latestActivity],
    );

    mergedById.set(thread.id, {
      ...existing,
      isArchived: localConversation.isArchived,
      isMuted: localConversation.isMuted,
      isPinned: localConversation.isPinned,
      unreadCount: resolveThreadUnreadCount(
        thread.owner_user_id,
        thread.peer_user_id,
        localConversation.unreadCount,
        resolvedLastMessage.timestamp,
      ),
      latestActivity: resolvedLatestActivity,
      matchedAt: existing.matchedAt ?? localConversation.matchedAt,
      matchedUser: hasUsefulLocalIdentity
        ? {
            ...existing.matchedUser,
            name: localConversation.matchedUser.name !== 'Unknown'
              ? localConversation.matchedUser.name
              : existing.matchedUser.name,
            avatar_url: localConversation.matchedUser.avatar_url || existing.matchedUser.avatar_url,
            profileId: localConversation.matchedUser.profileId ?? existing.matchedUser.profileId,
            userId: localConversation.matchedUser.userId || existing.matchedUser.userId,
            isOnline: localConversation.matchedUser.isOnline,
            lastSeen: localConversation.matchedUser.lastSeen,
          }
        : existing.matchedUser,
      lastMessage: resolvedLastMessage,
    });
  });

  const next = Array.from(mergedById.values()).sort((left, right) => {
    if (left.isPinned !== right.isPinned) return left.isPinned ? -1 : 1;
    const leftActivityAt = Math.max(
      left.lastMessage.timestamp.getTime(),
      left.latestActivity?.createdAt.getTime() ?? 0,
    );
    const rightActivityAt = Math.max(
      right.lastMessage.timestamp.getTime(),
      right.latestActivity?.createdAt.getTime() ?? 0,
    );
    return rightActivityAt - leftActivityAt;
  });

  return current.map(getConversationLocalMergeKey).join('|') === next.map(getConversationLocalMergeKey).join('|')
    ? current
    : next;
};

export const areNewMatchesEqual = (left: NewMatch[], right: NewMatch[]) => {
  if (left.length !== right.length) return false;
  return left.every((item, index) => {
    const other = right[index];
    return Boolean(other
      && item.userId === other.userId
      && item.profileId === other.profileId
      && item.name === other.name
      && item.avatar_url === other.avatar_url
      && item.isOnline === other.isOnline
      && item.lastSeen.getTime() === other.lastSeen.getTime()
      && item.age === other.age
      && item.location === other.location);
  });
};
