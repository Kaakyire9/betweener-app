const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { createConnectTerminalLogger } = require('../features/connect/diagnostics/connect-terminal-logger.ts');
const { fixture, id, deferred, settle } = require('./fixtures/connect-product-fixture.cjs');
const { unverifiedShutdown } = require('../features/connect/media/local-shutdown.ts');
const identity = { development: true, platform: 'android', variant: 'staging', environment: 'staging',
  bundleIdentifier: 'com.aduboffour.betweener.staging', supabaseUrl: 'https://xsgzxadwuxuziubglvps.supabase.co' };
function logger(patch = {}, extra = {}) {
  const lines = []; let now = 0;
  const trace = createConnectTerminalLogger({ ...identity, ...patch }, { sink: line => lines.push(line), now: () => now, ...extra });
  return { trace, lines, rows: () => lines.map(line => JSON.parse(line.replace(/^\[Connect\] /, ''))), clock: value => { now = value; } };
}
function observable(value) {
  const listeners = new Set();
  return { getSnapshot: () => value, subscribe: fn => { listeners.add(fn); return () => listeners.delete(fn); },
    set(next) { value = next; for (const fn of [...listeners]) fn(); }, count: () => listeners.size };
}
const view = () => ({ phase: 'IDLE', session: null, peer: null, incoming: false, foreground: true, busy: false, permission: null,
  muted: true, route: 'earpiece', routes: [], error: null, durationSeconds: null, localShutdown: unverifiedShutdown(), endBlock: null });
const api = () => ({ createCall: async () => ({ id: id(10) }), act: async () => ({}), getCall: async () => ({ id: id(10) }),
  getHistory: async () => [], credentials: async () => ({ token: 'SECRET_STREAM_TOKEN', apiKey: 'SECRET_API_KEY' }) });

test('startup transport cause survives owner recovery beside the encryption fault without leaking payloads', () => {
  const l = logger(), state = { cid: `betweener_connect:${id(10)}`, generation: 1, retired: true, reason: 'encryption_failed',
    sdk: { transportFailure: { code: 'PARTICIPANT_MEDIA_TRANSPORT_FAILURE', strategy: 'REJOIN', message: 'SECRET_PROVIDER' },
      failure: { code: 'e2ee.unencrypted_frame', trackType: 'AUDIO', party: 'remote' } }, operations: {} }, native = observable(state);
  l.trace.watchOwner(native); native.set(state);
  assert.equal(l.rows().filter(row => row.event === 'native_transport_fault').length, 1);
  assert.equal(l.rows().findLast(row => row.event === 'native_owner').reason, 'encryption_failed');
  const successor = observable({ ...state, generation: 2, sdk: {}, reason: null }); l.trace.watchOwner(successor);
  const product = observable({ ...view(), phase: 'ENDED', session: { id: id(10), state: 'ENDED' } });
  l.trace.watch(product); l.trace.dispose();
  const summary = l.rows().findLast(row => row.event === 'call_summary');
  assert.equal(summary.firstTransportFailure, 'PARTICIPANT_MEDIA_TRANSPORT_FAILURE');
  assert.equal(summary.firstReconnectStrategy, 'REJOIN'); assert.equal(summary.firstTransportFailureGeneration, 1);
  assert.equal(summary.firstSdkFailure, 'e2ee.unencrypted_frame'); assert.ok(!l.lines.join('').includes('SECRET'));
});

test('unknown native transport categories are bounded in staging logs', () => {
  const l = logger(), source = observable({ cid: `betweener_connect:${id(10)}`, generation: 1, sdk: {
    transportFailure: { code: 'SECRET_CODE', strategy: 'SECRET_STRATEGY', token: 'SECRET_TOKEN' } }, operations: {} });
  l.trace.watchOwner(source);
  const row = l.rows().findLast(row => row.event === 'native_transport_fault');
  assert.equal(row.firstTransportFailure, 'unknown'); assert.equal(row.firstReconnectStrategy, 'unknown');
  assert.ok(!l.lines.join('').includes('SECRET')); l.trace.dispose();
});

