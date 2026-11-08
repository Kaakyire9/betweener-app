const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

const cid = 'betweener_connect:00000000-0000-4000-8000-000000000001';
const foreign = 'betweener_connect:00000000-0000-4000-8000-000000000002';
const endpoints = [{ id: 'own-ear', name: 'Phone', type: 'earpiece' }, { id: 'own-speaker', name: 'Phone', type: 'speaker' }];
const ready = { endpoints, currentEndpoint: endpoints[0] };
const empty = { endpoints: [], currentEndpoint: null };
const classic = { devices: [{ id: 'classic-ear', type: 'Earpiece' }], selectedDeviceId: 'classic-ear', currentEndpointType: 'Earpiece' };
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };

function evaluate(file, dependencies) {
  const module = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { module, exports: module.exports, require: dependencies, setTimeout, clearTimeout });
  return module.exports;
}

function fixture(platform = 'android') {
  const reads = [], switches = [], configs = [], nativeListeners = new Map(), callingListeners = new Map();
  const snapshots = new Map([[foreign, empty], [cid, ready]]);
  let registered = [foreign, cid], nextRead = null, nextSwitch = null;
  const calling = {
    isSetup: true, isTelecomBacked: true, isOngoingCallsEnabled: true,
    hasRegisteredCall: () => registered.length > 0,
    getRegisteredCallIds: () => registered,
    isCallTracked: value => registered.includes(value),
    getAvailableAudioEndpoints: async value => { reads.push(value); if (nextRead) { const read = nextRead; nextRead = null; return read.promise; } return snapshots.get(value) ?? empty; },
    requestAudioEndpointChange: async (value, endpoint) => { switches.push([value, endpoint]); if (nextSwitch) return nextSwitch.promise; },
    addEventListener(name, listener) { callingListeners.set(name, listener); return { remove() { callingListeners.delete(name); } }; },
  };
  class NativeEventEmitter {
    addListener(name, listener) { nativeListeners.set(name, listener); return { remove() { nativeListeners.delete(name); } }; }
  }
  const { CallManager } = evaluate('node_modules/@stream-io/video-react-native-sdk/src/modules/call-manager/CallManager.ts', name => {
    if (name === 'react-native') return { Platform: { OS: platform }, NativeEventEmitter, NativeModules: { StreamInCallManager: {
      getAudioDeviceStatus: async () => classic,
      chooseAudioDeviceEndpoint: id => switches.push(['classic', id]),
    } } };
    if (name === '@stream-io/video-client') return { videoLoggerSystem: { getLogger: () => ({ debug() {}, warn() {} }) } };
    if (name === '../../utils/push/libs') return { getCallingxLibIfAvailable: () => calling };
    throw Error(`Unexpected SDK dependency: ${name}`);
  });
  const manager = new CallManager();
  manager.start = config => configs.push(config);
  const { adaptNativeStreamSdk } = evaluate('features/connect/media/native-stream-sdk.ts', name => {
    if (name === '@stream-io/react-native-callingx') return { CallingxModule: calling };
    if (name === './native-call-audio.ts') return require('../features/connect/media/native-call-audio.ts');
    return {}; // No client, encryption manager, media engine, or native module is created.
  });
  const audio = adaptNativeStreamSdk({ callManager: manager }).audio(platform, 'voice', cid);
  return { audio, manager, calling, reads, switches, configs, snapshots, nativeListeners, callingListeners,
    registered(values) { registered = values; }, readGate(gate) { nextRead = gate; }, switchGate(gate) { nextSwitch = gate; },
    sdkEvent(state) { nativeListeners.get('onAudioDeviceChanged')?.(state); },
    telecomEvent(value = cid) { callingListeners.get('didChangeAudioRoute')?.({ callId: value }); },
  };
}

test('installed SDK reproduces empty routes when a different registration is first', async () => {
  const f = fixture();
  const state = await f.manager.audioDevices.getStatus();
  assert.equal(state.devices.length, 0);
  assert.deepEqual(f.reads, [foreign]);
});

test('Connect reads endpoints for its exact call even when an older registration is first', async () => {
  const f = fixture(), state = await f.audio.devices();
  assert.equal(state.selectedDeviceId, 'own-ear');
  assert.deepEqual(state.devices.map(d => d.id), ['own-ear', 'own-speaker']);
  assert.deepEqual(f.reads, [cid]);
});

