import type { ChatMessageRow } from '@/lib/chat/local/chat-db';

/** Creates a stable content revision for coalescing equivalent local snapshots. */
export const buildChatThreadLocalRevision = <Message>(
  messages: Message[],
  hasMore: boolean,
  oldestTimestamp: Date | null,
  getMessageRevisionKey: (message: Message) => string,
) =>
  [
    hasMore ? 'more' : 'complete',
    oldestTimestamp?.getTime() ?? '',
    ...messages.map(getMessageRevisionKey),
  ].join('\u001e');

/**
 * Uses only persisted SQLite values. UI hydration must never influence whether
 * a local database snapshot is considered new.
 */
export const getChatMessageRowRevisionKey = (row: ChatMessageRow) =>
  [
    row.id,
    row.local_id ?? '',
    row.thread_id,
    row.owner_user_id,
    row.sender_user_id,
    row.receiver_user_id ?? '',
    row.body ?? '',
    row.message_type,
    row.status,
    row.direction,
    row.created_at,
    row.server_created_at ?? '',
    row.edited_at ?? '',
    row.deleted_at ?? '',
    row.reply_to_message_id ?? '',
    row.is_view_once,
    row.local_only,
    row.error_code ?? '',
    row.metadata_json ?? '',
    row.remote_updated_at ?? '',
    row.local_updated_at,
  ].join('\u001f');
