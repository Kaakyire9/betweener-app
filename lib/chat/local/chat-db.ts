export {
  clearChatDataForUser,
  getChatDb,
  initLocalChatDb,
  resetChatDbForUserSignOut,
  type ChatSQLiteDatabase,
} from '@/lib/storage/sqlite';

export {
  getChatSchemaVersion,
  runChatMigrations,
  setChatSchemaVersion,
} from '@/lib/chat/local/chat-migrations';

export { ChatRepository } from '@/lib/chat/local/chat-repository';

export { migrateAsyncChatSnapshotsToSQLite } from '@/lib/chat/local/chat-snapshot-migration';

export {
  CHAT_DB_NAME,
  CHAT_SCHEMA_VERSION,
  type ChatMediaUploadStatus,
  type ChatMessageDirection,
  type ChatMessageRow,
  type ChatMessageStatus,
  type ChatMessageType,
  type ChatOutboxStatus,
  type ChatPendingOutboxRow,
  type ChatSyncScope,
  type ChatSyncStateRow,
  type ChatThreadLocalStatus,
  type ChatThreadRow,
  type ChatThreadType,
} from '@/lib/chat/local/chat-schema';
