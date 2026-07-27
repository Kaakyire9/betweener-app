import type {
  ChatMessageRow,
  ChatPendingOutboxRow,
  ChatSyncScope,
  ChatSyncStateRow,
  ChatThreadRow,
} from '@/lib/chat/local/chat-schema';
import { resolveThreadUnreadCount } from '@/lib/chat/active-thread';
import { CHAT_DB_NAME, CHAT_SCHEMA_VERSION } from '@/lib/chat/local/chat-schema';
import { getChatMessagePreviewText } from '@/lib/message-preview';
import {
  buildCanonicalMessageCleanupPredicates,
  buildChatMessageValueGroups,
  CHAT_MESSAGE_CLEANUP_BATCH_SIZE,
  CHAT_MESSAGE_WRITE_BATCH_SIZE,
  chunkChatMessageWrites,
} from '@/lib/chat/local/chat-message-write-batch';
import {
  buildPendingOutboxDueQueryParams,
  CHAT_PENDING_OUTBOX_DUE_QUERY,
} from '@/lib/chat/local/chat-outbox-query';
import { shouldPersistThreadReadState } from '@/lib/chat/read-state/thread-read-persistence-policy';
import {
  type ChatDbOperationOptions,
  getChatDb,
  isChatDatabaseLockedError,
  runSerializedChatDbOperation,
  withSerializedChatDbTransaction,
} from '@/lib/storage/sqlite';
import { Platform } from 'react-native';

type Listener = () => void;

const threadListeners = new Map<string, Set<Listener>>();
const messageListeners = new Map<string, Set<Listener>>();

const nowIso = () => new Date().toISOString();

const notify = (listeners: Map<string, Set<Listener>>, key: string) => {
  const scoped = listeners.get(key);
  if (!scoped) return;
  scoped.forEach((listener) => {
    try {
      listener();
    } catch {
      // Local observers must not break repository writes.
    }
  });
};

const addListener = (listeners: Map<string, Set<Listener>>, key: string, listener: Listener) => {
  const scoped = listeners.get(key) ?? new Set<Listener>();
  scoped.add(listener);
  listeners.set(key, scoped);
  return () => {
    const current = listeners.get(key);
    if (!current) return;
    current.delete(listener);
    if (current.size === 0) {
      listeners.delete(key);
    }
  };
};

const threadMessageKey = (ownerUserId: string, threadId: string) => `${ownerUserId}:${threadId}`;

type ChatDb = Awaited<ReturnType<typeof getChatDb>>;

type ChatDiagnosticsCountRow = {
  count: number;
};

type ChatDiagnosticsStatusCountRow = {
  status: string;
  count: number;
};

type ChatDiagnosticsRecentThreadRow = Pick<
  ChatThreadRow,
  | 'id'
  | 'peer_user_id'
  | 'peer_profile_id'
  | 'peer_name'
  | 'last_message_preview'
  | 'last_message_at'
  | 'unread_count'
  | 'is_pinned'
  | 'is_archived'
  | 'local_status'
>;

type ChatDiagnosticsOutboxRow = Pick<
  ChatPendingOutboxRow,
  | 'id'
  | 'local_message_id'
  | 'thread_id'
  | 'status'
  | 'attempt_count'
  | 'next_retry_at'
  | 'error_code'
  | 'updated_at'
>;

type ChatDiagnosticsSyncRow = Pick<
  ChatSyncStateRow,
  | 'id'
  | 'scope'
  | 'thread_id'
  | 'last_cursor'
  | 'last_synced_at'
  | 'last_error'
  | 'updated_at'
>;

export type ChatStorageDiagnosticsSnapshot = {
  dbName: string;
  targetSchemaVersion: number;
  actualSchemaVersion: number;
  ownerUserId: string | null;
  generatedAt: string;
  counts: {
    threads: number;
    participants: number;
    messages: number;
    media: number;
    readStates: number;
    pendingOutbox: number;
    syncStates: number;
  };
  messageStatusCounts: { status: string; count: number }[];
  outboxStatusCounts: { status: string; count: number }[];
  recentThreads: ChatDiagnosticsRecentThreadRow[];
  pendingOutboxItems: ChatDiagnosticsOutboxRow[];
  syncStates: ChatDiagnosticsSyncRow[];
};

type ChatRepositoryOperationOptions = Pick<ChatDbOperationOptions, 'priority'>;

const runSerializedWrite = <T>(
  task: () => Promise<T>,
  options: ChatDbOperationOptions = {},
) => runSerializedChatDbOperation(task, {
  ...options,
  priority: options.priority ?? 'normal',
});

const runSerializedRead = <T>(
  task: () => Promise<T>,
  options: ChatDbOperationOptions = {},
) => runSerializedChatDbOperation(task, {
  ...options,
  priority: options.priority ?? 'normal',
});

const runBoundedSerializedRead = <T>(
  syncTask: () => T,
  asyncFallbackTask: () => Promise<T>,
  options: ChatDbOperationOptions,
) =>
  runSerializedRead(async () => {
    try {
      return syncTask();
    } catch (error) {
      if (isChatDatabaseLockedError(error)) {
        throw error;
      }
      if (typeof __DEV__ !== 'undefined' && __DEV__) {
        console.warn('[chat][db] bounded-sync-read-fallback', {
          label: options.label ?? 'unlabelled',
          message: error instanceof Error ? error.message : String(error),
        });
      }
      return asyncFallbackTask();
    }
  }, options);

const runBoundedSerializedWrite = <T>(
  syncTask: () => T,
  asyncFallbackTask: () => Promise<T>,
  options: ChatDbOperationOptions,
) =>
  runSerializedWrite(async () => {
    try {
      return syncTask();
    } catch (error) {
      if (isChatDatabaseLockedError(error)) {
        throw error;
      }
      if (typeof __DEV__ !== 'undefined' && __DEV__) {
        console.warn('[chat][db] bounded-sync-write-fallback', {
          label: options.label ?? 'unlabelled',
          message: error instanceof Error ? error.message : String(error),
        });
      }
      return asyncFallbackTask();
    }
  }, options);

const withBoundedSerializedTransaction = <T>(
  db: ChatDb,
  syncTask: (transactionDb: ChatDb) => T,
  asyncFallbackTask: (transactionDb: ChatDb) => Promise<T>,
  options: ChatDbOperationOptions,
) =>
  runSerializedWrite(async () => {
    if (Platform.OS === 'ios') {
      let result!: T;
      await db.withExclusiveTransactionAsync(async (transactionDb) => {
        result = await asyncFallbackTask(transactionDb);
      });
      return result;
    }
    try {
      let result!: T;
      db.withTransactionSync(() => {
        result = syncTask(db);
      });
      return result;
    } catch (error) {
      if (isChatDatabaseLockedError(error)) {
        throw error;
      }
      if (typeof __DEV__ !== 'undefined' && __DEV__) {
        console.warn('[chat][db] bounded-sync-transaction-fallback', {
          label: options.label ?? 'unlabelled',
          message: error instanceof Error ? error.message : String(error),
        });
      }
      let result!: T;
      await db.withTransactionAsync(async () => {
        result = await asyncFallbackTask(db);
      });
      return result;
    }
  }, options);

const withSerializedTransaction = async (
  _db: ChatDb,
  task: (transactionDb: ChatDb) => Promise<void>,
  options: ChatDbOperationOptions = {},
) => {
  await withSerializedChatDbTransaction(task, {
    ...options,
    priority: options.priority ?? 'normal',
  });
};

