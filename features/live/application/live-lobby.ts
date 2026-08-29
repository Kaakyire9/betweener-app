import type { LiveSessionSummary } from './live-models.ts';

export type LiveLobbySections = {
  owned: readonly LiveSessionSummary[];
  liveNow: readonly LiveSessionSummary[];
  upcoming: readonly LiveSessionSummary[];
  past: readonly LiveSessionSummary[];
  hasHostLobby: boolean;
};

export type LiveSessionPhase = 'live' | 'upcoming' | 'past';

export const getLiveSessionPhase = (
  session: LiveSessionSummary,
  now = Date.now(),
): LiveSessionPhase => {
  if (session.status === 'ended' || session.status === 'cancelled') return 'past';
  if (
    (session.status === 'live' || session.status === 'ending')
    && (!session.scheduledStart || new Date(session.scheduledStart).getTime() <= now)
  ) return 'live';
  return 'upcoming';
};

export const partitionLiveLobbySessions = (
  sessions: readonly LiveSessionSummary[],
  viewerProfileId: string | null | undefined,
  canSchedule: boolean,
): LiveLobbySections => {
  const owned = viewerProfileId
    ? sessions.filter((session) => session.createdByProfileId === viewerProfileId)
    : [];
  const hasHostLobby = canSchedule || owned.length > 0;
  const ownedIds = new Set(owned.map((session) => session.id));
  const discoverable = hasHostLobby
    ? sessions.filter((session) => !ownedIds.has(session.id))
    : sessions;

  return {
    owned,
    liveNow: discoverable.filter((session) => getLiveSessionPhase(session) === 'live'),
    upcoming: discoverable.filter((session) => getLiveSessionPhase(session) === 'upcoming'),
    past: owned.filter((session) => getLiveSessionPhase(session) === 'past'),
    hasHostLobby,
  };
};
