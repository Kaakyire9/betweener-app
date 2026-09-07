import {
  LIVE_DIRECTOR_EVENT_TYPES,
  ODO_ACTION_TYPES,
  ODO_AUTOPILOT_STATES,
  ODO_DIRECTOR_EVENT_SOURCES,
  ODO_DIRECTOR_EVENT_VISIBILITIES,
  ODO_DIRECTION_MODES,
  ODO_SCENES,
  ODO_SCHEMA_VERSION,
  ODO_WAIT_EVENTS,
  type LiveDirectorEvent,
  type OdoAction,
  type OdoActionType,
  type OdoDirectorSnapshot,
} from './odo-contracts.ts';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CODE_PATTERN = /^[a-z][a-z0-9_]{0,63}$/;
const LOCALE_PATTERN = /^[a-z]{2}(?:-[A-Z]{2})?$/;
const MAX_ACTION_BYTES = 8_192;
const FORBIDDEN_KEYS = new Set([
  'sql',
  'query',
  'rpc',
  'function',
  'functionName',
  'url',
  'uri',
  'streamCallId',
  'component',
  'componentName',
  'route',
]);
const FORBIDDEN_STRING = /(?:https?:\/\/|wss?:\/\/|\brpc_[a-z0-9_]+\b|\bselect\b[^\n]{0,200}\bfrom\b|\binsert\s+into\b|\bupdate\s+[a-z_][a-z0-9_.]*\s+set\b|\bdelete\s+from\b|\b(?:alter|drop|truncate)\s+(?:table|function|schema|role)\b|\b(?:grant|revoke)\b[^\n]{0,200}\bon\b|\bstream(?::\/\/|_[a-z0-9_]+)\b|<script\b)/i;

export type OdoValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; reasonCode: string };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const hasExactKeys = (
  value: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[] = [],
): boolean => {
  const allowed = new Set([...required, ...optional]);
  return required.every((key) => Object.prototype.hasOwnProperty.call(value, key))
    && Object.keys(value).every((key) => allowed.has(key));
};

const isUuid = (value: unknown): value is string =>
  typeof value === 'string' && UUID_PATTERN.test(value);

const isIntegerInRange = (value: unknown, minimum: number, maximum: number): value is number =>
  Number.isInteger(value) && Number(value) >= minimum && Number(value) <= maximum;

const isStringInRange = (value: unknown, minimum: number, maximum: number): value is string =>
  typeof value === 'string' && value.length >= minimum && value.length <= maximum;

const containsForbiddenControlData = (value: unknown): boolean => {
  if (typeof value === 'string') return FORBIDDEN_STRING.test(value);
  if (Array.isArray(value)) return value.some(containsForbiddenControlData);
  if (!isRecord(value)) return false;
  return Object.entries(value).some(([key, child]) =>
    FORBIDDEN_KEYS.has(key) || containsForbiddenControlData(child));
};

const validateCopy = (value: unknown, maximum = 500): value is string =>
  isStringInRange(value, 1, maximum) && !FORBIDDEN_STRING.test(value);

const validateLocale = (value: unknown): value is string =>
  typeof value === 'string' && LOCALE_PATTERN.test(value);

