import test from 'node:test';
import assert from 'node:assert/strict';
import { reconcileFetchedThreadRows } from '../lib/chat/loading/thread-fetch-reconciler.ts';

test('preserves local media and monotonic receipts while filtering hidden rows', () => {
  const previous = [{ id: 'one', senderId: 'peer', text: '', timestamp: new Date(), type: 'image', reactions: [], status: 'read', offlineImageUri: 'file://one' }] as any;
  const result = reconcileFetchedThreadRows({
    rows: [{ id: 'one' }, { id: 'hidden' }, { id: 'two' }], previousMessages: previous,
    hiddenMessageIds: new Set(['hidden']), isIncrementalFetch: false,
    mapRow: (row) => ({ id: row.id, senderId: 'peer', text: '', timestamp: new Date(), type: 'image', reactions: [], status: 'sent' } as any),
    mergeOfflineMedia: (next, old) => ({ ...next, offlineImageUri: old?.offlineImageUri }),
    mergeReceipt: (old, next) => ({ ...next, status: old.status }),
  });
  assert.deepEqual(result.map((message) => message.id), ['two', 'one']);
  assert.equal(result[1].offlineImageUri, 'file://one');
  assert.equal(result[1].status, 'read');
});
