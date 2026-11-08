const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const { ownLocalCaptureStream } = require('../harnesses/connect-device-safety/local-capture-stream.ts');
const { createOfflineSafetySession } = require('../harnesses/connect-device-safety/local-session.ts');
const { StreamVideoClientLeaseRegistry } = require('../features/live/media/stream-video-client-leases.ts');
const { installNetworkDeny } = require('../harnesses/connect-device-safety/network-guard.ts');

// Execute the installed JS classes; emulate only their native bridge/executor.
// This reproduces disposal ordering, not an Android JVM or hardware measurement.
const sdkRoot = 'node_modules/@stream-io/react-native-webrtc';
const compiled = new Map();
function sdkFixture() {
  const nativeTracks = new Map(), nativeStreams = new Map(), queue = [], calls = [], disposed = [];
  let next = 0, factoryDisposals = 0;
  const enqueue = (name, action) => { calls.push(name); queue.push(action); };
  const bridge = {
    mediaStreamTrackSetEnabled(_pc, id, enabled) { enqueue(`disable:${id}`, () => { const t = nativeTracks.get(id); if (t) t.enabled = enabled; }); },
    mediaStreamRemoveTrack(stream, _pc, id) { enqueue(`detach:${id}`, () => {
      const track = nativeTracks.get(id);
      // Android getTrack returns null once disposeTrack removed local ownership.
      if (track) nativeStreams.get(stream)?.delete(track);
    }); },
    mediaStreamTrackRelease(id) { enqueue(`track:${id}`, () => {
      const track = nativeTracks.get(id); if (!track) return;
      track.disposed = true; nativeTracks.delete(id); disposed.push(id);
    }); },
    mediaStreamRelease(id) { enqueue(`stream:${id}`, () => {
      const tracks = nativeStreams.get(id); nativeStreams.delete(id);
      for (const track of tracks ?? []) {
        if (track.disposed) throw Error('MediaStreamTrack has been disposed.');
      }
    }); },
  };
  const target = { navigator: {} }, deny = installNetworkDeny(target, true);
  const deps = {
    'react-native': { NativeModules: { WebRTCModule: bridge } },
    './EventEmitter': { addListener() {}, removeListener() {} },
    './Logger': class { debug() {} },
    './MediaDevices': { videoTrackDimensionChangedEventQueue: new Map() },
    './RTCUtil': { uniqueID: () => `unused-${++next}`, deepClone: x => structuredClone(x), normalizeConstraints: x => x },
    './vendor/event-target-shim': { EventTarget: class {}, Event: class {}, getEventAttributeValue() {}, setEventAttributeValue() {} },
    './MediaStreamTrackEvent': class {},
  };
  function load(name) {
    if (!compiled.has(name)) compiled.set(name, ts.transpileModule(fs.readFileSync(`${sdkRoot}/src/${name}.ts`, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText);
    const exports = {}, context = { ...target, exports, module: { exports }, require(id) {
      if (!(id in deps)) throw Error(`Unexpected SDK dependency: ${id}`);
      return deps[id];
    } };
    vm.runInNewContext(compiled.get(name), context, { filename: `${name}.ts` });
    return context.module.exports.default;
  }
  deps['./MediaStreamTrack'] = load('MediaStreamTrack');
  const MediaStream = load('MediaStream');
  const streams = [];
  const create = kinds => {
    const id = `stream-${++next}`;
    const tracks = kinds.map(kind => ({ id: `${kind}-${++next}`, kind, enabled: true, remote: false,
      readyState: 'live', peerConnectionId: -1, constraints: {}, settings: {} }));
    const native = tracks.map(t => ({ ...t, disposed: false }));
    for (const t of native) nativeTracks.set(t.id, t);
    nativeStreams.set(id, new Set(native));
    const stream = new MediaStream({ streamId: id, streamReactTag: id, tracks });
    streams.push(stream); return stream;
  };
  const flush = () => { while (queue.length) queue.shift()(); };
  return { create, flush, calls, disposed, streams, deny,
    get factoryDisposals() { return factoryDisposals; },
    hardware: {
      async capture(kind) { return create([kind === 'microphone' ? 'audio' : 'video']); },
      async startTone() { throw Error('not part of this case'); },
      async release() {
        flush();
        assert.equal(nativeTracks.size, 0); assert.equal(nativeStreams.size, 0);
        factoryDisposals++;
      },
    },
  };
}
function sessionFixture(sdk = sdkFixture()) {
  const registry = new StreamVideoClientLeaseRegistry(), lifecycle = new Set(); let app = 'active';
  const session = createOfflineSafetySession({ development: true, externalEgressBlocked: true, registry, hardware: sdk.hardware,
    auth: { snapshot: () => ({ userId: 'offline-a', authenticated: true, generation: 'epoch-a' }), subscribe: () => () => {} },
    lifecycle: { platform: 'android', appState: () => app, subscribeAppState(fn) { lifecycle.add(fn); return () => lifecycle.delete(fn); } },
    permission: async () => 'granted',
    audio: { configure() {}, clearConfiguration() {}, devices: async () => ({ devices: [] }), select() {},
      observeDevices: () => () => {}, observeInterruption: () => () => {} },
  });
  return { sdk, session, registry, background() { app = 'background'; for (const fn of lifecycle) fn(app); } };
}
const settle = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve; const promise = new Promise(yes => { resolve = yes; }); return { promise, resolve }; };

for (const kind of ['audio', 'video']) test(`installed ${kind} classes reproduce original track-before-stream crash`, () => {
  const f = sdkFixture(), stream = f.create([kind]), [track] = stream.getTracks();
  track.stop(); track.release(); stream.release(false);
  assert.throws(f.flush, /MediaStreamTrack has been disposed/);
});

test('real owner microphone STOP detaches and disposes stream before native track release', async () => {
  const { sdk, session: s } = sessionFixture(); await s.microphone(); await s.stop();
  const detach = sdk.calls.findIndex(x => x.startsWith('detach:'));
  const stream = sdk.calls.findIndex(x => x.startsWith('stream:'));
  const track = sdk.calls.findIndex(x => x.startsWith('track:'));
  assert.ok(detach >= 0 && detach < stream && stream < track);
  assert.equal(sdk.disposed.length, 1); assert.equal(sdk.factoryDisposals, 1);
  assert.deepEqual(sdk.deny.snapshot(), []);
  assert.equal(s.owner.getSnapshot().tracks.microphone.observed, 1);
  assert.equal(s.owner.getSnapshot().operations.release, 'completed');
  assert.equal(s.receipt().deviceOutcome, 'NOT_TESTED');
});

test('microphone disable followed by repeated concurrent STOP disposes every object once', async () => {
  const { sdk, session: s } = sessionFixture(); await s.microphone(); await s.disableMicrophone();
  await Promise.all([s.stop(), s.stop(), s.stop()]); await s.retryCleanup();
  assert.equal(sdk.disposed.length, 1); assert.equal(sdk.calls.filter(x => x.startsWith('stream:')).length, 1);
  assert.equal(sdk.factoryDisposals, 1);
});

test('camera preview remains valid until cleanup and retains ended inspection handles', async () => {
  const { sdk, session: s } = sessionFixture(); await s.camera();
  assert.equal(s.cameraStreamUrl(), sdk.streams[0].toURL()); assert.equal(sdk.streams[0].getTracks().length, 1);
  await s.stop(); assert.equal(s.cameraStreamUrl(), undefined);
  assert.equal(sdk.streams[0].getTracks().length, 0);
  assert.equal(s.owner.getSnapshot().tracks.camera.observed, 1); assert.equal(s.owner.getSnapshot().tracks.camera.live, 0);
});

test('multiple microphone/camera captures retain all tracks for independent cleanup', async () => {
  const { sdk, session: s } = sessionFixture(); await Promise.all([s.microphone(), s.microphone(), s.camera()]);
  await s.stop(); assert.equal(sdk.disposed.length, 3); assert.equal(sdk.factoryDisposals, 1);
  assert.equal(s.owner.getSnapshot().tracks.microphone.observed, 2);
});

test('one multi-track stream detaches all members before either native track is disposed', () => {
  const f = sdkFixture(), raw = f.create(['audio', 'video']), stream = ownLocalCaptureStream(raw);
  const tracks = stream.getTracks(); for (const t of tracks) { t.stop(); t.release(); }
  stream.release(false); f.flush(); assert.equal(f.disposed.length, 2);
  assert.ok(f.calls.findIndex(x => x.startsWith('stream:')) < f.calls.findIndex(x => x.startsWith('track:')));
  assert.deepEqual(stream.getTracks(), tracks); assert.equal(raw.getTracks().length, 0);
});

test('late native microphone return after retirement follows the same safe release order', async () => {
  const sdk = sdkFixture(), gate = deferred(); sdk.hardware.capture = () => gate.promise;
  const { session: s } = sessionFixture(sdk), capture = s.microphone(); await settle(); const cleanup = s.stop();
  gate.resolve(sdk.create(['audio'])); await assert.rejects(capture, /late_capture/); await cleanup;
  assert.equal(sdk.disposed.length, 1); assert.equal(sdk.factoryDisposals, 1);
});

test('background retirement releases native stream membership before disposing its track', async () => {
  const f = sessionFixture(); await f.session.microphone(); f.background(); await f.session.stop();
  assert.equal(f.session.owner.getSnapshot().reason, 'background'); assert.equal(f.sdk.disposed.length, 1);
  await assert.rejects(f.session.microphone(), /retired/);
});

test('ambiguous stream-detach exception never releases track/factory or clears quarantine', async () => {
  const sdk = sdkFixture(), original = sdk.hardware.capture; let attempts = 0;
  sdk.hardware.capture = async kind => { const raw = await original(kind); raw.release = () => { attempts++; throw Error('bridge interrupted'); }; return raw; };
  const { session: s, registry } = sessionFixture(sdk); await s.microphone();
  await assert.rejects(s.stop(), /unconfirmed/); await settle(); await assert.rejects(s.retryCleanup(), /unconfirmed/);
  assert.equal(attempts, 1); assert.equal(sdk.disposed.length, 0); assert.equal(sdk.factoryDisposals, 0);
  assert.equal(s.owner.getSnapshot().operations.microphoneTrackRelease, 'failed');
  assert.throws(() => registry.acquire('live', () => ({})), /busy/);
});

test('failed track release prevents factory disposal and remains eligible for scoped retry', async () => {
  const sdk = sdkFixture(), original = sdk.hardware.capture; let fail = true;
  sdk.hardware.capture = async kind => {
    const raw = await original(kind), [track] = raw.getTracks(), release = track.release.bind(track);
    track.release = () => { if (fail) throw Error('bridge rejected'); release(); }; return raw;
  };
  const { session: s } = sessionFixture(sdk); await s.microphone(); await assert.rejects(s.stop(), /unconfirmed/);
  assert.equal(sdk.factoryDisposals, 0); fail = false; await s.retryCleanup();
  assert.equal(sdk.disposed.length, 1); assert.equal(sdk.factoryDisposals, 1);
});

test('unsupported release and premature stream finalization cannot masquerade as completed cleanup', () => {
  const f = sdkFixture(), raw = f.create(['audio']), [track] = raw.getTracks(); track.release = undefined;
  const owned = ownLocalCaptureStream(raw); owned.getTracks()[0].stop();
  assert.throws(() => owned.getTracks()[0].release(), /unsupported/);
  assert.throws(() => owned.release(false), /unconfirmed/);
  assert.throws(() => owned.release(true), /unconfirmed/);
  assert.equal(f.calls.filter(x => x.startsWith('stream:')).length, 0);
});

test('model assumptions match pinned Android bridge ownership lookup and serial executor', () => {
  const java = fs.readFileSync(`${sdkRoot}/android/src/main/java/com/oney/WebRTCModule/WebRTCModule.java`, 'utf8');
  const thread = fs.readFileSync(`${sdkRoot}/android/src/main/java/com/oney/WebRTCModule/ThreadUtils.java`, 'utf8');
  assert.match(java, /void mediaStreamRemoveTrack[\s\S]*?getTrack\(pcId, trackId\)[\s\S]*?if \(track == null\)/);
  assert.match(java, /void mediaStreamRelease[\s\S]*?localStreams\.remove\(id\);\s*stream\.dispose\(\)/);
  assert.match(java, /void mediaStreamTrackRelease[\s\S]*?getUserMediaImpl\.disposeTrack\(id\)/);
  assert.ok(thread.includes('Executors.newSingleThreadExecutor()'));
});
