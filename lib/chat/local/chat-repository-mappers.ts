import type {
  ChatMessageRow,
  ChatPendingOutboxRow,
  ChatSyncScope,
  ChatSyncStateRow,
  ChatThreadRow,
} from '@/lib/chat/local/chat-schema';

export const toThreadParams = (thread: ChatThreadRow) => [
  thread.id,
  thread.owner_user_id,
  thread.peer_user_id,
  thread.peer_profile_id,
  thread.peer_name,
  thread.peer_avatar_url,
  thread.peer_verified,
  thread.peer_presence_status,
  thread.peer_last_active,
  thread.title,
  thread.thread_type,
  thread.last_message_id,
  thread.last_message_preview,
  thread.last_message_sender_id,
  thread.last_message_status,
  thread.last_message_edited_at,
  thread.last_message_reaction_emoji,
  thread.last_message_reaction_user_id,
  thread.last_message_reaction_created_at,
  thread.last_message_reaction_target_type,
  thread.last_activity_kind,
  thread.last_activity_message_id,
  thread.last_activity_preview,
  thread.last_activity_at,
  thread.last_message_at,
  thread.unread_count,
  thread.is_muted,
  thread.is_pinned,
  thread.is_archived,
  thread.local_status,
  thread.remote_updated_at,
  thread.local_updated_at,
  thread.created_at,
];

export const toMessageParams = (message: ChatMessageRow) => [
  message.id,
  message.local_id,
  message.thread_id,
  message.owner_user_id,
  message.sender_user_id,
  message.receiver_user_id,
  message.body,
  message.message_type,
  message.status,
  message.direction,
  message.created_at,
  message.server_created_at,
  message.edited_at,
  message.deleted_at,
  message.reply_to_message_id,
  message.is_view_once,
  message.local_only,
  message.error_code,
  message.metadata_json,
  message.remote_updated_at,
  message.local_updated_at,
];

export const CHAT_MESSAGE_INSERT_COLUMNS = `
  id, local_id, thread_id, owner_user_id, sender_user_id, receiver_user_id, body,
  message_type, status, direction, created_at, server_created_at, edited_at,
  deleted_at, reply_to_message_id, is_view_once, local_only, error_code,
  metadata_json, remote_updated_at, local_updated_at
`;

export const CHAT_MESSAGE_UPSERT_CLAUSE = `
  on conflict(owner_user_id, id) do update set
    local_id = excluded.local_id,
    thread_id = excluded.thread_id,
    owner_user_id = excluded.owner_user_id,
    sender_user_id = excluded.sender_user_id,
    receiver_user_id = excluded.receiver_user_id,
    body = excluded.body,
    message_type = excluded.message_type,
    status = case
      when chat_messages.status = 'deleted' then chat_messages.status
      when excluded.status = 'deleted' then excluded.status
      when (
        case excluded.status
          when 'read' then 6
          when 'delivered' then 5
          when 'sent' then 4
          when 'sending' then 3
          when 'pending' then 2
          when 'failed' then 1
          else 0
        end
      ) >= (
        case chat_messages.status
          when 'read' then 6
          when 'delivered' then 5
          when 'sent' then 4
          when 'sending' then 3
          when 'pending' then 2
          when 'failed' then 1
          else 0
        end
      ) then excluded.status
      else chat_messages.status
    end,
    direction = excluded.direction,
    created_at = excluded.created_at,
    server_created_at = excluded.server_created_at,
    edited_at = excluded.edited_at,
    deleted_at = excluded.deleted_at,
    reply_to_message_id = excluded.reply_to_message_id,
    is_view_once = excluded.is_view_once,
    local_only = excluded.local_only,
    error_code = excluded.error_code,
    metadata_json = excluded.metadata_json,
    remote_updated_at = excluded.remote_updated_at,
    local_updated_at = excluded.local_updated_at
`;

export const toOutboxParams = (item: ChatPendingOutboxRow) => [
  item.id,
  item.local_message_id,
  item.thread_id,
  item.owner_user_id,
  item.payload_json,
  item.attempt_count,
  item.max_attempts,
  item.next_retry_at,
  item.status,
  item.error_code,
  item.error_message,
  item.created_at,
  item.updated_at,
];

export const buildSyncStateId = (
  ownerUserId: string,
  scope: ChatSyncScope,
  threadId?: string | null,
) => `${ownerUserId}:${scope}:${threadId ?? 'global'}`;

export const toSyncStateParams = (state: ChatSyncStateRow) => [
  state.id,
  state.owner_user_id,
  state.scope,
  state.thread_id,
  state.last_cursor,
  state.last_synced_at,
  state.last_error,
  state.updated_at,
];

export const mapOutboxStatusToMessageStatus = (
  status: ChatPendingOutboxRow['status'],
): ChatMessageRow['status'] | null => {
  switch (status) {
    case 'queued':
      return 'pending';
    case 'sending':
      return 'sending';
    case 'failed':
      return 'failed';
    case 'sent':
      return 'sent';
    case 'cancelled':
      return 'failed';
    default:
      return null;
  }
};
