export type LiveStageCandidate<T> = {
  participant: T;
  userId: string;
  sessionId: string;
  isLocalParticipant: boolean;
  isSpeaking: boolean;
  hasVideo: boolean;
  hasAudio: boolean;
};

export type LiveStageIdentity = {
  userId: string;
  role: string;
  stageSlot: number | null;
};

export type LiveStageSeat<T, I extends LiveStageIdentity = LiveStageIdentity> = {
  userId: string;
  identity: I | null;
  candidate: LiveStageCandidate<T> | null;
};

export type LiveStageTilePlacement =
  | 'single'
  | 'dual-left'
  | 'dual-right'
  | 'trio-lead'
  | 'trio-bottom-left'
  | 'trio-bottom-right'
  | 'quad-top-left'
  | 'quad-top-right'
  | 'quad-bottom-left'
  | 'quad-bottom-right';

const mediaScore = <T>(candidate: LiveStageCandidate<T>): number => (
  (candidate.isLocalParticipant ? 16 : 0)
  + (candidate.hasVideo ? 8 : 0)
  + (candidate.hasAudio ? 4 : 0)
  + (candidate.isSpeaking ? 2 : 0)
);

/**
 * Stream presence is session-based, while Betweener stage identity is
 * user-based. Keep one deterministic RTC session per user so a member opening
 * the room on two devices never consumes two public stage tiles.
 */
export const deduplicateLiveStageCandidates = <T>(
  candidates: readonly LiveStageCandidate<T>[],
): LiveStageCandidate<T>[] => {
  const selected = new Map<string, LiveStageCandidate<T>>();
  for (const candidate of candidates) {
    const current = selected.get(candidate.userId);
    if (
      !current
      || mediaScore(candidate) > mediaScore(current)
      || (
        mediaScore(candidate) === mediaScore(current)
        && candidate.sessionId.localeCompare(current.sessionId) < 0
      )
    ) {
      selected.set(candidate.userId, candidate);
    }
  }
  return [...selected.values()];
};

/**
 * A room headcount is transport presence, not the durable Betweener roster.
 * Stream may expose more than one session for the same signed-in member (for
 * example during a reconnect or when the room is open on two devices), so the
 * public count is always deduplicated by Betweener user identity.
 */
export const countConnectedLiveParticipants = <T>(
  candidates: readonly LiveStageCandidate<T>[],
): number => deduplicateLiveStageCandidates(
  candidates.filter((candidate) => candidate.userId.trim().length > 0),
).length;

/**
 * PiP has room for one useful video, not the complete stage. Prefer whichever
 * camera is actively speaking, including the local host, before falling back
 * to a remote camera. This prevents a quiet guest from occupying PiP while the
 * host is speaking and still keeps audience PiP focused on a remote publisher.
 */
export const selectLivePictureInPictureCandidate = <T>(
  candidates: readonly LiveStageCandidate<T>[],
): LiveStageCandidate<T> | null => {
  const score = (candidate: LiveStageCandidate<T>): number => {
    if (candidate.hasVideo && candidate.isSpeaking) return 0;
    if (!candidate.isLocalParticipant && candidate.hasVideo) return 1;
    if (candidate.isLocalParticipant && candidate.hasVideo) return 2;
    if (!candidate.isLocalParticipant && candidate.isSpeaking) return 3;
    if (!candidate.isLocalParticipant) return 4;
    return 5;
  };

  return [...deduplicateLiveStageCandidates(candidates)].sort((left, right) => (
    score(left) - score(right)
      || left.userId.localeCompare(right.userId)
      || left.sessionId.localeCompare(right.sessionId)
  ))[0] ?? null;
};

