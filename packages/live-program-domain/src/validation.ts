import {
  PROGRAM_CONTROLLER_SOURCES,
  PROGRAM_SCENES,
  PROGRAM_SOURCE_HEALTH,
  PROGRAM_SOURCE_READINESS,
  PROGRAM_SOURCE_ROLES,
  PROGRAM_SOURCE_SLOTS,
  PROGRAM_SOURCE_TYPES,
  PROGRAM_TARGET_CANVASES,
  PROGRAM_TRANSITIONS,
  type ProgramSource,
  type ProgramSourceAssignments,
  type ProgramState,
  type StudioOperationalSnapshot,
} from './contracts.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SOURCE_KEY = /^[a-z][a-z0-9_.:-]{2,119}$/;
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isMember = <T extends readonly string[]>(values: T, value: unknown): value is T[number] =>
  typeof value === 'string' && values.includes(value);
const isVersion = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const nullableString = (value: unknown): value is string | null =>
  value === null || typeof value === 'string';

export const parseProgramSourceAssignments = (value: unknown): ProgramSourceAssignments | null => {
  if (!isRecord(value) || Object.keys(value).length > PROGRAM_SOURCE_SLOTS.length) return null;
  const parsed: ProgramSourceAssignments = {};
  for (const [slot, sourceKey] of Object.entries(value)) {
    if (!isMember(PROGRAM_SOURCE_SLOTS, slot) || typeof sourceKey !== 'string'
      || !SOURCE_KEY.test(sourceKey)) return null;
    parsed[slot] = sourceKey;
  }
  return parsed;
};

export const parseProgramState = (value: unknown): ProgramState | null => {
  if (!isRecord(value) || value.schemaVersion !== 1
    || typeof value.sessionId !== 'string' || !UUID.test(value.sessionId)
    || !isMember(PROGRAM_SCENES, value.scene)
    || !isMember(PROGRAM_TARGET_CANVASES, value.targetCanvas)
    || !isMember(PROGRAM_TRANSITIONS, value.transition)
    || !isMember(PROGRAM_SCENES, value.fallbackScene)
    || !isVersion(value.programVersion) || !isVersion(value.showStateVersion)
    || typeof value.updatedAt !== 'string' || !isRecord(value.controller)) return null;
  const assignments = parseProgramSourceAssignments(value.sourceAssignments);
  if (!assignments || !isMember(PROGRAM_CONTROLLER_SOURCES, value.controller.source)
    || !nullableString(value.controller.userId)
    || !nullableString(value.controller.instanceId)
    || !isVersion(value.controller.generation)
    || !nullableString(value.controller.leaseExpiresAt)) return null;
  return { ...value, sourceAssignments: assignments } as ProgramState;
};

export const parseProgramSource = (value: unknown): ProgramSource | null => {
  if (!isRecord(value) || typeof value.id !== 'string' || !UUID.test(value.id)
    || typeof value.key !== 'string' || !SOURCE_KEY.test(value.key)
    || !isMember(PROGRAM_SOURCE_TYPES, value.type)
    || !isMember(PROGRAM_SOURCE_ROLES, value.role)
    || !nullableString(value.ownerUserId) || !nullableString(value.providerUserId)
    || typeof value.hasVideo !== 'boolean' || typeof value.hasAudio !== 'boolean'
    || !isMember(PROGRAM_SOURCE_READINESS, value.readiness)
    || !isMember(PROGRAM_SOURCE_HEALTH, value.health)
    || typeof value.muted !== 'boolean' || !nullableString(value.failureReasonCode)
    || !isVersion(value.generation) || !isVersion(value.version)
    || !nullableString(value.lastSeenAt)) return null;
  return value as ProgramSource;
};

export const parseStudioOperationalSnapshot = (value: unknown): StudioOperationalSnapshot | null => {
  if (!isRecord(value) || value.schemaVersion !== 1 || typeof value.serverNow !== 'string'
    || !isRecord(value.access) || !isRecord(value.session)
    || !isRecord(value.program) || !Array.isArray(value.sources)
    || !isRecord(value.show) || !isRecord(value.quickConnect)
    || !isRecord(value.odo) || !isRecord(value.music)
    || !isRecord(value.audiencePulse) || !isRecord(value.safety)) return null;
  const program = parseProgramState(value.program);
  const sources = value.sources.map(parseProgramSource);
  const access = value.access;
  const session = value.session;
  const show = value.show;
  const quickConnect = value.quickConnect;
  const odo = value.odo;
  const music = value.music;
  const audiencePulse = value.audiencePulse;
  const safety = value.safety;
  if (!program || sources.some((source) => !source)
    || !['canView', 'canControl', 'canPublish', 'canScreenShare',
      'canUseExternalAudio', 'canModerate'].every((key) => typeof access[key] === 'boolean')
    || typeof session.id !== 'string' || !UUID.test(session.id)
    || typeof session.title !== 'string' || typeof session.status !== 'string'
    || !isVersion(session.version)
    || !isMember(['human', 'system'] as const, session.ownershipType)
    || !nullableString(session.systemSessionKind)
    || typeof show.enabled !== 'boolean' || typeof show.state !== 'string'
    || typeof show.energyMode !== 'string' || !nullableString(show.nextWakeAt)
    || !nullableString(show.reasonCode)
    || typeof quickConnect.state !== 'string'
    || !['poolCount', 'eligiblePairCount', 'activePairCount', 'completedRoundCount',
      'reconnectingCount'].every((key) => isVersion(quickConnect[key]))
    || typeof odo.state !== 'string' || !nullableString(odo.nextWakeAt)
    || typeof odo.healthy !== 'boolean'
    || typeof music.enabled !== 'boolean' || typeof music.status !== 'string'
    || !nullableString(music.trackId) || !nullableString(music.playlistId)
    || !nullableString(music.mood) || typeof music.volume !== 'number'
    || music.volume < 0 || music.volume > 1 || !isVersion(music.stateVersion)
    || typeof audiencePulse.open !== 'boolean'
    || !isMember(['healthy', 'degraded'] as const, safety.status)
    || !isVersion(safety.activeHoldCount)) return null;
  return {
    ...value,
    program,
    sources: sources as ProgramSource[],
  } as unknown as StudioOperationalSnapshot;
};
