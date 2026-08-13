import {
  LIVE_CAPABILITIES,
  type LiveCapability,
} from '../domain/live-capabilities.ts';
import {
  LIVE_PARTICIPANT_STATES,
  LIVE_SESSION_FORMATS,
  LIVE_SESSION_STATUSES,
  type LiveParticipantState,
  type LiveSessionFormat,
  type LiveSessionStatus,
} from '../domain/live-types.ts';
import type {
  LiveComment,
  LiveConnectionSignal,
  LiveConversationSpark,
  LiveHostedCandidate,
  LiveHostedMatchingSnapshot,
  LiveMatchRound,
  LiveMatchRoundPerson,
  LiveMatchRoundState,
  LiveParticipant,
  LiveRsvpStatus,
  LiveSeatRequest,
  LiveSessionRecord,
  LiveSessionSnapshot,
  LiveSessionSummary,
} from './live-models.ts';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const asString = (value: unknown, fallback = '') => typeof value === 'string' ? value : fallback;
const asNullableString = (value: unknown) => typeof value === 'string' ? value : null;
const asNumber = (value: unknown, fallback = 0) => {
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) ? number : fallback;
};
const includes = <T extends string>(values: readonly T[], value: unknown): value is T =>
  typeof value === 'string' && values.includes(value as T);

const RSVP_VALUES = ['none', 'invited', 'going', 'waitlisted', 'declined'] as const;
const MATCH_ROUND_STATES = [
  'proposed','awaiting_consent','both_accepted','public_introduction',
  'declined','expired','completed','cancelled',
] as const satisfies readonly LiveMatchRoundState[];

const parseRsvp = (value: unknown): LiveRsvpStatus =>
  includes(RSVP_VALUES, value) ? value : 'none';

const parseState = (value: unknown): LiveParticipantState =>
  includes(LIVE_PARTICIPANT_STATES, value) ? value : 'invited';

const parseFormat = (value: unknown): LiveSessionFormat =>
  includes(LIVE_SESSION_FORMATS, value) ? value : 'special_event';

const parseStatus = (value: unknown): LiveSessionStatus =>
  includes(LIVE_SESSION_STATUSES, value) ? value : 'draft';

export const parseLiveParticipant = (value: unknown): LiveParticipant => {
  if (!isRecord(value)) throw new Error('live_participant_invalid');
  return {
    id: asString(value.id),
    sessionId: asString(value.session_id),
    userId: asString(value.user_id),
    profileId: asString(value.profile_id),
    role: asString(value.role, 'audience'),
    state: parseState(value.state),
    rsvpStatus: parseRsvp(value.rsvp_status),
    openToIntroductions: value.open_to_introductions === true,
    stageSlot: value.stage_slot == null ? null : asNumber(value.stage_slot),
    connectionQualityState: asString(value.connection_quality_state, 'unknown'),
    microphoneMutedByModerator: value.microphone_muted_by_moderator === true,
    fullName: asNullableString(value.full_name),
    avatarUrl: asNullableString(value.avatar_url),
  };
};

const parseLiveSeatRequest = (value: unknown): LiveSeatRequest => {
  if (!isRecord(value)) throw new Error('live_seat_request_invalid');
  return {
    id: asString(value.id),
    sessionId: asString(value.session_id),
    userId: asString(value.user_id),
    profileId: asString(value.profile_id),
    status: asString(value.status),
    requestedAt: asString(value.requested_at),
    fullName: asNullableString(value.full_name),
    avatarUrl: asNullableString(value.avatar_url),
  };
};

export const parseLiveComment = (value: unknown): LiveComment => {
  if (!isRecord(value)) throw new Error('live_comment_invalid');
  return {
    id: asString(value.id),
    sessionId: asString(value.session_id),
    userId: asString(value.user_id),
    profileId: asString(value.profile_id),
    body: asString(value.body),
    status: asString(value.status, 'visible'),
    createdAt: asString(value.created_at),
    fullName: asNullableString(value.full_name),
    avatarUrl: asNullableString(value.avatar_url),
    role: asString(value.role, 'audience'),
  };
};

const parseSessionRecord = (value: unknown): LiveSessionRecord => {
  if (!isRecord(value)) throw new Error('live_session_invalid');
  return {
    id: asString(value.id),
    title: asString(value.title),
    description: asNullableString(value.description),
    format: parseFormat(value.format),
    status: parseStatus(value.status),
    contextType: asString(value.context_type, 'global'),
    contextId: asNullableString(value.context_id),
    circleId: asNullableString(value.circle_id),
    createdByUserId: asString(value.created_by_user_id),
    createdByProfileId: asString(value.created_by_profile_id),
    scheduledStart: asNullableString(value.scheduled_start),
    scheduledEnd: asNullableString(value.scheduled_end),
    startedAt: asNullableString(value.started_at),
    maximumPublishers: Math.max(1, Math.min(asNumber(value.maximum_publishers, 4), 4)),
    version: asNumber(value.version, 1),
  };
};

