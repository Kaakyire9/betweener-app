import type { ChatMessageRow } from '@/lib/chat/local/chat-schema';
import { parseChatExpressionMediaKind } from '@/lib/chat/expressions/chat-expression-presentation';
import { getChatMessagePreviewText } from '@/lib/message-preview';
import { getChatDb } from '@/lib/storage/sqlite';

type ChatDb = Awaited<ReturnType<typeof getChatDb>>;
const nowIso = () => new Date().toISOString();

type ChatThreadSummaryMessage = Pick<
  ChatMessageRow,
  | 'id'
  | 'body'
  | 'sender_user_id'
  | 'message_type'
  | 'status'
  | 'is_view_once'
  | 'metadata_json'
  | 'edited_at'
  | 'created_at'
  | 'remote_updated_at'
  | 'local_updated_at'
>;

const getStoredMediaKind = (metadataJson: string | null) => {
  if (!metadataJson) return null;
  try {
    const parsed = JSON.parse(metadataJson) as { mediaKind?: unknown };
    return parseChatExpressionMediaKind(parsed?.mediaKind);
  } catch {
    return null;
  }
};

const getThreadMessagePreview = (message: ChatThreadSummaryMessage) => {
  return (
    getChatMessagePreviewText({
      text: message.body,
      messageType: message.message_type,
      mediaKind: getStoredMediaKind(message.metadata_json),
      isViewOnce: message.is_view_once === 1,
      status: message.status,
    }) || message.body || ''
  );
};
export const refreshThreadSummaryFromMessages = async (
  db: Awaited<ReturnType<typeof getChatDb>>,
  ownerUserId: string,
  threadId: string,
) => {
  const latest = await db.getFirstAsync<ChatThreadSummaryMessage>(
    `
      select id, body, sender_user_id, message_type, status, is_view_once, metadata_json, edited_at, created_at, remote_updated_at, local_updated_at
      from chat_messages
      where owner_user_id = ?
        and thread_id = ?
        and status <> 'deleted'
      order by created_at desc, local_updated_at desc
      limit 1
    `,
    ownerUserId,
    threadId,
  );

  const unread = await db.getFirstAsync<{ unread_count: number }>(
    `
      select count(*) as unread_count
      from chat_messages
      where owner_user_id = ?
        and thread_id = ?
        and direction = 'incoming'
        and status not in ('read', 'deleted')
    `,
    ownerUserId,
    threadId,
  );

  const now = nowIso();
  if (!latest) {
    await db.runAsync(
      `
        update chat_threads
        set last_message_id = null,
            last_message_preview = '',
            last_message_sender_id = null,
            last_message_status = null,
            last_message_media_kind = null,
            last_message_edited_at = null,
            last_message_reaction_emoji = null,
            last_message_reaction_user_id = null,
            last_message_reaction_created_at = null,
            last_message_reaction_target_type = null,
            last_activity_kind = null,
            last_activity_message_id = null,
            last_activity_preview = null,
            last_activity_at = null,
            last_message_at = null,
            unread_count = ?,
            local_updated_at = ?
        where owner_user_id = ?
          and id = ?
      `,
      unread?.unread_count ?? 0,
      now,
      ownerUserId,
      threadId,
    );
    return;
  }

  await db.runAsync(
    `
      insert into chat_threads (
        id, owner_user_id, peer_user_id, peer_profile_id, peer_name, peer_avatar_url,
        peer_verified, peer_presence_status, peer_last_active, title, thread_type, last_message_id,
        last_message_preview, last_message_sender_id, last_message_status, last_message_media_kind,
        last_message_edited_at,
        last_message_reaction_emoji, last_message_reaction_user_id, last_message_reaction_created_at,
        last_message_reaction_target_type, last_activity_kind, last_activity_message_id,
        last_activity_preview, last_activity_at, last_message_at, unread_count,
        is_muted, is_pinned, is_archived, local_status, remote_updated_at,
        local_updated_at, created_at
      )
      values (?, ?, ?, null, null, null, 0, null, null, null, 'direct', ?, ?, ?, ?, ?, ?, null, null, null, null, null, null, null, null, ?, ?, 0, 0, 0, 'active', ?, ?, ?)
      on conflict(owner_user_id, id) do update set
        last_message_id = excluded.last_message_id,
        last_message_preview = excluded.last_message_preview,
        last_message_sender_id = excluded.last_message_sender_id,
        last_message_status = excluded.last_message_status,
        last_message_media_kind = excluded.last_message_media_kind,
        last_message_edited_at = excluded.last_message_edited_at,
        last_message_reaction_emoji = case
          when chat_threads.last_message_id = excluded.last_message_id then chat_threads.last_message_reaction_emoji
          else null
        end,
        last_message_reaction_user_id = case
          when chat_threads.last_message_id = excluded.last_message_id then chat_threads.last_message_reaction_user_id
          else null
        end,
        last_message_reaction_created_at = case
          when chat_threads.last_message_id = excluded.last_message_id then chat_threads.last_message_reaction_created_at
          else null
        end,
        last_message_reaction_target_type = case
          when chat_threads.last_message_id = excluded.last_message_id then chat_threads.last_message_reaction_target_type
          else null
        end,
        last_activity_kind = case
          when datetime(chat_threads.last_activity_at) > datetime(excluded.last_message_at)
          then chat_threads.last_activity_kind
          else null
        end,
        last_activity_message_id = case
          when datetime(chat_threads.last_activity_at) > datetime(excluded.last_message_at)
          then chat_threads.last_activity_message_id
          else null
        end,
        last_activity_preview = case
          when datetime(chat_threads.last_activity_at) > datetime(excluded.last_message_at)
          then chat_threads.last_activity_preview
          else null
        end,
        last_activity_at = case
          when datetime(chat_threads.last_activity_at) > datetime(excluded.last_message_at)
          then chat_threads.last_activity_at
          else null
        end,
        last_message_at = excluded.last_message_at,
        unread_count = excluded.unread_count,
        remote_updated_at = coalesce(excluded.remote_updated_at, chat_threads.remote_updated_at),
        local_updated_at = excluded.local_updated_at
    `,
    threadId,
    ownerUserId,
    threadId,
    latest.id,
    getThreadMessagePreview(latest),
    latest.sender_user_id,
    latest.status,
    getStoredMediaKind(latest.metadata_json),
    latest.edited_at,
    latest.created_at,
    unread?.unread_count ?? 0,
    latest.remote_updated_at,
    now,
    latest.created_at,
  );
};

