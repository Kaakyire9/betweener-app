import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  createCirclePulseCommentOfflineSafe,
  deleteCirclePulseCommentOfflineSafe,
  syncCirclePulseCommentPinOfflineSafe,
  syncCirclePulseCommentReactionOfflineSafe,
  syncCirclePulseCommentReportOfflineSafe,
  updateCirclePulseCommentOfflineSafe,
} from '@/lib/circles/pulse/circle-pulse-offline-actions';
import { logger } from '@/lib/telemetry/logger';
import {
  getOfflineMutationQueueSnapshot,
  retryFailedOfflineMutation,
  subscribeToOfflineMutationEvents,
} from '@/lib/offline/mutation-queue';
import { supabase } from '@/lib/supabase';
import {
  readCirclePulseCommentsSnapshotState,
  readCirclePulseDiscussionReadState,
  writeCirclePulseCommentsSnapshot,
  writeCirclePulseDiscussionReadState,
} from '@/lib/offline/circle-pulse-comments-store';
import {
  fetchCirclePulseCommentSnapshot,
  fetchCirclePulseDiscussionReadState,
  fetchCirclePulseCommentsPage,
  markCirclePulseDiscussionSeen as markCirclePulseDiscussionSeenRemote,
} from './circle-pulse-service';
import type { CirclePulseComment, CirclePulseCommentReaction } from './circle-pulse-types';

const PAGE_SIZE = 30;

type Options = {
  itemId: string | null;
  circleId?: string | null;
  actorProfileId: string | null;
  actorDisplayName?: string | null;
  enabled: boolean;
};

type ModerationSyncState = {
  pinStatus: 'queued' | 'failed' | null;
  reportStatus: 'queued' | 'failed' | null;
  pinFailedMutationId: string | null;
  reportFailedMutationId: string | null;
};

type RealtimeCommentReactionPayload = {
  new?: { comment_id?: string | number | null } | null;
  old?: { comment_id?: string | number | null } | null;
};

const sortCommentsAsc = (comments: CirclePulseComment[]) =>
  [...comments].sort((left, right) => {
    const leftKey = new Date(left.createdAt).getTime();
    const rightKey = new Date(right.createdAt).getTime();
    if (leftKey !== rightKey) return leftKey - rightKey;
    return left.id.localeCompare(right.id);
  });

const mergeComments = (
  current: CirclePulseComment[],
  incoming: CirclePulseComment[],
) => {
  const byId = new Map<string, CirclePulseComment>();
  current.forEach((comment) => byId.set(comment.id, comment));
  incoming.forEach((comment) => byId.set(comment.id, comment));
  return sortCommentsAsc(Array.from(byId.values()));
};

const applyReactionSummaryChange = (
  comment: CirclePulseComment,
  nextReaction: CirclePulseCommentReaction,
  reacted: boolean,
) => {
  const summary = new Map(comment.reactionSummary.map((entry) => [entry.reaction, entry.count]));
  const previousReaction = comment.myReaction;

  if (previousReaction) {
    const nextCount = Math.max(0, (summary.get(previousReaction) ?? 0) - 1);
    if (nextCount > 0) {
      summary.set(previousReaction, nextCount);
    } else {
      summary.delete(previousReaction);
    }
  }

  if (reacted) {
    summary.set(nextReaction, (summary.get(nextReaction) ?? 0) + 1);
  }

  return Array.from(summary.entries()).map(([reaction, count]) => ({ reaction, count }));
};

