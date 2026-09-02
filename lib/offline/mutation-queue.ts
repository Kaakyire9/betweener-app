import { addEventListener, fetch as fetchNetInfo } from '@react-native-community/netinfo';
import { AppState, type AppStateStatus } from 'react-native';

import { ChatRepository, type ChatMessageRow, type ChatPendingOutboxRow } from '@/lib/chat/local/chat-db';
import { createProfileBoostV2, type BoostAudienceMode, type BoostFocusMode, type BoostType } from '@/lib/boosts';
import {
  createCirclePulseComment,
  deleteCirclePulseComment,
  fetchCirclePulseCommentSnapshot,
  pinCirclePulseComment,
  reportCirclePulseComment,
  toggleCirclePulseCommentReaction,
  updateCirclePulseComment,
} from '@/lib/circles/pulse/circle-pulse-service';
import type { CirclePulseCommentReaction } from '@/lib/circles/pulse/circle-pulse-types';
import type { MomentMetadata } from '@/lib/moment-text-style';
import { ChatUploadTransport } from '@/lib/chat/transfer/chat-upload-transport';
import {
  createMomentFromMediaStrict,
  createTextMomentStrict,
  deleteMomentStrict,
} from '@/lib/moments';
import { isLikelyNetworkError } from '@/lib/network';
import { normalizeProfilePhotoUri } from '@/lib/profile/media';
import {
  readCirclePulseCommentsSnapshotState,
  removeCirclePulseCommentSnapshot,
  replaceCirclePulseCommentSnapshotId,
  upsertCirclePulseCommentSnapshot,
} from '@/lib/offline/circle-pulse-comments-store';
import {
  moveMomentCommentsSnapshot,
  moveMomentReactorsSnapshot,
  removeMomentCommentSnapshot,
  removeStagedOfflineMomentUpload,
  replaceMomentCommentSnapshotId,
  replaceMomentInFeedSnapshot,
  replaceOwnMomentSnapshot,
  upsertMomentCommentSnapshot,
} from '@/lib/offline/moments-store';
import { readOfflineData, writeOfflineEnvelope } from '@/lib/offline/core';
import { supabase } from '@/lib/supabase';
import { prepareProfileGuardWrite } from '@/lib/profile-guard/write-payload';

const OFFLINE_MUTATION_QUEUE_KEY = 'offline:mutation-queue:v1';
const OFFLINE_MUTATION_FAILED_KEY = 'offline:mutation-failed:v1';
const MAX_MUTATION_ATTEMPTS = 8;
const AUTO_DRAIN_INTERVAL_MS = 30_000;
const DOCUMENT_TEXT_PREFIX = '\u{1F4CE}';
const RETRY_DELAYS_MS = [
  5_000,
  15_000,
  45_000,
  2 * 60_000,
  5 * 60_000,
  15 * 60_000,
  30 * 60_000,
  60 * 60_000,
];

type SwipeSyncPayload = {
  userId: string;
  targetId: string;
  action: 'LIKE' | 'PASS' | 'SUPERLIKE';
  mirrorIntent: boolean;
  message?: string | null;
};

type ProfileImageReactionSyncPayload = {
  profileId: string;
  imageUrl: string;
  reactorUserId: string;
  emoji: string | null;
};

type ChatTextSendPayload = {
  senderId: string;
  receiverId: string;
  text: string;
  clientMessageId?: string | null;
  replyToMessageId?: string | null;
};

type ChatReactionSyncPayload = {
  messageId: string;
  userId: string;
  emoji: string | null;
};

type ChatMediaSendPayload = {
  senderId: string;
  receiverId: string;
  clientMessageId?: string | null;
  localUri: string;
  fileName: string;
  contentType: string;
  mediaType: 'image' | 'video' | 'document';
  replyToMessageId?: string | null;
  documentName?: string | null;
  documentSizeLabel?: string | null;
  documentTypeLabel?: string | null;
};

type ChatVoiceSendPayload = {
  senderId: string;
  receiverId: string;
  clientMessageId?: string | null;
  localUri: string;
  fileName: string;
  contentType: string;
  durationSeconds: number;
  waveform: number[];
  replyToMessageId?: string | null;
};

type IntentRequestCreatePayload = {
  recipientId: string;
  type: 'connect' | 'date_request' | 'like_with_note' | 'circle_intro';
  message?: string | null;
  suggestedTime?: string | null;
  suggestedPlace?: string | null;
  metadata?: Record<string, unknown> | null;
};

type IntentRequestDecisionPayload = {
  requestId: string;
  decision: 'accept' | 'pass';
  insertAcceptanceSystemMessages?: boolean;
};

type IntentRequestCancelPayload = {
  requestId: string;
};

type ProfileUpdatePayload = {
  userId: string;
  updates: Record<string, unknown>;
  updatedAt: string;
};

type ProfileInterestsUpdatePayload = {
  profileId: string;
  interests: string[];
};

type LocalProfileMediaUpload = {
  localUri: string;
  fileName: string;
  contentType: string;
};

type ProfileMediaSyncPayload = {
  userId: string;
  avatar?: LocalProfileMediaUpload | null;
  hero?: LocalProfileMediaUpload | null;
  heroImageUrl?: string | null;
  photos?: string[] | null;
  photoItems?: LocalProfileMediaUpload[];
  video?: (LocalProfileMediaUpload & { previousPath?: string | null }) | null;
  updatedAt: string;
};

type NotificationPrefsUpdatePayload = {
  userId: string;
  prefs: Record<string, boolean | string>;
  updatedAt: string;
};

type ProfileGiftSendPayload = {
  recipientProfileId: string;
  giftType: string;
  includeSandboxPreview?: boolean;
  clientNonce: string;
};

type ProfileGiftRevealPayload = {
  giftId: string;
};

type ProfileGiftArchivePayload = {
  giftId: string;
};

type ProfileBoostCreatePayload = {
  ownerProfileId: string;
  boostType: BoostType;
  audienceMode: BoostAudienceMode;
  focusMode: BoostFocusMode;
  metadata?: Record<string, unknown> | null;
};

export type MomentTextCreatePayload = {
  tempId: string;
  userId: string;
  textBody: string;
  caption?: string | null;
  visibility?: 'public' | 'matches' | 'vibe_check_approved' | 'private';
  metadata?: MomentMetadata | Record<string, unknown> | null;
  createdAt: string;
  expiresAt: string;
};

export type MomentMediaCreatePayload = {
  tempId: string;
  userId: string;
  type: 'photo' | 'video';
  localUri: string;
  fileName: string;
  contentType: string;
  caption?: string | null;
  visibility?: 'public' | 'matches' | 'vibe_check_approved' | 'private';
  metadata?: MomentMetadata | Record<string, unknown> | null;
  createdAt: string;
  expiresAt: string;
};

export type MomentDeletePayload = {
  userId: string;
  momentId: string;
  mediaPath?: string | null;
};

export type MomentReactionSyncPayload = {
  momentId: string;
  userId: string;
  emoji: string | null;
  previousEmoji?: string | null;
};

export type MomentCommentCreatePayload = {
  tempId: string;
  momentId: string;
  userId: string;
  body: string;
  parentCommentId?: string | null;
  createdAt: string;
};

export type MomentCommentUpdatePayload = {
  commentId: string;
  momentId: string;
  userId: string;
  body: string;
  updatedAt: string;
};

export type MomentCommentDeletePayload = {
  commentId: string;
  momentId: string;
  userId: string;
  deletedAt: string;
};

export type MomentCommentReactionSyncPayload = {
  commentId: string;
  momentId: string;
  userId: string;
  reaction: 'heart' | 'laugh' | 'love' | 'fire' | 'clap' | null;
  previousReaction?: 'heart' | 'laugh' | 'love' | 'fire' | 'clap' | null;
  syncedAt: string;
};

export type CirclePulseCommentCreatePayload = {
  tempId: string;
  itemId: string;
  actorProfileId: string;
  body: string;
  parentCommentId?: string | null;
  createdAt: string;
};

export type CirclePulseCommentUpdatePayload = {
  commentId: string;
  itemId: string;
  actorProfileId: string;
  body: string;
  updatedAt: string;
};

export type CirclePulseCommentDeletePayload = {
  commentId: string;
  itemId: string;
  actorProfileId: string;
  deletedAt: string;
};

export type CirclePulseCommentReactionSyncPayload = {
  commentId: string;
  itemId: string;
  actorProfileId: string;
  reaction: CirclePulseCommentReaction | null;
  syncedAt: string;
};

export type CirclePulseCommentPinSyncPayload = {
  commentId: string;
  itemId: string;
  actorProfileId: string;
  pinned: boolean;
  syncedAt: string;
};

export type CirclePulseCommentReportSyncPayload = {
  commentId: string;
  itemId: string;
  actorProfileId: string;
  syncedAt: string;
};

export type OfflineMutation =
  | {
      id: string;
      dedupeKey: string;
      kind: 'swipe_sync';
      createdAt: number;
      attempts: number;
      lastAttemptAt?: number | null;
      nextAttemptAt?: number | null;
      lastError?: string | null;
      payload: SwipeSyncPayload;
    }
  | {
      id: string;
      dedupeKey: string;
      kind: 'profile_image_reaction_sync';
      createdAt: number;
      attempts: number;
      lastAttemptAt?: number | null;
      nextAttemptAt?: number | null;
      lastError?: string | null;
      payload: ProfileImageReactionSyncPayload;
    }
  | {
      id: string;
      dedupeKey: string;
      kind: 'chat_text_send';
      createdAt: number;
      attempts: number;
      lastAttemptAt?: number | null;
      nextAttemptAt?: number | null;
      lastError?: string | null;
      payload: ChatTextSendPayload;
    }
  | {
      id: string;
      dedupeKey: string;
      kind: 'chat_reaction_sync';
      createdAt: number;
      attempts: number;
      lastAttemptAt?: number | null;
      nextAttemptAt?: number | null;
      lastError?: string | null;
      payload: ChatReactionSyncPayload;
    }
  | {
      id: string;
      dedupeKey: string;
      kind: 'chat_media_send';
      createdAt: number;
      attempts: number;
      lastAttemptAt?: number | null;
      nextAttemptAt?: number | null;
      lastError?: string | null;
      payload: ChatMediaSendPayload;
    }
  | {
      id: string;
      dedupeKey: string;
      kind: 'chat_voice_send';
      createdAt: number;
      attempts: number;
      lastAttemptAt?: number | null;
      nextAttemptAt?: number | null;
      lastError?: string | null;
      payload: ChatVoiceSendPayload;
    }
  | {
      id: string;
      dedupeKey: string;
      kind: 'intent_request_create';
      createdAt: number;
      attempts: number;
      lastAttemptAt?: number | null;
      nextAttemptAt?: number | null;
      lastError?: string | null;
      payload: IntentRequestCreatePayload;
    }
  | {
      id: string;
      dedupeKey: string;
      kind: 'intent_request_decision';
      createdAt: number;
      attempts: number;
      lastAttemptAt?: number | null;
      nextAttemptAt?: number | null;
      lastError?: string | null;
      payload: IntentRequestDecisionPayload;
    }
  | {
      id: string;
      dedupeKey: string;
      kind: 'intent_request_cancel';
      createdAt: number;
      attempts: number;
      lastAttemptAt?: number | null;
      nextAttemptAt?: number | null;
      lastError?: string | null;
      payload: IntentRequestCancelPayload;
    }
  | {
      id: string;
      dedupeKey: string;
      kind: 'profile_update';
      createdAt: number;
      attempts: number;
      lastAttemptAt?: number | null;
      nextAttemptAt?: number | null;
      lastError?: string | null;
      payload: ProfileUpdatePayload;
    }
  | {
      id: string;
      dedupeKey: string;
      kind: 'profile_interests_update';
      createdAt: number;
      attempts: number;
      lastAttemptAt?: number | null;
      nextAttemptAt?: number | null;
      lastError?: string | null;
      payload: ProfileInterestsUpdatePayload;
    }
  | {
      id: string;
      dedupeKey: string;
      kind: 'profile_media_sync';
      createdAt: number;
      attempts: number;
      lastAttemptAt?: number | null;
      nextAttemptAt?: number | null;
      lastError?: string | null;
      payload: ProfileMediaSyncPayload;
    }
  | {
      id: string;
      dedupeKey: string;
      kind: 'notification_prefs_update';
      createdAt: number;
      attempts: number;
      lastAttemptAt?: number | null;
      nextAttemptAt?: number | null;
      lastError?: string | null;
      payload: NotificationPrefsUpdatePayload;
    }
  | {
      id: string;
      dedupeKey: string;
      kind: 'profile_gift_send';
      createdAt: number;
      attempts: number;
      lastAttemptAt?: number | null;
      nextAttemptAt?: number | null;
      lastError?: string | null;
      payload: ProfileGiftSendPayload;
    }
  | {
      id: string;
      dedupeKey: string;
      kind: 'profile_gift_reveal';
      createdAt: number;
      attempts: number;
      lastAttemptAt?: number | null;
      nextAttemptAt?: number | null;
      lastError?: string | null;
      payload: ProfileGiftRevealPayload;
    }
  | {
      id: string;
      dedupeKey: string;
      kind: 'profile_gift_archive';
      createdAt: number;
      attempts: number;
      lastAttemptAt?: number | null;
      nextAttemptAt?: number | null;
      lastError?: string | null;
      payload: ProfileGiftArchivePayload;
    }
  | {
      id: string;
      dedupeKey: string;
      kind: 'profile_boost_create';
      createdAt: number;
      attempts: number;
      lastAttemptAt?: number | null;
      nextAttemptAt?: number | null;
      lastError?: string | null;
      payload: ProfileBoostCreatePayload;
    }
  | {
      id: string;
      dedupeKey: string;
      kind: 'moment_text_create';
      createdAt: number;
      attempts: number;
      lastAttemptAt?: number | null;
      nextAttemptAt?: number | null;
      lastError?: string | null;
      payload: MomentTextCreatePayload;
    }
  | {
      id: string;
      dedupeKey: string;
      kind: 'moment_media_create';
      createdAt: number;
      attempts: number;
      lastAttemptAt?: number | null;
      nextAttemptAt?: number | null;
      lastError?: string | null;
      payload: MomentMediaCreatePayload;
    }
  | {
      id: string;
      dedupeKey: string;
      kind: 'moment_delete';
      createdAt: number;
      attempts: number;
      lastAttemptAt?: number | null;
      nextAttemptAt?: number | null;
      lastError?: string | null;
      payload: MomentDeletePayload;
    }
  | {
      id: string;
      dedupeKey: string;
      kind: 'moment_reaction_sync';
      createdAt: number;
      attempts: number;
      lastAttemptAt?: number | null;
      nextAttemptAt?: number | null;
      lastError?: string | null;
      payload: MomentReactionSyncPayload;
    }
  | {
      id: string;
      dedupeKey: string;
      kind: 'moment_comment_create';
      createdAt: number;
      attempts: number;
      lastAttemptAt?: number | null;
      nextAttemptAt?: number | null;
      lastError?: string | null;
      payload: MomentCommentCreatePayload;
    }
  | {
      id: string;
      dedupeKey: string;
      kind: 'moment_comment_update';
      createdAt: number;
      attempts: number;
      lastAttemptAt?: number | null;
      nextAttemptAt?: number | null;
      lastError?: string | null;
      payload: MomentCommentUpdatePayload;
    }
  | {
      id: string;
      dedupeKey: string;
      kind: 'moment_comment_delete';
      createdAt: number;
      attempts: number;
      lastAttemptAt?: number | null;
      nextAttemptAt?: number | null;
      lastError?: string | null;
      payload: MomentCommentDeletePayload;
    }
  | {
      id: string;
      dedupeKey: string;
      kind: 'moment_comment_reaction_sync';
      createdAt: number;
      attempts: number;
      lastAttemptAt?: number | null;
      nextAttemptAt?: number | null;
      lastError?: string | null;
      payload: MomentCommentReactionSyncPayload;
    }
  | {
      id: string;
      dedupeKey: string;
      kind: 'circle_pulse_comment_create';
      createdAt: number;
      attempts: number;
      lastAttemptAt?: number | null;
      nextAttemptAt?: number | null;
      lastError?: string | null;
      payload: CirclePulseCommentCreatePayload;
    }
  | {
      id: string;
      dedupeKey: string;
      kind: 'circle_pulse_comment_update';
      createdAt: number;
      attempts: number;
      lastAttemptAt?: number | null;
      nextAttemptAt?: number | null;
      lastError?: string | null;
      payload: CirclePulseCommentUpdatePayload;
    }
  | {
      id: string;
      dedupeKey: string;
      kind: 'circle_pulse_comment_delete';
      createdAt: number;
      attempts: number;
      lastAttemptAt?: number | null;
      nextAttemptAt?: number | null;
      lastError?: string | null;
      payload: CirclePulseCommentDeletePayload;
    }
  | {
      id: string;
      dedupeKey: string;
      kind: 'circle_pulse_comment_reaction_sync';
      createdAt: number;
      attempts: number;
      lastAttemptAt?: number | null;
      nextAttemptAt?: number | null;
      lastError?: string | null;
      payload: CirclePulseCommentReactionSyncPayload;
    }
  | {
      id: string;
      dedupeKey: string;
      kind: 'circle_pulse_comment_pin_sync';
      createdAt: number;
      attempts: number;
      lastAttemptAt?: number | null;
      nextAttemptAt?: number | null;
      lastError?: string | null;
      payload: CirclePulseCommentPinSyncPayload;
    }
  | {
      id: string;
      dedupeKey: string;
      kind: 'circle_pulse_comment_report_sync';
      createdAt: number;
      attempts: number;
      lastAttemptAt?: number | null;
      nextAttemptAt?: number | null;
      lastError?: string | null;
      payload: CirclePulseCommentReportSyncPayload;
    };

