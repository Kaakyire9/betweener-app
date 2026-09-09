import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ODO_FULL_QUICK_CONNECT_ACTIONS,
} from '../features/live/odo/full-quick-connect/odo-full-quick-connect-contracts.ts';
import { deriveOdoFullQuickConnectDecision } from '../features/live/odo/full-quick-connect/odo-full-quick-connect-state-machine.ts';
import { parseOdoFullQuickConnectState } from '../features/live/odo/full-quick-connect/odo-full-quick-connect-validation.ts';

const input = {
  lifecycleState: 'active' as const,
  controlState: 'open' as const,
  sessionLive: true,
  circuitBreakerOpen: false,
  maximumRuntimeReached: false,
  activePairs: 0,
  eligiblePairs: 0,
  lowLiquidityElapsed: false,
};

test('the lifecycle policy opens only after explicit activation and never selects people', () => {
  assert.deepEqual(deriveOdoFullQuickConnectDecision({
    ...input,
    lifecycleState: 'preparing',
    controlState: 'closed',
  }), {
    action: 'OPEN_POOL',
    lifecycleState: 'starting',
    orchestrationState: 'waiting_for_pool_open',
    reasonCode: 'host_authorized_autopilot_open',
  });
  assert.equal(ODO_FULL_QUICK_CONNECT_ACTIONS.includes('SYNC_MATCHER'), true);
  assert.equal(ODO_FULL_QUICK_CONNECT_ACTIONS.some((action) =>
    /SELECT_PERSON|CHOOSE_PAIR|BYPASS_CONSENT|ISSUE_RTC/.test(action)), false);
});

test('active pairs are preserved and draining closes only after they finish', () => {
  assert.equal(deriveOdoFullQuickConnectDecision({
    ...input,
    lifecycleState: 'draining',
    controlState: 'draining',
    activePairs: 1,
  }).action, 'WAIT');
  assert.equal(deriveOdoFullQuickConnectDecision({
    ...input,
    lifecycleState: 'draining',
    controlState: 'draining',
  }).action, 'QUICK_CONNECT_CLOSING');
});

test('safety, runtime, liquidity and eligible-pair decisions fail closed', () => {
  assert.equal(deriveOdoFullQuickConnectDecision({
    ...input,
    circuitBreakerOpen: true,
  }).lifecycleState, 'paused_by_policy');
  assert.equal(deriveOdoFullQuickConnectDecision({
    ...input,
    maximumRuntimeReached: true,
  }).action, 'BEGIN_DRAINING');
  assert.equal(deriveOdoFullQuickConnectDecision({
    ...input,
    eligiblePairs: 1,
  }).action, 'SYNC_MATCHER');
  assert.equal(deriveOdoFullQuickConnectDecision({
    ...input,
    lowLiquidityElapsed: true,
  }).action, 'ENTER_LOW_LIQUIDITY');
});

test('the full Quick Connect projection parser rejects schema drift', () => {
  const state = {
    schemaVersion: 1,
    available: true,
    sessionId: '10000000-0000-4000-8000-000000000001',
    enabled: true,
    lifecycleState: 'active',
    orchestrationState: 'pair_active',
    energyMode: 'normal',
    controlState: 'open',
    limitedMode: false,
    healthState: 'healthy',
    stateVersion: 4,
    leaseGeneration: 2,
    metrics: { waitingPeople: 3, eligiblePairs: 1, activePairs: 1, completedRounds: 2 },
    lastActionType: 'PAIR_OBSERVED',
    lastReasonCode: 'automatcher_pair_observed',
    startedAt: '2026-09-08T12:00:00.000Z',
    maximumRuntimeEndsAt: '2026-09-08T13:30:00.000Z',
    nextWakeAt: '2026-09-08T12:00:15.000Z',
    unavailableReasonCode: null,
  };
  assert.equal(parseOdoFullQuickConnectState(state).ok, true);
  assert.equal(parseOdoFullQuickConnectState({ ...state, chosenPair: ['a', 'b'] }).ok, false);
  assert.equal(parseOdoFullQuickConnectState({
    ...state,
    orchestrationState: 'invented_state',
  }).ok, false);
});
