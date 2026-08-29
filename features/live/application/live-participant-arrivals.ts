export type LiveParticipantArrivalEvent = {
  profileId: string;
  version: number;
  arrivedAt: string;
};

const ACTIVE_PARTICIPANT_STATES = new Set([
  'audience',
  'stage_requested',
  'backstage',
  'on_stage',
]);

export const LIVE_PARTICIPANT_ARRIVAL_MAX_AGE_MS = 15_000;

export const liveParticipantArrivalKey = (
  event: LiveParticipantArrivalEvent,
): string => `${event.profileId}:${event.version}`;

export const isFreshLiveParticipantArrival = (
  event: LiveParticipantArrivalEvent,
  now = Date.now(),
): boolean => {
  const arrivedAt = Date.parse(event.arrivedAt);
  return Number.isFinite(arrivedAt)
    && arrivedAt <= now + 2_000
    && now - arrivedAt <= LIVE_PARTICIPANT_ARRIVAL_MAX_AGE_MS;
};

export const isActiveLiveParticipantState = (state: string): boolean => (
  ACTIVE_PARTICIPANT_STATES.has(state)
);
