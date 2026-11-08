const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), { createRequire } = require('node:module');
const { createNativeCallActivation, nativeDisconnectCause, CONNECT_NATIVE_ACTIVATION_TIMEOUT_MS } = require('../features/connect/media/native-call-activation.ts');
const cid = 'betweener_connect:ee390000-0000-4000-8000-000000000001';
const { fixture: productFixture } = require('./fixtures/connect-product-fixture.cjs');
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const settle = () => new Promise(resolve => setImmediate(resolve));

function fixture(options = {}) {
  let current = true, joined = true, tracked = true, calls = 0, portReads = 0;
  const listeners = new Map(), ack = deferred(), changes = [];
  const port = {
    isSetup: true, isOngoingCallsEnabled: true,
    isCallTracked: value => value === cid && tracked,
    setCurrentCallActive(value) { assert.equal(value, cid); calls++; return ack.promise; },
    addEventListener(event, listener) { const set = listeners.get(event) ?? new Set(); listeners.set(event, set); set.add(listener); return { remove: () => set.delete(listener) }; },
    ...options.port,
  };
  const activation = createNativeCallActivation({ cid: options.cid ?? cid, platform: options.platform ?? 'android',
    port: () => { portReads++; return port; }, current: () => current, joined: () => joined, foreground: options.foreground,
    onChange: () => { changes.push(activation.status()); options.onChange?.(activation); } });
  return { activation, port, ack, changes, calls: () => calls, portReads: () => portReads,
    count: () => [...listeners.values()].reduce((n, set) => n + set.size, 0),
    emit(event, data) { for (const listener of [...listeners.get(event) ?? []]) listener(data); },
    active: () => { for (const listener of [...listeners.get('didToggleHoldCallAction') ?? []]) listener({ callId: cid, hold: false }); },
    retire: () => { current = false; }, unjoin: () => { joined = false; }, untrack: () => { tracked = false; } };
}

for (const first of ['ack', 'event']) test(`activation needs bridge acknowledgement and same-call active event (${first} first)`, async () => {
  const f = fixture(); assert.equal(f.calls(), 0); assert.equal(f.activation.status(), 'not_started');
  const pending = f.activation.activate(); let complete = false; void pending.then(() => { complete = true; });
  if (first === 'ack') f.ack.resolve(); else f.active();
  await settle(); assert.equal(complete, false); assert.equal(f.activation.status(), 'pending');
  if (first === 'event') f.ack.resolve(); else f.active();
  await pending; assert.equal(f.activation.status(), 'confirmed'); assert.equal(f.count(), 0);
  await f.activation.activate(); assert.equal(f.calls(), 1);
});

for (const missing of ['event', 'ack']) test(`a missing native ${missing} fails at the three-second activation deadline`, async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = fixture(), pending = f.activation.activate(); const rejected = assert.rejects(pending, /activation_timeout/);
  if (missing === 'event') { f.ack.resolve(); await Promise.resolve(); } else f.active();
  t.mock.timers.tick(CONNECT_NATIVE_ACTIVATION_TIMEOUT_MS); await rejected;
  assert.equal(f.activation.status(), 'failed'); assert.equal(f.count(), 0);
  assert.equal(f.activation.failure(), missing === 'event' ? 'active_event_timeout' : 'ack_timeout');
  f.active(); f.ack.resolve(); await Promise.resolve(); assert.equal(f.activation.status(), 'failed');
});

test('foreign-call and hold=true events cannot confirm activation', async () => {
  const f = fixture(), pending = f.activation.activate(); f.ack.resolve();
  f.emit('didToggleHoldCallAction', { callId: 'another-call', hold: false });
  f.emit('didToggleHoldCallAction', { callId: cid, hold: true }); await settle();
  assert.equal(f.activation.status(), 'pending'); f.active(); await pending;
});

test('duplicate requests share one listener and one native activation', async () => {
  const f = fixture(), a = f.activation.activate(), b = f.activation.activate();
  assert.equal(a, b); assert.equal(f.calls(), 1); assert.equal(f.count(), 1);
  f.active(); f.ack.resolve(); await a;
});

for (const mode of ['retired', 'not_joined', 'foreign_cid', 'missing_registration']) test(`${mode} cannot activate the native call`, async () => {
  const f = fixture(mode === 'foreign_cid' ? { cid: cid.replace('betweener_connect', 'livestream') } : {});
  if (mode === 'retired') f.retire(); if (mode === 'not_joined') f.unjoin(); if (mode === 'missing_registration') f.untrack();
  await assert.rejects(f.activation.activate()); assert.equal(f.calls(), 0); assert.equal(f.count(), 0);
});

for (const options of [{ platform: 'ios' }, { port: { isSetup: false } }, { port: { isOngoingCallsEnabled: false } }])
test(`activation is not applicable when native Android registration is disabled: ${JSON.stringify(options)}`, async () => {
  const f = fixture(options); await f.activation.activate(); assert.equal(f.activation.status(), 'not_applicable'); assert.equal(f.calls(), 0);
  if (options.platform === 'ios') assert.equal(f.portReads(), 0);
});

