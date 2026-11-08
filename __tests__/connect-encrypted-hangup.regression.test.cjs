const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { fixture, deferred, settle } = require('./fixtures/connect-product-fixture.cjs');
const { StreamVoiceTransport } = require('../features/connect/media/stream-voice-transport.ts');
const { createNativePublisherRetirement } = require('../features/connect/media/native-publisher-retirement.ts');

for (const state of ['left', 'reconnecting-failed']) {
  test(`${state} notification retires the publisher before emergency microphone disable`, async () => {
    const f = fixture(), events = [];
    try {
      await f.active(); observeTeardown(f, events);
      f.emit(state); await settle(); await settle();
      assert.ok(events.indexOf('publisher-close') >= 0);
      assert.ok(events.indexOf('publisher-close') < events.indexOf('sdk-unpublish'), events.join(','));
    } finally { await f.product.dispose(); }
  });
}

test('unreadable late track inspection cannot prevent stopping previously owned capture', async () => {
  const f = fixture();
  try {
    await f.active(); const owner = f.composition.owner();
    const inspect = f.handle.tracks;
    f.handle.tracks = () => { throw Error('synthetic track inspection failure'); };
    const ending = f.composition.controller.hangup();
    assert.ok(f.tracks.every(track => !track.enabled && track.readyState === 'ended'));
    f.handle.tracks = inspect;
    await ending; await owner.release();
  } finally { await f.product.dispose(); }
});

for (const code of ['e2ee.unencrypted_frame', 'e2ee.encryption_failed', 'e2ee.decryption_stalled', 'e2ee.missing_key', 'e2ee.unsupported_version'])
for (const stage of ['active', 'microphone', 'muted']) {
  test(`${code} during ${stage} cannot request recovery credentials or resume capture`, async () => {
    const f = fixture(false, { connectionRecovery: true });
    const fault = { code, trackType: 'AUDIO', party: 'remote' };
    try {
      if (stage === 'microphone') {
        const enable = f.handle.enableMicrophone;
        f.handle.enableMicrophone = async () => { await enable(); f.sdkState.failure = fault; f.emit('reconnecting-failed'); };
      }
      await f.active();
      if (stage === 'muted') await f.composition.controller.toggleMute();
      if (stage !== 'microphone') { f.sdkState.failure = fault; f.emit('reconnecting-failed'); }
      await settle(); await settle();
      assert.equal(f.counts().credentialCount, 1);
      assert.equal(f.composition.controller.getSnapshot().interruption, 'encryption_failed');
      assert.equal(f.composition.controller.getSnapshot().phase, 'ENDED');
      assert.ok(f.tracks.every(track => !track.enabled && track.readyState === 'ended'));
    } finally { await f.product.dispose(); }
  });
}

// Exercise the installed SDK's disposal methods without constructing a client,
// peer connection, native module or network transport. This proves ordering,
// not physical encryption or device shutdown.
function sdkModule(name, imports = {}) {
  const file = path.join(process.cwd(), 'node_modules/@stream-io/video-client/src/rtc', name);
  const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  const run = vm.runInNewContext(`(function(require,module,exports){${source}\n})`, { clearTimeout });
  run(name => imports[name] ?? {}, module, module.exports);
  return module.exports;
}
const base = sdkModule('BasePeerConnection.ts');
const { Publisher } = sdkModule('Publisher.ts', { './BasePeerConnection': base });
const { Subscriber } = sdkModule('Subscriber.ts', { './BasePeerConnection': base });
const { DeviceManager } = sdkModule('../devices/DeviceManager.ts', { '../store': { CallingState: { JOINED: 'joined' } } });

function installedCallField(name, call) {
  const filename = path.join(process.cwd(), 'node_modules/@stream-io/video-client/src/Call.ts');
  const source = ts.createSourceFile(filename, fs.readFileSync(filename, 'utf8'), ts.ScriptTarget.Latest, true);
  const declaration = source.statements.find(node => ts.isClassDeclaration(node) && node.name.text === 'Call');
  const field = declaration.members.find(node => node.name?.getText(source) === name);
  assert.ok(field?.initializer, `installed SDK Call.${name} must remain available`);
  const compiled = ts.transpileModule(`module.exports = function () { return ${field.initializer.getText(source)}; };`, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} }; vm.runInNewContext(compiled, { module });
  return module.exports.call(call);
}

