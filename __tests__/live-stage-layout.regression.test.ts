import assert from 'node:assert/strict';
import test from 'node:test';

import {
  composeLiveStageSeats,
  countConnectedLiveParticipants,
  deduplicateLiveStageCandidates,
  liveStageTilePlacement,
  liveStageTilePlacementForViewport,
  orderLiveStageCandidates,
  selectLivePictureInPictureCandidate,
  selectLiveStageCandidates,
  type LiveStageCandidate,
} from '../features/live/stage/live-stage-layout.ts';
import { resolveLivePictureInPictureProgramSource } from '../features/live/stage/live-picture-in-picture.ts';
import type { ProgramSource, ProgramState } from '@betweener/live-program-domain';
import {
  initialLiveRoomPulseMode,
  resolveLiveRoomPulseHeight,
} from '../features/live/stage/live-broadcast-viewport.ts';
import {
  LIVE_SPEAKER_ACQUIRE_DELAY_MS,
  LIVE_SPEAKER_MINIMUM_HOLD_MS,
  LIVE_SPEAKER_RELEASE_DELAY_MS,
  LIVE_SPEAKER_SWITCH_DELAY_MS,
  planLiveSpeakerFocus,
  selectLeadingLiveSpeaker,
} from '../features/live/stage/live-speaker-focus.ts';

const candidate = (
  userId: string,
  sessionId: string,
  overrides: Partial<LiveStageCandidate<string>> = {},
): LiveStageCandidate<string> => ({
  participant: sessionId,
  userId,
  sessionId,
  isLocalParticipant: false,
  isSpeaking: false,
  hasVideo: false,
  hasAudio: false,
  ...overrides,
});

test('stage composition keeps one deterministic RTC session per user', () => {
  const result = deduplicateLiveStageCandidates([
    candidate('host', 'remote-video', { hasVideo: true }),
    candidate('host', 'local-session', { isLocalParticipant: true }),
    candidate('guest', 'guest-muted'),
  ]);

  assert.deepEqual(result.map((item) => item.sessionId), ['local-session', 'guest-muted']);
});

test('room headcount deduplicates reconnects and multiple devices by user identity', () => {
  const count = countConnectedLiveParticipants([
    candidate('host', 'host-phone', { isLocalParticipant: true }),
    candidate('host', 'host-tablet', { hasVideo: true }),
    candidate('guest', 'guest-phone', { hasVideo: true }),
    candidate('', 'invalid-session'),
  ]);

  assert.equal(count, 2);
});

test('PiP chooses one deterministic remote active camera without exposing the whole Live UI', () => {
  const selected = selectLivePictureInPictureCandidate([
    candidate('local-host', 'local', { isLocalParticipant: true, hasVideo: true }),
    candidate('quiet-guest', 'quiet', { hasVideo: true }),
    candidate('speaker', 'speaking', { hasVideo: true, isSpeaking: true }),
  ]);

  assert.equal(selected?.userId, 'speaker');
});

test('PiP follows a speaking local host instead of a passive remote camera', () => {
  const selected = selectLivePictureInPictureCandidate([
    candidate('local-host', 'local', {
      isLocalParticipant: true,
      hasVideo: true,
      isSpeaking: true,
    }),
    candidate('quiet-guest', 'quiet', { hasVideo: true }),
  ]);

  assert.equal(selected?.userId, 'local-host');
});

test('PiP falls back to the local camera when no remote publisher is connected', () => {
  const selected = selectLivePictureInPictureCandidate([
    candidate('local-host', 'local', { isLocalParticipant: true, hasVideo: true }),
  ]);

  assert.equal(selected?.sessionId, 'local');
});

test('private conversation PiP keeps the other person visible while the local member speaks', () => {
  const selected = selectLivePictureInPictureCandidate([
    candidate('local-member', 'local', {
      isLocalParticipant: true,
      hasVideo: true,
      isSpeaking: true,
    }),
    candidate('private-partner', 'remote', { hasVideo: true }),
  ], { preferRemote: true });

  assert.equal(selected?.userId, 'private-partner');
});