export const parseLiveSessionSummary = (value: unknown): LiveSessionSummary => {
  if (!isRecord(value)) throw new Error('live_session_summary_invalid');
  return {
    id: asString(value.id),
    title: asString(value.title),
    description: asNullableString(value.description),
    format: parseFormat(value.format),
    status: parseStatus(value.status),
    contextType: asString(value.context_type, 'global'),
    contextId: asNullableString(value.context_id),
    circleId: asNullableString(value.circle_id),
    createdByProfileId: asString(value.created_by_profile_id),
    scheduledStart: asNullableString(value.scheduled_start),
    startedAt: asNullableString(value.started_at),
    maximumPublishers: Math.max(1, Math.min(asNumber(value.maximum_publishers, 4), 4)),
    rsvpStatus: parseRsvp(value.rsvp_status),
    participantState: parseState(value.participant_state),
    audienceCount: asNumber(value.audience_count),
    stageCount: asNumber(value.stage_count),
  };
};

export const parseLiveSessionSnapshot = (value: unknown): LiveSessionSnapshot => {
  if (!isRecord(value)) throw new Error('live_session_snapshot_invalid');
  const comments = Array.isArray(value.comments) ? value.comments.map(parseLiveComment) : [];
  const capabilities = Array.isArray(value.capabilities)
    ? value.capabilities.filter((item): item is LiveCapability => includes(LIVE_CAPABILITIES, item))
    : [];
  return {
    session: parseSessionRecord(value.session),
    me: value.me == null ? null : parseLiveParticipant(value.me),
    capabilities,
    stage: Array.isArray(value.stage) ? value.stage.map(parseLiveParticipant) : [],
    backstage: Array.isArray(value.backstage) ? value.backstage.map(parseLiveParticipant) : [],
    audienceCount: asNumber(value.audienceCount),
    seatRequests: Array.isArray(value.seatRequests)
      ? value.seatRequests.map(parseLiveSeatRequest)
      : [],
    comments,
    commentCount: Math.max(asNumber(value.commentCount), comments.length),
  };
};

const parseHostedCandidate = (value: unknown): LiveHostedCandidate => {
  if (!isRecord(value)) throw new Error('live_hosted_candidate_invalid');
  return {
    userId: asString(value.user_id),
    profileId: asString(value.profile_id),
    fullName: asNullableString(value.full_name),
    avatarUrl: asNullableString(value.avatar_url),
    age: value.age == null ? null : asNumber(value.age),
    city: asNullableString(value.city),
    verified: value.verified === true,
    lookingFor: asNullableString(value.looking_for),
    originContextType: asString(value.origin_context_type, 'global'),
    pairedWithUserIds: Array.isArray(value.paired_with_user_ids)
      ? value.paired_with_user_ids.filter((item): item is string => typeof item === 'string')
      : [],
  };
};

const parseMatchPerson = (value: unknown): LiveMatchRoundPerson => {
  if (!isRecord(value)) throw new Error('live_match_person_invalid');
  return {
    userId: asString(value.user_id),
    profileId: asString(value.profile_id),
    fullName: asNullableString(value.full_name),
    avatarUrl: asNullableString(value.avatar_url),
    age: value.age == null ? null : asNumber(value.age),
    city: asNullableString(value.city),
  };
};

const parseConnectionSignals = (value: unknown): LiveConnectionSignal[] =>
  Array.isArray(value)
    ? value.flatMap((item) => isRecord(item) && typeof item.text === 'string'
      ? [{ code: asString(item.code, 'alignment'), text: item.text }]
      : [])
    : [];

const parseConversationSpark = (value: unknown): LiveConversationSpark | null =>
  isRecord(value) && typeof value.context === 'string' && typeof value.question === 'string'
    ? { context: value.context, question: value.question }
    : null;

const parseMatchRound = (value: unknown): LiveMatchRound => {
  if (!isRecord(value)) throw new Error('live_match_round_invalid');
  if (!includes(MATCH_ROUND_STATES, value.state)) throw new Error('live_match_round_state_invalid');
  return {
    id: asString(value.id),
    sessionId: asString(value.session_id),
    state: value.state,
    participantA: parseMatchPerson(value.participant_a),
    participantB: parseMatchPerson(value.participant_b),
    connectionSignals: parseConnectionSignals(value.connection_signals),
    conversationSpark: parseConversationSpark(value.conversation_spark),
    myResponse: value.my_response === 'accepted' || value.my_response === 'declined'
      ? value.my_response
      : null,
    isParticipant: value.is_participant === true,
    expiresAt: asString(value.expires_at),
  };
};

export const parseLiveHostedMatchingSnapshot = (value: unknown): LiveHostedMatchingSnapshot => {
  if (!isRecord(value)) throw new Error('live_hosted_matching_snapshot_invalid');
  return {
    canManage: value.canManage === true,
    candidates: Array.isArray(value.candidates) ? value.candidates.map(parseHostedCandidate) : [],
    activeRound: value.activeRound == null ? null : parseMatchRound(value.activeRound),
  };
};
