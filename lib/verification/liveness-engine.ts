export type LivenessAction = 'turn' | 'blink';

export type LivenessChallenge = {
  id: string;
  nonce: string;
  actions: LivenessAction[];
  expiresAt: string;
};

export type FaceObservation = {
  capturedAt: number;
  faceCount: number;
  centered: boolean;
  faceWidthRatio: number;
  yawAngle: number;
  turnSignal: number | null;
  leftEyeOpenProbability: number | null;
  rightEyeOpenProbability: number | null;
};

export type LivenessEvidence = {
  schema_version: 1;
  challenge_id: string;
  challenge_nonce: string;
  requested_actions: LivenessAction[];
  completed_actions: LivenessAction[];
  challenge_completed: boolean;
  duration_ms: number;
  sample_count: number;
  single_face_samples: number;
  centered_samples: number;
  turn_samples: number;
  closed_eye_samples: number;
  reopened_eye_samples: number;
  max_absolute_yaw: number;
};

export type LivenessState = {
  phase: 'position' | 'challenge' | 'hold' | 'complete';
  actionIndex: number;
  completedActions: LivenessAction[];
  stableCenterSamples: number;
  baselineYaw: number;
  baselineYawSamples: number;
  baselineTurnSignal: number;
  baselineTurnSignalSamples: number;
  turnSamples: number;
  closedEyeSamples: number;
  reopenedEyeSamples: number;
  blinkClosedSeen: boolean;
  eyesOpenBeforeBlink: boolean;
  holdSamples: number;
  sampleCount: number;
  singleFaceSamples: number;
  centeredSamples: number;
  totalTurnSamples: number;
  totalClosedEyeSamples: number;
  totalReopenedEyeSamples: number;
  maxAbsoluteYaw: number;
};

export const LIVENESS_EVIDENCE_REQUIREMENTS = {
  minimumDurationMs: 1800,
  minimumSampleCount: 10,
  minimumSingleFaceSamples: 9,
  minimumCenteredSamples: 7,
  minimumTurnSamples: 2,
  minimumClosedEyeSamples: 2,
  minimumReopenedEyeSamples: 2,
} as const;

const CENTER_SAMPLES_REQUIRED = 4;
const TURN_SAMPLES_REQUIRED = 2;
const HOLD_SAMPLES_REQUIRED = 3;
const TURN_YAW_DELTA_THRESHOLD = 16;
const TURN_LANDMARK_DELTA_THRESHOLD = 0.12;
const EYE_CLOSED_THRESHOLD = 0.42;
const EYE_OPEN_THRESHOLD = 0.58;
const EYE_CLOSED_SAMPLES_REQUIRED = LIVENESS_EVIDENCE_REQUIREMENTS.minimumClosedEyeSamples;
const EYE_REOPENED_SAMPLES_REQUIRED = LIVENESS_EVIDENCE_REQUIREMENTS.minimumReopenedEyeSamples;

export const createLivenessState = (): LivenessState => ({
  phase: 'position',
  actionIndex: 0,
  completedActions: [],
  stableCenterSamples: 0,
  baselineYaw: 0,
  baselineYawSamples: 0,
  baselineTurnSignal: 0,
  baselineTurnSignalSamples: 0,
  turnSamples: 0,
  closedEyeSamples: 0,
  reopenedEyeSamples: 0,
  blinkClosedSeen: false,
  eyesOpenBeforeBlink: false,
  holdSamples: 0,
  sampleCount: 0,
  singleFaceSamples: 0,
  centeredSamples: 0,
  totalTurnSamples: 0,
  totalClosedEyeSamples: 0,
  totalReopenedEyeSamples: 0,
  maxAbsoluteYaw: 0,
});

const bothEyesAtMost = (observation: FaceObservation, threshold: number) =>
  observation.leftEyeOpenProbability !== null &&
  observation.rightEyeOpenProbability !== null &&
  observation.leftEyeOpenProbability <= threshold &&
  observation.rightEyeOpenProbability <= threshold;

const bothEyesAtLeast = (observation: FaceObservation, threshold: number) =>
  observation.leftEyeOpenProbability !== null &&
  observation.rightEyeOpenProbability !== null &&
  observation.leftEyeOpenProbability >= threshold &&
  observation.rightEyeOpenProbability >= threshold;

