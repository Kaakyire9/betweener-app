import {
  ODO_COPILOT_SCHEMA_VERSION,
  ODO_COPILOT_SCENES,
  ODO_COPILOT_SUGGESTION_STATUSES,
  ODO_COPILOT_SUGGESTION_TYPES,
  ODO_COPILOT_TASKS,
  type OdoCopilotState,
  type OdoCopilotSuggestion,
  type OdoCopilotSuggestionType,
} from './odo-copilot-contracts.ts';

export type OdoCopilotValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; reasonCode: string };

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CODE_PATTERN = /^[a-z][a-z0-9_]{0,79}$/;
const LOCALE_PATTERN = /^[a-z]{2}(?:-[A-Z]{2})?$/;
const FORBIDDEN_CONTROL = /(?:https?:\/\/|wss?:\/\/|\brpc_[a-z0-9_]+\b|\bselect\b[^\n]{0,160}\bfrom\b|\binsert\s+into\b|\bdelete\s+from\b|<script\b)/i;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const hasExactKeys = (
  value: Record<string, unknown>,
  required: readonly string[],
): boolean => {
  const allowed = new Set(required);
  return required.every((key) => Object.prototype.hasOwnProperty.call(value, key))
    && Object.keys(value).every((key) => allowed.has(key));
};

const isTimestamp = (value: unknown): value is string =>
  typeof value === 'string' && !Number.isNaN(Date.parse(value));

const isSafeText = (value: unknown, maximum: number): value is string =>
  typeof value === 'string'
  && value.trim().length >= 1
  && value.length <= maximum
  && !FORBIDDEN_CONTROL.test(value);

const validatePayload = (type: OdoCopilotSuggestionType, value: unknown): boolean => {
  if (!isRecord(value)) return false;
  switch (type) {
    case 'conversation_spark':
      return hasExactKeys(value, ['context', 'question', 'locale'])
        && isSafeText(value.context, 200)
        && isSafeText(value.question, 300)
        && typeof value.locale === 'string'
        && LOCALE_PATTERN.test(value.locale);
    case 'audience_pulse':
      return hasExactKeys(value, ['templateKey', 'prompt', 'options', 'durationSeconds'])
        && typeof value.templateKey === 'string'
        && CODE_PATTERN.test(value.templateKey)
        && isSafeText(value.prompt, 180)
        && Array.isArray(value.options)
        && value.options.length >= 2
        && value.options.length <= 4
        && value.options.every((option) => isSafeText(option, 80))
        && Number.isInteger(value.durationSeconds)
        && Number(value.durationSeconds) >= 30
        && Number(value.durationSeconds) <= 300;
    case 'pair_introduction':
    case 'transition_copy':
    case 'session_welcome':
    case 'session_closing':
      return hasExactKeys(value, ['copy', 'locale'])
        && isSafeText(value.copy, type === 'pair_introduction' ? 320 : 240)
        && typeof value.locale === 'string'
        && LOCALE_PATTERN.test(value.locale);
    case 'scene_suggestion':
      return hasExactKeys(value, ['scene'])
        && typeof value.scene === 'string'
        && ODO_COPILOT_SCENES.includes(value.scene as never);
    case 'no_action':
      return hasExactKeys(value, []);
  }
};

