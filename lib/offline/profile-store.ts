import { updateOfflineEnvelope, readOfflineData } from '@/lib/offline/core';
import type { UserProfile } from '@/types/user-profile';

const PROFILE_SNAPSHOT_VERSION = 1;

const buildViewedProfileSnapshotStoreKey = (profileId: string) =>
  `offline:profile:viewed:v${PROFILE_SNAPSHOT_VERSION}:${profileId}`;

const pickLastNonEmptyString = (...values: Array<string | undefined | null>) => {
  for (let index = values.length - 1; index >= 0; index -= 1) {
    const value = values[index];
    if (typeof value === 'string' && value.trim().length > 0) {
      return value;
    }
  }
  return undefined;
};

const pickLastNonEmptyArray = <T>(...values: Array<T[] | undefined | null>) => {
  for (let index = values.length - 1; index >= 0; index -= 1) {
    const value = values[index];
    if (Array.isArray(value) && value.length > 0) {
      return value;
    }
  }
  return undefined;
};

export function mergeViewedProfileSnapshots(
  ...profiles: Array<UserProfile | null | undefined>
): UserProfile | null {
  const sources = profiles.filter(Boolean) as UserProfile[];
  if (!sources.length) return null;

  const merged = sources.reduce((acc, profile) => ({ ...acc, ...profile }), {} as UserProfile);

  const stringKeys = [
    'id',
    'userId',
    'name',
    'location',
    'city',
    'region',
    'profilePicture',
    'profileVideo',
    'profileVideoPath',
    'occupation',
    'education',
    'bio',
    'distance',
    'tribe',
    'religion',
    'personalityType',
    'height',
    'lookingFor',
    'loveLanguage',
    'currentCountry',
    'currentCountryCode',
    'exerciseFrequency',
    'smoking',
    'drinking',
    'hasChildren',
    'wantsChildren',
    'locationPrecision',
    'rootsNote',
    'rootsVisibility',
  ] as const;

  for (const key of stringKeys) {
    const resolved = pickLastNonEmptyString(...sources.map((profile) => profile[key] as string | undefined));
    if (resolved) {
      (merged as any)[key] = resolved;
    }
  }

  const photos = pickLastNonEmptyArray(...sources.map((profile) => profile.photos));
  if (photos) merged.photos = photos;

  const interests = pickLastNonEmptyArray(...sources.map((profile) => profile.interests));
  if (interests) merged.interests = interests;

  const promptAnswers = pickLastNonEmptyArray(...sources.map((profile) => profile.promptAnswers));
  if (promptAnswers) merged.promptAnswers = promptAnswers;

  const roots = pickLastNonEmptyArray(...sources.map((profile) => profile.roots));
  if (roots) merged.roots = roots;

  const languages = pickLastNonEmptyArray(...sources.map((profile) => profile.languages));
  if (languages) merged.languages = languages;

  if ((!Array.isArray(merged.photos) || merged.photos.length === 0) && merged.profilePicture) {
    merged.photos = [merged.profilePicture];
  }

  if (!merged.profilePicture && Array.isArray(merged.photos) && merged.photos.length > 0) {
    merged.profilePicture = merged.photos[0];
  }

  return merged;
}

export async function readViewedProfileSnapshot(profileId: string): Promise<UserProfile | null> {
  return readOfflineData<UserProfile>(buildViewedProfileSnapshotStoreKey(profileId));
}

export async function writeViewedProfileSnapshot(
  profile: UserProfile,
  options?: { merge?: boolean },
): Promise<UserProfile | null> {
  if (!profile?.id) return null;
  const merge = options?.merge !== false;
  return updateOfflineEnvelope<UserProfile>(
    buildViewedProfileSnapshotStoreKey(profile.id),
    (current) => (merge ? mergeViewedProfileSnapshots(current, profile) : profile),
    { kind: 'profile-snapshot' },
  );
}
