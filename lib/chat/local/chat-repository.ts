import type {
  ChatMessageRow,
  ChatPendingOutboxRow,
  ChatSyncScope,
  ChatSyncStateRow,
  ChatThreadRow,
} from '@/lib/chat/local/chat-schema';
import { CHAT_DB_NAME, CHAT_SCHEMA_VERSION } from '@/lib/chat/local/chat-schema';
import { getChatMessagePreviewText } from '@/lib/message-preview';
import { getChatDb } from '@/lib/storage/sqlite';

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
  messageStatusCounts: Array<{ status: string; count: number }>;
  outboxStatusCounts: Array<{ status: string; count: number }>;
  recentThreads: ChatDiagnosticsRecentThreadRow[];
  pendingOutboxItems: ChatDiagnosticsOutboxRow[];
  syncStates: ChatDiagnosticsSyncRow[];
};

let writeQueue: Promise<unknown> = Promise.resolve();

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const isDatabaseLockedError = (error: unknown) => {
  const message = String((error as { message?: unknown })?.message ?? error).toLowerCase();
  return message.includes('database is locked') || message.includes('error code 5');
};

const runSerializedWrite = async <T>(task: () => Promise<T>): Promise<T> => {
  const runWithRetry = async () => {
    const retryDelays = [40, 90, 180, 360, 720];
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await task();
      } catch (error) {
        const delay = retryDelays[attempt];
        if (!isDatabaseLockedError(error) || delay == null) {
          throw error;
        }
        await wait(delay);
      }
    }
  };

  const next = writeQueue.then(runWithRetry, runWithRetry);
  writeQueue = next.catch(() => undefined);
  return next;
};

