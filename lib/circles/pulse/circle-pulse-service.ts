import { supabase } from '@/lib/supabase';
import { cacheOfflineImage, resolveOfflineImageUri } from '@/lib/offline/image-store';
import { cacheOfflineVideo } from '@/lib/offline/video-store';
import {
  createSignedCirclePulseMediaUrl,
  removeCirclePulseMedia,
  uploadCirclePulseMedia,
  type CirclePulseEditorialMediaType,
} from './circle-pulse-media';
import type {
  CircleGatheringPresentationMode,
  CircleGatheringSeatContext,
  CirclePulseComment,
  CirclePulseCommentReaction,
  CirclePulseCommentReactionSummary,
  CirclePulseFeatureInput,
  CirclePulseItem,
  CirclePulseItemStatus,
  CirclePulseItemType,
  CircleLoveSeatNomination,
  CircleLoveSeatHostItem,
  CirclePulseCommentReport,
  CirclePulseCommentReportAction,
  CirclePulseDiscussionReadState,
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
  discussion_cta?: string | null;
  discussion_summary?: string | null;
  gathering_starts_at?: string | null;
  gathering_city?: string | null;
  gathering_type?: string | null;
  gathering_presentation_mode?: CircleGatheringPresentationMode | null;
  gathering_seat_context?: CircleGatheringSeatContext;
  gathering_host_created_for_member?: boolean | null;
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
  edited_at?: string | null;
  is_own?: boolean | null;
  can_remove?: boolean | null;
  can_edit?: boolean | null;
  can_pin?: boolean | null;
  pinned_at?: string | null;
  report_count?: number | null;
  reaction_count?: number | null;
  my_reaction?: CirclePulseCommentReaction | null;
  reply_preview_profile_id?: string | null;
  reply_preview_display_name?: string | null;
  reply_preview_body?: string | null;
  reaction_summary?: unknown;
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

type CirclePulseDiscussionReadStateRpcRow = {
  pulse_item_id: string;
  last_seen_comment_id?: string | null;
  last_seen_at?: string | null;
  unread_count?: number | null;
};

const db = supabase as any;

const toServiceError = (error: unknown, fallbackMessage: string) => {
  if (error instanceof Error && error.message.trim()) {
    return new Error(error.message.trim());
  }

  if (error && typeof error === 'object') {
    const value = error as {
      message?: unknown;
      details?: unknown;
      hint?: unknown;
      code?: unknown;
    };
    const parts = [
      typeof value.message === 'string' ? value.message.trim() : '',
      typeof value.details === 'string' ? value.details.trim() : '',
      typeof value.hint === 'string' ? value.hint.trim() : '',
    ].filter(Boolean);

    if (parts.length > 0) {
      return new Error(parts.join(' '));
    }

    if (typeof value.code === 'string' && value.code.trim()) {
      return new Error(value.code.trim());
    }
  }

  return new Error(fallbackMessage);
};

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
  discussionCta: row.discussion_cta ?? null,
  discussionSummary: row.discussion_summary ?? null,
  gatheringStartsAt: row.gathering_starts_at ?? null,
  gatheringCity: row.gathering_city ?? null,
  gatheringType: row.gathering_type ?? null,
  gatheringPresentationMode: row.gathering_presentation_mode ?? null,
  gatheringSeatContext: row.gathering_seat_context ?? null,
  gatheringHostCreatedForMember: row.gathering_host_created_for_member === true,
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

const toReactionSummary = (value: unknown): CirclePulseCommentReactionSummary[] => {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return [];
    const row = entry as Record<string, unknown>;
    const reaction = row.reaction;
    const count = Number(row.count ?? 0);
    if (
      reaction !== 'heart'
      && reaction !== 'laugh'
      && reaction !== 'love'
      && reaction !== 'thumbs_up'
      && reaction !== 'fire'
      && reaction !== 'clap'
    ) {
      return [];
    }
    if (!Number.isFinite(count) || count <= 0) return [];
    return [{ reaction, count }];
  });
};

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
  editedAt: row.edited_at ?? null,
  isOwn: row.is_own === true,
  canRemove: row.can_remove === true,
  canEdit: row.can_edit === true,
  canPin: row.can_pin === true,
  pinnedAt: row.pinned_at ?? null,
  reportCount: Number(row.report_count ?? 0),
  reactionCount: Number(row.reaction_count ?? 0),
  replyPreviewProfileId: row.reply_preview_profile_id ?? null,
  replyPreviewDisplayName: row.reply_preview_display_name?.trim() || null,
  replyPreviewBody: row.reply_preview_body ?? null,
  reactionSummary: toReactionSummary(row.reaction_summary),
  myReaction: row.my_reaction ?? null,
});

