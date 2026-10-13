export const RELATIONSHIP_GIST_EDITORIAL_STATUSES = [
  'draft',
  'in_review',
  'approved',
  'scheduled',
  'published',
  'superseded',
  'unpublished',
  'archived',
] as const;

export type RelationshipGistEditorialStatus =
  typeof RELATIONSHIP_GIST_EDITORIAL_STATUSES[number];

export type RelationshipGistEditorialAction =
  | 'submit'
  | 'quality_approve'
  | 'safety_approve'
  | 'schedule'
  | 'cancel_schedule'
  | 'publish'
  | 'unpublish'
  | 'archive';

export type RelationshipGistEditorialRevision = {
  edition_id: string;
  legacy_gist_id: string;
  revision_id: string;
  revision_number: number;
  status: RelationshipGistEditorialStatus;
  title: string;
  short_body: string | null;
  body: string;
  perspective: string;
  perspectives: string[];
  requires_safety_review: boolean;
  quality_approved_at: string | null;
  safety_approved_at: string | null;
  scheduled_for: string | null;
  published_at: string | null;
  authored_by_user_id: string | null;
  lock_version: number;
  targeting_enforced: boolean;
  updated_at: string;
};

export const getRelationshipGistEditorialActions = (
  revision: RelationshipGistEditorialRevision,
  permissions: {
    canDraft: boolean;
    canQualityApprove: boolean;
    canSafetyReview: boolean;
    canPublish: boolean;
    canArchive: boolean;
  },
): RelationshipGistEditorialAction[] => {
  const actions: RelationshipGistEditorialAction[] = [];
  if (revision.status === 'draft' && permissions.canDraft) actions.push('submit');
  if (
    revision.status === 'in_review'
    && !revision.quality_approved_at
    && permissions.canQualityApprove
  ) actions.push('quality_approve');
  if (
    revision.status === 'in_review'
    && revision.requires_safety_review
    && !revision.safety_approved_at
    && permissions.canSafetyReview
  ) actions.push('safety_approve');
  if (revision.status === 'approved' && permissions.canPublish) {
    actions.push('schedule', 'publish');
  }
  if (revision.status === 'scheduled' && permissions.canPublish) {
    actions.push('cancel_schedule', 'publish');
  }
  if (revision.status === 'published' && permissions.canPublish) actions.push('unpublish');
  if (
    ['draft', 'in_review', 'approved', 'superseded', 'unpublished'].includes(revision.status)
    && permissions.canArchive
  ) actions.push('archive');
  return actions;
};

export const formatRelationshipGistSchedule = (value: string | null) => {
  if (!value) return null;
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return null;
  return {
    iso: new Date(timestamp).toISOString(),
    local: new Date(timestamp).toLocaleString(),
  };
};
