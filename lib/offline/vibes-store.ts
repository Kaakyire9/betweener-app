import { readOfflineData, writeOfflineEnvelope } from '@/lib/offline/core';
import type { VibesSegment } from '@/lib/vibes/discovery-logic';
import type { Match } from '@/types/match';

const VIBES_SNAPSHOT_VERSION = 1;

const buildVibesSnapshotStoreKey = (userId: string, segment: VibesSegment) =>
  `offline:vibes:snapshot:v${VIBES_SNAPSHOT_VERSION}:${userId}:${segment}`;

export async function readVibesSnapshot(
  userId: string,
  segment: VibesSegment,
): Promise<Match[] | null> {
  return readOfflineData<Match[]>(buildVibesSnapshotStoreKey(userId, segment));
}

export async function writeVibesSnapshot(
  userId: string,
  segment: VibesSegment,
  matches: Match[],
): Promise<void> {
  await writeOfflineEnvelope(buildVibesSnapshotStoreKey(userId, segment), matches, {
    kind: `vibes:${segment}`,
  });
}
