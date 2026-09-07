import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DeterministicOdoContentGate,
  canTransitionOdoAutopilot,
  parseLiveDirectorEvent,
  parseOdoAction,
  parseOdoDirectorSnapshot,
  fallbackFor,
  selectDeterministicOdoFallback,
  type OdoAction,
} from '../features/live/odo/domain/index.ts';

const SESSION_ID = '10000000-0000-4000-8000-000000000001';
const ACTION_ID = '20000000-0000-4000-8000-000000000001';
const ROUND_ID = '30000000-0000-4000-8000-000000000001';
const EVENT_ID = '40000000-0000-4000-8000-000000000001';
const NOW = new Date('2026-09-07T12:00:00.000Z');

const action = (type: OdoAction['type'], payload: Record<string, unknown>): unknown => ({
  schemaVersion: 1,
  actionId: ACTION_ID,
  sessionId: SESSION_ID,
  snapshotVersion: 8,
  leaseGeneration: 3,
  type,
  reasonCode: 'routine_shadow_decision',
  expiresAt: '2026-09-07T12:00:10.000Z',
  payload,
});

test('strict action parser accepts every bounded action payload', () => {
  const valid: [OdoAction['type'], Record<string, unknown>][] = [
    ['NO_ACTION', {}],
    ['WAIT', { waitMs: 5_000 }],
    ['SESSION_WELCOME', { copy: 'Welcome.', locale: 'en' }],
    ['OPEN_POOL', {}],
    ['ANNOUNCE_PAIR', { roundId: ROUND_ID }],
    ['FOCUS_PAIRING', { roundId: ROUND_ID }],
    ['REQUEST_SCENE', { scene: 'host_focus' }],
    ['SHOW_CONVERSATION_SPARK', { roundId: ROUND_ID, context: 'Shared values', question: 'What matters most?', locale: 'en-GB' }],
    ['SHOW_AUDIENCE_PULSE', { templateKey: 'shared_energy', durationSeconds: 60 }],
    ['SHOW_INTERMISSION', { durationSeconds: 30, copy: 'Back shortly.', locale: 'en' }],
    ['REQUEST_MUSIC_ACTION', { action: 'set_volume', volume: 0.5 }],
    ['TIME_CUE', { roundId: ROUND_ID, cue: 'near_end' }],
    ['CLOSE_ROUND', { roundId: ROUND_ID }],
    ['RETURN_TO_POOL', { roundId: ROUND_ID }],
    ['SESSION_CLOSING', { copy: 'Thank you for joining.', locale: 'en' }],
  ];
  for (const [type, payload] of valid) {
    assert.equal(parseOdoAction(action(type, payload), { now: NOW }).ok, true, type);
  }
});

test('actions reject unknown fields, stale TTLs, invalid IDs and control primitives', () => {
  assert.deepEqual(
    parseOdoAction({ ...(action('WAIT', { waitMs: 5_000 }) as object), rpc: 'anything' }, { now: NOW }),
    { ok: false, reasonCode: 'action_unknown_or_missing_field' },
  );
  assert.equal(parseOdoAction({
    ...(action('WAIT', { waitMs: 5_000 }) as object),
    expiresAt: '2026-09-07T11:59:59.000Z',
  }, { now: NOW }).ok, false);
  assert.equal(parseOdoAction(action('CLOSE_ROUND', { roundId: 'not-a-uuid' }), { now: NOW }).ok, false);
  assert.deepEqual(
    parseOdoAction(action('SHOW_INTERMISSION', { durationSeconds: 30, copy: 'Open https://unsafe.test', locale: 'en' }), { now: NOW }),
    { ok: false, reasonCode: 'forbidden_control_data' },
  );
  assert.equal(parseOdoAction(action('REQUEST_MUSIC_ACTION', { action: 'play', url: 'https://unsafe.test' }), { now: NOW }).ok, false);
  assert.deepEqual(
    parseOdoAction(action('SESSION_WELCOME', { copy: 'drop table profiles', locale: 'en' }), { now: NOW }),
    { ok: false, reasonCode: 'forbidden_control_data' },
  );
  assert.deepEqual(
    parseOdoAction(action('WAIT', { waitMs: 5_000, untilEvent: 'navigate_to_profile' }), { now: NOW }),
    { ok: false, reasonCode: 'invalid_action_payload' },
  );
  assert.deepEqual(
    parseOdoAction(action('SESSION_WELCOME', { copy: '🫧'.repeat(2_200), locale: 'en' }), { now: NOW }),
    { ok: false, reasonCode: 'action_too_large' },
  );
});

