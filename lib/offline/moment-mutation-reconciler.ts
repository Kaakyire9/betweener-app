import type { MomentMetadata } from '@/lib/moment-text-style';
import { buildMomentSyncLabel, collectMomentSyncIssues } from '@/lib/offline/moment-sync-issues';
import {
  getMomentOfflineMutationSnapshot,
  type FailedOfflineMutation,
  type OfflineMutation,
} from '@/lib/offline/mutation-queue';

type MomentRow = {
  id: string;
  user_id: string;
  type: 'video' | 'photo' | 'text';
  media_url: string | null;
  metadata: MomentMetadata | null;
  thumbnail_url: string | null;
  text_body: string | null;
  caption: string | null;
  created_at: string;
  expires_at: string;
  visibility: 'public' | 'matches' | 'vibe_check_approved' | 'private';
  is_deleted: boolean;
};

type Counts = Record<string, number>;

export type MomentSyncState = {
  state: 'pending' | 'failed';
  label: string;
};

type ReconciledMomentsResult = {
  moments: MomentRow[];
  reactionCounts: Counts;
  commentCounts: Counts;
  syncStateByMomentId: Record<string, MomentSyncState>;
};

const isMomentMutation = (
  mutation: OfflineMutation | FailedOfflineMutation,
): mutation is Extract<
  OfflineMutation | FailedOfflineMutation,
  {
    kind:
      | 'moment_text_create'
      | 'moment_media_create'
      | 'moment_delete'
      | 'moment_reaction_sync'
      | 'moment_comment_create'
      | 'moment_comment_update'
      | 'moment_comment_delete';
  }
> =>
  mutation.kind === 'moment_text_create' ||
  mutation.kind === 'moment_media_create' ||
  mutation.kind === 'moment_delete' ||
  mutation.kind === 'moment_reaction_sync' ||
  mutation.kind === 'moment_comment_create' ||
  mutation.kind === 'moment_comment_update' ||
  mutation.kind === 'moment_comment_delete';

const isFailedMutation = (
  mutation: OfflineMutation | FailedOfflineMutation,
): mutation is FailedOfflineMutation => 'failedAt' in mutation;

const isMomentCreateMutation = (
  mutation: OfflineMutation | FailedOfflineMutation,
): mutation is Extract<
  OfflineMutation | FailedOfflineMutation,
  { kind: 'moment_text_create' | 'moment_media_create' }
> => mutation.kind === 'moment_text_create' || mutation.kind === 'moment_media_create';

const toMomentRow = (
  mutation: Extract<OfflineMutation | FailedOfflineMutation, { kind: 'moment_text_create' | 'moment_media_create' }>,
): MomentRow => {
  if (mutation.kind === 'moment_text_create') {
    return {
      id: mutation.payload.tempId,
      user_id: mutation.payload.userId,
      type: 'text',
      media_url: null,
      metadata: (mutation.payload.metadata as MomentMetadata | null | undefined) ?? null,
      thumbnail_url: null,
      text_body: mutation.payload.textBody,
      caption: mutation.payload.caption ?? null,
      created_at: mutation.payload.createdAt,
      expires_at: mutation.payload.expiresAt,
      visibility: mutation.payload.visibility ?? 'matches',
      is_deleted: false,
    };
  }

  return {
    id: mutation.payload.tempId,
    user_id: mutation.payload.userId,
    type: mutation.payload.type,
    media_url: mutation.payload.localUri,
    metadata: (mutation.payload.metadata as MomentMetadata | null | undefined) ?? null,
    thumbnail_url: null,
    text_body: null,
    caption: mutation.payload.caption ?? null,
    created_at: mutation.payload.createdAt,
    expires_at: mutation.payload.expiresAt,
    visibility: mutation.payload.visibility ?? 'matches',
    is_deleted: false,
  };
};

export async function reconcileMomentRowsWithOfflineMutations(params: {
  currentUserId: string;
  moments: MomentRow[];
  reactionCounts?: Counts;
  commentCounts?: Counts;
}): Promise<ReconciledMomentsResult> {
  const snapshot = await getMomentOfflineMutationSnapshot();
  const pendingMutations = snapshot.pending.filter(isMomentMutation);
  const failedMutations = snapshot.failed.filter(isMomentMutation);
  const allMutations = [...failedMutations, ...pendingMutations];

  const reactionCounts = { ...(params.reactionCounts ?? {}) };
  const commentCounts = { ...(params.commentCounts ?? {}) };
  const syncStateByMomentId: Record<string, MomentSyncState> = {};

  const pendingDeletedMomentIds = new Set(
    pendingMutations
      .filter((mutation) => mutation.kind === 'moment_delete')
      .map((mutation) => mutation.payload.momentId),
  );

  let nextMoments = params.moments.filter((moment) => !pendingDeletedMomentIds.has(moment.id));

  allMutations.forEach((mutation) => {
    if (mutation.kind === 'moment_delete') {
      if (isFailedMutation(mutation)) {
        syncStateByMomentId[mutation.payload.momentId] = { state: 'failed', label: 'Delete failed' };
      }
      return;
    }

    if (mutation.kind === 'moment_reaction_sync') {
      const previousEmoji = mutation.payload.previousEmoji ?? null;
      const nextEmoji = mutation.payload.emoji ?? null;
      if (!previousEmoji && nextEmoji) {
        reactionCounts[mutation.payload.momentId] = (reactionCounts[mutation.payload.momentId] ?? 0) + 1;
      } else if (previousEmoji && !nextEmoji) {
        reactionCounts[mutation.payload.momentId] = Math.max(
          0,
          (reactionCounts[mutation.payload.momentId] ?? 0) - 1,
        );
      }
      return;
    }

    if (mutation.kind === 'moment_comment_create') {
      commentCounts[mutation.payload.momentId] = (commentCounts[mutation.payload.momentId] ?? 0) + 1;
      return;
    }

    if (mutation.kind === 'moment_comment_delete') {
      commentCounts[mutation.payload.momentId] = Math.max(
        0,
        (commentCounts[mutation.payload.momentId] ?? 0) - 1,
      );
      return;
    }

    if (mutation.kind === 'moment_comment_update') {
      return;
    }

    if (!isMomentCreateMutation(mutation)) {
      return;
    }

    if (mutation.payload.userId !== params.currentUserId) {
      return;
    }

    if (pendingDeletedMomentIds.has(mutation.payload.tempId)) {
      return;
    }

    const nextMoment = toMomentRow(mutation);
    nextMoments = [nextMoment, ...nextMoments.filter((moment) => moment.id !== nextMoment.id)];
    reactionCounts[nextMoment.id] = reactionCounts[nextMoment.id] ?? 0;
    commentCounts[nextMoment.id] = commentCounts[nextMoment.id] ?? 0;
    syncStateByMomentId[nextMoment.id] = {
      state: isFailedMutation(mutation) ? 'failed' : 'pending',
      label: isFailedMutation(mutation) ? 'Sync failed' : 'Syncing…',
    };
  });

  nextMoments = nextMoments.sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );

  nextMoments.forEach((moment) => {
    const issues = collectMomentSyncIssues(allMutations, moment.id);
    const label = buildMomentSyncLabel(issues);
    if (!label) return;
    syncStateByMomentId[moment.id] = {
      state: issues.some((issue) => issue.state === 'failed') ? 'failed' : 'pending',
      label,
    };
  });

  pendingDeletedMomentIds.forEach((momentId) => {
    delete reactionCounts[momentId];
    delete commentCounts[momentId];
  });

  return {
    moments: nextMoments,
    reactionCounts,
    commentCounts,
    syncStateByMomentId,
  };
}
