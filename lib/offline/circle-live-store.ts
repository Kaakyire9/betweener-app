import { readOfflineState, writeOfflineEnvelope, type OfflineReadState } from '@/lib/offline/core';
import type { CircleLiveSnapshot } from '@/features/live/application';

const CIRCLE_LIVE_SNAPSHOT_VERSION = 1;
const CIRCLE_LIVE_STALE_AFTER_MS = 5 * 60 * 1000;

export const buildCircleLiveSnapshotStoreKey = (circleId: string, accountId: string) =>
  `offline:circles:live:v${CIRCLE_LIVE_SNAPSHOT_VERSION}:${accountId}:${circleId}`;

export async function readCircleLiveSnapshotState(
  circleId: string,
  accountId?: string | null,
): Promise<OfflineReadState<CircleLiveSnapshot>> {
  if (!accountId) {
    return { data: null, savedAt: null, staleAt: null, isStale: false };
  }
  return readOfflineState<CircleLiveSnapshot>(buildCircleLiveSnapshotStoreKey(circleId, accountId));
}

export async function writeCircleLiveSnapshot(
  circleId: string,
  accountId: string | null | undefined,
  snapshot: CircleLiveSnapshot,
): Promise<void> {
  if (!accountId) return;
  await writeOfflineEnvelope(buildCircleLiveSnapshotStoreKey(circleId, accountId), snapshot, {
    kind: 'circle-live-snapshot',
    staleAfterMs: CIRCLE_LIVE_STALE_AFTER_MS,
  });
}
