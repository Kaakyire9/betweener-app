import { supabase } from '@/lib/supabase';
import {
  createSignedCirclePulseMediaUrl,
  removeCirclePulseMedia,
  uploadCirclePulseMedia,
  type CirclePulseEditorialMediaType,
} from './circle-pulse-media';
import type {
  CirclePulseComment,
  CirclePulseCommentReaction,
  CirclePulseFeatureInput,
  CirclePulseItem,
  CirclePulseItemStatus,
  CirclePulseItemType,
  CircleLoveSeatNomination,
  CircleLoveSeatHostItem,
  CirclePulseCommentReport,
  CirclePulseCommentReportAction,
  CirclePulseWelcomeProfile,
} from './circle-pulse-types';

type CirclePulseRpcRow = {
  id: string;
  circle_id: string;
  item_type: CirclePulseItemType;
  title?: string | null;
  subtitle?: string | null;
  body?: string | null;
  image_url?: string | null;
  media_url?: string | null;
  media_type?: 'image' | 'video' | 'audio' | null;
  prompt_id?: string | null;
  gathering_id?: string | null;
  moment_id?: string | null;
  love_seat_id?: string | null;
  featured_profile_id?: string | null;
  featured_profile_name?: string | null;
  featured_profile_age?: number | null;
  featured_profile_avatar_url?: string | null;
  featured_profile_location?: string | null;
  featured_profile_badge?: string | null;
  love_seat_quote?: string | null;
  welcome_profiles?: unknown;
  status?: CirclePulseItemStatus | null;
  priority?: number | null;
  starts_at?: string | null;
  expires_at?: string | null;
  comment_count?: number | null;
  gathering_starts_at?: string | null;
  gathering_city?: string | null;
  gathering_type?: string | null;
  gathering_is_partner_venue?: boolean | null;
  gathering_safe_first_date_space?: boolean | null;
  gathering_attendee_count?: number | null;
  source_available?: boolean | null;
};

const toWelcomeProfile = (value: unknown): CirclePulseWelcomeProfile | null => {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  if (!row.profile_id || !row.joined_at) return null;
  return {
    profileId: String(row.profile_id),
    name: typeof row.name === 'string' && row.name.trim() ? row.name.trim() : 'New member',
    avatarUrl: typeof row.avatar_url === 'string' ? row.avatar_url : null,
    location: typeof row.location === 'string' ? row.location : null,
    joinedAt: String(row.joined_at),
  };
};

type CircleLoveSeatNominationRpcRow = {
  id: string;
  circle_id: string;
  circle_name: string;
  featured_profile_id: string;
  nominated_by_profile_id?: string | null;
  nominator_name?: string | null;
  quote?: string | null;
  reason?: string | null;
  status: 'pending_user_approval';
  created_at: string;
};

type CircleLoveSeatHostRpcRow = {
  id: string;
  circle_id: string;
  featured_profile_id: string;
  featured_profile_name?: string | null;
  featured_profile_avatar_url?: string | null;
  quote?: string | null;
  status: 'pending_user_approval' | 'active';
  created_at: string;
  responded_at?: string | null;
};

type CirclePulseCommentRpcRow = {
  id: string;
  pulse_item_id: string;
  circle_id: string;
  profile_id: string;
  display_name?: string | null;
  avatar_url?: string | null;
  body: string;
  parent_comment_id?: string | null;
  created_at: string;
  updated_at: string;
  is_own?: boolean | null;
  can_remove?: boolean | null;
  report_count?: number | null;
  reaction_count?: number | null;
  my_reaction?: CirclePulseCommentReaction | null;
};

type CirclePulseCommentReactionRpcRow = {
  comment_id: string;
  reaction_count?: number | null;
  my_reaction?: CirclePulseCommentReaction | null;
};

type CirclePulseCommentReportRpcRow = {
  comment_id: string;
  circle_id: string;
  pulse_item_id: string;
  pulse_item_type: CirclePulseItemType;
  pulse_item_title?: string | null;
  comment_profile_id: string;
  comment_author_name?: string | null;
  comment_body: string;
  report_count?: number | null;
  latest_reason?: string | null;
  latest_report_at: string;
  status: 'pending' | 'reviewing';
};

const db = supabase as any;

