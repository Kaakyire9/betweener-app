const test = require('node:test');
const assert = require('node:assert/strict');
const { createNativeAudioRouteSelector, CONNECT_AUDIO_ROUTE_TIMEOUT_MS } = require('../features/connect/media/native-audio-route.ts');
const { fixture: productFixture, settle } = require('./fixtures/connect-product-fixture.cjs');

const empty = { devices: [], currentEndpointType: 'Speaker' };
const ready = { devices: [{ id: 'telecom-ear', type: 'Earpiece' }, { id: 'telecom-speaker', type: 'Speaker' }], selectedDeviceId: 'telecom-ear' };
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
function fixture(t) {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  let state = empty, current = true;
  const requests = [];
  const audio = { devices: async () => state, select: id => requests.push(id) };
  const selector = createNativeAudioRouteSelector({ audio, isCurrent: () => current });
  return { selector, audio, requests, set(next) { state = next; }, observe(next) { state = next; selector.observe(next); },
    retire() { current = false; selector.cancel(); } };
}

test('an empty Telecom endpoint snapshot waits for fresh device discovery before confirmation', async t => {
  const f = fixture(t); let complete = false;
  const result = f.selector.select('earpiece').then(value => { complete = true; return value; });
  await flush(); assert.equal(complete, false); assert.deepEqual(f.requests, []);
  f.set(ready); t.mock.timers.tick(100); await flush();
  assert.equal((await result).selectedDeviceId, 'telecom-ear');
  assert.deepEqual(f.requests, []);
});

test('a native event can supply endpoints after an empty first read, with one exact switch', async t => {
  const f = fixture(t), result = f.selector.select('speaker');
  await flush(); f.observe(ready); await flush();
  assert.deepEqual(f.requests, ['telecom-speaker']);
  f.observe({ ...ready, selectedDeviceId: 'telecom-speaker' });
  assert.equal((await result).selectedDeviceId, 'telecom-speaker');
  assert.deepEqual(f.requests, ['telecom-speaker']);
});

test('an empty intermediate snapshot cannot confirm or abort an outstanding route switch', async t => {
  const f = fixture(t); f.set(ready); let complete = false;
  const result = f.selector.select('speaker').then(value => { complete = true; return value; });
  await flush(); f.observe(empty); await flush();
  assert.equal(complete, false); assert.deepEqual(f.requests, ['telecom-speaker']);
  f.observe({ ...ready, selectedDeviceId: 'telecom-speaker' });
  assert.equal((await result).selectedDeviceId, 'telecom-speaker');
});

test('endpoint type without devices never becomes route evidence or extends the deadline', async t => {
  const f = fixture(t), result = assert.rejects(f.selector.select('speaker'), /route_unconfirmed/);
  await flush(); t.mock.timers.tick(CONNECT_AUDIO_ROUTE_TIMEOUT_MS - 100); await flush();
  f.observe(empty); t.mock.timers.tick(100); await result;
  f.observe({ ...ready, selectedDeviceId: 'telecom-speaker' });
  assert.deepEqual(f.requests, []);
});

test('End while waiting for Telecom discovery fences all late endpoint events', async t => {
  const f = fixture(t), result = assert.rejects(f.selector.select('earpiece'), /owner_retired/);
  await flush(); f.retire(); await result;
  f.observe({ ...ready, selectedDeviceId: 'telecom-speaker' });
  t.mock.timers.tick(CONNECT_AUDIO_ROUTE_TIMEOUT_MS); await flush();
  assert.deepEqual(f.requests, []);
});

test('discovery from a newer native event cannot be overwritten by an old empty read', async t => {
  const f = fixture(t); let release;
  f.audio.devices = () => new Promise(resolve => { release = resolve; });
  const result = f.selector.select('speaker');
  f.observe(ready); assert.deepEqual(f.requests, ['telecom-speaker']);
  release(empty); await flush();
  f.observe({ ...ready, selectedDeviceId: 'telecom-speaker' });
  assert.equal((await result).selectedDeviceId, 'telecom-speaker');
  assert.deepEqual(f.requests, ['telecom-speaker']);
});

test('fresh discovery that excludes the requested route still fails without a fallback', async t => {
  const f = fixture(t), result = assert.rejects(f.selector.select('earpiece'), /route_unavailable/);
  await flush();
  f.observe({ devices: [ready.devices[1]], selectedDeviceId: 'telecom-speaker' });
  await result; assert.deepEqual(f.requests, []);
});

test('voice setup keeps its earpiece preference through Telecom endpoint initialization', async () => {
  let state = ready, observer = () => {};
  const f = productFixture(false, { loadSdk: async () => sdk });
  const sdk = { createClient: () => f.client, audio: () => ({ configure() {}, clearConfiguration() {}, devices: async () => state,
    observeDevices(listener) { observer = listener; state = empty; return () => { observer = () => {}; }; },
    observeInterruption: () => () => {},
    select() { throw Error('An already selected earpiece must not request another output'); } }) };
  let active;
  try {
    active = f.active(); await settle();
    assert.equal(f.composition.controller.getSnapshot().audioSetupStage, 'audio_output');
    state = ready; observer(ready); await active;
    const view = f.composition.controller.getSnapshot();
    assert.equal(view.phase, 'ACTIVE'); assert.equal(view.audioSetupStage, 'ready');
    assert.equal(view.route, 'earpiece'); assert.equal(view.error, null);
    assert.equal(f.counts().credentialCount, 1);
    assert.equal(f.events.filter(event => event.rpc === 'rpc_connect_act').length, 0);
  } finally {
    state = ready; observer(ready);
    await f.product.dispose(); await active?.catch(() => {});
  }
});
