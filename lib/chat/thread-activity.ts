export const THREAD_ACTIVITY_HEARTBEAT_MS = 25_000;
export const THREAD_ACTIVITY_LEASE_MS = 65_000;
export const THREAD_ACTIVITY_FOREGROUND_REANNOUNCE_DELAYS_MS = [0, 350, 900, 1800] as const;

export const isPeerThreadActivityLeaseFresh = (
  lastActivityAt: number,
  now = Date.now(),
) => lastActivityAt > 0 && now - lastActivityAt <= THREAD_ACTIVITY_LEASE_MS;
