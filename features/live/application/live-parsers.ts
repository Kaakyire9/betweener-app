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
  LiveAudiencePoll,
  LiveAudiencePollKind,
  LiveAudiencePollState,
  LiveAudiencePollTemplate,
  LiveAudiencePulseSnapshot,
  LiveComment,
  LiveConnectionSignal,
  LiveConversationSpark,
  LiveHostedCandidate,
  LiveHostedMatchingSnapshot,
  LiveChemistrySnapshot,
  CircleLiveSnapshot,
  LiveQuickConnectDecision,
  LiveQuickConnectHostSnapshot,
  LiveQuickConnectPoolSnapshot,
  LiveQuickConnectQueueStatus,
  LiveQuickConnectSnapshot,
  LiveMatchRound,
  LiveMatchRoundPerson,
  LiveMatchRoundState,
  LiveParticipant,
  LivePrivateSpark,
  LivePoolCandidatePreview,
  LiveQuorumPoolingSnapshot,
  LiveRsvpStatus,
  LiveRoomPulseSnapshot,
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
const PRIVATE_SPARK_STATES = [
  'awaiting_consent','active','declined','expired','ended','terminated',
] as const;
const PRIVATE_SPARK_EXIT_DECISIONS = ['continue','friendship','not_this_time'] as const;
const PRIVATE_SPARK_EXIT_OUTCOMES = ['pending','mutual_connection','completed'] as const;
const QUICK_CONNECT_QUEUE_STATUSES = [
  'not_joined',
  'waiting_for_partner',
  'waiting_for_eligible_partner',
  'pairing_in_progress',
  'paired',
  'current_private_conversation',
  'rotation_complete',
  'reconnecting',
] as const satisfies readonly LiveQuickConnectQueueStatus[];
const AUDIENCE_POLL_KINDS = ['question_poll', 'room_poll'] as const satisfies readonly LiveAudiencePollKind[];
const AUDIENCE_POLL_STATES = ['open', 'closed', 'cancelled'] as const satisfies readonly LiveAudiencePollState[];

const parseRsvp = (value: unknown): LiveRsvpStatus =>
  includes(RSVP_VALUES, value) ? value : 'none';

const parseState = (value: unknown): LiveParticipantState =>
  includes(LIVE_PARTICIPANT_STATES, value) ? value : 'invited';

const parseFormat = (value: unknown): LiveSessionFormat =>
  includes(LIVE_SESSION_FORMATS, value) ? value : 'special_event';

const parseStatus = (value: unknown): LiveSessionStatus =>
  includes(LIVE_SESSION_STATUSES, value) ? value : 'draft';

