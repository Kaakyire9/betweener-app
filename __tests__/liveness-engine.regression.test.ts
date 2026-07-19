import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildLivenessEvidence,
  createLivenessState,
  reduceLivenessObservation,
  validateLivenessEvidence,
  type FaceObservation,
  type LivenessChallenge,
} from '../lib/verification/liveness-engine.ts';

const challenge: LivenessChallenge = {
  id: 'challenge-id',
  nonce: 'challenge-nonce',
  actions: ['turn', 'blink'],
  expiresAt: '2099-01-01T00:00:00.000Z',
};

const observation = (overrides: Partial<FaceObservation> = {}): FaceObservation => ({
  capturedAt: Date.now(),
  faceCount: 1,
  centered: true,
  faceWidthRatio: 0.42,
  yawAngle: 0,
  turnSignal: 0,
  leftEyeOpenProbability: 0.9,
  rightEyeOpenProbability: 0.9,
  ...overrides,
});

test('requires measured center, turn, blink and final hold', () => {
  let state = createLivenessState();
  for (let index = 0; index < 4; index += 1) {
    state = reduceLivenessObservation(state, challenge, observation());
  }
  assert.equal(state.phase, 'challenge');

  state = reduceLivenessObservation(state, challenge, observation({ yawAngle: 23 }));
  state = reduceLivenessObservation(state, challenge, observation({ yawAngle: 24 }));
  assert.deepEqual(state.completedActions, ['turn']);

  state = reduceLivenessObservation(state, challenge, observation({ leftEyeOpenProbability: 0.1, rightEyeOpenProbability: 0.12 }));
  state = reduceLivenessObservation(state, challenge, observation({ leftEyeOpenProbability: 0.08, rightEyeOpenProbability: 0.09 }));
  state = reduceLivenessObservation(state, challenge, observation());
  state = reduceLivenessObservation(state, challenge, observation());
  assert.equal(state.phase, 'hold');

  state = reduceLivenessObservation(state, challenge, observation());
  state = reduceLivenessObservation(state, challenge, observation());
  state = reduceLivenessObservation(state, challenge, observation());
  assert.equal(state.phase, 'complete');

  const evidence = buildLivenessEvidence(state, challenge, 5200);
  assert.equal(evidence.challenge_completed, true);
  assert.deepEqual(evidence.completed_actions, challenge.actions);
  assert.ok(evidence.sample_count >= 12);
  assert.equal(validateLivenessEvidence(evidence).valid, true);
});

test('never advances when multiple faces or timer-only frames are supplied', () => {
  let state = createLivenessState();
  for (let index = 0; index < 20; index += 1) {
    state = reduceLivenessObservation(state, challenge, observation({ faceCount: 2 }));
  }
  assert.equal(state.phase, 'position');
  assert.equal(state.completedActions.length, 0);
});

test('respects a server-randomised blink-first sequence', () => {
  const blinkFirst: LivenessChallenge = { ...challenge, actions: ['blink', 'turn'] };
  let state = createLivenessState();
  for (let index = 0; index < 4; index += 1) state = reduceLivenessObservation(state, blinkFirst, observation());

  // One noisy eye classification must not count as a blink.
  state = reduceLivenessObservation(state, blinkFirst, observation({ leftEyeOpenProbability: 0.1, rightEyeOpenProbability: 0.9 }));
  state = reduceLivenessObservation(state, blinkFirst, observation());
  assert.deepEqual(state.completedActions, []);

  state = reduceLivenessObservation(state, blinkFirst, observation({ leftEyeOpenProbability: 0.1, rightEyeOpenProbability: 0.1 }));
  assert.deepEqual(state.completedActions, []);
  state = reduceLivenessObservation(state, blinkFirst, observation({ leftEyeOpenProbability: 0.1, rightEyeOpenProbability: 0.1 }));
  state = reduceLivenessObservation(state, blinkFirst, observation());
  state = reduceLivenessObservation(state, blinkFirst, observation());
  assert.deepEqual(state.completedActions, ['blink']);

  state = reduceLivenessObservation(state, blinkFirst, observation({ yawAngle: -22 }));
  state = reduceLivenessObservation(state, blinkFirst, observation({ yawAngle: -24 }));
  assert.deepEqual(state.completedActions, ['blink', 'turn']);
});

test('never offers evidence that is weaker than the server thresholds', () => {
  const weakEvidence = buildLivenessEvidence(
    {
      ...createLivenessState(),
      phase: 'complete',
      completedActions: ['turn', 'blink'],
      sampleCount: 12,
      singleFaceSamples: 12,
      centeredSamples: 10,
      totalTurnSamples: 2,
      totalClosedEyeSamples: 1,
      totalReopenedEyeSamples: 1,
    },
    challenge,
    3000,
  );

  assert.equal(validateLivenessEvidence(weakEvidence).valid, false);
  assert.match(validateLivenessEvidence(weakEvidence).reason || '', /blink/i);
});

test('accepts equal left or right movement from a device-biased neutral yaw', () => {
  const completeTurn = (turnedYaw: number) => {
    let state = createLivenessState();
    for (let index = 0; index < 4; index += 1) {
      state = reduceLivenessObservation(state, challenge, observation({ yawAngle: 12 }));
    }
    state = reduceLivenessObservation(state, challenge, observation({ yawAngle: turnedYaw }));
    state = reduceLivenessObservation(state, challenge, observation({ yawAngle: turnedYaw }));
    return state;
  };

  assert.deepEqual(completeTurn(29).completedActions, ['turn']);
  assert.deepEqual(completeTurn(-5).completedActions, ['turn']);
});

test('uses facial landmark asymmetry when a device reports a stuck yaw angle', () => {
  const completeLandmarkTurn = (turnSignal: number) => {
    let state = createLivenessState();
    for (let index = 0; index < 4; index += 1) {
      state = reduceLivenessObservation(state, challenge, observation({ yawAngle: 0, turnSignal: 0 }));
    }
    state = reduceLivenessObservation(state, challenge, observation({ yawAngle: 0, turnSignal }));
    state = reduceLivenessObservation(state, challenge, observation({ yawAngle: 0, turnSignal }));
    return state;
  };

  assert.deepEqual(completeLandmarkTurn(0.14).completedActions, ['turn']);
  assert.deepEqual(completeLandmarkTurn(-0.14).completedActions, ['turn']);
});
