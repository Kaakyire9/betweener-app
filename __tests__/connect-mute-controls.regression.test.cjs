// Offline app/native-owner tests. SDK mute ordering is exercised without native media or networking.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const { fixture, deferred, settle } = require('./fixtures/connect-product-fixture.cjs');
const { createConnectTerminalLogger } = require('../features/connect/diagnostics/connect-terminal-logger.ts');

const moduleScope = { exports: {} };
vm.runInNewContext(ts.transpile(fs.readFileSync('node_modules/@stream-io/video-client/src/devices/DeviceManager.ts', 'utf8'),
  { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }), {
  module: moduleScope, exports: moduleScope.exports,
  require: name => name === '../store' ? { CallingState: { JOINED: 'joined' } } : {},
});
const { DeviceManager } = moduleScope.exports;

function installedSdkMute(f, gate) {
  const capture = f.tracks.at(-1), order = [];
  const emergencyDisable = f.handle.disableMicrophone;
  let first = true;
  const stream = { getTracks: () => [capture], release() { order.push('sdk-release'); capture.release(); } };
  const device = Object.create(DeviceManager.prototype);
  Object.assign(device, {
    call: { state: { callingState: 'joined' } }, logger: { debug() {} }, filters: [],
    state: { mediaStream: stream, setMediaStream(value) { this.mediaStream = value; } },
    async stopPublishStream() {
      order.push('unpublish');
      assert.equal(capture.enabled, false, 'capture must be silenced immediately');
      assert.equal(capture.readyState, 'live', 'ordinary mute must not destroy the SDK capture before unpublish');
      assert.equal(f.events.includes('track-release'), false, 'native release must follow SDK unpublish');
      if (gate) await gate.promise;
    },
    async stopActiveVirtualSession() {}, runCurrentStreamCleanups() {}, setLocalInterrupted() {},
  });
  f.handle.disableMicrophone = async () => {
    if (!first) return emergencyDisable();
    first = false;
    await device.muteStream(true);
    f.sdkState.microphoneStatus = 'disabled'; f.sdkState.audioPublishing = false;
  };
  return { capture, order };
}

test('ordinary mute uses installed SDK unpublish ordering and leaves the other owner unmuted', async () => {
  const local = fixture(), peer = fixture();
  try {
    await local.active(); await peer.active();
    const { capture, order } = installedSdkMute(local);
    await local.composition.controller.toggleMute();
    assert.deepEqual(order, ['unpublish', 'sdk-release']);
    assert.equal(capture.readyState, 'ended');
    assert.equal(local.composition.controller.getSnapshot().muted, true);
    assert.equal(local.composition.controller.getSnapshot().phase, 'ACTIVE');
    assert.equal(local.composition.controller.getSnapshot().error, null);
    assert.equal(peer.composition.controller.getSnapshot().muted, false);
    assert.equal(peer.sdkState.audioPublishing, true);
    assert.equal(peer.events.includes('track-release'), false);
    await local.composition.controller.toggleMute();
    assert.equal(local.composition.controller.getSnapshot().muted, false);
    assert.equal(local.counts().credentialCount, 1);
  } finally { await local.product.dispose(); await peer.product.dispose(); }
});

test('End releases capture immediately even when an ordinary mute is waiting for the SDK', async () => {
  const f = fixture(), gate = deferred();
  try {
    await f.active(); const { capture } = installedSdkMute(f, gate);
    const muting = f.composition.controller.toggleMute(); await settle();
    assert.equal(capture.enabled, false); assert.equal(capture.readyState, 'live');
    const ending = f.composition.controller.hangup();
    assert.equal(capture.readyState, 'ended'); assert.ok(f.events.includes('track-release'));
    gate.resolve(); await Promise.all([muting, ending]); await settle();
    assert.equal(f.composition.controller.getSnapshot().phase, 'ENDED');
    assert.equal(f.composition.controller.getSnapshot().muted, true);
  } finally { gate.resolve(); await f.product.dispose(); }
});

