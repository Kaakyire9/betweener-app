export const LIVE_ALWAYS_ON_AVAILABILITY_STATES = [
  'available',
  'reserved',
  'consumed',
  'withdrawn',
  'expired',
  'paused',
  'invalidated',
] as const;

export type LiveAlwaysOnAvailabilityState =
  (typeof LIVE_ALWAYS_ON_AVAILABILITY_STATES)[number];

export const LIVE_ALWAYS_ON_OPPORTUNITY_STATES = [
  'inviting',
  'awaiting_quorum',
  'quorum_reached',
  'creating_session',
  'starting',
  'live',
] as const;

export type LiveAlwaysOnOpportunityState =
  (typeof LIVE_ALWAYS_ON_OPPORTUNITY_STATES)[number];

export type LiveAlwaysOnMemberState = 'invited' | 'accepted';

export type LiveAlwaysOnAvailability = {
  status: LiveAlwaysOnAvailabilityState;
  expiresAt: string;
  marketContext: string;
  cooldownUntil: string | null;
  notTonightUntil: string | null;
  version: number;
};

export type LiveAlwaysOnOpportunity = {
  id: string;
  state: LiveAlwaysOnOpportunityState;
  myState: LiveAlwaysOnMemberState;
  expiresAt: string;
  acceptedCount: number;
  minimumCount: number;
  sessionId: string | null;
  reasonCode: string | null;
};

export type LiveAlwaysOnSnapshot = {
  schemaVersion: 1;
  serverNow: string;
  available: boolean;
  unavailableReasonCode: string | null;
  durationOptionsMinutes: readonly number[];
  availability: LiveAlwaysOnAvailability | null;
  opportunity: LiveAlwaysOnOpportunity | null;
};

export type LiveAlwaysOnResponse = 'accept' | 'not_now' | 'not_tonight' | 'withdraw';
