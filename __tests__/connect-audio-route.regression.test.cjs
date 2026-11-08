const test = require('node:test');
const assert = require('node:assert/strict');
const { createNativeAudioRouteSelector, CONNECT_AUDIO_ROUTE_TIMEOUT_MS } = require('../features/connect/media/native-audio-route.ts');
const { audioSetupFailure } = require('../features/connect/voice/audio-setup.ts');

const devices = [{ id: 'ear', type: 'Earpiece' }, { id: 'speaker', type: 'Speaker' }, { id: 'bt', type: 'Bluetooth Device' }];
const snapshot = selectedDeviceId => ({ devices, selectedDeviceId });
const deferred = () => { let resolve; const promise = new Promise(yes => { resolve = yes; }); return { resolve, promise }; };
const flush = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); };
function fixture(t, initial = snapshot('ear')) {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  let state = initial, active = true, reads = 0;
  const requests = [];
  const audio = { async devices() { reads++; return state; }, select(id) { requests.push(id); } };
  const selector = createNativeAudioRouteSelector({ audio, isCurrent: () => active });
  return { audio, selector, requests, reads: () => reads,
    set(value) { state = value; }, observe(value) { state = value; selector.observe(value); },
    retire() { active = false; selector.cancel(); },
  };
}

test('an asynchronous route event confirms the requested device after an initial old readback', async t => {
  const f = fixture(t); let completed = false;
  const result = f.selector.select('speaker').then(state => { completed = true; return state; });
  await flush(); assert.deepEqual(f.requests, ['speaker']); assert.equal(completed, false);
  f.observe(snapshot('speaker'));
  assert.equal((await result).selectedDeviceId, 'speaker');
  const reads = f.reads(); t.mock.timers.tick(10_000); await flush(); assert.equal(f.reads(), reads);
});

test('bounded polling confirms a route even when no native change event arrives', async t => {
  const f = fixture(t), result = f.selector.select('speaker'); await flush();
  f.set(snapshot('speaker')); t.mock.timers.tick(100); await flush();
  assert.equal((await result).selectedDeviceId, 'speaker'); assert.equal(f.requests.length, 1);
});

test('a matching route event cannot confirm an unacknowledged native switch', async t => {
  const f = fixture(t), gate = deferred(); let completed = false;
  f.audio.select = id => { f.requests.push(id); return gate.promise; };
  const result = f.selector.select('speaker').then(state => { completed = true; return state; });
  await flush(); f.observe(snapshot('speaker')); await flush();
  assert.equal(completed, false);
  gate.resolve(); assert.equal((await result).selectedDeviceId, 'speaker');
  assert.deepEqual(f.requests, ['speaker']);
});

test('a rejected Telecom switch fails immediately even if a route event looked selected', async t => {
  const f = fixture(t); let reject;
  f.audio.select = () => new Promise((_, no) => { reject = no; });
  const result = assert.rejects(f.selector.select('speaker'), /route_unavailable/);
  await flush(); f.observe(snapshot('speaker')); reject(Error('PRIVATE_NATIVE_ERROR')); await result;
});

test('End fences a late switch acknowledgement and never confirms the retired route', async t => {
  const f = fixture(t), gate = deferred();
  f.audio.select = () => gate.promise;
  const result = assert.rejects(f.selector.select('speaker'), /owner_retired/);
  await flush(); f.observe(snapshot('speaker')); f.retire(); await result;
  gate.resolve(); await flush(); t.mock.timers.tick(CONNECT_AUDIO_ROUTE_TIMEOUT_MS);
});

test('an unacknowledged native switch still uses the original fixed deadline', async t => {
  const f = fixture(t), gate = deferred();
  f.audio.select = () => gate.promise;
  const result = assert.rejects(f.selector.select('speaker'), /route_unconfirmed/);
  await flush(); f.observe(snapshot('speaker'));
  t.mock.timers.tick(CONNECT_AUDIO_ROUTE_TIMEOUT_MS); await result;
  gate.resolve(); await flush();
});

test('a fresh read of the already selected device avoids an unnecessary native switch', async t => {
  const f = fixture(t);
  assert.equal((await f.selector.select('earpiece')).selectedDeviceId, 'ear');
  assert.deepEqual(f.requests, []);
});

test('a built-in endpoint type confirms only its unique device when selected ID is unknown', async t => {
  const f = fixture(t, { devices, currentEndpointType: 'Earpiece' });
  assert.equal((await f.selector.select('earpiece')).currentEndpointType, 'Earpiece');
  assert.deepEqual(f.requests, []);
});

test('a known different selected ID cannot be overridden by a matching endpoint type', async t => {
  const f = fixture(t, { ...snapshot('ear'), currentEndpointType: 'Speaker' });
  const result = assert.rejects(f.selector.select('speaker'), /route_unconfirmed/);
  await flush(); t.mock.timers.tick(CONNECT_AUDIO_ROUTE_TIMEOUT_MS); await result;
  assert.deepEqual(f.requests, ['speaker']);
});

