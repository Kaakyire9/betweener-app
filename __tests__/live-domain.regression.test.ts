import assert from 'node:assert/strict';
import test from 'node:test';

import {
  LIVE_PARTICIPANT_STATES,
  LIVE_SESSION_STATUSES,
  getLiveParticipantTransitions,
  getLiveSessionTransitions,
  hasLiveCapability,
  resolveLiveCapabilities,
  transitionLiveParticipant,
  transitionLiveSession,
  type LiveParticipantEvent,
  type LiveParticipantState,
  type LiveSessionEvent,
  type LiveSessionStatus,
} from '../features/live/domain/index.ts';

test('every declared Live session transition is executable and duplicate-safe', () => {
  const now = new Date('2026-08-12T12:00:00.000Z');
  LIVE_SESSION_STATUSES.forEach((currentState) => {
    Object.entries(getLiveSessionTransitions(currentState)).forEach(([event, expected]) => {
      const result = transitionLiveSession({
        currentState,
        event: event as LiveSessionEvent,
        now,
      });
      assert.equal(result.to, expected);
      assert.equal(result.occurredAt, now.toISOString());
      if (expected === currentState) assert.equal(result.idempotent, true);
    });
  });
});

test('Live sessions reject skipped stages, resurrection and cancellation after going live', () => {
  const invalid: readonly [LiveSessionStatus, LiveSessionEvent][] = [
    ['draft', 'start'],
    ['scheduled', 'start'],
    ['live', 'cancel'],
    ['ended', 'start'],
    ['cancelled', 'open_backstage'],
  ];
  invalid.forEach(([currentState, event]) => {
    assert.throws(
      () => transitionLiveSession({ currentState, event }),
      new RegExp(`invalid_live_session_transition:${currentState}:${event}`),
    );
  });
});

test('every declared participant transition is executable', () => {
  LIVE_PARTICIPANT_STATES.forEach((currentState) => {
    Object.entries(getLiveParticipantTransitions(currentState)).forEach(([event, expected]) => {
      assert.equal(transitionLiveParticipant({
        currentState,
        event: event as LiveParticipantEvent,
      }).to, expected);
    });
  });
});

test('removed, left and banned participants cannot silently rejoin or publish', () => {
  const invalid: readonly [LiveParticipantState, LiveParticipantEvent][] = [
    ['left', 'join_audience'],
    ['removed', 'reconnect_to_audience'],
    ['banned', 'reconnect_to_stage'],
    ['audience', 'reconnect_to_stage'],
  ];
  invalid.forEach(([currentState, event]) => {
    assert.throws(() => transitionLiveParticipant({ currentState, event }));
  });
});

test('matchmaker and moderator authorities stay deliberately separate', () => {
  const matchmaker = resolveLiveCapabilities(['matchmaker']);
  assert.equal(hasLiveCapability(matchmaker, 'live.suggest_match'), true);
  assert.equal(hasLiveCapability(matchmaker, 'live.mute_participant'), false);
  assert.equal(hasLiveCapability(matchmaker, 'live.ban_participant'), false);

  const moderator = resolveLiveCapabilities(['moderator']);
  assert.equal(hasLiveCapability(moderator, 'live.mute_participant'), true);
  assert.equal(hasLiveCapability(moderator, 'live.suggest_match'), false);
});

test('multi-role capability resolution is deterministic and supports explicit revocation', () => {
  const resolution = resolveLiveCapabilities(
    ['moderator', 'matchmaker', 'moderator'],
    ['live.publish'],
    ['live.comment'],
  );
  assert.deepEqual(resolution.roles, ['moderator', 'matchmaker']);
  assert.equal(hasLiveCapability(resolution, 'live.mute_participant'), true);
  assert.equal(hasLiveCapability(resolution, 'live.suggest_match'), true);
  assert.equal(hasLiveCapability(resolution, 'live.publish'), true);
  assert.equal(hasLiveCapability(resolution, 'live.comment'), false);
});
