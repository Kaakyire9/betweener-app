import assert from 'node:assert/strict';
import test from 'node:test';

import {
  isDatingNotEligibleError,
  isTerminalDatingEligibilityMutation,
} from '../lib/offline/dating-eligibility-terminal.ts';

test('recognizes the canonical PostgreSQL eligibility rejection', () => {
  assert.equal(
    isDatingNotEligibleError({ code: 'P0001', message: 'dating_not_eligible' }),
    true,
  );
  assert.equal(isDatingNotEligibleError('P0001: dating_not_eligible'), true);
});

test('does not hide unrelated database or network failures', () => {
  assert.equal(isDatingNotEligibleError({ code: 'P0001', message: 'another_guard' }), false);
  assert.equal(isDatingNotEligibleError(new Error('Network request failed')), false);
  assert.equal(isDatingNotEligibleError('dating_not_eligible'), false);
});

test('prunes only terminal swipe and intent-create queue entries', () => {
  for (const kind of ['swipe_sync', 'intent_request_create']) {
    assert.equal(
      isTerminalDatingEligibilityMutation({
        kind,
        failureReason: 'P0001: dating_not_eligible',
      }),
      true,
    );
  }

  assert.equal(
    isTerminalDatingEligibilityMutation({
      kind: 'profile_update',
      failureReason: 'P0001: dating_not_eligible',
    }),
    false,
  );
  assert.equal(
    isTerminalDatingEligibilityMutation({
      kind: 'swipe_sync',
      failureReason: '503: service unavailable',
    }),
    false,
  );
});
