export const ODO_SCHEMA_VERSION = 1 as const;

export const ODO_DIRECTION_MODES = ['manual', 'hybrid', 'autopilot'] as const;
export type OdoDirectionMode = (typeof ODO_DIRECTION_MODES)[number];

export const ODO_AUTOPILOT_STATES = [
  'off',
  'starting',
  'active',
  'paused_by_host',
  'paused_by_policy',
  'recovering',
  'ending',
  'ended',
] as const;
export type OdoAutopilotState = (typeof ODO_AUTOPILOT_STATES)[number];

export const ODO_SCENES = [
  'host_focus',
  'host_plus_pool',
  'pool_focus',
  'pair_forming',
  'quick_connect_active',
  'audience_pulse',
  'conversation_topic',
  'music_intermission',
  'music_intermission_visual_only',
  'screen_share',
  'odo_stage',
  'session_closing',
] as const;
export type OdoScene = (typeof ODO_SCENES)[number];

export const ODO_ACTION_TYPES = [
  'NO_ACTION',
  'WAIT',
  'SESSION_WELCOME',
  'OPEN_POOL',
  'ANNOUNCE_PAIR',
  'FOCUS_PAIRING',
  'REQUEST_SCENE',
  'SHOW_CONVERSATION_SPARK',
  'SHOW_AUDIENCE_PULSE',
  'SHOW_INTERMISSION',
  'REQUEST_MUSIC_ACTION',
  'TIME_CUE',
  'CLOSE_ROUND',
  'RETURN_TO_POOL',
  'SESSION_CLOSING',
] as const;
export type OdoActionType = (typeof ODO_ACTION_TYPES)[number];

export const ODO_WAIT_EVENTS = [
  'participant_joined',
  'round_state_changed',
  'session_state_changed',
  'host_resumed',
  'decision_interval_elapsed',
] as const;
export type OdoWaitEvent = (typeof ODO_WAIT_EVENTS)[number];

export const LIVE_DIRECTOR_EVENT_TYPES = [
  'SESSION_SNAPSHOT',
  'ODO_ACTION_PROPOSED',
  'ODO_ACTION_SHADOW_APPROVED',
  'ODO_ACTION_REJECTED',
  'ODO_POLICY_PAUSED',
  'ODO_HOST_TAKEOVER',
  'ODO_AUTOPILOT_RESUMED',
  'SCENE_REQUESTED',
  'CONVERSATION_SPARK_REQUESTED',
  'AUDIENCE_PULSE_REQUESTED',
  'MUSIC_ACTION_REQUESTED',
  'ROUND_CLOSE_REQUESTED',
  'SESSION_CLOSE_REQUESTED',
  'CONVERSATION_SPARK_PUBLISHED',
  'AUDIENCE_PULSE_LAUNCHED',
  'PAIR_INTRODUCTION_PUBLISHED',
  'SCENE_CHANGED',
  'TRANSITION_COPY_PUBLISHED',
  'SESSION_WELCOME_PUBLISHED',
  'SESSION_CLOSING_PUBLISHED',
  'ODO_AUTOPILOT_ACTIVE',
  'ODO_AUTOPILOT_PAUSED',
  'ODO_INTERMISSION_STARTED',
  'TIME_CUE_PUBLISHED',
  'SESSION_NARRATION_PUBLISHED',
  'ODO_FULL_QUICK_CONNECT_ACTIVE',
  'QUICK_CONNECT_POOL_OPENED',
  'QUICK_CONNECT_PAIR_FORMING',
  'QUICK_CONNECT_ROUND_COMPLETED',
  'QUICK_CONNECT_LOW_LIQUIDITY',
  'QUICK_CONNECT_DRAINING',
  'QUICK_CONNECT_CLOSING',
  'QUICK_CONNECT_CLOSED',
  'ODO_SHOW_DIRECTOR_ACTIVE',
  'ODO_SHOW_DIRECTOR_PAUSED',
  'SHOW_SCENE_CHANGED',
  'SHOW_ENERGY_CHANGED',
  'SHOW_INTERMISSION_STARTED',
  'SHOW_INTERMISSION_ENDED',
  'SHOW_MUSIC_STATE_CHANGED',
  'SHOW_CLOSING',
] as const;
export type LiveDirectorEventType = (typeof LIVE_DIRECTOR_EVENT_TYPES)[number];

