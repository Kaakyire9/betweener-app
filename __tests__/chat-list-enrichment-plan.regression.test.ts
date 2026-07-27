import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildChatListEnrichmentPlan,
  getPeerUserIdsNeedingLocalHistory,
} from '../lib/chat/sync/chat-list-enrichment-plan.ts';

test('reuses accepted-match profiles and fetches only missing chat-list profiles', () => {
  const plan = buildChatListEnrichmentPlan(
    ['peer-a', 'peer-b', 'peer-a', '', 'peer-c'],
    ['peer-a', 'peer-c', 'not-in-chat-list'],
  );

  assert.deepEqual(plan.peerUserIds, ['peer-a', 'peer-b', 'peer-c']);
  assert.deepEqual(plan.missingProfileUserIds, ['peer-b']);
  assert.equal(plan.reusedProfileCount, 2);
});

test('fetches all chat-list profiles when accepted-match hydration is unavailable', () => {
  const plan = buildChatListEnrichmentPlan(['peer-a', 'peer-b'], []);

  assert.deepEqual(plan.missingProfileUserIds, ['peer-a', 'peer-b']);
  assert.equal(plan.reusedProfileCount, 0);
});

test('skips local history reads for peers already represented in the conversation list', () => {
  const missing = getPeerUserIdsNeedingLocalHistory(
    ['peer-a', 'peer-b', 'peer-a'],
    new Set(['peer-a', 'peer-b']),
  );

  assert.deepEqual(missing, []);
});