test('native activation and interruption diagnostics are bounded, deduplicated and distinct from hardware proof', () => {
  const l = logger(), state = { cid: `betweener_connect:${id(10)}`, generation: 1, retired: false, sdk: {}, operations: {},
    systemCallActivation: 'pending' }, native = observable(state);
  l.trace.watchOwner(native); native.set({ ...state, systemCallActivation: 'confirmed' });
  native.set({ ...state, systemCallActivation: 'confirmed', systemInterruption: { kind: 'end', cause: 'error', body: 'SECRET' } });
  native.set({ ...state, systemCallActivation: 'confirmed', systemInterruption: { kind: 'end', cause: 'error' } });
  assert.equal(l.rows().filter(r => r.event === 'native_call_activation').length, 2);
  assert.equal(l.rows().findLast(r => r.event === 'native_call_activation').evidence, 'native_call_state_event_and_bridge_ack');
  assert.equal(l.rows().filter(r => r.event === 'native_interruption').length, 1);
  assert.equal(l.rows().find(r => r.event === 'native_interruption').cause, 'error');
  native.set({ ...state, systemCallActivation: 'failed', systemCallActivationFailure: 'native_api_failed' });
  assert.equal(l.rows().findLast(r => r.event === 'native_call_activation').reason, 'native_api_failed');
  native.set({ ...state, systemCallActivation: 'foreground_only', systemCallActivationFailure: 'registration_missing' });
  const foreground = l.rows().findLast(r => r.event === 'native_call_activation');
  assert.equal(foreground.status, 'foreground_only'); assert.equal(foreground.reason, 'registration_missing');
  assert.equal(foreground.evidence, 'local_activation_state');
  native.set({ ...state, systemCallActivation: 'SECRET', systemCallActivationFailure: 'SECRET', systemInterruption: { kind: 'SECRET', cause: 'SECRET' } });
  assert.ok(!l.lines.join('').includes('SECRET')); assert.ok(!l.lines.join('').includes(id(10)));
  assert.equal(l.rows().findLast(r => r.event === 'native_call_activation').reason, 'unknown');
  assert.equal(l.rows().findLast(r => r.event === 'native_interruption').cause, 'unknown'); l.trace.dispose();
});

for (const patch of [{ development: false }, { variant: 'production' }, { environment: 'production' }, { platform: 'web' },
  { supabaseUrl: 'https://example.com' }, { bundleIdentifier: 'com.aduboffour.betweener' }]) {
  test(`terminal logging is inert outside the exact staging development identity: ${JSON.stringify(patch)}`, async () => {
    const l = logger(patch), original = api(), state = observable(view());
    assert.equal(l.trace.enabled, false); assert.equal(l.trace.wrapApi(original), original);
    l.trace.watch(state); l.trace.serviceFailure('rpc', Error('SECRET')); l.trace.dispose();
    assert.equal(state.count(), 0); assert.deepEqual(l.lines, []);
  });
}

test('two platforms share a call label while reload runs and local sequence are distinguishable', async () => {
  const a = logger(), b = logger({ platform: 'ios' });
  await a.trace.wrapApi(api()).getCall(id(10));
  await a.trace.wrapApi(api()).credentials(id(10), 'SECRET_DEVICE');
  await b.trace.wrapApi(api()).credentials(id(10), 'SECRET_DEVICE');
  const first = a.rows().find(r => r.event === 'request_started'), second = b.rows().find(r => r.event === 'request_started');
  assert.match(first.call, /^c-[0-9a-f]{16}$/); assert.equal(first.call, second.call); assert.notEqual(first.run, second.run);
  assert.deepEqual(a.rows().map(r => r.seq), a.rows().map((_, i) => i + 1));
  assert.equal(a.lines.join('').includes(id(10)), false); a.trace.dispose(); b.trace.dispose();
});

test('API tracing preserves exact arguments, this binding, results and original rejection', async () => {
  const l = logger(), original = api(), secret = { token: 'SECRET_RESULT' }, args = ['SECRET_PEER', 'video', 'matched', 'SECRET_KEY', 'SECRET_DEVICE', 'SECRET_GRANT'];
  original.createCall = async function (...received) { assert.equal(this, original); assert.deepEqual(received, args); return secret; };
  const wrapped = l.trace.wrapApi(original); assert.equal(await wrapped.createCall(...args), secret);
  const error = Object.assign(Error('Network request failed'), { status: 503, body: 'SECRET_PROVIDER_BODY' });
  original.credentials = async () => { throw error; };
  await assert.rejects(wrapped.credentials(id(10), 'SECRET_DEVICE'), e => e === error);
  const failure = l.rows().find(r => r.event === 'request_failed');
  assert.equal(failure.code, 'network_unavailable'); assert.equal(failure.httpStatus, 503);
  assert.ok(!l.lines.join('').includes('SECRET')); l.trace.dispose();
});

