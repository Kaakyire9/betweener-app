import type { RelationshipCompass } from '@/lib/relationship-compass';
import { readOfflineData, updateOfflineEnvelope } from '@/lib/offline/core';

const RELATIONSHIP_COMPASS_SNAPSHOT_VERSION = 1;

const buildRelationshipCompassSnapshotKey = (profileId: string) =>
  `offline:relationship-compass:v${RELATIONSHIP_COMPASS_SNAPSHOT_VERSION}:${profileId}`;

export async function readRelationshipCompassSnapshot(
  profileId: string,
): Promise<RelationshipCompass | null> {
  return readOfflineData<RelationshipCompass>(buildRelationshipCompassSnapshotKey(profileId));
}

export async function writeRelationshipCompassSnapshot(
  profileId: string,
  compass: RelationshipCompass,
): Promise<RelationshipCompass | null> {
  return updateOfflineEnvelope<RelationshipCompass>(
    buildRelationshipCompassSnapshotKey(profileId),
    () => compass,
    { kind: 'relationship-compass' },
  );
}
