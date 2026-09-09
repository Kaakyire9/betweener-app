import type { OdoDirectionMode, OdoScene } from '../domain/odo-contracts.ts';

export const ODO_COPILOT_SCHEMA_VERSION = 1 as const;

export const ODO_COPILOT_TASKS = [
  'conversation_spark',
  'audience_pulse',
  'pair_narration',
  'scene_suggestion',
  'transition_copy',
  'session_welcome',
  'session_closing',
] as const;
export type OdoCopilotTask = (typeof ODO_COPILOT_TASKS)[number];

export const ODO_COPILOT_SUGGESTION_TYPES = [
  'conversation_spark',
  'audience_pulse',
  'pair_introduction',
  'scene_suggestion',
  'transition_copy',
  'session_welcome',
  'session_closing',
  'no_action',
] as const;
export type OdoCopilotSuggestionType = (typeof ODO_COPILOT_SUGGESTION_TYPES)[number];

export const ODO_COPILOT_SUGGESTION_STATUSES = [
  'ready',
  'used',
  'dismissed',
  'superseded',
  'expired',
] as const;
export type OdoCopilotSuggestionStatus = (typeof ODO_COPILOT_SUGGESTION_STATUSES)[number];

export const ODO_COPILOT_SCENES = [
  'host_focus',
  'host_plus_pool',
  'pool_focus',
  'pair_forming',
  'quick_connect_active',
  'audience_pulse',
  'conversation_topic',
  'music_intermission_visual_only',
  'odo_stage',
  'session_closing',
] as const satisfies readonly OdoScene[];
export type OdoCopilotScene = (typeof ODO_COPILOT_SCENES)[number];

export type OdoCopilotPayloadMap = {
  conversation_spark: {
    context: string;
    question: string;
    locale: string;
  };
  audience_pulse: {
    templateKey: string;
    prompt: string;
    options: readonly string[];
    durationSeconds: number;
  };
  pair_introduction: { copy: string; locale: string };
  scene_suggestion: { scene: OdoCopilotScene };
  transition_copy: { copy: string; locale: string };
  session_welcome: { copy: string; locale: string };
  session_closing: { copy: string; locale: string };
  no_action: Record<string, never>;
};

export type OdoCopilotSuggestion<
  T extends OdoCopilotSuggestionType = OdoCopilotSuggestionType,
> = T extends OdoCopilotSuggestionType ? {
  schemaVersion: typeof ODO_COPILOT_SCHEMA_VERSION;
  id: string;
  sessionId: string;
  task: OdoCopilotTask;
  type: T;
  status: OdoCopilotSuggestionStatus;
  reasonCode: string;
  title: string;
  rationale: string;
  payload: OdoCopilotPayloadMap[T];
  roundId: string | null;
  snapshotVersion: number;
  sessionVersion: number;
  stateVersion: number;
  roundVersion: number | null;
  fallbackUsed: boolean;
  createdAt: string;
  expiresAt: string;
  usedAt: string | null;
} : never;

export type OdoCopilotFeatures = {
  conversationSpark: boolean;
  audiencePulse: boolean;
  pairNarration: boolean;
  sceneSuggestions: boolean;
  transitionCopy: boolean;
};

export type OdoCopilotState = {
  schemaVersion: typeof ODO_COPILOT_SCHEMA_VERSION;
  enabled: boolean;
  temporarilyUnavailable: boolean;
  unavailableReason: string | null;
  directionMode: OdoDirectionMode;
  currentScene: OdoScene;
  features: OdoCopilotFeatures;
  suggestions: readonly OdoCopilotSuggestion[];
};

export const ODO_COPILOT_TASK_TTL_SECONDS: Readonly<Record<OdoCopilotTask, number>> = {
  conversation_spark: 180,
  audience_pulse: 120,
  pair_narration: 90,
  scene_suggestion: 60,
  transition_copy: 60,
  session_welcome: 120,
  session_closing: 120,
};

export const odoCopilotTaskRequiresRound = (task: OdoCopilotTask): boolean =>
  task === 'conversation_spark' || task === 'pair_narration';

export const odoCopilotNoActionMessage = (task: OdoCopilotTask): string => {
  if (task === 'scene_suggestion') {
    return 'The current scene still fits the room. No change recommended.';
  }
  if (task === 'audience_pulse') {
    return 'The room does not need a pulse right now. Let this moment continue.';
  }
  if (task === 'conversation_spark' || task === 'pair_narration') {
    return 'This moment is working without an extra prompt. Let the conversation breathe.';
  }
  return 'Odo recommends letting this moment continue without adding anything.';
};

export const odoCopilotUseLabel = (type: OdoCopilotSuggestionType): string => {
  if (type === 'conversation_spark') return 'Show to pair';
  if (type === 'audience_pulse') return 'Launch';
  if (type === 'scene_suggestion') return 'Switch';
  return 'Use';
};
