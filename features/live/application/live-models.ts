import type { LiveCapability } from '../domain/live-capabilities.ts';
import type {
  LiveParticipantState,
  LiveSessionFormat,
  LiveSessionStatus,
} from '../domain/live-types.ts';

export type LiveRsvpStatus = 'none' | 'invited' | 'going' | 'waitlisted' | 'declined';
export type LiveReactionKind = 'heart' | 'spark' | 'applause' | 'support';

export type LiveSessionSummary = {
  id: string;
  title: string;
  description: string | null;
  format: LiveSessionFormat;
  status: LiveSessionStatus;
  contextType: string;
  contextId: string | null;
  circleId: string | null;
  createdByProfileId: string;
  scheduledStart: string | null;
  startedAt: string | null;
  maximumPublishers: number;
  rsvpStatus: LiveRsvpStatus;
  participantState: LiveParticipantState;
  audienceCount: number;
  stageCount: number;
};

export type LiveParticipant = {
  id: string;
  sessionId: string;
  userId: string;
  profileId: string;
  role: string;
  state: LiveParticipantState;
  rsvpStatus: LiveRsvpStatus;
  openToIntroductions: boolean;
  stageSlot: number | null;
  connectionQualityState: string;
  microphoneMutedByModerator: boolean;
  fullName: string | null;
  avatarUrl: string | null;
};

export type LiveSeatRequest = {
  id: string;
  sessionId: string;
  userId: string;
  profileId: string;
  status: string;
  requestedAt: string;
  fullName: string | null;
  avatarUrl: string | null;
};

export type LiveComment = {
  id: string;
  sessionId: string;
  userId: string;
  profileId: string;
  body: string;
  status: string;
  createdAt: string;
  fullName: string | null;
  avatarUrl: string | null;
};

export type LiveSessionRecord = {
  id: string;
  title: string;
  description: string | null;
  format: LiveSessionFormat;
  status: LiveSessionStatus;
  contextType: string;
  contextId: string | null;
  circleId: string | null;
  createdByUserId: string;
  createdByProfileId: string;
  scheduledStart: string | null;
  scheduledEnd: string | null;
  startedAt: string | null;
  maximumPublishers: number;
  version: number;
};

export type LiveSessionSnapshot = {
  session: LiveSessionRecord;
  me: LiveParticipant | null;
  capabilities: readonly LiveCapability[];
  stage: readonly LiveParticipant[];
  backstage: readonly LiveParticipant[];
  audienceCount: number;
  seatRequests: readonly LiveSeatRequest[];
  comments: readonly LiveComment[];
};

export type ScheduleLiveSessionInput = {
  title: string;
  description: string;
  scheduledStart: string;
};