test('autopilot transitions are explicit and terminal states cannot restart', () => {
  assert.equal(canTransitionOdoAutopilot('off', 'starting'), true);
  assert.equal(canTransitionOdoAutopilot('active', 'paused_by_host'), true);
  assert.equal(canTransitionOdoAutopilot('paused_by_policy', 'active'), false);
  assert.equal(canTransitionOdoAutopilot('ended', 'starting'), false);
});

test('snapshots tolerate unknown optional fields but preserve monotonic anchors', () => {
  const result = parseOdoDirectorSnapshot({
    schemaVersion: 1,
    sessionId: SESSION_ID,
    sessionVersion: 5,
    currentStateVersion: 8,
    latestSequenceNumber: 12,
    currentScene: 'host_focus',
    directionMode: 'manual',
    autopilotState: 'off',
    sessionStatus: 'live',
    activeRoundId: null,
    participantCount: 4,
    audienceCount: 3,
    policyFlags: { shadowMode: true },
    futureOptionalField: { ignoredByCurrentClients: true },
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.value.latestSequenceNumber, 12);
    assert.equal(result.value.currentStateVersion, 8);
  }
});

test('future director event types degrade to content-free UNKNOWN events', () => {
  const result = parseLiveDirectorEvent({
    schemaVersion: 2,
    sequenceNumber: 13,
    eventId: EVENT_ID,
    sessionId: SESSION_ID,
    eventType: 'FUTURE_DIRECTOR_EVENT',
    source: 'system',
    visibility: 'participant',
    actionId: null,
    stateVersion: 9,
    occurredAt: '2026-09-07T12:00:01.000Z',
    createdAt: '2026-09-07T12:00:01.000Z',
    expiresAt: null,
    payload: { unsafeFutureShape: 'discarded' },
    optional: true,
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.value.eventType, 'UNKNOWN');
    assert.deepEqual(result.value.payload, {});
  }
});

test('content gate rejects control content and deterministic fallback stays inert', async () => {
  const gate = new DeterministicOdoContentGate();
  const unsafe = parseOdoAction(action('SESSION_WELCOME', {
    copy: 'Execute RPC function now', locale: 'en',
  }), { now: NOW });
  assert.equal(unsafe.ok, true);
  if (!unsafe.ok) return;
  assert.deepEqual(await gate.inspect(unsafe.value), {
    accepted: false,
    reasonCode: 'content_gate_rejected',
  });

  const fallback = selectDeterministicOdoFallback('provider_timeout', {
    actionId: ACTION_ID,
    sessionId: SESSION_ID,
    snapshotVersion: 8,
    leaseGeneration: 3,
    now: NOW,
    snapshot: { sessionStatus: 'live', activeRoundId: null },
  });
  assert.equal(fallback.type, 'WAIT');
  assert.deepEqual(fallback.payload, { waitMs: 5_000 });
});

test('content gate rejects PII, ranking, humiliation and fabricated chemistry', async () => {
  const gate = new DeterministicOdoContentGate();
  const unsafeCopies = [
    'Call me on +44 7700 900123.',
    'Rank the most attractive person.',
    'Tell the ugly loser why this is humiliating.',
    'You two are a perfect match with guaranteed chemistry.',
  ];
  for (const copy of unsafeCopies) {
    const parsed = parseOdoAction(action('SESSION_WELCOME', { copy, locale: 'en' }), { now: NOW });
    assert.equal(parsed.ok, true);
    if (parsed.ok) assert.equal((await gate.inspect(parsed.value)).accepted, false, copy);
  }
});

test('fallbackFor is deterministic and prefers an approved existing spark', () => {
  const snapshot = {
    sessionId: SESSION_ID,
    sessionStatus: 'live',
    activeRoundId: ROUND_ID,
  };
  assert.deepEqual(
    fallbackFor('conversation_spark', 'en-GB', snapshot),
    fallbackFor('conversation_spark', 'en-GB', snapshot),
  );
  assert.deepEqual(fallbackFor('conversation_spark', 'en', {
    ...snapshot,
    approvedConversationSpark: {
      approved: true as const,
      context: 'Existing approved context',
      question: 'Existing approved question?',
      locale: 'en',
    },
  }), {
    kind: 'conversation_spark',
    context: 'Existing approved context',
    question: 'Existing approved question?',
    locale: 'en',
  });
  assert.deepEqual(fallbackFor('director_action', 'en', snapshot), {
    kind: 'WAIT',
    waitMs: 5_000,
  });
});