const toThreadParams = (thread: ChatThreadRow) => [
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

const toMessageParams = (message: ChatMessageRow) => [
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

const CHAT_MESSAGE_INSERT_COLUMNS = `
  id, local_id, thread_id, owner_user_id, sender_user_id, receiver_user_id, body,
  message_type, status, direction, created_at, server_created_at, edited_at,
  deleted_at, reply_to_message_id, is_view_once, local_only, error_code,
  metadata_json, remote_updated_at, local_updated_at
`;

const CHAT_MESSAGE_UPSERT_CLAUSE = `
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

const toOutboxParams = (item: ChatPendingOutboxRow) => [
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

const buildSyncStateId = (ownerUserId: string, scope: ChatSyncScope, threadId?: string | null) =>
  `${ownerUserId}:${scope}:${threadId ?? 'global'}`;

const toSyncStateParams = (state: ChatSyncStateRow) => [
  state.id,
  state.owner_user_id,
  state.scope,
  state.thread_id,
  state.last_cursor,
  state.last_synced_at,
  state.last_error,
  state.updated_at,
];

const mapOutboxStatusToMessageStatus = (
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

type ChatThreadSummaryMessage = Pick<
  ChatMessageRow,
  | 'id'
  | 'body'
  | 'sender_user_id'
  | 'message_type'
  | 'status'
  | 'is_view_once'
  | 'edited_at'
  | 'created_at'
  | 'remote_updated_at'
  | 'local_updated_at'
>;

const getThreadMessagePreview = (message: ChatThreadSummaryMessage) => {
  return (
    getChatMessagePreviewText({
      text: message.body,
      messageType: message.message_type,
      isViewOnce: message.is_view_once === 1,
      status: message.status,
    }) || message.body || ''
  );
};

const refreshThreadSummaryFromMessages = async (
  db: Awaited<ReturnType<typeof getChatDb>>,
  ownerUserId: string,
  threadId: string,
) => {
  const latest = await db.getFirstAsync<ChatThreadSummaryMessage>(
    `
      select id, body, sender_user_id, message_type, status, is_view_once, edited_at, created_at, remote_updated_at, local_updated_at
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
        last_message_preview, last_message_sender_id, last_message_status, last_message_edited_at,
        last_message_reaction_emoji, last_message_reaction_user_id, last_message_reaction_created_at,
        last_message_reaction_target_type, last_activity_kind, last_activity_message_id,
        last_activity_preview, last_activity_at, last_message_at, unread_count,
        is_muted, is_pinned, is_archived, local_status, remote_updated_at,
        local_updated_at, created_at
      )
      values (?, ?, ?, null, null, null, 0, null, null, null, 'direct', ?, ?, ?, ?, ?, null, null, null, null, null, null, null, null, ?, ?, 0, 0, 0, 'active', ?, ?, ?)
      on conflict(owner_user_id, id) do update set
        last_message_id = excluded.last_message_id,
        last_message_preview = excluded.last_message_preview,
        last_message_sender_id = excluded.last_message_sender_id,
        last_message_status = excluded.last_message_status,
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
    latest.edited_at,
    latest.created_at,
    unread?.unread_count ?? 0,
    latest.remote_updated_at,
    now,
    latest.created_at,
  );
};

