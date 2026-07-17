import { ChatRepository } from '@/lib/chat/local/chat-repository';
import type { ChatMessageRow, ChatMessageStatus, ChatMessageType, ChatThreadRow } from '@/lib/chat/local/chat-schema';
import {
  getAsyncSnapshotMigratedV1,
  setAsyncSnapshotMigratedV1,
  setHasLocalChatData,
  setLastKnownUserId,
} from '@/lib/chat/local/chat-boot-cache';
import {
  buildChatConversationListStoreKey,
  buildChatThreadStoreKey,
  readOfflineSnapshot,
} from '@/lib/offline/chat-store';
import { getChatMessagePreviewText } from '@/lib/message-preview';
import { captureException, captureMessage } from '@/lib/telemetry/sentry';

const toIso = (value: unknown, fallback = new Date().toISOString()) => {
  if (value instanceof Date && Number.isFinite(value.getTime())) return value.toISOString();
  if (typeof value === 'string') {
    const date = new Date(value);
    if (Number.isFinite(date.getTime())) return date.toISOString();
  }
  return fallback;
};

const toInt = (value: unknown) => (value ? 1 : 0);

const normalizeMessageType = (value: unknown): ChatMessageType => {
  switch (value) {
    case 'image':
    case 'video':
    case 'audio':
    case 'voice':
    case 'document':
    case 'location':
    case 'date_plan':
    case 'mood_sticker':
    case 'system':
      return value;
    default:
      return 'text';
  }
};

const normalizeMessageStatus = (value: unknown): ChatMessageStatus => {
  switch (value) {
    case 'sending':
    case 'sent':
    case 'delivered':
    case 'read':
    case 'failed':
    case 'deleted':
      return value;
    case 'queued':
    case 'pending':
      return 'pending';
    default:
      return 'sent';
  }
};

const safeJson = (value: unknown) => {
  try {
    return JSON.stringify(value ?? null);
  } catch {
    return null;
  }
};

const getMessagePreview = (message: any) => {
  if (!message) return '';
  return (
    getChatMessagePreviewText({
      text: typeof message.text === 'string' ? message.text : null,
      messageType: typeof message.type === 'string' ? message.type : 'text',
      isViewOnce: Boolean(message.isViewOnce),
      status: typeof message.status === 'string' ? message.status : null,
    }) || ''
  );
};

const cachedConversationToThread = (ownerUserId: string, cached: any): ChatThreadRow | null => {
  if (!cached?.id) return null;
  const lastMessage = cached.lastMessage ?? {};
  const matchedUser = cached.matchedUser ?? {};
  const localUpdatedAt = new Date().toISOString();
  return {
    id: String(cached.id),
    owner_user_id: ownerUserId,
    peer_user_id: String(matchedUser.userId || cached.id),
    peer_profile_id: matchedUser.profileId ? String(matchedUser.profileId) : null,
    peer_name: typeof matchedUser.name === 'string' ? matchedUser.name : null,
    peer_avatar_url: typeof matchedUser.avatar_url === 'string' ? matchedUser.avatar_url : null,
    peer_verified: 0,
    peer_presence_status: matchedUser.isOnline ? 'online' : null,
    peer_last_active: matchedUser.lastSeen ? toIso(matchedUser.lastSeen, localUpdatedAt) : null,
    title: null,
    thread_type: 'direct',
    last_message_id: lastMessage.id ? String(lastMessage.id) : null,
    last_message_preview: getMessagePreview(lastMessage),
    last_message_sender_id: lastMessage.senderId ? String(lastMessage.senderId) : null,
    last_message_status: lastMessage.id ? normalizeMessageStatus(lastMessage.status) : null,
    last_message_edited_at: lastMessage.editedAt ? toIso(lastMessage.editedAt) : null,
    last_message_reaction_emoji:
      typeof lastMessage.reactionPreview?.emoji === 'string' ? lastMessage.reactionPreview.emoji : null,
    last_message_reaction_user_id:
      typeof lastMessage.reactionPreview?.userId === 'string' ? lastMessage.reactionPreview.userId : null,
    last_message_reaction_created_at: lastMessage.reactionPreview?.createdAt
      ? toIso(lastMessage.reactionPreview.createdAt)
      : null,
    last_message_reaction_target_type:
      typeof lastMessage.reactionPreview?.targetType === 'string'
        ? normalizeMessageType(lastMessage.reactionPreview.targetType)
        : null,
    last_activity_kind: null,
    last_activity_message_id: null,
    last_activity_preview: null,
    last_activity_at: null,
    last_message_at: lastMessage.timestamp ? toIso(lastMessage.timestamp, localUpdatedAt) : null,
    unread_count: Number(cached.unreadCount) || 0,
    is_muted: toInt(cached.isMuted),
    is_pinned: toInt(cached.isPinned),
    is_archived: toInt(cached.isArchived),
    local_status: 'active',
    remote_updated_at: lastMessage.timestamp ? toIso(lastMessage.timestamp, localUpdatedAt) : null,
    local_updated_at: localUpdatedAt,
    created_at: cached.matchedAt ? toIso(cached.matchedAt, localUpdatedAt) : null,
  };
};