const toItem = (row: CirclePulseRpcRow): CirclePulseItem => ({
  id: String(row.id),
  circleId: String(row.circle_id),
  type: row.item_type,
  title: row.title ?? null,
  subtitle: row.subtitle ?? null,
  body: row.body ?? null,
  imageUrl: row.image_url ?? null,
  mediaUrl: row.media_url ?? null,
  mediaType: row.media_type ?? null,
  promptId: row.prompt_id ?? null,
  gatheringId: row.gathering_id ?? null,
  momentId: row.moment_id ?? null,
  loveSeatId: row.love_seat_id ?? null,
  featuredProfileId: row.featured_profile_id ?? null,
  featuredProfileName: row.featured_profile_name ?? null,
  featuredProfileAge: row.featured_profile_age == null ? null : Number(row.featured_profile_age),
  featuredProfileAvatarUrl: row.featured_profile_avatar_url ?? null,
  featuredProfileLocation: row.featured_profile_location ?? null,
  featuredProfileBadge: row.featured_profile_badge ?? null,
  loveSeatQuote: row.love_seat_quote ?? null,
  welcomeProfiles: Array.isArray(row.welcome_profiles)
    ? row.welcome_profiles.map(toWelcomeProfile).filter((profile): profile is CirclePulseWelcomeProfile => !!profile)
    : [],
  status: row.status ?? 'active',
  priority: Number(row.priority ?? 0),
  startsAt: row.starts_at ?? null,
  expiresAt: row.expires_at ?? null,
  commentCount: Number(row.comment_count ?? 0),
  gatheringStartsAt: row.gathering_starts_at ?? null,
  gatheringCity: row.gathering_city ?? null,
  gatheringType: row.gathering_type ?? null,
  gatheringIsPartnerVenue: row.gathering_is_partner_venue === true,
  gatheringSafeFirstDateSpace: row.gathering_safe_first_date_space === true,
  gatheringAttendeeCount: Number(row.gathering_attendee_count ?? 0),
  sourceAvailable: row.source_available !== false,
});

const toLoveSeatNomination = (row: CircleLoveSeatNominationRpcRow): CircleLoveSeatNomination => ({
  id: String(row.id),
  circleId: String(row.circle_id),
  circleName: row.circle_name,
  featuredProfileId: String(row.featured_profile_id),
  nominatedByProfileId: row.nominated_by_profile_id ?? null,
  nominatorName: row.nominator_name?.trim() || 'Circle host',
  quote: row.quote ?? null,
  reason: row.reason ?? null,
  status: row.status,
  createdAt: row.created_at,
});

const toLoveSeatHostItem = (row: CircleLoveSeatHostRpcRow): CircleLoveSeatHostItem => ({
  id: String(row.id),
  circleId: String(row.circle_id),
  featuredProfileId: String(row.featured_profile_id),
  featuredProfileName: row.featured_profile_name?.trim() || 'Circle member',
  featuredProfileAvatarUrl: row.featured_profile_avatar_url ?? null,
  quote: row.quote ?? null,
  status: row.status,
  createdAt: row.created_at,
  respondedAt: row.responded_at ?? null,
});

const toComment = (row: CirclePulseCommentRpcRow): CirclePulseComment => ({
  id: String(row.id),
  itemId: String(row.pulse_item_id),
  circleId: String(row.circle_id),
  profileId: String(row.profile_id),
  displayName: row.display_name?.trim() || 'Member',
  avatarUrl: row.avatar_url ?? null,
  body: row.body,
  parentCommentId: row.parent_comment_id ?? null,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  isOwn: row.is_own === true,
  canRemove: row.can_remove === true,
  reportCount: Number(row.report_count ?? 0),
  reactionCount: Number(row.reaction_count ?? 0),
  myReaction: row.my_reaction ?? null,
});

const toCommentReport = (row: CirclePulseCommentReportRpcRow): CirclePulseCommentReport => ({
  commentId: String(row.comment_id),
  circleId: String(row.circle_id),
  itemId: String(row.pulse_item_id),
  itemType: row.pulse_item_type,
  itemTitle: row.pulse_item_title?.trim() || 'Circle spotlight',
  commentProfileId: String(row.comment_profile_id),
  commentAuthorName: row.comment_author_name?.trim() || 'Circle member',
  commentBody: row.comment_body,
  reportCount: Number(row.report_count ?? 0),
  latestReason: row.latest_reason?.trim() || 'Concern',
  latestReportAt: row.latest_report_at,
  status: row.status,
});

