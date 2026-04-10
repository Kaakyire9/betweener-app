export type MomentRelationshipContext = {
  cue: string;
  happenedAt?: string | null;
  source: 'swipe' | 'intent';
};