for (const mutate of ['retire', 'unjoin', 'untrack']) test(`${mutate} during activation rejects late completion`, async () => {
  const f = fixture(), pending = f.activation.activate(), rejected = assert.rejects(pending, /activation_failed/);
  f[mutate](); f.ack.resolve(); f.active(); await rejected;
  assert.equal(f.activation.status(), 'failed'); assert.equal(f.count(), 0);
});

test('native activation rejection remains a failure even after an active event', async () => {
  const f = fixture(), pending = f.activation.activate(), rejected = assert.rejects(pending, /activation_failed/);
  f.active(); f.ack.reject(Error('SECRET_NATIVE_BODY')); await rejected;
  assert.equal(f.activation.status(), 'failed'); assert.equal(f.count(), 0);
});

test('End cancels pending activation immediately and late callbacks cannot revive it', async () => {
  const f = fixture(), pending = f.activation.activate(), rejected = assert.rejects(pending, /owner_retired/);
  f.activation.dispose(); await rejected; assert.equal(f.count(), 0); assert.equal(f.activation.status(), 'cancelled');
  f.ack.resolve(); f.active(); await settle(); assert.equal(f.activation.status(), 'cancelled');
  await assert.rejects(f.activation.activate(), /owner_retired/); assert.equal(f.calls(), 1);
});

test('retirement triggered by a pending inspection prevents the native request', async () => {
  const f = fixture({ onChange: activation => { if (activation.status() === 'pending') activation.dispose(); } });
  await assert.rejects(f.activation.activate(), /owner_retired/); assert.equal(f.calls(), 0); assert.equal(f.count(), 0);
});

test('disconnect diagnostics retain only known categories', () => {
  for (const value of ['local', 'remote', 'rejected', 'busy', 'answeredElsewhere', 'missed', 'error']) assert.equal(nativeDisconnectCause(value), value);
  for (const value of [undefined, null, { reason: 'SECRET' }, 'SECRET_NATIVE_BODY']) assert.equal(nativeDisconnectCause(value), 'unknown');
});

for (const nativeFailure of ['missing_registration', 'api_throw', 'subscription_throw', 'request_throw'])
test(`native activation preserves a bounded ${nativeFailure} reason without exposing bridge errors`, async () => {
  const f = fixture({ port: nativeFailure === 'api_throw' ? { isCallTracked() { throw Error('SECRET_NATIVE_BODY'); } }
    : nativeFailure === 'subscription_throw' ? { addEventListener() { throw Error('SECRET_NATIVE_BODY'); } }
      : nativeFailure === 'request_throw' ? { setCurrentCallActive() { throw Error('SECRET_NATIVE_BODY'); } } : {} });
  if (nativeFailure === 'missing_registration') f.untrack();
  await assert.rejects(f.activation.activate(), /connect_native_call_activation_failed/);
  assert.equal(f.activation.failure(), { missing_registration: 'registration_missing', api_throw: 'native_api_failed',
    subscription_throw: 'event_subscription_failed', request_throw: 'activation_request_failed' }[nativeFailure]);
  assert.ok(!JSON.stringify({ status: f.activation.status(), reason: f.activation.failure() }).includes('SECRET'));
  assert.equal(f.count(), 0);
});

function adapterFixture(options = {}) {
  // Evaluate the actual adapter with only the RN/Callingx imports replaced. All
  // pure dependencies are the project's real implementations, not a copied seam.
  const repo = process.env.CONNECT_REPAIR_REPO || process.cwd();
  const file = path.join(repo, 'features/connect/media/native-stream-sdk.ts');
  const fromRepo = createRequire(path.join(repo, 'features/connect/media/native-stream-sdk.ts'));
  const ts = fromRepo('typescript'), native = fixture(options), module = { exports: {} };
  vm.runInNewContext(ts.transpile(fs.readFileSync(file, 'utf8'), { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }), {
    module, exports: module.exports, setTimeout, clearTimeout,
    require: name => name === 'react-native' ? { Platform: { OS: 'android' } }
      : name === '@stream-io/react-native-callingx' ? { CallingxModule: native.port }
      : name === './native-call-activation.ts' ? { createNativeCallActivation, nativeDisconnectCause } : fromRepo(name),
  });
  const id = cid.slice(18), state = { callingState: 'idle', e2eeEnabled: false, remoteParticipants: [] };
  const call = { id, cid, type: 'betweener_connect', state,
    async join() { state.callingState = 'joined'; }, async leave() { state.callingState = 'left'; },
    microphone: { state: {} }, camera: { state: {} } };
  let provider = () => {};
  const client = { streamClient: { options: {} }, call: () => call, disconnectUser: async () => {} };
  const sdk = module.exports.adaptNativeStreamSdk({
    StreamVideoClient: { getOrCreateInstance(options) { client.streamClient.options = options.options; return client; } },
    getCallMediaEngineProvider: () => provider, setCallMediaEngineProvider: value => { provider = value; }, SfuModels: { TrackType: {} },
  });
  return { ...native, handle: sdk.createClient({ apiKey: 'synthetic', userId: 'synthetic', tokenProvider: async () => '', onConnectionFailure() {} }).call('betweener_connect', id) };
}