test('malicious errors, snapshots and extra credential fields cannot enter terminal output', async () => {
  const l = logger(), original = api(), state = observable(view()); l.trace.watch(state);
  original.credentials = async () => { throw { message: 'Bearer SECRET_AUTH_TOKEN', code: 'SECRET_DB_CODE', status: 'SECRET_STATUS',
    context: { status: 401, token: 'SECRET_TOKEN' }, stack: 'SECRET_STACK' }; };
  await assert.rejects(l.trace.wrapApi(original).credentials('SECRET_NOT_A_UUID', 'SECRET_DEVICE'));
  const s = { ...view(), phase: 'SECRET_PHASE', error: 'SECRET_ERROR', peer: { name: 'SECRET_NAME', avatar: 'https://SECRET_AVATAR' },
    audioSetupFailure: { code: 'SECRET_CODE', stage: 'SECRET_STAGE', missingNativeApis: ['SECRET_API'] },
    video: { camera: 'SECRET_CAMERA', facing: 'SECRET_FACING', permission: 'SECRET_PERMISSION', error: 'SECRET_DETAIL' } };
  state.set(s); l.trace.serviceFailure('SECRET_SERVICE', { message: 'SECRET_MESSAGE' });
  assert.ok(!l.lines.join('').includes('SECRET')); assert.equal(l.rows().find(r => r.event === 'request_failed').httpStatus, 401);
  l.trace.dispose(); assert.equal(state.count(), 0);
});

test('healthy polling is quiet; repeated failures are bounded and recovery is explicit', async () => {
  const l = logger(), original = api(); let failed = false;
  original.getCall = async () => { if (failed) throw Error('connect_unavailable'); return { id: id(10) }; };
  const wrapped = l.trace.wrapApi(original);
  for (let n = 0; n < 20; n++) await wrapped.getCall(id(10));
  assert.equal(l.lines.length, 1);
  failed = true;
  for (let n = 0; n < 20; n++) await assert.rejects(wrapped.getCall(id(10)));
  assert.equal(l.rows().filter(r => r.event === 'request_failed').length, 1);
  l.clock(10_000); await assert.rejects(wrapped.getCall(id(10)));
  assert.equal(l.rows().filter(r => r.event === 'request_failed').length, 2);
  failed = false; await wrapped.getCall(id(10));
  assert.equal(l.rows().filter(r => r.event === 'request_recovered').length, 1); l.trace.dispose();
});

test('audio counters are sampled at ten-second intervals while reception changes log immediately', () => {
  const l = logger(), state = observable(view()); l.trace.watch(state);
  const health = { reception: 'receiving', sending: true, receivedPackets: 10, jitterMs: 1, roundTripMs: 8 };
  for (let n = 0; n < 10; n++) { l.clock(n * 500); state.set({ ...view(), audioHealth: { ...health, receivedPackets: n * 10 } }); }
  assert.equal(l.rows().filter(r => r.event === 'audio_health').length, 1);
  l.clock(10_000); state.set({ ...view(), audioHealth: { ...health, receivedPackets: 300 } });
  assert.equal(l.rows().filter(r => r.event === 'audio_health').length, 2);
  state.set({ ...view(), audioHealth: { ...health, reception: 'stale' } });
  assert.equal(l.rows().filter(r => r.event === 'audio_health').length, 3);
  assert.ok(l.rows().filter(r => r.event === 'audio_health').every(r => r.audibleOutput === 'not_verified')); l.trace.dispose();
});

test('throwing console sinks and unsubscribe callbacks never alter calling operations', async () => {
  const l = logger({}, { sink: () => { throw Error('console unavailable'); } }), result = { id: id(10) }, original = api();
  original.createCall = async () => result;
  l.trace.watch({ getSnapshot: view, subscribe: () => () => { throw Error('unsubscribe'); } });
  assert.equal(await l.trace.wrapApi(original).createCall('peer', 'voice', 'matched', 'key', 'device', null), result);
  assert.doesNotThrow(() => l.trace.dispose());
});