test('Connect switches only its exact Telecom call and preserves the bridge acknowledgement', async () => {
  const f = fixture(), gate = deferred(); f.switchGate(gate);
  let acknowledged = false;
  const result = Promise.resolve(f.audio.select('own-speaker')).then(() => { acknowledged = true; });
  await flush(); assert.equal(acknowledged, false);
  assert.deepEqual(f.switches, [[cid, 'own-speaker']]);
  gate.resolve(); await result;
});

test('Telecom route errors are returned as bounded failures instead of fire-and-forget warnings', async () => {
  const f = fixture(), gate = deferred(); f.switchGate(gate);
  const failure = assert.rejects(Promise.resolve(f.audio.select('own-speaker')), error => error.message === 'connect_native_route_unavailable');
  gate.reject(Error('PRIVATE_NATIVE_DETAILS')); await failure;
});

test('SDK-only device events cannot overwrite the current Telecom endpoint snapshot', async () => {
  const f = fixture(), observed = [];
  const unsubscribe = f.audio.observeDevices(state => observed.push(state));
  f.sdkEvent({ devices: [], currentEndpointType: 'Speaker' }); await flush();
  assert.equal(observed.at(-1).selectedDeviceId, 'own-ear');
  assert.ok(f.reads.every(value => value === cid));
  unsubscribe();
});

test('a Telecom event reconciles the current call instead of accepting a foreign snapshot', async () => {
  const f = fixture(), observed = [];
  const unsubscribe = f.audio.observeDevices(state => observed.push(state));
  f.telecomEvent(); await flush();
  assert.equal(observed.at(-1).selectedDeviceId, 'own-ear');
  unsubscribe();
});

test('a stale endpoint read cannot replace a more recent route notification', async () => {
  const f = fixture(), observed = [], gate = deferred();
  const unsubscribe = f.audio.observeDevices(state => observed.push(state));
  f.readGate(gate); f.sdkEvent(classic); await flush();
  f.snapshots.set(cid, { endpoints, currentEndpoint: endpoints[1] });
  f.sdkEvent(classic); await flush();
  gate.resolve(ready); await flush();
  assert.equal(observed.at(-1).selectedDeviceId, 'own-speaker');
  unsubscribe();
});

test('unsubscribing fences a pending route read and removes both installed SDK listeners', async () => {
  const f = fixture(), observed = [], gate = deferred();
  const unsubscribe = f.audio.observeDevices(state => observed.push(state));
  f.readGate(gate); f.sdkEvent(classic); await flush();
  unsubscribe(); gate.resolve(ready); await flush();
  assert.deepEqual(observed, []);
  assert.equal(f.nativeListeners.size, 0); assert.equal(f.callingListeners.size, 0);
});

test('a route read that loses this call registration cannot expose a successor call', async () => {
  const f = fixture(), gate = deferred(); f.readGate(gate);
  const result = assert.rejects(f.audio.devices(), /route_unavailable/);
  f.registered([foreign]); gate.resolve(ready); await result;
});

test('a missing current registration never selects or reads another registered call', async () => {
  const f = fixture(); f.registered([foreign]);
  await assert.rejects(f.audio.devices(), /route_unavailable/);
  await assert.rejects(Promise.resolve().then(() => f.audio.select('own-speaker')), /route_unavailable/);
  assert.deepEqual(f.reads, []); assert.deepEqual(f.switches, []);
});

test('empty exact-call Telecom snapshots never borrow SDK or older-call endpoints', async () => {
  const f = fixture(); f.snapshots.set(cid, empty);
  const state = await f.audio.devices();
  assert.equal(state.devices.length, 0); assert.equal(state.selectedDeviceId, undefined);
  assert.deepEqual(f.reads, [cid]);
});

test('a foreground call with no native registrations retains the installed SDK route path', async () => {
  const f = fixture(); f.registered([]);
  assert.equal((await f.audio.devices()).selectedDeviceId, 'classic-ear');
  await f.audio.select('classic-ear');
  assert.deepEqual(f.switches, [['classic', 'classic-ear']]);
});

test('iOS retains the installed SDK route path without consulting Android registrations', async () => {
  const f = fixture('ios');
  assert.equal((await f.audio.devices()).selectedDeviceId, 'classic-ear');
  await f.audio.select('classic-ear'); assert.deepEqual(f.reads, []);
  assert.deepEqual(f.switches, [['classic', 'classic-ear']]);
});

test('voice audio configuration remains an earpiece preference before joining', () => {
  const f = fixture(); f.audio.configure();
  assert.equal(f.configs[0].audioRole, 'communicator');
  assert.equal(f.configs[0].deviceEndpointType, 'earpiece');
});