export function reduceLivenessObservation(
  state: LivenessState,
  challenge: Pick<LivenessChallenge, 'actions'>,
  observation: FaceObservation,
): LivenessState {
  if (state.phase === 'complete') return state;

  const oneFace = observation.faceCount === 1;
  const usableFace = oneFace && observation.centered;
  const yawAngle = Number.isFinite(observation.yawAngle) ? observation.yawAngle : 0;
  const absoluteYaw = Math.abs(yawAngle);
  let next: LivenessState = {
    ...state,
    sampleCount: state.sampleCount + 1,
    singleFaceSamples: state.singleFaceSamples + (oneFace ? 1 : 0),
    centeredSamples: state.centeredSamples + (usableFace ? 1 : 0),
    maxAbsoluteYaw: Math.max(state.maxAbsoluteYaw, absoluteYaw),
  };

  if (state.phase === 'position') {
    const stableCenterSamples = usableFace && absoluteYaw < 24 ? state.stableCenterSamples + 1 : 0;
    const baselineYawSamples = stableCenterSamples > 0 ? state.baselineYawSamples + 1 : 0;
    const baselineYaw = baselineYawSamples > 0
      ? ((state.baselineYaw * state.baselineYawSamples) + yawAngle) / baselineYawSamples
      : 0;
    const hasTurnSignal = usableFace && observation.turnSignal !== null && Number.isFinite(observation.turnSignal);
    const baselineTurnSignalSamples = hasTurnSignal ? state.baselineTurnSignalSamples + 1 : state.baselineTurnSignalSamples;
    const baselineTurnSignal = hasTurnSignal
      ? ((state.baselineTurnSignal * state.baselineTurnSignalSamples) + observation.turnSignal!) / baselineTurnSignalSamples
      : state.baselineTurnSignal;
    return {
      ...next,
      stableCenterSamples,
      baselineYaw,
      baselineYawSamples,
      baselineTurnSignal,
      baselineTurnSignalSamples,
      eyesOpenBeforeBlink: state.eyesOpenBeforeBlink || bothEyesAtLeast(observation, EYE_OPEN_THRESHOLD),
      phase: stableCenterSamples >= CENTER_SAMPLES_REQUIRED ? 'challenge' : 'position',
    };
  }

  if (state.phase === 'hold') {
    const returnedToNeutral = Math.abs(yawAngle - state.baselineYaw) < 12;
    const holdSamples = usableFace && returnedToNeutral ? state.holdSamples + 1 : 0;
    return {
      ...next,
      holdSamples,
      phase: holdSamples >= HOLD_SAMPLES_REQUIRED ? 'complete' : 'hold',
    };
  }

  if (!oneFace) {
    return {
      ...next,
      turnSamples: 0,
      closedEyeSamples: 0,
      reopenedEyeSamples: 0,
      blinkClosedSeen: false,
      eyesOpenBeforeBlink: false,
    };
  }

  const action = challenge.actions[state.actionIndex];
  if (!action) return { ...next, phase: 'hold' };

  let actionCompleted = false;
  if (action === 'turn') {
    const turnDelta = Math.abs(yawAngle - state.baselineYaw);
    const landmarkTurnDelta = observation.turnSignal !== null && state.baselineTurnSignalSamples > 0
      ? Math.abs(observation.turnSignal - state.baselineTurnSignal)
      : 0;
    const detected =
      turnDelta >= TURN_YAW_DELTA_THRESHOLD ||
      landmarkTurnDelta >= TURN_LANDMARK_DELTA_THRESHOLD;
    const turnSamples = detected ? state.turnSamples + 1 : 0;
    next = {
      ...next,
      turnSamples,
      totalTurnSamples: state.totalTurnSamples + (detected ? 1 : 0),
    };
    actionCompleted = turnSamples >= TURN_SAMPLES_REQUIRED;
  } else {
    const eyesClosed = bothEyesAtMost(observation, EYE_CLOSED_THRESHOLD);
    const eyesReopened = bothEyesAtLeast(observation, EYE_OPEN_THRESHOLD);
    const eyesOpenBeforeBlink = state.eyesOpenBeforeBlink || (!state.blinkClosedSeen && eyesReopened);
    const closedEyeSamples = state.blinkClosedSeen
      ? state.closedEyeSamples
      : eyesOpenBeforeBlink && eyesClosed
        ? state.closedEyeSamples + 1
        : 0;
    const blinkClosedSeen = state.blinkClosedSeen || closedEyeSamples >= EYE_CLOSED_SAMPLES_REQUIRED;
    const reopenedEyeSamples = blinkClosedSeen && eyesReopened ? state.reopenedEyeSamples + 1 : 0;
    next = {
      ...next,
      closedEyeSamples,
      reopenedEyeSamples,
      blinkClosedSeen,
      eyesOpenBeforeBlink,
      totalClosedEyeSamples: state.totalClosedEyeSamples + (eyesClosed ? 1 : 0),
      totalReopenedEyeSamples: state.totalReopenedEyeSamples + (blinkClosedSeen && eyesReopened ? 1 : 0),
    };
    actionCompleted = blinkClosedSeen && reopenedEyeSamples >= EYE_REOPENED_SAMPLES_REQUIRED;
  }

  if (!actionCompleted) return next;

  const completedActions = [...state.completedActions, action];
  const actionIndex = state.actionIndex + 1;
  return {
    ...next,
    actionIndex,
    completedActions,
    turnSamples: 0,
    closedEyeSamples: 0,
    reopenedEyeSamples: 0,
    blinkClosedSeen: false,
    eyesOpenBeforeBlink: action === 'blink' ? false : next.eyesOpenBeforeBlink,
    phase: actionIndex >= challenge.actions.length ? 'hold' : 'challenge',
  };
}

