import type { LiveCapability } from '../domain/live-capabilities.ts';
import type { LiveMatchRoundState } from '../domain/live-match-round-machine.ts';
import type {
  LiveParticipantState,
  LiveSessionFormat,
  LiveSessionStatus,
} from '../domain/live-types.ts';

export type LiveRsvpStatus =
  | 'none'
  | 'invited'
  | 'going'
  | 'waitlisted'
  | 'declined'
  | 'needs_reconfirmation';
export type LiveCancellationReason =
  | 'plans_changed'
  | 'host_unavailable'
  | 'not_enough_people'
  | 'safety'
  | 'other';
export type LiveReactionKind = 'heart' | 'spark' | 'applause' | 'support';
export type LiveAudiencePollKind = 'question_poll' | 'room_poll';
export type LiveAudiencePollState = 'open' | 'closed' | 'cancelled';

export type LiveAudiencePollTemplate = {
  templateKey: string;
  pollKind: LiveAudiencePollKind;
  prompt: string;
  options: readonly string[];
};

export type LiveAudiencePollOption = {
  id: string;
  optionIndex: number;
  label: string;
  voteCount: number;
  percentage: number;
};

export type LiveAudiencePoll = {
  id: string;
  sessionId: string;
  templateKey: string;
  pollKind: LiveAudiencePollKind;
  prompt: string;
  state: LiveAudiencePollState;
  openedAt: string;
  closesAt: string;
  closedAt: string | null;
  totalVotes: number;
  myOptionId: string | null;
  options: readonly LiveAudiencePollOption[];
};

export type LiveAudiencePulseSnapshot = {
  canManage: boolean;
  templates: readonly LiveAudiencePollTemplate[];
  activePoll: LiveAudiencePoll | null;
  recentPoll: LiveAudiencePoll | null;
};

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
  scheduledEnd: string | null;
  scheduledDurationMinutes: number;
  scheduleRevision: number;
  rescheduledAt: string | null;
  startedAt: string | null;
  endedAt: string | null;
  cancelledAt: string | null;
  cancellationReason: LiveCancellationReason | null;
  archivedAt: string | null;
  chemistryFirstEnabled: boolean;
  minimumParticipants: number;
  version: number;
  posterPath: string | null;
  teaserVideoPath: string | null;
  teaserDurationSeconds: number | null;
  maximumPublishers: number;
  rsvpStatus: LiveRsvpStatus;
  participantState: LiveParticipantState;
  audienceCount: number;
  stageCount: number;
  reservationCount: number;
  totalAttendeeCount: number;
  matchesMadeCount: number;
};

export type LiveQuorumSnapshot = {
  sessionId: string;
  status: 'almost_ready' | 'confirmed';
  attendanceCount: number;
  minimumAttendance: number;
  introductionReadyCount: number;
  viablePairCount: number;
  requiredPairCount: number;
  pairabilityRequired: boolean;
  currentlyViable: boolean;
  reached: boolean;
  serverNow: string;
};

export type LiveSessionPoolOffer = {
  id: string;
  poolId: string;
  sourceSessionId: string;
  destinationSessionId: string;
  destinationTitle: string;
  state: 'pending' | 'accepted' | 'declined' | 'expired' | 'withdrawn';
  explanation: string;
  expiresAt: string;
};

export type LiveSessionPoolContext = {
  id: string;
  state: 'preview' | 'offered' | 'active' | 'cancelled' | 'completed';
  primarySessionId: string;
  primaryTitle: string;
  explanation: string;
  originContextType: string;
  originContextId: string | null;
  myOfferState: LiveSessionPoolOffer['state'] | null;
};

export type LiveQuorumPoolingSnapshot = {
  quorum: LiveQuorumSnapshot;
  allowPooledLiveSessions: boolean;
  offer: LiveSessionPoolOffer | null;
  pool: LiveSessionPoolContext | null;
  canManagePooling: boolean;
  serverNow: string;
};

export type LivePoolRuleSummary = {
  id: string;
  name: string;
  explanation: string;
};

export type LivePoolCandidate = {
  sessionId: string;
  title: string;
  format: LiveSessionFormat;
  contextType: string;
  scheduledStart: string | null;
  eligible: boolean;
  reasonCodes: readonly string[];
  reasonTexts: readonly string[];
};

export type LivePoolCandidatePreview = {
  rule: LivePoolRuleSummary | null;
  candidates: readonly LivePoolCandidate[];
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
  role: string;
};

export type LiveJoinNotice = {
  userId: string;
  profileId: string;
  fullName: string | null;
  avatarUrl: string | null;
  joinedAt: string;
  participantState: string;
};

