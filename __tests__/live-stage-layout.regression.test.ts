import assert from 'node:assert/strict';
import test from 'node:test';

import {
  composeLiveStageSeats,
  countConnectedLiveParticipants,
  deduplicateLiveStageCandidates,
  liveStageTilePlacement,
  orderLiveStageCandidates,
  selectLiveStageCandidates,
  type LiveStageCandidate,
} from '../features/live/stage/live-stage-layout.ts';

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
