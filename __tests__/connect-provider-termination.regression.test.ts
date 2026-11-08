import assert from 'node:assert/strict';
import test from 'node:test';
import { createConnectStreamAdapter, type StreamServerPort } from '../supabase/functions/_shared/connect-stream-adapter.ts';
import { runConnectEndJob } from '../supabase/functions/_shared/connect-provider-worker.ts';

const id = 'fa120000-0000-4000-8000-000000000001';
const ended = '2026-11-03T12:00:00.000Z';
function fixture() {
  const events: string[] = [], completions: boolean[] = [];
  const call = {
    async end() { events.push('end'); return { duration: '1ms', metadata: { responseCode: 200 } }; },
    async get(): Promise<unknown> { events.push('get'); return { call: { id, type: 'betweener_connect', ended_at: ended } }; },
  };
  const stream = { async getApp() { events.push('app'); return { app: { id: 1731011, disable_auth_checks: false, disable_permissions_checks: false } }; },
    video: { call(type: string, selected: string) { assert.equal(type, 'betweener_connect'); assert.equal(selected, id); return call; } } };
  const adapter = createConnectStreamAdapter(stream as unknown as StreamServerPort, 1731011);
  const run = () => runConnectEndJob({ call_id: id, operation: 'end', lease: 'synthetic-lease' },
    { async complete(_job, success) { completions.push(success); } }, adapter);
  return { call, events, completions, adapter, run };
}

test('provider cleanup needs a scoped ended readback after its accepted End response', async () => {
  const f = fixture(); assert.deepEqual(await f.run(), { success: true });
  assert.deepEqual(f.events, ['app', 'end', 'get']); assert.deepEqual(f.completions, [true]);
  assert.equal((await f.adapter.end({ id })).mediaEnforcement, 'unverified');
});

for (const call of [
  { id, type: 'betweener_connect', ended_at: null },
  { id, type: 'betweener_connect', ended_at: 'invalid' },
  { id, type: 'betweener_connect', ended_at: '0' },
  { id, type: 'betweener_connect', ended_at: '2026-11-03' },
  { id, type: 'betweener_connect', ended_at: new Date(NaN) },
  { id, type: 'betweener_connect', ended_at: true },
  { id, type: 'default', ended_at: ended },
  { id: 'another-call', type: 'betweener_connect', ended_at: ended },
  { id, type: 'betweener_connect', session: { ended_at: ended } },
  null,
]) test(`non-terminal or mismatched provider readback stays pending: ${JSON.stringify(call)}`, async () => {
  const f = fixture(); f.call.get = async () => ({ call });
  assert.deepEqual(await f.run(), { success: false }); assert.deepEqual(f.completions, [false]);
});

for (const error of [new Error('offline'), { code: 16 }, { code: 16, metadata: { responseCode: 503 } },
  { code: 17, metadata: { responseCode: 404 } }, { code: 16, metadata: { responseCode: 403 } }]) {
  test(`failed readback never clears cleanup: ${JSON.stringify(error)}`, async () => {
    const f = fixture(); f.call.get = async () => { throw error; };
    assert.deepEqual(await f.run(), { success: false }); assert.deepEqual(f.completions, [false]);
  });
}

test('scoped authenticated absence after accepted End is control-plane absence only', async () => {
  const f = fixture(); f.call.get = async () => { throw { code: 16, metadata: { responseCode: 404 } }; };
  assert.deepEqual(await f.adapter.end({ id }), { type: 'betweener_connect', id, outcome: 'absent', mediaEnforcement: 'unverified' });
});

test('a delayed provider transition stays retryable until a later worker confirms it', async () => {
  const f = fixture(); f.call.get = async () => ({ call: { id, type: 'betweener_connect', ended_at: null } });
  assert.equal((await f.run()).success, false);
  f.call.get = async () => ({ call: { id, type: 'betweener_connect', ended_at: ended } });
  assert.equal((await f.run()).success, true); assert.deepEqual(f.completions, [false, true]);
});

test('an SDK Date timestamp is accepted only as scoped control-plane state', async () => {
  const f = fixture(); f.call.get = async () => ({ call: { id, type: 'betweener_connect', ended_at: new Date(ended) } });
  assert.equal((await f.run()).success, true);
});
