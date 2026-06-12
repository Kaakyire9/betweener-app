import { readOfflineState, writeOfflineEnvelope, type OfflineReadState } from '@/lib/offline/core';

const CIRCLE_DETAIL_SNAPSHOT_VERSION = 1;
const CIRCLE_DETAIL_STALE_AFTER_MS = 15 * 60 * 1000;

export type OfflineCircleDetailCircle = {
  id: string;
  name: string;
  slug?: string | null;
  description?: string | null;
  short_description?: string | null;
  visibility?: string | null;
  category?: string | null;
  created_by_profile_id?: string | null;
  created_by_user_id?: string | null;
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
  is_official?: boolean | null;
  is_partner?: boolean | null;
  is_featured?: boolean | null;
  requires_join_approval?: boolean | null;
  rules?: string | null;
  safety_note?: string | null;
  member_count?: number | null;
  active_this_week_count?: number | null;
  gathering_count?: number | null;
  archived_at?: string | null;
  host_note?: string | null;
  host_note_updated_at?: string | null;
  host_note_updated_by_profile_id?: string | null;
};

export type OfflineCircleDetailMemberProfile = {
  id: string;
  user_id?: string | null;
  full_name?: string | null;
  avatar_url?: string | null;
  age?: number | null;
  location?: string | null;
  city?: string | null;
  region?: string | null;
};

export type OfflineCircleDetailMember = {
  id: string;
  role: string;
  status: string;
  is_visible: boolean;
  profile_id: string;
  user_id?: string | null;
  joined_at?: string | null;
  profiles?: OfflineCircleDetailMemberProfile | null;
};

export type OfflineCircleDetailPrompt = {
  id: string;
  title: string;
  prompt: string;
  prompt_type?: string | null;
  expires_at?: string | null;
};

export type OfflineCircleDetailPromptResponse = {
  id: string;
  prompt_id: string;
  profile_id: string;
  response: string;
  created_at: string;
  profiles?: OfflineCircleDetailMemberProfile | null;
};

export type OfflineCircleDetailGathering = {
  id: string;
  title: string;
  description?: string | null;
  poster_url?: string | null;
  presentation_mode?: 'general' | 'seat_linked' | null;
  featured_profile_id?: string | null;
  seat_context?: 'welcome' | 'love' | null;
  host_created_for_member?: boolean | null;
  starts_at: string;
  city?: string | null;
  country_code?: string | null;
  venue_name?: string | null;
  gathering_type?: string | null;
  address_visibility?: string | null;
  is_partner_venue?: boolean | null;
  safe_first_date_space?: boolean | null;
  attendee_count?: number | null;
};

export type OfflineCircleDetailGatheringAttendance = {
  gathering_id: string;
  status: string;
  visible_to_others: boolean;
};

export type OfflineCircleDetailMoment = {
  id: string;
  user_id: string;
  type: string;
  media_url?: string | null;
  thumbnail_url?: string | null;
  text_body?: string | null;
  caption?: string | null;
  created_at: string;
  expires_at?: string | null;
  visibility?: string | null;
  profile?: OfflineCircleDetailMemberProfile | null;
};

export type OfflineCircleDetailRoleRequest = {
  id: string;
  circle_id: string;
  requester_profile_id: string;
  requester_user_id?: string | null;
  requested_role: 'moderator' | 'host';
  note?: string | null;
  status: string;
  rejection_reason?: string | null;
  created_at: string;
  requester?: OfflineCircleDetailMemberProfile | null;
};

export type OfflineCircleDetailReport = {
  id: string;
  circle_id?: string | null;
  gathering_id?: string | null;
  prompt_response_id?: string | null;
  reporter_profile_id: string;
  reason: string;
  details?: string | null;
  status: string;
  created_at: string;
  gathering_title?: string | null;
  prompt_response_text?: string | null;
};

export type OfflineCircleDetailSnapshot = {
  circle: OfflineCircleDetailCircle | null;
  membership: OfflineCircleDetailMember | null;
  members: OfflineCircleDetailMember[];
  pendingMembers: OfflineCircleDetailMember[];
  prompts: OfflineCircleDetailPrompt[];
  promptResponsesByPromptId: Record<string, OfflineCircleDetailPromptResponse[]>;
  gatherings: OfflineCircleDetailGathering[];
  gatheringAttendance: Record<string, OfflineCircleDetailGatheringAttendance>;
  moments: OfflineCircleDetailMoment[];
  momentLoadError: string | null;
  roleRequests: OfflineCircleDetailRoleRequest[];
  moderationReports: OfflineCircleDetailReport[];
};

export const buildCircleDetailSnapshotStoreKey = (circleId: string, viewerProfileId?: string | null) =>
  `offline:circles:detail:v${CIRCLE_DETAIL_SNAPSHOT_VERSION}:${viewerProfileId || 'guest'}:${circleId}`;

export async function readCircleDetailSnapshotState(
  circleId: string,
  viewerProfileId?: string | null,
): Promise<OfflineReadState<OfflineCircleDetailSnapshot>> {
  return readOfflineState<OfflineCircleDetailSnapshot>(
    buildCircleDetailSnapshotStoreKey(circleId, viewerProfileId),
  );
}

export async function writeCircleDetailSnapshot(
  circleId: string,
  viewerProfileId: string | null | undefined,
  snapshot: OfflineCircleDetailSnapshot,
  options?: { staleAfterMs?: number },
): Promise<void> {
  await writeOfflineEnvelope(
    buildCircleDetailSnapshotStoreKey(circleId, viewerProfileId),
    snapshot,
    {
      kind: 'circle-detail-snapshot',
      staleAfterMs: options?.staleAfterMs ?? CIRCLE_DETAIL_STALE_AFTER_MS,
    },
  );
}