const validatePayload = (type: OdoActionType, payload: unknown): boolean => {
  if (!isRecord(payload)) return false;
  switch (type) {
    case 'NO_ACTION':
    case 'OPEN_POOL':
      return hasExactKeys(payload, []);
    case 'WAIT':
      return hasExactKeys(payload, ['waitMs'], ['untilEvent'])
        && isIntegerInRange(payload.waitMs, 1_000, 60_000)
        && (payload.untilEvent === undefined
          || (typeof payload.untilEvent === 'string'
            && ODO_WAIT_EVENTS.includes(payload.untilEvent as never)));
    case 'SESSION_WELCOME':
    case 'SESSION_CLOSING':
      return hasExactKeys(payload, ['copy', 'locale'])
        && validateCopy(payload.copy)
        && validateLocale(payload.locale);
    case 'ANNOUNCE_PAIR':
    case 'FOCUS_PAIRING':
    case 'CLOSE_ROUND':
    case 'RETURN_TO_POOL':
      return hasExactKeys(payload, ['roundId']) && isUuid(payload.roundId);
    case 'REQUEST_SCENE':
      return hasExactKeys(payload, ['scene'])
        && typeof payload.scene === 'string'
        && ODO_SCENES.includes(payload.scene as (typeof ODO_SCENES)[number]);
    case 'SHOW_CONVERSATION_SPARK':
      return hasExactKeys(payload, ['roundId', 'context', 'question', 'locale'])
        && isUuid(payload.roundId)
        && validateCopy(payload.context, 200)
        && validateCopy(payload.question, 300)
        && validateLocale(payload.locale);
    case 'SHOW_AUDIENCE_PULSE':
      return hasExactKeys(payload, ['templateKey', 'durationSeconds'])
        && typeof payload.templateKey === 'string'
        && CODE_PATTERN.test(payload.templateKey)
        && isIntegerInRange(payload.durationSeconds, 30, 300);
    case 'SHOW_INTERMISSION':
      return hasExactKeys(payload, ['durationSeconds', 'copy', 'locale'])
        && isIntegerInRange(payload.durationSeconds, 15, 600)
        && validateCopy(payload.copy)
        && validateLocale(payload.locale);
    case 'REQUEST_MUSIC_ACTION': {
      const actions = ['play', 'pause', 'resume', 'stop', 'set_volume'];
      return hasExactKeys(payload, ['action'], ['trackId', 'playlistId', 'volume'])
        && typeof payload.action === 'string'
        && actions.includes(payload.action)
        && (payload.trackId === undefined || isUuid(payload.trackId))
        && (payload.playlistId === undefined || isUuid(payload.playlistId))
        && (payload.volume === undefined
          || (typeof payload.volume === 'number' && payload.volume >= 0 && payload.volume <= 1));
    }
    case 'TIME_CUE':
      return hasExactKeys(payload, ['roundId', 'cue'])
        && isUuid(payload.roundId)
        && ['one_minute', 'near_end', 'ended'].includes(String(payload.cue));
  }
};

export const parseOdoAction = (
  value: unknown,
  options: { now?: Date; allowExpired?: boolean } = {},
): OdoValidationResult<OdoAction> => {
  if (!isRecord(value)) return { ok: false, reasonCode: 'action_not_object' };
  if (!hasExactKeys(value, [
    'schemaVersion',
    'actionId',
    'sessionId',
    'snapshotVersion',
    'leaseGeneration',
    'type',
    'reasonCode',
    'expiresAt',
    'payload',
  ])) return { ok: false, reasonCode: 'action_unknown_or_missing_field' };
  if (new TextEncoder().encode(JSON.stringify(value)).byteLength > MAX_ACTION_BYTES) {
    return { ok: false, reasonCode: 'action_too_large' };
  }
  if (value.schemaVersion !== ODO_SCHEMA_VERSION) {
    return { ok: false, reasonCode: 'unsupported_schema_version' };
  }
  if (!isUuid(value.actionId) || !isUuid(value.sessionId)) {
    return { ok: false, reasonCode: 'invalid_action_identity' };
  }
  if (!isIntegerInRange(value.snapshotVersion, 1, Number.MAX_SAFE_INTEGER)
    || !isIntegerInRange(value.leaseGeneration, 1, Number.MAX_SAFE_INTEGER)) {
    return { ok: false, reasonCode: 'invalid_fencing_version' };
  }
  if (typeof value.type !== 'string'
    || !ODO_ACTION_TYPES.includes(value.type as OdoActionType)) {
    return { ok: false, reasonCode: 'unknown_action_type' };
  }
  if (typeof value.reasonCode !== 'string' || !CODE_PATTERN.test(value.reasonCode)) {
    return { ok: false, reasonCode: 'invalid_reason_code' };
  }
  if (typeof value.expiresAt !== 'string'
    || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value.expiresAt)
    || Number.isNaN(Date.parse(value.expiresAt))) {
    return { ok: false, reasonCode: 'invalid_expiry' };
  }
  if (!options.allowExpired && Date.parse(value.expiresAt) <= (options.now ?? new Date()).getTime()) {
    return { ok: false, reasonCode: 'action_expired' };
  }
  if (containsForbiddenControlData(value.payload)) {
    return { ok: false, reasonCode: 'forbidden_control_data' };
  }
  if (!validatePayload(value.type as OdoActionType, value.payload)) {
    return { ok: false, reasonCode: 'invalid_action_payload' };
  }
  return { ok: true, value: value as OdoAction };
};

