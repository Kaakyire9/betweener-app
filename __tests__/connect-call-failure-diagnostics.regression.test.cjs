const test = require('node:test');
const assert = require('node:assert/strict');
const { invokePinnedConnectRpc } = require('../features/connect/data/authenticated-connect-services.ts');
const { createConnectTerminalLogger } = require('../features/connect/diagnostics/connect-terminal-logger.ts');
const { unverifiedShutdown } = require('../features/connect/media/local-shutdown.ts');
const { fixture, id } = require('./fixtures/connect-product-fixture.cjs');
const identity = { development: true, platform: 'android', variant: 'staging', environment: 'staging',
  bundleIdentifier: 'com.aduboffour.betweener.staging', supabaseUrl: 'https://xsgzxadwuxuziubglvps.supabase.co' };
function observable(value) { return { getSnapshot: () => value, subscribe: () => () => {} }; }

test('request deadline is distinguishable from network failure without changing UI or exposing the bearer', async () => {
  let signal, failure;
  const client = { schema: () => ({ rpc: () => ({ setHeader: () => ({ abortSignal(value) {
    signal = value;
    return new Promise((_resolve, reject) => { signal.addEventListener('abort', () => { const error = Error('SECRET_TRANSPORT'); error.name = 'AbortError'; reject(error); }); });
  } }) }) }) };
  try { await invokePinnedConnectRpc(client, 'synthetic', {}, 'SECRET_BEARER', 5); assert.fail('must time out'); }
  catch (error) { failure = error; }
  assert.equal(signal.aborted, true); assert.equal(failure.message, 'connect_unavailable'); assert.equal(failure.name, 'ConnectRpcTimeoutError');
  const lines = [], trace = createConnectTerminalLogger(identity, { sink: line => lines.push(line) });
  trace.serviceFailure('rpc', failure, id(10)); trace.serviceFailure('rpc', Error('Network request failed'), id(11)); trace.dispose();
  const rows = lines.map(line => JSON.parse(line.slice('[Connect] '.length)));
  assert.ok(rows.some(row => row.event === 'request_failed' && row.code === 'request_timeout'));
  assert.ok(rows.some(row => row.event === 'request_failed' && row.code === 'network_unavailable'));
  assert.equal(lines.join('').includes('SECRET'), false);
});

test('cleanup failure cannot appear as a successful call summary or alter authoritative history', () => {
  const lines = [], trace = createConnectTerminalLogger(identity, { sink: line => lines.push(line) });
  const state = { phase: 'ENDED', session: { id: id(10), state: 'ENDED' }, incoming: true, foreground: true, busy: false,
    muted: true, route: 'earpiece', routes: [], error: null, localShutdown: { ...unverifiedShutdown(), resourceRelease: 'failed' } };
  trace.watch(observable(state)); trace.dispose();
  const row = lines.map(line => JSON.parse(line.slice('[Connect] '.length))).findLast(row => row.event === 'call_summary');
  assert.equal(row.failed, true); assert.equal(row.cleanupFailed, true); assert.equal(row.encryptionFailed, false);
  assert.equal(row.serverState, 'ENDED'); assert.equal(state.session.state, 'ENDED');
});

test('native cleanup diagnostics retain only bounded reasons', () => {
  const lines = [], trace = createConnectTerminalLogger(identity, { sink: line => lines.push(line) });
  trace.watchOwner(observable({ cid: `betweener_connect:${id(10)}`, generation: 1, sdk: {}, operations: { release: 'failed' }, releaseFailure: 'SECRET_NATIVE_PAYLOAD' }));
  trace.dispose();
  const row = lines.map(line => JSON.parse(line.slice('[Connect] '.length))).find(row => row.event === 'native_cleanup_fault');
  assert.equal(row.reason, 'unknown'); assert.equal(lines.join('').includes('SECRET'), false);
});

test('owner fences SDK retirement before peer disposal and independent capture stop', async () => {
  const f = fixture(), events = [];
  try {
    await f.active(); f.handle.beginRetirement = () => { events.push('retirement'); };
    const close = f.handle.disposePublisher;
    f.handle.disposePublisher = async () => { assert.equal(events[0], 'retirement'); events.push('publisher'); await close(); };
    await f.composition.controller.hangup(); assert.ok(events.includes('publisher'));
  } finally { await f.product.dispose(); }
});

test('unconfirmed tracks retain native ownership and expose their cleanup reason', async () => {
  const f = fixture();
  try {
    await f.active(); const owner = f.composition.owner(), track = f.tracks[0];
    const stop = track.stop; track.stop = () => {};
    await f.composition.controller.hangup(); await assert.rejects(owner.release(), /unconfirmed/);
    assert.equal(owner.getSnapshot().releaseFailure, 'tracks_live');
    track.stop = stop; track.stop(); await owner.release();
    assert.equal(owner.getSnapshot().releaseFailure, undefined);
  } finally { await f.product.dispose(); }
});