test('installed SDK device shutdown still releases capture without sending stopPublish through a closed peer', async () => {
  const events = [], gate = deferred();
  const track = { kind: 'audio', enabled: true, readyState: 'live', stop() { this.enabled = false; this.readyState = 'ended'; events.push('capture-stop'); } };
  const publisher = Object.create(Publisher.prototype);
  Object.assign(publisher, { pc: { close() { events.push('publisher-close'); } }, detachEventHandlers() {},
    stopAllTracks: async () => gate.promise, getPublishedTracks: () => [track], clonedTracks: new Set(), logger: { warn() {} } });
  const call = { publisher, sfuClient: {}, state: { callingState: 'joined' }, updateLocalStreamState: async () => events.push('sfu-mute-signal') };
  call.stopPublish = installedCallField('stopPublish', call);
  const retirement = createNativePublisherRetirement(call), device = Object.create(DeviceManager.prototype);
  Object.assign(device, { call, trackType: 1, filters: [], logger: { debug() {} }, stopActiveVirtualSession: async () => {},
    runCurrentStreamCleanups() {}, setLocalInterrupted() {}, state: {
      mediaStream: { getTracks: () => [track], release() { events.push('capture-release'); } },
      setMediaStream(value) { this.mediaStream = value; },
    } });
  const disposal = retirement.dispose();
  try {
    await device.muteStream(true);
    assert.deepEqual(events, ['publisher-close', 'capture-stop', 'capture-release']);
    assert.equal(device.state.mediaStream, undefined);
  } finally { gate.resolve(); await disposal; }
});

function observeTeardown(f, events, { publisherGate, publisherThrows = false, subscriberGate, subscriberThrows = false } = {}) {
  const subscriber = Object.create(Subscriber.prototype);
  Object.assign(subscriber, { pc: { close() { events.push('subscriber-close'); } }, detachEventHandlers() {} });
  const disposeSubscriber = f.handle.disposeSubscriber.bind(f.handle);
  f.handle.disposeSubscriber = async () => {
    if (subscriberThrows) { events.push('subscriber-throw'); throw Error('synthetic subscriber close failure'); }
    await subscriber.dispose();
    if (subscriberGate) await subscriberGate.promise;
    await disposeSubscriber();
  };
  const publisher = Object.create(Publisher.prototype);
  Object.assign(publisher, {
    pc: { close() { events.push('publisher-close'); } },
    detachEventHandlers() {},
    stopAllTracks: async () => { events.push('sender-stop'); if (publisherGate) await publisherGate.promise; },
    clonedTracks: new Set(), logger: { warn() {} },
  });
  const dispose = f.handle.disposePublisher.bind(f.handle);
  f.handle.disposePublisher = async () => {
    if (publisherThrows) { events.push('publisher-throw'); throw Error('synthetic publisher close failure'); }
    await publisher.dispose(); await dispose();
  };
  for (const track of f.tracks) {
    const stop = track.stop.bind(track), release = track.release.bind(track);
    track.stop = () => { events.push('capture-stop'); stop(); };
    track.release = () => { events.push('capture-release'); release(); };
  }
  const disable = f.handle.disableMicrophone.bind(f.handle);
  f.handle.disableMicrophone = async () => { events.push('sdk-unpublish'); await disable(); };
  const leave = f.handle.leave.bind(f.handle);
  f.handle.leave = async () => { events.push('sdk-leave'); await leave(); };
}

for (const ending of ['local', 'remote', 'navigation']) {
  test(`${ending} ending closes the installed receiver then publisher before stopping capture or unpublishing`, async () => {
    const f = fixture(), events = [];
    try {
      await f.active(); observeTeardown(f, events);
      const owner = f.composition.owner();
      if (ending === 'local') await f.composition.controller.hangup();
      else if (ending === 'remote') {
        f.model.state = 'ENDING'; f.model.version++;
        await f.composition.controller.refresh();
      } else owner.retire('navigation');
      await owner.release(); await settle();
      const closed = events.indexOf('publisher-close');
      assert.ok(closed >= 0);
      assert.ok(events.indexOf('subscriber-close') >= 0);
      assert.ok(events.indexOf('subscriber-close') < closed, events.join(','));
      for (const event of ['capture-stop', 'capture-release', 'sdk-unpublish', 'sender-stop']) {
        assert.ok(events.indexOf(event) > closed, `${event} must follow publisher-close: ${events.join(',')}`);
      }
      assert.ok(f.tracks.every(track => !track.enabled && track.readyState === 'ended'));
      assert.equal(owner.getSnapshot().operations.release, 'completed');
    } finally { await f.product.dispose(); }
  });
}