test('video and acknowledged provider states remain distinct from physical enforcement', () => {
  const l = logger(), state = observable(view()); l.trace.watch(state);
  for (const camera of ['off', 'starting', 'on', 'stopping', 'failed']) {
    state.set({ ...view(), video: { camera, facing: 'back', permission: 'granted', error: null },
      endBlock: { block: 'saved', call: 'terminal', provider: 'acknowledged', media: 'unverified', error: null } });
  }
  assert.deepEqual(l.rows().filter(r => r.event === 'video').map(r => r.camera), ['off', 'starting', 'on', 'stopping', 'failed']);
  assert.ok(l.rows().some(r => r.event === 'end_and_block' && r.provider === 'acknowledged' && r.remoteMediaShutdown === 'not_verified'));
  l.trace.dispose();
});

test('untrusted native fields cannot expose identifiers or error strings', () => {
  const l = logger(), native = observable({ cid: 'SECRET_CID', generation: 'SECRET_GENERATION', retired: false,
    reason: 'SECRET_REASON', inspection: 'SECRET_INSPECTION', sdk: { callingState: 'SECRET_SDK', microphoneStatus: 'SECRET_MIC', cameraStatus: 'SECRET_CAMERA' },
    operations: { release: 'SECRET_OPERATION' }, token: 'SECRET_TOKEN',
    audioRoute: { requested: 'SECRET_ROUTE', status: 'SECRET_STATE', available: ['SECRET_DEVICE'], selected: 'SECRET_ID', output: 'SECRET_OUTPUT', deviceName: 'SECRET_NAME' } });
  l.trace.watchOwner(native); assert.ok(!l.lines.join('').includes('SECRET'));
  l.trace.dispose(); assert.equal(native.count(), 0);
});

test('route diagnostics distinguish selected IDs from output types using closed labels only', () => {
  const l = logger(), native = observable({ cid: `betweener_connect:${id(10)}`, generation: 1, retired: false, inspection: 'complete', sdk: {}, operations: {},
    audioRoute: { requested: 'speaker', status: 'unconfirmed', available: ['speaker', 'earpiece'], selected: 'earpiece', output: 'speaker' } });
  l.trace.watchOwner(native);
  const route = l.rows().find(row => row.event === 'native_audio_route');
  assert.equal(route.requested, 'speaker'); assert.equal(route.status, 'unconfirmed');
  assert.equal(route.selected, 'earpiece'); assert.equal(route.output, 'speaker');
  assert.equal(route.speakerAvailable, true); assert.equal(route.bluetoothAvailable, false);
  assert.equal(route.evidence, 'native_route_state'); assert.ok(!l.lines.join('').includes(id(10))); l.trace.dispose();
});

test('the final summary retains the first encrypted fault after a healthy successor and Done', () => {
  const l=logger(),state=observable({...view(),session:{id:id(10),state:'ACTIVE',media:'voice',version:1}});
  l.trace.watch(state);
  const native=observable({cid:`betweener_connect:${id(10)}`,generation:1,retired:false,inspection:'complete',appState:'active',operations:{},
    sdk:{failure:{code:'e2ee.unencrypted_frame',trackType:'AUDIO',party:'remote',reason:'SECRET_ERROR',key:'SECRET_KEY'}}});
  l.trace.watchOwner(native);
  l.trace.watchOwner(observable({cid:`betweener_connect:${id(10)}`,generation:2,retired:false,inspection:'complete',appState:'inactive',operations:{},sdk:{}}));
  state.set({...state.getSnapshot(),phase:'ENDED',muted:true,session:{...state.getSnapshot().session,state:'ENDED'}});
  state.set(view());
  const summary=l.rows().findLast(row=>row.event==='call_summary'&&row.reason==='done');
  assert.equal(summary.firstSdkFailure,'e2ee.unencrypted_frame');
  assert.equal(summary.firstSdkFailureTrack,'AUDIO');assert.equal(summary.firstSdkFailureParty,'remote');
  assert.equal(summary.firstSdkFailureGeneration,1);assert.equal(summary.remoteMediaShutdown,'not_verified');
  assert.equal(summary.failed,true);assert.equal(summary.encryptionFailed,true);
  assert.ok(l.rows().some(row=>row.event==='native_owner'&&row.appState==='inactive'));
  assert.ok(!l.lines.join('').includes('SECRET'));l.trace.dispose();
});