export const orderLiveStageCandidates = <T>(
  candidates: readonly LiveStageCandidate<T>[],
  identities: readonly LiveStageIdentity[],
): LiveStageCandidate<T>[] => {
  const identityByUserId = new Map(identities.map((identity) => [identity.userId, identity]));
  return [...candidates].sort((left, right) => {
    const leftIdentity = identityByUserId.get(left.userId);
    const rightIdentity = identityByUserId.get(right.userId);
    const leftHost = leftIdentity?.role === 'host' ? 0 : 1;
    const rightHost = rightIdentity?.role === 'host' ? 0 : 1;
    if (leftHost !== rightHost) return leftHost - rightHost;
    const leftSlot = leftIdentity?.stageSlot ?? Number.MAX_SAFE_INTEGER;
    const rightSlot = rightIdentity?.stageSlot ?? Number.MAX_SAFE_INTEGER;
    if (leftSlot !== rightSlot) return leftSlot - rightSlot;
    return left.userId.localeCompare(right.userId);
  });
};

/**
 * Supabase owns stage admission. Stream owns media transport. Reconcile both
 * sources here so an audience member joining the RTC call never receives a
 * publisher tile merely because they are present in the provider room.
 *
 * The optional local publisher is the narrow synchronization escape hatch for
 * a confirmed host/publisher whose persisted stage snapshot is still arriving.
 */
export const selectLiveStageCandidates = <T>(
  candidates: readonly LiveStageCandidate<T>[],
  identities: readonly LiveStageIdentity[],
  localPublisherUserId: string | null,
  maximumPublishers = 4,
): LiveStageCandidate<T>[] => {
  const admittedUserIds = new Set(identities.map((identity) => identity.userId));
  if (localPublisherUserId) admittedUserIds.add(localPublisherUserId);

  return orderLiveStageCandidates(
    deduplicateLiveStageCandidates(
      candidates.filter((candidate) => admittedUserIds.has(candidate.userId)),
    ),
    identities,
  ).slice(0, Math.max(0, maximumPublishers));
};

/**
 * Stage composition is roster-first. A remote member with camera and mic off
 * may not yet have an RTC participant object, but their authoritative seat
 * must still render consistently for every viewer.
 */
export const composeLiveStageSeats = <T, I extends LiveStageIdentity>(
  candidates: readonly LiveStageCandidate<T>[],
  identities: readonly I[],
  localPublisherUserId: string | null,
  maximumPublishers = 4,
): LiveStageSeat<T, I>[] => {
  const candidateByUserId = new Map(
    deduplicateLiveStageCandidates(candidates).map((candidate) => [candidate.userId, candidate]),
  );
  const orderedIdentities = [...identities].sort((left, right) => {
    const leftHost = left.role === 'host' ? 0 : 1;
    const rightHost = right.role === 'host' ? 0 : 1;
    if (leftHost !== rightHost) return leftHost - rightHost;
    const leftSlot = left.stageSlot ?? Number.MAX_SAFE_INTEGER;
    const rightSlot = right.stageSlot ?? Number.MAX_SAFE_INTEGER;
    if (leftSlot !== rightSlot) return leftSlot - rightSlot;
    return left.userId.localeCompare(right.userId);
  });
  const seats: LiveStageSeat<T, I>[] = orderedIdentities.map((identity) => ({
    userId: identity.userId,
    identity,
    candidate: candidateByUserId.get(identity.userId) ?? null,
  }));

  if (
    localPublisherUserId
    && !identities.some((identity) => identity.userId === localPublisherUserId)
  ) {
    const localCandidate = candidateByUserId.get(localPublisherUserId);
    if (localCandidate) {
      seats.push({
        userId: localPublisherUserId,
        identity: null,
        candidate: localCandidate,
      });
    }
  }

  return seats.slice(0, Math.max(0, maximumPublishers));
};

export const liveStageTilePlacement = (
  participantCount: number,
  index: number,
): LiveStageTilePlacement => {
  if (participantCount <= 1) return 'single';
  if (participantCount === 2) return index === 0 ? 'dual-left' : 'dual-right';
  if (participantCount === 3) {
    if (index === 0) return 'trio-lead';
    return index === 1 ? 'trio-bottom-left' : 'trio-bottom-right';
  }
  const placements: readonly LiveStageTilePlacement[] = [
    'quad-top-left',
    'quad-top-right',
    'quad-bottom-left',
    'quad-bottom-right',
  ];
  return placements[Math.min(Math.max(index, 0), placements.length - 1)];
};