const hydrateCommentAvatars = async (comment: CirclePulseComment): Promise<CirclePulseComment> => {
  if (!comment.avatarUrl?.startsWith('http')) return comment;
  const cachedAvatar = await resolveOfflineImageUri(
    `circle-pulse-comment-avatar:${comment.circleId}:${comment.id}:${comment.profileId}:${comment.avatarUrl}`,
    comment.avatarUrl,
  );
  if (!cachedAvatar) return comment;
  return {
    ...comment,
    avatarUrl: cachedAvatar,
  };
};

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

const toDiscussionReadState = (row: CirclePulseDiscussionReadStateRpcRow): CirclePulseDiscussionReadState => ({
  itemId: String(row.pulse_item_id),
  lastSeenCommentId: row.last_seen_comment_id ?? null,
  lastSeenAt: row.last_seen_at ?? null,
  unreadCount: Number(row.unread_count ?? 0),
});

const buildCirclePulseMediaCacheKey = (
  item: Pick<CirclePulseItem, 'id' | 'circleId' | 'imageUrl' | 'mediaUrl' | 'mediaType'>,
  kind: 'image' | 'video',
) => `circle-pulse:${item.circleId}:${item.id}:${kind}:${item.imageUrl ?? item.mediaUrl ?? 'none'}`;

const cacheCirclePulseItemMedia = async (item: CirclePulseItem): Promise<CirclePulseItem> => {
  let nextItem = item;

  if (item.featuredProfileAvatarUrl?.startsWith('http')) {
    const cachedFeaturedAvatar = await resolveOfflineImageUri(
      `circle-pulse-featured-avatar:${item.circleId}:${item.id}:${item.featuredProfileId ?? 'none'}:${item.featuredProfileAvatarUrl}`,
      item.featuredProfileAvatarUrl,
    );
    if (cachedFeaturedAvatar) {
      nextItem = { ...nextItem, featuredProfileAvatarUrl: cachedFeaturedAvatar };
    }
  }

  if (item.welcomeProfiles.length > 0) {
    const nextWelcomeProfiles = await Promise.all(
      item.welcomeProfiles.map(async (profile) => {
        if (!profile.avatarUrl) return profile;
        const cachedAvatar = await resolveOfflineImageUri(
          `circle-pulse-welcome-avatar:${item.circleId}:${item.id}:${profile.profileId}:${profile.avatarUrl}`,
          profile.avatarUrl,
        );
        return cachedAvatar ? { ...profile, avatarUrl: cachedAvatar } : profile;
      }),
    );
    nextItem = { ...nextItem, welcomeProfiles: nextWelcomeProfiles };
  }

  if (item.imageUrl?.startsWith('http')) {
    const cachedImage = await cacheOfflineImage(
      buildCirclePulseMediaCacheKey(item, 'image'),
      item.imageUrl,
    );
    if (cachedImage) {
      nextItem = { ...nextItem, imageUrl: cachedImage };
    }
  }

  if (item.mediaType === 'image' && item.mediaUrl?.startsWith('http')) {
    const cachedMediaImage = await cacheOfflineImage(
      buildCirclePulseMediaCacheKey(item, 'image'),
      item.mediaUrl,
    );
    if (cachedMediaImage) {
      nextItem = { ...nextItem, mediaUrl: cachedMediaImage, imageUrl: nextItem.imageUrl ?? cachedMediaImage };
    }
  }

  if (item.mediaType === 'video' && item.mediaUrl?.startsWith('http')) {
    const cachedVideo = await cacheOfflineVideo(
      buildCirclePulseMediaCacheKey(item, 'video'),
      item.mediaUrl,
    );
    if (cachedVideo) {
      nextItem = { ...nextItem, mediaUrl: cachedVideo };
    }
  }

  return nextItem;
};