export const parseCircleLiveSnapshot = (value: unknown): CircleLiveSnapshot => {
  if (!isRecord(value) || !Array.isArray(value.sessions)) throw new Error('circle_live_snapshot_invalid');
  return {
    circleId: asString(value.circle_id),
    canSchedule: value.can_schedule === true,
    serverNow: asString(value.server_now, new Date().toISOString()),
    sessions: value.sessions.map((item) => {
      if (!isRecord(item)) throw new Error('circle_live_session_invalid');
      return {
        sessionId: asString(item.session_id),
        gatheringId: asNullableString(item.gathering_id),
        title: asString(item.title, 'Circle Live'),
        description: asNullableString(item.description),
        status: parseStatus(item.status),
        scheduledStart: asNullableString(item.scheduled_start),
        endedAt: asNullableString(item.ended_at),
        posterPath: asNullableString(item.poster_path),
        attendanceCount: asNumber(item.attendance_count),
        minimumAttendance: Math.max(2, asNumber(item.minimum_attendance, 2)),
        quorumStatus: item.quorum_status === 'confirmed' ? 'confirmed' : 'almost_ready',
        matchesMadeCount: asNumber(item.matches_made_count),
        totalAttendeeCount: asNumber(item.total_attendee_count),
        viewerRsvpStatus: parseRsvp(item.viewer_rsvp_status),
        isHost: item.is_host === true,
      };
    }),
  };
};

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
  const maximumPublishers = Math.max(1, Math.min(asNumber(value.maximum_publishers, 4), 4));
  const maximumGuestSeats = Math.max(0, maximumPublishers - 1);
  const stageRequestCapacity = Math.max(
    0,
    Math.min(
      asNumber(
        value.stage_request_capacity,
        value.stage_requests_open === true ? maximumGuestSeats : 0,
      ),
      maximumGuestSeats,
    ),
  );
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
    maximumPublishers,
    stageRequestCapacity,
    stageRequestsOpen: stageRequestCapacity > 0,
    chemistryFirstEnabled: value.chemistry_first_enabled === true,
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
    scheduledEnd: asNullableString(value.scheduled_end),
    scheduledDurationMinutes: Math.max(30, asNumber(value.scheduled_duration_minutes, 90)),
    scheduleRevision: Math.max(0, asNumber(value.schedule_revision)),
    rescheduledAt: asNullableString(value.rescheduled_at),
    startedAt: asNullableString(value.started_at),
    endedAt: asNullableString(value.ended_at),
    cancelledAt: asNullableString(value.cancelled_at),
    cancellationReason: [
      'plans_changed',
      'host_unavailable',
      'not_enough_people',
      'safety',
      'other',
    ].includes(String(value.cancellation_reason))
      ? value.cancellation_reason as LiveSessionSummary['cancellationReason']
      : null,
    archivedAt: asNullableString(value.archived_at),
    chemistryFirstEnabled: value.chemistry_first_enabled === true,
    minimumParticipants: Math.max(2, asNumber(value.minimum_participants, 2)),
    version: Math.max(1, asNumber(value.version, 1)),
    posterPath: asNullableString(value.poster_path),
    teaserVideoPath: asNullableString(value.teaser_video_path),
    teaserDurationSeconds: value.teaser_duration_seconds == null
      ? null
      : Math.max(0, asNumber(value.teaser_duration_seconds)),
    maximumPublishers: Math.max(1, Math.min(asNumber(value.maximum_publishers, 4), 4)),
    rsvpStatus: parseRsvp(value.rsvp_status),
    participantState: parseState(value.participant_state),
    audienceCount: asNumber(value.audience_count),
    stageCount: asNumber(value.stage_count),
    reservationCount: asNumber(value.reservation_count),
    totalAttendeeCount: asNumber(value.total_attendee_count),
    matchesMadeCount: asNumber(value.matches_made_count),
  };
};

const POOL_OFFER_STATES = ['pending', 'accepted', 'declined', 'expired', 'withdrawn'] as const;
const SESSION_POOL_STATES = ['preview', 'offered', 'active', 'cancelled', 'completed'] as const;

export const parseLiveQuorumPoolingSnapshot = (value: unknown): LiveQuorumPoolingSnapshot => {
  if (!isRecord(value) || !isRecord(value.quorum)) {
    throw new Error('live_quorum_pooling_snapshot_invalid');
  }
  const quorum = value.quorum;
  const quorumStatus = quorum.status === 'confirmed' ? 'confirmed' : 'almost_ready';
  const offer = value.offer;
  const pool = value.pool;
  return {
    quorum: {
      sessionId: asString(quorum.session_id),
      status: quorumStatus,
      attendanceCount: Math.max(0, Math.floor(asNumber(quorum.attendance_count))),
      minimumAttendance: Math.max(2, Math.floor(asNumber(quorum.minimum_attendance, 2))),
      introductionReadyCount: Math.max(0, Math.floor(asNumber(quorum.introduction_ready_count))),
      viablePairCount: Math.max(0, Math.floor(asNumber(quorum.viable_pair_count))),
      requiredPairCount: Math.max(0, Math.floor(asNumber(quorum.required_pair_count))),
      pairabilityRequired: quorum.pairability_required === true,
      currentlyViable: quorum.currently_viable == null
        ? quorum.reached === true
        : quorum.currently_viable === true,
      reached: quorum.reached === true,
      serverNow: asString(quorum.server_now),
    },
    allowPooledLiveSessions: value.allow_pooled_live_sessions !== false,
    offer: isRecord(offer) && includes(POOL_OFFER_STATES, offer.state) ? {
      id: asString(offer.id),
      poolId: asString(offer.pool_id),
      sourceSessionId: asString(offer.source_session_id),
      destinationSessionId: asString(offer.destination_session_id),
      destinationTitle: asString(offer.destination_title),
      state: offer.state,
      explanation: asString(offer.explanation),
      expiresAt: asString(offer.expires_at),
    } : null,
    pool: isRecord(pool) && includes(SESSION_POOL_STATES, pool.state) ? {
      id: asString(pool.id),
      state: pool.state,
      primarySessionId: asString(pool.primary_session_id),
      primaryTitle: asString(pool.primary_title),
      explanation: asString(pool.explanation),
      originContextType: asString(pool.origin_context_type),
      originContextId: asNullableString(pool.origin_context_id),
      myOfferState: includes(POOL_OFFER_STATES, pool.my_offer_state) ? pool.my_offer_state : null,
    } : null,
    canManagePooling: value.can_manage_pooling === true,
    serverNow: asString(value.server_now),
  };
};

