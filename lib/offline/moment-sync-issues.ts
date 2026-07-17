import type { FailedOfflineMutation, OfflineMutation } from '@/lib/offline/mutation-queue';

type MomentMutation =
  | Extract<
      OfflineMutation | FailedOfflineMutation,
      {
        kind:
          | 'moment_text_create'
          | 'moment_media_create'
          | 'moment_delete'
          | 'moment_reaction_sync'
          | 'moment_comment_create'
          | 'moment_comment_update'
          | 'moment_comment_delete'
          | 'moment_comment_reaction_sync';
      }
    >;

export type MomentSyncIssue = {
  id: string;
  state: 'pending' | 'failed';
  kind: MomentMutation['kind'];
  title: string;
  detail: string;
  momentId: string;
};

const isFailedMutation = (
  mutation: OfflineMutation | FailedOfflineMutation,
): mutation is FailedOfflineMutation => 'failedAt' in mutation;

const getMomentIdFromMutation = (mutation: MomentMutation) => {
  switch (mutation.kind) {
    case 'moment_text_create':
    case 'moment_media_create':
      return mutation.payload.tempId;
    default:
      return mutation.payload.momentId;
  }
};

export const isMomentMutationForMoment = (mutation: MomentMutation, momentId: string) =>
  getMomentIdFromMutation(mutation) === momentId;

export const describeMomentSyncIssue = (mutation: MomentMutation): Omit<MomentSyncIssue, 'id' | 'state'> => {
  switch (mutation.kind) {
    case 'moment_text_create':
      return {
        kind: mutation.kind,
        title: 'Text Moment not posted',
        detail: 'Your text Moment is still local and needs to be sent again.',
        momentId: mutation.payload.tempId,
      };
    case 'moment_media_create':
      return {
        kind: mutation.kind,
        title: `${mutation.payload.type === 'video' ? 'Video' : 'Photo'} Moment not posted`,
        detail: 'This media Moment is still local and needs to be sent again.',
        momentId: mutation.payload.tempId,
      };
    case 'moment_delete':
      return {
        kind: mutation.kind,
        title: 'Delete did not finish',
        detail: 'This Moment is still visible because the delete did not sync yet.',
        momentId: mutation.payload.momentId,
      };
    case 'moment_reaction_sync':
      return {
        kind: mutation.kind,
        title: mutation.payload.emoji ? 'Reaction not synced' : 'Reaction removal not synced',
        detail: mutation.payload.emoji
          ? `Your ${mutation.payload.emoji} reaction is still local.`
          : 'Your reaction removal is still local.',
        momentId: mutation.payload.momentId,
      };
    case 'moment_comment_create':
      return {
        kind: mutation.kind,
        title: 'Comment not posted',
        detail: 'Your comment is still local and has not been posted yet.',
        momentId: mutation.payload.momentId,
      };
    case 'moment_comment_update':
      return {
        kind: mutation.kind,
        title: 'Comment edit not synced',
        detail: 'Your latest edit is still local and has not replaced the live comment yet.',
        momentId: mutation.payload.momentId,
      };
    case 'moment_comment_delete':
      return {
        kind: mutation.kind,
        title: 'Comment delete not synced',
        detail: 'The comment is hidden locally, but the delete has not finished syncing yet.',
        momentId: mutation.payload.momentId,
      };
    case 'moment_comment_reaction_sync':
      return {
        kind: mutation.kind,
        title: mutation.payload.reaction ? 'Comment reaction not synced' : 'Comment reaction removal not synced',
        detail: 'Your latest comment reaction change is still local.',
        momentId: mutation.payload.momentId,
      };
  }
};

export const collectMomentSyncIssues = (
  mutations: (OfflineMutation | FailedOfflineMutation)[],
  momentId: string,
): MomentSyncIssue[] =>
  mutations
    .filter(
      (mutation): mutation is MomentMutation =>
        [
          'moment_text_create',
          'moment_media_create',
          'moment_delete',
          'moment_reaction_sync',
          'moment_comment_create',
          'moment_comment_update',
          'moment_comment_delete',
          'moment_comment_reaction_sync',
        ].includes(mutation.kind) && isMomentMutationForMoment(mutation as MomentMutation, momentId),
    )
    .map((mutation) => {
      const base = describeMomentSyncIssue(mutation);
      return {
        id: mutation.id,
        state: (isFailedMutation(mutation) ? 'failed' : 'pending') as 'failed' | 'pending',
        ...base,
      };
    })
    .sort((a, b) => {
      if (a.state !== b.state) return a.state === 'failed' ? -1 : 1;
      return a.title.localeCompare(b.title);
    });

export const buildMomentSyncLabel = (issues: MomentSyncIssue[]) => {
  const failed = issues.filter((issue) => issue.state === 'failed').length;
  if (failed > 0) {
    return failed === 1 ? '1 issue to review' : `${failed} issues to review`;
  }
  if (issues.length > 0) {
    return issues.length === 1 ? '1 action syncing' : `${issues.length} actions syncing`;
  }
  return null;
};
