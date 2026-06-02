import { useCallback, useEffect, useState } from 'react';
import { logger } from '@/lib/telemetry/logger';
import {
  createCirclePulseComment,
  deleteCirclePulseComment,
  fetchCirclePulseComments,
  reportCirclePulseComment,
  toggleCirclePulseCommentReaction,
} from './circle-pulse-service';
import type { CirclePulseComment, CirclePulseCommentReaction } from './circle-pulse-types';
import {
  CIRCLE_PULSE_DISCUSSION_REFRESH_INTERVAL_MS,
  useCirclePulseRefresh,
} from './use-circle-pulse-refresh';

type Options = {
  itemId: string | null;
  actorProfileId: string | null;
  enabled: boolean;
};

export function useCirclePulseComments({ itemId, actorProfileId, enabled }: Options) {
  const [comments, setComments] = useState<CirclePulseComment[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!enabled || !itemId) {
      setComments([]);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      setComments(await fetchCirclePulseComments(itemId));
    } catch (loadError) {
      logger.warn('[circles] pulse_comments_load_failed', {
        itemId,
        message: loadError instanceof Error ? loadError.message : String(loadError),
      });
      setError('Discussion could not refresh.');
    } finally {
      setLoading(false);
    }
  }, [enabled, itemId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useCirclePulseRefresh({
    enabled: enabled && !!itemId,
    reload,
    intervalMs: CIRCLE_PULSE_DISCUSSION_REFRESH_INTERVAL_MS,
  });

  const send = useCallback(async (body: string, parentCommentId?: string | null) => {
    if (!itemId || !actorProfileId) throw new Error('Profile is not ready.');
    const comment = await createCirclePulseComment(itemId, actorProfileId, body, parentCommentId);
    setComments((current) => [...current, comment]);
    return comment;
  }, [actorProfileId, itemId]);

  const remove = useCallback(async (commentId: string) => {
    if (!actorProfileId) throw new Error('Profile is not ready.');
    await deleteCirclePulseComment(commentId, actorProfileId);
    setComments((current) => current.filter((comment) => comment.id !== commentId));
  }, [actorProfileId]);

  const report = useCallback(async (commentId: string) => {
    if (!actorProfileId) throw new Error('Profile is not ready.');
    await reportCirclePulseComment(commentId, actorProfileId);
  }, [actorProfileId]);

  const toggleReaction = useCallback(async (
    commentId: string,
    reaction: CirclePulseCommentReaction = 'heart',
  ) => {
    if (!actorProfileId) throw new Error('Profile is not ready.');
    const reacted = await toggleCirclePulseCommentReaction(commentId, actorProfileId, reaction);
    setComments((current) =>
      current.map((comment) => {
        if (comment.id !== commentId) return comment;
        const hadReaction = !!comment.myReaction;
        return {
          ...comment,
          myReaction: reacted ? reaction : null,
          reactionCount: Math.max(0, comment.reactionCount + (reacted && !hadReaction ? 1 : !reacted && hadReaction ? -1 : 0)),
        };
      }),
    );
    return reacted;
  }, [actorProfileId]);

  return { comments, loading, error, reload, send, remove, report, toggleReaction };
}