export type FailedOfflineMutation = OfflineMutation & {
  failedAt: number;
  failureReason: string;
};

type QueueListener = (size: number) => void;
type QueueMutationEvent =
  | { type: 'completed'; mutation: OfflineMutation }
  | { type: 'failed'; mutation: FailedOfflineMutation }
  | { type: 'queued'; mutation: OfflineMutation };
type QueueMutationListener = (event: QueueMutationEvent) => void;

const listeners = new Set<QueueListener>();
const mutationListeners = new Set<QueueMutationListener>();
let drainInFlight: Promise<void> | null = null;

const emitQueueSize = (size: number) => {
  listeners.forEach((listener) => {
    try {
      listener(size);
    } catch {
      // ignore listener failures
    }
  });
};

const emitMutationEvent = (event: QueueMutationEvent) => {
  mutationListeners.forEach((listener) => {
    try {
      listener(event);
    } catch {
      // ignore listener errors
    }
  });
};

const buildOfflineMutationId = () =>
  `mutation:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`;

const buildSwipeDedupeKey = (payload: SwipeSyncPayload) =>
  `swipe_sync:${payload.userId}:${payload.targetId}`;

const buildProfileImageReactionDedupeKey = (payload: ProfileImageReactionSyncPayload) =>
  `profile_image_reaction_sync:${payload.profileId}:${payload.imageUrl}:${payload.reactorUserId}`;

const buildChatTextSendDedupeKey = (payload: ChatTextSendPayload) => {
  const stablePart =
    payload.clientMessageId ??
    `${payload.text.trim().toLowerCase()}:${payload.replyToMessageId ?? 'root'}:${Date.now()}`;
  return `chat_text_send:${payload.senderId}:${payload.receiverId}:${stablePart}`;
};

const buildChatReactionDedupeKey = (payload: ChatReactionSyncPayload) =>
  `chat_reaction_sync:${payload.messageId}:${payload.userId}`;

const buildChatMediaSendDedupeKey = (payload: ChatMediaSendPayload) =>
  `chat_media_send:${payload.senderId}:${payload.receiverId}:${payload.clientMessageId ?? `${payload.localUri}:${Date.now()}`}`;

const buildChatVoiceSendDedupeKey = (payload: ChatVoiceSendPayload) =>
  `chat_voice_send:${payload.senderId}:${payload.receiverId}:${payload.clientMessageId ?? `${payload.localUri}:${Date.now()}`}`;

const buildIntentRequestCreateDedupeKey = (payload: IntentRequestCreatePayload) =>
  `intent_request_create:${payload.recipientId}:${payload.type}:${String(payload.message ?? '').trim().toLowerCase()}:${Date.now()}`;

const buildIntentRequestDecisionDedupeKey = (payload: IntentRequestDecisionPayload) =>
  `intent_request_decision:${payload.requestId}`;

const buildIntentRequestCancelDedupeKey = (payload: IntentRequestCancelPayload) =>
  `intent_request_cancel:${payload.requestId}`;

const buildProfileUpdateDedupeKey = (payload: ProfileUpdatePayload) =>
  `profile_update:${payload.userId}`;

const buildProfileInterestsUpdateDedupeKey = (payload: ProfileInterestsUpdatePayload) =>
  `profile_interests_update:${payload.profileId}`;

const buildProfileMediaSyncDedupeKey = (payload: ProfileMediaSyncPayload) =>
  `profile_media_sync:${payload.userId}`;

const buildNotificationPrefsUpdateDedupeKey = (payload: NotificationPrefsUpdatePayload) =>
  `notification_prefs_update:${payload.userId}`;

const buildProfileGiftSendDedupeKey = (payload: ProfileGiftSendPayload) =>
  `profile_gift_send:${payload.recipientProfileId}:${payload.giftType}:${payload.clientNonce}`;

const buildProfileGiftRevealDedupeKey = (payload: ProfileGiftRevealPayload) =>
  `profile_gift_reveal:${payload.giftId}`;

const buildProfileGiftArchiveDedupeKey = (payload: ProfileGiftArchivePayload) =>
  `profile_gift_archive:${payload.giftId}`;

const buildProfileBoostCreateDedupeKey = (payload: ProfileBoostCreatePayload) =>
  `profile_boost_create:${payload.ownerProfileId}`;

const buildMomentTextCreateDedupeKey = (payload: MomentTextCreatePayload) =>
  `moment_text_create:${payload.tempId}`;

const buildMomentMediaCreateDedupeKey = (payload: MomentMediaCreatePayload) =>
  `moment_media_create:${payload.tempId}`;

const buildMomentDeleteDedupeKey = (payload: MomentDeletePayload) =>
  `moment_delete:${payload.momentId}`;

const buildMomentReactionSyncDedupeKey = (payload: MomentReactionSyncPayload) =>
  `moment_reaction_sync:${payload.momentId}:${payload.userId}`;

const buildMomentCommentCreateDedupeKey = (payload: MomentCommentCreatePayload) =>
  `moment_comment_create:${payload.tempId}`;

const buildMomentCommentUpdateDedupeKey = (payload: MomentCommentUpdatePayload) =>
  `moment_comment_update:${payload.commentId}`;

const buildMomentCommentDeleteDedupeKey = (payload: MomentCommentDeletePayload) =>
  `moment_comment_delete:${payload.commentId}`;

const buildMomentCommentReactionSyncDedupeKey = (payload: MomentCommentReactionSyncPayload) =>
  `moment_comment_reaction_sync:${payload.commentId}:${payload.userId}`;

const buildCirclePulseCommentCreateDedupeKey = (payload: CirclePulseCommentCreatePayload) =>
  `circle_pulse_comment_create:${payload.tempId}`;

const buildCirclePulseCommentUpdateDedupeKey = (payload: CirclePulseCommentUpdatePayload) =>
  `circle_pulse_comment_update:${payload.commentId}`;

const buildCirclePulseCommentDeleteDedupeKey = (payload: CirclePulseCommentDeletePayload) =>
  `circle_pulse_comment_delete:${payload.commentId}`;

const buildCirclePulseCommentReactionSyncDedupeKey = (payload: CirclePulseCommentReactionSyncPayload) =>
  `circle_pulse_comment_reaction_sync:${payload.commentId}:${payload.actorProfileId}`;

const buildCirclePulseCommentPinSyncDedupeKey = (payload: CirclePulseCommentPinSyncPayload) =>
  `circle_pulse_comment_pin_sync:${payload.itemId}:${payload.actorProfileId}`;

const buildCirclePulseCommentReportSyncDedupeKey = (payload: CirclePulseCommentReportSyncPayload) =>
  `circle_pulse_comment_report_sync:${payload.commentId}:${payload.actorProfileId}`;

export const isOfflineMomentId = (momentId?: string | null) =>
  typeof momentId === 'string' && momentId.startsWith('offline-moment:');

export const isOfflineMomentCommentId = (commentId?: string | null) =>
  typeof commentId === 'string' && commentId.startsWith('offline-comment:');

export const isOfflineCirclePulseCommentId = (commentId?: string | null) =>
  typeof commentId === 'string' && commentId.startsWith('offline-circle-pulse-comment:');

const stringifyMutationError = (error: unknown) => {
  const message =
    typeof error === 'string'
      ? error
      : (error as any)?.message || (error as any)?.error_description || (error as any)?.details || 'mutation_failed';
  const code = (error as any)?.code || (error as any)?.status || (error as any)?.name;
  return [code, message].filter(Boolean).join(': ').slice(0, 500);
};

const isExpiredMomentCreateMutation = (
  mutation: OfflineMutation | FailedOfflineMutation,
) =>
  (mutation.kind === 'moment_text_create' || mutation.kind === 'moment_media_create') &&
  new Date(mutation.payload.expiresAt).getTime() <= Date.now();

const isMomentInteractionMutation = (
  mutation: OfflineMutation | FailedOfflineMutation,
): mutation is Extract<
  OfflineMutation | FailedOfflineMutation,
  {
    kind:
      | 'moment_reaction_sync'
      | 'moment_comment_create'
      | 'moment_comment_update'
      | 'moment_comment_delete'
      | 'moment_comment_reaction_sync';
  }
> =>
  mutation.kind === 'moment_reaction_sync' ||
  mutation.kind === 'moment_comment_create' ||
  mutation.kind === 'moment_comment_update' ||
  mutation.kind === 'moment_comment_delete' ||
  mutation.kind === 'moment_comment_reaction_sync';

const isMomentCreateMutation = (
  mutation: OfflineMutation | FailedOfflineMutation,
): mutation is Extract<
  OfflineMutation | FailedOfflineMutation,
  { kind: 'moment_text_create' | 'moment_media_create' }
> => mutation.kind === 'moment_text_create' || mutation.kind === 'moment_media_create';

const isMomentDeleteMutation = (
  mutation: OfflineMutation | FailedOfflineMutation,
): mutation is Extract<
  OfflineMutation | FailedOfflineMutation,
  { kind: 'moment_delete' }
> => mutation.kind === 'moment_delete';

