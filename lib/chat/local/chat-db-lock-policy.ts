import type { ChatOperationPriority } from '@/lib/chat/local/priority-operation-scheduler';

export const CHAT_DB_BUSY_TIMEOUT_MS = 500;

// Sending must durably commit the optimistic message and its outbox command
// together. A background JS runtime can briefly own SQLite's writer lock, so
// this path waits longer than cache/sync work without changing their budgets.
export const CHAT_DB_DURABLE_ENQUEUE_LOCK_RETRY_DELAYS = [
  25,
  75,
  150,
  300,
  600,
  1_000,
  1_500,
  2_500,
] as const;

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
