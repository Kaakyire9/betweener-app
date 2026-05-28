import * as SQLite from 'expo-sqlite';

import { CHAT_DB_NAME } from '@/lib/chat/local/chat-schema';
import { runChatMigrations } from '@/lib/chat/local/chat-migrations';
import { captureException, captureMessage } from '@/lib/telemetry/sentry';

export type ChatSQLiteDatabase = SQLite.SQLiteDatabase;

let chatDbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

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
  if (chatDbPromise) return chatDbPromise;

  chatDbPromise = (async () => {
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
      chatDbPromise = null;
      captureException(error, { where: 'initLocalChatDb' });
      throw error;
    }
  })();

  return chatDbPromise;
}

export async function getChatDb(): Promise<SQLite.SQLiteDatabase> {
  return initLocalChatDb();
}

export async function clearChatDataForUser(ownerUserId: string): Promise<void> {
  const db = await getChatDb();
  await db.withExclusiveTransactionAsync(async (txn) => {
    for (const table of CHAT_TABLES_SCOPED_BY_OWNER) {
      await txn.runAsync(`delete from ${table} where owner_user_id = ?`, ownerUserId);
    }
  });
}

export async function resetChatDbForUserSignOut(ownerUserId?: string | null): Promise<void> {
  if (ownerUserId) {
    await clearChatDataForUser(ownerUserId);
    return;
  }

  const existingDb = chatDbPromise ? await chatDbPromise.catch(() => null) : null;
  if (existingDb) {
    await existingDb.closeAsync().catch(() => undefined);
  }
  chatDbPromise = null;
  await SQLite.deleteDatabaseAsync(CHAT_DB_NAME).catch((error) => {
    captureException(error, { where: 'resetChatDbForUserSignOut' });
  });
}
