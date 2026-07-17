import { fetch as fetchNetInfo } from '@react-native-community/netinfo';

import { isLikelyNetworkError } from '@/lib/network';
import {
  clearCirclePulseCommentMutationArtifacts,
  enqueueCirclePulseCommentCreateMutation,
  enqueueCirclePulseCommentDeleteMutation,
  enqueueCirclePulseCommentPinSyncMutation,
  enqueueCirclePulseCommentReactionSyncMutation,
  enqueueCirclePulseCommentReportSyncMutation,
  enqueueCirclePulseCommentUpdateMutation,
  isOfflineCirclePulseCommentId,
  replacePendingCirclePulseCommentCreateBody,
} from '@/lib/offline/mutation-queue';
import {
  createCirclePulseComment,
  deleteCirclePulseComment,
  pinCirclePulseComment,
  reportCirclePulseComment,
  toggleCirclePulseCommentReaction,
  updateCirclePulseComment,
} from './circle-pulse-service';
import type {
  CirclePulseComment,
  CirclePulseCommentReaction,
} from './circle-pulse-types';

const buildOfflineCirclePulseCommentId = () =>
  `offline-circle-pulse-comment:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`;

const getInternetReady = async () => {
  try {
    const state = await fetchNetInfo();
    return state.isConnected !== false && state.isInternetReachable !== false;
  } catch {
    return true;
  }
};

const buildOptimisticCirclePulseComment = (params: {
  tempId: string;
  itemId: string;
  circleId: string;
  actorProfileId: string;
  body: string;
  parentCommentId?: string | null;
  actorDisplayName?: string | null;
  createdAt: string;
}): CirclePulseComment => ({
  id: params.tempId,
  itemId: params.itemId,
  circleId: params.circleId,
  profileId: params.actorProfileId,
  displayName: params.actorDisplayName?.trim() || 'You',
  avatarUrl: null,
  body: params.body,
  parentCommentId: params.parentCommentId ?? null,
  createdAt: params.createdAt,
  updatedAt: params.createdAt,
  editedAt: null,
  isOwn: true,
  canRemove: true,
  canEdit: true,
  canPin: false,
  pinnedAt: null,
  reportCount: 0,
  reactionCount: 0,
  replyPreviewProfileId: null,
  replyPreviewDisplayName: null,
  replyPreviewBody: null,
  reactionSummary: [],
  myReaction: null,
});

export async function createCirclePulseCommentOfflineSafe(params: {
  itemId: string;
  circleId: string;
  actorProfileId: string;
  actorDisplayName?: string | null;
  body: string;
  parentCommentId?: string | null;
}) {
  const payload = {
    tempId: buildOfflineCirclePulseCommentId(),
    itemId: params.itemId,
    actorProfileId: params.actorProfileId,
    body: params.body,
    parentCommentId: params.parentCommentId ?? null,
    createdAt: new Date().toISOString(),
  };

  const optimistic = buildOptimisticCirclePulseComment({
    ...payload,
    circleId: params.circleId,
    actorProfileId: params.actorProfileId,
    actorDisplayName: params.actorDisplayName,
  });

  if (!(await getInternetReady())) {
    await enqueueCirclePulseCommentCreateMutation(payload);
    return { status: 'queued' as const, comment: optimistic };
  }

  try {
    const comment = await createCirclePulseComment(
      params.itemId,
      params.actorProfileId,
      params.body,
      params.parentCommentId ?? null,
    );
    return { status: 'synced' as const, comment };
  } catch (error) {
    if (!isLikelyNetworkError(error)) throw error;
    await enqueueCirclePulseCommentCreateMutation(payload);
    return { status: 'queued' as const, comment: optimistic };
  }
}

export async function updateCirclePulseCommentOfflineSafe(params: {
  commentId: string;
  itemId: string;
  actorProfileId: string;
  body: string;
}) {
  const payload = {
    commentId: params.commentId,
    itemId: params.itemId,
    actorProfileId: params.actorProfileId,
    body: params.body,
    updatedAt: new Date().toISOString(),
  };

  if (isOfflineCirclePulseCommentId(params.commentId)) {
    await replacePendingCirclePulseCommentCreateBody(params.commentId, params.body);
    return { status: 'queued' as const };
  }

  if (!(await getInternetReady())) {
    await enqueueCirclePulseCommentUpdateMutation(payload);
    return { status: 'queued' as const };
  }

  try {
    const comment = await updateCirclePulseComment(
      params.commentId,
      params.actorProfileId,
      params.body,
    );
    return { status: 'synced' as const, comment };
  } catch (error) {
    if (!isLikelyNetworkError(error)) throw error;
    await enqueueCirclePulseCommentUpdateMutation(payload);
    return { status: 'queued' as const };
  }
}

