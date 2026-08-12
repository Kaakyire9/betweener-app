export const LIVE_SESSION_FORMATS = [
  'conversation',
  'hosted_matchmaking',
  'chemistry_first',
  'quick_connect',
  'special_event',
] as const;

export type LiveSessionFormat = (typeof LIVE_SESSION_FORMATS)[number];

export const LIVE_SESSION_ORIGINS = [
  'platform',
  'circle',
  'gathering',
  'special_event',
  'invite_only',
] as const;

export type LiveSessionOrigin = (typeof LIVE_SESSION_ORIGINS)[number];

export const LIVE_SESSION_STATUSES = [
  'draft',
  'scheduled',
  'backstage',
  'live',
  'ended',
  'cancelled',
] as const;

export type LiveSessionStatus = (typeof LIVE_SESSION_STATUSES)[number];

export const LIVE_PARTICIPANT_ROLES = [
  'audience',
  'participant',
  'matchmaker',
  'moderator',
  'host',
  'internal_admin',
] as const;

export type LiveParticipantRole = (typeof LIVE_PARTICIPANT_ROLES)[number];

export const LIVE_PARTICIPANT_STATES = [
  'invited',
  'rsvped',
  'backstage',
  'audience',
  'stage',
  'disconnected',
  'left',
  'removed',
  'banned',
] as const;

export type LiveParticipantState = (typeof LIVE_PARTICIPANT_STATES)[number];

export type LiveSessionOriginReference = {
  kind: LiveSessionOrigin;
  id: string | null;
  circleId: string | null;
  gatheringId: string | null;
};

export type LiveSessionIdentity = {
  id: string;
  format: LiveSessionFormat;
  status: LiveSessionStatus;
  origin: LiveSessionOriginReference;
  provider: string;
  providerCallId: string;
  providerCallType: string;
  version: number;
};

