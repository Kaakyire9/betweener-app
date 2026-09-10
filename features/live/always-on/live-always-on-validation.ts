import {
  LIVE_ALWAYS_ON_AVAILABILITY_STATES,
  LIVE_ALWAYS_ON_OPPORTUNITY_STATES,
  type LiveAlwaysOnSnapshot,
} from './live-always-on-contracts.ts';

type ParseResult =
  | { ok: true; value: LiveAlwaysOnSnapshot }
  | { ok: false; reasonCode: string };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isString = (value: unknown): value is string => typeof value === 'string';
const nullableString = (value: unknown) => value == null || isString(value);
const isFiniteInteger = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const hasExactKeys = (value: Record<string, unknown>, keys: readonly string[]): boolean => {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length
    && actual.every((key, index) => key === expected[index]);
};

export const parseLiveAlwaysOnSnapshot = (value: unknown): ParseResult => {
  if (!isRecord(value)
    || !hasExactKeys(value, [
      'schemaVersion', 'serverNow', 'available', 'unavailableReasonCode',
      'durationOptionsMinutes', 'availability', 'opportunity',
    ])
    || value.schemaVersion !== 1
    || !isString(value.serverNow)
    || typeof value.available !== 'boolean'
    || !nullableString(value.unavailableReasonCode)
    || !Array.isArray(value.durationOptionsMinutes)
    || value.durationOptionsMinutes.some((duration) => !isFiniteInteger(duration)
      || duration < 1 || duration > 1440)) {
    return { ok: false, reasonCode: 'live_always_on_snapshot_invalid' };
  }
  let availability: LiveAlwaysOnSnapshot['availability'] = null;
  if (value.availability != null) {
    if (!isRecord(value.availability)
      || !hasExactKeys(value.availability, [
        'status', 'expiresAt', 'marketContext', 'cooldownUntil',
        'notTonightUntil', 'version',
      ])
      || !LIVE_ALWAYS_ON_AVAILABILITY_STATES.includes(value.availability.status as never)
      || !isString(value.availability.expiresAt)
      || !isString(value.availability.marketContext)
      || !nullableString(value.availability.cooldownUntil)
      || !nullableString(value.availability.notTonightUntil)
      || !isFiniteInteger(value.availability.version)
      || value.availability.version < 1) {
      return { ok: false, reasonCode: 'live_always_on_availability_invalid' };
    }
    availability = {
      status: value.availability.status as LiveAlwaysOnSnapshot['availability'] extends infer T
        ? T extends { status: infer S } ? S : never : never,
      expiresAt: value.availability.expiresAt,
      marketContext: value.availability.marketContext,
      cooldownUntil: value.availability.cooldownUntil as string | null,
      notTonightUntil: value.availability.notTonightUntil as string | null,
      version: value.availability.version,
    };
  }
  let opportunity: LiveAlwaysOnSnapshot['opportunity'] = null;
  if (value.opportunity != null) {
    if (!isRecord(value.opportunity)
      || !hasExactKeys(value.opportunity, [
        'id', 'state', 'myState', 'expiresAt', 'acceptedCount',
        'minimumCount', 'sessionId', 'reasonCode',
      ])
      || !isString(value.opportunity.id)
      || !UUID_PATTERN.test(value.opportunity.id)
      || !LIVE_ALWAYS_ON_OPPORTUNITY_STATES.includes(value.opportunity.state as never)
      || !['invited', 'accepted'].includes(String(value.opportunity.myState))
      || !isString(value.opportunity.expiresAt)
      || !isFiniteInteger(value.opportunity.acceptedCount)
      || value.opportunity.acceptedCount < 0
      || !isFiniteInteger(value.opportunity.minimumCount)
      || value.opportunity.minimumCount < 2
      || !nullableString(value.opportunity.sessionId)
      || !nullableString(value.opportunity.reasonCode)) {
      return { ok: false, reasonCode: 'live_always_on_opportunity_invalid' };
    }
    opportunity = {
      id: value.opportunity.id,
      state: value.opportunity.state as LiveAlwaysOnSnapshot['opportunity'] extends infer T
        ? T extends { state: infer S } ? S : never : never,
      myState: value.opportunity.myState as 'invited' | 'accepted',
      expiresAt: value.opportunity.expiresAt,
      acceptedCount: value.opportunity.acceptedCount,
      minimumCount: value.opportunity.minimumCount,
      sessionId: value.opportunity.sessionId as string | null,
      reasonCode: value.opportunity.reasonCode as string | null,
    };
  }
  return {
    ok: true,
    value: {
      schemaVersion: 1,
      serverNow: value.serverNow,
      available: value.available,
      unavailableReasonCode: value.unavailableReasonCode as string | null,
      durationOptionsMinutes: value.durationOptionsMinutes as number[],
      availability,
      opportunity,
    },
  };
};
