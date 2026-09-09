import {
  ODO_GUARDED_ACTION_TYPES,
  type OdoGuardedAutopilotState,
  type OdoGuardedFeatures,
  type OdoGuardedLastAction,
} from './odo-autopilot-contracts.ts';

type ParseResult<T> = { ok: true; value: T } | { ok: false; reasonCode: string };
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isStringOrNull = (value: unknown): value is string | null =>
  value === null || typeof value === 'string';
const isSafeNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;

const parseFeatures = (value: unknown): OdoGuardedFeatures | null => {
  if (!isRecord(value)) return null;
  const keys: (keyof OdoGuardedFeatures)[] = [
    'narration', 'scenes', 'conversationSparks', 'audiencePulse',
    'intermissions', 'timeCues',
  ];
  return Object.keys(value).length === keys.length
    && keys.every((key) => typeof value[key] === 'boolean')
    ? value as OdoGuardedFeatures
    : null;
};

const parseLastAction = (value: unknown): OdoGuardedLastAction | null | false => {
  if (value === null) return null;
  if (!isRecord(value) || Object.keys(value).length !== 4
    || typeof value.actionId !== 'string'
    || typeof value.type !== 'string'
    || !ODO_GUARDED_ACTION_TYPES.includes(value.type as never)
    || typeof value.reasonCode !== 'string'
    || typeof value.executedAt !== 'string') return false;
  return value as OdoGuardedLastAction;
};

export const parseOdoGuardedAutopilotState = (
  value: unknown,
): ParseResult<OdoGuardedAutopilotState> => {
  if (!isRecord(value)) return { ok: false, reasonCode: 'odo_guarded_state_invalid' };
  const keys = [
    'schemaVersion', 'available', 'sessionId', 'enabled', 'directionMode',
    'autopilotState', 'currentScene', 'limitedMode', 'stateVersion',
    'leaseGeneration', 'features', 'lastAction', 'nextTimeCueAt',
    'unavailableReasonCode',
  ];
  const features = parseFeatures(value.features);
  const lastAction = parseLastAction(value.lastAction);
  if (Object.keys(value).length !== keys.length
    || !keys.every((key) => Object.prototype.hasOwnProperty.call(value, key))
    || value.schemaVersion !== 1
    || typeof value.available !== 'boolean'
    || typeof value.sessionId !== 'string'
    || typeof value.enabled !== 'boolean'
    || !['manual', 'hybrid', 'autopilot'].includes(String(value.directionMode))
    || ![
      'off', 'starting', 'active', 'paused_by_host', 'paused_by_policy',
      'recovering', 'ending', 'ended',
    ].includes(String(value.autopilotState))
    || typeof value.currentScene !== 'string'
    || typeof value.limitedMode !== 'boolean'
    || !isSafeNumber(value.stateVersion)
    || !isSafeNumber(value.leaseGeneration)
    || !features
    || lastAction === false
    || !isStringOrNull(value.nextTimeCueAt)
    || !isStringOrNull(value.unavailableReasonCode)) {
    return { ok: false, reasonCode: 'odo_guarded_state_invalid' };
  }
  return {
    ok: true,
    value: { ...value, features, lastAction } as OdoGuardedAutopilotState,
  };
};