test('a superseded system mute failure cannot end a newer successful app mute command', async () => {
  const f = fixture(), gate = deferred();
  try {
    await f.active(); const transport = f.composition.transport, setMuted = transport.setMuted.bind(transport); let first = true;
    transport.setMuted = async muted => { const operation = setMuted(muted); if (first) { first = false; await operation; await gate.promise; } else await operation; };
    const system = f.composition.controller.setSystemMuted(true); await settle();
    await f.composition.controller.toggleMute();
    gate.reject(Error('synthetic old native action failure')); await system;
    assert.equal(f.composition.controller.getSnapshot().phase, 'ACTIVE');
    assert.equal(f.model.state, 'ACTIVE');
    assert.equal(f.sdkState.audioPublishing, true);
    assert.equal(f.events.filter(e => e.rpc === 'rpc_connect_act' && e.args.p_action === 'end').length, 0);
  } finally { gate.resolve(); await f.product.dispose(); }
});

test('two mute presses while the first command is pending preserve both user intents', async () => {
  const f = fixture(), gate = deferred();
  try {
    await f.active(); const transport = f.composition.transport, setMuted = transport.setMuted.bind(transport); let first = true;
    transport.setMuted = async muted => { const operation = setMuted(muted); if (first) { first = false; await operation; await gate.promise; } else await operation; };
    const one = f.composition.controller.toggleMute(); await settle();
    const two = f.composition.controller.toggleMute(); gate.resolve(); await Promise.all([one, two]);
    assert.equal(f.composition.controller.getSnapshot().muted, false);
    assert.equal(f.sdkState.audioPublishing, true);
    assert.equal(f.composition.controller.getSnapshot().phase, 'ACTIVE');
  } finally { gate.resolve(); await f.product.dispose(); }
});

test('recovery during a pending mute preserves the requested mute instead of restoring an open mic', async () => {
  const f = fixture(false, { connectionRecovery: true }), gate = deferred();
  try {
    await f.active(); const transport = f.composition.transport, setMuted = transport.setMuted.bind(transport); let first = true;
    transport.setMuted = async muted => { const operation = setMuted(muted); if (first) { first = false; await operation; await gate.promise; } else await operation; };
    const muting = f.composition.controller.toggleMute(); await settle();
    f.emit('reconnecting'); const recovery = f.composition.controller.connectionLost();
    gate.resolve(); await Promise.all([muting, recovery]); await settle();
    assert.equal(f.composition.controller.getSnapshot().phase, 'ACTIVE');
    assert.equal(f.composition.controller.getSnapshot().muted, true);
    assert.equal(f.sdkState.audioPublishing, false);
    assert.equal(f.counts().credentialCount, 2);
  } finally { gate.resolve(); await f.product.dispose(); }
});

test('mute command tracing distinguishes user intent from forced cleanup and emits only closed fields', async () => {
  const f = fixture(), lines = [];
  const trace = createConnectTerminalLogger({ development: true, platform: 'android', variant: 'staging', environment: 'staging',
    bundleIdentifier: 'com.aduboffour.betweener.staging', supabaseUrl: 'https://xsgzxadwuxuziubglvps.supabase.co' }, { sink: line => lines.push(line) });
  const remove = trace.watch(f.composition.controller);
  try {
    await f.active(); await f.composition.controller.toggleMute(); await f.composition.controller.hangup();
    const commands = lines.map(line => JSON.parse(line.replace(/^\[Connect\] /, ''))).filter(row => row.event === 'microphone_control');
    assert.deepEqual(commands.map(row => [row.source, row.requestedMuted, row.status]), [['app', true, 'pending'], ['app', true, 'confirmed']]);
    assert.equal(commands[0].request, commands[1].request);
    assert.ok(!lines.join('').includes('synthetic'));
  } finally { remove(); trace.dispose(); await f.product.dispose(); }
});