test('Studio PiP follows explicit programme intent before the primary screen source', () => {
  const program: ProgramState = {
    schemaVersion: 1,
    sessionId: 'live-session',
    scene: 'screen_plus_host',
    targetCanvas: 'portrait_9_16',
    sourceAssignments: { pip: 'host', primary: 'screen', host: 'host' },
    transition: 'cut',
    fallbackScene: 'host_focus',
    programVersion: 3,
    showStateVersion: 2,
    controller: {
      source: 'studio_host',
      userId: 'host-user',
      instanceId: 'studio-1',
      generation: 1,
      leaseExpiresAt: null,
    },
    updatedAt: '2026-09-13T12:00:00.000Z',
  };
  const source = (
    key: string,
    providerUserId: string,
    type: ProgramSource['type'],
  ): ProgramSource => ({
    id: key,
    key,
    type,
    role: 'visual',
    ownerUserId: null,
    providerUserId,
    hasVideo: true,
    hasAudio: false,
    readiness: 'live',
    health: 'healthy',
    muted: false,
    failureReasonCode: null,
    generation: 1,
    version: 1,
    lastSeenAt: program.updatedAt,
  });

  assert.deepEqual(resolveLivePictureInPictureProgramSource(program, [
    source('screen', 'studio-screen', 'screen_share'),
    source('host', 'host-user', 'host_camera'),
  ]), {
    providerUserId: 'host-user',
    trackType: 'videoTrack',
    fit: 'cover',
  });

  assert.deepEqual(resolveLivePictureInPictureProgramSource({
    ...program,
    sourceAssignments: { primary: 'screen', host: 'host' },
  }, [
    source('screen', 'studio-screen', 'screen_share'),
    source('host', 'host-user', 'host_camera'),
  ]), {
    providerUserId: 'studio-screen',
    trackType: 'screenShareTrack',
    fit: 'contain',
  });
});

test('stage composition prioritizes host and authoritative stage slots', () => {
  const result = orderLiveStageCandidates([
    candidate('guest-b', 'b'),
    candidate('host', 'h'),
    candidate('guest-a', 'a'),
  ], [
    { userId: 'guest-a', role: 'participant', stageSlot: 2 },
    { userId: 'host', role: 'host', stageSlot: 1 },
    { userId: 'guest-b', role: 'participant', stageSlot: 3 },
  ]);

  assert.deepEqual(result.map((item) => item.userId), ['host', 'guest-a', 'guest-b']);
});

test('stage composition excludes RTC audience sessions', () => {
  const result = selectLiveStageCandidates([
    candidate('host', 'host-session', { hasVideo: true }),
    candidate('audience', 'audience-session', { hasVideo: true }),
  ], [
    { userId: 'host', role: 'host', stageSlot: 1 },
  ], null);

  assert.deepEqual(result.map((item) => item.userId), ['host']);
});

test('stage composition permits only the authorized local publisher during snapshot synchronization', () => {
  const result = selectLiveStageCandidates([
    candidate('host', 'host-session', { isLocalParticipant: true }),
    candidate('audience', 'audience-session'),
  ], [], 'host');

  assert.deepEqual(result.map((item) => item.userId), ['host']);
});

test('authoritative camera-off stage members render before an RTC participant exists', () => {
  const seats = composeLiveStageSeats([
    candidate('guest', 'guest-session', { hasVideo: true }),
  ], [
    { userId: 'host', role: 'host', stageSlot: 1 },
    { userId: 'guest', role: 'participant', stageSlot: 2 },
  ], null);

  assert.deepEqual(seats.map((seat) => ({
    userId: seat.userId,
    hasRtcParticipant: seat.candidate !== null,
  })), [
    { userId: 'host', hasRtcParticipant: false },
    { userId: 'guest', hasRtcParticipant: true },
  ]);
});

