import {
  ODO_FULL_QUICK_CONNECT_ACTIONS,
  ODO_FULL_QUICK_CONNECT_LIFECYCLE_STATES,
  ODO_FULL_QUICK_CONNECT_ORCHESTRATION_STATES,
  type OdoFullQuickConnectState,
} from './odo-full-quick-connect-contracts.ts';

const CONTROL_STATES = ['closed', 'open', 'paused', 'draining', 'ended'] as const;
const ENERGY_MODES = ['calm', 'normal', 'energize', 'closing'] as const;
const HEALTH_STATES = [
  'healthy', 'degraded_ai', 'degraded_realtime', 'recovering',
  'paused_policy', 'paused_host',
] as const;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isNullableString = (value: unknown): value is string | null =>
  value === null || typeof value === 'string';
const isMember = <T extends readonly string[]>(values: T, value: unknown): value is T[number] =>
  typeof value === 'string' && values.includes(value);
const integer = (value: unknown): number | null =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
const hasExactKeys = (value: Record<string, unknown>, keys: readonly string[]): boolean => {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length
    && actual.every((key, index) => key === expected[index]);
};

export const parseOdoFullQuickConnectState = (
  value: unknown,
): { ok: true; value: OdoFullQuickConnectState } | { ok: false; reasonCode: string } => {
  if (!isRecord(value) || !hasExactKeys(value, [
    'schemaVersion', 'available', 'sessionId', 'enabled', 'lifecycleState',
    'orchestrationState', 'energyMode', 'controlState', 'limitedMode', 'healthState',
    'stateVersion', 'leaseGeneration', 'metrics', 'lastActionType',
    'lastReasonCode', 'startedAt', 'maximumRuntimeEndsAt', 'nextWakeAt',
    'unavailableReasonCode',
  ]) || value.schemaVersion !== 1
    || typeof value.available !== 'boolean' || typeof value.enabled !== 'boolean'
    || typeof value.sessionId !== 'string' || !UUID_PATTERN.test(value.sessionId)
    || !isMember(ODO_FULL_QUICK_CONNECT_LIFECYCLE_STATES, value.lifecycleState)
    || !isMember(ODO_FULL_QUICK_CONNECT_ORCHESTRATION_STATES, value.orchestrationState)
    || !isMember(ENERGY_MODES, value.energyMode)
    || !isMember(CONTROL_STATES, value.controlState)
    || typeof value.limitedMode !== 'boolean'
    || !isMember(HEALTH_STATES, value.healthState)
    || integer(value.stateVersion) === null || integer(value.leaseGeneration) === null
    || !isRecord(value.metrics) || !hasExactKeys(value.metrics, [
      'waitingPeople', 'eligiblePairs', 'activePairs', 'completedRounds',
    ])
    || integer(value.metrics.waitingPeople) === null
    || integer(value.metrics.eligiblePairs) === null
    || integer(value.metrics.activePairs) === null
    || integer(value.metrics.completedRounds) === null
    || !(value.lastActionType === null
      || isMember(ODO_FULL_QUICK_CONNECT_ACTIONS, value.lastActionType))
    || !isNullableString(value.lastReasonCode)
    || !isNullableString(value.startedAt)
    || !isNullableString(value.maximumRuntimeEndsAt)
    || !isNullableString(value.nextWakeAt)
    || !isNullableString(value.unavailableReasonCode)) {
    return { ok: false, reasonCode: 'odo_full_quick_connect_state_invalid' };
  }
  return { ok: true, value: value as OdoFullQuickConnectState };
};