test('actual SDK adapter activates the joined native call without acquiring a background lease', async () => {
  const f = adapterFixture(); await f.handle.join(); const pending = f.handle.activateSystemCall(() => true);
  f.active(); f.ack.resolve(); await pending;
  assert.equal(f.handle.systemCallActivation(), 'confirmed'); assert.equal(f.handle.backgroundAudioActive(), false); await f.handle.leave();
});

test('actual adapter leave cancels activation and ignores its late acknowledgement', async () => {
  const f = adapterFixture(); await f.handle.join(); const pending = f.handle.activateSystemCall(() => true);
  const rejected = assert.rejects(pending, /owner_retired/); await f.handle.leave(); await rejected;
  f.ack.resolve(); f.active(); await settle(); assert.equal(f.handle.systemCallActivation(), 'cancelled');
});

test('the actual adapter exposes a missing registration reason before requesting native activation', async () => {
  const f = adapterFixture(); await f.handle.join(); f.untrack();
  await assert.rejects(f.handle.activateSystemCall(() => true), /activation_failed/);
  assert.equal(f.handle.systemCallActivationFailure(), 'registration_missing'); assert.equal(f.calls(), 0);
  await f.handle.leave();
});

test('an explicitly foreground unregistered call stays usable without claiming native activation', async () => {
  const f = fixture({ foreground: () => true }); f.untrack();
  await f.activation.activate();
  assert.equal(f.activation.status(), 'foreground_only');
  assert.equal(f.activation.failure(), 'registration_missing');
  assert.equal(f.calls(), 0); assert.equal(f.count(), 0);
});

test('background native Answer still requires registration', async () => {
  const f = fixture({ foreground: () => false }); f.untrack();
  await assert.rejects(f.activation.activate(), /activation_failed/);
  assert.equal(f.activation.status(), 'failed'); assert.equal(f.calls(), 0);
});

test('foreground permission does not suppress an activation error for an existing native call', async () => {
  const f = fixture({ foreground: () => true });
  const pending = f.activation.activate(), rejected = assert.rejects(pending, /activation_failed/);
  f.ack.reject(Error('synthetic activation failure')); await rejected;
  assert.equal(f.activation.status(), 'failed'); assert.equal(f.calls(), 1);
});

test('the actual adapter allows only foreground audio when registration is missing', async () => {
  const f = adapterFixture(); await f.handle.join(); f.untrack();
  await f.handle.activateSystemCall(() => true, () => true);
  assert.equal(f.handle.systemCallActivation(), 'foreground_only');
  assert.equal(f.handle.systemCallActivationFailure(), 'registration_missing');
  assert.equal(f.calls(), 0);
  await assert.rejects(f.handle.setBackgroundAudio(true, () => true), /background_unavailable/);
  assert.equal(f.handle.backgroundAudioActive(), false);
  await f.handle.leave();
});

test('foreground-only capture stops on background even while a native Answer startup permit exists', async () => {
  const f = productFixture(false, { nativeIncoming: true, backgroundAudio: true, nativeAnswerAllowed: () => true });
  f.handle.systemCallActivation = () => 'foreground_only';
  try {
    await f.active(); assert.ok(f.tracks.some(track => track.readyState === 'live'));
    f.background('background');
    assert.ok(f.tracks.every(track => !track.enabled && track.readyState === 'ended'));
    await settle();
    assert.equal(f.composition.owner().getSnapshot().retired, true);
  } finally { await f.product.dispose(); }
});

test('actual adapter filters native End/Hold by call and End by system origin, and bounds causes', () => {
  const f = adapterFixture(), seen = [], unsubscribe = f.handle.observeSystemActions(event => seen.push(event));
  f.emit('endCall', { callId: cid, source: 'app', cause: 'local' });
  f.emit('endCall', { callId: 'foreign', source: 'sys', cause: 'error' });
  f.emit('didToggleHoldCallAction', { callId: cid, hold: false }); assert.equal(seen.length, 0);
  f.emit('endCall', { callId: cid, source: 'sys', cause: 'error' });
  f.emit('endCall', { callId: cid, source: 'sys', cause: 'SECRET_NATIVE_BODY' });
  f.emit('didToggleHoldCallAction', { callId: cid, hold: true });
  assert.deepEqual(JSON.parse(JSON.stringify(seen)), [{ kind: 'end', cause: 'error' }, { kind: 'end', cause: 'unknown' }, { kind: 'hold' }]);
  unsubscribe(); assert.equal(f.count(), 0);
});
