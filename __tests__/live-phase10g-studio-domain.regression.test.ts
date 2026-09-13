import assert from 'node:assert/strict';
import test from 'node:test';

import {
  LIVE_PROGRAM_VIDEO_SOURCE_LIMIT,
  LIVE_PUBLIC_STAGE_PUBLISHER_LIMIT,
  LIVE_STUDIO_VISUAL_PUBLISHER_RESERVE,
  PROGRAM_SCENES,
  buildStudioTakeCommand,
  chooseFallbackScene,
  isStudioPresentationScene,
  parseProgramSourceAssignments,
  parseProgramState,
  parseLiveMusicCatalogue,
  previewFromProgram,
  reduceProgramPreview,
  requiredSlotsForScene,
  resolveAssignedProgramLayout,
  resolveProgramLayout,
  visualSlotsForScene,
  type ProgramSource,
  type ProgramState,
} from '../packages/live-program-domain/src/index.ts';
import {
  assignmentsContainTerminalSource,
  assignmentsForScene,
  isProgramSourceUsable,
} from '../apps/studio/src/program/source-assignments.ts';
import { parseLiveProgramSnapshotV2 } from '../features/live/odo/show/odo-show-validation.ts';
import { parseLiveStageAtmosphere } from '../features/live/stage/live-stage-atmosphere.ts';

const sessionId = '11111111-1111-4111-8111-111111111111';
const controllerInstanceId = '22222222-2222-4222-8222-222222222222';
const sourceId = '33333333-3333-4333-8333-333333333333';

const program: ProgramState = {
  schemaVersion: 1,
  sessionId,
  scene: 'host_focus',
  targetCanvas: 'portrait_9_16',
  sourceAssignments: { host: 'server.host' },
  transition: 'auto',
  fallbackScene: 'host_focus',
  programVersion: 7,
  showStateVersion: 12,
  controller: {
    source: 'studio_host',
    userId: null,
    instanceId: null,
    generation: 4,
    leaseExpiresAt: '2026-09-10T12:00:00.000Z',
  },
  updatedAt: '2026-09-10T11:59:45.000Z',
};

const source: ProgramSource = {
  id: sourceId,
  key: 'server.host',
  type: 'host_camera',
  role: 'visual',
  ownerUserId: null,
  providerUserId: sessionId,
  hasVideo: true,
  hasAudio: false,
  readiness: 'live',
  health: 'healthy',
  muted: false,
  failureReasonCode: null,
  generation: 1,
  version: 2,
  lastSeenAt: '2026-09-10T11:59:45.000Z',
};

const music = {
  enabled: false,
  status: 'stopped',
  trackId: null,
  playlistId: null,
  title: null,
  artist: null,
  mood: null,
  volume: 0,
  programStartedAt: null,
  playbackOffsetSeconds: 0,
  stateVersion: 0,
  playbackAvailable: false,
};

test('10G presentation scenes have deterministic source requirements and layouts', () => {
  assert.equal(LIVE_PUBLIC_STAGE_PUBLISHER_LIMIT, 4);
  assert.equal(LIVE_STUDIO_VISUAL_PUBLISHER_RESERVE, 1);
  assert.equal(LIVE_PROGRAM_VIDEO_SOURCE_LIMIT, 5);
  for (const scene of [
    'screen_full', 'screen_plus_host', 'screen_plus_pair', 'screen_plus_panel',
    'screen_discussion', 'screen_plus_pool', 'screen_plus_audience_pulse',
    'screen_plus_odo', 'dj_plus_pool',
  ] as const) {
    assert.equal(PROGRAM_SCENES.includes(scene), true);
    assert.equal(isStudioPresentationScene(scene), true);
    assert.ok(resolveProgramLayout(scene, 'landscape_16_9').regions.length > 0);
    assert.ok(requiredSlotsForScene(scene).length > 0);
  }
  assert.equal(isStudioPresentationScene('host_focus'), false);
  assert.deepEqual(requiredSlotsForScene('screen_plus_host'), ['primary', 'host']);
  assert.equal(resolveProgramLayout('screen_plus_host', 'portrait_9_16').regions[1]?.treatment, 'pip');
  assert.equal(resolveProgramLayout('screen_plus_panel', 'landscape_16_9').regions.length, 5);
});