const isCirclePulseCommentMutation = (
  mutation: OfflineMutation | FailedOfflineMutation,
): mutation is Extract<
  OfflineMutation | FailedOfflineMutation,
  {
    kind:
      | 'circle_pulse_comment_create'
      | 'circle_pulse_comment_update'
      | 'circle_pulse_comment_delete'
      | 'circle_pulse_comment_reaction_sync'
      | 'circle_pulse_comment_pin_sync'
      | 'circle_pulse_comment_report_sync';
  }
> =>
  mutation.kind === 'circle_pulse_comment_create' ||
  mutation.kind === 'circle_pulse_comment_update' ||
  mutation.kind === 'circle_pulse_comment_delete' ||
  mutation.kind === 'circle_pulse_comment_reaction_sync' ||
  mutation.kind === 'circle_pulse_comment_pin_sync' ||
  mutation.kind === 'circle_pulse_comment_report_sync';

const shouldDropStaleQueuedMutation = (
  mutation: OfflineMutation | FailedOfflineMutation,
  allMutations: (OfflineMutation | FailedOfflineMutation)[],
) => {
  if (isExpiredMomentCreateMutation(mutation)) return true;

  if (isMomentInteractionMutation(mutation)) {
    const momentId = mutation.payload.momentId;
    if (isOfflineMomentId(momentId)) {
      const hasBackingCreate = allMutations.some(
        (item) => isMomentCreateMutation(item) && item.payload.tempId === momentId,
      );
      if (!hasBackingCreate) return true;
    }
    const hasDelete = allMutations.some(
      (item) => isMomentDeleteMutation(item) && item.payload.momentId === momentId,
    );
    if (hasDelete) return true;

    if (
      (
        mutation.kind === 'moment_comment_update' ||
        mutation.kind === 'moment_comment_delete' ||
        mutation.kind === 'moment_comment_reaction_sync'
      ) &&
      isOfflineMomentCommentId(mutation.payload.commentId)
    ) {
      const hasBackingCommentCreate = allMutations.some(
        (item) =>
          item.kind === 'moment_comment_create' && item.payload.tempId === mutation.payload.commentId,
      );
      if (!hasBackingCommentCreate) return true;
    }
  }

  if (isMomentDeleteMutation(mutation) && isOfflineMomentId(mutation.payload.momentId)) {
    const hasBackingCreate = allMutations.some(
      (item) => isMomentCreateMutation(item) && item.payload.tempId === mutation.payload.momentId,
    );
    if (!hasBackingCreate) return true;
  }

  if (isCirclePulseCommentMutation(mutation)) {
    if (
      (mutation.kind === 'circle_pulse_comment_update' ||
        mutation.kind === 'circle_pulse_comment_delete' ||
        mutation.kind === 'circle_pulse_comment_reaction_sync' ||
        mutation.kind === 'circle_pulse_comment_pin_sync' ||
        mutation.kind === 'circle_pulse_comment_report_sync') &&
      isOfflineCirclePulseCommentId(mutation.payload.commentId)
    ) {
      const hasBackingCommentCreate = allMutations.some(
        (item) =>
          item.kind === 'circle_pulse_comment_create' &&
          item.payload.tempId === mutation.payload.commentId,
      );
      if (!hasBackingCommentCreate) return true;
    }
  }

  return false;
};

async function pruneStaleQueuedMutationsFromQueues() {
  const [pendingQueue, failedQueue] = await Promise.all([
    readMutationQueue(),
    readFailedMutationQueue(),
  ]);
  const allMutations = [...pendingQueue, ...failedQueue];
  const nextPending = pendingQueue.filter((mutation) => !shouldDropStaleQueuedMutation(mutation, allMutations));
  const nextFailed = failedQueue.filter((mutation) => !shouldDropStaleQueuedMutation(mutation, allMutations));

  if (nextPending.length !== pendingQueue.length) {
    await writeMutationQueue(nextPending);
  }
  if (nextFailed.length !== failedQueue.length) {
    await writeFailedMutationQueue(nextFailed);
  }

  return { pending: nextPending, failed: nextFailed };
}

const getRetryDelayMs = (attempts: number) => {
  const index = Math.max(0, Math.min(attempts - 1, RETRY_DELAYS_MS.length - 1));
  return RETRY_DELAYS_MS[index] ?? RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1]!;
};

const isRetryableMutationError = (error: unknown) => {
  if (isLikelyNetworkError(error)) return true;
  const status = Number((error as any)?.status ?? (error as any)?.statusCode ?? 0);
  if ([408, 425, 429].includes(status)) return true;
  if (status >= 500 && status <= 599) return true;
  const lower = String((error as any)?.message || error || '').toLowerCase();
  return (
    lower.includes('jwt expired') ||
    lower.includes('pgrst303') ||
    lower.includes('invalid jwt') ||
    lower.includes('refresh token') ||
    lower.includes('session expired') ||
    lower.includes('not authenticated') ||
    lower.includes('unauthorized') ||
    lower.includes('unauthenticated_storage') ||
    lower.includes('temporarily unavailable') ||
    lower.includes('service unavailable') ||
    lower.includes('too many requests')
  );
};

const isBenignIntentQueueError = (error: unknown) => {
  const lower = String((error as any)?.message || error || '').toLowerCase();
  return (
    lower.includes('already sent') ||
    lower.includes('already placed') ||
    lower.includes('request pending') ||
    lower.includes('already have a request') ||
    lower.includes('already matched') ||
    lower.includes('request not found or expired')
  );
};

async function readMutationQueue(): Promise<OfflineMutation[]> {
  const data = await readOfflineData<OfflineMutation[]>(OFFLINE_MUTATION_QUEUE_KEY);
  return Array.isArray(data)
    ? (data.filter((item) => (item as { kind?: string } | null)?.kind !== 'profile_note_create') as OfflineMutation[])
    : [];
}

async function readFailedMutationQueue(): Promise<FailedOfflineMutation[]> {
  const data = await readOfflineData<FailedOfflineMutation[]>(OFFLINE_MUTATION_FAILED_KEY);
  return Array.isArray(data)
    ? (data.filter((item) => (item as { kind?: string } | null)?.kind !== 'profile_note_create') as FailedOfflineMutation[])
    : [];
}

async function writeMutationQueue(queue: OfflineMutation[]) {
  await writeOfflineEnvelope(OFFLINE_MUTATION_QUEUE_KEY, queue, { kind: 'mutation-queue' });
  emitQueueSize(queue.length);
}

async function writeFailedMutationQueue(queue: FailedOfflineMutation[]) {
  await writeOfflineEnvelope(OFFLINE_MUTATION_FAILED_KEY, queue.slice(-100), { kind: 'mutation-failed' });
}

type LegacyChatSendQueueMutation = Extract<
  OfflineMutation | FailedOfflineMutation,
  { kind: 'chat_text_send' | 'chat_media_send' | 'chat_voice_send' }
>;

const isLegacyChatSendMutation = (
  mutation: OfflineMutation | FailedOfflineMutation,
): mutation is LegacyChatSendQueueMutation =>
  mutation.kind === 'chat_text_send' ||
  mutation.kind === 'chat_media_send' ||
  mutation.kind === 'chat_voice_send';

const toLegacyChatIso = (timestamp?: number | null) => {
  const value = typeof timestamp === 'number' && Number.isFinite(timestamp) ? timestamp : Date.now();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
};

const safeStringifyLegacyChat = (value: unknown) => {
  try {
    return JSON.stringify(value);
  } catch {
    return null;
  }
};

const getLegacyChatLocalMessageId = (mutation: LegacyChatSendQueueMutation) =>
  mutation.payload.clientMessageId || mutation.id;

const getLegacyChatMessageType = (mutation: LegacyChatSendQueueMutation): ChatMessageRow['message_type'] => {
  if (mutation.kind === 'chat_media_send') return mutation.payload.mediaType;
  if (mutation.kind === 'chat_voice_send') return 'voice';
  return 'text';
};

const buildLegacyChatMessageBody = (mutation: LegacyChatSendQueueMutation) => {
  if (mutation.kind === 'chat_text_send') return mutation.payload.text;
  if (mutation.kind === 'chat_media_send' && mutation.payload.mediaType === 'document') {
    return `${DOCUMENT_TEXT_PREFIX} ${[
      mutation.payload.documentName || mutation.payload.fileName,
      mutation.payload.documentSizeLabel,
      mutation.payload.documentTypeLabel,
    ].filter(Boolean).join(' | ')}\n${mutation.payload.localUri}`;
  }
  return mutation.kind === 'chat_media_send' ? mutation.payload.localUri : '';
};

const buildLegacyChatMessageMetadata = (
  mutation: LegacyChatSendQueueMutation,
  localMessageId: string,
  createdAt: string,
  status: 'queued' | 'failed',
) => {
  const base = {
    id: localMessageId,
    clientMessageId: localMessageId,
    senderId: mutation.payload.senderId,
    timestamp: createdAt,
    reactions: [],
    status,
    replyToId: mutation.payload.replyToMessageId ?? null,
  };

  if (mutation.kind === 'chat_text_send') {
    return {
      ...base,
      text: mutation.payload.text,
      type: 'text',
    };
  }

  if (mutation.kind === 'chat_voice_send') {
    return {
      ...base,
      text: '',
      type: 'voice',
      voice: {
        audioPath: mutation.payload.localUri,
        durationSeconds: mutation.payload.durationSeconds,
        waveform: mutation.payload.waveform,
      },
    };
  }

  if (mutation.payload.mediaType === 'document') {
    return {
      ...base,
      text: buildLegacyChatMessageBody(mutation),
      type: 'document',
      document: {
        name: mutation.payload.documentName || mutation.payload.fileName,
        uri: mutation.payload.localUri,
        sizeLabel: mutation.payload.documentSizeLabel ?? null,
        typeLabel: mutation.payload.documentTypeLabel ?? null,
      },
    };
  }

  if (mutation.payload.mediaType === 'video') {
    return {
      ...base,
      text: '',
      type: 'video',
      videoUrl: mutation.payload.localUri,
      offlineVideoUri: mutation.payload.localUri,
    };
  }

  return {
    ...base,
    text: '',
    type: 'image',
    imageUrl: mutation.payload.localUri,
    offlineImageUri: mutation.payload.localUri,
  };
};

const buildLegacyChatMessageRow = (
  mutation: LegacyChatSendQueueMutation,
  failed: boolean,
): ChatMessageRow => {
  const localMessageId = getLegacyChatLocalMessageId(mutation);
  const createdAt = toLegacyChatIso(mutation.createdAt);
  const updatedAt = new Date().toISOString();
  const status: ChatMessageRow['status'] = failed ? 'failed' : 'pending';
  const metadata = buildLegacyChatMessageMetadata(
    mutation,
    localMessageId,
    createdAt,
    failed ? 'failed' : 'queued',
  );

  return {
    id: localMessageId,
    local_id: localMessageId,
    thread_id: mutation.payload.receiverId,
    owner_user_id: mutation.payload.senderId,
    sender_user_id: mutation.payload.senderId,
    receiver_user_id: mutation.payload.receiverId,
    body: buildLegacyChatMessageBody(mutation),
    message_type: getLegacyChatMessageType(mutation),
    status,
    direction: 'outgoing',
    created_at: createdAt,
    server_created_at: null,
    edited_at: null,
    deleted_at: null,
    reply_to_message_id: mutation.payload.replyToMessageId ?? null,
    is_view_once: 0,
    local_only: 1,
    error_code: failed ? 'legacy_queue_failed' : null,
    metadata_json: safeStringifyLegacyChat(metadata),
    remote_updated_at: null,
    local_updated_at: updatedAt,
  };
};

const buildLegacyChatOutboxRow = (
  mutation: LegacyChatSendQueueMutation,
  failed: boolean,
): ChatPendingOutboxRow => {
  const localMessageId = getLegacyChatLocalMessageId(mutation);
  const createdAt = toLegacyChatIso(mutation.createdAt);
  const updatedAt = new Date().toISOString();
  return {
    id: localMessageId,
    local_message_id: localMessageId,
    thread_id: mutation.payload.receiverId,
    owner_user_id: mutation.payload.senderId,
    payload_json: safeStringifyLegacyChat({
      kind: mutation.kind,
      ...mutation.payload,
      clientMessageId: localMessageId,
    }) ?? '{}',
    attempt_count: Math.max(0, mutation.attempts ?? 0),
    max_attempts: MAX_MUTATION_ATTEMPTS,
    next_retry_at: failed ? null : (mutation.nextAttemptAt ? toLegacyChatIso(mutation.nextAttemptAt) : null),
    status: failed ? 'failed' : 'queued',
    error_code: failed ? 'legacy_queue_failed' : null,
    error_message: mutation.lastError ?? ('failureReason' in mutation ? String(mutation.failureReason) : null),
    created_at: createdAt,
    updated_at: updatedAt,
  };
};

const persistLegacyChatSendMutationToSQLiteOutbox = async (
  mutation: LegacyChatSendQueueMutation,
  options?: { failed?: boolean },
) => {
  const failed = Boolean(options?.failed);
  const messageRow = buildLegacyChatMessageRow(mutation, failed);
  const outboxRow = buildLegacyChatOutboxRow(mutation, failed);
  await ChatRepository.upsertMessages(mutation.payload.senderId, mutation.payload.receiverId, [messageRow]);
  await ChatRepository.upsertPendingOutboxItem(mutation.payload.senderId, outboxRow);
};