export type LiveMemberPreview = {
  userId: string;
  profileId: string;
  fullName: string | null;
  avatarUrl: string | null;
  role?: string | null;
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
  stageRequestCapacity: number;
  stageRequestsOpen: boolean;
  chemistryFirstEnabled: boolean;
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
  commentCount: number;
};

export type LiveRoomPulseSnapshot = {
  comments: readonly LiveComment[];
  commentCount: number;
  audiencePulse: LiveAudiencePulseSnapshot;
};

export type ScheduleLiveSessionInput = {
  title: string;
  description: string;
  scheduledStart: string;
  format?: LiveSessionFormat;
  chemistryFirstEnabled?: boolean;
};

export type ScheduleCircleLiveSessionInput = ScheduleLiveSessionInput & {
  circleId: string;
  minimumParticipants?: number;
};

export type ScheduleLiveStudioSessionInput = {
  clientRequestId: string;
  title: string;
  description: string;
  scheduledStart: string;
  durationMinutes: number;
  format: Extract<LiveSessionFormat, 'hosted_match_night' | 'quick_connect' | 'circle_live'>;
  chemistryFirstEnabled: boolean;
  circleId?: string | null;
  minimumParticipants: number;
};

export type UpdateLiveStudioSessionInput = Omit<
  ScheduleLiveStudioSessionInput,
  'clientRequestId' | 'format' | 'circleId'
> & {
  sessionId: string;
  expectedVersion: number;
};

export type CircleLiveCard = {
  sessionId: string;
  gatheringId: string | null;
  title: string;
  description: string | null;
  status: LiveSessionStatus;
  scheduledStart: string | null;
  endedAt: string | null;
  posterPath: string | null;
  attendanceCount: number;
  minimumAttendance: number;
  quorumStatus: 'almost_ready' | 'confirmed';
  matchesMadeCount: number;
  totalAttendeeCount: number;
  viewerRsvpStatus: LiveRsvpStatus;
  isHost: boolean;
};

export type CircleLiveSnapshot = {
  circleId: string;
  canSchedule: boolean;
  sessions: readonly CircleLiveCard[];
  serverNow: string;
};

export type LiveEventMediaInput = {
  posterPath: string | null;
  teaserVideoPath: string | null;
  teaserDurationSeconds: number | null;
};

export type LiveChemistryState = 'concealed' | 'revealed' | 'ended';

export type LiveChemistryPersonContext = {
  fullName: string | null;
  age: number | null;
  city: string | null;
  lookingFor: string | null;
  values: readonly string[];
};

export type LiveChemistrySnapshot = {
  id: string;
  sessionId: string;
  sourceKind: 'private_spark' | 'quick_connect';
  sourceId: string;
  state: LiveChemistryState;
  myReady: boolean;
  revealOfferedAt: string | null;
  revealedAt: string | null;
  version: number;
  otherPersonContext: LiveChemistryPersonContext;
};

export type LiveQuickConnectParticipantState =
  | 'not_joined'
  | 'waiting'
  | 'paired'
  | 'disconnected'
  | 'left'
  | 'unavailable'
  | 'safety_check';

export type LiveQuickConnectSafetyExperience = 'respectful' | 'uncomfortable' | 'safety_concern';
export type LiveQuickConnectSafetyReason =
  | 'requested_nudity'
  | 'sexual_pressure'
  | 'harassment_disrespect'
  | 'hate_threats'
  | 'impersonation_deception'
  | 'other';

export type LiveQuickConnectDecision = 'continue' | 'friendship' | 'not_this_time';

export type LiveQuickConnectQueueStatus =
  | 'not_joined'
  | 'waiting_for_partner'
  | 'waiting_for_eligible_partner'
  | 'pairing_in_progress'
  | 'paired'
  | 'current_private_conversation'
  | 'rotation_complete'
  | 'reconnecting';

export type LiveQuickConnectPairing = {
  id: string;
  chemistryFirstEnabled: boolean;
  state: 'active' | 'reconnect_grace' | 'completed' | 'round_incomplete' | 'cancelled';
  startsAt: string;
  endsAt: string;
  reconnectDeadline: string | null;
  myDecision: LiveQuickConnectDecision | null;
  sharedOutcome: 'mutual_continue' | 'friendship' | 'closed' | null;
  safetyReviewed: boolean;
  otherPerson: LiveChemistryPersonContext & {
    userId: string;
    profileId: string;
    avatarUrl: string | null;
  };
  providerCallType: string;
  providerCallId: string;
};

export type LiveQuickConnectSnapshot = {
  sessionId: string;
  state: LiveQuickConnectParticipantState;
  connectionState: 'connected' | 'disconnected' | 'left_session';
  serverNow: string;
  queueStatus: LiveQuickConnectQueueStatus;
  waitingCount: number;
  eligiblePeerCount: number;
  pairing: LiveQuickConnectPairing | null;
};

