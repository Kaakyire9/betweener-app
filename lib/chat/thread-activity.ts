export const THREAD_ACTIVITY_HEARTBEAT_MS = 55_000;
export const THREAD_ACTIVITY_LEASE_MS = 125_000;
export const THREAD_ACTIVITY_FOREGROUND_REANNOUNCE_DELAYS_MS = [0, 750] as const;
export const THREAD_REALTIME_RECONNECT_DELAYS_MS = [750, 2_000, 5_000, 10_000] as const;

export const getThreadRealtimeReconnectDelayMs = (attempt: number) =>
  THREAD_REALTIME_RECONNECT_DELAYS_MS[
    Math.max(0, Math.min(attempt, THREAD_REALTIME_RECONNECT_DELAYS_MS.length - 1))
  ];

export const isPeerThreadActivityLeaseFresh = (
  lastActivityAt: number,
  now = Date.now(),
) => lastActivityAt > 0 && now - lastActivityAt <= THREAD_ACTIVITY_LEASE_MS;