const cachedMessageToRow = (
  ownerUserId: string,
  threadId: string,
  message: any,
): ChatMessageRow | null => {
  if (!message?.id || !message?.senderId) return null;
  const createdAt = toIso(message.timestamp);
  const status = normalizeMessageStatus(message.status);
  return {
    id: String(message.id),
    local_id: String(message.id).startsWith('temp-') ? String(message.id) : null,
    thread_id: threadId,
    owner_user_id: ownerUserId,
    sender_user_id: String(message.senderId),
    receiver_user_id: String(message.senderId) === ownerUserId ? threadId : ownerUserId,
    body: typeof message.text === 'string' ? message.text : null,
    message_type: normalizeMessageType(message.type),
    status,
    direction: String(message.senderId) === ownerUserId ? 'outgoing' : 'incoming',
    created_at: createdAt,
    server_created_at: String(message.id).startsWith('temp-') ? null : createdAt,
    edited_at: message.editedAt ? toIso(message.editedAt) : null,
    deleted_at: message.deletedAt ? toIso(message.deletedAt) : null,
    reply_to_message_id: message.replyToId ? String(message.replyToId) : null,
    is_view_once: toInt(message.isViewOnce),
    local_only: status === 'pending' || status === 'sending' || status === 'failed' ? 1 : 0,
    error_code: status === 'failed' ? 'offline_send_failed' : null,
    metadata_json: safeJson(message),
    remote_updated_at: String(message.id).startsWith('temp-') ? null : createdAt,
    local_updated_at: new Date().toISOString(),
  };
};

export async function migrateAsyncChatSnapshotsToSQLite(ownerUserId: string): Promise<{
  migrated: boolean;
  threadCount: number;
  messageCount: number;
}> {
  if (!ownerUserId) return { migrated: false, threadCount: 0, messageCount: 0 };
  if (getAsyncSnapshotMigratedV1(ownerUserId)) {
    return { migrated: false, threadCount: 0, messageCount: 0 };
  }

  captureMessage('chat_async_snapshot_migration_started', { ownerUserId });
  try {
    await ChatRepository.init();
    const listKey = buildChatConversationListStoreKey(ownerUserId);
    const cachedThreads = await readOfflineSnapshot<any[]>(listKey);
    if (!Array.isArray(cachedThreads) || cachedThreads.length === 0) {
      setLastKnownUserId(ownerUserId);
      setAsyncSnapshotMigratedV1(true, ownerUserId);
      return { migrated: false, threadCount: 0, messageCount: 0 };
    }

    const threadRows = cachedThreads
      .map((thread) => cachedConversationToThread(ownerUserId, thread))
      .filter((thread): thread is ChatThreadRow => Boolean(thread));

    await ChatRepository.upsertThreads(ownerUserId, threadRows);

    let messageCount = 0;
    for (const thread of threadRows) {
      const cachedMessages = await readOfflineSnapshot<any[]>(
        buildChatThreadStoreKey(ownerUserId, thread.id),
      );
      if (!Array.isArray(cachedMessages) || cachedMessages.length === 0) continue;
      const messageRows = cachedMessages
        .map((message) => cachedMessageToRow(ownerUserId, thread.id, message))
        .filter((message): message is ChatMessageRow => Boolean(message));
      if (messageRows.length === 0) continue;
      await ChatRepository.upsertMessages(ownerUserId, thread.id, messageRows);
      messageCount += messageRows.length;
    }

    setHasLocalChatData(threadRows.length > 0 || messageCount > 0);
    setLastKnownUserId(ownerUserId);
    setAsyncSnapshotMigratedV1(true, ownerUserId);
    captureMessage('chat_async_snapshot_migration_succeeded', {
      ownerUserId,
      threadCount: threadRows.length,
      messageCount,
    });
    return { migrated: true, threadCount: threadRows.length, messageCount };
  } catch (error) {
    captureException(error, { where: 'migrateAsyncChatSnapshotsToSQLite' });
    captureMessage('chat_async_snapshot_migration_failed', { ownerUserId });
    return { migrated: false, threadCount: 0, messageCount: 0 };
  }
}
