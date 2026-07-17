import { readOfflineState, writeOfflineEnvelope, type OfflineReadState } from '@/lib/offline/core';
import type { CirclePulseComment } from '@/lib/circles/pulse/circle-pulse-types';

const CIRCLE_PULSE_COMMENTS_SNAPSHOT_VERSION = 1;
const CIRCLE_PULSE_COMMENTS_STALE_AFTER_MS = 10 * 60 * 1000;
const CIRCLE_PULSE_DISCUSSION_READ_STATE_VERSION = 1;

export const buildCirclePulseCommentsSnapshotStoreKey = (
  itemId: string,
  actorProfileId?: string | null,
) => `offline:circles:pulse-comments:v${CIRCLE_PULSE_COMMENTS_SNAPSHOT_VERSION}:${actorProfileId || 'viewer'}:${itemId}`;

const buildCirclePulseDiscussionReadStateStoreKey = (
  itemId: string,
  actorProfileId?: string | null,
) => `offline:circles:pulse-comments-read:v${CIRCLE_PULSE_DISCUSSION_READ_STATE_VERSION}:${actorProfileId || 'viewer'}:${itemId}`;

export type CirclePulseDiscussionReadState = {
  lastSeenCommentId: string | null;
  lastSeenAt: string | null;
};

export async function readCirclePulseCommentsSnapshotState(
  itemId: string,
  actorProfileId?: string | null,
): Promise<OfflineReadState<CirclePulseComment[]>> {
  return readOfflineState<CirclePulseComment[]>(
    buildCirclePulseCommentsSnapshotStoreKey(itemId, actorProfileId),
  );
}

export async function writeCirclePulseCommentsSnapshot(
  itemId: string,
  actorProfileId: string | null | undefined,
  comments: CirclePulseComment[],
  options?: { staleAfterMs?: number },
): Promise<void> {
  await writeOfflineEnvelope(
    buildCirclePulseCommentsSnapshotStoreKey(itemId, actorProfileId),
    comments,
    {
      kind: 'circle-pulse-comments-snapshot',
      staleAfterMs: options?.staleAfterMs ?? CIRCLE_PULSE_COMMENTS_STALE_AFTER_MS,
    },
  );
}

export async function readCirclePulseDiscussionReadState(
  itemId: string,
  actorProfileId?: string | null,
): Promise<CirclePulseDiscussionReadState> {
  const state = await readOfflineState<CirclePulseDiscussionReadState>(
    buildCirclePulseDiscussionReadStateStoreKey(itemId, actorProfileId),
  );
  return {
    lastSeenCommentId:
      state.data && typeof state.data.lastSeenCommentId === 'string' && state.data.lastSeenCommentId.trim()
        ? state.data.lastSeenCommentId
        : null,
    lastSeenAt:
      state.data && typeof state.data.lastSeenAt === 'string' && state.data.lastSeenAt.trim()
        ? state.data.lastSeenAt
        : null,
  };
}

export async function writeCirclePulseDiscussionReadState(
  itemId: string,
  actorProfileId: string | null | undefined,
  value: CirclePulseDiscussionReadState,
): Promise<void> {
  await writeOfflineEnvelope(
    buildCirclePulseDiscussionReadStateStoreKey(itemId, actorProfileId),
    value,
    {
      kind: 'circle-pulse-comments-read-state',
      staleAfterMs: 365 * 24 * 60 * 60 * 1000,
    },
  );
}

const sortCommentsAsc = (comments: CirclePulseComment[]) =>
  [...comments].sort((left, right) => {
    const leftKey = new Date(left.createdAt).getTime();
    const rightKey = new Date(right.createdAt).getTime();
    if (leftKey !== rightKey) return leftKey - rightKey;
    return left.id.localeCompare(right.id);
  });

export async function upsertCirclePulseCommentSnapshot(
  itemId: string,
  actorProfileId: string | null | undefined,
  comment: CirclePulseComment,
): Promise<CirclePulseComment[]> {
  const current = (await readCirclePulseCommentsSnapshotState(itemId, actorProfileId)).data ?? [];
  const next = sortCommentsAsc([
    ...current.filter((entry) => entry.id !== comment.id),
    comment,
  ]);
  await writeCirclePulseCommentsSnapshot(itemId, actorProfileId, next);
  return next;
}

export async function replaceCirclePulseCommentSnapshotId(
  itemId: string,
  actorProfileId: string | null | undefined,
  previousCommentId: string,
  nextComment: CirclePulseComment,
): Promise<CirclePulseComment[]> {
  const current = (await readCirclePulseCommentsSnapshotState(itemId, actorProfileId)).data ?? [];
  const next = sortCommentsAsc([
    ...current.filter((entry) => entry.id !== previousCommentId && entry.id !== nextComment.id),
    nextComment,
  ]);
  await writeCirclePulseCommentsSnapshot(itemId, actorProfileId, next);
  return next;
}

export async function removeCirclePulseCommentSnapshot(
  itemId: string,
  actorProfileId: string | null | undefined,
  commentId: string,
): Promise<CirclePulseComment[]> {
  const current = (await readCirclePulseCommentsSnapshotState(itemId, actorProfileId)).data ?? [];
  const next = current.filter((entry) => entry.id !== commentId);
  await writeCirclePulseCommentsSnapshot(itemId, actorProfileId, next);
  return next;
}
