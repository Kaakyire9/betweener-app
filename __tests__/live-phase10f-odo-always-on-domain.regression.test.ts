import assert from 'node:assert/strict';
import test from 'node:test';

import {
  LIVE_ALWAYS_ON_AVAILABILITY_STATES,
  LIVE_ALWAYS_ON_OPPORTUNITY_STATES,
} from '../features/live/always-on/live-always-on-contracts.ts';
import { getLiveAlwaysOnAvailabilityErrorMessage } from '../features/live/always-on/live-always-on-errors.ts';
import { parseLiveAlwaysOnSnapshot } from '../features/live/always-on/live-always-on-validation.ts';
import {
  LIVE_PROGRAM_OUTPUT_SOURCES,
  ODO_CONTROL_SOURCES,
  ODO_PROGRAM_SOURCES,
} from '../features/live/odo/show/odo-show-contracts.ts';

const snapshot = {
  schemaVersion: 1,
  serverNow: '2026-09-09T12:00:00.000Z',
  available: true,
  unavailableReasonCode: null,
  durationOptionsMinutes: [15, 30, 60],
  availability: {
    status: 'reserved',
    expiresAt: '2026-09-09T12:30:00.000Z',
    marketContext: 'internal',
    cooldownUntil: null,
    notTonightUntil: null,
    version: 2,
  },
  opportunity: {
    id: '10000000-0000-4000-8000-000000000001',
    state: 'awaiting_quorum',
    myState: 'invited',
    expiresAt: '2026-09-09T12:02:00.000Z',
    acceptedCount: 1,
    minimumCount: 2,
    sessionId: null,
    reasonCode: 'invitations_sent',
  },
};

test('Always-On availability and formation snapshots are closed, private contracts', () => {
  assert.equal(parseLiveAlwaysOnSnapshot(snapshot).ok, true);
  assert.equal(parseLiveAlwaysOnSnapshot({ ...snapshot, compatibleUsers: ['a', 'b'] }).ok, false);
  assert.equal(parseLiveAlwaysOnSnapshot({
    ...snapshot,
    opportunity: { ...snapshot.opportunity, declinedUsers: ['c'] },
  }).ok, false);
  assert.equal(parseLiveAlwaysOnSnapshot({
    ...snapshot,
    opportunity: { ...snapshot.opportunity, id: 'not-a-uuid' },
  }).ok, false);
});

test('availability and opportunity state vocabularies stay distinct', () => {
  assert.deepEqual(LIVE_ALWAYS_ON_AVAILABILITY_STATES, [
    'available', 'reserved', 'consumed', 'withdrawn', 'expired', 'paused', 'invalidated',
  ]);
  assert.deepEqual(LIVE_ALWAYS_ON_OPPORTUNITY_STATES, [
    'inviting', 'awaiting_quorum', 'quorum_reached', 'creating_session', 'starting', 'live',
  ]);
  assert.equal(LIVE_ALWAYS_ON_AVAILABILITY_STATES.includes('online' as never), false);
});

test('availability failures remain actionable without exposing policy detail', () => {
  assert.equal(
    getLiveAlwaysOnAvailabilityErrorMessage('live_availability_profile_ineligible'),
    'Complete your profile verification before becoming available.',
  );
  assert.equal(
    getLiveAlwaysOnAvailabilityErrorMessage('live_availability_active_live_conflict'),
    'Leave your current Live or Private Spark before becoming available.',
  );
  assert.equal(
    getLiveAlwaysOnAvailabilityErrorMessage('database internals changed'),
    'Could not update availability. Please try again.',
  );
});

test('future Studio controller and programme output sources are explicit', () => {
  assert.deepEqual(ODO_CONTROL_SOURCES, ['odo', 'mobile_host', 'studio_host', 'system']);
  assert.deepEqual(ODO_PROGRAM_SOURCES, ['mobile', 'studio', 'system']);
  assert.deepEqual(LIVE_PROGRAM_OUTPUT_SOURCES, [
    'host_camera', 'active_pair', 'quick_connect_pool', 'odo_stage',
    'audience_pulse', 'branded_visual', 'screen_share',
  ]);
});
