const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { Buffer } = require('node:buffer');
const path = require('node:path');
const { createOfflineSafetySession } = require('../harnesses/connect-device-safety/local-session.ts');
const { installNetworkDeny } = require('../harnesses/connect-device-safety/network-guard.ts');
const { createTestTone } = require('../harnesses/connect-device-safety/test-tone.ts');
const { StreamVideoClientLeaseRegistry } = require('../features/live/media/stream-video-client-leases.ts');
const { connectFeatureFlags } = require('../features/connect/config/connect-feature-flags.ts');
let networkAttempts = 0;
globalThis.fetch = () => { networkAttempts++; throw new Error('offline_regression_network_forbidden'); };
const settle = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve; const promise = new Promise(yes => { resolve = yes; }); return { promise, resolve }; };
function fixture() {
  const authListeners = new Set(), lifecycle = new Set(), interrupts = new Set(), created = [], events = [];
  let auth = { authenticated: true, userId: 'offline-a', generation: 'epoch-a' }, appState = 'active';
  const registry = new StreamVideoClientLeaseRegistry();
  const stream = () => {
    const track = { enabled: true, readyState: 'live', releases: 0, stop() { this.readyState = 'ended'; events.push('stop'); },
      release() { this.releases++; events.push('release-track'); } };
    const value = { track, getTracks: () => [track], release(releaseTracks) { assert.equal(releaseTracks, false); events.push('release-stream'); }, toURL: () => 'local-preview' };
    created.push(value); return value;
  };
  const playback = { stops: 0, async stop() { this.stops++; events.push('stop-playback'); }, snapshot: () => ({ physicalOutputCessation: 'unverified' }) };
  const input = { development: true, externalEgressBlocked: true, registry,
    auth: { snapshot: () => auth, subscribe(fn) { authListeners.add(fn); return () => authListeners.delete(fn); } },
    lifecycle: { platform: 'ios', appState: () => appState, subscribeAppState(fn) { lifecycle.add(fn); return () => lifecycle.delete(fn); } },
    permission: async () => 'granted',
    audio: { configure() {}, clearConfiguration() {}, devices: async () => ({ devices: [] }), select() { throw Error('unsupported'); },
      observeDevices() { return () => {}; }, observeInterruption(fn) { interrupts.add(fn); return () => interrupts.delete(fn); } },
    hardware: { capture: async () => stream(), startTone: async () => playback, async release() { events.push('release-factory'); } },
  };
  return { input, registry, created, events, stream, playback, create: () => createOfflineSafetySession(input),
    account(value) { auth = value; for (const fn of authListeners) fn(); },
    app(value) { appState = value; for (const fn of lifecycle) fn(value); },
    interrupt(value) { for (const fn of interrupts) fn(value); } };
}
test('standalone guard denies JS network APIs, records no URL, and cannot be replaced', () => {
  const target = { navigator: {} }, guard = installNetworkDeny(target, true);
  for (const api of ['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource']) {
    assert.throws(() => new target[api]('https://secret.invalid'), /network_forbidden/);
    assert.throws(() => Object.defineProperty(target, api, { value() {} }), TypeError);
  }
  assert.throws(() => target.navigator.sendBeacon('https://secret.invalid'), /network_forbidden/);
  assert.equal(guard.snapshot().length, 5); assert.ok(!JSON.stringify(guard.snapshot()).includes('secret'));
});
test('release runtime and absent external isolation are rejected before hardware', () => {
  assert.throws(() => installNetworkDeny({}, false), /development_only/);
  for (const key of ['development', 'externalEgressBlocked']) {
    const f = fixture(); f.input[key] = false; assert.throws(f.create, /isolation_required/); assert.equal(f.created.length, 0);
  }
});
test('standalone Metro suppresses Expo automatic reload sockets on both native platforms', () => {
  const config = require('../harnesses/connect-device-safety/metro.config.js');
  for (const platform of ['ios', 'android']) {
    const result = config.resolver.resolveRequest({ originModulePath: path.resolve('node_modules/expo/src/Expo.fx.tsx') }, './async-require/messageSocket', platform);
    assert.equal(result.type, 'sourceFile'); assert.ok(result.filePath.endsWith('offline-devtools.ts')); assert.ok(fs.existsSync(result.filePath));
  }
});
test('actual owner class drives local microphone disable, stop, release and player disposal', async () => {
  const f = fixture(), s = f.create(); await s.microphone(); await s.startTone();
  assert.equal(f.created[0].track.readyState, 'live'); await s.disableMicrophone();
  assert.equal(f.created[0].track.enabled, false); assert.equal(f.created[0].track.readyState, 'ended');
  await s.stop(); assert.equal(f.created[0].track.releases, 1); assert.ok(f.playback.stops > 0);
  assert.equal(s.owner.getSnapshot().operations.release, 'completed'); assert.ok(f.events.includes('release-stream'));
  assert.ok(f.events.indexOf('release-factory') > f.events.indexOf('release-track'));
  assert.equal(s.receipt().fullProductionNativeOwnerVerified, false); assert.equal(s.receipt().deviceOutcome, 'NOT_TESTED');
});
test('optional camera is observed and released through the owner', async () => {
  const f = fixture(), s = f.create(); await s.camera(); assert.equal(s.cameraStreamUrl(), 'local-preview'); await s.stop();
  assert.equal(f.created[0].track.releases, 1); assert.equal(s.cameraStreamUrl(), undefined);
});
test('late microphone creation after cancellation is stopped before mutation completes', async () => {
  const f = fixture(), gate = deferred(); f.input.hardware.capture = () => gate.promise;
  const s = f.create(), capturing = s.microphone(); await settle(); const cleanup = s.stop(); await settle();
  assert.equal(s.owner.getSnapshot().operations.release, 'pending');
  assert.throws(() => f.registry.acquire('live', () => ({ disconnectUser: async () => {} })), /busy/);
  const late = f.stream(); gate.resolve(late); await assert.rejects(capturing, /late_capture/); await cleanup;
  assert.equal(late.track.readyState, 'ended'); assert.equal(late.track.releases, 1);
});
test('late optional camera cannot escape cancellation or allow premature handoff', async () => {
  const f = fixture(), gate = deferred(); f.input.hardware.capture = () => gate.promise;
  const s = f.create(), capturing = s.camera(); await settle(); const cleanup = s.stop(); await settle();
  assert.equal(s.owner.getSnapshot().operations.release, 'pending'); const late = f.stream(); gate.resolve(late);
  await assert.rejects(capturing, /late_capture/); await cleanup; assert.equal(late.track.releases, 1);
});
test('late playback is stopped and simultaneous playback creation is rejected', async () => {
  const f = fixture(), gate = deferred(); f.input.hardware.startTone = () => gate.promise;
  const s = f.create(), playing = s.startTone(); await settle(); await assert.rejects(s.startTone(), /already_created/);
  const cleanup = s.stop(); gate.resolve(f.playback); await assert.rejects(playing, /late_playback/); await cleanup;
  assert.ok(f.playback.stops > 0);
});
test('injected cleanup failure quarantines ownership until explicit scoped retry', async () => {
  const f = fixture(), s = f.create(); await s.microphone(); s.setCleanupFault('fail');
  await assert.rejects(s.stop(), /unconfirmed/); await settle();
  assert.throws(() => f.registry.acquire('live', () => ({ disconnectUser: async () => {} })), /busy/);
  await s.retryCleanup(); const next = f.registry.acquire('live', () => ({ disconnectUser: async () => {} })); await next.release();
});
test('hung cleanup retains its lease across elapsed time and allows only explicit unblock', async () => {
  const f = fixture(), s = f.create(); await s.microphone(); await s.startTone(); s.setCleanupFault('hold');
  const cleanup = s.stop(); await settle(); assert.equal(s.owner.getSnapshot().operations.release, 'pending');
  assert.equal(f.created[0].track.readyState, 'ended'); assert.ok(f.playback.stops > 0);
  assert.throws(() => f.registry.acquire('live', () => ({ disconnectUser: async () => {} })), /busy/);
  await s.retryCleanup(); await cleanup;
});
test('real track-release port error remains quarantined and is explicitly retryable', async () => {
  const f = fixture(), s = f.create(); await s.microphone();
  f.created[0].track.release = () => { throw Error('bridge'); }; await assert.rejects(s.stop(), /unconfirmed/);
  assert.equal(s.owner.getSnapshot().operations.microphoneTrackRelease, 'failed');
  f.created[0].track.release = () => { f.created[0].track.releases++; }; await s.retryCleanup();
  assert.equal(s.owner.getSnapshot().operations.release, 'completed');
});
test('failed factory disposal keeps the shared registry tombstone until scoped retry', async () => {
  const f = fixture(), s = f.create(); await s.microphone();
  f.input.hardware.release = async () => { throw Error('native-factory'); };
  await assert.rejects(s.stop(), /unconfirmed/);
  assert.throws(() => f.registry.acquire('live', () => ({ disconnectUser: async () => {} })), /busy/);
  f.input.hardware.release = async () => {}; await s.retryCleanup();
  const live = f.registry.acquire('live', () => ({ disconnectUser: async () => {} })); await live.release();
});
test('hung factory disposal cannot clear native ownership', async () => {
  const f = fixture(), gate = deferred(), s = f.create(); await s.microphone();
  f.input.hardware.release = () => gate.promise;
  const cleanup = s.stop(); await settle(); assert.equal(s.owner.getSnapshot().operations.release, 'pending');
  assert.throws(() => f.registry.acquire('live', () => ({ disconnectUser: async () => {} })), /busy/);
  gate.resolve(); await cleanup;
});
for (const reason of ['logout', 'switch', 'same_user_new_epoch', 'background', 'interruption']) {
  test(`${reason} retires local owner; foreground and late callbacks cannot reactivate it`, async () => {
    const f = fixture(), s = f.create(); await s.microphone();
    if (reason === 'logout') f.account(null);
    else if (reason === 'switch') f.account({ authenticated: true, userId: 'offline-b', generation: 'epoch-b' });
    else if (reason === 'same_user_new_epoch') f.account({ authenticated: true, userId: 'offline-a', generation: 'epoch-b' });
    else if (reason === 'background') f.app('background');
    else f.interrupt('began');
    f.app('active'); f.interrupt('ended'); assert.equal(s.owner.isCurrent(), false);
    await assert.rejects(s.microphone(), /retired/); await s.stop();
  });
}
test('Live lease rejects harness before capture and cannot be disconnected by it', async () => {
  const f = fixture(); let liveDisconnects = 0;
  const live = f.registry.acquire('live', () => ({ disconnectUser: async () => { liveDisconnects++; } }));
  assert.throws(f.create, /busy/); assert.equal(f.created.length, 0); assert.equal(liveDisconnects, 0); await live.release();
});
test('stale harness cleanup cannot disconnect its successor Live owner', async () => {
  const f = fixture(), s = f.create(); await s.microphone(); await s.stop(); let liveDisconnects = 0;
  const live = f.registry.acquire('live', () => ({ disconnectUser: async () => { liveDisconnects++; } }));
  await s.stop(); await s.retryCleanup(); assert.equal(liveDisconnects, 0); await live.release(); assert.equal(liveDisconnects, 1);
});
test('independent observations remain separate from SDK state and never auto-upgrade device acceptance', async () => {
  const f = fixture(), s = f.create();
  assert.throws(() => s.recordIndependent({ source: 'sdk_reported', reference: 'a', observedAt: new Date().toISOString() }), /reference_required/);
  s.recordIndependent({ source: 'external_observer', axis: 'playback', phase: 'active_before_shutdown', reference: 'local-receiver-clip-1', observedAt: new Date().toISOString() });
  const r = s.receipt(); assert.equal(r.independentDeviceEvidence.length, 1); assert.equal(r.deviceOutcome, 'NOT_TESTED');
  assert.equal(r.owner.physicalDeviceShutdown, 'not_verified'); await s.stop();
});
test('generated tone is a bounded PCM WAV rather than a remote media reference', () => {
  const bytes = createTestTone(), view = new DataView(bytes.buffer);
  assert.equal(Buffer.from(bytes.slice(0, 4)).toString(), 'RIFF'); assert.equal(bytes.length, 32044);
  assert.equal(view.getUint32(24, true), 16000); assert.equal(view.getUint16(22, true), 1);
});
test('product entry/flags stay unchanged; native SDK is never evaluated by offline session tests', () => {
  assert.equal(connectFeatureFlags.nativeSafetyOwner, false); assert.equal(connectFeatureFlags.endCallAndBlock, false);
  assert.equal(require('../package.json').main, 'index.js');
  assert.ok(!Object.keys(require.cache).some(p => /node_modules[\\/]@stream-io[\\/]video-react-native-sdk[\\/]/.test(p)));
  const entry = fs.readFileSync('harnesses/connect-device-safety/index.ts', 'utf8');
  assert.ok(entry.indexOf('installNetworkDeny(globalThis') < entry.indexOf("require('expo')"));
  assert.equal(networkAttempts, 0);
});