export async function migrateLegacyChatSendMutationsToSQLiteOutbox() {
  const [pendingQueue, failedQueue] = await Promise.all([
    readMutationQueue(),
    readFailedMutationQueue(),
  ]);

  const pendingChatMutations = pendingQueue.filter(isLegacyChatSendMutation) as LegacyChatSendQueueMutation[];
  const failedChatMutations = failedQueue.filter(isLegacyChatSendMutation) as LegacyChatSendQueueMutation[];

  if (pendingChatMutations.length === 0 && failedChatMutations.length === 0) {
    return { migrated: 0, purged: 0 };
  }

  let migrated = 0;
  for (const mutation of pendingChatMutations) {
    await persistLegacyChatSendMutationToSQLiteOutbox(mutation);
    migrated += 1;
  }
  for (const mutation of failedChatMutations) {
    await persistLegacyChatSendMutationToSQLiteOutbox(mutation, { failed: true });
    migrated += 1;
  }

  await Promise.all([
    writeMutationQueue(pendingQueue.filter((mutation) => !isLegacyChatSendMutation(mutation))),
    writeFailedMutationQueue(failedQueue.filter((mutation) => !isLegacyChatSendMutation(mutation))),
  ]);

  return {
    migrated,
    purged: pendingChatMutations.length + failedChatMutations.length,
  };
}

export async function clearMomentMutationArtifacts(momentId: string) {
  if (!momentId) return;

  const [pendingQueue, failedQueue] = await Promise.all([
    readMutationQueue(),
    readFailedMutationQueue(),
  ]);

  const shouldKeep = (item: OfflineMutation | FailedOfflineMutation) => {
    if (
      item.kind === 'moment_reaction_sync' ||
      item.kind === 'moment_comment_create' ||
      item.kind === 'moment_comment_update' ||
      item.kind === 'moment_comment_delete' ||
      item.kind === 'moment_comment_reaction_sync' ||
      item.kind === 'moment_delete'
    ) {
      return item.payload.momentId !== momentId;
    }
    if ((item.kind === 'moment_text_create' || item.kind === 'moment_media_create') && item.payload.tempId === momentId) {
      return false;
    }
    return true;
  };

  const nextPending = pendingQueue.filter(shouldKeep);
  const nextFailed = failedQueue.filter(shouldKeep);

  await Promise.all([
    nextPending.length === pendingQueue.length ? Promise.resolve() : writeMutationQueue(nextPending),
    nextFailed.length === failedQueue.length ? Promise.resolve() : writeFailedMutationQueue(nextFailed),
  ]);
}

export async function clearMomentCommentMutationArtifacts(commentId: string) {
  if (!commentId) return;

  const [pendingQueue, failedQueue] = await Promise.all([
    readMutationQueue(),
    readFailedMutationQueue(),
  ]);

  const shouldKeep = (item: OfflineMutation | FailedOfflineMutation) => {
    if (
      item.kind === 'moment_comment_create' &&
      item.payload.tempId === commentId
    ) {
      return false;
    }
    if (
      (item.kind === 'moment_comment_update' || item.kind === 'moment_comment_delete') &&
      item.payload.commentId === commentId
    ) {
      return false;
    }
    if (item.kind === 'moment_comment_reaction_sync' && item.payload.commentId === commentId) {
      return false;
    }
    return true;
  };

  const nextPending = pendingQueue.filter(shouldKeep);
  const nextFailed = failedQueue.filter(shouldKeep);

  await Promise.all([
    nextPending.length === pendingQueue.length ? Promise.resolve() : writeMutationQueue(nextPending),
    nextFailed.length === failedQueue.length ? Promise.resolve() : writeFailedMutationQueue(nextFailed),
  ]);
}

export async function clearCirclePulseCommentMutationArtifacts(commentId: string) {
  if (!commentId) return;

  const [pendingQueue, failedQueue] = await Promise.all([
    readMutationQueue(),
    readFailedMutationQueue(),
  ]);

  const shouldKeep = (item: OfflineMutation | FailedOfflineMutation) => {
    if (
      item.kind === 'circle_pulse_comment_create' &&
      item.payload.tempId === commentId
    ) {
      return false;
    }
    if (
      (item.kind === 'circle_pulse_comment_update' ||
        item.kind === 'circle_pulse_comment_delete' ||
        item.kind === 'circle_pulse_comment_reaction_sync' ||
        item.kind === 'circle_pulse_comment_pin_sync' ||
        item.kind === 'circle_pulse_comment_report_sync') &&
      item.payload.commentId === commentId
    ) {
      return false;
    }
    return true;
  };

  const nextPending = pendingQueue.filter(shouldKeep);
  const nextFailed = failedQueue.filter(shouldKeep);

  await Promise.all([
    nextPending.length === pendingQueue.length ? Promise.resolve() : writeMutationQueue(nextPending),
    nextFailed.length === failedQueue.length ? Promise.resolve() : writeFailedMutationQueue(nextFailed),
  ]);
}

const remapMomentReferenceOnMutation = (
  mutation: OfflineMutation | FailedOfflineMutation,
  tempMomentId: string,
  realMomentId: string,
) => {
  if (mutation.kind === 'moment_reaction_sync' && mutation.payload.momentId === tempMomentId) {
    return {
      ...mutation,
      dedupeKey: buildMomentReactionSyncDedupeKey({
        ...mutation.payload,
        momentId: realMomentId,
      }),
      payload: {
        ...mutation.payload,
        momentId: realMomentId,
      },
    };
  }

  if (mutation.kind === 'moment_comment_create' && mutation.payload.momentId === tempMomentId) {
    return {
      ...mutation,
      payload: {
        ...mutation.payload,
        momentId: realMomentId,
      },
    };
  }

  if (
    (mutation.kind === 'moment_comment_update' || mutation.kind === 'moment_comment_delete') &&
    mutation.payload.momentId === tempMomentId
  ) {
    return {
      ...mutation,
      payload: {
        ...mutation.payload,
        momentId: realMomentId,
      },
    };
  }

  if (mutation.kind === 'moment_delete' && mutation.payload.momentId === tempMomentId) {
    return {
      ...mutation,
      dedupeKey: buildMomentDeleteDedupeKey({
        ...mutation.payload,
        momentId: realMomentId,
      }),
      payload: {
        ...mutation.payload,
        momentId: realMomentId,
      },
    };
  }

  return mutation;
};

async function remapMomentReferenceAcrossQueues(tempMomentId: string, realMomentId: string) {
  if (!tempMomentId || !realMomentId || tempMomentId === realMomentId) return;

  const [pendingQueue, failedQueue] = await Promise.all([
    readMutationQueue(),
    readFailedMutationQueue(),
  ]);

  const nextPending = pendingQueue.map((mutation) =>
    remapMomentReferenceOnMutation(mutation, tempMomentId, realMomentId) as OfflineMutation,
  );
  const nextFailed = failedQueue.map((mutation) =>
    remapMomentReferenceOnMutation(mutation, tempMomentId, realMomentId) as FailedOfflineMutation,
  );

  await Promise.all([
    writeMutationQueue(nextPending),
    writeFailedMutationQueue(nextFailed),
  ]);
}

const remapCommentReferenceOnMutation = (
  mutation: OfflineMutation | FailedOfflineMutation,
  tempCommentId: string,
  realCommentId: string,
) => {
  if (mutation.kind === 'moment_comment_create' && mutation.payload.tempId === tempCommentId) {
    return {
      ...mutation,
      dedupeKey: buildMomentCommentCreateDedupeKey({
        ...mutation.payload,
        tempId: realCommentId,
      }),
      payload: {
        ...mutation.payload,
        tempId: realCommentId,
      },
    };
  }

  if (mutation.kind === 'moment_comment_update' && mutation.payload.commentId === tempCommentId) {
    return {
      ...mutation,
      dedupeKey: buildMomentCommentUpdateDedupeKey({
        ...mutation.payload,
        commentId: realCommentId,
      }),
      payload: {
        ...mutation.payload,
        commentId: realCommentId,
      },
    };
  }

  if (mutation.kind === 'moment_comment_delete' && mutation.payload.commentId === tempCommentId) {
    return {
      ...mutation,
      dedupeKey: buildMomentCommentDeleteDedupeKey({
        ...mutation.payload,
        commentId: realCommentId,
      }),
      payload: {
        ...mutation.payload,
        commentId: realCommentId,
      },
    };
  }

  return mutation;
};

const remapCirclePulseCommentReferenceOnMutation = (
  mutation: OfflineMutation | FailedOfflineMutation,
  tempCommentId: string,
  realCommentId: string,
) => {
  if (mutation.kind === 'circle_pulse_comment_create' && mutation.payload.tempId === tempCommentId) {
    return {
      ...mutation,
      dedupeKey: buildCirclePulseCommentCreateDedupeKey({
        ...mutation.payload,
        tempId: realCommentId,
      }),
      payload: {
        ...mutation.payload,
        tempId: realCommentId,
      },
    };
  }

  if (mutation.kind === 'circle_pulse_comment_update' && mutation.payload.commentId === tempCommentId) {
    return {
      ...mutation,
      dedupeKey: buildCirclePulseCommentUpdateDedupeKey({
        ...mutation.payload,
        commentId: realCommentId,
      }),
      payload: {
        ...mutation.payload,
        commentId: realCommentId,
      },
    };
  }

  if (mutation.kind === 'circle_pulse_comment_delete' && mutation.payload.commentId === tempCommentId) {
    return {
      ...mutation,
      dedupeKey: buildCirclePulseCommentDeleteDedupeKey({
        ...mutation.payload,
        commentId: realCommentId,
      }),
      payload: {
        ...mutation.payload,
        commentId: realCommentId,
      },
    };
  }

  if (mutation.kind === 'circle_pulse_comment_reaction_sync' && mutation.payload.commentId === tempCommentId) {
    return {
      ...mutation,
      dedupeKey: buildCirclePulseCommentReactionSyncDedupeKey({
        ...mutation.payload,
        commentId: realCommentId,
      }),
      payload: {
        ...mutation.payload,
        commentId: realCommentId,
      },
    };
  }

  if (mutation.kind === 'circle_pulse_comment_pin_sync' && mutation.payload.commentId === tempCommentId) {
    return {
      ...mutation,
      dedupeKey: buildCirclePulseCommentPinSyncDedupeKey({
        ...mutation.payload,
        commentId: realCommentId,
      }),
      payload: {
        ...mutation.payload,
        commentId: realCommentId,
      },
    };
  }

  if (mutation.kind === 'circle_pulse_comment_report_sync' && mutation.payload.commentId === tempCommentId) {
    return {
      ...mutation,
      dedupeKey: buildCirclePulseCommentReportSyncDedupeKey({
        ...mutation.payload,
        commentId: realCommentId,
      }),
      payload: {
        ...mutation.payload,
        commentId: realCommentId,
      },
    };
  }

  return mutation;
};

async function remapCommentReferenceAcrossQueues(tempCommentId: string, realCommentId: string) {
  if (!tempCommentId || !realCommentId || tempCommentId === realCommentId) return;

  const [pendingQueue, failedQueue] = await Promise.all([
    readMutationQueue(),
    readFailedMutationQueue(),
  ]);

  const nextPending = pendingQueue.map((mutation) =>
    remapCommentReferenceOnMutation(mutation, tempCommentId, realCommentId) as OfflineMutation,
  );
  const nextFailed = failedQueue.map((mutation) =>
    remapCommentReferenceOnMutation(mutation, tempCommentId, realCommentId) as FailedOfflineMutation,
  );

  await Promise.all([
    writeMutationQueue(nextPending),
    writeFailedMutationQueue(nextFailed),
  ]);
}

async function remapCirclePulseCommentReferenceAcrossQueues(tempCommentId: string, realCommentId: string) {
  if (!tempCommentId || !realCommentId || tempCommentId === realCommentId) return;

  const [pendingQueue, failedQueue] = await Promise.all([
    readMutationQueue(),
    readFailedMutationQueue(),
  ]);

  const nextPending = pendingQueue.map((mutation) =>
    remapCirclePulseCommentReferenceOnMutation(mutation, tempCommentId, realCommentId) as OfflineMutation,
  );
  const nextFailed = failedQueue.map((mutation) =>
    remapCirclePulseCommentReferenceOnMutation(mutation, tempCommentId, realCommentId) as FailedOfflineMutation,
  );

  await Promise.all([
    writeMutationQueue(nextPending),
    writeFailedMutationQueue(nextFailed),
  ]);
}

async function replaceQueue(updater: (current: OfflineMutation[]) => OfflineMutation[]) {
  const current = await readMutationQueue();
  const next = updater(current);
  await writeMutationQueue(next);
  return next;
}

async function moveMutationToFailed(mutation: OfflineMutation, failureReason: string) {
  const failed = await readFailedMutationQueue();
  const failedMutation = {
    ...mutation,
    failedAt: Date.now(),
    failureReason,
  };
  await writeFailedMutationQueue([
    ...failed,
    failedMutation,
  ]);
  emitMutationEvent({ type: 'failed', mutation: failedMutation });
  return replaceQueue((existing) => existing.filter((item) => item.id !== mutation.id));
}

async function canDrainNow() {
  try {
    const state = await fetchNetInfo();
    if (state.isConnected === false) return false;
    if (state.isInternetReachable === false) return false;
    return true;
  } catch {
    return true;
  }
}

