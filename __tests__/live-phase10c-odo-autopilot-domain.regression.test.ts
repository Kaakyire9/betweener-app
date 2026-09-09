import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ODO_GUARDED_ACTION_TYPES,
  ODO_GUARDED_FORBIDDEN_ACTIONS,
  ODO_GUARDED_RISK_TIER,
  isOdoGuardedActionAllowed,
} from '../features/live/odo/autopilot/odo-autopilot-contracts.ts';
import { parseOdoGuardedAutopilotState } from '../features/live/odo/autopilot/odo-autopilot-validation.ts';

test('the exact guarded whitelist has explicit Tier 0-2 classifications', () => {
  assert.deepEqual(ODO_GUARDED_ACTION_TYPES, [
    'NO_ACTION', 'WAIT', 'SESSION_NARRATION', 'ANNOUNCE_EXISTING_PAIR',
    'REQUEST_SCENE', 'SHOW_CONVERSATION_SPARK', 'SHOW_AUDIENCE_PULSE',
    'SHOW_INTERMISSION', 'TIME_CUE', 'TRANSITION_COPY',
  ]);
  for (const action of ODO_GUARDED_ACTION_TYPES) {
    assert.equal(isOdoGuardedActionAllowed(action), true);
    assert.ok([0, 1, 2].includes(ODO_GUARDED_RISK_TIER[action]));
  }
});

test('every named critical action and every unknown action is denied', () => {
  for (const action of ODO_GUARDED_FORBIDDEN_ACTIONS) {
    assert.equal(isOdoGuardedActionAllowed(action), false, action);
  }
  assert.equal(isOdoGuardedActionAllowed('ARBITRARY_MODEL_ACTION'), false);
});

test('guarded state parser accepts the complete server projection and rejects drift', () => {
  const state = {
    schemaVersion: 1,
    available: true,
    sessionId: '10000000-0000-4000-8000-000000000001',
    enabled: true,
    directionMode: 'autopilot',
    autopilotState: 'active',
    currentScene: 'quick_connect_active',
    limitedMode: false,
    stateVersion: 8,
    leaseGeneration: 4,
    features: {
      narration: true,
      scenes: true,
      conversationSparks: true,
      audiencePulse: false,
      intermissions: true,
      timeCues: true,
    },
    lastAction: {
      actionId: '20000000-0000-4000-8000-000000000001',
      type: 'REQUEST_SCENE',
      reasonCode: 'pair_active',
      executedAt: '2026-09-08T12:00:00.000Z',
    },
    nextTimeCueAt: null,
    unavailableReasonCode: null,
  };
  assert.equal(parseOdoGuardedAutopilotState(state).ok, true);
  assert.equal(parseOdoGuardedAutopilotState({ ...state, model: 'gpt' }).ok, false);
  assert.equal(parseOdoGuardedAutopilotState({
    ...state,
    features: { ...state.features, rtc: true },
  }).ok, false);
  assert.equal(parseOdoGuardedAutopilotState({
    ...state,
    lastAction: { ...state.lastAction, type: 'CREATE_PAIR' },
  }).ok, false);
});
