export const LIVE_MATCH_ROUND_STATES = [
  'proposed',
  'awaiting_consent',
  'both_accepted',
  'public_introduction',
  'declined',
  'expired',
  'completed',
  'cancelled',
] as const;

export type LiveMatchRoundState = (typeof LIVE_MATCH_ROUND_STATES)[number];

const TRANSITIONS: Readonly<Record<LiveMatchRoundState, readonly LiveMatchRoundState[]>> = {
  proposed: ['awaiting_consent', 'cancelled'],
  awaiting_consent: ['both_accepted', 'declined', 'expired', 'cancelled'],
  both_accepted: ['public_introduction', 'cancelled'],
  public_introduction: ['completed', 'cancelled'],
  declined: [],
  expired: [],
  completed: [],
  cancelled: [],
};

export const canTransitionLiveMatchRound = (
  currentState: LiveMatchRoundState,
  targetState: LiveMatchRoundState,
) => currentState === targetState || TRANSITIONS[currentState].includes(targetState);

export const transitionLiveMatchRound = (
  currentState: LiveMatchRoundState,
  targetState: LiveMatchRoundState,
) => {
  if (!canTransitionLiveMatchRound(currentState, targetState)) {
    throw new Error(`invalid_live_match_round_transition:${currentState}:${targetState}`);
  }
  return {
    from: currentState,
    to: targetState,
    idempotent: currentState === targetState,
  } as const;
};
