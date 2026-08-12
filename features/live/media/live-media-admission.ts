import {
  LIVE_CAPABILITIES,
  type LiveCapability,
} from '../domain/live-capabilities.ts';
import {
  LIVE_PARTICIPANT_ROLES,
  LIVE_PARTICIPANT_STATES,
  LIVE_SESSION_STATUSES,
  type LiveParticipantRole,
  type LiveParticipantState,
  type LiveSessionStatus,
} from '../domain/live-types.ts';
import type { LiveMediaAdmission } from './live-media-provider.ts';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SAFE_PROVIDER_IDENTIFIER = /^[a-zA-Z0-9_.:-]{1,160}$/;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((entry) => typeof entry === 'string');

const includes = <T extends string>(values: readonly T[], value: unknown): value is T =>
  typeof value === 'string' && values.includes(value as T);

export class LiveMediaAdmissionError extends Error {
  public readonly code: string;

  constructor(code: string) {
    super(code);
    this.code = code;
    this.name = 'LiveMediaAdmissionError';
  }
}

export const parseLiveMediaAdmission = (value: unknown): LiveMediaAdmission => {
  if (!isRecord(value)) throw new LiveMediaAdmissionError('live_media_admission_invalid');

  const user = value.user;
  const call = value.call;
  if (!isRecord(user) || !isRecord(call)) {
    throw new LiveMediaAdmissionError('live_media_admission_identity_invalid');
  }

  const sessionId = value.sessionId;
  const userId = user.id;
  const expiresAt = value.expiresAt;
  if (
    typeof sessionId !== 'string'
    || typeof userId !== 'string'
    || !UUID_PATTERN.test(sessionId)
    || !UUID_PATTERN.test(userId)
    || typeof expiresAt !== 'string'
    || !Number.isFinite(Date.parse(expiresAt))
  ) {
    throw new LiveMediaAdmissionError('live_media_admission_identity_invalid');
  }

  if (Date.parse(expiresAt) <= Date.now()) {
    throw new LiveMediaAdmissionError('live_media_admission_expired');
  }

  if (
    typeof value.apiKey !== 'string'
    || value.apiKey.length < 4
    || typeof value.token !== 'string'
    || value.token.length < 16
    || call.provider !== 'stream'
    || typeof call.type !== 'string'
    || typeof call.id !== 'string'
    || typeof call.cid !== 'string'
    || !SAFE_PROVIDER_IDENTIFIER.test(call.type)
    || !SAFE_PROVIDER_IDENTIFIER.test(call.id)
    || call.cid !== `${call.type}:${call.id}`
  ) {
    throw new LiveMediaAdmissionError('live_media_admission_provider_invalid');
  }

  if (
    !includes(LIVE_PARTICIPANT_ROLES, value.primaryRole)
    || !isStringArray(value.roles)
    || value.roles.length === 0
    || !value.roles.every((role) => includes(LIVE_PARTICIPANT_ROLES, role))
    || !value.roles.includes(value.primaryRole)
    || !isStringArray(value.capabilities)
    || !value.capabilities.every((capability) => includes(LIVE_CAPABILITIES, capability))
    || !value.capabilities.includes('live.join')
    || !includes(LIVE_PARTICIPANT_STATES, value.participantState)
    || value.participantState === 'private_spark'
    || !includes(LIVE_SESSION_STATUSES, value.sessionStatus)
    || !['backstage', 'live', 'ending'].includes(value.sessionStatus)
  ) {
    throw new LiveMediaAdmissionError('live_media_admission_authority_invalid');
  }

  return {
    apiKey: value.apiKey,
    token: value.token,
    expiresAt,
    sessionId,
    user: { id: userId },
    call: {
      provider: 'stream',
      type: call.type,
      id: call.id,
      cid: call.cid,
    },
    primaryRole: value.primaryRole as LiveParticipantRole,
    roles: value.roles as LiveParticipantRole[],
    capabilities: value.capabilities as LiveCapability[],
    participantState: value.participantState as LiveParticipantState,
    sessionStatus: value.sessionStatus as LiveSessionStatus,
  };
};