export const parseOdoDirectorSnapshot = (value: unknown): OdoValidationResult<OdoDirectorSnapshot> => {
  if (!isRecord(value)) return { ok: false, reasonCode: 'snapshot_not_object' };
  const required = [
    'schemaVersion', 'sessionId', 'sessionVersion', 'currentStateVersion',
    'latestSequenceNumber', 'currentScene', 'directionMode', 'autopilotState',
    'sessionStatus', 'activeRoundId', 'participantCount', 'audienceCount', 'policyFlags',
  ];
  if (!required.every((key) => Object.prototype.hasOwnProperty.call(value, key))) {
    return { ok: false, reasonCode: 'snapshot_missing_field' };
  }
  if (value.schemaVersion !== ODO_SCHEMA_VERSION || !isUuid(value.sessionId)) {
    return { ok: false, reasonCode: 'invalid_snapshot_identity' };
  }
  if (![value.sessionVersion, value.currentStateVersion].every((item) =>
    isIntegerInRange(item, 1, Number.MAX_SAFE_INTEGER))
    || !isIntegerInRange(value.latestSequenceNumber, 0, Number.MAX_SAFE_INTEGER)
    || !isIntegerInRange(value.participantCount, 0, 10_000)
    || !isIntegerInRange(value.audienceCount, 0, 10_000)) {
    return { ok: false, reasonCode: 'invalid_snapshot_version_or_count' };
  }
  if (typeof value.currentScene !== 'string' || !ODO_SCENES.includes(value.currentScene as never)
    || typeof value.directionMode !== 'string' || !ODO_DIRECTION_MODES.includes(value.directionMode as never)
    || typeof value.autopilotState !== 'string' || !ODO_AUTOPILOT_STATES.includes(value.autopilotState as never)
    || typeof value.sessionStatus !== 'string'
    || (value.activeRoundId !== null && !isUuid(value.activeRoundId))
    || !isRecord(value.policyFlags)
    || !Object.values(value.policyFlags).every((flag) => typeof flag === 'boolean')) {
    return { ok: false, reasonCode: 'invalid_snapshot_state' };
  }
  return { ok: true, value: value as OdoDirectorSnapshot };
};

export const parseLiveDirectorEvent = (value: unknown): OdoValidationResult<LiveDirectorEvent> => {
  if (!isRecord(value)) return { ok: false, reasonCode: 'event_not_object' };
  const required = [
    'schemaVersion', 'sequenceNumber', 'eventId', 'sessionId', 'eventType',
    'source', 'visibility', 'actionId', 'stateVersion', 'occurredAt',
    'createdAt', 'expiresAt', 'payload',
  ];
  if (!required.every((key) => Object.prototype.hasOwnProperty.call(value, key))) {
    return { ok: false, reasonCode: 'event_missing_field' };
  }
  if (!isIntegerInRange(value.schemaVersion, 1, Number.MAX_SAFE_INTEGER)
    || !isIntegerInRange(value.sequenceNumber, 1, Number.MAX_SAFE_INTEGER)
    || !isIntegerInRange(value.stateVersion, 1, Number.MAX_SAFE_INTEGER)
    || !isUuid(value.eventId)
    || !isUuid(value.sessionId)
    || typeof value.eventType !== 'string'
    || typeof value.source !== 'string'
    || !ODO_DIRECTOR_EVENT_SOURCES.includes(value.source as never)
    || typeof value.visibility !== 'string'
    || !ODO_DIRECTOR_EVENT_VISIBILITIES.includes(value.visibility as never)
    || (value.actionId !== null && !isUuid(value.actionId))
    || typeof value.occurredAt !== 'string'
    || Number.isNaN(Date.parse(value.occurredAt))
    || typeof value.createdAt !== 'string'
    || Number.isNaN(Date.parse(value.createdAt))
    || (value.expiresAt !== null
      && (typeof value.expiresAt !== 'string' || Number.isNaN(Date.parse(value.expiresAt))))
    || !isRecord(value.payload)) {
    return { ok: false, reasonCode: 'invalid_event_shape' };
  }

  if (value.schemaVersion === ODO_SCHEMA_VERSION
    && LIVE_DIRECTOR_EVENT_TYPES.includes(value.eventType as never)) {
    return { ok: true, value: value as unknown as LiveDirectorEvent };
  }

  return {
    ok: true,
    value: {
      schemaVersion: value.schemaVersion,
      sequenceNumber: value.sequenceNumber,
      eventId: value.eventId,
      sessionId: value.sessionId,
      eventType: 'UNKNOWN',
      rawEventType: value.eventType,
      source: value.source as (typeof ODO_DIRECTOR_EVENT_SOURCES)[number],
      visibility: value.visibility as (typeof ODO_DIRECTOR_EVENT_VISIBILITIES)[number],
      actionId: value.actionId as string | null,
      stateVersion: value.stateVersion,
      occurredAt: value.occurredAt,
      createdAt: value.createdAt,
      expiresAt: value.expiresAt as string | null,
      payload: {},
    },
  };
};