export function useCirclePulseComments({
  itemId,
  circleId,
  actorProfileId,
  actorDisplayName,
  enabled,
}: Options) {
  const [comments, setComments] = useState<CirclePulseComment[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [moderationSyncByCommentId, setModerationSyncByCommentId] = useState<Record<string, ModerationSyncState>>({});
  const [lastSeenCommentId, setLastSeenCommentId] = useState<string | null>(null);
  const [lastSeenAt, setLastSeenAt] = useState<string | null>(null);
  const broadcastChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!itemId) {
      setLastSeenCommentId(null);
      setLastSeenAt(null);
      return () => {
        cancelled = true;
      };
    }
    void (async () => {
      const localState = await readCirclePulseDiscussionReadState(itemId, actorProfileId);
      if (!cancelled) {
        setLastSeenCommentId(localState.lastSeenCommentId);
        setLastSeenAt(localState.lastSeenAt);
      }
      if (!enabled || !actorProfileId) return;
      try {
        const remoteState = await fetchCirclePulseDiscussionReadState(itemId, actorProfileId);
        if (cancelled) return;
        setLastSeenCommentId(remoteState.lastSeenCommentId);
        setLastSeenAt(remoteState.lastSeenAt);
      } catch {
        // local state remains the fallback while offline or before remote is reachable
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [actorProfileId, enabled, itemId]);

  const removeCommentInPlace = useCallback((commentId: string) => {
    setComments((current) => current.filter((comment) => comment.id !== commentId));
  }, []);

  const hydrateRealtimeCommentSnapshot = useCallback(async (
    commentId: string,
    source: string,
    options?: {
      allowInsert?: boolean;
      removeOnFailure?: boolean;
    },
  ) => {
    if (!enabled || !itemId || !commentId) return;
    try {
      const snapshot = await fetchCirclePulseCommentSnapshot(commentId);
      setComments((current) => {
        const hasCurrentComment = current.some((comment) => comment.id === commentId);
        if (!hasCurrentComment && options?.allowInsert !== true) {
          return current;
        }
        return mergeComments(current, [snapshot]);
      });
      setError((current) => (current === 'Showing saved discussion.' ? null : current));
    } catch (loadError) {
      logger.warn('[circles] pulse_comment_snapshot_refresh_failed', {
        itemId,
        commentId,
        source,
        message: loadError instanceof Error ? loadError.message : String(loadError),
      });
      if (options?.removeOnFailure) {
        removeCommentInPlace(commentId);
      }
    }
  }, [enabled, itemId, removeCommentInPlace]);

  const broadcastCommentEvent = useCallback((payload: {
    kind: 'created' | 'updated' | 'deleted' | 'reaction' | 'pin' | 'report';
    commentId: string;
  }) => {
    const channel = broadcastChannelRef.current;
    if (!channel || !itemId || !actorProfileId) return;
    void channel.send({
      type: 'broadcast',
      event: 'comment_sync',
      payload: {
        itemId,
        actorProfileId,
        kind: payload.kind,
        commentId: payload.commentId,
        at: new Date().toISOString(),
      },
    });
  }, [actorProfileId, itemId]);

  const reloadModerationSyncState = useCallback(async () => {
    if (!itemId || !actorProfileId) {
      setModerationSyncByCommentId({});
      return;
    }

    const { pending, failed } = await getOfflineMutationQueueSnapshot();
    const next: Record<string, ModerationSyncState> = {};

    const ensureEntry = (commentId: string) => {
      next[commentId] ??= {
        pinStatus: null,
        reportStatus: null,
        pinFailedMutationId: null,
        reportFailedMutationId: null,
      };
      return next[commentId];
    };

    pending.forEach((mutation) => {
      if (
        (mutation.kind === 'circle_pulse_comment_pin_sync' ||
          mutation.kind === 'circle_pulse_comment_report_sync') &&
        mutation.payload.itemId === itemId &&
        mutation.payload.actorProfileId === actorProfileId
      ) {
        const entry = ensureEntry(mutation.payload.commentId);
        if (mutation.kind === 'circle_pulse_comment_pin_sync') {
          entry.pinStatus = 'queued';
        } else {
          entry.reportStatus = 'queued';
        }
      }
    });

    failed.forEach((mutation) => {
      if (
        (mutation.kind === 'circle_pulse_comment_pin_sync' ||
          mutation.kind === 'circle_pulse_comment_report_sync') &&
        mutation.payload.itemId === itemId &&
        mutation.payload.actorProfileId === actorProfileId
      ) {
        const entry = ensureEntry(mutation.payload.commentId);
        if (mutation.kind === 'circle_pulse_comment_pin_sync') {
          entry.pinStatus = 'failed';
          entry.pinFailedMutationId = mutation.id;
        } else {
          entry.reportStatus = 'failed';
          entry.reportFailedMutationId = mutation.id;
        }
      }
    });

    setModerationSyncByCommentId(next);
  }, [actorProfileId, itemId]);

  useEffect(() => {
    let cancelled = false;
    if (!enabled || !itemId) return () => {
      cancelled = true;
    };

    void (async () => {
      const snapshotState = await readCirclePulseCommentsSnapshotState(itemId, actorProfileId);
      if (cancelled || !snapshotState.data) return;
      setComments((current) => (current.length ? current : snapshotState.data ?? []));
      setHasMore(snapshotState.data.length >= PAGE_SIZE);
    })();

    return () => {
      cancelled = true;
    };
  }, [actorProfileId, enabled, itemId]);

  useEffect(() => {
    if (!enabled || !itemId) return;
    void writeCirclePulseCommentsSnapshot(itemId, actorProfileId, comments);
  }, [actorProfileId, comments, enabled, itemId]);

  useEffect(() => {
    void reloadModerationSyncState();
  }, [reloadModerationSyncState]);

  useEffect(() => {
    if (!enabled || !itemId || !actorProfileId) return;

    return subscribeToOfflineMutationEvents((event) => {
      const mutation = event.mutation;
      if (
        mutation.kind !== 'circle_pulse_comment_create' &&
        mutation.kind !== 'circle_pulse_comment_update' &&
        mutation.kind !== 'circle_pulse_comment_delete' &&
        mutation.kind !== 'circle_pulse_comment_reaction_sync' &&
        mutation.kind !== 'circle_pulse_comment_pin_sync' &&
        mutation.kind !== 'circle_pulse_comment_report_sync'
      ) {
        return;
      }

      if (mutation.payload.itemId !== itemId || mutation.payload.actorProfileId !== actorProfileId) {
        return;
      }

      void (async () => {
        await reloadModerationSyncState();
        const snapshotState = await readCirclePulseCommentsSnapshotState(itemId, actorProfileId);
        if (!snapshotState.data) return;
        setComments(snapshotState.data);
      })();
    });
  }, [actorProfileId, enabled, itemId, reloadModerationSyncState]);

  const reload = useCallback(async () => {
    if (!enabled || !itemId) {
      setComments([]);
      setHasMore(false);
      setLoading(false);
      setLoadingMore(false);
      setError(null);
      return;
    }

    setLoading(true);
    setLoadingMore(false);
    setError(null);
    setComments([]);
    setHasMore(false);
    try {
      const page = await fetchCirclePulseCommentsPage(itemId, { limit: PAGE_SIZE });
      setComments(page);
      setHasMore(page.length >= PAGE_SIZE);
    } catch (loadError) {
      logger.warn('[circles] pulse_comments_load_failed', {
        itemId,
        message: loadError instanceof Error ? loadError.message : String(loadError),
      });
      const snapshotState = await readCirclePulseCommentsSnapshotState(itemId, actorProfileId);
      if (snapshotState.data) {
        setComments(snapshotState.data);
        setHasMore(snapshotState.data.length >= PAGE_SIZE);
        setError('Showing saved discussion.');
      } else {
        setError('Discussion could not refresh.');
      }
    } finally {
      setLoading(false);
    }
  }, [actorProfileId, enabled, itemId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const loadMore = useCallback(async () => {
    if (!enabled || !itemId || loadingMore || !hasMore || comments.length === 0) return;
    const oldest = comments[0];
    setLoadingMore(true);
    setError(null);
    try {
      const page = await fetchCirclePulseCommentsPage(itemId, {
        limit: PAGE_SIZE,
        beforeCreatedAt: oldest.createdAt,
        beforeId: oldest.id,
      });
      setComments((current) => mergeComments(current, page));
      setHasMore(page.length >= PAGE_SIZE);
    } catch (loadError) {
      logger.warn('[circles] pulse_comments_page_failed', {
        itemId,
        message: loadError instanceof Error ? loadError.message : String(loadError),
      });
      const snapshotState = await readCirclePulseCommentsSnapshotState(itemId, actorProfileId);
      if (snapshotState.data) {
        setComments(snapshotState.data);
        setHasMore(snapshotState.data.length >= PAGE_SIZE);
        setError('Showing saved discussion.');
      } else {
        setError('Older comments could not load.');
      }
    } finally {
      setLoadingMore(false);
    }
  }, [actorProfileId, comments, enabled, hasMore, itemId, loadingMore]);

  useEffect(() => {
    if (!enabled || !itemId) return;

    const channel = supabase.channel(`circle-pulse-comment-events:${itemId}`);
    broadcastChannelRef.current = channel;
    channel
      .on('broadcast', { event: 'comment_sync' }, ({ payload }) => {
        if (!payload || payload.itemId !== itemId || payload.actorProfileId === actorProfileId) return;
        const commentId = typeof payload.commentId === 'string' ? payload.commentId : '';
        const kind = String(payload.kind ?? 'comment_sync');
        if (!commentId) return;
        if (kind === 'deleted') {
          removeCommentInPlace(commentId);
          return;
        }
        void hydrateRealtimeCommentSnapshot(commentId, `broadcast:${kind}`, {
          allowInsert: kind === 'created' || kind === 'pin',
          removeOnFailure: kind === 'deleted',
        });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      if (broadcastChannelRef.current === channel) {
        broadcastChannelRef.current = null;
      }
    };
  }, [actorProfileId, enabled, hydrateRealtimeCommentSnapshot, itemId, removeCommentInPlace]);

  useEffect(() => {
    if (!enabled || !itemId) return;

    const channel = supabase
      .channel(`circle-pulse-comments:${itemId}:${actorProfileId ?? 'viewer'}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'circle_pulse_comments',
          filter: `pulse_item_id=eq.${itemId}`,
        },
        (payload) => {
          const commentId = String(payload.new?.id ?? '');
          if (!commentId) return;
          void hydrateRealtimeCommentSnapshot(commentId, 'postgres_insert', {
            allowInsert: true,
          });
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'circle_pulse_comments',
          filter: `pulse_item_id=eq.${itemId}`,
        },
        async (payload) => {
          const commentId = String(payload.new?.id ?? payload.old?.id ?? '');
          if (!commentId) return;
          if (payload.new?.status && payload.new.status !== 'active') {
            removeCommentInPlace(commentId);
            return;
          }
          void hydrateRealtimeCommentSnapshot(commentId, 'postgres_update', {
            allowInsert: Boolean(payload.new?.pinned_at),
            removeOnFailure: true,
          });
        },
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'circle_pulse_comment_reactions',
          filter: `pulse_item_id=eq.${itemId}`,
        },
        (payload) => {
          const reactionPayload = payload as RealtimeCommentReactionPayload;
          const commentId = String(reactionPayload.new?.comment_id ?? reactionPayload.old?.comment_id ?? '');
          if (!commentId) return;
          void hydrateRealtimeCommentSnapshot(commentId, 'postgres_reaction');
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [actorProfileId, enabled, hydrateRealtimeCommentSnapshot, itemId, removeCommentInPlace]);

  const send = useCallback(async (body: string, parentCommentId?: string | null) => {
    if (!itemId || !circleId || !actorProfileId) throw new Error('Profile is not ready.');
    const result = await createCirclePulseCommentOfflineSafe({
      itemId,
      circleId,
      actorProfileId,
      actorDisplayName,
      body,
      parentCommentId: parentCommentId ?? null,
    });
    const comment = result.comment;
    setComments((current) => mergeComments(current, [comment]));
    broadcastCommentEvent({ kind: 'created', commentId: comment.id });
    return comment;
  }, [actorDisplayName, actorProfileId, broadcastCommentEvent, circleId, itemId]);

  const remove = useCallback(async (commentId: string) => {
    if (!actorProfileId || !itemId) throw new Error('Profile is not ready.');
    await deleteCirclePulseCommentOfflineSafe({
      commentId,
      itemId,
      actorProfileId,
    });
    setComments((current) => current.filter((comment) => comment.id !== commentId));
    broadcastCommentEvent({ kind: 'deleted', commentId });
  }, [actorProfileId, broadcastCommentEvent, itemId]);

  const update = useCallback(async (commentId: string, body: string) => {
    if (!actorProfileId || !itemId) throw new Error('Profile is not ready.');
    const result = await updateCirclePulseCommentOfflineSafe({
      commentId,
      itemId,
      actorProfileId,
      body,
    });
    if (result.status === 'synced' && result.comment) {
      setComments((current) => mergeComments(current, [result.comment]));
      broadcastCommentEvent({ kind: 'updated', commentId });
      return result.comment;
    }
    const updatedAt = new Date().toISOString();
    setComments((current) =>
      current.map((comment) =>
        comment.id === commentId
          ? { ...comment, body, updatedAt, editedAt: updatedAt }
          : comment,
      ),
    );
    broadcastCommentEvent({ kind: 'updated', commentId });
    return null;
  }, [actorProfileId, broadcastCommentEvent, itemId]);

  const pin = useCallback(async (commentId: string, pinned = true) => {
    if (!actorProfileId || !itemId) throw new Error('Profile is not ready.');
    await syncCirclePulseCommentPinOfflineSafe({
      commentId,
      itemId,
      actorProfileId,
      pinned,
    });
    setComments((current) =>
      current.map((comment) =>
        comment.id === commentId
          ? { ...comment, pinnedAt: pinned ? new Date().toISOString() : null }
          : pinned
            ? { ...comment, pinnedAt: null }
            : comment
      ),
    );
    if (!pinned) {
      broadcastCommentEvent({ kind: 'pin', commentId });
      return;
    }
    broadcastCommentEvent({ kind: 'pin', commentId });
  }, [actorProfileId, broadcastCommentEvent, itemId]);

  const report = useCallback(async (commentId: string) => {
    if (!actorProfileId || !itemId) throw new Error('Profile is not ready.');
    await syncCirclePulseCommentReportOfflineSafe({
      commentId,
      itemId,
      actorProfileId,
    });
    setComments((current) =>
      current.map((comment) =>
        comment.id === commentId
          ? { ...comment, reportCount: comment.reportCount + 1 }
          : comment,
      ),
    );
    broadcastCommentEvent({ kind: 'report', commentId });
  }, [actorProfileId, broadcastCommentEvent, itemId]);

  const toggleReaction = useCallback(async (
    commentId: string,
    reaction: CirclePulseCommentReaction = 'heart',
  ) => {
    if (!actorProfileId || !itemId) throw new Error('Profile is not ready.');
    const targetComment = comments.find((comment) => comment.id === commentId);
    const currentReaction = targetComment?.myReaction ?? null;
    const desiredReaction = currentReaction === reaction ? null : reaction;
    const reacted = desiredReaction !== null;
    await syncCirclePulseCommentReactionOfflineSafe({
      commentId,
      itemId,
      actorProfileId,
      reaction: desiredReaction,
      currentReaction,
    });
    setComments((current) =>
      current.map((comment) => {
        if (comment.id !== commentId) return comment;
        return {
          ...comment,
          myReaction: desiredReaction,
          reactionCount: Math.max(
            0,
            comment.reactionCount + (reacted && !comment.myReaction ? 1 : !reacted && comment.myReaction ? -1 : 0),
          ),
          reactionSummary: applyReactionSummaryChange(comment, reaction, reacted),
        };
      }),
    );
    broadcastCommentEvent({ kind: 'reaction', commentId });
    return reacted;
  }, [actorProfileId, broadcastCommentEvent, comments, itemId]);

  const retryModerationSync = useCallback(async (
    commentId: string,
    kind: 'pin' | 'report',
  ) => {
    const state = moderationSyncByCommentId[commentId];
    const mutationId =
      kind === 'pin' ? state?.pinFailedMutationId ?? null : state?.reportFailedMutationId ?? null;
    if (!mutationId) return false;
    const retried = await retryFailedOfflineMutation(mutationId);
    await reloadModerationSyncState();
    return retried;
  }, [moderationSyncByCommentId, reloadModerationSyncState]);

  const markDiscussionSeen = useCallback(async () => {
    if (!itemId) return;
    const latestVisibleComment = comments.reduce<CirclePulseComment | null>((latest, comment) => {
      if (comment.isOwn) return latest;
      if (!latest) return comment;
      return new Date(comment.createdAt).getTime() > new Date(latest.createdAt).getTime() ? comment : latest;
    }, null);
    const nextLastSeenAt = latestVisibleComment?.createdAt ?? new Date().toISOString();
    await writeCirclePulseDiscussionReadState(itemId, actorProfileId, {
      lastSeenCommentId: latestVisibleComment?.id ?? null,
      lastSeenAt: nextLastSeenAt,
    });
    setLastSeenCommentId(latestVisibleComment?.id ?? null);
    setLastSeenAt(nextLastSeenAt);
    if (!actorProfileId) return;
    try {
      await markCirclePulseDiscussionSeenRemote(itemId, actorProfileId, {
        lastSeenCommentId: latestVisibleComment?.id ?? null,
        lastSeenAt: nextLastSeenAt,
      });
    } catch (error) {
      logger.warn('[circles] pulse_discussion_seen_sync_failed', {
        itemId,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }, [actorProfileId, comments, itemId]);

  const unreadCommentIds = useMemo(() => {
    if (!lastSeenAt) {
      return comments.flatMap((comment) => (comment.isOwn ? [] : [comment.id]));
    }
    const lastSeenAtMs = new Date(lastSeenAt).getTime();
    if (Number.isNaN(lastSeenAtMs)) {
      return comments.flatMap((comment) => (comment.isOwn ? [] : [comment.id]));
    }
    return comments.flatMap((comment) => {
      if (comment.isOwn) return [];
      const commentCreatedAtMs = new Date(comment.createdAt).getTime();
      return Number.isFinite(commentCreatedAtMs) && commentCreatedAtMs > lastSeenAtMs ? [comment.id] : [];
    });
  }, [comments, lastSeenAt]);

  const newActivityCount = unreadCommentIds.length;

  const firstUnreadCommentId = useMemo(() => {
    return unreadCommentIds[0] ?? null;
  }, [unreadCommentIds]);

  return useMemo(() => ({
    comments,
    loading,
    loadingMore,
    hasMore,
    error,
    reload,
    loadMore,
    send,
    update,
    pin,
    remove,
    report,
    toggleReaction,
    moderationSyncByCommentId,
    retryModerationSync,
    lastSeenCommentId,
    newActivityCount,
    unreadCommentIds,
    firstUnreadCommentId,
    markDiscussionSeen,
  }), [
    comments,
    loading,
    loadingMore,
    hasMore,
    error,
    reload,
    loadMore,
    send,
    update,
    pin,
    remove,
    report,
    toggleReaction,
    moderationSyncByCommentId,
    retryModerationSync,
    lastSeenCommentId,
    newActivityCount,
    unreadCommentIds,
    firstUnreadCommentId,
    markDiscussionSeen,
  ]);
}
