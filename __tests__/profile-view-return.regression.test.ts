import assert from 'node:assert/strict';
import test from 'node:test';
import { getProfileViewReturnCircleId } from '../lib/profile/profile-view-return.ts';

test('returns the Circle id for profiles opened from a Circle', () => {
  assert.equal(
    getProfileViewReturnCircleId({
      source: 'circle',
      returnCircleId: 'circle-1',
    }),
    'circle-1',
  );
});

test('does not override profile back navigation for other entry points', () => {
  assert.equal(
    getProfileViewReturnCircleId({
      source: 'chat',
      returnCircleId: 'circle-1',
    }),
    null,
  );
  assert.equal(getProfileViewReturnCircleId({ source: 'circle' }), null);
});