test('Screen Discussion only renders assigned people and divides the stage evenly', () => {
  const hostOnly = resolveAssignedProgramLayout(
    'screen_discussion', 'portrait_9_16', { primary: 'studio:screen', host: 'server.host' },
  );
  assert.deepEqual(hostOnly.regions.map((region) => region.slot), ['primary', 'host']);
  assert.deepEqual(
    { x: hostOnly.regions[1]?.x, width: hostOnly.regions[1]?.width },
    { x: 0, width: 1 },
  );

  const discussion = resolveAssignedProgramLayout('screen_discussion', 'portrait_9_16', {
    primary: 'studio:screen', host: 'server.host', guest_1: 'participant.guest',
  });
  assert.deepEqual(discussion.regions.map((region) => region.slot), ['primary', 'host', 'guest_1']);
  assert.equal(discussion.regions[1]?.width, 0.5);
  assert.equal(discussion.regions[2]?.x, 0.5);
  assert.equal(discussion.regions[0]?.height, 0.44);
  assert.ok(Math.abs((discussion.regions[1]?.height ?? 0) - 0.56) < 0.0001);
  assert.deepEqual(visualSlotsForScene('screen_discussion'), [
    'primary', 'host', 'guest_1', 'guest_2', 'guest_3',
  ]);

  const fullPanel = resolveAssignedProgramLayout('screen_discussion', 'portrait_9_16', {
    primary: 'studio:screen', host: 'server.host', guest_1: 'participant.one',
    guest_2: 'participant.two', guest_3: 'participant.three',
  });
  const expectedPanel = [
    { x: 0, y: 0.44, width: 0.5, height: 0.28 },
    { x: 0.5, y: 0.44, width: 0.5, height: 0.28 },
    { x: 0, y: 0.72, width: 0.5, height: 0.28 },
    { x: 0.5, y: 0.72, width: 0.5, height: 0.28 },
  ];
  fullPanel.regions.slice(1).forEach((region, index) => {
    const expected = expectedPanel[index];
    assert.ok(expected);
    (['x', 'y', 'width', 'height'] as const).forEach((key) => {
      assert.ok(Math.abs(region[key] - expected[key]) < 0.0001);
    });
  });
});

test('portrait screen-share scenes cover the full Stage without dead bands', () => {
  const full = resolveProgramLayout('screen_full', 'portrait_9_16').regions;
  assert.deepEqual(
    full.map(({ x, y, width, height }) => ({ x, y, width, height })),
    [{ x: 0, y: 0, width: 1, height: 1 }],
  );

  for (const scene of ['screen_plus_pair', 'screen_plus_pool', 'screen_plus_audience_pulse'] as const) {
    const regions = resolveProgramLayout(scene, 'portrait_9_16').regions;
    const [screen, supporting] = regions;
    assert.deepEqual(
      { x: screen?.x, y: screen?.y, width: screen?.width, height: screen?.height },
      { x: 0, y: 0, width: 1, height: 0.68 },
    );
    assert.deepEqual(
      { x: supporting?.x, y: supporting?.y, width: supporting?.width },
      { x: 0, y: 0.68, width: 1 },
    );
    assert.ok(Math.abs((supporting?.height ?? 0) - 0.32) < 0.0001);
    assert.ok(Math.abs((screen?.height ?? 0) + (supporting?.height ?? 0) - 1) < 0.0001);
  }

  const withHost = resolveProgramLayout('screen_plus_host', 'portrait_9_16').regions;
  assert.deepEqual(
    { x: withHost[0]?.x, y: withHost[0]?.y, width: withHost[0]?.width, height: withHost[0]?.height },
    { x: 0, y: 0, width: 1, height: 1 },
  );
  assert.equal(withHost[1]?.treatment, 'pip');
});

test('Screen Discussion auto-assigns distinct on-stage cameras', () => {
  const hostUserId = '44444444-4444-4444-8444-444444444444';
  const guestOneId = '55555555-5555-4555-8555-555555555555';
  const guestTwoId = '66666666-6666-4666-8666-666666666666';
  const makeSource = (
    key: string,
    type: ProgramSource['type'],
    ownerUserId: string | null,
  ): ProgramSource => ({
    ...source,
    id: `${key}.id`,
    key,
    type,
    ownerUserId,
    providerUserId: ownerUserId,
  });
  const assignments = assignmentsForScene('screen_discussion', [
    makeSource('studio:screen', 'screen_share', hostUserId),
    makeSource('studio:screen_audio', 'screen_share_audio', hostUserId),
    makeSource('server.host', 'host_camera', hostUserId),
    makeSource('participant.host', 'participant_camera', hostUserId),
    makeSource('participant.guest1', 'participant_camera', guestOneId),
    makeSource('participant.guest2', 'participant_camera', guestTwoId),
  ], {});

  assert.deepEqual(assignments, {
    primary: 'studio:screen',
    host: 'server.host',
    guest_1: 'participant.guest1',
    guest_2: 'participant.guest2',
    audio_screen: 'studio:screen_audio',
  });
});

