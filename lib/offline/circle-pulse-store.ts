import { readOfflineState, writeOfflineEnvelope, type OfflineReadState } from '@/lib/offline/core';
import type { CirclePulseItem } from '@/lib/circles/pulse/circle-pulse-types';

const CIRCLE_PULSE_SNAPSHOT_VERSION = 1;
const CIRCLE_PULSE_STALE_AFTER_MS = 10 * 60 * 1000;

const buildLegacyCirclePulseSnapshotStoreKey = (circleId: string) =>
  `offline:circles:pulse:v${CIRCLE_PULSE_SNAPSHOT_VERSION}:${circleId}`;

export const buildCirclePulseSnapshotStoreKey = (
  circleId: string,
  viewerProfileId?: string | null,
) => `offline:circles:pulse:v${CIRCLE_PULSE_SNAPSHOT_VERSION}:${viewerProfileId || 'viewer'}:${circleId}`;

export async function readCirclePulseSnapshotState(
  circleId: string,
  viewerProfileId?: string | null,
): Promise<OfflineReadState<CirclePulseItem[]>> {
  const scopedState = await readOfflineState<CirclePulseItem[]>(
    buildCirclePulseSnapshotStoreKey(circleId, viewerProfileId),
  );
  if (scopedState.data) return scopedState;
  return readOfflineState<CirclePulseItem[]>(buildLegacyCirclePulseSnapshotStoreKey(circleId));
}

export async function writeCirclePulseSnapshot(
  circleId: string,
  viewerProfileId: string | null | undefined,
  items: CirclePulseItem[],
  options?: { staleAfterMs?: number },
): Promise<void> {
  await writeOfflineEnvelope(buildCirclePulseSnapshotStoreKey(circleId, viewerProfileId), items, {
    kind: 'circle-pulse-snapshot',
    staleAfterMs: options?.staleAfterMs ?? CIRCLE_PULSE_STALE_AFTER_MS,
  });
}