export async function deleteCirclePulseCommentOfflineSafe(params: {
  commentId: string;
  itemId: string;
  actorProfileId: string;
}) {
  if (isOfflineCirclePulseCommentId(params.commentId)) {
    await clearCirclePulseCommentMutationArtifacts(params.commentId);
    return { status: 'queued' as const };
  }

  const payload = {
    commentId: params.commentId,
    itemId: params.itemId,
    actorProfileId: params.actorProfileId,
    deletedAt: new Date().toISOString(),
  };

  if (!(await getInternetReady())) {
    await enqueueCirclePulseCommentDeleteMutation(payload);
    return { status: 'queued' as const };
  }

  try {
    await deleteCirclePulseComment(params.commentId, params.actorProfileId);
    await clearCirclePulseCommentMutationArtifacts(params.commentId);
    return { status: 'synced' as const };
  } catch (error) {
    if (!isLikelyNetworkError(error)) throw error;
    await enqueueCirclePulseCommentDeleteMutation(payload);
    return { status: 'queued' as const };
  }
}

export async function syncCirclePulseCommentReactionOfflineSafe(params: {
  commentId: string;
  itemId: string;
  actorProfileId: string;
  reaction: CirclePulseCommentReaction | null;
  currentReaction?: CirclePulseCommentReaction | null;
}) {
  const payload = {
    commentId: params.commentId,
    itemId: params.itemId,
    actorProfileId: params.actorProfileId,
    reaction: params.reaction ?? null,
    syncedAt: new Date().toISOString(),
  };

  if (isOfflineCirclePulseCommentId(params.commentId)) {
    await enqueueCirclePulseCommentReactionSyncMutation(payload);
    return { status: 'queued' as const };
  }

  if (!(await getInternetReady())) {
    await enqueueCirclePulseCommentReactionSyncMutation(payload);
    return { status: 'queued' as const };
  }

  try {
    const reactionToToggle = params.reaction ?? params.currentReaction ?? null;
    if (reactionToToggle) {
      await toggleCirclePulseCommentReaction(
        params.commentId,
        params.actorProfileId,
        reactionToToggle,
      );
    }
    return { status: 'synced' as const };
  } catch (error) {
    if (!isLikelyNetworkError(error)) throw error;
    await enqueueCirclePulseCommentReactionSyncMutation(payload);
    return { status: 'queued' as const };
  }
}

export async function syncCirclePulseCommentPinOfflineSafe(params: {
  commentId: string;
  itemId: string;
  actorProfileId: string;
  pinned: boolean;
}) {
  const payload = {
    commentId: params.commentId,
    itemId: params.itemId,
    actorProfileId: params.actorProfileId,
    pinned: params.pinned,
    syncedAt: new Date().toISOString(),
  };

  if (isOfflineCirclePulseCommentId(params.commentId)) {
    return { status: 'queued' as const };
  }

  if (!(await getInternetReady())) {
    await enqueueCirclePulseCommentPinSyncMutation(payload);
    return { status: 'queued' as const };
  }

  try {
    await pinCirclePulseComment(
      params.commentId,
      params.actorProfileId,
      params.pinned,
    );
    return { status: 'synced' as const };
  } catch (error) {
    if (!isLikelyNetworkError(error)) throw error;
    await enqueueCirclePulseCommentPinSyncMutation(payload);
    return { status: 'queued' as const };
  }
}

export async function syncCirclePulseCommentReportOfflineSafe(params: {
  commentId: string;
  itemId: string;
  actorProfileId: string;
}) {
  const payload = {
    commentId: params.commentId,
    itemId: params.itemId,
    actorProfileId: params.actorProfileId,
    syncedAt: new Date().toISOString(),
  };

  if (isOfflineCirclePulseCommentId(params.commentId)) {
    return { status: 'queued' as const };
  }

  if (!(await getInternetReady())) {
    await enqueueCirclePulseCommentReportSyncMutation(payload);
    return { status: 'queued' as const };
  }

  try {
    await reportCirclePulseComment(params.commentId, params.actorProfileId);
    return { status: 'synced' as const };
  } catch (error) {
    if (!isLikelyNetworkError(error)) throw error;
    await enqueueCirclePulseCommentReportSyncMutation(payload);
    return { status: 'queued' as const };
  }
}