export async function fetchCirclePulseItems(circleId: string) {
  const { data, error } = await db.rpc('rpc_get_circle_pulse_items', {
    p_circle_id: circleId,
    p_include_inactive: false,
  });
  if (error) throw error;
  const items = ((data ?? []) as CirclePulseRpcRow[]).map(toItem);
  return await Promise.all(
    items.map(async (item) => {
      if (item.type !== 'media' || item.momentId || !item.mediaUrl) return item;
      const signedMediaUrl = await createSignedCirclePulseMediaUrl(item.mediaUrl);
      const signedImageUrl =
        item.imageUrl && item.imageUrl !== item.mediaUrl
          ? await createSignedCirclePulseMediaUrl(item.imageUrl)
          : item.mediaType === 'image'
            ? signedMediaUrl
            : item.imageUrl;
      return {
        ...item,
        mediaUrl: signedMediaUrl ?? item.mediaUrl,
        imageUrl: signedImageUrl ?? item.imageUrl,
      };
    }),
  );
}

export async function featureCirclePulseItem(
  circleId: string,
  actorProfileId: string,
  input: CirclePulseFeatureInput,
) {
  const payload = {
    p_circle_id: circleId,
    p_actor_profile_id: actorProfileId,
    p_item_type: input.type,
    p_prompt_id: input.type === 'prompt' ? input.promptId : null,
    p_gathering_id: input.type === 'gathering' ? input.gatheringId : null,
    p_moment_id: input.type === 'media' ? input.momentId ?? null : null,
    p_title: input.type === 'host_note' || input.type === 'media' ? input.title ?? null : null,
    p_subtitle: input.type === 'media' ? input.subtitle ?? null : null,
    p_body: input.type === 'host_note' || input.type === 'media' ? input.body ?? null : null,
    p_image_url: input.type === 'media' ? input.imageUrl ?? null : null,
    p_media_url: input.type === 'media' ? input.mediaUrl ?? null : null,
    p_media_type: input.type === 'media' ? input.mediaType ?? null : null,
    p_priority: input.priority ?? 0,
    p_status: 'active',
  };
  const { data, error } = await db.rpc('rpc_upsert_circle_pulse_item', payload);
  if (error) throw error;
  return data;
}

export async function createCirclePulseEditorialMedia(
  circleId: string,
  actorProfileId: string,
  input: {
    uri: string;
    mediaType: CirclePulseEditorialMediaType;
    title: string;
    subtitle?: string | null;
    body?: string | null;
  },
) {
  const mediaPath = await uploadCirclePulseMedia(circleId, input.uri, input.mediaType);
  try {
    return await featureCirclePulseItem(circleId, actorProfileId, {
      type: 'media',
      title: input.title,
      subtitle: input.subtitle ?? null,
      body: input.body ?? null,
      imageUrl: input.mediaType === 'image' ? mediaPath : null,
      mediaUrl: mediaPath,
      mediaType: input.mediaType,
    });
  } catch (error) {
    await removeCirclePulseMedia(mediaPath).catch(() => undefined);
    throw error;
  }
}

export async function fetchCirclePulseComments(itemId: string) {
  const { data, error } = await db.rpc('rpc_get_circle_pulse_comments', {
    p_pulse_item_id: itemId,
    p_limit: 100,
  });
  if (error) throw error;
  const comments = ((data ?? []) as CirclePulseCommentRpcRow[]).map(toComment);
  const { data: reactionRows } = await db.rpc('rpc_get_circle_pulse_comment_reactions', {
    p_pulse_item_id: itemId,
  });
  const reactionByCommentId = new Map(
    ((reactionRows ?? []) as CirclePulseCommentReactionRpcRow[]).map((row) => [String(row.comment_id), row]),
  );
  return comments.map((comment) => {
    const reaction = reactionByCommentId.get(comment.id);
    return {
      ...comment,
      reactionCount: Number(reaction?.reaction_count ?? 0),
      myReaction: reaction?.my_reaction ?? null,
    };
  });
}