test('a pending publisher disposal never delays immediate capture stop, release or SDK leave', async () => {
  const f = fixture(), events = [], gate = deferred();
  try {
    await f.active(); observeTeardown(f, events, { publisherGate: gate });
    const owner = f.composition.owner(), ending = f.composition.controller.hangup();
    assert.deepEqual(events.slice(0, 2), ['subscriber-close', 'publisher-close']);
    assert.ok(events.includes('capture-stop'));
    assert.ok(events.includes('capture-release'));
    assert.ok(events.includes('sdk-unpublish'));
    assert.ok(events.includes('sdk-leave'));
    assert.ok(f.tracks.every(track => !track.enabled && track.readyState === 'ended'));
    assert.equal(owner.getSnapshot().operations.publisher, 'pending');
    gate.resolve(); await ending; await owner.release();
    assert.equal(owner.getSnapshot().operations.publisher, 'completed');
  } finally { gate.resolve(); await f.product.dispose(); }
});

test('a publisher close failure cannot suppress independent privacy cleanup', async () => {
  const f = fixture(), events = [];
  try {
    await f.active(); observeTeardown(f, events, { publisherThrows: true });
    const owner = f.composition.owner();
    await f.composition.controller.hangup(); await settle();
    assert.deepEqual(events.slice(0, 2), ['subscriber-close', 'publisher-throw']);
    assert.ok(events.includes('capture-stop'));
    assert.ok(events.includes('capture-release'));
    assert.ok(events.includes('sdk-unpublish'));
    assert.ok(events.includes('sdk-leave'));
    assert.ok(f.tracks.every(track => !track.enabled && track.readyState === 'ended'));
    assert.equal(owner.getSnapshot().operations.publisher, 'failed');
  } finally { await f.product.dispose(); }
});

for (const subscriberThrows of [false, true]) {
  test(`a ${subscriberThrows ? 'failed' : 'pending'} receiver disposal cannot delay sender closure, capture release or leave`, async () => {
    const f = fixture(), events = [], gate = deferred();
    try {
      await f.active(); observeTeardown(f, events, { subscriberGate: gate, subscriberThrows });
      const owner = f.composition.owner(), ending = f.composition.controller.hangup();
      assert.deepEqual(events.slice(0, 2), [subscriberThrows ? 'subscriber-throw' : 'subscriber-close', 'publisher-close']);
      for (const event of ['capture-stop', 'capture-release', 'sdk-unpublish', 'sdk-leave']) assert.ok(events.includes(event), event);
      assert.ok(f.tracks.every(track => !track.enabled && track.readyState === 'ended'));
      if (!subscriberThrows) assert.equal(owner.getSnapshot().operations.subscriber, 'pending');
      gate.resolve(); await ending; await settle();
      assert.equal(owner.getSnapshot().operations.subscriber, subscriberThrows ? 'failed' : 'completed');
    } finally { gate.resolve(); await f.product.dispose(); }
  });
}

for (const failure of ['pending', 'throwing']) {
  test(`a ${failure} generic leave cannot postpone microphone or camera stop requests`, async () => {
    const events = [], gate = deferred();
    const bindings = {
      call: {
        state: { callingState$: { subscribe: () => ({ unsubscribe() {} }) } },
        microphone: { disable: async () => { events.push('microphone-stop'); } },
        camera: { disable: async () => { events.push('camera-stop'); } },
        join: async () => {},
        leave: () => { events.push('leave'); if (failure === 'throwing') throw Error('synthetic leave failure'); return gate.promise; },
      },
      release: async () => { events.push('release'); },
    };
    const transport = new StreamVoiceTransport(async () => bindings);
    await transport.join({ media: 'voice', apiKey: 'synthetic', token: 'synthetic', user: { id: 'synthetic' },
      expiresAt: new Date(Date.now() + 60000).toISOString(), call: { id: 'synthetic', type: 'betweener_connect', cid: 'betweener_connect:synthetic' } },
    async () => { throw Error('credentials must not be requested'); }, () => {});
    events.length = 0;
    try {
      const ending = transport.leave();
      assert.deepEqual(events.slice(0, 3), ['leave', 'microphone-stop', 'camera-stop']);
      gate.resolve(); const result = await ending;
      assert.equal(result.sdkLeave, failure === 'throwing' ? 'failed' : 'completed');
    } finally { gate.resolve(); await transport.leave(); }
  });
}