export function getLivenessProgress(state: LivenessState, actionCount: number) {
  if (state.phase === 'complete') return 1;
  if (state.phase === 'position') return Math.min(0.2, state.stableCenterSamples * 0.05);
  if (state.phase === 'hold') return 0.85 + Math.min(0.14, state.holdSamples * 0.045);
  return 0.2 + (state.actionIndex / Math.max(1, actionCount)) * 0.65;
}

export function buildLivenessEvidence(
  state: LivenessState,
  challenge: LivenessChallenge,
  durationMs: number,
): LivenessEvidence {
  return {
    schema_version: 1,
    challenge_id: challenge.id,
    challenge_nonce: challenge.nonce,
    requested_actions: challenge.actions,
    completed_actions: state.completedActions,
    challenge_completed: state.phase === 'complete',
    duration_ms: Math.max(0, Math.round(durationMs)),
    sample_count: state.sampleCount,
    single_face_samples: state.singleFaceSamples,
    centered_samples: state.centeredSamples,
    turn_samples: state.totalTurnSamples,
    closed_eye_samples: state.totalClosedEyeSamples,
    reopened_eye_samples: state.totalReopenedEyeSamples,
    max_absolute_yaw: Number(state.maxAbsoluteYaw.toFixed(2)),
  };
}

export function validateLivenessEvidence(evidence: LivenessEvidence) {
  const requirements = LIVENESS_EVIDENCE_REQUIREMENTS;
  const valid =
    evidence.challenge_completed &&
    evidence.duration_ms >= requirements.minimumDurationMs &&
    evidence.duration_ms <= 15_000 &&
    evidence.sample_count >= requirements.minimumSampleCount &&
    evidence.single_face_samples >= requirements.minimumSingleFaceSamples &&
    evidence.centered_samples >= requirements.minimumCenteredSamples &&
    evidence.turn_samples >= requirements.minimumTurnSamples &&
    evidence.closed_eye_samples >= requirements.minimumClosedEyeSamples &&
    evidence.reopened_eye_samples >= requirements.minimumReopenedEyeSamples &&
    evidence.single_face_samples <= evidence.sample_count &&
    evidence.centered_samples <= evidence.single_face_samples;

  return {
    valid,
    reason: valid
      ? null
      : evidence.duration_ms < requirements.minimumDurationMs
        ? 'The recording finished too quickly.'
        : evidence.closed_eye_samples < requirements.minimumClosedEyeSamples ||
            evidence.reopened_eye_samples < requirements.minimumReopenedEyeSamples
          ? 'The blink was not captured clearly enough.'
          : evidence.turn_samples < requirements.minimumTurnSamples
            ? 'The head turn was not captured clearly enough.'
            : 'Keep one face centred and clearly visible throughout the check.',
  };
}
