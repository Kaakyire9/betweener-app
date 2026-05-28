import { readOfflineData, writeOfflineEnvelope } from '@/lib/offline/core';
import type { VibesSegment } from '@/lib/vibes/discovery-logic';
import type { MomentRelationshipContext } from '@/types/moment-context';
import type { Match } from '@/types/match';

const VIBES_SNAPSHOT_VERSION = 1;
const VIBES_MOMENT_CONTEXT_VERSION = 1;

const buildVibesSnapshotStoreKey = (userId: string, segment: VibesSegment) =>
  `offline:vibes:snapshot:v${VIBES_SNAPSHOT_VERSION}:${userId}:${segment}`;
const buildVibesMomentContextStoreKey = (profileId: string) =>
  `offline:vibes:moment-context:v${VIBES_MOMENT_CONTEXT_VERSION}:${profileId}`;

export type OfflineVibesMomentContextSnapshot = {
  priorityProfileIds: string[];
  contextByProfileId: Record<string, MomentRelationshipContext>;
};

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

export async function readVibesMomentContextSnapshot(
  profileId: string,
): Promise<OfflineVibesMomentContextSnapshot | null> {
  return readOfflineData<OfflineVibesMomentContextSnapshot>(buildVibesMomentContextStoreKey(profileId));
}

export async function writeVibesMomentContextSnapshot(
  profileId: string,
  snapshot: OfflineVibesMomentContextSnapshot,
): Promise<void> {
  await writeOfflineEnvelope(buildVibesMomentContextStoreKey(profileId), snapshot, {
    kind: 'vibes:moment-context',
  });
}
