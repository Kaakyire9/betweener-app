export const LIVE_HEARTBEAT_INTERVAL_MS = 30_000;
export const LIVE_REALTIME_COALESCE_MS = 250;
export const LIVE_FALLBACK_CHECK_INTERVAL_MS = 60_000;
export const LIVE_FULL_SNAPSHOT_STALE_MS = 5 * 60_000;

export const shouldRefreshLiveSnapshot = ({
  realtimeHealthy,
  lastFullRefreshAt,
  now,
}: {
  realtimeHealthy: boolean;
  lastFullRefreshAt: number;
  now: number;
}) => !realtimeHealthy || now - lastFullRefreshAt >= LIVE_FULL_SNAPSHOT_STALE_MS;
