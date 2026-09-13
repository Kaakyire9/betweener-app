import {
  LIVE_PROGRAM_VIDEO_SOURCE_LIMIT,
  LIVE_MUSIC_REPEAT_MODES,
  LIVE_PUBLIC_STAGE_PUBLISHER_LIMIT,
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
  type LiveMusicCatalogue,
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
const hasExactKeys = (value: Record<string, unknown>, keys: readonly string[]) => {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length
    && actual.every((key, index) => key === expected[index]);
};

export const parseLiveMusicCatalogue = (value: unknown): LiveMusicCatalogue | null => {
  if (!isRecord(value) || !hasExactKeys(value, [
    'schemaVersion', 'canManageLibrary', 'tracks', 'playlists',
  ])
    || value.schemaVersion !== 1
    || typeof value.canManageLibrary !== 'boolean'
    || !Array.isArray(value.tracks) || !Array.isArray(value.playlists)) return null;
  const tracksValid = value.tracks.every((track) => isRecord(track)
    && hasExactKeys(track, [
      'id', 'title', 'artist', 'mood', 'energy', 'durationSeconds', 'containsVocals',
    ])
    && typeof track.id === 'string' && UUID.test(track.id)
    && typeof track.title === 'string' && track.title.length > 0
    && typeof track.artist === 'string' && track.artist.length > 0
    && typeof track.mood === 'string' && track.mood.length > 0
    && isVersion(track.energy) && track.energy >= 1 && track.energy <= 5
    && isVersion(track.durationSeconds) && track.durationSeconds > 0
    && typeof track.containsVocals === 'boolean');
  const playlistsValid = value.playlists.every((playlist) => isRecord(playlist)
    && hasExactKeys(playlist, ['id', 'name', 'mood', 'trackIds'])
    && typeof playlist.id === 'string' && UUID.test(playlist.id)
    && typeof playlist.name === 'string' && playlist.name.length > 0
    && nullableString(playlist.mood)
    && Array.isArray(playlist.trackIds)
    && playlist.trackIds.every((trackId) => typeof trackId === 'string' && UUID.test(trackId)));
  return tracksValid && playlistsValid ? value as unknown as LiveMusicCatalogue : null;
};

export const parseProgramSourceAssignments = (value: unknown): ProgramSourceAssignments | null => {
  if (!isRecord(value) || Object.keys(value).length > PROGRAM_SOURCE_SLOTS.length) return null;
  const parsed: ProgramSourceAssignments = {};
  for (const [slot, sourceKey] of Object.entries(value)) {
    if (!isMember(PROGRAM_SOURCE_SLOTS, slot) || typeof sourceKey !== 'string'
      || !SOURCE_KEY.test(sourceKey)) return null;
    parsed[slot] = sourceKey;
  }
  const assignedSlots = Object.keys(parsed);
  const visualSlotCount = assignedSlots.filter((slot) => [
    'primary', 'host', 'guest_1', 'guest_2', 'guest_3',
    'pair', 'pool', 'pulse', 'odo', 'pip',
  ].includes(slot)).length;
  const publicStageSlotCount = assignedSlots.filter((slot) => [
    'host', 'guest_1', 'guest_2', 'guest_3',
  ].includes(slot)).length;
  if (visualSlotCount > LIVE_PROGRAM_VIDEO_SOURCE_LIMIT
    || publicStageSlotCount > LIVE_PUBLIC_STAGE_PUBLISHER_LIMIT) return null;
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
  const repeatMode = music.repeatMode ?? 'off';
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
    || music.volume < 0 || music.volume > 1
    || !isMember(LIVE_MUSIC_REPEAT_MODES, repeatMode)
    || !isVersion(music.stateVersion)
    || typeof audiencePulse.open !== 'boolean'
    || !isMember(['healthy', 'degraded'] as const, safety.status)
    || !isVersion(safety.activeHoldCount)) return null;
  return {
    ...value,
    program,
    sources: sources as ProgramSource[],
    music: { ...music, repeatMode },
  } as unknown as StudioOperationalSnapshot;
};