export const parseOdoCopilotSuggestion = (
  value: unknown,
): OdoCopilotValidationResult<OdoCopilotSuggestion> => {
  if (!isRecord(value)) return { ok: false, reasonCode: 'suggestion_not_object' };
  const keys = [
    'schemaVersion', 'id', 'sessionId', 'task', 'type', 'status', 'reasonCode',
    'title', 'rationale', 'payload', 'roundId', 'snapshotVersion',
    'sessionVersion', 'stateVersion', 'roundVersion', 'fallbackUsed',
    'createdAt', 'expiresAt', 'usedAt',
  ] as const;
  if (!hasExactKeys(value, keys)) {
    return { ok: false, reasonCode: 'suggestion_unknown_or_missing_field' };
  }
  if (new TextEncoder().encode(JSON.stringify(value)).byteLength > 8_192) {
    return { ok: false, reasonCode: 'suggestion_too_large' };
  }
  if (value.schemaVersion !== ODO_COPILOT_SCHEMA_VERSION
    || typeof value.id !== 'string' || !UUID_PATTERN.test(value.id)
    || typeof value.sessionId !== 'string' || !UUID_PATTERN.test(value.sessionId)
    || typeof value.task !== 'string' || !ODO_COPILOT_TASKS.includes(value.task as never)
    || typeof value.type !== 'string' || !ODO_COPILOT_SUGGESTION_TYPES.includes(value.type as never)
    || typeof value.status !== 'string' || !ODO_COPILOT_SUGGESTION_STATUSES.includes(value.status as never)
    || typeof value.reasonCode !== 'string' || !CODE_PATTERN.test(value.reasonCode)
    || !isSafeText(value.title, 80)
    || !isSafeText(value.rationale, 240)
    || (value.roundId !== null && (typeof value.roundId !== 'string' || !UUID_PATTERN.test(value.roundId)))
    || !Number.isSafeInteger(value.snapshotVersion) || Number(value.snapshotVersion) < 1
    || !Number.isSafeInteger(value.sessionVersion) || Number(value.sessionVersion) < 1
    || !Number.isSafeInteger(value.stateVersion) || Number(value.stateVersion) < 1
    || (value.roundVersion !== null
      && (!Number.isSafeInteger(value.roundVersion) || Number(value.roundVersion) < 1))
    || typeof value.fallbackUsed !== 'boolean'
    || !isTimestamp(value.createdAt)
    || !isTimestamp(value.expiresAt)
    || (value.usedAt !== null && !isTimestamp(value.usedAt))) {
    return { ok: false, reasonCode: 'suggestion_invalid_shape' };
  }
  if (!validatePayload(value.type as OdoCopilotSuggestionType, value.payload)) {
    return { ok: false, reasonCode: 'suggestion_invalid_payload' };
  }
  const expectedType: Readonly<Record<string, OdoCopilotSuggestionType>> = {
    conversation_spark: 'conversation_spark',
    audience_pulse: 'audience_pulse',
    pair_narration: 'pair_introduction',
    scene_suggestion: 'scene_suggestion',
    transition_copy: 'transition_copy',
    session_welcome: 'session_welcome',
    session_closing: 'session_closing',
  };
  if (value.type !== 'no_action' && expectedType[String(value.task)] !== value.type) {
    return { ok: false, reasonCode: 'suggestion_task_type_mismatch' };
  }
  return { ok: true, value: value as unknown as OdoCopilotSuggestion };
};

export const parseOdoCopilotState = (
  value: unknown,
): OdoCopilotValidationResult<OdoCopilotState> => {
  const featureKeys = [
    'conversationSpark', 'audiencePulse', 'pairNarration',
    'sceneSuggestions', 'transitionCopy',
  ] as const;
  if (!isRecord(value)
    || value.schemaVersion !== ODO_COPILOT_SCHEMA_VERSION
    || typeof value.enabled !== 'boolean'
    || typeof value.temporarilyUnavailable !== 'boolean'
    || (value.unavailableReason !== null && typeof value.unavailableReason !== 'string')
    || !['manual', 'hybrid', 'autopilot'].includes(String(value.directionMode))
    || typeof value.currentScene !== 'string'
    || !isRecord(value.features)
    || !hasExactKeys(value.features, featureKeys)
    || !featureKeys.every((key) => typeof value.features[key] === 'boolean')
    || !Array.isArray(value.suggestions)) {
    return { ok: false, reasonCode: 'copilot_state_invalid' };
  }
  const suggestions: OdoCopilotSuggestion[] = [];
  for (const candidate of value.suggestions) {
    const parsed = parseOdoCopilotSuggestion(candidate);
    if (parsed.ok === false) return { ok: false, reasonCode: parsed.reasonCode };
    suggestions.push(parsed.value);
  }
  return {
    ok: true,
    value: { ...value, suggestions } as unknown as OdoCopilotState,
  };
};

export const isOdoCopilotSuggestionExpired = (
  suggestion: Pick<OdoCopilotSuggestion, 'expiresAt'>,
  now = new Date(),
): boolean => Date.parse(suggestion.expiresAt) <= now.getTime();

export const canUseOdoCopilotSuggestion = (
  suggestion: OdoCopilotSuggestion,
  context: {
    now?: Date;
    sessionVersion: number;
    stateVersion: number;
    roundId: string | null;
    roundVersion: number | null;
  },
): boolean => suggestion.status === 'ready'
  && !isOdoCopilotSuggestionExpired(suggestion, context.now)
  && suggestion.sessionVersion === context.sessionVersion
  && suggestion.stateVersion === context.stateVersion
  && suggestion.roundId === context.roundId
  && suggestion.roundVersion === context.roundVersion;