async function processSwipeSync(payload: SwipeSyncPayload) {
  const { error: swipeError } = await supabase.from('swipes').upsert(
    [
      {
        swiper_id: payload.userId,
        target_id: payload.targetId,
        action: payload.action,
      },
    ],
    { onConflict: 'swiper_id,target_id' },
  );
  if (swipeError) throw swipeError;

  if (!payload.mirrorIntent) return;

  const { error: intentError } = await supabase.rpc('rpc_create_intent_request', {
    p_recipient_id: payload.targetId,
    p_type: 'like_with_note',
    p_message: payload.message ?? null,
    p_metadata: {
      source: 'swipe',
      swipe_action: payload.action.toLowerCase(),
    },
  });
  if (intentError) throw intentError;
}

async function processProfileImageReactionSync(payload: ProfileImageReactionSyncPayload) {
  if (!payload.emoji) {
    const { error } = await supabase
      .from('profile_image_reactions')
      .delete()
      .eq('profile_id', payload.profileId)
      .eq('image_url', payload.imageUrl)
      .eq('reactor_user_id', payload.reactorUserId);
    if (error) throw error;
    return;
  }

  const { error } = await supabase
    .from('profile_image_reactions')
    .upsert(
      {
        profile_id: payload.profileId,
        image_url: payload.imageUrl,
        reactor_user_id: payload.reactorUserId,
        emoji: payload.emoji,
      },
      { onConflict: 'profile_id,image_url,reactor_user_id' },
    );
  if (error) throw error;
}

async function processChatReactionSync(payload: ChatReactionSyncPayload) {
  if (!payload.emoji) {
    const { error } = await supabase
      .from('message_reactions')
      .delete()
      .eq('message_id', payload.messageId)
      .eq('user_id', payload.userId);
    if (error) throw error;
    return;
  }

  const { error } = await supabase.from('message_reactions').upsert(
    {
      message_id: payload.messageId,
      user_id: payload.userId,
      emoji: payload.emoji,
    },
    { onConflict: 'message_id,user_id' },
  );
  if (error) throw error;
}

async function processIntentRequestCreate(payload: IntentRequestCreatePayload) {
  const { error } = await supabase.rpc('rpc_create_intent_request', {
    p_recipient_id: payload.recipientId,
    p_type: payload.type,
    p_message: payload.message ?? null,
    p_suggested_time: payload.suggestedTime ?? null,
    p_suggested_place: payload.suggestedPlace ?? null,
    p_metadata: payload.metadata ?? {},
  });
  if (error && !isBenignIntentQueueError(error)) throw error;
}

async function processIntentRequestDecision(payload: IntentRequestDecisionPayload) {
  const { error } = await supabase.rpc('rpc_decide_intent_request', {
    p_request_id: payload.requestId,
    p_decision: payload.decision,
  });
  if (error) {
    if (isBenignIntentQueueError(error)) return;
    throw error;
  }

  if (payload.decision === 'accept' && payload.insertAcceptanceSystemMessages !== false) {
    const { error: systemError } = await supabase.rpc('rpc_insert_request_acceptance_system_messages', {
      p_request_id: payload.requestId,
    });
    if (systemError) throw systemError;
  }
}

async function processIntentRequestCancel(payload: IntentRequestCancelPayload) {
  const { error } = await supabase.rpc('rpc_cancel_intent_request', {
    p_request_id: payload.requestId,
  });
  if (error && !isBenignIntentQueueError(error)) throw error;
}

async function processProfileUpdate(payload: ProfileUpdatePayload) {
  const guardWrite = prepareProfileGuardWrite(payload.updates);
  const { data, error } = await supabase.functions.invoke('profile-guard-update', {
    body: {
      updates: guardWrite.updates,
      complete_onboarding: guardWrite.completeOnboarding,
    },
  });
  if (error) throw error;
  if (data?.ok === false) {
    throw Object.assign(new Error('PROFILE_CONTENT_NOT_ALLOWED'), {
      code: data.code ?? 'PROFILE_CONTENT_NOT_ALLOWED',
    });
  }
}

async function processProfileInterestsUpdate(payload: ProfileInterestsUpdatePayload) {
  const { error: deleteError } = await supabase
    .from('profile_interests')
    .delete()
    .eq('profile_id', payload.profileId);
  if (deleteError) throw deleteError;

  if (!payload.interests.length) return;

  const { data: interestData, error: interestError } = await supabase
    .from('interests')
    .select('id, name')
    .in('name', payload.interests);
  if (interestError) throw interestError;

  const profileInterests = (interestData ?? []).map((interest: any) => ({
    profile_id: payload.profileId,
    interest_id: interest.id,
  }));

  if (!profileInterests.length) return;

  const { error: insertError } = await supabase
    .from('profile_interests')
    .insert(profileInterests);
  if (insertError) throw insertError;
}

async function uploadQueuedStorageObject(params: {
  bucket: string;
  localUri: string;
  filePath: string;
  contentType: string;
  upsert?: boolean;
}) {
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;
  if (!accessToken) {
    throw new Error('unauthenticated_storage');
  }

  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
  const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('missing_supabase_upload_config');
  }

  await ChatUploadTransport.upload({
    bucket: params.bucket,
    objectPath: params.filePath,
    localUri: params.localUri,
    fileName: params.filePath.split('/').pop() || 'upload.bin',
    contentType: params.contentType,
    accessToken,
    anonKey: supabaseAnonKey,
    supabaseUrl,
    upsert: params.upsert ?? false,
  });
}

async function uploadQueuedProfilePhoto(userId: string, item: LocalProfileMediaUpload) {
  const filePath = `${userId}/${Date.now()}-${item.fileName}`;
  await uploadQueuedStorageObject({
    bucket: 'profile-photos',
    localUri: item.localUri,
    filePath,
    contentType: item.contentType,
  });
  const { data } = supabase.storage.from('profile-photos').getPublicUrl(filePath);
  return data.publicUrl;
}

async function uploadQueuedProfileVideo(userId: string, item: LocalProfileMediaUpload) {
  const filePath = `${userId}/profile-video-${Date.now()}-${item.fileName}`;
  await uploadQueuedStorageObject({
    bucket: 'profile-videos',
    localUri: item.localUri,
    filePath,
    contentType: item.contentType,
  });
  return filePath;
}

async function processProfileMediaSync(payload: ProfileMediaSyncPayload) {
  const updates: Record<string, unknown> = {};
  const replacementByLocalUri: Record<string, string> = {};

  if (payload.avatar?.localUri) {
    const uploadedAvatarUrl = await uploadQueuedProfilePhoto(payload.userId, payload.avatar);
    replacementByLocalUri[payload.avatar.localUri] = uploadedAvatarUrl;
    updates.avatar_url = uploadedAvatarUrl;
  }

  if (payload.hero?.localUri) {
    const uploadedHeroUrl = await uploadQueuedProfilePhoto(payload.userId, payload.hero);
    replacementByLocalUri[payload.hero.localUri] = uploadedHeroUrl;
  }

  const photoItems = payload.photoItems ?? [];
  if (payload.photos && photoItems.length > 0) {
    for (const item of photoItems) {
      replacementByLocalUri[item.localUri] = await uploadQueuedProfilePhoto(payload.userId, item);
    }
    updates.photos = payload.photos
      .map((photo) => replacementByLocalUri[photo] ?? photo)
      .filter((photo) => typeof photo === 'string' && photo.length > 0);
  }

  if ('heroImageUrl' in payload) {
    const normalizedHeroImageUrl = normalizeProfilePhotoUri(payload.heroImageUrl);
    updates.hero_image_url = normalizedHeroImageUrl
      ? replacementByLocalUri[normalizedHeroImageUrl] ?? normalizedHeroImageUrl
      : null;
  }

  if (payload.video?.localUri) {
    const nextPath = await uploadQueuedProfileVideo(payload.userId, payload.video);
    updates.profile_video = nextPath;
    if (payload.video.previousPath && !payload.video.previousPath.startsWith('http')) {
      try {
        await supabase.storage.from('profile-videos').remove([payload.video.previousPath]);
      } catch {
        // best effort cleanup
      }
    }
  }

  if (Object.keys(updates).length === 0) return;

  const { error } = await supabase
    .from('profiles')
    .upsert(
      {
        ...updates,
        user_id: payload.userId,
        updated_at: payload.updatedAt,
      },
      { onConflict: 'user_id' },
    );
  if (error) throw error;
}

async function processNotificationPrefsUpdate(payload: NotificationPrefsUpdatePayload) {
  const { error } = await supabase
    .from('notification_prefs')
    .upsert(
      {
        user_id: payload.userId,
        ...payload.prefs,
        updated_at: payload.updatedAt,
      },
      { onConflict: 'user_id' },
    );
  if (error) throw error;
}

async function processProfileGiftSend(payload: ProfileGiftSendPayload) {
  const { error } = await supabase.rpc('rpc_send_profile_gift' as any, {
    p_recipient_profile_id: payload.recipientProfileId,
    p_gift_type: payload.giftType,
    p_include_sandbox_preview: Boolean(payload.includeSandboxPreview),
  });
  if (error) throw error;
}

async function processProfileGiftReveal(payload: ProfileGiftRevealPayload) {
  const { error } = await supabase.rpc('rpc_reveal_profile_gift' as any, {
    p_gift_id: payload.giftId,
  });
  if (error) throw error;
}

async function processProfileGiftArchive(payload: ProfileGiftArchivePayload) {
  const { error } = await supabase.rpc('rpc_archive_profile_gift' as any, {
    p_gift_id: payload.giftId,
  });
  if (error) throw error;
}

async function processProfileBoostCreate(payload: ProfileBoostCreatePayload) {
  await createProfileBoostV2({
    boostType: payload.boostType,
    audienceMode: payload.audienceMode,
    focusMode: payload.focusMode,
    metadata: payload.metadata ?? {},
  });
}

async function processMomentTextCreate(payload: MomentTextCreatePayload) {
  const result = await createTextMomentStrict({
    userId: payload.userId,
    type: 'text',
    textBody: payload.textBody,
    caption: payload.caption ?? null,
    visibility: payload.visibility ?? 'matches',
    metadata: (payload.metadata as MomentMetadata | null | undefined) ?? {},
  });

  await Promise.all([
    replaceOwnMomentSnapshot(payload.userId, payload.tempId, {
      id: result.momentId,
      userId: payload.userId,
      type: 'text',
      textBody: payload.textBody,
      caption: payload.caption ?? null,
      metadata: payload.metadata ?? null,
      visibility: payload.visibility ?? 'matches',
      createdAt: payload.createdAt,
      expiresAt: payload.expiresAt,
    }),
    replaceMomentInFeedSnapshot(payload.userId, payload.tempId, {
      id: result.momentId,
      userId: payload.userId,
      type: 'text',
      textBody: payload.textBody,
      caption: payload.caption ?? null,
      metadata: payload.metadata ?? null,
      visibility: payload.visibility ?? 'matches',
      createdAt: payload.createdAt,
      expiresAt: payload.expiresAt,
    }),
    moveMomentCommentsSnapshot(payload.userId, payload.tempId, result.momentId),
    moveMomentReactorsSnapshot(payload.userId, payload.tempId, result.momentId),
    remapMomentReferenceAcrossQueues(payload.tempId, result.momentId),
  ]);
}

async function processMomentMediaCreate(payload: MomentMediaCreatePayload) {
  const result = await createMomentFromMediaStrict({
    userId: payload.userId,
    type: payload.type,
    uri: payload.localUri,
    caption: payload.caption ?? null,
    visibility: payload.visibility ?? 'matches',
    metadata: (payload.metadata as MomentMetadata | null | undefined) ?? {},
  });

  await Promise.all([
    replaceOwnMomentSnapshot(payload.userId, payload.tempId, {
      id: result.momentId,
      userId: payload.userId,
      type: payload.type,
      mediaUrl: result.mediaPath,
      caption: payload.caption ?? null,
      metadata: payload.metadata ?? null,
      visibility: payload.visibility ?? 'matches',
      createdAt: payload.createdAt,
      expiresAt: payload.expiresAt,
    }),
    replaceMomentInFeedSnapshot(payload.userId, payload.tempId, {
      id: result.momentId,
      userId: payload.userId,
      type: payload.type,
      mediaUrl: result.mediaPath,
      caption: payload.caption ?? null,
      metadata: payload.metadata ?? null,
      visibility: payload.visibility ?? 'matches',
      createdAt: payload.createdAt,
      expiresAt: payload.expiresAt,
    }),
    moveMomentCommentsSnapshot(payload.userId, payload.tempId, result.momentId),
    moveMomentReactorsSnapshot(payload.userId, payload.tempId, result.momentId),
    remapMomentReferenceAcrossQueues(payload.tempId, result.momentId),
  ]);

  await removeStagedOfflineMomentUpload(payload.localUri);
}

async function processMomentDelete(payload: MomentDeletePayload) {
  if (isOfflineMomentId(payload.momentId)) {
    return;
  }
  await deleteMomentStrict({
    momentId: payload.momentId,
    mediaPath: payload.mediaPath ?? null,
  });
}

async function processMomentReactionSync(payload: MomentReactionSyncPayload) {
  const { data, error } = await supabase.rpc('rpc_sync_moment_reaction', {
    p_moment_id: payload.momentId,
    p_emoji: payload.emoji,
  });
  if (error) throw error;
  // A false return means the Moment is no longer actionable for this user.
  // Treat that as a benign stale-target outcome during replay.
  if (data === false) return;
}