test('a native encryption fault corrects an already-ended summary without another controller update', () => {
  const l = logger(), state = observable({ ...view(), phase: 'ENDED', session: { id: id(10), state: 'ENDED', media: 'voice', version: 2 } });
  l.trace.watch(state);
  assert.equal(l.rows().findLast(row => row.event === 'call_summary').failed, false);
  const native = observable({ cid: `betweener_connect:${id(10)}`, generation: 1, retired: true, inspection: 'complete', operations: {}, sdk: {
    failure: { code: 'e2ee.unencrypted_frame', trackType: 'AUDIO', party: 'remote' } } });
  l.trace.watchOwner(native); native.set(native.getSnapshot());
  const corrected = l.rows().findLast(row => row.event === 'call_summary');
  assert.equal(corrected.failed, true); assert.equal(corrected.encryptionFailed, true);
  assert.equal(corrected.reason, 'native_fault'); assert.equal(corrected.firstSdkFailure, 'e2ee.unencrypted_frame');
  assert.equal(l.rows().filter(row => row.event === 'call_summary' && row.reason === 'native_fault').length, 1);
  state.set(view());
  const replay = l.rows().findLast(row => row.event === 'call_summary');
  assert.equal(replay.reason, 'done'); assert.equal(replay.failed, true); assert.equal(replay.encryptionFailed, true);
  l.trace.dispose();
});

test('a late previous-call fault cannot mark the next healthy manual ending as failed', () => {
  const l = logger(), state = observable({ ...view(), phase: 'ENDED', session: { id: id(10), state: 'ENDED', media: 'voice' } });
  l.trace.watch(state);
  state.set({ ...view(), phase: 'ACTIVE', session: { id: id(11), state: 'ACTIVE', media: 'voice' } });
  l.trace.watchOwner(observable({ cid: `betweener_connect:${id(10)}`, generation: 1, retired: true, sdk: {
    failure: { code: 'e2ee.missing_key', trackType: 'AUDIO', party: 'local' } }, operations: {} }));
  state.set({ ...state.getSnapshot(), phase: 'ENDED', session: { ...state.getSnapshot().session, state: 'ENDED' } });
  const healthy = l.rows().findLast(row => row.event === 'call_summary');
  assert.equal(healthy.failed, false); assert.equal(healthy.encryptionFailed, false); assert.equal(healthy.firstSdkFailure, undefined);
  state.set(view()); assert.equal(l.rows().findLast(row => row.event === 'call_summary').failed, false);
  l.trace.dispose();
});

test('an encryption interruption is a failure even when no controller error string or native snapshot is available', () => {
  const l = logger(), state = observable({ ...view(), phase: 'ENDED', interruption: 'encryption_failed',
    session: { id: id(10), state: 'ENDED', media: 'voice' } });
  l.trace.watch(state);
  const failure = l.rows().findLast(row => row.event === 'failure');
  assert.equal(failure.present, true); assert.equal(failure.code, 'connect_encryption_failed');
  const summary = l.rows().findLast(row => row.event === 'call_summary');
  assert.equal(summary.failed, true); assert.equal(summary.encryptionFailed, true);
  l.trace.dispose();
});

test('untrusted native fault fields cannot leak through the final summary', () => {
  const l=logger(),state=observable({...view(),session:{id:id(10),state:'ACTIVE',media:'voice',version:1}});l.trace.watch(state);
  l.trace.watchOwner(observable({cid:`betweener_connect:${id(10)}`,generation:1,retired:false,inspection:'complete',appState:'SECRET_STATE',operations:{},
    sdk:{failure:{code:'SECRET_CODE',trackType:'SECRET_TRACK',party:'SECRET_USER',reason:'SECRET_BODY'}}}));
  state.set({...state.getSnapshot(),phase:'ENDED'});
  assert.ok(!l.lines.join('').includes('SECRET'));
  assert.equal(l.rows().findLast(row=>row.event==='call_summary').firstSdkFailure,'unknown');l.trace.dispose();
});

