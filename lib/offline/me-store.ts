import { peekOfflineData, readOfflineData, updateOfflineEnvelope } from '@/lib/offline/core';
import { removeCache } from '@/lib/persisted-cache';

const ME_SNAPSHOT_VERSION = 1;

export type MeProfileStatsSnapshot = {
  likesCount: number;
  matchesCount: number;
  chatsCount: number;
  matchQuality: number | null;
};

export type MeProfileSnapshot = {
  avatarUrl?: string | null;
  promptAnswers?: unknown[];
  interests?: string[];
  photos?: string[];
  profileVideo?: string | null;
  stats?: MeProfileStatsSnapshot;
  notificationPrefs?: Record<string, unknown>;
};

const buildMeProfileSnapshotStoreKey = (profileId: string) =>
  `offline:me:profile:v${ME_SNAPSHOT_VERSION}:${profileId}`;

const buildLegacyPromptsCacheKey = (profileId: string) => `cache:profile_prompts:v2:${profileId}`;
const buildLegacyInterestsCacheKey = (profileId: string) => `cache:profile_interests:v1:${profileId}`;
const buildLegacyPhotosCacheKey = (profileId: string) => `cache:profile_photos:v1:${profileId}`;

const hasUsefulSnapshotData = (snapshot: MeProfileSnapshot | null) =>
  Boolean(
    snapshot &&
      ((Array.isArray(snapshot.promptAnswers) && snapshot.promptAnswers.length > 0) ||
        (Array.isArray(snapshot.interests) && snapshot.interests.length > 0) ||
        (Array.isArray(snapshot.photos) && snapshot.photos.length > 0) ||
        snapshot.avatarUrl ||
        snapshot.profileVideo ||
        snapshot.stats ||
        snapshot.notificationPrefs),
  );

export async function readMeProfileSnapshot(profileId: string): Promise<MeProfileSnapshot | null> {
  return readOfflineData<MeProfileSnapshot>(buildMeProfileSnapshotStoreKey(profileId));
}

export async function writeMeProfileSnapshot(
  profileId: string,
  patch: Partial<MeProfileSnapshot>,
): Promise<MeProfileSnapshot | null> {
  return updateOfflineEnvelope<MeProfileSnapshot>(
    buildMeProfileSnapshotStoreKey(profileId),
    (current) => ({
      ...(current ?? {}),
      ...patch,
    }),
    { kind: 'me-profile-snapshot' },
  );
}

export async function migrateLegacyMeProfileSnapshot(profileId: string): Promise<MeProfileSnapshot | null> {
  const existing = await readMeProfileSnapshot(profileId);
  if (hasUsefulSnapshotData(existing)) return existing;

  const [promptAnswers, interests, photos] = await Promise.all([
    peekOfflineData<unknown[]>(buildLegacyPromptsCacheKey(profileId)),
    peekOfflineData<string[]>(buildLegacyInterestsCacheKey(profileId)),
    peekOfflineData<string[]>(buildLegacyPhotosCacheKey(profileId)),
  ]);

  const next: MeProfileSnapshot = {};
  if (Array.isArray(promptAnswers) && promptAnswers.length > 0) next.promptAnswers = promptAnswers;
  if (Array.isArray(interests) && interests.length > 0) next.interests = interests;
  if (Array.isArray(photos) && photos.length > 0) next.photos = photos;

  if (!hasUsefulSnapshotData(next)) return null;

  const written = await writeMeProfileSnapshot(profileId, next);
  await Promise.all([
    removeCache(buildLegacyPromptsCacheKey(profileId)),
    removeCache(buildLegacyInterestsCacheKey(profileId)),
    removeCache(buildLegacyPhotosCacheKey(profileId)),
  ]);
  return written;
}
