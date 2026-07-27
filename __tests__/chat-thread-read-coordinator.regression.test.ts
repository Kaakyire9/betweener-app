import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ChatThreadReadCoordinator,
  getLatestIncomingMessageTimestamp,
} from '../lib/chat/read-state/chat-thread-read-coordinator.ts';

test('derives the latest incoming message timestamp only from the peer', () => {
  const timestamp = getLatestIncomingMessageTimestamp([
    { id: 'mine', senderId: 'me', timestamp: new Date(30) },
    { id: 'old', senderId: 'peer', timestamp: new Date(10) },
    { id: 'new', senderId: 'peer', timestamp: new Date(20) },
  ] as any, 'peer');
  assert.equal(timestamp, 20);
});

test('deduplicates completed reads but allows an explicit remote refresh', async () => {
  const coordinator = new ChatThreadReadCoordinator();
  let local = 0;
  let snapshot = 0;
  let remote = 0;
  const operation = (forceRemote = false) => ({
    currentUserId: 'me', peerUserId: 'peer', forceRemote,
    persistLocal: async () => { local += 1; },
    persistSnapshot: async () => { snapshot += 1; },
    markRemote: async () => { remote += 1; return {}; },
  });

  await coordinator.acknowledge(operation());
  await coordinator.acknowledge(operation());
  await coordinator.acknowledge(operation(true));
  assert.deepEqual({ local, snapshot, remote }, { local: 2, snapshot: 2, remote: 2 });
});
