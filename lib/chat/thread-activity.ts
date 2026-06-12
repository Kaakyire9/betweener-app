export const THREAD_ACTIVITY_HEARTBEAT_MS = 55_000;
export const THREAD_ACTIVITY_LEASE_MS = 125_000;
export const THREAD_ACTIVITY_FOREGROUND_REANNOUNCE_DELAYS_MS = [0, 750] as const;

export const isPeerThreadActivityLeaseFresh = (
  lastActivityAt: number,
  now = Date.now(),
) => lastActivityAt > 0 && now - lastActivityAt <= THREAD_ACTIVITY_LEASE_MS;
