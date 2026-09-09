export const ODO_GUARDED_ACTION_TYPES = [
  'NO_ACTION',
  'WAIT',
  'SESSION_NARRATION',
  'ANNOUNCE_EXISTING_PAIR',
  'REQUEST_SCENE',
  'SHOW_CONVERSATION_SPARK',
  'SHOW_AUDIENCE_PULSE',
  'SHOW_INTERMISSION',
  'TIME_CUE',
  'TRANSITION_COPY',
] as const;

export type OdoGuardedActionType = (typeof ODO_GUARDED_ACTION_TYPES)[number];
export type OdoGuardedRiskTier = 0 | 1 | 2;

export const ODO_GUARDED_RISK_TIER: Readonly<Record<OdoGuardedActionType, OdoGuardedRiskTier>> = {
  NO_ACTION: 0,
  WAIT: 0,
  SESSION_NARRATION: 1,
  ANNOUNCE_EXISTING_PAIR: 1,
  REQUEST_SCENE: 1,
  SHOW_CONVERSATION_SPARK: 2,
  SHOW_AUDIENCE_PULSE: 2,
  SHOW_INTERMISSION: 2,
  TIME_CUE: 1,
  TRANSITION_COPY: 1,
};

export const ODO_GUARDED_FORBIDDEN_ACTIONS = [
  'OPEN_POOL', 'CLOSE_POOL', 'PAUSE_POOL', 'RESUME_POOL', 'CREATE_PAIR',
  'START_ROUND', 'CLOSE_ROUND', 'RETURN_TO_POOL', 'PROMOTE_TO_STAGE',
  'REMOVE_FROM_STAGE', 'MUTE_PARTICIPANT', 'REMOVE_PARTICIPANT',
  'BAN_PARTICIPANT', 'CREATE_PRIVATE_SPARK', 'START_PRIVATE_SPARK',
  'END_PRIVATE_SPARK', 'SUBMIT_PRIVATE_DECISION', 'CREATE_MATCH',
  'END_SESSION', 'START_SESSION', 'ENABLE_RECORDING',
  'ENABLE_CAPTIONS_PRIVATE', 'ISSUE_RTC_TOKEN', 'SESSION_POOLING',
] as const;

export type OdoGuardedFeatures = {
  narration: boolean;
  scenes: boolean;
  conversationSparks: boolean;
  audiencePulse: boolean;
  intermissions: boolean;
  timeCues: boolean;
};

export type OdoGuardedLastAction = {
  actionId: string;
  type: OdoGuardedActionType;
  reasonCode: string;
  executedAt: string;
};

export type OdoGuardedAutopilotState = {
  schemaVersion: 1;
  available: boolean;
  sessionId: string;
  enabled: boolean;
  directionMode: 'manual' | 'hybrid' | 'autopilot';
  autopilotState:
    | 'off'
    | 'starting'
    | 'active'
    | 'paused_by_host'
    | 'paused_by_policy'
    | 'recovering'
    | 'ending'
    | 'ended';
  currentScene: string;
  limitedMode: boolean;
  stateVersion: number;
  leaseGeneration: number;
  features: OdoGuardedFeatures;
  lastAction: OdoGuardedLastAction | null;
  nextTimeCueAt: string | null;
  unavailableReasonCode: string | null;
};

export const isOdoGuardedActionAllowed = (value: string): value is OdoGuardedActionType =>
  ODO_GUARDED_ACTION_TYPES.includes(value as OdoGuardedActionType);

export const odoGuardedActionLabel = (action: OdoGuardedActionType): string => {
  if (action === 'ANNOUNCE_EXISTING_PAIR') return 'Introduced an existing pair';
  if (action === 'REQUEST_SCENE') return 'Changed the presentation scene';
  if (action === 'SHOW_CONVERSATION_SPARK') return 'Shared a Conversation Spark';
  if (action === 'SHOW_AUDIENCE_PULSE') return 'Opened an Audience Pulse';
  if (action === 'SHOW_INTERMISSION') return 'Started an intermission moment';
  if (action === 'TIME_CUE') return 'Shared a time cue';
  if (action === 'TRANSITION_COPY') return 'Shared a transition';
  if (action === 'SESSION_NARRATION') return 'Shared room narration';
  return action === 'WAIT' ? 'Waiting for the next moment' : 'No change needed';
};
