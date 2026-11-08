const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm');
const { webcrypto } = require('node:crypto'), ts = require('typescript');
const { runConnectProviderBatch } = require('../supabase/functions/_shared/connect-provider-batch.ts');
const { assertConnectJobAcknowledged } = require('../supabase/functions/_shared/connect-provider-worker.ts');
const { verifyConnectWebhook } = require('../supabase/functions/_shared/connect-webhook.ts');
const secret = 'synthetic-worker-test-only', call = 'f0110000-0000-4000-8000-000000000003';
function fixture({ cleanup = false, outage = false, ack = true } = {}) {
  let serve, privileged = 0, provider = 0, issued = 0; const rpcs = [], completions = [];
  const queue = cleanup ? [{ call_id: call, operation: 'end', lease: 'test-lease' }] : [];
  const source = fs.readFileSync('supabase/functions/connect-provider-worker/index.ts', 'utf8').replace(/^import .*;\r?\n/gm, '');
  vm.runInNewContext(ts.transpile(source, { module: ts.ModuleKind.CommonJS }), {
    Deno: { serve: handler => { serve = handler; } }, crypto: webcrypto, TextEncoder,
    connectEnv: name => { assert.equal(name, 'CONNECT_WORKER_SECRET'); return secret; },
    connectJson: (data, status = 200) => Response.json(data, { status }), verifyConnectWebhook, runConnectProviderBatch, assertConnectJobAcknowledged,
    connectBackend() { privileged++; return { service: {}, adapter: {
      async end({ id }) { provider++; if (outage) throw Error('synthetic_outage'); return { type: 'betweener_connect', id, outcome: 'accepted', mediaEnforcement: 'unverified' }; },
      async provision() { throw Error('disabled fixture must not create calls'); }, credentials() { issued++; throw Error('worker must not issue credentials'); },
    } }; },
    async connectRpc(_service, name, args) {
      rpcs.push(name);
      if (name === 'rpc_connect_sweep') return null;
      if (name === 'rpc_connect_claim_job') return queue.shift() ?? null;
      if (name === 'rpc_connect_claim_native_destination') return null;
      if (name === 'rpc_connect_complete_job') { completions.push(args.p_success); return ack; }
      throw Error('unexpected_privileged_operation');
    },
  });
  return { serve, rpcs, completions, counts: () => ({ privileged, provider, issued }) };
}
function request(value = secret) { return new Request('http://127.0.0.1/worker-fixture', { method: 'POST', headers: value ? { 'x-connect-worker-secret': value } : {} }); }
for (const supplied of ['', 'wrong-worker-secret']) test(`actual worker rejects ${supplied ? 'incorrect' : 'missing'} authentication before privileged work`, async () => {
  const f = fixture(); assert.equal((await f.serve(request(supplied))).status, 401); assert.deepEqual(f.counts(), { privileged: 0, provider: 0, issued: 0 }); assert.deepEqual(f.rpcs, []);
});
test('actual authenticated worker retains the installed disabled no-op response without provider work', async () => {
  const f = fixture(), response = await f.serve(request()); assert.equal(response.status, 200); assert.deepEqual(await response.json(), { processed: false });
  assert.deepEqual(f.rpcs, ['rpc_connect_sweep', 'rpc_connect_claim_job', 'rpc_connect_claim_native_destination']); assert.deepEqual(f.counts(), { privileged: 1, provider: 0, issued: 0 });
});
test('admission being disabled does not suppress an already-owned termination job', async () => {
  const f = fixture({ cleanup: true }), response = await f.serve(request()); assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { processed: true, success: true, completed: 1, failed: 0 });
  assert.deepEqual(f.completions, [true]); assert.equal(f.counts().issued, 0);
});
test('provider outage retains retryable cleanup and an ambiguous database ACK stops further work', async () => {
  const f = fixture({ cleanup: true, outage: true }); assert.equal((await f.serve(request())).status, 200); assert.deepEqual(f.completions, [false]);
  const unknown = fixture({ cleanup: true, ack: false }); assert.equal((await unknown.serve(request())).status, 503);
  assert.deepEqual(unknown.completions, [true]); assert.equal(unknown.rpcs.filter(name => name === 'rpc_connect_claim_job').length, 1);
});