test('first-fault retention evicts the oldest call after four distinct calls', () => {
  const l=logger(),state=observable(view());l.trace.watch(state);
  for(let n=10;n<15;n++){
    state.set({...view(),phase:'ACTIVE',session:{id:id(n),state:'ACTIVE',media:'voice',version:1}});
    l.trace.watchOwner(observable({cid:`betweener_connect:${id(n)}`,generation:n,retired:false,inspection:'complete',operations:{},
      sdk:{failure:{code:'e2ee.missing_key',trackType:'AUDIO',party:'local'}}}));
  }
  state.set({...view(),phase:'ENDED',session:{id:id(10),state:'ENDED',media:'voice',version:2}});
  assert.equal(l.rows().findLast(row=>row.event==='call_summary'&&row.reason==='state_change').firstSdkFailure,undefined);
  l.trace.dispose();
});

test('late service failures retain their original call binding after another call is displayed', () => {
  const l = logger(), state = observable({ ...view(), session: { id: id(10), state: 'ACTIVE', media: 'voice', version: 1 } });
  l.trace.watch(state); const first = l.rows().find(r => r.event === 'flow').call;
  state.set({ ...view(), session: { id: id(11), state: 'ACTIVE', media: 'voice', version: 1 } });
  l.trace.serviceFailure('rpc', Error('Network request failed'), id(10));
  assert.equal(l.rows().findLast(r => r.event === 'request_failed').call, first);
  assert.notEqual(l.rows().findLast(r => r.event === 'flow').call, first); l.trace.dispose();
});

test('stalled setup produces a start event without claiming completion or hardware verification', async () => {
  const l = logger(), original = api(), pending = deferred(); original.credentials = () => pending.promise;
  const calling = l.trace.wrapApi(original).credentials(id(10), 'device'); await settle();
  assert.equal(l.rows().filter(r => r.event === 'request_started').length, 1);
  assert.equal(l.rows().filter(r => r.event === 'request_completed').length, 0);
  pending.resolve({ token: 'SECRET_LATE_TOKEN' }); await calling; l.trace.dispose();
  assert.ok(!l.lines.join('').includes('SECRET'));
});

test('real controller/native-owner composition emits call stages, SDK cleanup and repeat-call boundaries', async () => {
  const l = logger(), f = fixture(false, { wrapApi: l.trace.wrapApi, onOwner: l.trace.watchOwner });
  l.trace.watch(f.composition.controller);
  for (let n = 0; n < 2; n++) {
    await f.active(); assert.equal(f.composition.controller.getSnapshot().phase, 'ACTIVE');
    await f.composition.controller.hangup(); await f.composition.owner().release(); await settle();
    assert.equal(f.composition.controller.dismissCompletedCall(), true);
  }
  assert.equal(new Set(l.rows().filter(r => r.event === 'request_completed' && r.step === 'create_call').map(r => r.call)).size, 2);
  const replay = l.rows().find(r => r.event === 'call_summary' && r.reason === 'next_call');
  assert.ok(replay); assert.equal(replay.phase, 'ENDED'); assert.equal(replay.release, 'completed');
  for (const stage of ['credentials', 'native_join', 'microphone', 'audio_output', 'ready']) assert.ok(l.rows().some(r => r.event === 'audio_setup' && r.stage === stage), stage);
  assert.ok(l.rows().some(r => r.event === 'native_release' && r.status === 'completed'));
  assert.ok(l.rows().some(r => r.event === 'local_cleanup' && r.release === 'completed' && r.physicalShutdown === 'not_verified'));
  const text = l.lines.join(''); for (const forbidden of ['offline-stream-token', 'offline-key', 'Ama', id(1), id(2), id(3), id(4), id(10), id(11), id(12)]) assert.ok(!text.includes(forbidden), forbidden);
  l.trace.dispose(); const length = l.lines.length; await f.product.dispose(); assert.equal(l.lines.length, length);
});

test('incoming answer and End Call & Block log separate authority/provider states', async () => {
  const l = logger({ platform: 'ios' }), f = fixture(true, { wrapApi: l.trace.wrapApi, onOwner: l.trace.watchOwner });
  l.trace.watch(f.composition.controller); await f.active(); await f.composition.controller.endCallAndBlock();
  await f.composition.owner().release(); await settle();
  assert.ok(l.rows().some(r => r.event === 'request_started' && r.step === 'accept'));
  assert.ok(l.rows().some(r => r.event === 'end_and_block' && r.block === 'saved' && r.call === 'terminal' && r.provider === 'pending' && r.remoteMediaShutdown === 'not_verified'));
  l.trace.dispose(); await f.product.dispose();
});