const withExclusiveTransaction = async (
  db: ChatDb,
  task: (txn: ChatDb) => Promise<void>,
) => {
  await runSerializedWrite(async () => {
    await db.withExclusiveTransactionAsync(async (txn) => {
      await task(txn as ChatDb);
    });
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
  thread.title,
  thread.thread_type,
  thread.last_message_id,
  thread.last_message_preview,
  thread.last_message_sender_id,
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
      select id, body, sender_user_id, message_type, status, is_view_once, created_at, remote_updated_at, local_updated_at
      from chat_messages
      where owner_user_id = ?
        and thread_id = ?
        and status <> 'deleted'
      order by datetime(created_at) desc, datetime(local_updated_at) desc
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
        peer_verified, peer_presence_status, title, thread_type, last_message_id,
        last_message_preview, last_message_sender_id, last_message_at, unread_count,
        is_muted, is_pinned, is_archived, local_status, remote_updated_at,
        local_updated_at, created_at
      )
      values (?, ?, ?, null, null, null, 0, null, null, 'direct', ?, ?, ?, ?, ?, 0, 0, 0, 'active', ?, ?, ?)
      on conflict(owner_user_id, id) do update set
        last_message_id = excluded.last_message_id,
        last_message_preview = excluded.last_message_preview,
        last_message_sender_id = excluded.last_message_sender_id,
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
    options?: { includeArchived?: boolean; limit?: number },
  ): Promise<ChatThreadRow[]> {
    const db = await getChatDb();
    const includeArchived = options?.includeArchived === true;
    const limit = Math.max(1, Math.min(options?.limit ?? 200, 500));
    return db.getAllAsync<ChatThreadRow>(
      `
        select *
        from chat_threads
        where owner_user_id = ?
          and local_status = 'active'
          and (? = 1 or is_archived = 0)
        order by is_pinned desc, coalesce(last_message_at, created_at, local_updated_at) desc
        limit ?
      `,
      ownerUserId,
      includeArchived ? 1 : 0,
      limit,
    );
  },

  async getThreadById(ownerUserId: string, threadId: string): Promise<ChatThreadRow | null> {
    const db = await getChatDb();
    return db.getFirstAsync<ChatThreadRow>(
      'select * from chat_threads where owner_user_id = ? and id = ? limit 1',
      ownerUserId,
      threadId,
    );
  },

  async getThreadByPeerProfileId(ownerUserId: string, peerProfileId: string): Promise<ChatThreadRow | null> {
    const db = await getChatDb();
    return db.getFirstAsync<ChatThreadRow>(
      `
        select *
        from chat_threads
        where owner_user_id = ?
          and peer_profile_id = ?
          and local_status = 'active'
        limit 1
      `,
      ownerUserId,
      peerProfileId,
    );
  },

  async upsertThreads(ownerUserId: string, threads: ChatThreadRow[]): Promise<void> {
    if (threads.length === 0) return;
    const db = await getChatDb();
    await withExclusiveTransaction(db, async (txn) => {
      for (const thread of threads) {
        await txn.runAsync(
          `
            insert into chat_threads (
              id, owner_user_id, peer_user_id, peer_profile_id, peer_name, peer_avatar_url,
              peer_verified, peer_presence_status, title, thread_type, last_message_id,
              last_message_preview, last_message_sender_id, last_message_at, unread_count,
              is_muted, is_pinned, is_archived, local_status, remote_updated_at,
              local_updated_at, created_at
            )
            values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            on conflict(owner_user_id, id) do update set
              owner_user_id = excluded.owner_user_id,
              peer_user_id = excluded.peer_user_id,
              peer_profile_id = excluded.peer_profile_id,
              peer_name = excluded.peer_name,
              peer_avatar_url = excluded.peer_avatar_url,
              peer_verified = excluded.peer_verified,
              peer_presence_status = excluded.peer_presence_status,
              title = excluded.title,
              thread_type = excluded.thread_type,
              last_message_id = excluded.last_message_id,
              last_message_preview = excluded.last_message_preview,
              last_message_sender_id = excluded.last_message_sender_id,
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
          ...toThreadParams({ ...thread, owner_user_id: ownerUserId }),
        );
      }
    });
    notify(threadListeners, ownerUserId);
  },

  async getMessages(
    ownerUserId: string,
    threadId: string,
    options?: { limit?: number; before?: string | null },
  ): Promise<ChatMessageRow[]> {
    const db = await getChatDb();
    const limit = Math.max(1, Math.min(options?.limit ?? 50, 200));
    const before = options?.before ?? null;
    const rows = await db.getAllAsync<ChatMessageRow>(
      `
        select *
        from chat_messages
        where owner_user_id = ?
          and thread_id = ?
          and (? is null or created_at < ?)
        order by created_at desc
        limit ?
      `,
      ownerUserId,
      threadId,
      before,
      before,
      limit,
    );
    return rows.reverse();
  },

  async upsertMessages(ownerUserId: string, threadId: string, messages: ChatMessageRow[]): Promise<void> {
    if (messages.length === 0) return;
    const db = await getChatDb();
    await withExclusiveTransaction(db, async (txn) => {
      for (const message of messages) {
        if (message.local_id && !String(message.id).startsWith('temp-')) {
          await txn.runAsync(
            `
              delete from chat_messages
              where owner_user_id = ?
                and thread_id = ?
                and local_id = ?
                and id <> ?
            `,
            ownerUserId,
            threadId,
            message.local_id,
            message.id,
          );
        }
        await txn.runAsync(
          `
            insert into chat_messages (
              id, local_id, thread_id, owner_user_id, sender_user_id, receiver_user_id, body,
              message_type, status, direction, created_at, server_created_at, edited_at,
              deleted_at, reply_to_message_id, is_view_once, local_only, error_code,
              metadata_json, remote_updated_at, local_updated_at
            )
            values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            on conflict(owner_user_id, id) do update set
              local_id = excluded.local_id,
              thread_id = excluded.thread_id,
              owner_user_id = excluded.owner_user_id,
              sender_user_id = excluded.sender_user_id,
              receiver_user_id = excluded.receiver_user_id,
              body = excluded.body,
              message_type = excluded.message_type,
              status = excluded.status,
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
          `,
          ...toMessageParams({ ...message, owner_user_id: ownerUserId, thread_id: threadId }),
        );
      }
      await refreshThreadSummaryFromMessages(txn, ownerUserId, threadId);
    });
    notify(threadListeners, ownerUserId);
    notify(messageListeners, threadMessageKey(ownerUserId, threadId));
  },

  async upsertPendingOutboxItem(ownerUserId: string, item: ChatPendingOutboxRow): Promise<void> {
    const db = await getChatDb();
    await runSerializedWrite(() => db.runAsync(
      `
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
      `,
      ...toOutboxParams({ ...item, owner_user_id: ownerUserId }),
    ));
  },

  async getPendingOutboxItems(ownerUserId: string, options?: { limit?: number }): Promise<ChatPendingOutboxRow[]> {
    const db = await getChatDb();
    const limit = Math.max(1, Math.min(options?.limit ?? 50, 200));
    const staleSendingBefore = new Date(Date.now() - 2 * 60 * 1000).toISOString();
    return db.getAllAsync<ChatPendingOutboxRow>(
      `
        select *
        from chat_pending_outbox
        where owner_user_id = ?
          and (
            status = 'queued'
            or (status = 'sending' and datetime(updated_at) <= datetime(?))
          )
          and (next_retry_at is null or next_retry_at <= ?)
        order by created_at asc
        limit ?
      `,
      ownerUserId,
      staleSendingBefore,
      nowIso(),
      limit,
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
    const thread = await db.getFirstAsync<{ thread_id: string }>(
      `
        select thread_id
        from chat_pending_outbox
        where owner_user_id = ?
          and local_message_id = ?
        limit 1
      `,
      ownerUserId,
      localMessageId,
    );
    const nextMessageStatus = mapOutboxStatusToMessageStatus(status);
    const updatedAt = nowIso();

    await runSerializedWrite(async () => {
      await db.runAsync(
        `
          update chat_pending_outbox
          set status = ?,
              next_retry_at = ?,
              error_code = ?,
              error_message = ?,
              updated_at = ?
          where owner_user_id = ?
            and local_message_id = ?
        `,
        status,
        status === 'queued' ? options?.nextRetryAt ?? null : null,
        error?.code ?? null,
        error?.message ?? null,
        updatedAt,
        ownerUserId,
        localMessageId,
      );

      if (nextMessageStatus) {
        await db.runAsync(
          `
            update chat_messages
            set status = ?,
                error_code = ?,
                local_only = ?,
                local_updated_at = ?
            where owner_user_id = ?
              and (local_id = ? or id = ?)
          `,
          nextMessageStatus,
          error?.code ?? null,
          status === 'sent' ? 0 : 1,
          updatedAt,
          ownerUserId,
          localMessageId,
          localMessageId,
        );
      }
    });

    if (thread?.thread_id) {
      notify(threadListeners, ownerUserId);
      notify(messageListeners, threadMessageKey(ownerUserId, thread.thread_id));
    }
  },

  async markOutboxItemAttempting(ownerUserId: string, localMessageId: string): Promise<void> {
    const db = await getChatDb();
    const thread = await db.getFirstAsync<{ thread_id: string }>(
      `
        select thread_id
        from chat_pending_outbox
        where owner_user_id = ?
          and local_message_id = ?
        limit 1
      `,
      ownerUserId,
      localMessageId,
    );
    const updatedAt = nowIso();

    await runSerializedWrite(async () => {
      await db.runAsync(
        `
          update chat_pending_outbox
          set status = 'sending',
              attempt_count = attempt_count + 1,
              next_retry_at = null,
              error_code = null,
              error_message = null,
              updated_at = ?
          where owner_user_id = ?
            and local_message_id = ?
        `,
        updatedAt,
        ownerUserId,
        localMessageId,
      );

      await db.runAsync(
        `
          update chat_messages
          set status = 'sending',
              error_code = null,
              local_only = 1,
              local_updated_at = ?
          where owner_user_id = ?
            and (local_id = ? or id = ?)
        `,
        updatedAt,
        ownerUserId,
        localMessageId,
        localMessageId,
      );
    });

    if (thread?.thread_id) {
      notify(threadListeners, ownerUserId);
      notify(messageListeners, threadMessageKey(ownerUserId, thread.thread_id));
    }
  },

  async markThreadRead(ownerUserId: string, threadId: string): Promise<void> {
    const db = await getChatDb();
    await withExclusiveTransaction(db, async (txn) => {
      const now = nowIso();
      const latestRead = await txn.getFirstAsync<{ id: string; created_at: string }>(
        `
          select id, created_at
          from chat_messages
          where owner_user_id = ?
            and thread_id = ?
            and direction = 'incoming'
            and status <> 'deleted'
          order by datetime(created_at) desc, datetime(local_updated_at) desc
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
    });
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
    await withExclusiveTransaction(db, async (txn) => {
      await txn.runAsync(
        `
          update chat_messages
          set status = ?,
              local_updated_at = ?
          where owner_user_id = ?
            and thread_id = ?
            and id = ?
            and direction = 'outgoing'
            and status <> 'deleted'
        `,
        status,
        nowIso(),
        ownerUserId,
        threadId,
        messageId,
      );
      await refreshThreadSummaryFromMessages(txn, ownerUserId, threadId);
    });
    notify(threadListeners, ownerUserId);
    notify(messageListeners, threadMessageKey(ownerUserId, threadId));
  },

  async deleteMessages(ownerUserId: string, threadId: string, messageIds: string[]): Promise<void> {
    const ids = Array.from(new Set(messageIds.filter(Boolean)));
    if (ids.length === 0) return;
    const db = await getChatDb();
    const placeholders = ids.map(() => '?').join(',');
    await withExclusiveTransaction(db, async (txn) => {
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
    });
    notify(threadListeners, ownerUserId);
    notify(messageListeners, threadMessageKey(ownerUserId, threadId));
  },

  async clearThreadMessages(ownerUserId: string, threadId: string): Promise<void> {
    const db = await getChatDb();
    await withExclusiveTransaction(db, async (txn) => {
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
    });
    notify(threadListeners, ownerUserId);
    notify(messageListeners, threadMessageKey(ownerUserId, threadId));
  },

  async hideThreadForUser(ownerUserId: string, threadId: string): Promise<void> {
    const db = await getChatDb();
    await withExclusiveTransaction(db, async (txn) => {
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
    });
    notify(threadListeners, ownerUserId);
    notify(messageListeners, threadMessageKey(ownerUserId, threadId));
  },

  async getSyncState(
    ownerUserId: string,
    scope: ChatSyncScope,
    threadId?: string | null,
  ): Promise<ChatSyncStateRow | null> {
    const db = await getChatDb();
    return db.getFirstAsync<ChatSyncStateRow>(
      `
        select *
        from chat_sync_state
        where owner_user_id = ?
          and scope = ?
          and coalesce(thread_id, '') = coalesce(?, '')
        limit 1
      `,
      ownerUserId,
      scope,
      threadId ?? null,
    );
  },

  async markSyncSucceeded(
    ownerUserId: string,
    scope: ChatSyncScope,
    options?: { threadId?: string | null; cursor?: string | null; syncedAt?: string | null },
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
    await runSerializedWrite(() => db.runAsync(
      `
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
      `,
      ...toSyncStateParams(state),
    ));
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
    ));
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
