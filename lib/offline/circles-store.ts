import {
  type OfflineReadState,
  readOfflineState,
  writeOfflineEnvelope,
} from '@/lib/offline/core';
import { peekCacheEnvelope, removeCache } from '@/lib/persisted-cache';

const CIRCLES_HUB_SNAPSHOT_VERSION = 1;
const CIRCLES_HUB_STALE_AFTER_MS = 15 * 60 * 1000;

export type CircleHubCircleSnapshot = {
  id: string;
  name: string;
  slug?: string | null;
  description?: string | null;
  short_description?: string | null;
  visibility?: string | null;
  category?: string | null;
  created_by_profile_id?: string | null;
  cover_image_url?: string | null;
  icon_url?: string | null;
  image_path?: string | null;
  image_updated_at?: string | null;
  circle_type?: string | null;
  status?: string | null;
  visibility_scope?: string | null;
  country_code?: string | null;
  country_name?: string | null;
  region?: string | null;
  city?: string | null;
  diaspora_tags?: string[] | null;
  culture_tags?: string[] | null;
  faith_tags?: string[] | null;
  interest_tags?: string[] | null;
  audience_tags?: string[] | null;
  is_official?: boolean | null;
  is_partner?: boolean | null;
  is_featured?: boolean | null;
  requires_join_approval?: boolean | null;
  member_count?: number | null;
  active_this_week_count?: number | null;
  gathering_count?: number | null;
  archived_at?: string | null;
  rejected_reason?: string | null;
  created_at?: string | null;
};

export type CircleHubMembershipSnapshot = {
  id: string;
  circle_id: string;
  role: string;
  status: string;
  circles?: CircleHubCircleSnapshot | null;
};

export type CircleHubPromptSnapshot = {
  id: string;
  circle_id?: string | null;
  title: string;
  prompt: string;
  prompt_type?: string | null;
};

export type CircleHubGatheringSnapshot = {
  id: string;
  circle_id?: string | null;
  title: string;
  description?: string | null;
  poster_url?: string | null;
  starts_at: string;
  city?: string | null;
  country_code?: string | null;
  gathering_type?: string | null;
  presentation_mode?: 'general' | 'seat_linked' | null;
  featured_profile_id?: string | null;
  featured_profile?: {
    id: string;
    full_name?: string | null;
    avatar_url?: string | null;
    city?: string | null;
    region?: string | null;
  } | null;
  seat_context?: 'welcome' | 'love' | null;
  host_created_for_member?: boolean | null;
  status?: string | null;
  venue_name?: string | null;
  is_partner_venue?: boolean | null;
  safe_first_date_space?: boolean | null;
  attendee_count?: number | null;
  rejected_reason?: string | null;
  created_at?: string | null;
};

export type CircleHubRelationshipGistSnapshot = {
  id: string;
  title: string;
  short_body?: string | null;
  body: string;
  perspective?: string | null;
  circle_id?: string | null;
};

export type CircleHubWarmIntroSnapshot = {
  id: string;
  circle_id?: string | null;
  profile_a_id: string;
  profile_b_id: string;
  reason: string;
  shared_context?: string[] | null;
};

export type CircleHubPickSnapshot = {
  profile_id: string;
  full_name?: string | null;
  age?: number | null;
  avatar_url?: string | null;
  reason: string;
  circleName: string;
};

export type CircleHubMemberPreviewSnapshot = {
  profile_id: string;
  full_name?: string | null;
  avatar_url?: string | null;
};

export type CirclesHubSnapshot = {
  myCircles: CircleHubMembershipSnapshot[];
  discoverCircles: CircleHubCircleSnapshot[];
  creatorCircles: CircleHubCircleSnapshot[];
  creatorGatherings: CircleHubGatheringSnapshot[];
  prompts: CircleHubPromptSnapshot[];
  gatherings: CircleHubGatheringSnapshot[];
  gists: CircleHubRelationshipGistSnapshot[];
  warmIntros: CircleHubWarmIntroSnapshot[];
  picks: CircleHubPickSnapshot[];
  imageUrls: Record<string, string>;
  memberPreviewsByCircleId: Record<string, CircleHubMemberPreviewSnapshot[]>;
};

export const buildCirclesHubSnapshotStoreKey = (profileId: string, scope: string) =>
  `offline:circles:hub:v${CIRCLES_HUB_SNAPSHOT_VERSION}:${profileId}:${scope}`;

const buildLegacyCirclesHubCacheKey = (profileId: string, scope: string) =>
  `cache:circles:v2:${profileId}:${scope}`;

export async function readCirclesHubSnapshotState(
  profileId: string,
  scope: string,
): Promise<OfflineReadState<CirclesHubSnapshot>> {
  return readOfflineState<CirclesHubSnapshot>(buildCirclesHubSnapshotStoreKey(profileId, scope));
}

export async function writeCirclesHubSnapshot(
  profileId: string,
  scope: string,
  snapshot: CirclesHubSnapshot,
  options?: { staleAfterMs?: number },
): Promise<void> {
  await writeOfflineEnvelope(buildCirclesHubSnapshotStoreKey(profileId, scope), snapshot, {
    kind: 'circles-hub-snapshot',
    staleAfterMs: options?.staleAfterMs ?? CIRCLES_HUB_STALE_AFTER_MS,
  });
}

export async function migrateLegacyCirclesHubSnapshot(
  profileId: string,
  scope: string,
): Promise<OfflineReadState<CirclesHubSnapshot> | null> {
  const nextKey = buildCirclesHubSnapshotStoreKey(profileId, scope);
  const existing = await readOfflineState<CirclesHubSnapshot>(nextKey);
  if (existing.data) return existing;

  const legacyKey = buildLegacyCirclesHubCacheKey(profileId, scope);
  const legacy = await peekCacheEnvelope<CirclesHubSnapshot>(legacyKey);
  if (!legacy?.data) return null;

  const staleAfterMs =
    typeof legacy.staleAt === 'number'
      ? Math.max(1, legacy.staleAt - Date.now())
      : CIRCLES_HUB_STALE_AFTER_MS;

  await writeOfflineEnvelope(nextKey, legacy.data, {
    kind: 'circles-hub-snapshot',
    staleAfterMs,
  });
  await removeCache(legacyKey);
  return readOfflineState<CirclesHubSnapshot>(nextKey);
}
