const test = require('node:test');
const assert = require('node:assert/strict');
const { configureConnectMicrophoneInput } = require('../features/connect/media/native-microphone-input.ts');
const { deferred } = require('./fixtures/connect-product-fixture.cjs');
const { assertConnectNativeRuntime } = require('../features/connect/media/native-runtime-contract.ts');

test('iOS capture configuration waits for the native call audio acknowledgement', async () => {
  const gate = deferred(), events = [];
  const pending = configureConnectMicrophoneInput(true, { platform: 'ios', configure: async enabled => { events.push(enabled); await gate.promise; } });
  let ready = false; void pending.then(() => { ready = true; });
  await Promise.resolve(); assert.equal(ready, false); assert.deepEqual(events, [true]);
  gate.resolve(); await pending; assert.equal(ready, true);
});
test('iOS missing native contract fails closed rather than reverting to voice-processing mute', async () => {
  await assert.rejects(configureConnectMicrophoneInput(true, { platform: 'ios' }), /native_build_incompatible/);
});
test('native configuration failure is preserved', async () => {
  const failure = Error('synthetic native failure');
  await assert.rejects(configureConnectMicrophoneInput(true, { platform: 'ios', configure: async () => { throw failure; } }), e => e === failure);
});
test('Android does not call the iOS audio contract', async () => {
  await configureConnectMicrophoneInput(true, { platform: 'android', configure: async () => { assert.fail('iOS only'); } });
});
test('reset uses the same bounded native contract without requesting any capture', async () => {
  const events = [];
  await configureConnectMicrophoneInput(false, { platform: 'ios', configure: async enabled => { events.push(enabled); } });
  assert.deepEqual(events, [false]);
});

test('old iOS binary is rejected before the native SDK factory or provider join can run', () => {
  const noop = () => {};
  const modules = { WebRTCModule: Object.fromEntries(['createCallFactory', 'disposeCallFactory', 'getUserMedia', 'mediaStreamTrackRelease'].map(name => [name, noop])),
    StreamInCallManager: Object.fromEntries(['start', 'stop', 'getAudioDeviceStatus', 'chooseAudioDeviceEndpoint', 'setAudioRole', 'setDefaultAudioDeviceEndpointType', 'setEnableStereoAudioOutput'].map(name => [name, noop])) };
  assert.doesNotThrow(() => assertConnectNativeRuntime(modules, 'android'));
  assert.throws(() => assertConnectNativeRuntime(modules, 'ios'), error => error.message === 'connect_native_build_incompatible'
    && error.missing.includes('StreamInCallManager.configureConnectMicrophoneMute'));
  modules.StreamInCallManager.configureConnectMicrophoneMute = noop;
  assert.doesNotThrow(() => assertConnectNativeRuntime(modules, 'ios'));
});
