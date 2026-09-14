export const LIVE_PRIVATE_SPARK_MOTION = {
  formationDurationMs: 3_600,
  fusionMomentMs: 2_250,
  handoffHoldMs: 3_900,
  chemistryEntranceMs: 880,
  chemistryRevealMs: 920,
} as const;

export type LivePairPortrait = {
  userId: string;
  fullName: string | null;
  avatarUrl: string | null;
};
