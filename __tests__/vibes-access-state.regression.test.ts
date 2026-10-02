// @ts-nocheck
import test from 'node:test';
import assert from 'node:assert/strict';

import { deriveVibesAccessReason } from '../lib/vibes/vibes-access-state.ts';

const ready = {
  account_state: 'active',
  is_active: true,
  profile_completed: true,
  profile_moderation_state: 'CLEAR',
  matchmaking_mode: false,
  discoverable_in_vibes: true,
};

test('healthy visible profiles can use Vibes', () => {
  assert.equal(deriveVibesAccessReason(ready), null);
});

test('visibility is identified when it is the sole blocker', () => {
  assert.equal(
    deriveVibesAccessReason({ ...ready, discoverable_in_vibes: false }),
    'visibility_off',
  );
});

test('matchmaking mode takes precedence over its forced hidden state', () => {
  assert.equal(
    deriveVibesAccessReason({
      ...ready,
      matchmaking_mode: true,
      discoverable_in_vibes: false,
    }),
    'matchmaking_mode',
  );
});

test('completion and moderation blockers do not offer unsafe one-tap visibility', () => {
  assert.equal(
    deriveVibesAccessReason({
      ...ready,
      profile_moderation_state: 'ACTION_REQUIRED',
      discoverable_in_vibes: false,
    }),
    'moderation_hidden',
  );
  assert.equal(
    deriveVibesAccessReason({
      ...ready,
      profile_completed: false,
      profile_moderation_state: 'ACTION_REQUIRED',
      discoverable_in_vibes: false,
    }),
    'profile_incomplete',
  );
});

test('explicitly inactive accounts fail closed', () => {
  assert.equal(
    deriveVibesAccessReason({ ...ready, account_state: 'suspended' }),
    'account_unavailable',
  );
  assert.equal(
    deriveVibesAccessReason({ ...ready, is_active: false }),
    'account_unavailable',
  );
});

test('loading and legacy profiles without explicit blockers are not falsely blocked', () => {
  assert.equal(deriveVibesAccessReason(null), null);
  assert.equal(deriveVibesAccessReason({}), null);
});
