import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getProfileViewContextCircleId,
  getProfileViewReturnCircleId,
  shouldReturnToCirclesHome,
  shouldReturnToVibes,
} from '../lib/profile/profile-view-return.ts';

test('returns the Circle id for profiles opened from a Circle', () => {
  assert.equal(
    getProfileViewReturnCircleId({
      source: 'circle',
      returnCircleId: 'circle-1',
    }),
    'circle-1',
  );
});

test('keeps Circle Pick romantic context while returning to Circles Home', () => {
  const params = {
    source: 'circles_home',
    contextCircleId: 'circle-2',
  };
  assert.equal(getProfileViewContextCircleId(params), 'circle-2');
  assert.equal(getProfileViewReturnCircleId(params), null);
  assert.equal(shouldReturnToCirclesHome(params), true);
});

test('supports legacy Circle Discover links without treating other sources as Circle context', () => {
  assert.equal(getProfileViewContextCircleId({ source: 'circle_discover', returnCircleId: 'circle-3' }), 'circle-3');
  assert.equal(getProfileViewReturnCircleId({ source: 'circle_discover', returnCircleId: 'circle-3' }), 'circle-3');
  assert.equal(getProfileViewReturnCircleId({ source: 'circle_people', returnCircleId: 'circle-3' }), 'circle-3');
  assert.equal(getProfileViewContextCircleId({ source: 'chat', returnCircleId: 'circle-3' }), null);
});

test('Vibes profile links have an explicit resilient return destination', () => {
  assert.equal(shouldReturnToVibes({ source: 'vibes' }), true);
  assert.equal(shouldReturnToVibes({ source: 'circles_home' }), false);
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