async function processMomentCommentCreate(payload: MomentCommentCreatePayload) {
  const { data, error } = await supabase.rpc('rpc_create_moment_comment', {
    p_moment_id: payload.momentId,
    p_body: payload.body,
    p_parent_comment_id: payload.parentCommentId ?? null,
  });
  if (error) throw error;
  // A null return means the Moment is no longer actionable for this user.
  // Treat that as a benign stale-target outcome during replay.
  if (!data) return;
  await Promise.all([
    replaceMomentCommentSnapshotId(payload.userId, payload.momentId, payload.tempId, data),
    remapCommentReferenceAcrossQueues(payload.tempId, data.id),
  ]);
}

async function processMomentCommentUpdate(payload: MomentCommentUpdatePayload) {
  const { data, error } = await supabase.rpc('rpc_update_moment_comment', {
    p_comment_id: payload.commentId,
    p_body: payload.body,
  });
  if (error) throw error;
  if (!data) return;
  await upsertMomentCommentSnapshot(payload.userId, payload.momentId, data);
}

async function processMomentCommentDelete(payload: MomentCommentDeletePayload) {
  const { data, error } = await supabase.rpc('rpc_delete_moment_comment', {
    p_comment_id: payload.commentId,
  });
  if (error) throw error;
  if (data === false) {
    await clearMomentCommentMutationArtifacts(payload.commentId);
    return;
  }
  await Promise.all([
    removeMomentCommentSnapshot(payload.userId, payload.momentId, payload.commentId),
    clearMomentCommentMutationArtifacts(payload.commentId),
  ]);
}

async function processMomentCommentReactionSync(payload: MomentCommentReactionSyncPayload) {
  const { data, error } = await supabase.rpc('rpc_sync_moment_comment_reaction', {
    p_comment_id: payload.commentId,
    p_reaction: payload.reaction,
  });
  if (error) throw error;
  if (data === false) {
    await clearMomentCommentMutationArtifacts(payload.commentId);
  }
}

async function processCirclePulseCommentCreate(payload: CirclePulseCommentCreatePayload) {
  const comment = await createCirclePulseComment(
    payload.itemId,
    payload.actorProfileId,
    payload.body,
    payload.parentCommentId ?? null,
  );
  await Promise.all([
    replaceCirclePulseCommentSnapshotId(payload.itemId, payload.actorProfileId, payload.tempId, comment),
    remapCirclePulseCommentReferenceAcrossQueues(payload.tempId, comment.id),
  ]);
}

async function processCirclePulseCommentUpdate(payload: CirclePulseCommentUpdatePayload) {
  const comment = await updateCirclePulseComment(
    payload.commentId,
    payload.actorProfileId,
    payload.body,
  );
  await upsertCirclePulseCommentSnapshot(payload.itemId, payload.actorProfileId, comment);
}

async function processCirclePulseCommentDelete(payload: CirclePulseCommentDeletePayload) {
  await deleteCirclePulseComment(payload.commentId, payload.actorProfileId);
  await Promise.all([
    removeCirclePulseCommentSnapshot(payload.itemId, payload.actorProfileId, payload.commentId),
    clearCirclePulseCommentMutationArtifacts(payload.commentId),
  ]);
}

async function processCirclePulseCommentReactionSync(payload: CirclePulseCommentReactionSyncPayload) {
  const snapshot = await fetchCirclePulseCommentSnapshot(payload.commentId);
  const currentReaction = snapshot.myReaction ?? null;
  const desiredReaction = payload.reaction ?? null;

  if (currentReaction === desiredReaction) {
    await upsertCirclePulseCommentSnapshot(payload.itemId, payload.actorProfileId, snapshot);
    return;
  }

  const reactionToToggle = desiredReaction ?? currentReaction;
  if (!reactionToToggle) return;

  await toggleCirclePulseCommentReaction(
    payload.commentId,
    payload.actorProfileId,
    reactionToToggle,
  );

  const refreshed = await fetchCirclePulseCommentSnapshot(payload.commentId);
  await upsertCirclePulseCommentSnapshot(payload.itemId, payload.actorProfileId, refreshed);
}

async function processCirclePulseCommentPinSync(payload: CirclePulseCommentPinSyncPayload) {
  const snapshotState = await readCirclePulseCommentsSnapshotState(payload.itemId, payload.actorProfileId);
  const previousPinnedIds = (snapshotState.data ?? [])
    .filter((comment) => comment.id !== payload.commentId && !!comment.pinnedAt)
    .map((comment) => comment.id);

  await pinCirclePulseComment(
    payload.commentId,
    payload.actorProfileId,
    payload.pinned,
  );

  const refreshed = await fetchCirclePulseCommentSnapshot(payload.commentId);
  await upsertCirclePulseCommentSnapshot(payload.itemId, payload.actorProfileId, refreshed);

  if (payload.pinned) {
    await Promise.all(
      previousPinnedIds.map(async (commentId) => {
        try {
          const comment = await fetchCirclePulseCommentSnapshot(commentId);
          await upsertCirclePulseCommentSnapshot(payload.itemId, payload.actorProfileId, comment);
        } catch {
          // If the comment cannot be refreshed, keep the local copy and only clear its pinned state.
          const current = (await readCirclePulseCommentsSnapshotState(payload.itemId, payload.actorProfileId)).data ?? [];
          const fallback = current.find((entry) => entry.id === commentId);
          if (fallback) {
            await upsertCirclePulseCommentSnapshot(payload.itemId, payload.actorProfileId, {
              ...fallback,
              pinnedAt: null,
            });
          } else {
            await removeCirclePulseCommentSnapshot(payload.itemId, payload.actorProfileId, commentId);
          }
        }
      }),
    );
  }
}

async function processCirclePulseCommentReportSync(payload: CirclePulseCommentReportSyncPayload) {
  await reportCirclePulseComment(payload.commentId, payload.actorProfileId);
  const refreshed = await fetchCirclePulseCommentSnapshot(payload.commentId);
  await upsertCirclePulseCommentSnapshot(payload.itemId, payload.actorProfileId, refreshed);
}

async function processMutation(mutation: OfflineMutation) {
  switch (mutation.kind) {
    case 'swipe_sync':
      await processSwipeSync(mutation.payload);
      return;
    case 'profile_image_reaction_sync':
      await processProfileImageReactionSync(mutation.payload);
      return;
    case 'chat_text_send':
      await persistLegacyChatSendMutationToSQLiteOutbox(mutation);
      return;
    case 'chat_reaction_sync':
      await processChatReactionSync(mutation.payload);
      return;
    case 'chat_media_send':
      await persistLegacyChatSendMutationToSQLiteOutbox(mutation);
      return;
    case 'chat_voice_send':
      await persistLegacyChatSendMutationToSQLiteOutbox(mutation);
      return;
    case 'intent_request_create':
      await processIntentRequestCreate(mutation.payload);
      return;
    case 'intent_request_decision':
      await processIntentRequestDecision(mutation.payload);
      return;
    case 'intent_request_cancel':
      await processIntentRequestCancel(mutation.payload);
      return;
    case 'profile_update':
      await processProfileUpdate(mutation.payload);
      return;
    case 'profile_interests_update':
      await processProfileInterestsUpdate(mutation.payload);
      return;
    case 'profile_media_sync':
      await processProfileMediaSync(mutation.payload);
      return;
    case 'notification_prefs_update':
      await processNotificationPrefsUpdate(mutation.payload);
      return;
    case 'profile_gift_send':
      await processProfileGiftSend(mutation.payload);
      return;
    case 'profile_gift_reveal':
      await processProfileGiftReveal(mutation.payload);
      return;
    case 'profile_gift_archive':
      await processProfileGiftArchive(mutation.payload);
      return;
    case 'profile_boost_create':
      await processProfileBoostCreate(mutation.payload);
      return;
    case 'moment_text_create':
      await processMomentTextCreate(mutation.payload);
      return;
    case 'moment_media_create':
      await processMomentMediaCreate(mutation.payload);
      return;
    case 'moment_delete':
      await processMomentDelete(mutation.payload);
      return;
    case 'moment_reaction_sync':
      await processMomentReactionSync(mutation.payload);
      return;
    case 'moment_comment_create':
      await processMomentCommentCreate(mutation.payload);
      return;
    case 'moment_comment_update':
      await processMomentCommentUpdate(mutation.payload);
      return;
    case 'moment_comment_delete':
      await processMomentCommentDelete(mutation.payload);
      return;
    case 'moment_comment_reaction_sync':
      await processMomentCommentReactionSync(mutation.payload);
      return;
    case 'circle_pulse_comment_create':
      await processCirclePulseCommentCreate(mutation.payload);
      return;
    case 'circle_pulse_comment_update':
      await processCirclePulseCommentUpdate(mutation.payload);
      return;
    case 'circle_pulse_comment_delete':
      await processCirclePulseCommentDelete(mutation.payload);
      return;
    case 'circle_pulse_comment_reaction_sync':
      await processCirclePulseCommentReactionSync(mutation.payload);
      return;
    case 'circle_pulse_comment_pin_sync':
      await processCirclePulseCommentPinSync(mutation.payload);
      return;
    case 'circle_pulse_comment_report_sync':
      await processCirclePulseCommentReportSync(mutation.payload);
      return;
    default:
      return;
  }
}

export async function enqueueSwipeSyncMutation(payload: SwipeSyncPayload) {
  const mutation: OfflineMutation = {
    id: buildOfflineMutationId(),
    dedupeKey: buildSwipeDedupeKey(payload),
    kind: 'swipe_sync',
    createdAt: Date.now(),
    attempts: 0,
    payload,
  };

  await replaceQueue((current) => {
    const filtered = current.filter((item) => item.dedupeKey !== mutation.dedupeKey);
    return [...filtered, mutation];
  });
}

export async function enqueueProfileImageReactionSyncMutation(payload: ProfileImageReactionSyncPayload) {
  const mutation: OfflineMutation = {
    id: buildOfflineMutationId(),
    dedupeKey: buildProfileImageReactionDedupeKey(payload),
    kind: 'profile_image_reaction_sync',
    createdAt: Date.now(),
    attempts: 0,
    payload,
  };

  await replaceQueue((current) => {
    const filtered = current.filter((item) => item.dedupeKey !== mutation.dedupeKey);
    return [...filtered, mutation];
  });
}

export async function enqueueChatTextSendMutation(payload: ChatTextSendPayload) {
  const mutation: OfflineMutation = {
    id: buildOfflineMutationId(),
    dedupeKey: buildChatTextSendDedupeKey(payload),
    kind: 'chat_text_send',
    createdAt: Date.now(),
    attempts: 0,
    payload,
  };

  await persistLegacyChatSendMutationToSQLiteOutbox(mutation);
}

export async function enqueueChatReactionSyncMutation(payload: ChatReactionSyncPayload) {
  const mutation: OfflineMutation = {
    id: buildOfflineMutationId(),
    dedupeKey: buildChatReactionDedupeKey(payload),
    kind: 'chat_reaction_sync',
    createdAt: Date.now(),
    attempts: 0,
    payload,
  };

  await replaceQueue((current) => {
    const filtered = current.filter((item) => item.dedupeKey !== mutation.dedupeKey);
    return [...filtered, mutation];
  });
}

export async function enqueueChatMediaSendMutation(payload: ChatMediaSendPayload) {
  const mutation: OfflineMutation = {
    id: buildOfflineMutationId(),
    dedupeKey: buildChatMediaSendDedupeKey(payload),
    kind: 'chat_media_send',
    createdAt: Date.now(),
    attempts: 0,
    payload,
  };

  await persistLegacyChatSendMutationToSQLiteOutbox(mutation);
}

export async function enqueueChatVoiceSendMutation(payload: ChatVoiceSendPayload) {
  const mutation: OfflineMutation = {
    id: buildOfflineMutationId(),
    dedupeKey: buildChatVoiceSendDedupeKey(payload),
    kind: 'chat_voice_send',
    createdAt: Date.now(),
    attempts: 0,
    payload,
  };

  await persistLegacyChatSendMutationToSQLiteOutbox(mutation);
}

export async function enqueueIntentRequestCreateMutation(payload: IntentRequestCreatePayload) {
  const mutation: OfflineMutation = {
    id: buildOfflineMutationId(),
    dedupeKey: buildIntentRequestCreateDedupeKey(payload),
    kind: 'intent_request_create',
    createdAt: Date.now(),
    attempts: 0,
    payload,
  };

  await replaceQueue((current) => [...current, mutation]);
  emitMutationEvent({ type: 'queued', mutation });
  return mutation;
}

export async function enqueueIntentRequestDecisionMutation(payload: IntentRequestDecisionPayload) {
  const mutation: OfflineMutation = {
    id: buildOfflineMutationId(),
    dedupeKey: buildIntentRequestDecisionDedupeKey(payload),
    kind: 'intent_request_decision',
    createdAt: Date.now(),
    attempts: 0,
    payload,
  };

  await replaceQueue((current) => {
    const filtered = current.filter((item) => item.dedupeKey !== mutation.dedupeKey);
    return [...filtered, mutation];
  });
  emitMutationEvent({ type: 'queued', mutation });
  return mutation;
}

export async function enqueueIntentRequestCancelMutation(payload: IntentRequestCancelPayload) {
  const mutation: OfflineMutation = {
    id: buildOfflineMutationId(),
    dedupeKey: buildIntentRequestCancelDedupeKey(payload),
    kind: 'intent_request_cancel',
    createdAt: Date.now(),
    attempts: 0,
    payload,
  };

  await replaceQueue((current) => {
    const filtered = current.filter((item) => item.dedupeKey !== mutation.dedupeKey);
    return [...filtered, mutation];
  });
  emitMutationEvent({ type: 'queued', mutation });
  return mutation;
}

