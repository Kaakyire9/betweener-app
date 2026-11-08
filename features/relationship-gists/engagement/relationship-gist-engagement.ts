export const RELATIONSHIP_GIST_REACTIONS = [
  'helpful',
  'resonated',
  'made_me_think',
] as const;

export type RelationshipGistReaction = typeof RELATIONSHIP_GIST_REACTIONS[number];
export type RelationshipGistEngagementSource =
  | 'circles'
  | 'saved_library'
  | 'canonical_reader';
export type RelationshipGistReaderEventType =
  | 'impression'
  | 'open'
  | 'progress'
  | 'save'
  | 'unsave'
  | 'share';

export type RelationshipGistReactionCounts = Record<RelationshipGistReaction, number>;

export type RelationshipGistReflection = {
  body: string;
  revisionId: string;
  createdAt: string;
  updatedAt: string;
};

export type RelationshipGistEngagementSnapshot = {
  gistId: string;
  editionId: string;
  revisionId: string;
  reaction: RelationshipGistReaction | null;
  reactionRevisionId: string | null;
  reactionCounts: RelationshipGistReactionCounts;
  reflection: RelationshipGistReflection | null;
};

export const getRelationshipGistProgressBucket = (progress: number) => {
  const normalized = Math.max(0, Math.min(1, Number.isFinite(progress) ? progress : 0));
  if (normalized >= 0.995) return 100 as const;
  if (normalized >= 0.75) return 75 as const;
  if (normalized >= 0.5) return 50 as const;
  if (normalized >= 0.25) return 25 as const;
  return 0 as const;
};

export const getRelationshipGistReactionLabel = (reaction: RelationshipGistReaction) => {
  if (reaction === 'made_me_think') return 'Made me think';
  return reaction === 'helpful' ? 'Helpful' : 'Resonated';
};

export const normalizeRelationshipGistReflection = (body: string) => body.trim().slice(0, 2000);