export type LiveQuickConnectControlState = 'closed' | 'open' | 'paused' | 'draining' | 'ended';
export type LiveQuickConnectCreatorMode = 'facilitator' | 'participant';
export type LiveQuickConnectRoundSeconds = 120 | 180 | 300;
export type LiveQuickConnectConcurrency = 1 | 2 | 4 | 8;
export type LiveQuickConnectIntent = 'serious' | 'long_term' | 'marriage' | 'open';
export type LiveQuickConnectStageLayout = 'stacked' | 'side-by-side';
export type LiveQuickConnectHostAction = 'open' | 'close' | 'pause' | 'resume' | 'drain' | 'end';

export type LiveQuickConnectHostMetrics = {
  waitingPeople: number;
  eligiblePeople: number;
  activePairs: number;
  availablePairSlots: number;
  reconnectingPeople: number;
  completedRounds: number;
};

export type LiveQuickConnectHostSnapshot = {
  sessionId: string;
  state: LiveQuickConnectControlState;
  creatorMode: LiveQuickConnectCreatorMode;
  roundSeconds: LiveQuickConnectRoundSeconds;
  maxConcurrentPairs: LiveQuickConnectConcurrency;
  version: number;
  serverNow: string;
  canManage: boolean;
  metrics: LiveQuickConnectHostMetrics;
};

export type LiveQuickConnectPoolMember = {
  userId: string;
  profileId: string;
  fullName: string | null;
  avatarUrl: string | null;
  age: number | null;
  city: string | null;
  expressedInterest: boolean;
};

export type LiveQuickConnectPoolSnapshot = {
  sessionId: string;
  stageLayout: LiveQuickConnectStageLayout;
  controlState: LiveQuickConnectControlState;
  creatorMode: LiveQuickConnectCreatorMode;
  serverNow: string;
  isHost: boolean;
  isOptedIn: boolean;
  canOptIn: boolean;
  connectionIntent: LiveQuickConnectIntent | null;
  myState: LiveQuickConnectParticipantState;
  members: readonly LiveQuickConnectPoolMember[];
  queue: LiveQuickConnectSnapshot | null;
};

export type { LiveMatchRoundState } from '../domain/live-match-round-machine.ts';

export type LiveHostedCandidate = {
  userId: string;
  profileId: string;
  fullName: string | null;
  avatarUrl: string | null;
  age: number | null;
  city: string | null;
  verified: boolean;
  lookingFor: string | null;
  originContextType: string;
  pairedWithUserIds: readonly string[];
  pairableWithUserIds: readonly string[] | null;
};

export type LiveMatchRoundPerson = Pick<
  LiveHostedCandidate,
  'userId' | 'profileId' | 'fullName' | 'avatarUrl' | 'age' | 'city'
>;

export type LiveConnectionSignal = {
  code: string;
  text: string;
};

export type LiveConversationSpark = {
  context: string;
  question: string;
};

export type LiveMatchRound = {
  id: string;
  sessionId: string;
  state: LiveMatchRoundState;
  participantA: LiveMatchRoundPerson;
  participantB: LiveMatchRoundPerson;
  connectionSignals: readonly LiveConnectionSignal[];
  conversationSpark: LiveConversationSpark | null;
  myResponse: 'accepted' | 'declined' | null;
  isParticipant: boolean;
  expiresAt: string;
};

export type LivePrivateSparkState =
  | 'awaiting_consent'
  | 'active'
  | 'declined'
  | 'expired'
  | 'ended'
  | 'terminated';

export type LivePrivateSparkExitDecision = 'continue' | 'friendship' | 'not_this_time';
export type LivePrivateSparkExitOutcome = 'pending' | 'mutual_connection' | 'completed';

export type LivePrivateSparkPerson = Pick<
  LiveMatchRoundPerson,
  'userId' | 'profileId' | 'fullName' | 'avatarUrl'
>;

export type LivePrivateSpark = {
  id: string;
  chemistryFirstEnabled: boolean;
  sessionId: string;
  matchRoundId: string;
  state: LivePrivateSparkState;
  participantA: LivePrivateSparkPerson;
  participantB: LivePrivateSparkPerson;
  myResponse: 'accepted' | 'declined' | null;
  isParticipant: boolean;
  canManage: boolean;
  conversationSpark: LiveConversationSpark | null;
  myExitDecision: LivePrivateSparkExitDecision | null;
  exitOutcome: LivePrivateSparkExitOutcome;
  matchId: string | null;
  consentExpiresAt: string;
  activeExpiresAt: string | null;
};

export type LiveHostedMatchingSnapshot = {
  canManage: boolean;
  candidates: readonly LiveHostedCandidate[];
  activeRound: LiveMatchRound | null;
  privateSpark: LivePrivateSpark | null;
};
