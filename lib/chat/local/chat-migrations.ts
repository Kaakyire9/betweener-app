import type { SQLiteDatabase } from 'expo-sqlite';

import { CHAT_SCHEMA_SQL, CHAT_SCHEMA_VERSION } from '@/lib/chat/local/chat-schema';
import { captureException, captureMessage } from '@/lib/telemetry/sentry';

const SCHEMA_VERSION_KEY = 'chat_schema_version';

export async function getChatSchemaVersion(db: SQLiteDatabase): Promise<number> {
  await db.execAsync(`
    create table if not exists local_schema_meta (
      key text primary key,
      value text not null,
      updated_at text not null
    );
  `);

  const row = await db.getFirstAsync<{ value: string }>(
    'select value from local_schema_meta where key = ? limit 1',
    SCHEMA_VERSION_KEY,
  );
  const version = Number(row?.value ?? 0);
  return Number.isFinite(version) ? version : 0;
}

export async function setChatSchemaVersion(db: SQLiteDatabase, version: number): Promise<void> {
  await db.runAsync(
    `
      insert or replace into local_schema_meta (key, value, updated_at)
      values (?, ?, ?)
    `,
    SCHEMA_VERSION_KEY,
    String(version),
    new Date().toISOString(),
  );
}

async function runV1Migration(db: SQLiteDatabase): Promise<void> {
  await db.withTransactionAsync(async () => {
    await db.execAsync(CHAT_SCHEMA_SQL);
    await setChatSchemaVersion(db, 1);
  });
}

export async function runChatMigrations(db: SQLiteDatabase): Promise<void> {
  try {
    const currentVersion = await getChatSchemaVersion(db);
    if (currentVersion >= CHAT_SCHEMA_VERSION) return;

    captureMessage('chat_db_migration_started', {
      currentVersion,
      targetVersion: CHAT_SCHEMA_VERSION,
    });

    if (currentVersion < 1) {
      await runV1Migration(db);
    }

    captureMessage('chat_db_migration_succeeded', {
      fromVersion: currentVersion,
      toVersion: CHAT_SCHEMA_VERSION,
    });
  } catch (error) {
    captureException(error, { where: 'runChatMigrations' });
    throw error;
  }
}
