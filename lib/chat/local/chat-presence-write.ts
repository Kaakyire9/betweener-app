export type ChatThreadPresenceUpdate = {
  threadId: string;
  online?: boolean | null;
  lastActive?: string | null;
};

/** Builds one account-scoped atomic statement for a deduplicated presence batch. */
export const buildThreadPresenceBatchWrite = (
  ownerUserId: string,
  updates: ChatThreadPresenceUpdate[],
  updatedAt: string,
) => {
  const latestByThread = new Map(updates.map((update) => [update.threadId, update]));
  const normalizedUpdates = [...latestByThread.values()].filter((update) => update.threadId);
  if (normalizedUpdates.length === 0) return null;

  const statusCases: string[] = [];
  const lastActiveCases: string[] = [];
  const statusParams: (string | null)[] = [];
  const lastActiveParams: (string | null)[] = [];
  const threadIds: string[] = [];

  normalizedUpdates.forEach((update) => {
    statusCases.push('when ? then ?');
    statusParams.push(
      update.threadId,
      update.online === true ? 'online' : update.online === false ? 'offline' : null,
    );
    lastActiveCases.push('when ? then coalesce(?, peer_last_active)');
    lastActiveParams.push(update.threadId, update.lastActive ?? null);
    threadIds.push(update.threadId);
  });

  return {
    query: `
      update chat_threads
      set peer_presence_status = case id ${statusCases.join(' ')} else peer_presence_status end,
          peer_last_active = case id ${lastActiveCases.join(' ')} else peer_last_active end,
          local_updated_at = ?
      where owner_user_id = ?
        and id in (${threadIds.map(() => '?').join(', ')})
    `,
    params: [
      ...statusParams,
      ...lastActiveParams,
      updatedAt,
      ownerUserId,
      ...threadIds,
    ],
    updateCount: normalizedUpdates.length,
  };
};
