export const LIVE_PRIVATE_SPARK_MOTION = {
  formationDurationMs: 2_800,
  fusionMomentMs: 1_740,
  handoffHoldMs: 3_100,
  chemistryEntranceMs: 880,
  chemistryRevealMs: 920,
} as const;

export type LivePairPortrait = {
  userId: string;
  fullName: string | null;
  avatarUrl: string | null;
};
