import test from 'node:test';
import assert from 'node:assert/strict';

import { ChatReadReceiptBatcher } from '../lib/chat/read-state/chat-read-receipt-batcher.ts';

test('batches visible receipts and persists the thread once', async () => {
  const remote: string[][] = [];
  const local: string[] = [];
  const batcher = new ChatReadReceiptBatcher({
    delayMs: 5,
    markRemoteRead: async (ids) => { remote.push(ids); },
    persistThreadRead: async (userId, peerId) => { local.push(`${userId}:${peerId}`); },
  });
  batcher.enqueue({ messageId: 'one', currentUserId: 'me', peerUserId: 'peer' });
  batcher.enqueue({ messageId: 'two', currentUserId: 'me', peerUserId: 'peer' });
  await new Promise((resolve) => setTimeout(resolve, 25));

  assert.deepEqual(remote, [['one', 'two']]);
  assert.deepEqual(local, ['me:peer']);
});

test('dispose cancels pending receipts', async () => {
  let remoteCalls = 0;
  const batcher = new ChatReadReceiptBatcher({
    delayMs: 15,
    markRemoteRead: async () => { remoteCalls += 1; },
    persistThreadRead: async () => undefined,
  });
  batcher.enqueue({ messageId: 'one', currentUserId: 'me', peerUserId: 'peer' });
  batcher.dispose();
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(remoteCalls, 0);
});
