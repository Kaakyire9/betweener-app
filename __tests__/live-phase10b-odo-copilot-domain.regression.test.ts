import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  canUseOdoCopilotSuggestion,
  getHostApprovedOdoScene,
  getOdoCopilotParticipantNotice,
  odoCopilotNoActionMessage,
  parseOdoCopilotState,
  parseOdoCopilotSuggestion,
  type OdoCopilotSuggestion,
} from '../features/live/odo/copilot/index.ts';
import { applyLiveStageScene } from '../features/live/stage/live-stage-layout.ts';
import type { LiveDirectorEvent } from '../features/live/odo/domain/odo-contracts.ts';

const suggestion: OdoCopilotSuggestion = {
  schemaVersion: 1,
  id: '10000000-0000-4000-8000-000000000001',
  sessionId: '20000000-0000-4000-8000-000000000001',
  task: 'conversation_spark',
  type: 'conversation_spark',
  status: 'ready',
  reasonCode: 'shared_interest',
  title: 'Conversation spark',
  rationale: 'A fresh prompt for the current pair.',
  payload: { context: 'A shared interest', question: 'What do you enjoy about it?', locale: 'en' },
  roundId: '30000000-0000-4000-8000-000000000001',
  snapshotVersion: 4,
  sessionVersion: 2,
  stateVersion: 4,
  roundVersion: 3,
  fallbackUsed: false,
  createdAt: '2026-09-08T12:00:00.000Z',
  expiresAt: '2026-09-08T12:03:00.000Z',
  usedAt: null,
};

test('Copilot suggestion parser rejects unknown fields and mismatched task types', () => {
  assert.equal(parseOdoCopilotSuggestion(suggestion).ok, true);
  assert.equal(parseOdoCopilotSuggestion({ ...suggestion, prompt: 'hidden' }).ok, false);
  assert.equal(parseOdoCopilotSuggestion({ ...suggestion, type: 'audience_pulse' }).ok, false);
});

test('suggestions are unusable after TTL or any authoritative version changes', () => {
  const context = {
    now: new Date('2026-09-08T12:01:00.000Z'),
    sessionVersion: 2,
    stateVersion: 4,
    roundId: suggestion.roundId,
    roundVersion: 3,
  };
  assert.equal(canUseOdoCopilotSuggestion(suggestion, context), true);
  assert.equal(canUseOdoCopilotSuggestion(suggestion, { ...context, stateVersion: 5 }), false);
  assert.equal(canUseOdoCopilotSuggestion(suggestion, {
    ...context, now: new Date('2026-09-08T12:03:00.000Z'),
  }), false);
});

test('Copilot state requires the complete feature-flag shape', () => {
  const state = {
    schemaVersion: 1,
    enabled: true,
    temporarilyUnavailable: false,
    unavailableReason: null,
    directionMode: 'manual',
    currentScene: 'host_focus',
    features: {
      conversationSpark: true,
      audiencePulse: true,
      pairNarration: false,
      sceneSuggestions: false,
      transitionCopy: false,
    },
    suggestions: [suggestion],
  };
  assert.equal(parseOdoCopilotState(state).ok, true);
  assert.equal(parseOdoCopilotState({
    ...state, features: { ...state.features, autopilot: true },
  }).ok, false);
});

test('participant notices accept only policy-approved Host or Odo participant events', () => {
  const event: LiveDirectorEvent = {
    schemaVersion: 1,
    sequenceNumber: 4,
    eventId: '40000000-0000-4000-8000-000000000001',
    sessionId: suggestion.sessionId,
    eventType: 'SESSION_WELCOME_PUBLISHED',
    source: 'host',
    visibility: 'participant',
    actionId: '50000000-0000-4000-8000-000000000001',
    stateVersion: 4,
    occurredAt: '2026-09-08T12:01:00.000Z',
    createdAt: '2026-09-08T12:01:00.000Z',
    expiresAt: '2026-09-08T12:16:00.000Z',
    payload: { copy: 'Welcome. Settle in and enjoy the room.', locale: 'en' },
  };
  assert.deepEqual(getOdoCopilotParticipantNotice(event), {
    key: `odo-copilot:${event.eventId}`,
    title: 'Welcome to the room',
    body: 'Welcome. Settle in and enjoy the room.',
  });
  assert.notEqual(getOdoCopilotParticipantNotice({ ...event, source: 'odo' }), null);
  assert.equal(getOdoCopilotParticipantNotice({ ...event, source: 'system' }), null);
  assert.equal(getOdoCopilotParticipantNotice({ ...event, visibility: 'internal' }), null);
  assert.equal(getOdoCopilotParticipantNotice({
    ...event,
    payload: { copy: '\u0000unsafe', locale: 'en' },
  }), null);
});

test('NO_ACTION gives the Host clear feedback without creating an actionable card', () => {
  assert.equal(
    odoCopilotNoActionMessage('scene_suggestion'),
    'The current scene still fits the room. No change recommended.',
  );
});

test('only a policy-approved Host or Odo scene event selects a predefined visual scene', () => {
  const sceneEvent: LiveDirectorEvent = {
    schemaVersion: 1,
    sequenceNumber: 5,
    eventId: '40000000-0000-4000-8000-000000000002',
    sessionId: suggestion.sessionId,
    eventType: 'SCENE_CHANGED',
    source: 'host',
    visibility: 'participant',
    actionId: '50000000-0000-4000-8000-000000000002',
    stateVersion: 5,
    occurredAt: '2026-09-08T12:02:00.000Z',
    createdAt: '2026-09-08T12:02:00.000Z',
    expiresAt: '2026-09-08T12:17:00.000Z',
    payload: { scene: 'pool_focus' },
  };
  assert.equal(getHostApprovedOdoScene(sceneEvent), 'pool_focus');
  assert.equal(getHostApprovedOdoScene({ ...sceneEvent, source: 'odo' }), 'pool_focus');
  assert.equal(getHostApprovedOdoScene({
    ...sceneEvent, payload: { scene: 'invented_scene' },
  }), null);
});

test('predefined scenes reorder focus without unmounting RTC seats', () => {
  const seats = [
    { userId: 'host', identity: { userId: 'host', role: 'host', stageSlot: 1 }, candidate: null },
    { userId: 'guest-a', identity: { userId: 'guest-a', role: 'audience', stageSlot: 2 }, candidate: null },
    { userId: 'guest-b', identity: { userId: 'guest-b', role: 'audience', stageSlot: 3 }, candidate: null },
  ];
  assert.deepEqual(applyLiveStageScene(seats, 'host_focus').map((seat) => seat.userId), ['host', 'guest-a', 'guest-b']);
  assert.deepEqual(applyLiveStageScene(seats, 'pair_forming').map((seat) => seat.userId), ['guest-a', 'guest-b', 'host']);
  assert.deepEqual(applyLiveStageScene(seats, 'pool_focus').map((seat) => seat.userId), ['guest-a', 'guest-b', 'host']);
  assert.equal(applyLiveStageScene(seats, 'quick_connect_active').length, seats.length);
});

test('Odo presentation scenes never hide the manual stage request surface', () => {
  const streamStage = readFileSync(
    'features/live/components/StreamLiveStage.tsx',
    'utf8',
  );
  assert.match(streamStage, /presentation === 'public' && !isInPictureInPicture/i);
  assert.doesNotMatch(streamStage, /sceneAllowsRequestSeat/i);
});
