import assert from 'node:assert/strict';
import test from 'node:test';

import { canModerateCircle } from '../lib/circles/circle-access.ts';

const profile = { id: 'profile-1', user_id: 'user-1' };

test('Circle matchmakers do not silently inherit moderation authority', () => {
  assert.equal(canModerateCircle(null, profile, { role: 'matchmaker' }), false);
  assert.equal(canModerateCircle(null, profile, { role: 'moderator' }), true);
  assert.equal(canModerateCircle(null, profile, { role: 'host' }), true);
});

test('Circle ownership and internal admin remain moderation authorities', () => {
  assert.equal(canModerateCircle({ created_by_user_id: 'user-1' }, profile, null), true);
  assert.equal(canModerateCircle(null, { ...profile, is_internal_admin: true }, null), true);
});
