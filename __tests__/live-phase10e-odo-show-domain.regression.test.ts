import assert from 'node:assert/strict';
import test from 'node:test';

import { evaluateLiveMusicPolicy } from '../features/live/odo/show/live-music-policy.ts';
import { deriveOdoShowDecision } from '../features/live/odo/show/odo-show-state-machine.ts';
import { parseOdoLiveProgramState, parseOdoShowDirectorState } from '../features/live/odo/show/odo-show-validation.ts';
import { BETWEENER_STUDIO_COMMANDS } from '../features/live/odo/show/odo-show-contracts.ts';

const input = {
  sessionLive: true,
  circuitBreakerOpen: false,
  pausedByHost: false,
  quickConnectState: 'open' as const,
  activePairs: 0,
  eligiblePairs: 0,
  completedRounds: 0,
  participantCount: 3,
  audienceCount: 2,
  currentScene: 'host_focus' as const,
  currentPriority: 10,
  sceneDwellElapsed: true,
  hostSuppressionActive: false,
  intermissionDue: false,
};

test('safety and Host control outrank all automatic presentation', () => {
  assert.equal(deriveOdoShowDecision({ ...input, circuitBreakerOpen: true }).priority, 100);
  assert.equal(deriveOdoShowDecision({ ...input, circuitBreakerOpen: true }).showState,
    'paused_by_policy');
  assert.equal(deriveOdoShowDecision({ ...input, pausedByHost: true }).reasonCode,
    'host_control_active');
  assert.equal(deriveOdoShowDecision({ ...input, hostSuppressionActive: true }).scene,
    'host_focus');
});

test('Quick Connect lifecycle is observed without selecting people', () => {
  const forming = deriveOdoShowDecision({ ...input, eligiblePairs: 1 });
  assert.deepEqual([forming.showState, forming.scene, forming.priority],
    ['pair_forming', 'pair_forming', 80]);
  const active = deriveOdoShowDecision({ ...input, activePairs: 1 });
  assert.deepEqual([active.showState, active.scene, active.priority],
    ['pair_active', 'quick_connect_active', 75]);
  assert.equal(JSON.stringify(active).includes('userId'), false);
});

test('intermissions are bounded and low liquidity uses Odo Stage', () => {
  assert.equal(deriveOdoShowDecision({ ...input, completedRounds: 3, intermissionDue: true }).scene,
    'music_intermission');
  assert.equal(deriveOdoShowDecision(input).scene, 'odo_stage');
  assert.equal(deriveOdoShowDecision({ ...input, quickConnectState: 'absent' }).scene,
    'host_plus_pool');
});

test('music policy forbids private experiences and publisher-device mixing', () => {
  const base = {
    action: 'play_track' as const,
    showState: 'music_intermission' as const,
    privateExperienceActive: false,
    isPublisher: false,
    musicEnabled: true,
    circuitBreakerOpen: false,
    duckingEnabled: true,
    licensedForRegion: true,
    catalogueEnabled: true,
  };
  assert.equal(evaluateLiveMusicPolicy({ ...base, privateExperienceActive: true }).allowed, false);
  assert.equal(evaluateLiveMusicPolicy({ ...base, isPublisher: true }).reasonCode,
    'publisher_device_mix_unsupported');
  assert.equal(evaluateLiveMusicPolicy({ ...base, licensedForRegion: false }).allowed, false);
  assert.equal(evaluateLiveMusicPolicy({ ...base, musicEnabled: false }).reasonCode,
    'music_disabled');
  assert.equal(evaluateLiveMusicPolicy({ ...base, circuitBreakerOpen: true }).allowed, false);
  assert.equal(evaluateLiveMusicPolicy({ ...base, showState: 'pair_active', duckingEnabled: false })
    .reasonCode, 'conversation_music_suppressed');
  assert.equal(evaluateLiveMusicPolicy({ ...base, showState: 'pair_active' }).effectiveVolume,
    0.12);
});

const music = {
  enabled: true,
  status: 'playing',
  trackId: '10000000-0000-4000-8000-000000000002',
  playlistId: null,
  title: 'Approved Track',
  artist: 'Licensed Artist',
  mood: 'warm',
  volume: 0.28,
  programStartedAt: '2026-09-08T12:00:00.000Z',
  playbackOffsetSeconds: 0,
  stateVersion: 3,
  playbackAvailable: true,
};
const programme = {
  schemaVersion: 1,
  sessionId: '10000000-0000-4000-8000-000000000001',
  enabled: true,
  showState: 'music_intermission',
  currentScene: 'music_intermission',
  energyMode: 'reflective',
  programSource: 'mobile',
  stateVersion: 4,
  nextWakeAt: null,
  music,
};

test('public and Host projection parsers reject schema drift', () => {
  assert.equal(parseOdoLiveProgramState(programme).ok, true);
  assert.equal(parseOdoLiveProgramState({ ...programme, privatePair: ['a', 'b'] }).ok, false);
  const hostState = {
    ...programme,
    available: true,
    controlSource: 'odo',
    pausedByHost: false,
    leaseGeneration: 2,
    sceneEnteredAt: '2026-09-08T12:00:00.000Z',
    hostSuppressionEndsAt: null,
    lastReasonCode: 'bounded_intermission_due',
    unavailableReasonCode: null,
    metrics: { participants: 3, audience: 2, waitingPeople: 2, activePairs: 0, completedRounds: 3 },
  };
  assert.equal(parseOdoShowDirectorState(hostState).ok, true);
  assert.equal(parseOdoShowDirectorState({ ...hostState, currentScene: 'invented' }).ok, false);
});

test('future Studio control is a closed shared command vocabulary', () => {
  assert.deepEqual(BETWEENER_STUDIO_COMMANDS, [
    'TAKE_CONTROL', 'RESUME_ODO', 'SET_SCENE', 'SET_QUICK_CONNECT_LAYOUT',
    'PLAY_MUSIC', 'PAUSE_MUSIC', 'NEXT_TRACK', 'SET_MUSIC_MOOD',
    'SET_MUSIC_VOLUME', 'ENABLE_AUTO_DUCK', 'DISABLE_AUTO_DUCK',
    'OPEN_AUDIENCE_PULSE', 'START_INTERMISSION', 'FINISH_CURRENT_CONNECTIONS',
  ]);
});
