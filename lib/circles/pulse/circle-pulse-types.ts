export type CirclePulseItemType = 'prompt' | 'gathering' | 'welcome' | 'love_seat' | 'media' | 'host_note';

export type CirclePulseItemStatus = 'draft' | 'active' | 'expired' | 'archived';

export type CirclePulseItem = {
  id: string;
  circleId: string;
  type: CirclePulseItemType;
  title: string | null;
  subtitle: string | null;
  body: string | null;
  imageUrl: string | null;
  mediaUrl: string | null;
  mediaType: 'image' | 'video' | 'audio' | null;
  promptId: string | null;
  gatheringId: string | null;
  momentId: string | null;
  loveSeatId: string | null;
  featuredProfileId: string | null;
  featuredProfileName: string | null;
  featuredProfileAge: number | null;
  featuredProfileAvatarUrl: string | null;
  featuredProfileLocation: string | null;
  featuredProfileBadge: string | null;
  loveSeatQuote: string | null;
  welcomeProfiles: CirclePulseWelcomeProfile[];
  status: CirclePulseItemStatus;
  priority: number;
  startsAt: string | null;
  expiresAt: string | null;
  commentCount: number;
  gatheringStartsAt: string | null;
  gatheringCity: string | null;
  gatheringType: string | null;
  gatheringIsPartnerVenue: boolean;
  gatheringSafeFirstDateSpace: boolean;
  gatheringAttendeeCount: number;
  sourceAvailable: boolean;
};

export type CirclePulseWelcomeProfile = {
  profileId: string;
  name: string;
  avatarUrl: string | null;
  location: string | null;
  joinedAt: string;
};

export type CirclePulseFeatureInput =
  | { type: 'prompt'; promptId: string; priority?: number }
  | { type: 'gathering'; gatheringId: string; priority?: number }
  | { type: 'host_note'; title?: string | null; body?: string | null; priority?: number }
  | {
      type: 'media';
      momentId?: string | null;
      title?: string | null;
      subtitle?: string | null;
      body?: string | null;
      imageUrl?: string | null;
      mediaUrl?: string | null;
      mediaType?: 'image' | 'video' | 'audio' | null;
      priority?: number;
    };

export type CirclePulsePromptCandidate = {
  id: string;
  title: string;
  prompt: string;
};

export type CirclePulseGatheringCandidate = {
  id: string;
  title: string;
  description?: string | null;
  startsAt: string;
};

export type CirclePulseMediaCandidate = {
  id: string;
  title: string;
  subtitle?: string | null;
  momentType: string;
  imageUrl?: string | null;
};

export type CirclePulseComment = {
  id: string;
  itemId: string;
  circleId: string;
  profileId: string;
  displayName: string;
  avatarUrl: string | null;
  body: string;
  parentCommentId: string | null;
  createdAt: string;
  updatedAt: string;
  isOwn: boolean;
  canRemove: boolean;
  reportCount: number;
  reactionCount: number;
  myReaction: CirclePulseCommentReaction | null;
};

export type CirclePulseCommentReaction = 'heart' | 'sparkle' | 'support';

export type CircleLoveSeatCandidate = {
  profileId: string;
  name: string;
  age: number | null;
  avatarUrl: string | null;
  location: string | null;
};

export type CircleLoveSeatNomination = {
  id: string;
  circleId: string;
  circleName: string;
  featuredProfileId: string;
  nominatedByProfileId: string | null;
  nominatorName: string;
  quote: string | null;
  reason: string | null;
  status: 'pending_user_approval';
  createdAt: string;
};

export type CircleLoveSeatHostItem = {
  id: string;
  circleId: string;
  featuredProfileId: string;
  featuredProfileName: string;
  featuredProfileAvatarUrl: string | null;
  quote: string | null;
  status: 'pending_user_approval' | 'active';
  createdAt: string;
  respondedAt: string | null;
};

export type CirclePulseCommentReport = {
  commentId: string;
  circleId: string;
  itemId: string;
  itemType: CirclePulseItemType;
  itemTitle: string;
  commentProfileId: string;
  commentAuthorName: string;
  commentBody: string;
  reportCount: number;
  latestReason: string;
  latestReportAt: string;
  status: 'pending' | 'reviewing';
};

export type CirclePulseCommentReportAction = 'reviewing' | 'dismiss' | 'remove';