export const ODO_DIRECTOR_EVENT_SOURCES = ['odo', 'host', 'system', 'moderator'] as const;
export type OdoDirectorEventSource = (typeof ODO_DIRECTOR_EVENT_SOURCES)[number];

export const ODO_DIRECTOR_EVENT_VISIBILITIES = [
  'participant',
  'host',
  'moderator',
  'admin',
  'internal',
] as const;
export type OdoDirectorEventVisibility = (typeof ODO_DIRECTOR_EVENT_VISIBILITIES)[number];

export type OdoActionPayloadMap = {
  NO_ACTION: Record<string, never>;
  WAIT: { waitMs: number; untilEvent?: OdoWaitEvent };
  SESSION_WELCOME: { copy: string; locale: string };
  OPEN_POOL: Record<string, never>;
  ANNOUNCE_PAIR: { roundId: string };
  FOCUS_PAIRING: { roundId: string };
  REQUEST_SCENE: { scene: OdoScene };
  SHOW_CONVERSATION_SPARK: {
    roundId: string;
    context: string;
    question: string;
    locale: string;
  };
  SHOW_AUDIENCE_PULSE: { templateKey: string; durationSeconds: number };
  SHOW_INTERMISSION: { durationSeconds: number; copy: string; locale: string };
  REQUEST_MUSIC_ACTION: {
    action: 'play' | 'pause' | 'resume' | 'stop' | 'set_volume';
    trackId?: string;
    playlistId?: string;
    volume?: number;
  };
  TIME_CUE: { roundId: string; cue: 'one_minute' | 'near_end' | 'ended' };
  CLOSE_ROUND: { roundId: string };
  RETURN_TO_POOL: { roundId: string };
  SESSION_CLOSING: { copy: string; locale: string };
};

export type OdoAction<T extends OdoActionType = OdoActionType> =
  T extends OdoActionType ? {
    schemaVersion: typeof ODO_SCHEMA_VERSION;
    actionId: string;
    sessionId: string;
    snapshotVersion: number;
    leaseGeneration: number;
    type: T;
    reasonCode: string;
    expiresAt: string;
    payload: OdoActionPayloadMap[T];
  } : never;

export type OdoDirectorSnapshot = {
  schemaVersion: typeof ODO_SCHEMA_VERSION;
  sessionId: string;
  sessionVersion: number;
  currentStateVersion: number;
  latestSequenceNumber: number;
  currentScene: OdoScene;
  directionMode: OdoDirectionMode;
  autopilotState: OdoAutopilotState;
  sessionStatus: string;
  activeRoundId: string | null;
  participantCount: number;
  audienceCount: number;
  policyFlags: Readonly<Record<string, boolean>>;
};

export type KnownLiveDirectorEvent = {
  schemaVersion: typeof ODO_SCHEMA_VERSION;
  sequenceNumber: number;
  eventId: string;
  sessionId: string;
  eventType: LiveDirectorEventType;
  source: OdoDirectorEventSource;
  visibility: OdoDirectorEventVisibility;
  actionId: string | null;
  stateVersion: number;
  occurredAt: string;
  createdAt: string;
  expiresAt: string | null;
  payload: Readonly<Record<string, unknown>>;
};

export type UnknownLiveDirectorEvent = {
  schemaVersion: number;
  sequenceNumber: number;
  eventId: string;
  sessionId: string;
  eventType: 'UNKNOWN';
  rawEventType: string;
  source: OdoDirectorEventSource;
  visibility: OdoDirectorEventVisibility;
  actionId: string | null;
  stateVersion: number;
  occurredAt: string;
  createdAt: string;
  expiresAt: string | null;
  payload: Readonly<Record<string, never>>;
};

export type LiveDirectorEvent = KnownLiveDirectorEvent | UnknownLiveDirectorEvent;

export type OdoPolicyDecision = {
  outcome: 'shadow_approved' | 'rejected';
  reasonCode: string;
  action: OdoAction;
};
