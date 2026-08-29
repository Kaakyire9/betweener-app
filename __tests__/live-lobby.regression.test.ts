import assert from 'node:assert/strict';
import test from 'node:test';
import type { LiveSessionSummary } from '../features/live/application/live-models.ts';
import { getLiveSessionPhase, partitionLiveLobbySessions } from '../features/live/application/live-lobby.ts';

const session = (
  id: string,
  status: LiveSessionSummary['status'],
  createdByProfileId: string,
): LiveSessionSummary => ({
  id,
  title: id,
  description: null,
  format: 'hosted_match_night',
  status,
  contextType: 'global',
  contextId: null,
  circleId: null,
  createdByProfileId,
  scheduledStart: '2026-08-25T18:00:00.000Z',
  scheduledEnd: null,
  startedAt: status === 'live' ? '2026-08-25T18:00:00.000Z' : null,
  endedAt: status === 'ended' ? '2026-08-25T20:00:00.000Z' : null,
  posterPath: null,
  teaserVideoPath: null,
  teaserDurationSeconds: null,
  maximumPublishers: 4,
  rsvpStatus: 'none',
  participantState: 'invited',
  audienceCount: 2,
  stageCount: 1,
  reservationCount: 3,
  totalAttendeeCount: status === 'ended' ? 14 : 0,
  matchesMadeCount: status === 'ended' ? 2 : 0,
});

const sessions = [
  session('owned-live', 'live', 'host-profile'),
  session('other-live', 'live', 'other-host'),
  session('owned-scheduled', 'scheduled', 'host-profile'),
  session('other-scheduled', 'scheduled', 'other-host'),
];

test('host lobby separates owned rooms from public discovery without duplication', () => {
  const result = partitionLiveLobbySessions(sessions, 'host-profile', true);
  assert.equal(result.hasHostLobby, true);
  assert.deepEqual(result.owned.map(({ id }) => id), ['owned-live', 'owned-scheduled']);
  assert.deepEqual(result.liveNow.map(({ id }) => id), ['other-live']);
  assert.deepEqual(result.upcoming.map(({ id }) => id), ['other-scheduled']);
});

test('an existing room owner retains the host lobby even if scheduling eligibility changes', () => {
  const result = partitionLiveLobbySessions(sessions, 'host-profile', false);
  assert.equal(result.hasHostLobby, true);
  assert.equal(result.owned.length, 2);
});

test('guest lobby shows every live and scheduled room without host controls', () => {
  const result = partitionLiveLobbySessions(sessions, 'guest-profile', false);
  assert.equal(result.hasHostLobby, false);
  assert.equal(result.owned.length, 0);
  assert.deepEqual(result.liveNow.map(({ id }) => id), ['owned-live', 'other-live']);
  assert.deepEqual(result.upcoming.map(({ id }) => id), ['owned-scheduled', 'other-scheduled']);
});

test('a future session cannot be presented as live even if a stale row says live', () => {
  const future = {
    ...session('future-live', 'live', 'host-profile'),
    scheduledStart: '2026-08-27T18:00:00.000Z',
  };
  assert.equal(getLiveSessionPhase(future, Date.parse('2026-08-26T18:00:00.000Z')), 'upcoming');
  assert.equal(getLiveSessionPhase(future, Date.parse('2026-08-27T18:00:00.000Z')), 'live');
});

test('ended and cancelled rooms are retained as past host outcomes', () => {
  const ended = session('owned-ended', 'ended', 'host-profile');
  const cancelled = session('owned-cancelled', 'cancelled', 'host-profile');
  const result = partitionLiveLobbySessions([...sessions, ended, cancelled], 'host-profile', true);
  assert.deepEqual(result.past.map(({ id }) => id), ['owned-ended', 'owned-cancelled']);
});