export async function enqueueProfileUpdateMutation(payload: ProfileUpdatePayload) {
  const mutation: OfflineMutation = {
    id: buildOfflineMutationId(),
    dedupeKey: buildProfileUpdateDedupeKey(payload),
    kind: 'profile_update',
    createdAt: Date.now(),
    attempts: 0,
    payload,
  };

  await replaceQueue((current) => {
    const filtered = current.filter((item) => item.dedupeKey !== mutation.dedupeKey);
    return [...filtered, mutation];
  });
  emitMutationEvent({ type: 'queued', mutation });
}

export async function enqueueProfileInterestsUpdateMutation(payload: ProfileInterestsUpdatePayload) {
  const mutation: OfflineMutation = {
    id: buildOfflineMutationId(),
    dedupeKey: buildProfileInterestsUpdateDedupeKey(payload),
    kind: 'profile_interests_update',
    createdAt: Date.now(),
    attempts: 0,
    payload,
  };

  await replaceQueue((current) => {
    const filtered = current.filter((item) => item.dedupeKey !== mutation.dedupeKey);
    return [...filtered, mutation];
  });
  emitMutationEvent({ type: 'queued', mutation });
}

export async function enqueueProfileMediaSyncMutation(payload: ProfileMediaSyncPayload) {
  const mutation: OfflineMutation = {
    id: buildOfflineMutationId(),
    dedupeKey: buildProfileMediaSyncDedupeKey(payload),
    kind: 'profile_media_sync',
    createdAt: Date.now(),
    attempts: 0,
    payload,
  };

  await replaceQueue((current) => {
    const filtered = current.filter((item) => item.dedupeKey !== mutation.dedupeKey);
    return [...filtered, mutation];
  });
  emitMutationEvent({ type: 'queued', mutation });
}

export async function enqueueNotificationPrefsUpdateMutation(payload: NotificationPrefsUpdatePayload) {
  const mutation: OfflineMutation = {
    id: buildOfflineMutationId(),
    dedupeKey: buildNotificationPrefsUpdateDedupeKey(payload),
    kind: 'notification_prefs_update',
    createdAt: Date.now(),
    attempts: 0,
    payload,
  };

  await replaceQueue((current) => {
    const filtered = current.filter((item) => item.dedupeKey !== mutation.dedupeKey);
    return [...filtered, mutation];
  });
  emitMutationEvent({ type: 'queued', mutation });
}

export async function enqueueProfileGiftSendMutation(payload: ProfileGiftSendPayload) {
  const mutation: OfflineMutation = {
    id: buildOfflineMutationId(),
    dedupeKey: buildProfileGiftSendDedupeKey(payload),
    kind: 'profile_gift_send',
    createdAt: Date.now(),
    attempts: 0,
    payload,
  };

  await replaceQueue((current) => [...current, mutation]);
  emitMutationEvent({ type: 'queued', mutation });
  return mutation;
}

export async function enqueueProfileGiftRevealMutation(payload: ProfileGiftRevealPayload) {
  const mutation: OfflineMutation = {
    id: buildOfflineMutationId(),
    dedupeKey: buildProfileGiftRevealDedupeKey(payload),
    kind: 'profile_gift_reveal',
    createdAt: Date.now(),
    attempts: 0,
    payload,
  };

  await replaceQueue((current) => {
    const filtered = current.filter((item) => item.dedupeKey !== mutation.dedupeKey);
    return [...filtered, mutation];
  });
  emitMutationEvent({ type: 'queued', mutation });
  return mutation;
}

export async function enqueueProfileGiftArchiveMutation(payload: ProfileGiftArchivePayload) {
  const mutation: OfflineMutation = {
    id: buildOfflineMutationId(),
    dedupeKey: buildProfileGiftArchiveDedupeKey(payload),
    kind: 'profile_gift_archive',
    createdAt: Date.now(),
    attempts: 0,
    payload,
  };

  await replaceQueue((current) => {
    const filtered = current.filter((item) => item.dedupeKey !== mutation.dedupeKey);
    return [...filtered, mutation];
  });
  emitMutationEvent({ type: 'queued', mutation });
  return mutation;
}

export async function enqueueProfileBoostCreateMutation(payload: ProfileBoostCreatePayload) {
  const mutation: OfflineMutation = {
    id: buildOfflineMutationId(),
    dedupeKey: buildProfileBoostCreateDedupeKey(payload),
    kind: 'profile_boost_create',
    createdAt: Date.now(),
    attempts: 0,
    payload,
  };

  await replaceQueue((current) => {
    const filtered = current.filter((item) => item.dedupeKey !== mutation.dedupeKey);
    return [...filtered, mutation];
  });
  emitMutationEvent({ type: 'queued', mutation });
  return mutation;
}

export async function enqueueMomentTextCreateMutation(payload: MomentTextCreatePayload) {
  const mutation: OfflineMutation = {
    id: buildOfflineMutationId(),
    dedupeKey: buildMomentTextCreateDedupeKey(payload),
    kind: 'moment_text_create',
    createdAt: Date.now(),
    attempts: 0,
    payload,
  };

  await replaceQueue((current) => [...current, mutation]);
  emitMutationEvent({ type: 'queued', mutation });
}

export async function enqueueMomentMediaCreateMutation(payload: MomentMediaCreatePayload) {
  const mutation: OfflineMutation = {
    id: buildOfflineMutationId(),
    dedupeKey: buildMomentMediaCreateDedupeKey(payload),
    kind: 'moment_media_create',
    createdAt: Date.now(),
    attempts: 0,
    payload,
  };

  await replaceQueue((current) => [...current, mutation]);
  emitMutationEvent({ type: 'queued', mutation });
}

export async function enqueueMomentDeleteMutation(payload: MomentDeletePayload) {
  let collapsedQueuedCreate: OfflineMutation | null = null;

  await replaceQueue((current) => {
    if (isOfflineMomentId(payload.momentId)) {
      const next = current.filter((item) => {
        const isMatchingCreate =
          (item.kind === 'moment_text_create' || item.kind === 'moment_media_create') &&
          item.payload.tempId === payload.momentId;
        const isMatchingInteraction =
          (
            item.kind === 'moment_reaction_sync' ||
            item.kind === 'moment_comment_create' ||
            item.kind === 'moment_comment_update' ||
            item.kind === 'moment_comment_delete'
          ) &&
          item.payload.momentId === payload.momentId;
        if (isMatchingCreate) {
          collapsedQueuedCreate = item;
          return false;
        }
        if (isMatchingInteraction) {
          return false;
        }
        return true;
      });
      return next;
    }

    const mutation: OfflineMutation = {
      id: buildOfflineMutationId(),
      dedupeKey: buildMomentDeleteDedupeKey(payload),
      kind: 'moment_delete',
      createdAt: Date.now(),
      attempts: 0,
      payload,
    };
    const filtered = current.filter((item) => item.dedupeKey !== mutation.dedupeKey);
    filtered.push(mutation);
    emitMutationEvent({ type: 'queued', mutation });
    return filtered;
  });

  if (collapsedQueuedCreate?.kind === 'moment_media_create') {
    await removeStagedOfflineMomentUpload(collapsedQueuedCreate.payload.localUri);
  }

  await clearMomentMutationArtifacts(payload.momentId);
}

export async function enqueueMomentReactionSyncMutation(payload: MomentReactionSyncPayload) {
  const mutation: OfflineMutation = {
    id: buildOfflineMutationId(),
    dedupeKey: buildMomentReactionSyncDedupeKey(payload),
    kind: 'moment_reaction_sync',
    createdAt: Date.now(),
    attempts: 0,
    payload,
  };

  await replaceQueue((current) => {
    const filtered = current.filter((item) => item.dedupeKey !== mutation.dedupeKey);
    return [...filtered, mutation];
  });
  emitMutationEvent({ type: 'queued', mutation });
}

export async function enqueueMomentCommentCreateMutation(payload: MomentCommentCreatePayload) {
  const mutation: OfflineMutation = {
    id: buildOfflineMutationId(),
    dedupeKey: buildMomentCommentCreateDedupeKey(payload),
    kind: 'moment_comment_create',
    createdAt: Date.now(),
    attempts: 0,
    payload,
  };

  await replaceQueue((current) => [...current, mutation]);
  emitMutationEvent({ type: 'queued', mutation });
}

export async function enqueueMomentCommentUpdateMutation(payload: MomentCommentUpdatePayload) {
  const mutation: OfflineMutation = {
    id: buildOfflineMutationId(),
    dedupeKey: buildMomentCommentUpdateDedupeKey(payload),
    kind: 'moment_comment_update',
    createdAt: Date.now(),
    attempts: 0,
    payload,
  };

  await replaceQueue((current) => {
    const filtered = current.filter((item) => item.dedupeKey !== mutation.dedupeKey);
    return [...filtered, mutation];
  });
  emitMutationEvent({ type: 'queued', mutation });
}

export async function enqueueMomentCommentDeleteMutation(payload: MomentCommentDeletePayload) {
  const mutation: OfflineMutation = {
    id: buildOfflineMutationId(),
    dedupeKey: buildMomentCommentDeleteDedupeKey(payload),
    kind: 'moment_comment_delete',
    createdAt: Date.now(),
    attempts: 0,
    payload,
  };

  await replaceQueue((current) => {
    const filtered = current.filter(
      (item) =>
        item.dedupeKey !== mutation.dedupeKey &&
        !(
          item.kind === 'moment_comment_update' &&
          item.payload.commentId === payload.commentId
        ) &&
        !(
          item.kind === 'moment_comment_reaction_sync' &&
          item.payload.commentId === payload.commentId
        ),
    );
    return [...filtered, mutation];
  });
  emitMutationEvent({ type: 'queued', mutation });
}

export async function enqueueMomentCommentReactionSyncMutation(payload: MomentCommentReactionSyncPayload) {
  const mutation: OfflineMutation = {
    id: buildOfflineMutationId(),
    dedupeKey: buildMomentCommentReactionSyncDedupeKey(payload),
    kind: 'moment_comment_reaction_sync',
    createdAt: Date.now(),
    attempts: 0,
    payload,
  };

  await replaceQueue((current) => {
    const filtered = current.filter((item) => item.dedupeKey !== mutation.dedupeKey);
    return [...filtered, mutation];
  });
  emitMutationEvent({ type: 'queued', mutation });
}

export async function replacePendingMomentCommentCreateBody(commentId: string, body: string) {
  const apply = <T extends OfflineMutation | FailedOfflineMutation>(mutation: T): T =>
    mutation.kind === 'moment_comment_create' && mutation.payload.tempId === commentId
      ? ({
          ...mutation,
          payload: {
            ...mutation.payload,
            body,
          },
        } as T)
      : mutation;

  const [pendingQueue, failedQueue] = await Promise.all([
    readMutationQueue(),
    readFailedMutationQueue(),
  ]);

  await Promise.all([
    writeMutationQueue(pendingQueue.map((mutation) => apply(mutation as OfflineMutation))),
    writeFailedMutationQueue(failedQueue.map((mutation) => apply(mutation as FailedOfflineMutation))),
  ]);
}

export async function removePendingMomentCommentCreateMutation(commentId: string) {
  const [pendingQueue, failedQueue] = await Promise.all([
    readMutationQueue(),
    readFailedMutationQueue(),
  ]);

  const shouldKeep = (mutation: OfflineMutation | FailedOfflineMutation) =>
    !(mutation.kind === 'moment_comment_create' && mutation.payload.tempId === commentId);

  await Promise.all([
    writeMutationQueue(pendingQueue.filter(shouldKeep)),
    writeFailedMutationQueue(failedQueue.filter(shouldKeep)),
  ]);
}

export async function enqueueCirclePulseCommentCreateMutation(payload: CirclePulseCommentCreatePayload) {
  const mutation: OfflineMutation = {
    id: buildOfflineMutationId(),
    dedupeKey: buildCirclePulseCommentCreateDedupeKey(payload),
    kind: 'circle_pulse_comment_create',
    createdAt: Date.now(),
    attempts: 0,
    payload,
  };

  await replaceQueue((current) => [...current, mutation]);
  emitMutationEvent({ type: 'queued', mutation });
}

export async function enqueueCirclePulseCommentUpdateMutation(payload: CirclePulseCommentUpdatePayload) {
  const mutation: OfflineMutation = {
    id: buildOfflineMutationId(),
    dedupeKey: buildCirclePulseCommentUpdateDedupeKey(payload),
    kind: 'circle_pulse_comment_update',
    createdAt: Date.now(),
    attempts: 0,
    payload,
  };

  await replaceQueue((current) => {
    const filtered = current.filter((item) => item.dedupeKey !== mutation.dedupeKey);
    return [...filtered, mutation];
  });
  emitMutationEvent({ type: 'queued', mutation });
}

export async function enqueueCirclePulseCommentDeleteMutation(payload: CirclePulseCommentDeletePayload) {
  const mutation: OfflineMutation = {
    id: buildOfflineMutationId(),
    dedupeKey: buildCirclePulseCommentDeleteDedupeKey(payload),
    kind: 'circle_pulse_comment_delete',
    createdAt: Date.now(),
    attempts: 0,
    payload,
  };

  await replaceQueue((current) => {
    const filtered = current.filter(
      (item) =>
        item.dedupeKey !== mutation.dedupeKey &&
        !(
          (item.kind === 'circle_pulse_comment_update' ||
            item.kind === 'circle_pulse_comment_reaction_sync' ||
            item.kind === 'circle_pulse_comment_pin_sync' ||
            item.kind === 'circle_pulse_comment_report_sync') &&
          item.payload.commentId === payload.commentId
        ),
    );
    return [...filtered, mutation];
  });
  emitMutationEvent({ type: 'queued', mutation });
}