test('hung native leave leaves pending cleanup visible while authoritative end still executes', async () => {
  const l = logger(), f = fixture(false, { wrapApi: l.trace.wrapApi, onOwner: l.trace.watchOwner }), pending = deferred();
  l.trace.watch(f.composition.controller); await f.active(); const leave = f.handle.leave;
  f.handle.leave = async () => { await pending.promise; return leave(); };
  await f.composition.controller.hangup();
  assert.ok(l.rows().some(r => r.event === 'request_completed' && r.step === 'end'));
  assert.ok(l.rows().some(r => r.event === 'local_cleanup' && r.release === 'pending'));
  assert.equal(l.rows().some(r => r.event === 'native_release' && r.status === 'completed'), false);
  pending.resolve(); await f.composition.owner().release(); await settle(); l.trace.dispose(); await f.product.dispose();
});

test('production composition wires only the guarded console logger and no remote diagnostic transport', () => {
  const source = readFileSync('features/connect/data/load-connect-product.ts', 'utf8');
  for (const required of ['createConnectTerminalLogger(identity)', 'terminal.wrapApi(services.api)', 'terminal.watch(composition.controller)', 'terminal.watchOwner(owner)', 'terminal.dispose()']) assert.ok(source.includes(required), required);
  const loggerSource = readFileSync('features/connect/diagnostics/connect-terminal-logger.ts', 'utf8');
  for (const forbidden of ['fetch(', 'XMLHttpRequest', 'WebSocket', 'addBreadcrumb(', 'captureException(']) assert.ok(!loggerSource.includes(forbidden), forbidden);
});

test('completion summaries retain pending cleanup and replay the final facts when Done clears the call', () => {
  const l = logger(), s = { ...view(), session: { id: id(10), state: 'ACTIVE', media: 'voice', version: 1 }, phase: 'ACTIVE' };
  const state = observable(s); l.trace.watch(state);
  state.set({ ...s, phase: 'ENDING', endStatus: 'pending' });
  const pending = l.rows().findLast(r => r.event === 'call_summary');
  assert.ok(pending); assert.equal(pending.authorityEnd, 'pending');
  state.set({ ...s, phase: 'ENDED', session: { ...s.session, state: 'ENDED', version: 2 }, endStatus: 'terminal',
    localShutdown: { ...unverifiedShutdown(), sdkLeave: 'completed', resourceRelease: 'completed' } });
  state.set(view());
  const final = l.rows().findLast(r => r.event === 'call_summary');
  assert.equal(final.reason, 'done'); assert.equal(final.authorityEnd, 'terminal');
  assert.equal(final.sdkLeave, 'completed'); assert.equal(final.release, 'completed');
  assert.equal(final.remoteMediaShutdown, 'not_verified'); assert.equal(final.providerEnd, 'unknown');
  assert.ok(!l.lines.join('').includes(id(10))); l.trace.dispose();
});

test('the next call and logger disposal replay bounded summaries without inventing an omitted ending', () => {
  const l = logger(), state = observable({ ...view(), phase: 'ACTIVE', session: { id: id(10), state: 'ACTIVE', media: 'video', version: 1 } });
  l.trace.watch(state);
  state.set({ ...view(), phase: 'RINGING', session: { id: id(11), state: 'RINGING', media: 'voice', version: 1 } });
  const old = l.rows().find(r => r.event === 'call_summary' && r.reason === 'next_call');
  assert.ok(old); assert.equal(old.phase, 'ACTIVE'); assert.equal(old.authorityEnd, 'unknown');
  l.trace.dispose();
  assert.equal(l.rows().findLast(r => r.event === 'call_summary').reason, 'logger_disposed');
});

test('summary replay retains at most four sanitized calls in memory', () => {
  const l = logger(), state = observable(view()); l.trace.watch(state);
  for (let n = 0; n < 7; n++) state.set({ ...view(), phase: 'ENDED', endStatus: 'terminal',
    session: { id: id(10 + n), state: 'ENDED', media: 'voice', version: n + 1 },
    peer: { name: 'SECRET_NAME', avatar: 'SECRET_URL' }, error: 'SECRET_ERROR' });
  l.trace.dispose();
  assert.equal(l.rows().filter(r => r.event === 'call_summary' && r.reason === 'logger_disposed').length, 4);
  assert.equal(l.lines.join('').includes('SECRET'), false);
});
