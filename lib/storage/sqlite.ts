import * as SQLite from 'expo-sqlite';
import { Platform } from 'react-native';

import { CHAT_DB_NAME } from '@/lib/chat/local/chat-schema';
import { runChatMigrations } from '@/lib/chat/local/chat-migrations';
import {
  type ChatOperationPriority,
  createPriorityOperationScheduler,
  type PriorityOperationScheduler,
} from '@/lib/chat/local/priority-operation-scheduler';
import {
  CHAT_DB_BUSY_TIMEOUT_MS,
  getChatDbLockRetryDelays,
} from '@/lib/chat/local/chat-db-lock-policy';
import { captureException, captureMessage } from '@/lib/telemetry/sentry';

export type ChatSQLiteDatabase = SQLite.SQLiteDatabase;
export type ChatDbOperationOptions = {
  priority?: ChatOperationPriority;
  label?: string;
};

type ChatDbRuntime = {
  dbPromise: Promise<SQLite.SQLiteDatabase> | null;
  operationQueue?: Promise<unknown>;
  operationScheduler?: PriorityOperationScheduler;
};

const CHAT_DB_RUNTIME_KEY = '__betweenerChatDbRuntime';
const globalWithChatDbRuntime = globalThis as typeof globalThis & {
  [CHAT_DB_RUNTIME_KEY]?: ChatDbRuntime;
};
const chatDbRuntime =
  globalWithChatDbRuntime[CHAT_DB_RUNTIME_KEY] ??
  (globalWithChatDbRuntime[CHAT_DB_RUNTIME_KEY] = {
    dbPromise: null,
    operationQueue: Promise.resolve(),
  });

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const isChatDatabaseLockedError = (error: unknown) => {
  const message = String((error as { message?: unknown })?.message ?? error).toLowerCase();
  return message.includes('database is locked') || message.includes('error code 5');
};

const recoverInterruptedChatDbTransaction = async () => {
  const db = chatDbRuntime.dbPromise ? await chatDbRuntime.dbPromise.catch(() => null) : null;
  if (!db || !(await db.isInTransactionAsync().catch(() => false))) return false;
  await db.execAsync('ROLLBACK').catch(() => undefined);
  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    console.log('[chat][db] interrupted-transaction-recovered');
  }
  return true;
};

const getOperationScheduler = () => {
  if (chatDbRuntime.operationScheduler) return chatDbRuntime.operationScheduler;

  // A hot reload can retain work queued by the previous implementation. Keep it
  // as a one-time barrier so the new scheduler never overlaps that operation.
  const legacyQueueBarrier = chatDbRuntime.operationQueue?.catch(() => undefined);
  const scheduler = createPriorityOperationScheduler();
  chatDbRuntime.operationScheduler = scheduler;

  if (!legacyQueueBarrier) return scheduler;

  return {
    ...scheduler,
    schedule<T>(task: () => Promise<T>, priority?: ChatOperationPriority) {
      return scheduler.schedule(async () => {
        await legacyQueueBarrier;
        return task();
      }, priority);
    },
  };
};

export async function runSerializedChatDbOperation<T>(
  task: () => Promise<T>,
  options: ChatDbOperationOptions = {},
): Promise<T> {
  const queuedAt = Date.now();
  let executionStartedAt = queuedAt;
  const runWithRetry = async () => {
    executionStartedAt = Date.now();
    const priority = options.priority ?? 'normal';
    const retryDelays = getChatDbLockRetryDelays(priority);
    try {
      for (let attempt = 0; ; attempt += 1) {
        try {
          return await task();
        } catch (error) {
          const delay = retryDelays[attempt];
          if (!isChatDatabaseLockedError(error)) {
            throw error;
          }
          await recoverInterruptedChatDbTransaction();
          if (delay == null) throw error;
          await wait(delay);
        }
      }
    } finally {
      const completedAt = Date.now();
      const queueWaitMs = executionStartedAt - queuedAt;
      const executionMs = completedAt - executionStartedAt;
      if (
        typeof __DEV__ !== 'undefined' &&
        __DEV__ &&
        (queueWaitMs >= 250 || executionMs >= 500)
      ) {
        console.log('[chat][db] operation-slow', {
          label: options.label ?? 'unlabelled',
          priority: options.priority ?? 'normal',
          queueWaitMs,
          executionMs,
        });
      }
    }
  };

  return getOperationScheduler().schedule(runWithRetry, options.priority);
}

export async function withSerializedChatDbTransaction(
  task: (db: SQLite.SQLiteDatabase) => Promise<void>,
  options: ChatDbOperationOptions = {},
): Promise<void> {
  const db = await getChatDb();
  await runSerializedChatDbOperation(async () => {
    if (Platform.OS === 'ios') {
      await db.withExclusiveTransactionAsync(task);
      return;
    }
    await db.withTransactionAsync(async () => {
      await task(db);
    });
  }, options);
}

const CHAT_TABLES_SCOPED_BY_OWNER = [
  'chat_message_media',
  'chat_messages',
  'chat_pending_outbox',
  'chat_read_states',
  'chat_participants',
  'chat_threads',
  'chat_sync_state',
] as const;

export async function initLocalChatDb(): Promise<SQLite.SQLiteDatabase> {
  if (chatDbRuntime.dbPromise) return chatDbRuntime.dbPromise;

  chatDbRuntime.dbPromise = (async () => {
    captureMessage('chat_db_init_started');
    try {
      const db = await SQLite.openDatabaseAsync(CHAT_DB_NAME);
      await db.execAsync(`
        pragma journal_mode = WAL;
        pragma busy_timeout = ${CHAT_DB_BUSY_TIMEOUT_MS};
        pragma foreign_keys = on;
      `);
      await runChatMigrations(db);
      captureMessage('chat_db_init_succeeded');
      return db;
    } catch (error) {
      chatDbRuntime.dbPromise = null;
      captureException(error, { where: 'initLocalChatDb' });
      throw error;
    }
  })();

  return chatDbRuntime.dbPromise;
}

export async function getChatDb(): Promise<SQLite.SQLiteDatabase> {
  return initLocalChatDb();
}

export async function clearChatDataForUser(ownerUserId: string): Promise<void> {
  await withSerializedChatDbTransaction(async (db) => {
    for (const table of CHAT_TABLES_SCOPED_BY_OWNER) {
      await db.runAsync(`delete from ${table} where owner_user_id = ?`, ownerUserId);
    }
  }, { priority: 'user-blocking', label: 'clear-user-chat-data' });
}

export async function resetChatDbForUserSignOut(ownerUserId?: string | null): Promise<void> {
  if (ownerUserId) {
    await clearChatDataForUser(ownerUserId);
    return;
  }

  await runSerializedChatDbOperation(async () => {
    const existingDb = chatDbRuntime.dbPromise
      ? await chatDbRuntime.dbPromise.catch(() => null)
      : null;
    if (existingDb) {
      await existingDb.closeAsync().catch(() => undefined);
    }
    chatDbRuntime.dbPromise = null;
    await SQLite.deleteDatabaseAsync(CHAT_DB_NAME).catch((error) => {
      captureException(error, { where: 'resetChatDbForUserSignOut' });
    });
  }, { priority: 'user-blocking', label: 'reset-chat-database' });
}