const stringSchema = (maxLength: number, pattern?: string) => ({
  type: 'string',
  minLength: 1,
  maxLength,
  ...(pattern ? { pattern } : {}),
});
const objectSchema = (
  properties: Record<string, unknown>,
  required: readonly string[],
) => ({ type: 'object', additionalProperties: false, properties, required });
const uuidSchema = stringSchema(36, UUID_PATTERN.source);
const localeSchema = stringSchema(8, LOCALE_PATTERN.source);
const commonProperties = {
  schemaVersion: { type: 'integer', const: ODO_SCHEMA_VERSION },
  actionId: uuidSchema,
  sessionId: uuidSchema,
  snapshotVersion: { type: 'integer', minimum: 1 },
  leaseGeneration: { type: 'integer', minimum: 1 },
  reasonCode: stringSchema(64, CODE_PATTERN.source),
  expiresAt: { type: 'string', format: 'date-time', maxLength: 30 },
};
const commonRequired = [
  'schemaVersion', 'actionId', 'sessionId', 'snapshotVersion',
  'leaseGeneration', 'type', 'reasonCode', 'expiresAt', 'payload',
] as const;
export const ODO_ACTION_PROVIDER_PAYLOAD_KEYS = [
  'waitMs',
  'untilEvent',
  'copy',
  'locale',
  'roundId',
  'scene',
  'context',
  'question',
  'templateKey',
  'durationSeconds',
  'musicAction',
  'trackId',
  'playlistId',
  'volume',
  'cue',
] as const;

type OdoActionProviderPayloadKey = (typeof ODO_ACTION_PROVIDER_PAYLOAD_KEYS)[number];

const nullableSchema = (schema: Record<string, unknown>) => ({
  anyOf: [schema, { type: 'null' }],
});

const providerPayloadKeysByAction: Record<OdoActionType, readonly OdoActionProviderPayloadKey[]> = {
  NO_ACTION: [],
  WAIT: ['waitMs', 'untilEvent'],
  SESSION_WELCOME: ['copy', 'locale'],
  OPEN_POOL: [],
  ANNOUNCE_PAIR: ['roundId'],
  FOCUS_PAIRING: ['roundId'],
  REQUEST_SCENE: ['scene'],
  SHOW_CONVERSATION_SPARK: ['roundId', 'context', 'question', 'locale'],
  SHOW_AUDIENCE_PULSE: ['templateKey', 'durationSeconds'],
  SHOW_INTERMISSION: ['durationSeconds', 'copy', 'locale'],
  REQUEST_MUSIC_ACTION: ['musicAction', 'trackId', 'playlistId', 'volume'],
  TIME_CUE: ['roundId', 'cue'],
  CLOSE_ROUND: ['roundId'],
  RETURN_TO_POOL: ['roundId'],
  SESSION_CLOSING: ['copy', 'locale'],
};

