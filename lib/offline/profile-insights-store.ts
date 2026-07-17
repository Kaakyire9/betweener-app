import {
  readOfflineState,
  updateOfflineEnvelope,
  writeOfflineEnvelope,
  type OfflineReadState,
} from '@/lib/offline/core';
import type { BoostAnalytics, BoostRecommendation } from '@/lib/boosts';
import type { ProfileInterestSummary, SavedProfileSummary } from '@/lib/profile-interest';

const PROFILE_INSIGHTS_STORE_VERSION = 1;
const PROFILE_INTEREST_STALE_AFTER_MS = 10 * 60 * 1000;
const SAVED_PROFILES_STALE_AFTER_MS = 15 * 60 * 1000;
const PROFILE_INSIGHTS_STALE_AFTER_MS = 10 * 60 * 1000;
const PROFILE_BOOSTS_STALE_AFTER_MS = 5 * 60 * 1000;

const buildProfileInterestSnapshotKey = (profileId: string) =>
  `offline:profile-interest:v${PROFILE_INSIGHTS_STORE_VERSION}:${profileId}`;

const buildSavedProfilesSnapshotKey = (profileId: string) =>
  `offline:saved-profiles:v${PROFILE_INSIGHTS_STORE_VERSION}:${profileId}`;

const buildProfileInsightsSnapshotKey = (profileId: string) =>
  `offline:profile-insights:v${PROFILE_INSIGHTS_STORE_VERSION}:${profileId}`;

const buildProfileBoostSnapshotKey = (profileId: string) =>
  `offline:profile-boosts:v${PROFILE_INSIGHTS_STORE_VERSION}:${profileId}`;

export type OfflineProfileInsightsGiftSummary = {
  count: number;
  waitingCount: number;
  latestSender: string;
  latestGiftType?: string | null;
};

export type OfflineProfileInsightsGiftItem = {
  id: string;
  senderName: string;
  senderAvatar?: string | null;
  senderProfileId?: string | null;
  senderGender?: string | null;
  giftType: string;
  createdAt: string;
  openedAt?: string | null;
  revealedAt?: string | null;
  archivedAt?: string | null;
};

export type OfflineSentGiftItem = {
  id: string;
  recipientName: string;
  recipientAvatar?: string | null;
  recipientProfileId?: string | null;
  giftType: string;
  createdAt: string;
  revealedAt?: string | null;
  archivedAt?: string | null;
};

export type OfflineProfileInsightsSnapshot = {
  giftSummary: OfflineProfileInsightsGiftSummary;
  giftArchive: OfflineProfileInsightsGiftItem[];
  sentGiftArchive: OfflineSentGiftItem[];
};

export type OfflineProfileBoostSnapshot = {
  recommendation: BoostRecommendation | null;
  analytics: BoostAnalytics | null;
};

export async function readProfileInterestSnapshotState(
  profileId: string,
): Promise<OfflineReadState<ProfileInterestSummary>> {
  return readOfflineState<ProfileInterestSummary>(buildProfileInterestSnapshotKey(profileId));
}

export async function writeProfileInterestSnapshot(
  profileId: string,
  summary: ProfileInterestSummary,
): Promise<void> {
  await writeOfflineEnvelope(buildProfileInterestSnapshotKey(profileId), summary, {
    kind: 'profile-interest-summary',
    staleAfterMs: PROFILE_INTEREST_STALE_AFTER_MS,
  });
}

export async function readSavedProfilesSnapshotState(
  profileId: string,
): Promise<OfflineReadState<SavedProfileSummary[]>> {
  return readOfflineState<SavedProfileSummary[]>(buildSavedProfilesSnapshotKey(profileId));
}

export async function writeSavedProfilesSnapshot(
  profileId: string,
  profiles: SavedProfileSummary[],
): Promise<void> {
  await writeOfflineEnvelope(buildSavedProfilesSnapshotKey(profileId), profiles, {
    kind: 'saved-profiles',
    staleAfterMs: SAVED_PROFILES_STALE_AFTER_MS,
  });
}

export async function updateSavedProfilesSnapshot(
  profileId: string,
  updater: (current: SavedProfileSummary[] | null) => SavedProfileSummary[] | null | Promise<SavedProfileSummary[] | null>,
): Promise<SavedProfileSummary[] | null> {
  return updateOfflineEnvelope<SavedProfileSummary[]>(
    buildSavedProfilesSnapshotKey(profileId),
    updater,
    {
      kind: 'saved-profiles',
      staleAfterMs: SAVED_PROFILES_STALE_AFTER_MS,
    },
  );
}

export async function readProfileInsightsSnapshotState(
  profileId: string,
): Promise<OfflineReadState<OfflineProfileInsightsSnapshot>> {
  return readOfflineState<OfflineProfileInsightsSnapshot>(buildProfileInsightsSnapshotKey(profileId));
}

export async function writeProfileInsightsSnapshot(
  profileId: string,
  snapshot: OfflineProfileInsightsSnapshot,
): Promise<void> {
  await writeOfflineEnvelope(buildProfileInsightsSnapshotKey(profileId), snapshot, {
    kind: 'profile-insights',
    staleAfterMs: PROFILE_INSIGHTS_STALE_AFTER_MS,
  });
}

export async function updateProfileInsightsSnapshot(
  profileId: string,
  updater: (
    current: OfflineProfileInsightsSnapshot | null,
  ) => OfflineProfileInsightsSnapshot | null | Promise<OfflineProfileInsightsSnapshot | null>,
): Promise<OfflineProfileInsightsSnapshot | null> {
  return updateOfflineEnvelope<OfflineProfileInsightsSnapshot>(
    buildProfileInsightsSnapshotKey(profileId),
    updater,
    {
      kind: 'profile-insights',
      staleAfterMs: PROFILE_INSIGHTS_STALE_AFTER_MS,
    },
  );
}

export async function readProfileBoostSnapshotState(
  profileId: string,
): Promise<OfflineReadState<OfflineProfileBoostSnapshot>> {
  return readOfflineState<OfflineProfileBoostSnapshot>(buildProfileBoostSnapshotKey(profileId));
}

export async function writeProfileBoostSnapshot(
  profileId: string,
  snapshot: OfflineProfileBoostSnapshot,
): Promise<void> {
  await writeOfflineEnvelope(buildProfileBoostSnapshotKey(profileId), snapshot, {
    kind: 'profile-boosts',
    staleAfterMs: PROFILE_BOOSTS_STALE_AFTER_MS,
  });
}

export async function updateProfileBoostSnapshot(
  profileId: string,
  updater: (
    current: OfflineProfileBoostSnapshot | null,
  ) => OfflineProfileBoostSnapshot | null | Promise<OfflineProfileBoostSnapshot | null>,
): Promise<OfflineProfileBoostSnapshot | null> {
  return updateOfflineEnvelope<OfflineProfileBoostSnapshot>(
    buildProfileBoostSnapshotKey(profileId),
    updater,
    {
      kind: 'profile-boosts',
      staleAfterMs: PROFILE_BOOSTS_STALE_AFTER_MS,
    },
  );
}