export async function fetchCirclePulseItems(circleId: string) {
  const { data, error } = await db.rpc('rpc_get_circle_pulse_items', {
    p_circle_id: circleId,
    p_include_inactive: false,
  });
  if (error) throw toServiceError(error, 'Circle Pulse could not load.');
  const items = ((data ?? []) as CirclePulseRpcRow[]).map(toItem);
  const hydratedItems = await Promise.all(
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
  return await Promise.all(hydratedItems.map(cacheCirclePulseItemMedia));
}

export async function fetchCirclePulseItemSnapshot(itemId: string) {
  const { data, error } = await db.rpc('rpc_get_circle_pulse_item_snapshot', {
    p_item_id: itemId,
  });
  if (error) throw toServiceError(error, 'Circle Pulse item could not load.');
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return null;
  let item = toItem(row as CirclePulseRpcRow);
  if (item.type === 'media' && !item.momentId && item.mediaUrl) {
    const signedMediaUrl = await createSignedCirclePulseMediaUrl(item.mediaUrl);
    const signedImageUrl =
      item.imageUrl && item.imageUrl !== item.mediaUrl
        ? await createSignedCirclePulseMediaUrl(item.imageUrl)
        : item.mediaType === 'image'
          ? signedMediaUrl
          : item.imageUrl;
    item = {
      ...item,
      mediaUrl: signedMediaUrl ?? item.mediaUrl,
      imageUrl: signedImageUrl ?? item.imageUrl,
    };
  }
  return await cacheCirclePulseItemMedia(item);
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
  if (error) throw toServiceError(error, 'Circle Pulse could not be updated.');
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
  if (error) throw toServiceError(error, 'Discussion could not load.');
  const comments = ((data ?? []) as CirclePulseCommentRpcRow[]).map(toComment);
  const { data: reactionRows } = await db.rpc('rpc_get_circle_pulse_comment_reactions', {
    p_pulse_item_id: itemId,
  });
  const reactionByCommentId = new Map(
    ((reactionRows ?? []) as CirclePulseCommentReactionRpcRow[]).map((row) => [String(row.comment_id), row]),
  );
  const mergedComments = comments.map((comment) => {
    const reaction = reactionByCommentId.get(comment.id);
    return {
      ...comment,
      reactionCount: Number(reaction?.reaction_count ?? 0),
      myReaction: reaction?.my_reaction ?? null,
    };
  });
  return await Promise.all(mergedComments.map(hydrateCommentAvatars));
}

export async function fetchCirclePulseCommentsPage(
  itemId: string,
  options?: {
    limit?: number;
    beforeCreatedAt?: string | null;
    beforeId?: string | null;
  },
) {
  const { data, error } = await db.rpc('rpc_get_circle_pulse_comments_page', {
    p_pulse_item_id: itemId,
    p_limit: options?.limit ?? 30,
    p_before_created_at: options?.beforeCreatedAt ?? null,
    p_before_id: options?.beforeId ?? null,
  });
  if (error) throw toServiceError(error, 'Comments could not load.');
  const comments = ((data ?? []) as CirclePulseCommentRpcRow[]).map(toComment);
  return await Promise.all(comments.map(hydrateCommentAvatars));
}

export async function fetchCirclePulseCommentSnapshot(commentId: string) {
  const { data, error } = await db.rpc('rpc_get_circle_pulse_comment_snapshot', {
    p_comment_id: commentId,
  });
  if (error) throw toServiceError(error, 'Comment could not be loaded.');
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error('Comment could not be loaded.');
  return await hydrateCommentAvatars(toComment(row as CirclePulseCommentRpcRow));
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
  if (error) throw toServiceError(error, 'Comment could not be saved.');
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error('Comment could not be saved.');
  return await hydrateCommentAvatars(toComment(row as CirclePulseCommentRpcRow));
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
  if (error) throw toServiceError(error, 'Reaction could not be updated.');
  return data === true;
}

export async function updateCirclePulseComment(commentId: string, actorProfileId: string, body: string) {
  const { data, error } = await db.rpc('rpc_update_circle_pulse_comment', {
    p_comment_id: commentId,
    p_profile_id: actorProfileId,
    p_body: body,
  });
  if (error) throw toServiceError(error, 'Comment could not be updated.');
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error('Comment could not be updated.');
  return await hydrateCommentAvatars(toComment(row as CirclePulseCommentRpcRow));
}

export async function pinCirclePulseComment(
  commentId: string,
  actorProfileId: string,
  pinned = true,
) {
  const { data, error } = await db.rpc('rpc_pin_circle_pulse_comment', {
    p_comment_id: commentId,
    p_profile_id: actorProfileId,
    p_pinned: pinned,
  });
  if (error) throw toServiceError(error, 'Pinned note could not be updated.');
  return data === true;
}

export async function deleteCirclePulseComment(commentId: string, actorProfileId: string) {
  const { error } = await db.rpc('rpc_delete_circle_pulse_comment', {
    p_comment_id: commentId,
    p_profile_id: actorProfileId,
  });
  if (error) throw toServiceError(error, 'Comment could not be removed.');
}

export async function reportCirclePulseComment(commentId: string, actorProfileId: string) {
  const { error } = await db.rpc('rpc_report_circle_pulse_comment', {
    p_comment_id: commentId,
    p_profile_id: actorProfileId,
    p_reason: 'concern',
  });
  if (error) throw toServiceError(error, 'Comment could not be reported.');
}

export async function fetchCirclePulseDiscussionReadState(itemId: string, actorProfileId: string) {
  const { data, error } = await db.rpc('rpc_get_circle_pulse_discussion_read_state', {
    p_pulse_item_id: itemId,
    p_profile_id: actorProfileId,
  });
  if (error) throw toServiceError(error, 'Discussion state could not load.');
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) {
    return {
      itemId,
      lastSeenCommentId: null,
      lastSeenAt: null,
      unreadCount: 0,
    } satisfies CirclePulseDiscussionReadState;
  }
  return toDiscussionReadState(row as CirclePulseDiscussionReadStateRpcRow);
}

export async function fetchCirclePulseDiscussionReadStates(circleId: string, actorProfileId: string) {
  const { data, error } = await db.rpc('rpc_get_circle_pulse_discussion_reads', {
    p_circle_id: circleId,
    p_profile_id: actorProfileId,
  });
  if (error) throw toServiceError(error, 'Discussion states could not load.');
  return ((data ?? []) as CirclePulseDiscussionReadStateRpcRow[]).map(toDiscussionReadState);
}

export async function markCirclePulseDiscussionSeen(
  itemId: string,
  actorProfileId: string,
  options?: {
    lastSeenCommentId?: string | null;
    lastSeenAt?: string | null;
  },
) {
  const { data, error } = await db.rpc('rpc_mark_circle_pulse_discussion_seen', {
    p_pulse_item_id: itemId,
    p_profile_id: actorProfileId,
    p_last_seen_comment_id: options?.lastSeenCommentId ?? null,
    p_last_seen_at: options?.lastSeenAt ?? null,
  });
  if (error) throw toServiceError(error, 'Discussion state could not update.');
  return data === true;
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