export async function createCirclePulseComment(
  itemId: string,
  actorProfileId: string,
  body: string,
  parentCommentId?: string | null,
) {
  const { data, error } = await db.rpc('rpc_create_circle_pulse_comment', {
    p_pulse_item_id: itemId,
    p_profile_id: actorProfileId,
    p_body: body,
    p_parent_comment_id: parentCommentId ?? null,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error('Comment could not be saved.');
  return toComment(row as CirclePulseCommentRpcRow);
}

export async function toggleCirclePulseCommentReaction(
  commentId: string,
  actorProfileId: string,
  reaction: CirclePulseCommentReaction = 'heart',
) {
  const { data, error } = await db.rpc('rpc_toggle_circle_pulse_comment_reaction', {
    p_comment_id: commentId,
    p_profile_id: actorProfileId,
    p_reaction: reaction,
  });
  if (error) throw error;
  return data === true;
}

export async function deleteCirclePulseComment(commentId: string, actorProfileId: string) {
  const { error } = await db.rpc('rpc_delete_circle_pulse_comment', {
    p_comment_id: commentId,
    p_profile_id: actorProfileId,
  });
  if (error) throw error;
}

export async function reportCirclePulseComment(commentId: string, actorProfileId: string) {
  const { error } = await db.rpc('rpc_report_circle_pulse_comment', {
    p_comment_id: commentId,
    p_profile_id: actorProfileId,
    p_reason: 'concern',
  });
  if (error) throw error;
}

export async function nominateCircleLoveSeat(
  circleId: string,
  actorProfileId: string,
  featuredProfileId: string,
  quote?: string | null,
) {
  const { data, error } = await db.rpc('rpc_nominate_circle_love_seat', {
    p_circle_id: circleId,
    p_actor_profile_id: actorProfileId,
    p_featured_profile_id: featuredProfileId,
    p_quote: quote?.trim() || null,
  });
  if (error) throw error;
  return data;
}

export async function fetchMyCircleLoveSeatNominations(actorProfileId: string, circleId: string) {
  const { data, error } = await db.rpc('rpc_get_my_circle_love_seat_nominations', {
    p_profile_id: actorProfileId,
    p_circle_id: circleId,
  });
  if (error) throw error;
  return ((data ?? []) as CircleLoveSeatNominationRpcRow[]).map(toLoveSeatNomination);
}

export async function respondToCircleLoveSeatNomination(
  loveSeatId: string,
  actorProfileId: string,
  accept: boolean,
) {
  const { data, error } = await db.rpc('rpc_respond_circle_love_seat', {
    p_love_seat_id: loveSeatId,
    p_profile_id: actorProfileId,
    p_accept: accept,
  });
  if (error) throw error;
  return data;
}

export async function endCircleLoveSeat(loveSeatId: string, actorProfileId: string) {
  const { error } = await db.rpc('rpc_end_circle_love_seat', {
    p_love_seat_id: loveSeatId,
    p_actor_profile_id: actorProfileId,
  });
  if (error) throw error;
}

export async function fetchCircleLoveSeatsForHost(circleId: string, actorProfileId: string) {
  const { data, error } = await db.rpc('rpc_list_circle_love_seats_for_host', {
    p_circle_id: circleId,
    p_actor_profile_id: actorProfileId,
  });
  if (error) throw error;
  return ((data ?? []) as CircleLoveSeatHostRpcRow[]).map(toLoveSeatHostItem);
}

export async function cancelCircleLoveSeatNomination(loveSeatId: string, actorProfileId: string) {
  const { error } = await db.rpc('rpc_cancel_circle_love_seat_nomination', {
    p_love_seat_id: loveSeatId,
    p_actor_profile_id: actorProfileId,
  });
  if (error) throw error;
}

export async function archiveCirclePulseItem(itemId: string, actorProfileId: string) {
  const { error } = await db.rpc('rpc_archive_circle_pulse_item', {
    p_item_id: itemId,
    p_actor_profile_id: actorProfileId,
  });
  if (error) throw error;
}

export async function reorderCirclePulseItems(circleId: string, actorProfileId: string, itemIds: string[]) {
  const { error } = await db.rpc('rpc_reorder_circle_pulse_items', {
    p_circle_id: circleId,
    p_actor_profile_id: actorProfileId,
    p_item_ids: itemIds,
  });
  if (error) throw error;
}

export async function fetchCirclePulseCommentReports(circleId: string, actorProfileId: string) {
  const { data, error } = await db.rpc('rpc_list_circle_pulse_comment_reports', {
    p_circle_id: circleId,
    p_actor_profile_id: actorProfileId,
  });
  if (error) throw error;
  return ((data ?? []) as CirclePulseCommentReportRpcRow[]).map(toCommentReport);
}

export async function reviewCirclePulseCommentReport(
  commentId: string,
  actorProfileId: string,
  action: CirclePulseCommentReportAction,
) {
  const { error } = await db.rpc('rpc_review_circle_pulse_comment_report', {
    p_comment_id: commentId,
    p_actor_profile_id: actorProfileId,
    p_action: action,
  });
  if (error) throw error;
}
