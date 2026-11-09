const test = require('node:test');
const assert = require('node:assert/strict');
const { observedNativeAudioRoute } = require('../features/connect/media/native-audio-route.ts');
const { fixture, settle } = require('./fixtures/connect-product-fixture.cjs');

const ear = { id: 'session-ear', type: 'Earpiece' };
const speaker = { id: 'session-speaker', type: 'Speaker' };
const bluetooth = { id: 'session-bt', type: 'Bluetooth Device' };
const wired = { id: 'session-wired', type: 'Wired Headset' };

function liveFixture(initial = ear) {
  const listeners = new Set();
  let state = { devices: [ear, speaker, bluetooth, wired], selectedDeviceId: initial.id, currentEndpointType: initial.type };
  let subscriptions = 0;
  const selections = [];
  const publish = next => { state = next; for (const listener of listeners) listener(state); };
  let f;
  const audio = {
    configure() {}, clearConfiguration() {}, devices: async () => state,
    select(id) { selections.push(id); const device = state.devices.find(item => item.id === id); publish({ ...state, selectedDeviceId: id, currentEndpointType: device?.type }); },
    observeDevices(listener) { subscriptions++; listeners.add(listener); return () => listeners.delete(listener); },
    observeInterruption: () => () => {},
  };
  f = fixture(false, { loadSdk: async () => ({ createClient(input) { f.client.input = input; return f.client; }, audio: () => audio }) });
  return { ...f, listeners, selections, subscriptions: () => subscriptions,
    selected(device) { publish({ devices: [ear, speaker, bluetooth, wired], selectedDeviceId: device.id, currentEndpointType: device.type }); },
    publish,
    async dispose() { await f.composition.controller.hangup(); await f.composition.owner()?.release(); await f.product.dispose(); },
  };
}

test('presentation requires an exact selected accessory ID, while unique built-in type remains supported', () => {
  for (const device of [ear, speaker, bluetooth, wired]) {
    const expected = new Map([[ear, 'earpiece'], [speaker, 'speaker'], [bluetooth, 'bluetooth'], [wired, 'wired']]).get(device);
    assert.equal(observedNativeAudioRoute({ devices: [device], selectedDeviceId: device.id }), expected);
  }
  for (const device of [bluetooth, wired]) {
    assert.equal(observedNativeAudioRoute({ devices: [device], currentEndpointType: device.type }), null);
    assert.equal(observedNativeAudioRoute({ devices: [device], selectedDeviceId: 'old-call-id', currentEndpointType: device.type }), null);
  }
  assert.equal(observedNativeAudioRoute({ devices: [], currentEndpointType: 'Bluetooth Device' }), null);
  assert.equal(observedNativeAudioRoute({ devices: [ear], currentEndpointType: ear.type }), 'earpiece');
  assert.equal(observedNativeAudioRoute({ devices: [ear, { ...ear, id: 'second-ear' }], currentEndpointType: ear.type }), null);
});

test('Bluetooth, wired and phone changes reach the controller without waiting for a mute or server poll', async () => {
  const f = liveFixture();
  try {
    await f.active();
    for (const [device, route] of [[bluetooth, 'bluetooth'], [wired, 'wired'], [speaker, 'speaker'], [ear, 'earpiece']]) {
      f.selected(device);
      assert.equal(f.composition.controller.getSnapshot().route, route);
    }
    f.selected(bluetooth);
    await f.composition.controller.toggleMute();
    assert.equal(f.composition.controller.getSnapshot().muted, true);
    assert.equal(f.composition.controller.getSnapshot().route, 'bluetooth');
    await f.composition.controller.toggleMute();
    assert.equal(f.composition.controller.getSnapshot().muted, false);
    assert.equal(f.composition.controller.getSnapshot().route, 'bluetooth');
    assert.equal(f.subscriptions(), 1, 'reuse the owner device observer');
  } finally { await f.dispose(); }
});

test('startup keeps an already selected Bluetooth output instead of forcing the phone earpiece', async () => {
  const f = liveFixture(bluetooth);
  try {
    await f.active();
    assert.equal(f.composition.controller.getSnapshot().route, 'bluetooth');
    assert.deepEqual(f.selections, []);
  } finally { await f.dispose(); }
});

test('an unavailable current output is unknown rather than the previous requested output', async () => {
  const f = liveFixture();
  try {
    await f.active();
    f.publish({ devices: [ear, bluetooth], selectedDeviceId: 'retired-endpoint', currentEndpointType: 'Bluetooth Device' });
    assert.equal(f.composition.controller.getSnapshot().route, null);
    assert.deepEqual(f.composition.controller.getSnapshot().routes, ['earpiece', 'bluetooth']);
  } finally { await f.dispose(); }
});

test('retired native callbacks cannot update the next call and route observers are removed on End', async () => {
  const f = liveFixture();
  try {
    await f.active();
    const retired = [...f.listeners];
    await f.composition.controller.hangup(); await f.composition.owner().release(); await settle();
    assert.equal(f.listeners.size, 0);
    await f.active();
    const before = f.composition.controller.getSnapshot();
    for (const listener of retired) listener({ devices: [bluetooth], selectedDeviceId: bluetooth.id });
    assert.equal(f.composition.controller.getSnapshot().route, before.route);
    assert.equal(f.composition.controller.getSnapshot().session.id, before.session.id);
  } finally { await f.dispose(); }
});
