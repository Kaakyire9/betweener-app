import * as SQLite from 'expo-sqlite';

import { CHAT_DB_NAME } from '@/lib/chat/local/chat-schema';
import { runChatMigrations } from '@/lib/chat/local/chat-migrations';
import { captureException, captureMessage } from '@/lib/telemetry/sentry';

export type ChatSQLiteDatabase = SQLite.SQLiteDatabase;

type ChatDbRuntime = {
  dbPromise: Promise<SQLite.SQLiteDatabase> | null;
  operationQueue: Promise<unknown>;
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

const isDatabaseLockedError = (error: unknown) => {
  const message = String((error as { message?: unknown })?.message ?? error).toLowerCase();
  return message.includes('database is locked') || message.includes('error code 5');
};

export async function runSerializedChatDbOperation<T>(task: () => Promise<T>): Promise<T> {
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

  const next = chatDbRuntime.operationQueue.then(runWithRetry, runWithRetry);
  chatDbRuntime.operationQueue = next.catch(() => undefined);
  return next;
}

export async function withSerializedChatDbTransaction(
  task: (db: SQLite.SQLiteDatabase) => Promise<void>,
): Promise<void> {
  const db = await getChatDb();
  await runSerializedChatDbOperation(async () => {
    await db.withTransactionAsync(async () => {
      await task(db);
    });
  });
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
        pragma busy_timeout = 5000;
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
  });
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
  });
}
