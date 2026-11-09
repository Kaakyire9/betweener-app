// Execute pinned SDK leave/reconnect implementations with disposable local ports.
// No SDK client, provider credentials, peer connection or native media is created.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const { deferred } = require('./fixtures/connect-product-fixture.cjs');

const CallingState = Object.fromEntries(['left', 'joined', 'joining', 'ringing', 'reconnecting', 'migrating', 'offline', 'reconnecting-failed'].map(s => [s.replace('-', '_').toUpperCase(), s]));
const WebsocketReconnectStrategy = { UNSPECIFIED: 0, FAST: 1, REJOIN: 2, MIGRATE: 3, DISCONNECT: 4 };
function field(file, name, call) {
  const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
  const klass = source.statements.find(node => ts.isClassDeclaration(node) && node.name?.text === 'Call');
  const member = klass.members.find(node => node.name?.getText(source) === name);
  assert.ok(member?.initializer, `pinned Call.${name} implementation must be available`);
  const compiled = ts.transpile(`module.exports = function () { return ${member.initializer.getText(source)}; };`, { target: ts.ScriptTarget.ES2022 });
  const module = { exports: {} };
  vm.runInNewContext(compiled, { module, exports: { CallingState }, CallingState, WebsocketReconnectStrategy,
    ReconnectReason: { ICE_NEVER_CONNECTED: 'ice' }, hasPending: () => false, withoutConcurrency: (_tag, operation) => operation(),
    Promise, Date, Map, singleFlight: operation => operation });
  return module.exports.call(call);
}
function fixture(file, flush = async () => {}) {
  let reconnects = 0;
  const noop = () => {}, reset = { reset: noop }, device = { dispose: noop, stopOnLeave: false };
  const state = { callingState: 'joined', setCallingState(value) { this.callingState = value; }, setParticipants: noop, dispose: noop };
  const call = { state, leaveGeneration: 0, leaveRequested: false, leaveCallHooks: [], ringing: false, ringingSubject: { next: noop },
    tracer: { trace: noop }, logger: { debug: noop, info: noop, warn: noop }, sfuStatsReporter: { flush, stop: noop },
    clientEventReporter: { abort: noop, unregisterCall: noop }, trackSubscriptionManager: { setSfuClient: noop, dispose: noop },
    rejoinRateLimiter: reset, clientStore: { unregisterCall: noop }, cancelAutoDrop: noop, cancelRingStatePolling: noop,
    camera: device, microphone: device, screenShare: device, speaker: device,
    async reconnectFast() { reconnects++; state.callingState = 'joined'; } };
  call.leave = field(file, 'leave', call);
  call.reconnect = field(file, 'reconnect', call);
  return { call, reconnects: () => reconnects };
}
for (const file of ['src/Call.ts', 'dist/index.cjs.js', 'dist/index.es.js', 'dist/index.browser.es.js']) {
  const path = `node_modules/@stream-io/video-client/${file}`;
  test(`${file}: pending leave prevents new reconnect while state still says joined`, async () => {
    const gate = deferred(), f = fixture(path, () => gate.promise);
    const ending = f.call.leave({ reject: false });
    try {
      assert.equal(f.call.state.callingState, 'joined');
      await f.call.reconnect(1, 'synthetic');
      assert.equal(f.reconnects(), 0, 'retiring peer must not reconnect');
      assert.equal(f.call.leaveGeneration, 1, 'invalidate prior work before yielding');
    } finally { gate.resolve(); await ending; }
  });
  test(`${file}: a reconnect already waiting on network is superseded by leave`, async () => {
    const network = deferred(), f = fixture(path);
    f.call.networkAvailableTask = { promise: network.promise };
    const reconnecting = f.call.reconnect(1, 'synthetic');
    await f.call.leave({ reject: false }); network.resolve(); await reconnecting;
    assert.equal(f.reconnects(), 0); assert.equal(f.call.state.callingState, 'left');
  });
  test(`${file}: active reconnect still works when no leave was requested`, async () => {
    const f = fixture(path); await f.call.reconnect(1, 'synthetic'); assert.equal(f.reconnects(), 1);
  });
  test(`${file}: failed leave stays fenced while a scoped cleanup retry is allowed`, async () => {
    const f = fixture(path, async () => { throw Error('synthetic flush failure'); });
    await assert.rejects(f.call.leave({ reject: false }));
    await f.call.reconnect(1, 'synthetic'); assert.equal(f.reconnects(), 0);
    f.call.sfuStatsReporter.flush = async () => {}; await f.call.leave({ reject: false });
    assert.equal(f.call.state.callingState, 'left');
  });
}