test('ambiguous built-in devices cannot be confirmed by endpoint type alone', async t => {
  const f = fixture(t, { devices: [...devices, { id: 'speaker-other', type: 'Speaker' }], currentEndpointType: 'Speaker' });
  const result = assert.rejects(f.selector.select('speaker'), /route_unconfirmed/);
  await flush(); t.mock.timers.tick(CONNECT_AUDIO_ROUTE_TIMEOUT_MS); await result;
});

test('peripheral outputs always require the exact selected device ID', async t => {
  const f = fixture(t, { devices, currentEndpointType: 'Bluetooth Device' });
  const result = assert.rejects(f.selector.select('bluetooth'), /route_unconfirmed/);
  await flush(); t.mock.timers.tick(CONNECT_AUDIO_ROUTE_TIMEOUT_MS); await result;
});

test('a hung first status read times out without issuing a late native switch', async t => {
  const f = fixture(t), gate = deferred(); f.audio.devices = () => gate.promise;
  const result = assert.rejects(f.selector.select('speaker'), /route_unconfirmed/);
  await flush(); t.mock.timers.tick(CONNECT_AUDIO_ROUTE_TIMEOUT_MS); await result;
  gate.resolve(snapshot('ear')); await flush(); assert.deepEqual(f.requests, []);
});

test('retirement cancels route confirmation and late events do not resurrect it', async t => {
  const f = fixture(t), result = assert.rejects(f.selector.select('speaker'), /owner_retired/);
  await flush(); f.retire(); await result;
  const reads = f.reads(); f.observe(snapshot('speaker')); t.mock.timers.tick(10_000); await flush();
  assert.equal(f.reads(), reads); assert.deepEqual(f.requests, ['speaker']);
});

test('a newer selection cancels an older pending read before it can select the old device', async t => {
  const f = fixture(t), gate = deferred(); let count = 0;
  f.audio.devices = () => ++count === 1 ? gate.promise : Promise.resolve(snapshot('ear'));
  const old = assert.rejects(f.selector.select('speaker'), /owner_retired/);
  const current = f.selector.select('earpiece');
  await old; assert.equal((await current).selectedDeviceId, 'ear');
  gate.resolve(snapshot('ear')); await flush(); assert.deepEqual(f.requests, []);
});

test('an old status result cannot override a newer route event or falsely confirm selection', async t => {
  const f = fixture(t), gate = deferred(); let completed = false;
  const result = f.selector.select('speaker').then(state => { completed = true; return state; });
  await flush(); f.audio.devices = () => gate.promise; t.mock.timers.tick(100); await flush();
  f.observe(snapshot('bt')); gate.resolve(snapshot('speaker')); await flush(); assert.equal(completed, false);
  f.observe(snapshot('speaker')); assert.equal((await result).selectedDeviceId, 'speaker');
});

test('a disappearing requested output is unavailable and cannot silently fall back', async t => {
  const f = fixture(t), result = assert.rejects(f.selector.select('speaker'), /route_unavailable/);
  await flush(); f.observe({ devices: [devices[0]], selectedDeviceId: 'ear' }); await result;
  assert.deepEqual(f.requests, ['speaker']);
});

test('a malformed native device ID is never submitted for selection', async t => {
  const f = fixture(t, { devices: [{ type: 'Earpiece' }] });
  await assert.rejects(f.selector.select('earpiece'), /route_unavailable/); assert.deepEqual(f.requests, []);
});

test('route failures retain distinct diagnostic codes without raw native errors', () => {
  for (const suffix of ['unconfirmed', 'unavailable']) {
    assert.equal(audioSetupFailure('audio_output', Error(`connect_native_route_${suffix}`)).code, `audio_output_${suffix}`);
  }
  assert.deepEqual(audioSetupFailure('audio_output', Error('sensitive_SENTINEL')), { stage: 'audio_output', code: 'audio_audio_output_failed', missingNativeApis: [] });
});

test('fresh route readbacks reach diagnostics without changing strict confirmation', async t => {
  const f = fixture(t); const observed = [];
  const selector = createNativeAudioRouteSelector({ audio: f.audio, isCurrent: () => true, onRead: state => observed.push(state) });
  const result = assert.rejects(selector.select('speaker'), /route_unconfirmed/); await flush();
  f.set({ ...snapshot('ear'), currentEndpointType: 'Speaker' }); t.mock.timers.tick(100); await flush();
  assert.equal(observed.at(-1).selectedDeviceId, 'ear'); assert.equal(observed.at(-1).currentEndpointType, 'Speaker');
  t.mock.timers.tick(CONNECT_AUDIO_ROUTE_TIMEOUT_MS); await result;
});

test('throwing diagnostic readers cannot prevent a valid native route confirmation', async t => {
  const f = fixture(t);
  const selector = createNativeAudioRouteSelector({ audio: f.audio, isCurrent: () => true, onRead: () => { throw Error('observer-failure'); } });
  assert.equal((await selector.select('earpiece')).selectedDeviceId, 'ear'); assert.deepEqual(f.requests, []);
});
