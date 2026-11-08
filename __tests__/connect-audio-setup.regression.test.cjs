const test = require('node:test');
const assert = require('node:assert/strict');
const { assertConnectNativeRuntime, ConnectNativeBuildError } = require('../features/connect/media/native-runtime-contract.ts');
const { audioSetupFailure } = require('../features/connect/voice/audio-setup.ts');
const { fixture } = require('./fixtures/connect-product-fixture.cjs');

function modules() {
  const neverInvoke = () => { throw Error('native methods must not be invoked during inspection'); };
  return {
    WebRTCModule: Object.fromEntries(['createCallFactory', 'disposeCallFactory', 'getUserMedia', 'mediaStreamTrackRelease'].map(name => [name, neverInvoke])),
    StreamInCallManager: Object.fromEntries(['start', 'stop', 'getAudioDeviceStatus', 'chooseAudioDeviceEndpoint', 'setAudioRole', 'setDefaultAudioDeviceEndpointType', 'setEnableStereoAudioOutput'].map(name => [name, neverInvoke])),
  };
}

test('native runtime inspection checks required API presence without invoking native methods', () => {
  assert.doesNotThrow(() => assertConnectNativeRuntime(modules()));
});

for (const [name, api] of [['WebRTCModule', 'createCallFactory'], ['WebRTCModule', 'disposeCallFactory'], ['StreamInCallManager', 'getAudioDeviceStatus']]) {
  test(`missing ${name}.${api} produces a specific bounded build diagnostic`, () => {
    const input = modules(); delete input[name][api];
    assert.throws(() => assertConnectNativeRuntime(input), error => {
      assert.ok(error instanceof ConnectNativeBuildError);
      assert.deepEqual(error.missing, [`${name}.${api}`]);
      return true;
    });
  });
}

test('throwing native bridge getters do not expose raw errors or stop remaining checks', () => {
  const input = modules();
  Object.defineProperty(input.WebRTCModule, 'createCallFactory', { get() { throw Error('credential_SENTINEL'); } });
  delete input.StreamInCallManager.start;
  assert.throws(() => assertConnectNativeRuntime(input), error => {
    assert.deepEqual(error.missing, ['WebRTCModule.createCallFactory', 'StreamInCallManager.start']);
    assert.ok(!JSON.stringify(audioSetupFailure('native_join', error)).includes('SENTINEL'));
    return true;
  });
});

test('unknown SDK/provider errors become closed stage codes with no raw payload', () => {
  for (const stage of ['credentials', 'native_join', 'microphone', 'audio_output']) {
    const failure = audioSetupFailure(stage, Error('token_SENTINEL raw-SDP provider body'));
    assert.deepEqual(failure, { stage, code: `audio_${stage}_failed`, missingNativeApis: [] });
  }
});

test('output ownership and superseded requests have bounded diagnostics', () => {
  for (const [reason, code] of [
    ['connect_native_route_no_owner', 'audio_output_no_owner'],
    ['connect_native_owner_retired', 'audio_output_cancelled'],
    ['connect_native_route_superseded', 'audio_output_superseded'],
  ]) {
    assert.equal(audioSetupFailure('audio_output', Error(reason)).code, code);
  }
});

test('a missing native API before client creation ends authority and permits dismissal without claiming hardware shutdown', async () => {
  const f = fixture(true, { loadSdk: async () => { throw new ConnectNativeBuildError(['WebRTCModule.createCallFactory']); } });
  const controller = f.composition.controller;
  await controller.receive(f.model);
  await controller.accept();
  assert.equal(controller.getSnapshot().phase, 'FAILED');
  assert.equal(controller.getSnapshot().audioSetupFailure.code, 'native_build_incompatible');
  assert.equal(controller.getSnapshot().endStatus, 'terminal');
  assert.equal(controller.getSnapshot().localShutdown.microphone, 'unverified');
  assert.equal(controller.canDismissCompletedCall(), true);
  assert.ok(!f.events.includes('client-created'));
  assert.equal(controller.dismissCompletedCall(), true);
  assert.equal(controller.getSnapshot().audioSetupFailure, undefined);
  await f.product.dispose();
});
