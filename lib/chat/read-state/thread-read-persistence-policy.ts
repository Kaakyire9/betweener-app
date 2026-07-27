export type ThreadReadPersistenceSnapshot = {
  threadUnreadCount: number;
  hasUnreadIncoming: boolean;
  hasReadState: boolean;
};

/**
 * Avoids opening an exclusive SQLite transaction when the local thread is
 * already durably read. Missing snapshots/read-state rows are repaired.
 */
export const shouldPersistThreadReadState = (
  snapshot: ThreadReadPersistenceSnapshot | null,
) =>
  snapshot === null ||
  snapshot.threadUnreadCount > 0 ||
  snapshot.hasUnreadIncoming ||
  !snapshot.hasReadState;
