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
