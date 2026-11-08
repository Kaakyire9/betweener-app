const test = require('node:test'), assert = require('node:assert/strict');
const { runConnectProviderBatch } = require('../supabase/functions/_shared/connect-provider-batch.ts');
function fixture(count = 8) {
  const queue = Array.from({ length: count }, (_, n) => ({ call_id: String(n), operation: 'end', lease: `lease-${n}` }));
  const ends = [], completed = [];
  const provider = { async end({ id }) { ends.push(id); return { type: 'betweener_connect', id, outcome: 'accepted', mediaEnforcement: 'unverified' }; } };
  const store = { async claim() { return queue.shift() ?? null; }, async complete(job, success) { completed.push([job.call_id, success]); },
    async snapshot() { throw Error('cleanup must not require a live session'); }, async reconcile() { throw Error('end is not media evidence'); } };
  return { queue, ends, completed, store, provider };
}
test('a disabled empty queue preserves the existing no-op response and performs no provider work', async () => {
  const f = fixture(0); assert.deepEqual(await runConnectProviderBatch(f.store, f.provider), { processed: false }); assert.deepEqual(f.ends, []);
});
test('one invocation drains at most four leased jobs without changing claim priority', async () => {
  const f = fixture(); assert.deepEqual(await runConnectProviderBatch(f.store, f.provider), { processed: true, success: true, completed: 4, failed: 0 });
  assert.deepEqual(f.ends, ['0', '1', '2', '3']); assert.equal(f.queue.length, 4);
});
test('an exhausted time budget stops before another claim but finishes its owned job', async () => {
  const f = fixture(); let clock = 0; f.provider.end = async ({ id }) => { clock = 100; return { type: 'betweener_connect', id, outcome: 'accepted', mediaEnforcement: 'unverified' }; };
  assert.deepEqual(await runConnectProviderBatch(f.store, f.provider, { budgetMs: 50, now: () => clock }), { processed: true, success: true, completed: 1, failed: 0 });
  assert.equal(f.queue.length, 7);
});
test('provider outage stays retryable while independent cleanup continues within the limit', async () => {
  const f = fixture(); const end = f.provider.end; f.provider.end = input => input.id === '0' ? Promise.reject(Error('outage')) : end(input);
  assert.deepEqual(await runConnectProviderBatch(f.store, f.provider), { processed: true, success: false, completed: 3, failed: 1 });
  assert.deepEqual(f.completed[0], ['0', false]);
});
test('ambiguous completion stops the batch instead of retrying or claiming more work', async () => {
  const f = fixture(); let acknowledgements = 0; f.store.complete = async () => { acknowledgements++; throw Error('ack_unknown'); };
  await assert.rejects(runConnectProviderBatch(f.store, f.provider), /ack_unknown/); assert.equal(f.queue.length, 7); assert.deepEqual(f.ends, ['0']);
  assert.equal(acknowledgements, 1, 'an unknown completion cannot be overwritten by a speculative failure ACK');
});
test('a repeated lease cannot run its provider operation twice', async () => {
  const f = fixture(); f.queue[1].lease = f.queue[0].lease;
  await assert.rejects(runConnectProviderBatch(f.store, f.provider), /lease_repeated/); assert.deepEqual(f.ends, ['0']);
});

for (const operation of ['create', 'sync']) test(`${operation} completion ambiguity performs exactly one database write`, async () => {
  const f = fixture(1); f.queue[0].operation = operation; f.store.snapshot = async () => null;
  let writes = 0; f.store.complete = async () => { writes++; throw Error('ack_unknown'); };
  await assert.rejects(runConnectProviderBatch(f.store, f.provider), /ack_unknown/); assert.equal(writes, 1); assert.deepEqual(f.ends, []);
});
