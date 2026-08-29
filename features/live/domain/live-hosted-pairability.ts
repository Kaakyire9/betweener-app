export type LivePairabilityCandidate = {
  userId: string;
  pairedWithUserIds: readonly string[];
  pairableWithUserIds: readonly string[] | null;
};

export type LivePairAvailability =
  | 'available'
  | 'already_introduced'
  | 'not_available';

export const getLivePairAvailability = (
  first: LivePairabilityCandidate,
  second: LivePairabilityCandidate,
): LivePairAvailability => {
  if (first.userId === second.userId) return 'not_available';
  if (first.pairedWithUserIds.includes(second.userId)
    || second.pairedWithUserIds.includes(first.userId)) return 'already_introduced';

  // A null projection means an older server has not supplied pairability yet.
  // Keep the legacy behaviour during a rolling deployment; the RPC remains the
  // final authority. Once present, require reciprocal server confirmation.
  if (first.pairableWithUserIds !== null
    && !first.pairableWithUserIds.includes(second.userId)) return 'not_available';
  if (second.pairableWithUserIds !== null
    && !second.pairableWithUserIds.includes(first.userId)) return 'not_available';

  return 'available';
};

export const canProposeLivePair = (
  first: LivePairabilityCandidate,
  second: LivePairabilityCandidate,
) => getLivePairAvailability(first, second) === 'available';

export const hasProposableLivePair = (
  candidates: readonly LivePairabilityCandidate[],
) => candidates.some((candidate, index) => (
  candidates.slice(index + 1).some((peer) => canProposeLivePair(candidate, peer))
));

export const getLiveHostedMatchingErrorCopy = (errorCode: string | null) => {
  if (!errorCode) return null;
  if (errorCode.includes('live_match_pair_ineligible')) {
    return 'This pairing is not available. Choose another two members.';
  }
  if (errorCode.includes('live_match_round_session_invalid')) {
    return 'Hosted introductions are not available in this room right now.';
  }
  if (errorCode.includes('live_match_proposal_id_conflict')
    || errorCode.includes('live_match_round_one_active_per_session')) {
    return 'Another introduction is already in progress. Refresh Match Desk to continue.';
  }
  return 'That could not be completed yet. Please try again.';
};