export async function enqueueCirclePulseCommentReactionSyncMutation(payload: CirclePulseCommentReactionSyncPayload) {
  const mutation: OfflineMutation = {
    id: buildOfflineMutationId(),
    dedupeKey: buildCirclePulseCommentReactionSyncDedupeKey(payload),
    kind: 'circle_pulse_comment_reaction_sync',
    createdAt: Date.now(),
    attempts: 0,
    payload,
  };

  await replaceQueue((current) => {
    const filtered = current.filter((item) => item.dedupeKey !== mutation.dedupeKey);
    return [...filtered, mutation];
  });
  emitMutationEvent({ type: 'queued', mutation });
}

export async function enqueueCirclePulseCommentPinSyncMutation(payload: CirclePulseCommentPinSyncPayload) {
  const mutation: OfflineMutation = {
    id: buildOfflineMutationId(),
    dedupeKey: buildCirclePulseCommentPinSyncDedupeKey(payload),
    kind: 'circle_pulse_comment_pin_sync',
    createdAt: Date.now(),
    attempts: 0,
    payload,
  };

  await replaceQueue((current) => {
    const filtered = current.filter((item) => item.dedupeKey !== mutation.dedupeKey);
    return [...filtered, mutation];
  });
  emitMutationEvent({ type: 'queued', mutation });
}

export async function enqueueCirclePulseCommentReportSyncMutation(payload: CirclePulseCommentReportSyncPayload) {
  const mutation: OfflineMutation = {
    id: buildOfflineMutationId(),
    dedupeKey: buildCirclePulseCommentReportSyncDedupeKey(payload),
    kind: 'circle_pulse_comment_report_sync',
    createdAt: Date.now(),
    attempts: 0,
    payload,
  };

  await replaceQueue((current) => {
    const filtered = current.filter((item) => item.dedupeKey !== mutation.dedupeKey);
    return [...filtered, mutation];
  });
  emitMutationEvent({ type: 'queued', mutation });
}

export async function replacePendingCirclePulseCommentCreateBody(commentId: string, body: string) {
  const apply = <T extends OfflineMutation | FailedOfflineMutation>(mutation: T): T =>
    mutation.kind === 'circle_pulse_comment_create' && mutation.payload.tempId === commentId
      ? ({
          ...mutation,
          payload: {
            ...mutation.payload,
            body,
          },
        } as T)
      : mutation;

  const [pendingQueue, failedQueue] = await Promise.all([
    readMutationQueue(),
    readFailedMutationQueue(),
  ]);

  await Promise.all([
    writeMutationQueue(pendingQueue.map((mutation) => apply(mutation as OfflineMutation))),
    writeFailedMutationQueue(failedQueue.map((mutation) => apply(mutation as FailedOfflineMutation))),
  ]);
}

export async function removePendingCirclePulseCommentCreateMutation(commentId: string) {
  const [pendingQueue, failedQueue] = await Promise.all([
    readMutationQueue(),
    readFailedMutationQueue(),
  ]);

  const shouldKeep = (mutation: OfflineMutation | FailedOfflineMutation) =>
    !(mutation.kind === 'circle_pulse_comment_create' && mutation.payload.tempId === commentId);

  await Promise.all([
    writeMutationQueue(pendingQueue.filter(shouldKeep)),
    writeFailedMutationQueue(failedQueue.filter(shouldKeep)),
  ]);
}

export async function hasPendingSwipeSyncMutation(
  userId: string,
  targetId: string,
  actions?: SwipeSyncPayload['action'][],
) {
  const queue = await readMutationQueue();
  return queue.some((item) => {
    if (item.kind !== 'swipe_sync') return false;
    if (item.payload.userId !== userId || item.payload.targetId !== targetId) return false;
    if (!actions?.length) return true;
    return actions.includes(item.payload.action);
  });
}

export async function getPendingProfileImageReactionMap(profileId: string, reactorUserId?: string | null) {
  const queue = await readMutationQueue();
  const next: Record<string, string | null> = {};

  queue.forEach((item) => {
    if (item.kind !== 'profile_image_reaction_sync') return;
    if (item.payload.profileId !== profileId) return;
    if (reactorUserId && item.payload.reactorUserId !== reactorUserId) return;
    next[item.payload.imageUrl] = item.payload.emoji;
  });

  return next;
}

export async function getPendingProfileMediaSyncMutation(userId: string) {
  const queue = await readMutationQueue();
  for (let index = queue.length - 1; index >= 0; index -= 1) {
    const item = queue[index];
    if (item?.kind === 'profile_media_sync' && item.payload.userId === userId) {
      return item;
    }
  }
  return null;
}

export async function getPendingOfflineMutationCount() {
  const queue = await readMutationQueue();
  return queue.length;
}

export async function getOfflineMutationQueueSnapshot() {
  const { pending, failed } = await pruneStaleQueuedMutationsFromQueues();
  const now = Date.now();
  return {
    pendingCount: pending.length,
    failedCount: failed.length,
    readyCount: pending.filter((item) => !item.nextAttemptAt || item.nextAttemptAt <= now).length,
    nextAttemptAt:
      pending
        .map((item) => item.nextAttemptAt)
        .filter((value): value is number => typeof value === 'number' && value > now)
        .sort((a, b) => a - b)[0] ?? null,
    pending,
    failed,
  };
}

export async function getIntentOfflineMutationSnapshot() {
  const { pending, failed } = await getOfflineMutationQueueSnapshot();
  return {
    pending: pending.filter((item) =>
      item.kind === 'intent_request_create' ||
      item.kind === 'intent_request_decision' ||
      item.kind === 'intent_request_cancel',
    ),
    failed: failed.filter((item) =>
      item.kind === 'intent_request_create' ||
      item.kind === 'intent_request_decision' ||
      item.kind === 'intent_request_cancel',
    ),
  };
}

export async function getMomentOfflineMutationSnapshot() {
  const { pending, failed } = await getOfflineMutationQueueSnapshot();
  return {
    pending: pending.filter((item) =>
      !isExpiredMomentCreateMutation(item) &&
      (
        item.kind === 'moment_text_create' ||
        item.kind === 'moment_media_create' ||
        item.kind === 'moment_delete' ||
        item.kind === 'moment_reaction_sync' ||
        item.kind === 'moment_comment_create' ||
        item.kind === 'moment_comment_update' ||
        item.kind === 'moment_comment_delete' ||
        item.kind === 'moment_comment_reaction_sync'
      ),
    ),
    failed: failed.filter((item) =>
      !isExpiredMomentCreateMutation(item) &&
      (
        item.kind === 'moment_text_create' ||
        item.kind === 'moment_media_create' ||
        item.kind === 'moment_delete' ||
        item.kind === 'moment_reaction_sync' ||
        item.kind === 'moment_comment_create' ||
        item.kind === 'moment_comment_update' ||
        item.kind === 'moment_comment_delete' ||
        item.kind === 'moment_comment_reaction_sync'
      ),
    ),
  };
}

export async function getBoostOfflineMutationSnapshot(profileId?: string) {
  const { pending, failed } = await getOfflineMutationQueueSnapshot();
  const matchesProfile = (
    item:
      | Extract<OfflineMutation, { kind: 'profile_boost_create' }>
      | Extract<FailedOfflineMutation, { kind: 'profile_boost_create' }>,
  ) => !profileId || item.payload.ownerProfileId === profileId;

  return {
    pending: pending.filter(
      (item): item is Extract<OfflineMutation, { kind: 'profile_boost_create' }> =>
        item.kind === 'profile_boost_create' && matchesProfile(item),
    ),
    failed: failed.filter(
      (item): item is Extract<FailedOfflineMutation, { kind: 'profile_boost_create' }> =>
        item.kind === 'profile_boost_create' && matchesProfile(item),
    ),
  };
}

export async function retryFailedOfflineMutation(mutationId: string) {
  const failedQueue = await readFailedMutationQueue();
  const target = failedQueue.find((item) => item.id === mutationId);
  if (!target) return false;

  const { failedAt: _failedAt, failureReason: _failureReason, ...baseMutation } = target;
  const retriedMutation: OfflineMutation = {
    ...baseMutation,
    attempts: 0,
    lastAttemptAt: null,
    nextAttemptAt: null,
    lastError: null,
  };

  await writeFailedMutationQueue(failedQueue.filter((item) => item.id !== mutationId));
  await replaceQueue((current) => [...current, retriedMutation]);
  emitMutationEvent({ type: 'queued', mutation: retriedMutation });
  void drainOfflineMutationQueue();
  return true;
}

export async function retryFailedOfflineMutations(filter?: (mutation: FailedOfflineMutation) => boolean) {
  const failedQueue = await readFailedMutationQueue();
  const selected = failedQueue.filter((mutation) => (filter ? filter(mutation) : true));
  if (selected.length === 0) return 0;

  const retriedMutations: OfflineMutation[] = selected.map((target) => {
    const { failedAt: _failedAt, failureReason: _failureReason, ...baseMutation } = target;
    return {
      ...baseMutation,
      attempts: 0,
      lastAttemptAt: null,
      nextAttemptAt: null,
      lastError: null,
    };
  });

  await writeFailedMutationQueue(
    failedQueue.filter((mutation) => !selected.some((item) => item.id === mutation.id)),
  );
  await replaceQueue((current) => [...current, ...retriedMutations]);
  retriedMutations.forEach((mutation) => emitMutationEvent({ type: 'queued', mutation }));
  void drainOfflineMutationQueue();
  return retriedMutations.length;
}

export async function drainOfflineMutationQueue() {
  if (drainInFlight) return drainInFlight;

  drainInFlight = (async () => {
    if (!(await canDrainNow())) return;

    let queue = await readMutationQueue();
    if (!queue.length) return;

    while (queue.length > 0) {
      const current = queue[0]!;
      if (isExpiredMomentCreateMutation(current)) {
        if (current.kind === 'moment_media_create') {
          await removeStagedOfflineMomentUpload(current.payload.localUri);
        }
        queue = await replaceQueue((existing) => existing.filter((item) => item.id !== current.id));
        continue;
      }
      if (current.nextAttemptAt && current.nextAttemptAt > Date.now()) {
        break;
      }

      const nextCurrent = {
        ...current,
        attempts: current.attempts + 1,
        lastAttemptAt: Date.now(),
        nextAttemptAt: null,
        lastError: null,
      } as OfflineMutation;

      await replaceQueue((existing) => {
        if (!existing.length) return existing;
        const [head, ...rest] = existing;
        if (!head || head.id !== current.id) return existing;
        return [nextCurrent, ...rest];
      });

      try {
        await processMutation(nextCurrent);
        emitMutationEvent({ type: 'completed', mutation: nextCurrent });
        queue = await replaceQueue((existing) => existing.filter((item) => item.id !== current.id));
      } catch (error) {
        const failureReason = stringifyMutationError(error);
        const failedCurrent = {
          ...nextCurrent,
          lastError: failureReason,
        } as OfflineMutation;

        if (isRetryableMutationError(error) && nextCurrent.attempts < MAX_MUTATION_ATTEMPTS) {
          const nextAttemptAt = Date.now() + getRetryDelayMs(nextCurrent.attempts);
          await replaceQueue((existing) =>
            existing.map((item) =>
              item.id === current.id
                ? {
                    ...failedCurrent,
                    nextAttemptAt,
                  } as OfflineMutation
                : item,
            ),
          );
          break;
        }

        if (nextCurrent.attempts >= MAX_MUTATION_ATTEMPTS) {
          queue = await moveMutationToFailed(failedCurrent, failureReason);
          continue;
        }

        queue = await moveMutationToFailed(failedCurrent, failureReason);
      }
    }
  })().finally(() => {
    drainInFlight = null;
  });

  return drainInFlight;
}

export function subscribeToOfflineMutationQueue(listener: QueueListener) {
  listeners.add(listener);
  void getPendingOfflineMutationCount().then((size) => listener(size));
  return () => {
    listeners.delete(listener);
  };
}

export function subscribeToOfflineMutationEvents(listener: QueueMutationListener) {
  mutationListeners.add(listener);
  return () => {
    mutationListeners.delete(listener);
  };
}

export function startOfflineMutationQueueAutoDrain() {
  let currentAppState: AppStateStatus = AppState.currentState;
  const isActive = () => currentAppState === 'active';

  if (isActive()) {
    void drainOfflineMutationQueue();
  }

  const interval = setInterval(() => {
    if (!isActive()) return;
    void drainOfflineMutationQueue();
  }, AUTO_DRAIN_INTERVAL_MS);

  const unsubscribe = addEventListener((state) => {
    if (!isActive()) return;
    if (state.isConnected === false || state.isInternetReachable === false) {
      return;
    }
    void drainOfflineMutationQueue();
  });

  const appStateSubscription = AppState.addEventListener('change', (state) => {
    currentAppState = state;
    if (state === 'active') {
      void drainOfflineMutationQueue();
    }
  });

  return () => {
    clearInterval(interval);
    unsubscribe();
    appStateSubscription.remove();
  };
}
