import test from 'node:test';
import assert from 'node:assert/strict';
import { processThreadRealtimeMessage } from '../lib/chat/realtime/thread-realtime-message-processor.ts';

test('hydrates before mapping, then persists and advances the sync cursor', async () => {
  const steps: string[] = [];
  const result = await processThreadRealtimeMessage({
    row: { id: 'partial', created_at: 'one' },
    hydrate: async () => { steps.push('hydrate'); return { id: 'canonical', created_at: 'two' }; },
    map: (row) => { steps.push('map'); return { id: row.id }; },
    persist: async () => { steps.push('persist'); },
    markSyncSucceeded: async (cursor) => { steps.push(`sync:${cursor}`); },
    getCursor: (row) => row.created_at,
  });
  assert.deepEqual(result, { canonicalRow: { id: 'canonical', created_at: 'two' }, message: { id: 'canonical' } });
  assert.equal(steps[0], 'hydrate');
  assert.equal(steps[1], 'map');
  assert.deepEqual(new Set(steps.slice(2)), new Set(['persist', 'sync:two']));
});

test('out-of-order album events always persist the canonical ordered composition', async () => {
  type AlbumRow = {
    id: string;
    created_at: string;
    expected_attachment_count: number;
    media_items: { attachmentId: string; order: number }[];
  };

  const canonical: AlbumRow = {
    id: 'album-message',
    created_at: '2026-09-19T12:00:00.000Z',
    expected_attachment_count: 3,
    media_items: [
      { attachmentId: 'attachment-a', order: 0 },
      { attachmentId: 'attachment-b', order: 1 },
      { attachmentId: 'attachment-c', order: 2 },
    ],
  };
  const persisted: AlbumRow[] = [];
  const hydrate = async () => canonical;
  const map = (row: AlbumRow) => ({
    ...row,
    media_items: [...row.media_items].sort((a, b) => a.order - b.order),
  });

  await processThreadRealtimeMessage({
    row: canonical,
    hydrate,
    map,
    persist: async (message) => { persisted.push(message); },
    markSyncSucceeded: async () => undefined,
    getCursor: (row) => row.created_at,
  });
  await processThreadRealtimeMessage({
    row: {
      ...canonical,
      created_at: '2026-09-19T11:59:59.000Z',
      expected_attachment_count: 1,
      media_items: [{ attachmentId: 'attachment-c', order: 2 }],
    },
    hydrate,
    map,
    persist: async (message) => { persisted.push(message); },
    markSyncSucceeded: async () => undefined,
    getCursor: (row) => row.created_at,
  });

  assert.equal(persisted.length, 2);
  assert.deepEqual(persisted[0]?.media_items, canonical.media_items);
  assert.deepEqual(persisted[1]?.media_items, canonical.media_items);
  assert.equal(persisted[1]?.expected_attachment_count, 3);
});