const buildCanonicalProviderPayload = (
  type: OdoActionType,
  payload: Record<OdoActionProviderPayloadKey, unknown>,
): Record<string, unknown> => {
  switch (type) {
    case 'NO_ACTION':
    case 'OPEN_POOL':
      return {};
    case 'WAIT':
      return {
        waitMs: payload.waitMs,
        ...(payload.untilEvent === null ? {} : { untilEvent: payload.untilEvent }),
      };
    case 'SESSION_WELCOME':
    case 'SESSION_CLOSING':
      return { copy: payload.copy, locale: payload.locale };
    case 'ANNOUNCE_PAIR':
    case 'FOCUS_PAIRING':
    case 'CLOSE_ROUND':
    case 'RETURN_TO_POOL':
      return { roundId: payload.roundId };
    case 'REQUEST_SCENE':
      return { scene: payload.scene };
    case 'SHOW_CONVERSATION_SPARK':
      return {
        roundId: payload.roundId,
        context: payload.context,
        question: payload.question,
        locale: payload.locale,
      };
    case 'SHOW_AUDIENCE_PULSE':
      return { templateKey: payload.templateKey, durationSeconds: payload.durationSeconds };
    case 'SHOW_INTERMISSION':
      return {
        durationSeconds: payload.durationSeconds,
        copy: payload.copy,
        locale: payload.locale,
      };
    case 'REQUEST_MUSIC_ACTION':
      return {
        action: payload.musicAction,
        ...(payload.trackId === null ? {} : { trackId: payload.trackId }),
        ...(payload.playlistId === null ? {} : { playlistId: payload.playlistId }),
        ...(payload.volume === null ? {} : { volume: payload.volume }),
      };
    case 'TIME_CUE':
      return { roundId: payload.roundId, cue: payload.cue };
  }
};

export const normalizeOdoActionProposal = (
  value: unknown,
  options: { now?: Date; allowExpired?: boolean } = {},
): OdoValidationResult<OdoAction> => {
  if (!isRecord(value) || !hasExactKeys(value, commonRequired)) {
    return { ok: false, reasonCode: 'proposal_unknown_or_missing_field' };
  }
  if (typeof value.type !== 'string' || !ODO_ACTION_TYPES.includes(value.type as OdoActionType)) {
    return { ok: false, reasonCode: 'unknown_action_type' };
  }
  if (!isRecord(value.payload)
    || !hasExactKeys(value.payload, ODO_ACTION_PROVIDER_PAYLOAD_KEYS)) {
    return { ok: false, reasonCode: 'proposal_payload_unknown_or_missing_field' };
  }

  const actionType = value.type as OdoActionType;
  const activeKeys = new Set(providerPayloadKeysByAction[actionType]);
  if (ODO_ACTION_PROVIDER_PAYLOAD_KEYS.some((key) =>
    !activeKeys.has(key) && value.payload[key] !== null)) {
    return { ok: false, reasonCode: 'proposal_payload_irrelevant_field' };
  }

  const canonicalPayload = buildCanonicalProviderPayload(
    actionType,
    value.payload as Record<OdoActionProviderPayloadKey, unknown>,
  );
  return parseOdoAction({ ...value, payload: canonicalPayload }, options);
};

export const ODO_ACTION_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    ...commonProperties,
    type: { type: 'string', enum: [...ODO_ACTION_TYPES] },
    payload: objectSchema({
      waitMs: nullableSchema({ type: 'integer', minimum: 1_000, maximum: 60_000 }),
      untilEvent: nullableSchema({ type: 'string', enum: [...ODO_WAIT_EVENTS] }),
      copy: nullableSchema(stringSchema(500)),
      locale: nullableSchema(localeSchema),
      roundId: nullableSchema(uuidSchema),
      scene: nullableSchema({ type: 'string', enum: [...ODO_SCENES] }),
      context: nullableSchema(stringSchema(200)),
      question: nullableSchema(stringSchema(300)),
      templateKey: nullableSchema(stringSchema(64, CODE_PATTERN.source)),
      durationSeconds: nullableSchema({ type: 'integer', minimum: 15, maximum: 600 }),
      musicAction: nullableSchema({ type: 'string', enum: ['play', 'pause', 'resume', 'stop', 'set_volume'] }),
      trackId: nullableSchema(uuidSchema),
      playlistId: nullableSchema(uuidSchema),
      volume: nullableSchema({ type: 'number', minimum: 0, maximum: 1 }),
      cue: nullableSchema({ type: 'string', enum: ['one_minute', 'near_end', 'ended'] }),
    }, ODO_ACTION_PROVIDER_PAYLOAD_KEYS),
  },
  required: commonRequired,
} as const;