export const refreshThreadSummaryFromMessagesSync = (
  db: ChatDb,
  ownerUserId: string,
  threadId: string,
) => {
  const latest = db.getFirstSync<ChatThreadSummaryMessage>(
    `
      select id, body, sender_user_id, message_type, status, is_view_once, metadata_json, edited_at, created_at, remote_updated_at, local_updated_at
      from chat_messages
      where owner_user_id = ?
        and thread_id = ?
        and status <> 'deleted'
      order by created_at desc, local_updated_at desc
      limit 1
    `,
    ownerUserId,
    threadId,
  );
  const unread = db.getFirstSync<{ unread_count: number }>(
    `
      select count(*) as unread_count
      from chat_messages
      where owner_user_id = ?
        and thread_id = ?
        and direction = 'incoming'
        and status not in ('read', 'deleted')
    `,
    ownerUserId,
    threadId,
  );

  const now = nowIso();
  if (!latest) {
    db.runSync(
      `
        update chat_threads
        set last_message_id = null,
            last_message_preview = '',
            last_message_sender_id = null,
            last_message_status = null,
            last_message_media_kind = null,
            last_message_edited_at = null,
            last_message_reaction_emoji = null,
            last_message_reaction_user_id = null,
            last_message_reaction_created_at = null,
            last_message_reaction_target_type = null,
            last_activity_kind = null,
            last_activity_message_id = null,
            last_activity_preview = null,
            last_activity_at = null,
            last_message_at = null,
            unread_count = ?,
            local_updated_at = ?
        where owner_user_id = ?
          and id = ?
      `,
      unread?.unread_count ?? 0,
      now,
      ownerUserId,
      threadId,
    );
    return;
  }

  db.runSync(
    `
      insert into chat_threads (
        id, owner_user_id, peer_user_id, peer_profile_id, peer_name, peer_avatar_url,
        peer_verified, peer_presence_status, peer_last_active, title, thread_type, last_message_id,
        last_message_preview, last_message_sender_id, last_message_status, last_message_media_kind,
        last_message_edited_at,
        last_message_reaction_emoji, last_message_reaction_user_id, last_message_reaction_created_at,
        last_message_reaction_target_type, last_activity_kind, last_activity_message_id,
        last_activity_preview, last_activity_at, last_message_at, unread_count,
        is_muted, is_pinned, is_archived, local_status, remote_updated_at,
        local_updated_at, created_at
      )
      values (?, ?, ?, null, null, null, 0, null, null, null, 'direct', ?, ?, ?, ?, ?, ?, null, null, null, null, null, null, null, null, ?, ?, 0, 0, 0, 'active', ?, ?, ?)
      on conflict(owner_user_id, id) do update set
        last_message_id = excluded.last_message_id,
        last_message_preview = excluded.last_message_preview,
        last_message_sender_id = excluded.last_message_sender_id,
        last_message_status = excluded.last_message_status,
        last_message_media_kind = excluded.last_message_media_kind,
        last_message_edited_at = excluded.last_message_edited_at,
        last_message_reaction_emoji = case
          when chat_threads.last_message_id = excluded.last_message_id then chat_threads.last_message_reaction_emoji
          else null
        end,
        last_message_reaction_user_id = case
          when chat_threads.last_message_id = excluded.last_message_id then chat_threads.last_message_reaction_user_id
          else null
        end,
        last_message_reaction_created_at = case
          when chat_threads.last_message_id = excluded.last_message_id then chat_threads.last_message_reaction_created_at
          else null
        end,
        last_message_reaction_target_type = case
          when chat_threads.last_message_id = excluded.last_message_id then chat_threads.last_message_reaction_target_type
          else null
        end,
        last_activity_kind = case
          when datetime(chat_threads.last_activity_at) > datetime(excluded.last_message_at)
          then chat_threads.last_activity_kind
          else null
        end,
        last_activity_message_id = case
          when datetime(chat_threads.last_activity_at) > datetime(excluded.last_message_at)
          then chat_threads.last_activity_message_id
          else null
        end,
        last_activity_preview = case
          when datetime(chat_threads.last_activity_at) > datetime(excluded.last_message_at)
          then chat_threads.last_activity_preview
          else null
        end,
        last_activity_at = case
          when datetime(chat_threads.last_activity_at) > datetime(excluded.last_message_at)
          then chat_threads.last_activity_at
          else null
        end,
        last_message_at = excluded.last_message_at,
        unread_count = excluded.unread_count,
        remote_updated_at = coalesce(excluded.remote_updated_at, chat_threads.remote_updated_at),
        local_updated_at = excluded.local_updated_at
    `,
    threadId,
    ownerUserId,
    threadId,
    latest.id,
    getThreadMessagePreview(latest),
    latest.sender_user_id,
    latest.status,
    getStoredMediaKind(latest.metadata_json),
    latest.edited_at,
    latest.created_at,
    unread?.unread_count ?? 0,
    latest.remote_updated_at,
    now,
    latest.created_at,
  );
};
