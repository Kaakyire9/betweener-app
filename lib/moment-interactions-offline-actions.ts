import { fetch as fetchNetInfo } from '@react-native-community/netinfo';

import { isLikelyNetworkError } from '@/lib/network';
import {
  clearMomentCommentMutationArtifacts,
  enqueueMomentCommentCreateMutation,
  enqueueMomentCommentDeleteMutation,
  enqueueMomentCommentReactionSyncMutation,
  enqueueMomentCommentUpdateMutation,
  enqueueMomentReactionSyncMutation,
  isOfflineMomentCommentId,
  replacePendingMomentCommentCreateBody,
  removePendingMomentCommentCreateMutation,
} from '@/lib/offline/mutation-queue';
import { supabase } from '@/lib/supabase';

const buildOfflineCommentId = () =>
  `offline-comment:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`;

const getInternetReady = async () => {
  try {
    const state = await fetchNetInfo();
    return state.isConnected !== false && state.isInternetReachable !== false;
  } catch {
    return true;
  }
};

export async function syncMomentReactionOfflineSafe(params: {
  momentId: string;
  userId: string;
  emoji: string | null;
  previousEmoji?: string | null;
}) {
  const payload = {
    momentId: params.momentId,
    userId: params.userId,
    emoji: params.emoji ?? null,
    previousEmoji: params.previousEmoji ?? null,
  };

  if (!(await getInternetReady())) {
    await enqueueMomentReactionSyncMutation(payload);
    return { status: 'queued' as const };
  }

  try {
    const { data, error } = await supabase.rpc('rpc_sync_moment_reaction', {
      p_moment_id: params.momentId,
      p_emoji: params.emoji,
    });
    if (error) throw error;
    if (data !== true) throw new Error('moment_reaction_unavailable');
    return { status: 'synced' as const };
  } catch (error) {
    if (!isLikelyNetworkError(error)) throw error;
    await enqueueMomentReactionSyncMutation(payload);
    return { status: 'queued' as const };
  }
}

export async function createMomentCommentOfflineSafe(params: {
  momentId: string;
  userId: string;
  body: string;
  parentCommentId?: string | null;
}) {
  const payload = {
    tempId: buildOfflineCommentId(),
    momentId: params.momentId,
    userId: params.userId,
    body: params.body,
    parentCommentId: params.parentCommentId ?? null,
    createdAt: new Date().toISOString(),
  };

  if (!(await getInternetReady())) {
    await enqueueMomentCommentCreateMutation(payload);
    return {
      status: 'queued' as const,
      comment: {
        id: payload.tempId,
        moment_id: payload.momentId,
        user_id: payload.userId,
        body: payload.body,
        created_at: payload.createdAt,
        parent_comment_id: payload.parentCommentId,
        is_deleted: false,
      },
    };
  }

  try {
    const { data, error } = await supabase.rpc('rpc_create_moment_comment', {
      p_moment_id: params.momentId,
      p_body: params.body,
      p_parent_comment_id: params.parentCommentId ?? null,
    });
    if (error || !data) throw error ?? new Error('comment_insert_failed');
    return { status: 'synced' as const, comment: data };
  } catch (error) {
    if (!isLikelyNetworkError(error)) throw error;
    await enqueueMomentCommentCreateMutation(payload);
    return {
      status: 'queued' as const,
      comment: {
        id: payload.tempId,
        moment_id: payload.momentId,
        user_id: payload.userId,
        body: payload.body,
        created_at: payload.createdAt,
        parent_comment_id: payload.parentCommentId,
        is_deleted: false,
      },
    };
  }
}

export async function updateMomentCommentOfflineSafe(params: {
  commentId: string;
  momentId: string;
  userId: string;
  body: string;
}) {
  const payload = {
    commentId: params.commentId,
    momentId: params.momentId,
    userId: params.userId,
    body: params.body,
    updatedAt: new Date().toISOString(),
  };

  if (isOfflineMomentCommentId(params.commentId)) {
    await replacePendingMomentCommentCreateBody(params.commentId, params.body);
    return { status: 'queued' as const };
  }

  if (!(await getInternetReady())) {
    await enqueueMomentCommentUpdateMutation(payload);
    return { status: 'queued' as const };
  }

  try {
    const { data, error } = await supabase.rpc('rpc_update_moment_comment', {
      p_comment_id: params.commentId,
      p_body: params.body,
    });
    if (error) throw error;
    if (!data) throw new Error('moment_comment_unavailable');
    return { status: 'synced' as const, comment: data };
  } catch (error) {
    if (!isLikelyNetworkError(error)) throw error;
    await enqueueMomentCommentUpdateMutation(payload);
    return { status: 'queued' as const };
  }
}

export async function deleteMomentCommentOfflineSafe(params: {
  commentId: string;
  momentId: string;
  userId: string;
}) {
  if (isOfflineMomentCommentId(params.commentId)) {
    await removePendingMomentCommentCreateMutation(params.commentId);
    return { status: 'queued' as const };
  }

  const payload = {
    commentId: params.commentId,
    momentId: params.momentId,
    userId: params.userId,
    deletedAt: new Date().toISOString(),
  };

  if (!(await getInternetReady())) {
    await enqueueMomentCommentDeleteMutation(payload);
    return { status: 'queued' as const };
  }

  try {
    const { data, error } = await supabase.rpc('rpc_delete_moment_comment', {
      p_comment_id: params.commentId,
    });
    if (error) throw error;
    if (data !== true) {
      await clearMomentCommentMutationArtifacts(params.commentId);
      return { status: 'synced' as const };
    }
    await clearMomentCommentMutationArtifacts(params.commentId);
    return { status: 'synced' as const };
  } catch (error) {
    if (!isLikelyNetworkError(error)) throw error;
    await enqueueMomentCommentDeleteMutation(payload);
    return { status: 'queued' as const };
  }
}

export async function syncMomentCommentReactionOfflineSafe(params: {
  commentId: string;
  momentId: string;
  userId: string;
  reaction: 'heart' | 'laugh' | 'love' | 'fire' | 'clap' | null;
  previousReaction?: 'heart' | 'laugh' | 'love' | 'fire' | 'clap' | null;
}) {
  const payload = {
    commentId: params.commentId,
    momentId: params.momentId,
    userId: params.userId,
    reaction: params.reaction ?? null,
    previousReaction: params.previousReaction ?? null,
    syncedAt: new Date().toISOString(),
  };

  if (!(await getInternetReady())) {
    await enqueueMomentCommentReactionSyncMutation(payload);
    return { status: 'queued' as const };
  }

  try {
    const { data, error } = await supabase.rpc('rpc_sync_moment_comment_reaction', {
      p_comment_id: params.commentId,
      p_reaction: params.reaction,
    });
    if (error) throw error;
    if (data !== true) throw new Error('moment_comment_reaction_unavailable');
    return { status: 'synced' as const };
  } catch (error) {
    if (!isLikelyNetworkError(error)) throw error;
    await enqueueMomentCommentReactionSyncMutation(payload);
    return { status: 'queued' as const };
  }
}
