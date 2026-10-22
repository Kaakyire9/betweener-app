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
import {
  ADAPTIVE_STAGE_LAYOUT_RESOLVER_VERSION,
  ADAPTIVE_STAGE_MANIFEST_VERSION,
  isNormalizedRect,
  type LayoutPlanV2,
  type NormalizedRect,
} from './adaptive-stage-v2.ts';

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
    'primary', 'host', 'guest_1', 'guest_2', 'guest_3', 'guest_4', 'guest_5',
    'pair', 'pool', 'pulse', 'odo', 'pip',
  ].includes(slot)).length;
  const publicStageSlotCount = assignedSlots.filter((slot) => [
    'host', 'guest_1', 'guest_2', 'guest_3', 'guest_4', 'guest_5',
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

export const parseProgramSources = (value: unknown): ProgramSource[] | null => {
  if (!Array.isArray(value)) return null;
  const parsed = value.map(parseProgramSource);
  return parsed.some((source) => source === null) ? null : parsed as ProgramSource[];
};

const parseNormalizedRect = (value: unknown): NormalizedRect | null => {
  if (!isRecord(value)
    || !['x', 'y', 'width', 'height'].every((key) => typeof value[key] === 'number')) return null;
  const rect = value as NormalizedRect;
  return isNormalizedRect(rect) ? rect : null;
};

export const parseLayoutPlanV2 = (value: unknown): LayoutPlanV2 | null => {
  if (!isRecord(value) || value.schemaVersion !== 2
    || value.manifestVersion !== ADAPTIVE_STAGE_MANIFEST_VERSION
    || value.resolverVersion !== ADAPTIVE_STAGE_LAYOUT_RESOLVER_VERSION
    || typeof value.sessionId !== 'string' || !UUID.test(value.sessionId)
    || !isVersion(value.programVersion) || !isVersion(value.sourceGraphVersion)
    || !isMember(PROGRAM_SCENES, value.scene)
    || !isMember(PROGRAM_TARGET_CANVASES, value.canvas)
    || !isRecord(value.viewport) || typeof value.viewport.width !== 'number'
    || typeof value.viewport.height !== 'number'
    || value.viewport.width <= 0 || value.viewport.height <= 0
    || !Array.isArray(value.regions) || !Array.isArray(value.audio)
    || !Array.isArray(value.subscriptions) || !isRecord(value.fallback)
    || typeof value.planHash !== 'string' || !/^[0-9a-f]{8}$/.test(value.planHash)
    || typeof value.generatedAt !== 'string') return null;
  const regionsValid = value.regions.every((item) => {
    if (!isRecord(item) || typeof item.id !== 'string'
      || !isMember(PROGRAM_SOURCE_SLOTS, item.slot)
      || typeof item.sourceKey !== 'string' || !SOURCE_KEY.test(item.sourceKey)
      || !nullableString(item.ownerUserId)
      || !isMember(['camera', 'screen', 'generated', 'none'] as const, item.track)
      || !parseNormalizedRect(item.rect)
      || !isVersion(item.zIndex)
      || !isMember(['contain', 'cover', 'smart_crop'] as const, item.fit)
      || !(item.focalPoint === null || (isRecord(item.focalPoint)
        && typeof item.focalPoint.x === 'number' && item.focalPoint.x >= 0 && item.focalPoint.x <= 1
        && typeof item.focalPoint.y === 'number' && item.focalPoint.y >= 0 && item.focalPoint.y <= 1))
      || !(item.labelSafeRect === null || parseNormalizedRect(item.labelSafeRect))
      || !(item.captionExclusionRect === null || parseNormalizedRect(item.captionExclusionRect))
      || typeof item.transitionKey !== 'string'
      || !isMember(['healthy', 'degraded', 'lost'] as const, item.health)
      || !nullableString(item.fallbackReason)) return false;
    return true;
  });
  const audioValid = value.audio.every((item) => isRecord(item)
    && typeof item.sourceKey === 'string' && SOURCE_KEY.test(item.sourceKey)
    && isMember(['speech', 'screen', 'music', 'atmosphere'] as const, item.role)
    && typeof item.gain === 'number' && item.gain >= 0 && item.gain <= 1
    && typeof item.duckable === 'boolean');
  const subscriptionsValid = value.subscriptions.every((item) => isRecord(item)
    && typeof item.ownerUserId === 'string' && item.ownerUserId.length > 0
    && isMember(['camera', 'screen'] as const, item.track)
    && isMember(['off', 'low', 'medium', 'high'] as const, item.desiredQuality));
  if (!regionsValid || !audioValid || !subscriptionsValid
    || typeof value.fallback.active !== 'boolean'
    || !nullableString(value.fallback.reason)
    || !(value.fallback.fromScene === null || isMember(PROGRAM_SCENES, value.fallback.fromScene))) {
    return null;
  }
  return value as unknown as LayoutPlanV2;
};

export const parseStudioOperationalSnapshot = (value: unknown): StudioOperationalSnapshot | null => {
  if (!isRecord(value) || value.schemaVersion !== 1 || typeof value.serverNow !== 'string'
    || !isRecord(value.access) || !isRecord(value.session)
    || !isRecord(value.program) || !Array.isArray(value.sources)
    || !isRecord(value.show) || !isRecord(value.quickConnect)
    || !isRecord(value.odo) || !isRecord(value.music)
    || !isRecord(value.audiencePulse) || !isRecord(value.safety)) return null;
  const program = parseProgramState(value.program);
  const sources = parseProgramSources(value.sources);
  const access = value.access;
  const session = value.session;
  const show = value.show;
  const quickConnect = value.quickConnect;
  const odo = value.odo;
  const music = value.music;
  const audiencePulse = value.audiencePulse;
  const safety = value.safety;
  const repeatMode = music.repeatMode ?? 'off';
  if (!program || !sources
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
    sources,
    music: { ...music, repeatMode },
  } as unknown as StudioOperationalSnapshot;
};