export const parseLivePoolCandidatePreview = (value: unknown): LivePoolCandidatePreview => {
  if (!isRecord(value)) throw new Error('live_pool_candidate_preview_invalid');
  const rule = value.rule;
  return {
    rule: isRecord(rule) ? {
      id: asString(rule.id),
      name: asString(rule.name),
      explanation: asString(rule.explanation),
    } : null,
    candidates: Array.isArray(value.candidates) ? value.candidates.flatMap((candidate) => {
      if (!isRecord(candidate)) return [];
      return [{
        sessionId: asString(candidate.session_id),
        title: asString(candidate.title),
        format: parseFormat(candidate.format),
        contextType: asString(candidate.context_type),
        scheduledStart: asNullableString(candidate.scheduled_start),
        eligible: candidate.eligible === true,
        reasonCodes: parseContextValues(candidate.reason_codes),
        reasonTexts: parseContextValues(candidate.reason_texts),
      }];
    }) : [],
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

export const parseLiveRoomPulseSnapshot = (value: unknown): LiveRoomPulseSnapshot => {
  if (!isRecord(value)) throw new Error('live_room_pulse_snapshot_invalid');
  const comments = Array.isArray(value.comments) ? value.comments.map(parseLiveComment) : [];
  return {
    comments,
    commentCount: Math.max(asNumber(value.commentCount), comments.length),
    audiencePulse: parseLiveAudiencePulseSnapshot(value.audiencePulse),
  };
};

const parseLiveAudiencePollTemplate = (value: unknown): LiveAudiencePollTemplate => {
  if (!isRecord(value)) throw new Error('live_audience_poll_template_invalid');
  if (!includes(AUDIENCE_POLL_KINDS, value.poll_kind)) {
    throw new Error('live_audience_poll_kind_invalid');
  }
  return {
    templateKey: asString(value.template_key),
    pollKind: value.poll_kind,
    prompt: asString(value.prompt),
    options: Array.isArray(value.options)
      ? value.options.filter((option): option is string => typeof option === 'string')
      : [],
  };
};

export const parseLiveAudiencePoll = (value: unknown): LiveAudiencePoll => {
  if (!isRecord(value)) throw new Error('live_audience_poll_invalid');
  if (!includes(AUDIENCE_POLL_KINDS, value.poll_kind)) {
    throw new Error('live_audience_poll_kind_invalid');
  }
  if (!includes(AUDIENCE_POLL_STATES, value.state)) {
    throw new Error('live_audience_poll_state_invalid');
  }
  return {
    id: asString(value.id),
    sessionId: asString(value.session_id),
    templateKey: asString(value.template_key),
    pollKind: value.poll_kind,
    prompt: asString(value.prompt),
    state: value.state,
    openedAt: asString(value.opened_at),
    closesAt: asString(value.closes_at),
    closedAt: asNullableString(value.closed_at),
    totalVotes: Math.max(0, asNumber(value.total_votes)),
    myOptionId: asNullableString(value.my_option_id),
    options: Array.isArray(value.options) ? value.options.map((option) => {
      if (!isRecord(option)) throw new Error('live_audience_poll_option_invalid');
      return {
        id: asString(option.id),
        optionIndex: Math.max(0, asNumber(option.option_index)),
        label: asString(option.label),
        voteCount: Math.max(0, asNumber(option.vote_count)),
        percentage: Math.max(0, Math.min(100, asNumber(option.percentage))),
      };
    }) : [],
  };
};

export const parseLiveAudiencePulseSnapshot = (value: unknown): LiveAudiencePulseSnapshot => {
  if (!isRecord(value)) {
    return { canManage: false, templates: [], activePoll: null, recentPoll: null };
  }
  return {
    canManage: value.canManage === true,
    templates: Array.isArray(value.templates)
      ? value.templates.map(parseLiveAudiencePollTemplate)
      : [],
    activePoll: value.activePoll == null ? null : parseLiveAudiencePoll(value.activePoll),
    recentPoll: value.recentPoll == null ? null : parseLiveAudiencePoll(value.recentPoll),
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
    pairableWithUserIds: Array.isArray(value.pairable_with_user_ids)
      ? value.pairable_with_user_ids.filter((item): item is string => typeof item === 'string')
      : null,
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

export const parseLivePrivateSpark = (value: unknown): LivePrivateSpark => {
  if (!isRecord(value)) throw new Error('live_private_spark_invalid');
  if (!includes(PRIVATE_SPARK_STATES, value.state)) {
    throw new Error('live_private_spark_state_invalid');
  }
  const participantA = parseMatchPerson(value.participant_a);
  const participantB = parseMatchPerson(value.participant_b);
  return {
    id: asString(value.id),
    chemistryFirstEnabled: value.chemistry_first_enabled === true,
    sessionId: asString(value.session_id),
    matchRoundId: asString(value.match_round_id),
    state: value.state,
    participantA,
    participantB,
    myResponse: value.my_response === 'accepted' || value.my_response === 'declined'
      ? value.my_response
      : null,
    isParticipant: value.is_participant === true,
    canManage: value.can_manage === true,
    conversationSpark: parseConversationSpark(value.conversation_spark),
    myExitDecision: includes(PRIVATE_SPARK_EXIT_DECISIONS, value.my_exit_decision)
      ? value.my_exit_decision
      : null,
    exitOutcome: includes(PRIVATE_SPARK_EXIT_OUTCOMES, value.exit_outcome)
      ? value.exit_outcome
      : 'pending',
    matchId: asNullableString(value.match_id),
    consentExpiresAt: asString(value.consent_expires_at),
    activeExpiresAt: asNullableString(value.active_expires_at),
  };
};

export const parseLiveHostedMatchingSnapshot = (value: unknown): LiveHostedMatchingSnapshot => {
  if (!isRecord(value)) throw new Error('live_hosted_matching_snapshot_invalid');
  return {
    canManage: value.canManage === true,
    candidates: Array.isArray(value.candidates) ? value.candidates.map(parseHostedCandidate) : [],
    activeRound: value.activeRound == null ? null : parseMatchRound(value.activeRound),
    privateSpark: value.privateSpark == null ? null : parseLivePrivateSpark(value.privateSpark),
  };
};

const CHEMISTRY_STATES = ['concealed', 'revealed', 'ended'] as const;
const QUICK_PARTICIPANT_STATES = [
  'not_joined', 'waiting', 'paired', 'disconnected', 'left', 'unavailable', 'safety_check',
] as const;
const QUICK_PAIRING_STATES = [
  'active', 'reconnect_grace', 'completed', 'round_incomplete', 'cancelled',
] as const;
const QUICK_DECISIONS = ['continue', 'friendship', 'not_this_time'] as const;
const QUICK_OUTCOMES = ['mutual_continue', 'friendship', 'closed'] as const;

const parseContextValues = (value: unknown): string[] => Array.isArray(value)
  ? value.filter((item): item is string => typeof item === 'string')
  : [];

export const parseLiveChemistrySnapshot = (value: unknown): LiveChemistrySnapshot => {
  if (!isRecord(value) || !includes(CHEMISTRY_STATES, value.state)) {
    throw new Error('live_chemistry_snapshot_invalid');
  }
  const context = value.other_person_context;
  if (!isRecord(context)) throw new Error('live_chemistry_context_invalid');
  const sourceKind = value.source_kind;
  if (sourceKind !== 'private_spark' && sourceKind !== 'quick_connect') {
    throw new Error('live_chemistry_source_invalid');
  }
  return {
    id: asString(value.id),
    sessionId: asString(value.session_id),
    sourceKind,
    sourceId: asString(value.source_id),
    state: value.state,
    myReady: value.my_ready === true,
    revealOfferedAt: asNullableString(value.reveal_offered_at),
    revealedAt: asNullableString(value.revealed_at),
    version: asNumber(value.version, 1),
    otherPersonContext: {
      fullName: asNullableString(context.full_name),
      age: context.age == null ? null : asNumber(context.age),
      city: asNullableString(context.city),
      lookingFor: asNullableString(context.looking_for),
      values: parseContextValues(context.values),
    },
  };
};

export const parseLiveQuickConnectSnapshot = (value: unknown): LiveQuickConnectSnapshot => {
  if (!isRecord(value) || !includes(QUICK_PARTICIPANT_STATES, value.state)) {
    throw new Error('live_quick_connect_snapshot_invalid');
  }
  const connectionState = value.connection_state;
  const normalizedConnection = connectionState === 'disconnected' || connectionState === 'left_session'
    ? connectionState
    : 'connected';
  let pairing: LiveQuickConnectSnapshot['pairing'] = null;
  if (value.pairing != null) {
    if (!isRecord(value.pairing) || !includes(QUICK_PAIRING_STATES, value.pairing.state)) {
      throw new Error('live_quick_connect_pairing_invalid');
    }
    const person = value.pairing.other_person;
    if (!isRecord(person)) throw new Error('live_quick_connect_person_invalid');
    pairing = {
      id: asString(value.pairing.id),
      chemistryFirstEnabled: value.pairing.chemistry_first_enabled === true,
      state: value.pairing.state,
      startsAt: asString(value.pairing.starts_at),
      endsAt: asString(value.pairing.ends_at),
      reconnectDeadline: asNullableString(value.pairing.reconnect_deadline),
      myDecision: includes(QUICK_DECISIONS, value.pairing.my_decision)
        ? value.pairing.my_decision as LiveQuickConnectDecision
        : null,
      sharedOutcome: includes(QUICK_OUTCOMES, value.pairing.shared_outcome)
        ? value.pairing.shared_outcome
        : null,
      safetyReviewed: value.pairing.safety_reviewed === true,
      otherPerson: {
        userId: asString(person.user_id),
        profileId: asString(person.profile_id),
        fullName: asNullableString(person.full_name),
        avatarUrl: asNullableString(person.avatar_url),
        age: person.age == null ? null : asNumber(person.age),
        city: asNullableString(person.city),
        lookingFor: asNullableString(person.looking_for),
        values: [],
      },
      providerCallType: asString(value.pairing.provider_call_type),
      providerCallId: asString(value.pairing.provider_call_id),
    };
  }
  return {
    sessionId: asString(value.session_id),
    state: value.state,
    connectionState: normalizedConnection,
    serverNow: asString(value.server_now),
    queueStatus: includes(QUICK_CONNECT_QUEUE_STATUSES, value.queue_status)
      ? value.queue_status
      : pairing
        ? 'paired'
        : value.state === 'waiting'
          ? 'waiting_for_partner'
          : 'not_joined',
    waitingCount: Math.max(0, Math.floor(asNumber(value.waiting_count))),
    eligiblePeerCount: Math.max(0, Math.floor(asNumber(value.eligible_peer_count))),
    pairing,
  };
};

const QUICK_CONTROL_STATES = ['closed', 'open', 'paused', 'draining', 'ended'] as const;
const QUICK_CREATOR_MODES = ['facilitator', 'participant'] as const;
const QUICK_ROUND_SECONDS = [120, 180, 300] as const;
const QUICK_CONCURRENCY = [1, 2, 4, 8] as const;
const QUICK_CONNECT_INTENTS = ['serious', 'long_term', 'marriage', 'open'] as const;
const QUICK_STAGE_LAYOUTS = ['stacked', 'side-by-side'] as const;

export const parseLiveQuickConnectHostSnapshot = (value: unknown): LiveQuickConnectHostSnapshot => {
  if (!isRecord(value) || !includes(QUICK_CONTROL_STATES, value.state)) {
    throw new Error('live_quick_connect_host_snapshot_invalid');
  }
  const roundSeconds = Math.floor(asNumber(value.round_seconds, 180));
  if (!QUICK_ROUND_SECONDS.includes(roundSeconds as 120 | 180 | 300)) {
    throw new Error('live_quick_connect_round_duration_invalid');
  }
  const maxConcurrentPairs = Math.floor(asNumber(value.max_concurrent_pairs, 4));
  if (!QUICK_CONCURRENCY.includes(maxConcurrentPairs as 1 | 2 | 4 | 8)) {
    throw new Error('live_quick_connect_concurrency_invalid');
  }
  const metrics = isRecord(value.metrics) ? value.metrics : {};
  return {
    sessionId: asString(value.session_id),
    state: value.state,
    creatorMode: includes(QUICK_CREATOR_MODES, value.creator_mode)
      ? value.creator_mode
      : 'facilitator',
    roundSeconds: roundSeconds as 120 | 180 | 300,
    maxConcurrentPairs: maxConcurrentPairs as 1 | 2 | 4 | 8,
    version: Math.max(1, Math.floor(asNumber(value.version, 1))),
    serverNow: asString(value.server_now),
    canManage: value.can_manage === true,
    metrics: {
      waitingPeople: Math.max(0, Math.floor(asNumber(metrics.waiting_people))),
      eligiblePeople: Math.max(0, Math.floor(asNumber(metrics.eligible_people))),
      activePairs: Math.max(0, Math.floor(asNumber(metrics.active_pairs))),
      availablePairSlots: Math.max(0, Math.floor(asNumber(metrics.available_pair_slots))),
      reconnectingPeople: Math.max(0, Math.floor(asNumber(metrics.reconnecting_people))),
      completedRounds: Math.max(0, Math.floor(asNumber(metrics.completed_rounds))),
    },
  };
};

export const parseLiveQuickConnectPoolSnapshot = (value: unknown): LiveQuickConnectPoolSnapshot => {
  if (!isRecord(value) || !includes(QUICK_CONTROL_STATES, value.control_state)) {
    throw new Error('live_quick_connect_pool_snapshot_invalid');
  }
  const members = Array.isArray(value.members) ? value.members : [];
  return {
    sessionId: asString(value.session_id),
    stageLayout: includes(QUICK_STAGE_LAYOUTS, value.stage_layout)
      ? value.stage_layout
      : 'stacked',
    controlState: value.control_state,
    creatorMode: includes(QUICK_CREATOR_MODES, value.creator_mode)
      ? value.creator_mode
      : 'facilitator',
    serverNow: asString(value.server_now),
    isHost: value.is_host === true,
    isOptedIn: value.is_opted_in === true,
    canOptIn: value.can_opt_in === true,
    connectionIntent: includes(QUICK_CONNECT_INTENTS, value.connection_intent)
      ? value.connection_intent
      : null,
    myState: includes(QUICK_PARTICIPANT_STATES, value.my_state)
      ? value.my_state
      : 'not_joined',
    members: members.flatMap((member) => {
      if (!isRecord(member)) return [];
      const userId = asString(member.user_id);
      const profileId = asString(member.profile_id);
      if (!userId || !profileId) return [];
      return [{
        userId,
        profileId,
        fullName: asNullableString(member.full_name),
        avatarUrl: asNullableString(member.avatar_url),
        age: member.age == null ? null : asNumber(member.age),
        city: asNullableString(member.city),
        expressedInterest: member.expressed_interest === true,
      }];
    }),
    queue: value.queue == null ? null : parseLiveQuickConnectSnapshot(value.queue),
  };
};
