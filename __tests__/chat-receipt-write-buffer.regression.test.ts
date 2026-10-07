import assert from 'node:assert/strict';
import test from 'node:test';

import { createChatReceiptWriteBuffer } from '../lib/chat/local/chat-receipt-write-buffer.ts';

const ranks = { sent: 1, delivered: 2, read: 3 } as const;
const write = (messageId: string, status: keyof typeof ranks) => ({
  ownerUserId: 'owner-1',
  threadId: 'thread-1',
  messageId,
  status,
});

test('coalesces duplicate receipts and retains the strongest state', async () => {
  const batches: ReturnType<typeof write>[][] = [];
  const buffer = createChatReceiptWriteBuffer<keyof typeof ranks>({
    getStatusRank: (status) => ranks[status],
    persist: async (writes) => {
      batches.push(writes);
    },
  });

  await Promise.all([
    buffer.enqueue(write('message-1', 'sent')),
    buffer.enqueue(write('message-1', 'read')),
    buffer.enqueue(write('message-1', 'delivered')),
  ]);

  assert.equal(batches.length, 1);
  assert.deepEqual(batches[0], [write('message-1', 'read')]);
});

test('collapses updates arriving behind an active write into one trailing batch', async () => {
  const batches: ReturnType<typeof write>[][] = [];
  let releaseFirst!: () => void;
  const firstBlocked = new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });
  const buffer = createChatReceiptWriteBuffer<keyof typeof ranks>({
    getStatusRank: (status) => ranks[status],
    persist: async (writes) => {
      batches.push(writes);
      if (batches.length === 1) await firstBlocked;
    },
  });

  const first = buffer.enqueue(write('message-1', 'sent'));
  await Promise.resolve();
  const trailing = [
    buffer.enqueue(write('message-2', 'sent')),
    buffer.enqueue(write('message-2', 'read')),
    buffer.enqueue(write('message-3', 'delivered')),
  ];
  releaseFirst();
  await Promise.all([first, ...trailing]);

  assert.equal(batches.length, 2);
  assert.deepEqual(batches[1], [
    write('message-2', 'read'),
    write('message-3', 'delivered'),
  ]);
});
