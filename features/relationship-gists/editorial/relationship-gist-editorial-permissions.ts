export type RelationshipGistEditorialPermissions = {
  canRead: boolean;
  canDraft: boolean;
  canQualityApprove: boolean;
  canSafetyReview: boolean;
  canPublish: boolean;
  canArchive: boolean;
};

export const DENIED_RELATIONSHIP_GIST_EDITORIAL_PERMISSIONS: RelationshipGistEditorialPermissions =
  Object.freeze({
    canRead: false,
    canDraft: false,
    canQualityApprove: false,
    canSafetyReview: false,
    canPublish: false,
    canArchive: false,
  });

export function normalizeRelationshipGistEditorialPermissions(
  input: unknown,
): RelationshipGistEditorialPermissions {
  const row = Array.isArray(input) ? input[0] : input;
  if (!row || typeof row !== 'object') return DENIED_RELATIONSHIP_GIST_EDITORIAL_PERMISSIONS;
  const value = row as Record<string, unknown>;
  return Object.freeze({
    canRead: value.can_read === true,
    canDraft: value.can_draft === true,
    canQualityApprove: value.can_quality_approve === true,
    canSafetyReview: value.can_safety_review === true,
    canPublish: value.can_publish === true,
    canArchive: value.can_archive === true,
  });
}

export const canShowRelationshipGistEditorialNavigation = (input: unknown) =>
  normalizeRelationshipGistEditorialPermissions(input).canRead;