test('stage layouts are deterministic for one through four publishers', () => {
  assert.deepEqual([liveStageTilePlacement(1, 0)], ['single']);
  assert.deepEqual(
    [0, 1].map((index) => liveStageTilePlacement(2, index)),
    ['dual-left', 'dual-right'],
  );
  assert.deepEqual(
    [0, 1, 2].map((index) => liveStageTilePlacement(3, index)),
    ['trio-lead', 'trio-bottom-left', 'trio-bottom-right'],
  );
  assert.deepEqual(
    [0, 1, 2, 3].map((index) => liveStageTilePlacement(4, index)),
    ['quad-top-left', 'quad-top-right', 'quad-bottom-left', 'quad-bottom-right'],
  );
});

test('three-person stage protects portrait faces on a tall phone canvas', () => {
  assert.deepEqual(
    [0, 1, 2].map((index) => liveStageTilePlacementForViewport(3, index, 390, 520)),
    ['trio-lead-left', 'trio-top-right', 'trio-bottom-right-portrait'],
  );
  assert.deepEqual(
    [0, 1, 2].map((index) => liveStageTilePlacementForViewport(3, index, 390, 300)),
    ['trio-lead-left', 'trio-top-right', 'trio-bottom-right-portrait'],
  );
  assert.deepEqual(
    [0, 1, 2].map((index) => liveStageTilePlacementForViewport(3, index, 720, 390)),
    ['trio-lead', 'trio-bottom-left', 'trio-bottom-right'],
  );
});

test('Room Pulse snap points preserve Stage space on compact and tall phones', () => {
  assert.equal(initialLiveRoomPulseMode(390, 667), 'peek');
  assert.equal(initialLiveRoomPulseMode(390, 844), 'peek');
  assert.equal(initialLiveRoomPulseMode(390, 844, true), 'standard');
  assert.equal(initialLiveRoomPulseMode(844, 390), 'peek');

  assert.equal(resolveLiveRoomPulseHeight(667, 'peek'), 66);
  assert.ok(Math.abs(resolveLiveRoomPulseHeight(844, 'standard') - 198.34) < 0.0001);
  assert.equal(resolveLiveRoomPulseHeight(844, 'expanded'), 371.36);
  assert.equal(resolveLiveRoomPulseHeight(1200, 'expanded'), 400);
});

test('Live speaker direction is sticky, delayed, and release-safe', () => {
  const signals = [
    { userId: 'host', hasAudio: true, isSpeaking: true },
    { userId: 'guest', hasAudio: true, isSpeaking: true },
  ];
  assert.equal(selectLeadingLiveSpeaker(signals, 'guest'), 'guest');
  assert.equal(selectLeadingLiveSpeaker(signals, null), 'host');
  assert.equal(selectLeadingLiveSpeaker([
    { userId: 'muted', hasAudio: false, isSpeaking: true },
  ], null), null);

  assert.deepEqual(planLiveSpeakerFocus({
    focusedUserId: null,
    focusedAt: 0,
    leadingSpeakerUserId: 'host',
    now: 1_000,
  }), { targetUserId: 'host', delayMs: LIVE_SPEAKER_ACQUIRE_DELAY_MS });

  assert.deepEqual(planLiveSpeakerFocus({
    focusedUserId: 'host',
    focusedAt: 1_000,
    leadingSpeakerUserId: 'guest',
    now: 1_400,
  }), {
    targetUserId: 'guest',
    delayMs: LIVE_SPEAKER_MINIMUM_HOLD_MS - 400,
  });

  assert.deepEqual(planLiveSpeakerFocus({
    focusedUserId: 'host',
    focusedAt: 1_000,
    leadingSpeakerUserId: 'guest',
    now: 5_000,
  }), { targetUserId: 'guest', delayMs: LIVE_SPEAKER_SWITCH_DELAY_MS });

  assert.deepEqual(planLiveSpeakerFocus({
    focusedUserId: 'host',
    focusedAt: 1_000,
    leadingSpeakerUserId: null,
    now: 5_000,
  }), { targetUserId: null, delayMs: LIVE_SPEAKER_RELEASE_DELAY_MS });
});