test('Preview is local and TAKE carries both fencing versions', () => {
  const initial = previewFromProgram(program);
  const changed = reduceProgramPreview(initial, { type: 'select_scene', scene: 'screen_full' });
  const assigned = reduceProgramPreview(changed, {
    type: 'assign_source', slot: 'primary', sourceKey: 'studio:abc:screen_share',
  });
  assert.equal(program.scene, 'host_focus');
  assert.equal(assigned.dirty, true);
  const command = buildStudioTakeCommand({
    commandId: sourceId,
    sessionId,
    controllerInstanceId,
    preview: assigned,
    cut: true,
  });
  assert.equal(command.expectedProgramVersion, 7);
  assert.equal(command.expectedControllerGeneration, 4);
  assert.equal(command.transition, 'cut');
  assert.equal(command.sourceAssignments.primary, 'studio:abc:screen_share');
});

test('contracts reject unknown source slots, invalid source keys and malformed Program state', () => {
  assert.equal(parseProgramSourceAssignments({ primary: 'studio:abc:screen_share' })?.primary,
    'studio:abc:screen_share');
  assert.equal(parseProgramSourceAssignments({ privateSpark: 'server.host' }), null);
  assert.equal(parseProgramSourceAssignments({ primary: '../../secret' }), null);
  assert.equal(parseProgramState({ ...program, programVersion: -1 }), null);
  assert.equal(parseProgramState({ ...program, scene: 'arbitrary_layout' }), null);
});

test('audience Program v2 is exact, source-safe and tied to one session', () => {
  const snapshot = {
    schemaVersion: 2,
    sessionId,
    enabled: true,
    showState: 'paused_by_host',
    currentScene: 'host_focus',
    energyMode: 'social',
    programSource: 'studio',
    stateVersion: 12,
    nextWakeAt: null,
    music,
    program,
    sources: [source],
  };
  assert.equal(parseLiveProgramSnapshotV2(snapshot).ok, true);
  assert.equal(parseLiveProgramSnapshotV2({ ...snapshot, compatibilityEdges: [] }).ok, false);
  assert.equal(parseLiveProgramSnapshotV2({
    ...snapshot,
    program: { ...program, sessionId: controllerInstanceId },
  }).ok, false);
});

test('source loss always has a deterministic safe fallback', () => {
  assert.equal(chooseFallbackScene('screen_full', true), 'host_focus');
  assert.equal(chooseFallbackScene('screen_full', false), 'branded_intermission');
  assert.equal(chooseFallbackScene('dj_plus_pool', false), 'pool_focus');
});

test('terminal browser sources are removed from active Preview choices', () => {
  const endedScreen: ProgramSource = {
    ...source,
    id: 'screen-ended',
    key: 'studio:screen',
    type: 'screen_share',
    readiness: 'ended',
    health: 'lost',
  };
  assert.equal(isProgramSourceUsable(endedScreen), false);
  assert.equal(assignmentsContainTerminalSource(
    { primary: endedScreen.key },
    [source, endedScreen],
  ), true);
  assert.equal(assignmentsForScene('screen_full', [endedScreen], {}).primary, undefined);
});

test('Programme Music catalogue validation rejects storage and malformed track data', () => {
  const catalogue = {
    schemaVersion: 1,
    canManageLibrary: true,
    tracks: [{
      id: sourceId,
      title: 'Where Worlds Apart Feel Closer',
      artist: 'Betweener',
      mood: 'warm',
      energy: 2,
      durationSeconds: 180,
      containsVocals: true,
    }],
    playlists: [{ id: controllerInstanceId, name: 'Welcome', mood: 'warm', trackIds: [sourceId] }],
  };
  assert.deepEqual(parseLiveMusicCatalogue(catalogue), catalogue);
  assert.equal(parseLiveMusicCatalogue({
    ...catalogue,
    tracks: [{ ...catalogue.tracks[0], storagePath: '../../private.mp3' }],
  }), null);
  assert.equal(parseLiveMusicCatalogue({
    ...catalogue,
    tracks: [{ ...catalogue.tracks[0], durationSeconds: -1 }],
  }), null);
});

test('Stage Atmosphere validation is exact and keeps poster state participant-safe', () => {
  const atmosphere = {
    schemaVersion: 1,
    sessionId,
    preset: 'live_poster',
    posterPath: `${sessionId}/poster.jpg`,
    hasPoster: true,
    version: 4,
    updatedAt: '2026-09-12T12:00:00.000Z',
  } as const;
  assert.deepEqual(parseLiveStageAtmosphere(atmosphere), atmosphere);
  assert.equal(parseLiveStageAtmosphere({ ...atmosphere, updatedByUserId: sourceId }), null);
  assert.equal(parseLiveStageAtmosphere({ ...atmosphere, preset: 'custom_url' }), null);
});
