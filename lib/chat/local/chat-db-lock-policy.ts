import type { ChatOperationPriority } from '@/lib/chat/local/priority-operation-scheduler';

export const CHAT_DB_BUSY_TIMEOUT_MS = 500;

export const getChatDbLockRetryDelays = (
  priority: ChatOperationPriority,
): readonly number[] => {
  switch (priority) {
    case 'user-blocking':
      return [25, 75, 150, 300, 600];
    case 'normal':
      return [50, 150, 300];
    case 'background':
      // Best-effort cache writes must never hold the foreground queue while
      // another SQLite connection owns the writer lock.
      return [];
  }
};
