import { readOfflineState, writeOfflineEnvelope, type OfflineReadState } from '@/lib/offline/core';
import type { CirclePulseItem } from '@/lib/circles/pulse/circle-pulse-types';

const CIRCLE_PULSE_SNAPSHOT_VERSION = 1;
const CIRCLE_PULSE_STALE_AFTER_MS = 10 * 60 * 1000;

export const buildCirclePulseSnapshotStoreKey = (circleId: string) =>
  `offline:circles:pulse:v${CIRCLE_PULSE_SNAPSHOT_VERSION}:${circleId}`;

export async function readCirclePulseSnapshotState(
  circleId: string,
): Promise<OfflineReadState<CirclePulseItem[]>> {
  return readOfflineState<CirclePulseItem[]>(buildCirclePulseSnapshotStoreKey(circleId));
}

export async function writeCirclePulseSnapshot(
  circleId: string,
  items: CirclePulseItem[],
  options?: { staleAfterMs?: number },
): Promise<void> {
  await writeOfflineEnvelope(buildCirclePulseSnapshotStoreKey(circleId), items, {
    kind: 'circle-pulse-snapshot',
    staleAfterMs: options?.staleAfterMs ?? CIRCLE_PULSE_STALE_AFTER_MS,
  });
}
