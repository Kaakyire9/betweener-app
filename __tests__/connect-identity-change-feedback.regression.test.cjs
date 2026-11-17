const test = require('node:test'), assert = require('node:assert/strict');
const { fixture } = require('./fixtures/connect-product-fixture.cjs');
const { createConnectTerminalLogger } = require('../features/connect/diagnostics/connect-terminal-logger.ts');
const { audioSetupMessage } = require('../features/connect/voice/audio-setup.ts');

test('identity change during outgoing key setup shows the existing review guidance and never starts media', async () => {
  const f = fixture(false, { wrapApi: api => ({ ...api, createCall: async () => { throw Error('connect_peer_key_changed'); } }) });
  try {
    await f.start(); const view = f.composition.controller.getSnapshot();
    assert.equal(view.phase, 'FAILED'); assert.equal(view.session, null);
    assert.equal(view.error, audioSetupMessage({ stage: 'credentials', code: 'call_identity_changed', missingNativeApis: [] }));
    assert.equal(f.counts().credentialCount, 0);
    assert.equal(f.events.includes('client-created'), false); assert.equal(f.events.includes('capture'), false);
  } finally { await f.product.dispose(); }
});

test('identity-change diagnostics retain only the exact closed code and exclude arbitrary error text', async () => {
  const lines = [], trace = createConnectTerminalLogger({ development: true, platform: 'android', variant: 'staging', environment: 'development',
    bundleIdentifier: 'com.aduboffour.betweener.staging', supabaseUrl: 'https://xsgzxadwuxuziubglvps.supabase.co' }, { sink: line => lines.push(line) });
  try {
    for (const message of ['connect_peer_key_changed', 'connect_peer_key_changed PRIVATE_SENTINEL']) {
      const api = trace.wrapApi({ createCall: async () => { throw Error(message); } });
      await assert.rejects(api.createCall());
    }
    const failures = lines.map(line => JSON.parse(line.slice('[Connect] '.length))).filter(row => row.event === 'request_failed');
    assert.deepEqual(failures.map(row => row.code), ['connect_peer_key_changed', 'unclassified_failure']);
    assert.equal(lines.join('').includes('PRIVATE_SENTINEL'), false);
  } finally { trace.dispose(); }
});