const refreshThreadSummaryFromMessagesSync = (
  db: ChatDb,
  ownerUserId: string,
  threadId: string,
) => {
  const latest = db.getFirstSync<ChatThreadSummaryMessage>(
    `
      select id, body, sender_user_id, message_type, status, is_view_once, edited_at, created_at, remote_updated_at, local_updated_at
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
        last_message_preview, last_message_sender_id, last_message_status, last_message_edited_at,
        last_message_reaction_emoji, last_message_reaction_user_id, last_message_reaction_created_at,
        last_message_reaction_target_type, last_activity_kind, last_activity_message_id,
        last_activity_preview, last_activity_at, last_message_at, unread_count,
        is_muted, is_pinned, is_archived, local_status, remote_updated_at,
        local_updated_at, created_at
      )
      values (?, ?, ?, null, null, null, 0, null, null, null, 'direct', ?, ?, ?, ?, ?, null, null, null, null, null, null, null, null, ?, ?, 0, 0, 0, 'active', ?, ?, ?)
      on conflict(owner_user_id, id) do update set
        last_message_id = excluded.last_message_id,
        last_message_preview = excluded.last_message_preview,
        last_message_sender_id = excluded.last_message_sender_id,
        last_message_status = excluded.last_message_status,
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
    latest.edited_at,
    latest.created_at,
    unread?.unread_count ?? 0,
    latest.remote_updated_at,
    now,
    latest.created_at,
  );
};

export const ChatRepository = {
  async init() {
    await getChatDb();
  },

  observeThreads(ownerUserId: string, listener: Listener) {
    return addListener(threadListeners, ownerUserId, listener);
  },

  observeMessages(ownerUserId: string, threadId: string, listener: Listener) {
    return addListener(messageListeners, threadMessageKey(ownerUserId, threadId), listener);
  },

  async getThreads(
    ownerUserId: string,
    options?: {
      includeArchived?: boolean;
      limit?: number;
      operationPriority?: ChatDbOperationOptions['priority'];
    },
  ): Promise<ChatThreadRow[]> {
    const db = await getChatDb();
    const includeArchived = options?.includeArchived === true;
    const limit = Math.max(1, Math.min(options?.limit ?? 200, 500));
    const query = includeArchived
      ? `
        select *
        from chat_threads
        where owner_user_id = ?
          and local_status = 'active'
        order by is_pinned desc, coalesce(last_message_at, created_at, local_updated_at) desc
        limit ?
      `
      : `
        select *
        from chat_threads
        where owner_user_id = ?
          and local_status = 'active'
          and is_archived = 0
        order by is_pinned desc, coalesce(last_message_at, created_at, local_updated_at) desc
        limit ?
      `;
    const params = [ownerUserId, limit] as const;
    return runBoundedSerializedRead(
      () => db.getAllSync<ChatThreadRow>(query, ...params),
      () => db.getAllAsync<ChatThreadRow>(query, ...params),
      {
      priority: options?.operationPriority ?? 'normal',
        label: 'get-threads',
      },
    );
  },

  async getRecentMessageActivityTimestamps(
    ownerUserId: string,
    options?: { sinceIso?: string | null; limit?: number },
  ): Promise<string[]> {
    const db = await getChatDb();
    const limit = Math.max(1, Math.min(options?.limit ?? 2000, 5000));
    const rows = await runSerializedRead(() => db.getAllAsync<{ created_at: string | null }>(
      `
        select created_at
        from chat_messages
        where owner_user_id = ?
          and status <> 'deleted'
          and (? is null or created_at >= ?)
        order by datetime(created_at) desc, datetime(local_updated_at) desc
        limit ?
      `,
      ownerUserId,
      options?.sinceIso ?? null,
      options?.sinceIso ?? null,
      limit,
    ), { priority: 'background', label: 'get-recent-message-activity' });

    return rows
      .map((row) => (typeof row?.created_at === 'string' ? row.created_at : null))
      .filter((value): value is string => Boolean(value));
  },

  async getThreadById(ownerUserId: string, threadId: string): Promise<ChatThreadRow | null> {
    const db = await getChatDb();
    const query = 'select * from chat_threads where owner_user_id = ? and id = ? limit 1';
    return runBoundedSerializedRead(
      () => db.getFirstSync<ChatThreadRow>(query, ownerUserId, threadId),
      () => db.getFirstAsync<ChatThreadRow>(query, ownerUserId, threadId),
      { priority: 'user-blocking', label: 'get-thread-by-id' },
    );
  },

  async getThreadByPeerProfileId(ownerUserId: string, peerProfileId: string): Promise<ChatThreadRow | null> {
    const db = await getChatDb();
    const query = `
        select *
        from chat_threads
        where owner_user_id = ?
          and peer_profile_id = ?
          and local_status = 'active'
        limit 1
      `;
    return runBoundedSerializedRead(
      () => db.getFirstSync<ChatThreadRow>(query, ownerUserId, peerProfileId),
      () => db.getFirstAsync<ChatThreadRow>(query, ownerUserId, peerProfileId),
      { priority: 'user-blocking', label: 'get-thread-by-peer-profile' },
    );
  },

  async hasThreadMessages(ownerUserId: string, threadId: string): Promise<boolean> {
    const db = await getChatDb();
    const query = `
        select exists (
          select 1
          from chat_messages
          where owner_user_id = ?
            and thread_id = ?
            and status <> 'deleted'
        ) as has_messages
      `;
    const row = await runBoundedSerializedRead(
      () => db.getFirstSync<{ has_messages: number }>(query, ownerUserId, threadId),
      () => db.getFirstAsync<{ has_messages: number }>(query, ownerUserId, threadId),
      { priority: 'normal', label: 'has-thread-messages' },
    );
    return row?.has_messages === 1;
  },

  async getThreadIdsWithMessages(ownerUserId: string, threadIds: string[]): Promise<Set<string>> {
    const ids = Array.from(new Set(threadIds.filter(Boolean)));
    if (ids.length === 0) {
      return new Set<string>();
    }
    const db = await getChatDb();
    const placeholders = ids.map(() => '?').join(',');
    const query = `
        select distinct thread_id
        from chat_messages
        where owner_user_id = ?
          and thread_id in (${placeholders})
          and status <> 'deleted'
      `;
    const params = [ownerUserId, ...ids] as const;
    const rows = await runBoundedSerializedRead(
      () => db.getAllSync<{ thread_id: string | null }>(query, ...params),
      () => db.getAllAsync<{ thread_id: string | null }>(query, ...params),
      { priority: 'normal', label: 'get-thread-ids-with-messages' },
    );
    return new Set(
      rows
        .map((row) => (typeof row?.thread_id === 'string' ? row.thread_id : null))
        .filter((threadId): threadId is string => Boolean(threadId)),
    );
  },

  async updateThreadPreferences(
    ownerUserId: string,
    threadId: string,
    next: { muted?: boolean; pinned?: boolean; archived?: boolean },
  ): Promise<void> {
    const db = await getChatDb();
    await runSerializedWrite(() => db.runAsync(
      `
        update chat_threads
        set is_muted = coalesce(?, is_muted),
            is_pinned = coalesce(?, is_pinned),
            is_archived = coalesce(?, is_archived),
            local_updated_at = ?
        where owner_user_id = ?
          and id = ?
      `,
      typeof next.muted === 'boolean' ? (next.muted ? 1 : 0) : null,
      typeof next.pinned === 'boolean' ? (next.pinned ? 1 : 0) : null,
      typeof next.archived === 'boolean' ? (next.archived ? 1 : 0) : null,
      nowIso(),
      ownerUserId,
      threadId,
    ), { label: 'update-thread-preferences' });
    notify(threadListeners, ownerUserId);
  },

  async updateThreadPresence(
    ownerUserId: string,
    threadId: string,
    next: { online?: boolean | null; lastActive?: string | null },
  ): Promise<void> {
    await this.updateThreadPresences(ownerUserId, [
      { threadId, ...next },
    ]);
  },

  async updateThreadPresences(
    ownerUserId: string,
    updates: {
      threadId: string;
      online?: boolean | null;
      lastActive?: string | null;
    }[],
  ): Promise<void> {
    if (updates.length === 0) return;
    const db = await getChatDb();
    const query = `
        update chat_threads
        set peer_presence_status = ?,
            peer_last_active = coalesce(?, peer_last_active),
            local_updated_at = ?
        where owner_user_id = ?
          and id = ?
      `;
    const latestByThread = new Map(updates.map((update) => [update.threadId, update]));
    const normalizedUpdates = [...latestByThread.values()];
    const updatedAt = nowIso();
    const toParams = (update: (typeof normalizedUpdates)[number]) => [
      update.online === true ? 'online' : update.online === false ? 'offline' : null,
      update.lastActive ?? null,
      updatedAt,
      ownerUserId,
      update.threadId,
    ] as const;
    try {
      await withBoundedSerializedTransaction(
        db,
        (txn) => {
          for (const update of normalizedUpdates) {
            txn.runSync(query, ...toParams(update));
          }
        },
        async (txn) => {
          for (const update of normalizedUpdates) {
            await txn.runAsync(query, ...toParams(update));
          }
        },
        { priority: 'background', label: 'update-thread-presence-batch' },
      );
    } catch (error) {
      if (isChatDatabaseLockedError(error)) {
        if (typeof __DEV__ !== 'undefined' && __DEV__) {
          console.log('[chat][db] background-presence-write-dropped', {
            ownerUserId,
            updateCount: normalizedUpdates.length,
          });
        }
        return;
      }
      throw error;
    }
    notify(threadListeners, ownerUserId);
  },

  async updateThreadReactionPreview(
    ownerUserId: string,
    threadId: string,
    messageId: string,
    reaction: {
      emoji: string;
      userId: string;
      createdAt: string;
      targetType?: string | null;
    } | null,
  ): Promise<void> {
    const db = await getChatDb();
    await runSerializedWrite(() => db.runAsync(
      `
        update chat_threads
        set last_message_reaction_emoji = ?,
            last_message_reaction_user_id = ?,
            last_message_reaction_created_at = ?,
            last_message_reaction_target_type = ?,
            local_updated_at = ?
        where owner_user_id = ?
          and id = ?
          and last_message_id = ?
      `,
      reaction?.emoji ?? null,
      reaction?.userId ?? null,
      reaction?.createdAt ?? null,
      reaction?.targetType ?? null,
      nowIso(),
      ownerUserId,
      threadId,
      messageId,
    ), { label: 'update-thread-reaction-preview' });
    notify(threadListeners, ownerUserId);
  },

  async updateThreadActivityPreview(
    ownerUserId: string,
    threadId: string,
    activity: {
      kind: 'edit' | 'reaction';
      messageId: string;
      preview: string;
      createdAt: string;
    } | null,
  ): Promise<void> {
    const db = await getChatDb();
    await runSerializedWrite(() => db.runAsync(
      `
        update chat_threads
        set last_activity_kind = ?,
            last_activity_message_id = ?,
            last_activity_preview = ?,
            last_activity_at = ?,
            local_updated_at = ?
        where owner_user_id = ?
          and id = ?
          and (
            ? is null
            or last_activity_at is null
            or datetime(?) >= datetime(last_activity_at)
          )
          and (
            ? is null
            or datetime(?) > datetime(last_message_at)
          )
      `,
      activity?.kind ?? null,
      activity?.messageId ?? null,
      activity?.preview ?? null,
      activity?.createdAt ?? null,
      nowIso(),
      ownerUserId,
      threadId,
      activity?.createdAt ?? null,
      activity?.createdAt ?? null,
      activity?.createdAt ?? null,
      activity?.createdAt ?? null,
    ), { label: 'update-thread-activity-preview' });
    notify(threadListeners, ownerUserId);
  },

  async upsertThreads(
    ownerUserId: string,
    threads: ChatThreadRow[],
    operationOptions: ChatRepositoryOperationOptions = {},
  ): Promise<void> {
    if (threads.length === 0) return;
    const db = await getChatDb();
    const persistThreadBatchSync = (txn: ChatDb, threadBatch: ChatThreadRow[]) => {
      for (const thread of threadBatch) {
        const incomingThread = {
          ...thread,
          unread_count: resolveThreadUnreadCount(
            ownerUserId,
            thread.peer_user_id || thread.id,
            Number(thread.unread_count) || 0,
          ),
        };
        txn.runSync(
          `
            insert into chat_threads (
              id, owner_user_id, peer_user_id, peer_profile_id, peer_name, peer_avatar_url,
              peer_verified, peer_presence_status, peer_last_active, title, thread_type, last_message_id,
              last_message_preview, last_message_sender_id, last_message_status, last_message_edited_at,
              last_message_reaction_emoji, last_message_reaction_user_id, last_message_reaction_created_at,
              last_message_reaction_target_type, last_activity_kind, last_activity_message_id,
              last_activity_preview, last_activity_at, last_message_at, unread_count,
              is_muted, is_pinned, is_archived, local_status, remote_updated_at,
              local_updated_at, created_at
            )
            values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            on conflict(owner_user_id, id) do update set
              owner_user_id = excluded.owner_user_id,
              peer_user_id = excluded.peer_user_id,
              peer_profile_id = excluded.peer_profile_id,
              peer_name = excluded.peer_name,
              peer_avatar_url = excluded.peer_avatar_url,
              peer_verified = excluded.peer_verified,
              peer_presence_status = excluded.peer_presence_status,
              peer_last_active = excluded.peer_last_active,
              title = excluded.title,
              thread_type = excluded.thread_type,
              last_message_id = excluded.last_message_id,
              last_message_preview = excluded.last_message_preview,
              last_message_sender_id = excluded.last_message_sender_id,
              last_message_status = excluded.last_message_status,
              last_message_edited_at = excluded.last_message_edited_at,
              last_message_reaction_emoji = excluded.last_message_reaction_emoji,
              last_message_reaction_user_id = excluded.last_message_reaction_user_id,
              last_message_reaction_created_at = excluded.last_message_reaction_created_at,
              last_message_reaction_target_type = excluded.last_message_reaction_target_type,
              last_activity_kind = excluded.last_activity_kind,
              last_activity_message_id = excluded.last_activity_message_id,
              last_activity_preview = excluded.last_activity_preview,
              last_activity_at = excluded.last_activity_at,
              last_message_at = excluded.last_message_at,
              unread_count = excluded.unread_count,
              is_muted = excluded.is_muted,
              is_pinned = excluded.is_pinned,
              is_archived = excluded.is_archived,
              local_status = excluded.local_status,
              remote_updated_at = excluded.remote_updated_at,
              local_updated_at = excluded.local_updated_at,
              created_at = excluded.created_at
          `,
          ...toThreadParams({ ...incomingThread, owner_user_id: ownerUserId }),
        );
      }
    };

    const threadBatches =
      operationOptions.priority === 'background'
        ? chunkChatMessageWrites(threads, 8)
        : [threads];
    for (const threadBatch of threadBatches) {
      await withBoundedSerializedTransaction(
        db,
        (txn) => persistThreadBatchSync(txn, threadBatch),
        async (txn) => persistThreadBatchSync(txn, threadBatch),
        { ...operationOptions, label: 'upsert-thread-cache-chunk' },
      );
    }
    notify(threadListeners, ownerUserId);
  },

  async getMessages(
    ownerUserId: string,
    threadId: string,
    options?: {
      limit?: number;
      before?: string | null;
      operationPriority?: ChatDbOperationOptions['priority'];
    },
  ): Promise<ChatMessageRow[]> {
    const db = await getChatDb();
    const limit = Math.max(1, Math.min(options?.limit ?? 50, 200));
    const before = options?.before ?? null;
    const query = before
      ? `
        select *
        from chat_messages
        where owner_user_id = ?
          and thread_id = ?
          and created_at < ?
        order by created_at desc
        limit ?
      `
      : `
        select *
        from chat_messages
        where owner_user_id = ?
          and thread_id = ?
        order by created_at desc
        limit ?
      `;
    const params = before
      ? ([ownerUserId, threadId, before, limit] as const)
      : ([ownerUserId, threadId, limit] as const);
    const rows = await runBoundedSerializedRead(
      () => db.getAllSync<ChatMessageRow>(query, ...params),
      () => db.getAllAsync<ChatMessageRow>(query, ...params),
      {
        priority: options?.operationPriority ?? 'user-blocking',
        label: 'get-active-thread-messages',
      },
    );
    return rows.reverse();
  },

  async upsertMessages(
    ownerUserId: string,
    threadId: string,
    messages: ChatMessageRow[],
    operationOptions: ChatRepositoryOperationOptions = {},
  ): Promise<void> {
    if (messages.length === 0) return;
    const db = await getChatDb();
    const normalizedMessages = messages.map((message) => ({
      ...message,
      owner_user_id: ownerUserId,
      thread_id: threadId,
    }));

    const persistMessages = async (
      txn: ChatDb,
      messageBatch: ChatMessageRow[],
      refreshSummary: boolean,
    ) => {
      const canonicalMessages = messageBatch.filter(
        (message) => message.local_id && !String(message.id).startsWith('temp-'),
      );

      for (const cleanupBatch of chunkChatMessageWrites(
        canonicalMessages,
        CHAT_MESSAGE_CLEANUP_BATCH_SIZE,
      )) {
        await txn.runAsync(
          `
            delete from chat_messages
            where owner_user_id = ?
              and thread_id = ?
              and (${buildCanonicalMessageCleanupPredicates(cleanupBatch.length)})
          `,
          ownerUserId,
          threadId,
          ...cleanupBatch.flatMap((message) => [message.local_id, message.id]),
        );
      }

      for (const writeBatch of chunkChatMessageWrites(
        messageBatch,
        CHAT_MESSAGE_WRITE_BATCH_SIZE,
      )) {
        await txn.runAsync(
          `
            insert into chat_messages (${CHAT_MESSAGE_INSERT_COLUMNS})
            values ${buildChatMessageValueGroups(writeBatch.length)}
            ${CHAT_MESSAGE_UPSERT_CLAUSE}
          `,
          ...writeBatch.flatMap(toMessageParams),
        );
      }

      if (refreshSummary) {
        await refreshThreadSummaryFromMessages(txn, ownerUserId, threadId);
      }
    };

    const persistMessagesSync = (
      txn: ChatDb,
      messageBatch: ChatMessageRow[],
      refreshSummary: boolean,
    ) => {
      const canonicalMessages = messageBatch.filter(
        (message) => message.local_id && !String(message.id).startsWith('temp-'),
      );

      for (const cleanupBatch of chunkChatMessageWrites(
        canonicalMessages,
        CHAT_MESSAGE_CLEANUP_BATCH_SIZE,
      )) {
        txn.runSync(
          `
            delete from chat_messages
            where owner_user_id = ?
              and thread_id = ?
              and (${buildCanonicalMessageCleanupPredicates(cleanupBatch.length)})
          `,
          ownerUserId,
          threadId,
          ...cleanupBatch.flatMap((message) => [message.local_id, message.id]),
        );
      }

      for (const writeBatch of chunkChatMessageWrites(
        messageBatch,
        CHAT_MESSAGE_WRITE_BATCH_SIZE,
      )) {
        txn.runSync(
          `
            insert into chat_messages (${CHAT_MESSAGE_INSERT_COLUMNS})
            values ${buildChatMessageValueGroups(writeBatch.length)}
            ${CHAT_MESSAGE_UPSERT_CLAUSE}
          `,
          ...writeBatch.flatMap(toMessageParams),
        );
      }

      if (refreshSummary) {
        refreshThreadSummaryFromMessagesSync(txn, ownerUserId, threadId);
      }
    };

    if (
      operationOptions.priority === 'background' &&
      normalizedMessages.length > CHAT_MESSAGE_WRITE_BATCH_SIZE
    ) {
      const batches = chunkChatMessageWrites(
        normalizedMessages,
        CHAT_MESSAGE_WRITE_BATCH_SIZE,
      );
      for (let index = 0; index < batches.length; index += 1) {
        await withBoundedSerializedTransaction(
          db,
          (txn) => persistMessagesSync(txn, batches[index], index === batches.length - 1),
          (txn) => persistMessages(txn, batches[index], index === batches.length - 1),
          { ...operationOptions, label: 'upsert-message-cache-chunk' },
        );
      }
    } else {
      await withBoundedSerializedTransaction(
        db,
        (txn) => persistMessagesSync(txn, normalizedMessages, true),
        (txn) => persistMessages(txn, normalizedMessages, true),
        { ...operationOptions, label: 'upsert-messages' },
      );
    }
    notify(threadListeners, ownerUserId);
    notify(messageListeners, threadMessageKey(ownerUserId, threadId));
  },

  async enqueueMessageWithOutbox(
    ownerUserId: string,
    threadId: string,
    message: ChatMessageRow,
    item: ChatPendingOutboxRow,
  ): Promise<void> {
    const db = await getChatDb();
    const normalizedMessage = {
      ...message,
      owner_user_id: ownerUserId,
      thread_id: threadId,
    };
    const normalizedOutbox = {
      ...item,
      owner_user_id: ownerUserId,
      thread_id: threadId,
      local_message_id: message.local_id || item.local_message_id,
    };
    const messageQuery = `
      insert into chat_messages (${CHAT_MESSAGE_INSERT_COLUMNS})
      values ${buildChatMessageValueGroups(1)}
      ${CHAT_MESSAGE_UPSERT_CLAUSE}
    `;
    const outboxQuery = `
      insert into chat_pending_outbox (
        id, local_message_id, thread_id, owner_user_id, payload_json, attempt_count,
        max_attempts, next_retry_at, status, error_code, error_message, created_at, updated_at
      )
      values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      on conflict(id) do update set
        local_message_id = excluded.local_message_id,
        thread_id = excluded.thread_id,
        owner_user_id = excluded.owner_user_id,
        payload_json = excluded.payload_json,
        attempt_count = excluded.attempt_count,
        max_attempts = excluded.max_attempts,
        next_retry_at = excluded.next_retry_at,
        status = excluded.status,
        error_code = excluded.error_code,
        error_message = excluded.error_message,
        updated_at = excluded.updated_at
    `;
    const messageParams = toMessageParams(normalizedMessage);
    const outboxParams = toOutboxParams(normalizedOutbox);

    await withBoundedSerializedTransaction(
      db,
      (txn) => {
        txn.runSync(messageQuery, ...messageParams);
        txn.runSync(outboxQuery, ...outboxParams);
        refreshThreadSummaryFromMessagesSync(txn, ownerUserId, threadId);
      },
      async (txn) => {
        await txn.runAsync(messageQuery, ...messageParams);
        await txn.runAsync(outboxQuery, ...outboxParams);
        await refreshThreadSummaryFromMessages(txn, ownerUserId, threadId);
      },
      { priority: 'user-blocking', label: 'enqueue-message-with-outbox' },
    );
    notify(threadListeners, ownerUserId);
    notify(messageListeners, threadMessageKey(ownerUserId, threadId));
  },

  async settleOutboxMessage(
    ownerUserId: string,
    threadId: string,
    localMessageId: string,
    message: ChatMessageRow,
  ): Promise<void> {
    const db = await getChatDb();
    const canonicalMessage = {
      ...message,
      local_id: message.local_id || localMessageId,
      owner_user_id: ownerUserId,
      thread_id: threadId,
      local_only: 0 as const,
    };
    const updatedAt = nowIso();
    const cleanupQuery = `
      delete from chat_messages
      where owner_user_id = ?
        and thread_id = ?
        and local_id = ?
        and id <> ?
    `;
    const messageQuery = `
      insert into chat_messages (${CHAT_MESSAGE_INSERT_COLUMNS})
      values ${buildChatMessageValueGroups(1)}
      ${CHAT_MESSAGE_UPSERT_CLAUSE}
    `;
    const outboxQuery = `
      update chat_pending_outbox
      set status = 'sent',
          next_retry_at = null,
          error_code = null,
          error_message = null,
          updated_at = ?
      where owner_user_id = ?
        and local_message_id = ?
    `;
    const cleanupParams = [
      ownerUserId,
      threadId,
      canonicalMessage.local_id,
      canonicalMessage.id,
    ] as const;
    const messageParams = toMessageParams(canonicalMessage);
    const outboxParams = [updatedAt, ownerUserId, localMessageId] as const;

    await withBoundedSerializedTransaction(
      db,
      (txn) => {
        txn.runSync(cleanupQuery, ...cleanupParams);
        txn.runSync(messageQuery, ...messageParams);
        txn.runSync(outboxQuery, ...outboxParams);
        refreshThreadSummaryFromMessagesSync(txn, ownerUserId, threadId);
      },
      async (txn) => {
        await txn.runAsync(cleanupQuery, ...cleanupParams);
        await txn.runAsync(messageQuery, ...messageParams);
        await txn.runAsync(outboxQuery, ...outboxParams);
        await refreshThreadSummaryFromMessages(txn, ownerUserId, threadId);
      },
      { priority: 'user-blocking', label: 'settle-outbox-message' },
    );
    notify(threadListeners, ownerUserId);
    notify(messageListeners, threadMessageKey(ownerUserId, threadId));
  },

  async upsertPendingOutboxItem(ownerUserId: string, item: ChatPendingOutboxRow): Promise<void> {
    const db = await getChatDb();
    const query = `
        insert into chat_pending_outbox (
          id, local_message_id, thread_id, owner_user_id, payload_json, attempt_count,
          max_attempts, next_retry_at, status, error_code, error_message, created_at, updated_at
        )
        values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        on conflict(id) do update set
          local_message_id = excluded.local_message_id,
          thread_id = excluded.thread_id,
          owner_user_id = excluded.owner_user_id,
          payload_json = excluded.payload_json,
          attempt_count = excluded.attempt_count,
          max_attempts = excluded.max_attempts,
          next_retry_at = excluded.next_retry_at,
          status = excluded.status,
          error_code = excluded.error_code,
          error_message = excluded.error_message,
          updated_at = excluded.updated_at
      `;
    const params = toOutboxParams({ ...item, owner_user_id: ownerUserId });
    await runBoundedSerializedWrite(
      () => db.runSync(query, ...params),
      () => db.runAsync(query, ...params),
      { label: 'upsert-pending-outbox-item' },
    );
  },

  async getPendingOutboxItems(ownerUserId: string, options?: { limit?: number }): Promise<ChatPendingOutboxRow[]> {
    const db = await getChatDb();
    const limit = Math.max(1, Math.min(options?.limit ?? 50, 200));
    const staleSendingBefore = new Date(Date.now() - 2 * 60 * 1000).toISOString();
    const params = buildPendingOutboxDueQueryParams({
      ownerUserId,
      now: nowIso(),
      staleSendingBefore,
      limit,
    });
    return runBoundedSerializedRead(
      () => db.getAllSync<ChatPendingOutboxRow>(CHAT_PENDING_OUTBOX_DUE_QUERY, ...params),
      () => db.getAllAsync<ChatPendingOutboxRow>(CHAT_PENDING_OUTBOX_DUE_QUERY, ...params),
      { priority: 'background', label: 'get-pending-outbox-items' },
    );
  },

  async markOutboxItemStatus(
    ownerUserId: string,
    localMessageId: string,
    status: ChatPendingOutboxRow['status'],
    error?: { code?: string | null; message?: string | null },
    options?: { nextRetryAt?: string | null },
  ): Promise<void> {
    const db = await getChatDb();
    const nextMessageStatus = mapOutboxStatusToMessageStatus(status);
    const updatedAt = nowIso();
    const updateOutboxQuery = `
      update chat_pending_outbox
      set status = ?,
          next_retry_at = ?,
          error_code = ?,
          error_message = ?,
          updated_at = ?
      where owner_user_id = ?
        and local_message_id = ?
    `;
    const updateOutboxParams = [
      status,
      status === 'queued' ? options?.nextRetryAt ?? null : null,
      error?.code ?? null,
      error?.message ?? null,
      updatedAt,
      ownerUserId,
      localMessageId,
    ] as const;
    const updateMessageQuery = `
      update chat_messages
      set status = ?,
          error_code = ?,
          local_only = ?,
          local_updated_at = ?
      where owner_user_id = ?
        and (local_id = ? or id = ?)
    `;
    const updateMessageParams = nextMessageStatus
      ? [
          nextMessageStatus,
          error?.code ?? null,
          status === 'sent' ? 0 : 1,
          updatedAt,
          ownerUserId,
          localMessageId,
          localMessageId,
        ] as const
      : null;
    const lookupThreadQuery = `
      select thread_id
      from chat_pending_outbox
      where owner_user_id = ?
        and local_message_id = ?
      limit 1
    `;

    const thread = await withBoundedSerializedTransaction(
      db,
      (txn) => {
        const row = txn.getFirstSync<{ thread_id: string }>(
          lookupThreadQuery,
          ownerUserId,
          localMessageId,
        );
        txn.runSync(updateOutboxQuery, ...updateOutboxParams);
        if (updateMessageParams) {
          txn.runSync(updateMessageQuery, ...updateMessageParams);
        }
        return row;
      },
      async (txn) => {
        const row = await txn.getFirstAsync<{ thread_id: string }>(
          lookupThreadQuery,
          ownerUserId,
          localMessageId,
        );
        await txn.runAsync(updateOutboxQuery, ...updateOutboxParams);
        if (updateMessageParams) {
          await txn.runAsync(updateMessageQuery, ...updateMessageParams);
        }
        return row;
      },
      { label: 'mark-outbox-item-status' },
    );

    if (thread?.thread_id) {
      notify(threadListeners, ownerUserId);
      notify(messageListeners, threadMessageKey(ownerUserId, thread.thread_id));
    }
  },

  async markOutboxItemAttempting(ownerUserId: string, localMessageId: string): Promise<void> {
    const db = await getChatDb();
    const updatedAt = nowIso();
    const lookupThreadQuery = `
      select thread_id
      from chat_pending_outbox
      where owner_user_id = ?
        and local_message_id = ?
      limit 1
    `;
    const updateOutboxQuery = `
      update chat_pending_outbox
      set status = 'sending',
          attempt_count = attempt_count + 1,
          next_retry_at = null,
          error_code = null,
          error_message = null,
          updated_at = ?
      where owner_user_id = ?
        and local_message_id = ?
    `;
    const updateMessageQuery = `
      update chat_messages
      set status = 'sending',
          error_code = null,
          local_only = 1,
          local_updated_at = ?
      where owner_user_id = ?
        and (local_id = ? or id = ?)
    `;

    const thread = await withBoundedSerializedTransaction(
      db,
      (txn) => {
        const row = txn.getFirstSync<{ thread_id: string }>(
          lookupThreadQuery,
          ownerUserId,
          localMessageId,
        );
        txn.runSync(updateOutboxQuery, updatedAt, ownerUserId, localMessageId);
        txn.runSync(
          updateMessageQuery,
          updatedAt,
          ownerUserId,
          localMessageId,
          localMessageId,
        );
        return row;
      },
      async (txn) => {
        const row = await txn.getFirstAsync<{ thread_id: string }>(
          lookupThreadQuery,
          ownerUserId,
          localMessageId,
        );
        await txn.runAsync(updateOutboxQuery, updatedAt, ownerUserId, localMessageId);
        await txn.runAsync(
          updateMessageQuery,
          updatedAt,
          ownerUserId,
          localMessageId,
          localMessageId,
        );
        return row;
      },
      { label: 'mark-outbox-item-attempting' },
    );

    if (thread?.thread_id) {
      notify(threadListeners, ownerUserId);
      notify(messageListeners, threadMessageKey(ownerUserId, thread.thread_id));
    }
  },

  async requeueOutboxItem(ownerUserId: string, localMessageId: string, maxAttempts = 48): Promise<boolean> {
    const db = await getChatDb();
    const updatedAt = nowIso();
    const lookupThreadQuery = `
      select thread_id
      from chat_pending_outbox
      where owner_user_id = ?
        and local_message_id = ?
      limit 1
    `;
    const updateOutboxQuery = `
      update chat_pending_outbox
      set status = 'queued',
          attempt_count = 0,
          max_attempts = max(max_attempts, ?),
          next_retry_at = null,
          error_code = null,
          error_message = null,
          updated_at = ?
      where owner_user_id = ?
        and local_message_id = ?
        and status in ('failed', 'queued')
    `;
    const updateMessageQuery = `
      update chat_messages
      set status = 'pending',
          error_code = null,
          local_only = 1,
          local_updated_at = ?
      where owner_user_id = ?
        and (local_id = ? or id = ?)
    `;
    const outcome = await withBoundedSerializedTransaction(
      db,
      (txn) => {
        const thread = txn.getFirstSync<{ thread_id: string }>(
          lookupThreadQuery,
          ownerUserId,
          localMessageId,
        );
        const result = txn.runSync(
          updateOutboxQuery,
          maxAttempts,
          updatedAt,
          ownerUserId,
          localMessageId,
        );
        if (result.changes > 0) {
          txn.runSync(
            updateMessageQuery,
            updatedAt,
            ownerUserId,
            localMessageId,
            localMessageId,
          );
        }
        return { changed: result.changes > 0, threadId: thread?.thread_id ?? null };
      },
      async (txn) => {
        const thread = await txn.getFirstAsync<{ thread_id: string }>(
          lookupThreadQuery,
          ownerUserId,
          localMessageId,
        );
        const result = await txn.runAsync(
          updateOutboxQuery,
          maxAttempts,
          updatedAt,
          ownerUserId,
          localMessageId,
        );
        if (result.changes > 0) {
          await txn.runAsync(
            updateMessageQuery,
            updatedAt,
            ownerUserId,
            localMessageId,
            localMessageId,
          );
        }
        return { changed: result.changes > 0, threadId: thread?.thread_id ?? null };
      },
      { label: 'requeue-outbox-item' },
    );
    if (outcome.changed) {
      notify(threadListeners, ownerUserId);
      if (outcome.threadId) {
        notify(messageListeners, threadMessageKey(ownerUserId, outcome.threadId));
      }
    }
    return outcome.changed;
  },

  async markThreadRead(ownerUserId: string, threadId: string): Promise<void> {
    const db = await getChatDb();
    const snapshot = await runBoundedSerializedRead(
      () => db.getFirstSync<{
        unread_count: number;
        has_unread_incoming: number;
        has_read_state: number;
      }>(
        `
          select
            coalesce(t.unread_count, 0) as unread_count,
            exists (
              select 1
              from chat_messages m
              where m.owner_user_id = t.owner_user_id
                and m.thread_id = t.id
                and m.direction = 'incoming'
                and m.status not in ('read', 'deleted')
            ) as has_unread_incoming,
            exists (
              select 1
              from chat_read_states r
              where r.owner_user_id = t.owner_user_id
                and r.thread_id = t.id
                and r.user_id = t.owner_user_id
            ) as has_read_state
          from chat_threads t
          where t.owner_user_id = ?
            and t.id = ?
          limit 1
        `,
        ownerUserId,
        threadId,
      ),
      () => db.getFirstAsync<{
        unread_count: number;
        has_unread_incoming: number;
        has_read_state: number;
      }>(
        `
          select
            coalesce(t.unread_count, 0) as unread_count,
            exists (
              select 1
              from chat_messages m
              where m.owner_user_id = t.owner_user_id
                and m.thread_id = t.id
                and m.direction = 'incoming'
                and m.status not in ('read', 'deleted')
            ) as has_unread_incoming,
            exists (
              select 1
              from chat_read_states r
              where r.owner_user_id = t.owner_user_id
                and r.thread_id = t.id
                and r.user_id = t.owner_user_id
            ) as has_read_state
          from chat_threads t
          where t.owner_user_id = ?
            and t.id = ?
          limit 1
        `,
        ownerUserId,
        threadId,
      ),
      { priority: 'user-blocking', label: 'get-thread-read-persistence-state' },
    );
    if (!shouldPersistThreadReadState(snapshot
      ? {
          threadUnreadCount: snapshot.unread_count,
          hasUnreadIncoming: snapshot.has_unread_incoming === 1,
          hasReadState: snapshot.has_read_state === 1,
        }
      : null)) {
      return;
    }
    const persistReadStateSync = (txn: ChatDb) => {
      const now = nowIso();
      const latestRead = txn.getFirstSync<{ id: string; created_at: string }>(
        `
          select id, created_at
          from chat_messages
          where owner_user_id = ?
            and thread_id = ?
            and direction = 'incoming'
            and status <> 'deleted'
          order by created_at desc, local_updated_at desc
          limit 1
        `,
        ownerUserId,
        threadId,
      );
      txn.runSync(
        `
          update chat_messages
          set status = 'read',
              local_updated_at = ?
          where owner_user_id = ?
            and thread_id = ?
            and direction = 'incoming'
            and status not in ('read', 'deleted')
        `,
        now,
        ownerUserId,
        threadId,
      );
      txn.runSync(
        `
          update chat_threads
          set unread_count = 0,
              local_updated_at = ?
          where owner_user_id = ?
            and id = ?
        `,
        now,
        ownerUserId,
        threadId,
      );
      txn.runSync(
        `
          insert into chat_read_states (
            id, thread_id, owner_user_id, user_id, last_read_message_id, last_read_at, unread_count, updated_at
          )
          values (?, ?, ?, ?, ?, ?, 0, ?)
          on conflict(thread_id, user_id, owner_user_id) do update set
            last_read_message_id = excluded.last_read_message_id,
            last_read_at = excluded.last_read_at,
            unread_count = 0,
            updated_at = excluded.updated_at
        `,
        `${ownerUserId}:${threadId}:${ownerUserId}`,
        threadId,
        ownerUserId,
        ownerUserId,
        latestRead?.id ?? null,
        latestRead?.created_at ?? now,
        now,
      );
    };
    const persistReadStateAsync = async (txn: ChatDb) => {
      const now = nowIso();
      const latestRead = await txn.getFirstAsync<{ id: string; created_at: string }>(
        `
          select id, created_at
          from chat_messages
          where owner_user_id = ?
            and thread_id = ?
            and direction = 'incoming'
            and status <> 'deleted'
          order by created_at desc, local_updated_at desc
          limit 1
        `,
        ownerUserId,
        threadId,
      );
      await txn.runAsync(
        `
          update chat_messages
          set status = 'read',
              local_updated_at = ?
          where owner_user_id = ?
            and thread_id = ?
            and direction = 'incoming'
            and status not in ('read', 'deleted')
        `,
        now,
        ownerUserId,
        threadId,
      );
      await txn.runAsync(
        `
          update chat_threads
          set unread_count = 0,
              local_updated_at = ?
          where owner_user_id = ?
            and id = ?
        `,
        now,
        ownerUserId,
        threadId,
      );
      await txn.runAsync(
        `
          insert into chat_read_states (
            id, thread_id, owner_user_id, user_id, last_read_message_id, last_read_at, unread_count, updated_at
          )
          values (?, ?, ?, ?, ?, ?, 0, ?)
          on conflict(thread_id, user_id, owner_user_id) do update set
            last_read_message_id = excluded.last_read_message_id,
            last_read_at = excluded.last_read_at,
            unread_count = 0,
            updated_at = excluded.updated_at
        `,
        `${ownerUserId}:${threadId}:${ownerUserId}`,
        threadId,
        ownerUserId,
        ownerUserId,
        latestRead?.id ?? null,
        latestRead?.created_at ?? now,
        now,
      );
    };
    await withBoundedSerializedTransaction(
      db,
      persistReadStateSync,
      persistReadStateAsync,
      { priority: 'user-blocking', label: 'mark-thread-read' },
    );
    notify(threadListeners, ownerUserId);
    notify(messageListeners, threadMessageKey(ownerUserId, threadId));
  },

  async markMessageReceiptState(
    ownerUserId: string,
    threadId: string,
    messageId: string,
    status: ChatMessageRow['status'],
  ): Promise<void> {
    if (!messageId) return;
    const db = await getChatDb();
    const query = `
      update chat_messages
      set status = case
            when status = 'deleted' then status
            when (
              case ?
                when 'read' then 6
                when 'delivered' then 5
                when 'sent' then 4
                when 'sending' then 3
                when 'pending' then 2
                when 'failed' then 1
                else 0
              end
            ) >= (
              case status
                when 'read' then 6
                when 'delivered' then 5
                when 'sent' then 4
                when 'sending' then 3
                when 'pending' then 2
                when 'failed' then 1
                else 0
              end
            ) then ?
            else status
          end,
          local_updated_at = ?
      where owner_user_id = ?
        and thread_id = ?
        and id = ?
        and direction = 'outgoing'
        and status <> 'deleted'
    `;
    const params = [
      status,
      status,
      nowIso(),
      ownerUserId,
      threadId,
      messageId,
    ] as const;
    await withBoundedSerializedTransaction(
      db,
      (txn) => {
        txn.runSync(query, ...params);
        refreshThreadSummaryFromMessagesSync(txn, ownerUserId, threadId);
      },
      async (txn) => {
      await txn.runAsync(
        query,
        ...params,
      );
      await refreshThreadSummaryFromMessages(txn, ownerUserId, threadId);
      },
      { priority: 'normal', label: 'mark-message-receipt-state' },
    );
    notify(threadListeners, ownerUserId);
    notify(messageListeners, threadMessageKey(ownerUserId, threadId));
  },

  async deleteMessages(ownerUserId: string, threadId: string, messageIds: string[]): Promise<void> {
    const ids = Array.from(new Set(messageIds.filter(Boolean)));
    if (ids.length === 0) return;
    const db = await getChatDb();
    const placeholders = ids.map(() => '?').join(',');
    await withSerializedTransaction(db, async (txn) => {
      await txn.runAsync(
        `
          delete from chat_message_media
          where owner_user_id = ?
            and thread_id = ?
            and message_id in (${placeholders})
        `,
        ownerUserId,
        threadId,
        ...ids,
      );
      await txn.runAsync(
        `
          delete from chat_messages
          where owner_user_id = ?
            and thread_id = ?
            and id in (${placeholders})
        `,
        ownerUserId,
        threadId,
        ...ids,
      );
      await refreshThreadSummaryFromMessages(txn, ownerUserId, threadId);
    }, { label: 'delete-messages' });
    notify(threadListeners, ownerUserId);
    notify(messageListeners, threadMessageKey(ownerUserId, threadId));
  },

  async clearThreadMessages(ownerUserId: string, threadId: string): Promise<void> {
    const db = await getChatDb();
    await withSerializedTransaction(db, async (txn) => {
      await txn.runAsync(
        'delete from chat_message_media where owner_user_id = ? and thread_id = ?',
        ownerUserId,
        threadId,
      );
      await txn.runAsync(
        'delete from chat_messages where owner_user_id = ? and thread_id = ?',
        ownerUserId,
        threadId,
      );
      await refreshThreadSummaryFromMessages(txn, ownerUserId, threadId);
    }, { label: 'clear-thread-messages' });
    notify(threadListeners, ownerUserId);
    notify(messageListeners, threadMessageKey(ownerUserId, threadId));
  },

  async hideThreadForUser(ownerUserId: string, threadId: string): Promise<void> {
    const db = await getChatDb();
    await withSerializedTransaction(db, async (txn) => {
      await txn.runAsync(
        'delete from chat_message_media where owner_user_id = ? and thread_id = ?',
        ownerUserId,
        threadId,
      );
      await txn.runAsync(
        'delete from chat_messages where owner_user_id = ? and thread_id = ?',
        ownerUserId,
        threadId,
      );
      await txn.runAsync(
        'delete from chat_pending_outbox where owner_user_id = ? and thread_id = ?',
        ownerUserId,
        threadId,
      );
      await txn.runAsync(
        `
          update chat_threads
          set local_status = 'hidden',
              last_message_id = null,
              last_message_preview = '',
              last_message_sender_id = null,
              last_message_status = null,
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
              unread_count = 0,
              local_updated_at = ?
          where owner_user_id = ?
            and id = ?
        `,
        nowIso(),
        ownerUserId,
        threadId,
      );
    }, { label: 'hide-thread-for-user' });
    notify(threadListeners, ownerUserId);
    notify(messageListeners, threadMessageKey(ownerUserId, threadId));
  },

  async getSyncState(
    ownerUserId: string,
    scope: ChatSyncScope,
    threadId?: string | null,
    operationOptions: ChatRepositoryOperationOptions = {},
  ): Promise<ChatSyncStateRow | null> {
    const db = await getChatDb();
    const id = buildSyncStateId(ownerUserId, scope, threadId ?? null);
    const query = 'select * from chat_sync_state where id = ? limit 1';
    return runBoundedSerializedRead(
      () => db.getFirstSync<ChatSyncStateRow>(query, id),
      () => db.getFirstAsync<ChatSyncStateRow>(query, id),
      {
        priority: operationOptions.priority ?? 'normal',
        label: scope === 'thread_messages' ? 'get-thread-sync-state' : 'get-list-sync-state',
      },
    );
  },

  async markSyncSucceeded(
    ownerUserId: string,
    scope: ChatSyncScope,
    options?: {
      threadId?: string | null;
      cursor?: string | null;
      syncedAt?: string | null;
      operationPriority?: ChatDbOperationOptions['priority'];
    },
  ): Promise<void> {
    const db = await getChatDb();
    const updatedAt = nowIso();
    const state: ChatSyncStateRow = {
      id: buildSyncStateId(ownerUserId, scope, options?.threadId ?? null),
      owner_user_id: ownerUserId,
      scope,
      thread_id: options?.threadId ?? null,
      last_cursor: options?.cursor ?? null,
      last_synced_at: options?.syncedAt ?? updatedAt,
      last_error: null,
      updated_at: updatedAt,
    };
    const query = `
        insert into chat_sync_state (
          id, owner_user_id, scope, thread_id, last_cursor, last_synced_at, last_error, updated_at
        )
        values (?, ?, ?, ?, ?, ?, ?, ?)
        on conflict(id) do update set
          last_cursor = case
            when excluded.last_cursor is null then chat_sync_state.last_cursor
            when chat_sync_state.last_cursor is null then excluded.last_cursor
            when datetime(excluded.last_cursor) > datetime(chat_sync_state.last_cursor) then excluded.last_cursor
            else chat_sync_state.last_cursor
          end,
          last_synced_at = excluded.last_synced_at,
          last_error = null,
          updated_at = excluded.updated_at
      `;
    const params = toSyncStateParams(state);
    await runBoundedSerializedWrite(
      () => db.runSync(query, ...params),
      () => db.runAsync(query, ...params),
      {
        priority: options?.operationPriority ?? 'background',
        label: 'mark-sync-succeeded',
      },
    );
  },

  async markSyncFailed(
    ownerUserId: string,
    scope: ChatSyncScope,
    error: { code?: string | null; message?: string | null },
    options?: { threadId?: string | null },
  ): Promise<void> {
    const db = await getChatDb();
    const updatedAt = nowIso();
    await runSerializedWrite(() => db.runAsync(
      `
        insert into chat_sync_state (
          id, owner_user_id, scope, thread_id, last_cursor, last_synced_at, last_error, updated_at
        )
        values (?, ?, ?, ?, null, null, ?, ?)
        on conflict(id) do update set
          last_error = excluded.last_error,
          updated_at = excluded.updated_at
      `,
      buildSyncStateId(ownerUserId, scope, options?.threadId ?? null),
      ownerUserId,
      scope,
      options?.threadId ?? null,
      error.message ?? error.code ?? 'sync_failed',
      updatedAt,
    ), { priority: 'background', label: 'mark-sync-failed' });
  },

  async getStorageDiagnostics(ownerUserId?: string | null): Promise<ChatStorageDiagnosticsSnapshot> {
    const db = await getChatDb();
    const ownerClause = ownerUserId ? 'where owner_user_id = ?' : '';
    const ownerParams = ownerUserId ? [ownerUserId] : [];
    const countForTable = async (table: string) => {
      const row = await db.getFirstAsync<ChatDiagnosticsCountRow>(
        `select count(*) as count from ${table} ${ownerClause}`,
        ...ownerParams,
      );
      return Number(row?.count ?? 0);
    };

    const schemaRow = await db.getFirstAsync<{ value: string }>(
      `
        select value
        from local_schema_meta
        where key = 'chat_schema_version'
        limit 1
      `,
    );

    const [threads, participants, messages, media, readStates, pendingOutbox, syncStates] = await Promise.all([
      countForTable('chat_threads'),
      countForTable('chat_participants'),
      countForTable('chat_messages'),
      countForTable('chat_message_media'),
      countForTable('chat_read_states'),
      countForTable('chat_pending_outbox'),
      countForTable('chat_sync_state'),
    ]);

    const messageStatusCounts = await db.getAllAsync<ChatDiagnosticsStatusCountRow>(
      `
        select status, count(*) as count
        from chat_messages
        ${ownerClause}
        group by status
        order by count desc, status asc
      `,
      ...ownerParams,
    );

    const outboxStatusCounts = await db.getAllAsync<ChatDiagnosticsStatusCountRow>(
      `
        select status, count(*) as count
        from chat_pending_outbox
        ${ownerClause}
        group by status
        order by count desc, status asc
      `,
      ...ownerParams,
    );

    const recentThreads = await db.getAllAsync<ChatDiagnosticsRecentThreadRow>(
      `
        select
          id,
          peer_user_id,
          peer_profile_id,
          peer_name,
          last_message_preview,
          last_message_at,
          unread_count,
          is_pinned,
          is_archived,
          local_status
        from chat_threads
        ${ownerClause}
        order by coalesce(last_message_at, created_at, local_updated_at) desc
        limit 10
      `,
      ...ownerParams,
    );

    const pendingOutboxItems = await db.getAllAsync<ChatDiagnosticsOutboxRow>(
      `
        select
          id,
          local_message_id,
          thread_id,
          status,
          attempt_count,
          next_retry_at,
          error_code,
          updated_at
        from chat_pending_outbox
        ${ownerClause}
        order by updated_at desc
        limit 10
      `,
      ...ownerParams,
    );

    const syncStateRows = await db.getAllAsync<ChatDiagnosticsSyncRow>(
      `
        select
          id,
          scope,
          thread_id,
          last_cursor,
          last_synced_at,
          last_error,
          updated_at
        from chat_sync_state
        ${ownerClause}
        order by updated_at desc
        limit 10
      `,
      ...ownerParams,
    );

    return {
      dbName: CHAT_DB_NAME,
      targetSchemaVersion: CHAT_SCHEMA_VERSION,
      actualSchemaVersion: Number(schemaRow?.value ?? 0) || 0,
      ownerUserId: ownerUserId ?? null,
      generatedAt: nowIso(),
      counts: {
        threads,
        participants,
        messages,
        media,
        readStates,
        pendingOutbox,
        syncStates,
      },
      messageStatusCounts: messageStatusCounts.map((row) => ({
        status: row.status,
        count: Number(row.count ?? 0),
      })),
      outboxStatusCounts: outboxStatusCounts.map((row) => ({
        status: row.status,
        count: Number(row.count ?? 0),
      })),
      recentThreads,
      pendingOutboxItems,
      syncStates: syncStateRows,
    };
  },
};
