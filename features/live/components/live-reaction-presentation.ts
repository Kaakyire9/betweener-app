import type { LiveReactionKind } from '../application/index.ts';

export type LiveReactionPresentation = {
  kind: LiveReactionKind;
  label: string;
  accent: string;
};

export const LIVE_REACTION_PRESENTATION: Readonly<Record<LiveReactionKind, LiveReactionPresentation>> = {
  heart: { kind: 'heart', label: 'Heart', accent: '#FF809F' },
  spark: { kind: 'spark', label: 'Spark', accent: '#C6A7FF' },
  applause: { kind: 'applause', label: 'Applause', accent: '#F4C86A' },
  support: { kind: 'support', label: 'Support', accent: '#4BD7C7' },
  joy: { kind: 'joy', label: 'Joy', accent: '#FFD475' },
  wow: { kind: 'wow', label: 'Wow', accent: '#8ECFFF' },
  insight: { kind: 'insight', label: 'Insight', accent: '#F0D06B' },
  celebrate: { kind: 'celebrate', label: 'Celebrate', accent: '#D4A7FF' },
};

export const LIVE_PRIMARY_REACTIONS = [
  LIVE_REACTION_PRESENTATION.heart,
  LIVE_REACTION_PRESENTATION.spark,
  LIVE_REACTION_PRESENTATION.applause,
  LIVE_REACTION_PRESENTATION.support,
] as const;

export const LIVE_MORE_REACTIONS = [
  LIVE_REACTION_PRESENTATION.joy,
  LIVE_REACTION_PRESENTATION.wow,
  LIVE_REACTION_PRESENTATION.insight,
  LIVE_REACTION_PRESENTATION.celebrate,
] as const;
