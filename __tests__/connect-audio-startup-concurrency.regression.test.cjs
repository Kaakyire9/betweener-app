const test = require('node:test');
const assert = require('node:assert/strict');
const { prepareJoinedAudio, audioSetupFailure } = require('../features/connect/voice/audio-setup.ts');
const { fixture, deferred, settle } = require('./fixtures/connect-product-fixture.cjs');

test('joined audio starts both independent operations and waits for both acknowledgements', async () => {
  const mic = deferred(), output = deferred(), events = []; let ready = false;
  const result = prepareJoinedAudio({ microphone: () => mic.promise, output: () => output.promise,
    started: stage => events.push(`start:${stage}`), completed: stage => events.push(`done:${stage}`) }).then(() => { ready = true; });
  assert.deepEqual(events, ['start:microphone', 'start:audio_output']);
  output.resolve(); await settle(); assert.equal(ready, false);
  mic.resolve(); await result;
  assert.deepEqual(events, ['start:microphone', 'start:audio_output', 'done:audio_output', 'done:microphone']);
});

for (const failing of ['microphone', 'audio_output']) test(`${failing} failure is prompt and correctly classified while the other operation is pending`, async () => {
  const gates = { microphone: deferred(), audio_output: deferred() };
  const result = prepareJoinedAudio({ microphone: () => gates.microphone.promise, output: () => gates.audio_output.promise,
    started() {}, completed() {} });
  gates[failing].reject(Error(failing === 'audio_output' ? 'connect_native_route_unconfirmed' : 'SECRET_NATIVE_ERROR'));
  await assert.rejects(result, error => {
    const failure = audioSetupFailure('native_join', error);
    assert.equal(failure.stage, failing);
    assert.equal(failure.code, failing === 'audio_output' ? 'audio_output_unconfirmed' : 'audio_microphone_failed');
    assert.equal(JSON.stringify(failure).includes('SECRET'), false); return true;
  });
  gates[failing === 'microphone' ? 'audio_output' : 'microphone'].reject(Error('late rejection must be handled'));
  await settle();
});

function product() {
  const gate = deferred(), switches = []; let selected = 'speaker', observe = () => {};
  const devices = [{ id: 'ear', type: 'Earpiece' }, { id: 'speaker', type: 'Speaker' }];
  const f = fixture(false, { loadSdk: async () => sdk });
  const sdk = { createClient: () => f.client, audio: () => ({ configure() {}, clearConfiguration() {},
    devices: async () => ({ devices, selectedDeviceId: selected }),
    select(id) { switches.push(id); selected = id; observe({ devices, selectedDeviceId: id }); },
    observeDevices(listener) { observe = listener; return () => { observe = () => {}; }; }, observeInterruption: () => () => {} }) };
  const enable = f.handle.enableMicrophone;
  f.handle.enableMicrophone = async () => { await gate.promise; await enable(); };
  return { f, gate, switches };
}

test('real composition confirms the output while microphone startup is still pending', async () => {
  const { f, gate, switches } = product(); let active;
  try {
    active = f.active(); await settle();
    assert.deepEqual(switches, ['ear']); assert.equal(f.composition.controller.getSnapshot().audioSetupStage, 'audio_output');
    assert.notEqual(f.composition.controller.getSnapshot().phase, 'ACTIVE');
    gate.resolve(); await active;
    assert.equal(f.composition.controller.getSnapshot().phase, 'ACTIVE');
    assert.equal(f.composition.controller.getSnapshot().route, 'earpiece');
  } finally { gate.resolve(); await active?.catch(() => {}); await f.product.dispose(); }
});

for (const interrupt of ['End', 'account change', 'output failure']) test(`${interrupt} during concurrent setup stops capture that arrives late and never reports ready`, async () => {
  const { f, gate } = product(); let active;
  try {
    if (interrupt === 'output failure') f.composition.transport.selectRoute = async () => { throw Error('connect_native_route_unconfirmed'); };
    active = f.active(); await settle();
    if (interrupt === 'End') await f.composition.controller.hangup();
    if (interrupt === 'account change') f.nativeAuth.invalidate();
    await settle();
    assert.notEqual(f.composition.controller.getSnapshot().audioSetupStage, 'ready');
    if (interrupt === 'output failure') assert.equal(f.composition.controller.getSnapshot().audioSetupFailure.code, 'audio_output_unconfirmed');
    gate.resolve(); await active; await settle();
    assert.ok(f.tracks.length > 0); assert.ok(f.tracks.every(track => !track.enabled && track.readyState === 'ended'));
    assert.notEqual(f.composition.controller.getSnapshot().audioSetupStage, 'ready');
    assert.equal(f.counts().credentialCount, 1);
  } finally { gate.resolve(); await active?.catch(() => {}); await f.product.dispose(); }
});
