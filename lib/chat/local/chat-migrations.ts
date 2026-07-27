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

async function addColumnIfMissing(db: SQLiteDatabase, table: string, column: string, definition: string) {
  const columns = await db.getAllAsync<{ name: string }>(`pragma table_info(${table})`);
  if (columns.some((entry) => entry.name === column)) return;
  await db.execAsync(`alter table ${table} add column ${column} ${definition}`);
}

async function runV2Migration(db: SQLiteDatabase): Promise<void> {
  await db.withTransactionAsync(async () => {
    await addColumnIfMissing(db, 'chat_threads', 'peer_last_active', 'text null');
    await addColumnIfMissing(db, 'chat_threads', 'last_message_status', 'text null');
    await db.execAsync(`
      update chat_threads
      set peer_user_id = id
      where thread_type = 'direct'
        and (peer_user_id is null or peer_user_id <> id);
    `);
    await setChatSchemaVersion(db, 2);
  });
}

async function runV3Migration(db: SQLiteDatabase): Promise<void> {
  await db.withTransactionAsync(async () => {
    await addColumnIfMissing(db, 'chat_threads', 'last_message_edited_at', 'text null');
    await addColumnIfMissing(db, 'chat_threads', 'last_message_reaction_emoji', 'text null');
    await addColumnIfMissing(db, 'chat_threads', 'last_message_reaction_user_id', 'text null');
    await addColumnIfMissing(db, 'chat_threads', 'last_message_reaction_created_at', 'text null');
    await addColumnIfMissing(db, 'chat_threads', 'last_message_reaction_target_type', 'text null');
    await setChatSchemaVersion(db, 3);
  });
}

async function runV4Migration(db: SQLiteDatabase): Promise<void> {
  await db.withTransactionAsync(async () => {
    await addColumnIfMissing(db, 'chat_threads', 'last_activity_kind', 'text null');
    await addColumnIfMissing(db, 'chat_threads', 'last_activity_message_id', 'text null');
    await addColumnIfMissing(db, 'chat_threads', 'last_activity_preview', 'text null');
    await addColumnIfMissing(db, 'chat_threads', 'last_activity_at', 'text null');
    await setChatSchemaVersion(db, 4);
  });
}

async function runV5Migration(db: SQLiteDatabase): Promise<void> {
  await db.withTransactionAsync(async () => {
    await db.execAsync(`
      create index if not exists idx_chat_threads_active_list
        on chat_threads(
          owner_user_id,
          local_status,
          is_pinned desc,
          coalesce(last_message_at, created_at, local_updated_at) desc
        );
      create index if not exists idx_chat_threads_active_archived_list
        on chat_threads(
          owner_user_id,
          local_status,
          is_archived,
          is_pinned desc,
          coalesce(last_message_at, created_at, local_updated_at) desc
        );
      create index if not exists idx_chat_sync_state_owner_scope_thread
        on chat_sync_state(owner_user_id, scope, thread_id);
    `);
    await setChatSchemaVersion(db, 5);
  });
}

async function runV6Migration(db: SQLiteDatabase): Promise<void> {
  await db.withTransactionAsync(async () => {
    await db.execAsync(`
      create index if not exists idx_chat_messages_thread_incoming_created
        on chat_messages(
          owner_user_id,
          thread_id,
          direction,
          created_at desc,
          local_updated_at desc
        );
    `);
    await setChatSchemaVersion(db, 6);
  });
}

async function runV7Migration(db: SQLiteDatabase): Promise<void> {
  await db.withTransactionAsync(async () => {
    await db.execAsync(`
      create index if not exists idx_chat_pending_outbox_owner_local_message
        on chat_pending_outbox(owner_user_id, local_message_id);
      create index if not exists idx_chat_pending_outbox_queued_due
        on chat_pending_outbox(owner_user_id, next_retry_at, created_at)
        where status = 'queued';
      create index if not exists idx_chat_pending_outbox_sending_due
        on chat_pending_outbox(owner_user_id, updated_at, next_retry_at, created_at)
        where status = 'sending';
    `);
    await setChatSchemaVersion(db, 7);
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
    if (currentVersion < 2) {
      await runV2Migration(db);
    }
    if (currentVersion < 3) {
      await runV3Migration(db);
    }
    if (currentVersion < 4) {
      await runV4Migration(db);
    }
    if (currentVersion < 5) {
      await runV5Migration(db);
    }
    if (currentVersion < 6) {
      await runV6Migration(db);
    }
    if (currentVersion < 7) {
      await runV7Migration(db);
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
