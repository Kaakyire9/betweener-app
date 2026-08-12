export type PresenceWriteExecutor = (
  scopeKey: string,
  online: boolean,
) => Promise<boolean>;

type PresenceWriteJob = {
  scopeKey: string;
  online: boolean;
  execute: PresenceWriteExecutor;
};

type CreatePresenceWriteCoordinatorOptions = {
  minimumOnlineRefreshMs?: number;
  now?: () => number;
};

/**
 * Serializes presence writes and collapses concurrent lifecycle signals to the
 * latest requested state. Offline writes are idempotent; online heartbeats may
 * refresh after the configured interval.
 */
export const createPresenceWriteCoordinator = ({
  minimumOnlineRefreshMs = 5_000,
  now = Date.now,
}: CreatePresenceWriteCoordinatorOptions = {}) => {
  let pending: PresenceWriteJob | null = null;
  let inFlight: Promise<void> | null = null;
  let committedScopeKey: string | null = null;
  let committedOnline: boolean | null = null;
  let committedAt = 0;

  const shouldSkip = (job: PresenceWriteJob) => {
    if (committedScopeKey !== job.scopeKey || committedOnline !== job.online) {
      return false;
    }
    if (!job.online) return true;
    return now() - committedAt < minimumOnlineRefreshMs;
  };

  const drain = async () => {
    while (pending) {
      const job = pending;
      pending = null;
      if (shouldSkip(job)) continue;

      const committed = await job.execute(job.scopeKey, job.online);
      if (!committed) continue;

      committedScopeKey = job.scopeKey;
      committedOnline = job.online;
      committedAt = now();
    }
  };

  const request = (
    scopeKey: string,
    online: boolean,
    execute: PresenceWriteExecutor,
  ): Promise<void> => {
    pending = { scopeKey, online, execute };
    if (!inFlight) {
      inFlight = drain().finally(() => {
        inFlight = null;
      });
    }
    return inFlight;
  };

  return { request };
};
