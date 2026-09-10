import {
  PROGRAM_SCENES,
  parseProgramSource,
  parseProgramState,
} from '@betweener/live-program-domain';
import {
  LIVE_MUSIC_MOODS,
  ODO_CONTROL_SOURCES,
  ODO_PROGRAM_SOURCES,
  ODO_SHOW_ENERGY_MODES,
  ODO_SHOW_SCENES,
  ODO_SHOW_STATES,
  type OdoShowDirectorState,
  type OdoLiveProgramState,
  type LiveProgramSnapshotV2,
  type LiveMusicProgramState,
} from './odo-show-contracts.ts';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isMember = <T extends readonly string[]>(values: T, value: unknown): value is T[number] =>
  typeof value === 'string' && values.includes(value);
const nullableString = (value: unknown): value is string | null =>
  value === null || typeof value === 'string';
const nonNegativeInteger = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const hasExactKeys = (value: Record<string, unknown>, keys: readonly string[]): boolean => {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length
    && actual.every((key, index) => key === expected[index]);
};

const parseMusic = (music: unknown): LiveMusicProgramState | null => {
  if (!isRecord(music) || !hasExactKeys(music, [
    'enabled', 'status', 'trackId', 'playlistId', 'title', 'artist', 'mood',
    'volume', 'programStartedAt', 'playbackOffsetSeconds', 'stateVersion',
    'playbackAvailable',
  ]) || typeof music.enabled !== 'boolean'
    || !isMember(['stopped', 'playing', 'paused', 'ducked', 'fading'] as const, music.status)
    || !nullableString(music.trackId) || !nullableString(music.playlistId)
    || !nullableString(music.title) || !nullableString(music.artist)
    || !(music.mood === null || isMember(LIVE_MUSIC_MOODS, music.mood))
    || typeof music.volume !== 'number' || music.volume < 0 || music.volume > 1
    || !nullableString(music.programStartedAt)
    || typeof music.playbackOffsetSeconds !== 'number' || music.playbackOffsetSeconds < 0
    || !nonNegativeInteger(music.stateVersion)
    || typeof music.playbackAvailable !== 'boolean') return null;
  return music as LiveMusicProgramState;
};

export const parseOdoShowDirectorState = (
  value: unknown,
): { ok: true; value: OdoShowDirectorState } | { ok: false; reasonCode: string } => {
  if (!isRecord(value) || !hasExactKeys(value, [
    'schemaVersion', 'available', 'sessionId', 'enabled', 'showState',
    'currentScene', 'energyMode', 'programSource', 'controlSource',
    'pausedByHost', 'stateVersion', 'leaseGeneration', 'sceneEnteredAt',
    'hostSuppressionEndsAt', 'nextWakeAt', 'lastReasonCode',
    'unavailableReasonCode', 'metrics', 'music',
  ]) || value.schemaVersion !== 1
    || typeof value.available !== 'boolean' || typeof value.enabled !== 'boolean'
    || typeof value.sessionId !== 'string' || !UUID_PATTERN.test(value.sessionId)
    || !isMember(ODO_SHOW_STATES, value.showState)
    || !isMember(ODO_SHOW_SCENES, value.currentScene)
    || !isMember(ODO_SHOW_ENERGY_MODES, value.energyMode)
    || !isMember(ODO_PROGRAM_SOURCES, value.programSource)
    || !isMember(ODO_CONTROL_SOURCES, value.controlSource)
    || typeof value.pausedByHost !== 'boolean'
    || !nonNegativeInteger(value.stateVersion) || !nonNegativeInteger(value.leaseGeneration)
    || !nullableString(value.sceneEnteredAt) || !nullableString(value.hostSuppressionEndsAt)
    || !nullableString(value.nextWakeAt) || !nullableString(value.lastReasonCode)
    || !nullableString(value.unavailableReasonCode)
    || !isRecord(value.metrics) || !hasExactKeys(value.metrics, [
      'participants', 'audience', 'waitingPeople', 'activePairs', 'completedRounds',
    ]) || !isRecord(value.music)) {
    return { ok: false, reasonCode: 'odo_show_state_invalid' };
  }
  for (const metric of ['participants', 'audience', 'waitingPeople', 'activePairs', 'completedRounds']) {
    if (!nonNegativeInteger(value.metrics[metric])) {
      return { ok: false, reasonCode: 'odo_show_metrics_invalid' };
    }
  }
  if (!parseMusic(value.music)) {
    return { ok: false, reasonCode: 'odo_music_state_invalid' };
  }
  return { ok: true, value: value as OdoShowDirectorState };
};

export const parseOdoLiveProgramState = (
  value: unknown,
): { ok: true; value: OdoLiveProgramState } | { ok: false; reasonCode: string } => {
  if (!isRecord(value) || !hasExactKeys(value, [
    'schemaVersion', 'sessionId', 'enabled', 'showState', 'currentScene',
    'energyMode', 'programSource', 'stateVersion', 'nextWakeAt', 'music',
  ]) || value.schemaVersion !== 1
    || typeof value.sessionId !== 'string' || !UUID_PATTERN.test(value.sessionId)
    || typeof value.enabled !== 'boolean'
    || !isMember(ODO_SHOW_STATES, value.showState)
    || !isMember(ODO_SHOW_SCENES, value.currentScene)
    || !isMember(ODO_SHOW_ENERGY_MODES, value.energyMode)
    || !isMember(ODO_PROGRAM_SOURCES, value.programSource)
    || !nonNegativeInteger(value.stateVersion)
    || !nullableString(value.nextWakeAt)
    || !parseMusic(value.music)) {
    return { ok: false, reasonCode: 'odo_live_program_state_invalid' };
  }
  return { ok: true, value: value as OdoLiveProgramState };
};

export const parseLiveProgramSnapshotV2 = (
  value: unknown,
): { ok: true; value: LiveProgramSnapshotV2 } | { ok: false; reasonCode: string } => {
  if (!isRecord(value) || !hasExactKeys(value, [
    'schemaVersion', 'sessionId', 'enabled', 'showState', 'currentScene',
    'energyMode', 'programSource', 'stateVersion', 'nextWakeAt', 'music',
    'program', 'sources',
  ]) || value.schemaVersion !== 2
    || !isMember(PROGRAM_SCENES, value.currentScene)
    || !Array.isArray(value.sources)) {
    return { ok: false, reasonCode: 'live_program_v2_invalid' };
  }
  const legacy = parseOdoLiveProgramState({
    schemaVersion: 1,
    sessionId: value.sessionId,
    enabled: value.enabled,
    showState: value.showState,
    currentScene: isMember(ODO_SHOW_SCENES, value.currentScene)
      ? value.currentScene : 'host_focus',
    energyMode: value.energyMode,
    programSource: value.programSource,
    stateVersion: value.stateVersion,
    nextWakeAt: value.nextWakeAt,
    music: value.music,
  });
  const program = parseProgramState(value.program);
  const sources = value.sources.map(parseProgramSource);
  if (legacy.ok === false || !program || sources.some((source) => !source)
    || program.sessionId !== legacy.value.sessionId
    || program.scene !== value.currentScene) {
    return { ok: false, reasonCode: 'live_program_v2_invalid' };
  }
  return {
    ok: true,
    value: {
      ...legacy.value,
      schemaVersion: 2,
      currentScene: value.currentScene,
      program,
      sources: sources as NonNullable<(typeof sources)[number]>[],
    },
  };
};
