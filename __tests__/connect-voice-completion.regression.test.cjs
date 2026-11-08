const test = require('node:test');
const assert = require('node:assert/strict');
const { VoiceController } = require('../features/connect/voice/voice-controller.ts');
const { voiceSafetyStatus } = require('../features/connect/voice/voice-safety-status.ts');
const { pendingShutdown, unverifiedShutdown } = require('../features/connect/media/local-shutdown.ts');
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const settle = () => new Promise(r => setImmediate(r));
function fixture(incoming = false) {
  let model = { id: 'offline-call', caller_profile_id: incoming ? 'peer' : 'self', recipient_profile_id: incoming ? 'self' : 'peer',
    media: 'voice', authorization: 'matched', created_at: '2026-10-31T08:00:00Z', state: 'RINGING', version: 1,
    accepted_at: null, connected_at: null, ended_at: null, deadline: null, reason: null, duration_seconds: null };
  const actions = []; let joins = 0, leaves = 0; let now = Date.parse('2026-10-31T08:01:00Z'); let listener = () => {};
  const api = { async createCall() { return { ...model }; }, async getCall() { return { ...model }; }, async getHistory() { return []; },
    async act(id, action) { actions.push([id, action]); model = { ...model, state: 'ENDED', version: model.version + 1 }; return { ...model }; },
    async credentials() { return { apiKey: 'offline', token: 'offline', expiresAt: new Date(now + 120000).toISOString(), media: 'voice', user: { id: 'self' }, call: { id: model.id, type: 'betweener_connect', cid: `betweener_connect:${model.id}` } }; } };
  const transport = { async join(_a, _r, next) { joins++; listener = next; next('joined'); }, async leave() { leaves++; }, async setMuted() {}, routes: () => ['earpiece', 'speaker', 'bluetooth'], async selectRoute() {} };
  const d = { api, transport, selfProfileId: 'self', userId: 'self', deviceId: 'offline-device', permission: async () => 'granted', uuid: () => 'offline-key', now: () => now, peer: async () => ({ profileId: 'peer', name: 'Peer', avatar: null }) };
  const controller = new VoiceController(d);
  const start = () => controller.start({ profileId: 'peer', name: 'Peer', avatar: null }, 'matched');
  return { d, api, transport, controller, actions, start, get model() { return { ...model }; }, set(patch) { model = { ...model, ...patch, version: model.version + 1 }; },
    async active() { await start(); model = { ...model, state: 'ACTIVE', version: model.version + 1, connected_at: '2026-10-31T08:00:30Z' }; await controller.refresh(); },
    emit(state) { listener(state); }, advance(ms) { now += ms; }, get joins() { return joins; }, get leaves() { return leaves; } };
}

test('an owned ringing call notices acceptance on the next one-second tick while ACTIVE retains two-second polling', async () => {
  const f = fixture(); await f.start(); let reads = 0;
  const getCall = f.api.getCall; f.api.getCall = async (...args) => { reads++; return getCall(...args); };
  await f.controller.tick(); assert.equal(reads, 1);
  f.set({ state: 'ACCEPTED' }); f.advance(1000); await f.controller.tick();
  assert.equal(reads, 2); assert.equal(f.joins, 1);
  f.set({ state: 'ACTIVE', connected_at: '2026-10-31T08:00:30Z' }); await f.controller.refresh();
  const activeReads = reads; f.advance(1000); await f.controller.tick(); assert.equal(reads, activeReads);
  f.advance(1000); await f.controller.tick(); assert.equal(reads, activeReads + 1);
  await f.controller.dispose();
});

test('a failing optional audio observer cannot block setup or local teardown', async () => {
  for (const phase of ['subscribe', 'unsubscribe']) {
    const f = fixture();
    f.transport.observeAudioSamples = () => { if (phase === 'subscribe') throw Error('observer'); return () => { throw Error('observer'); }; };
    await f.active(); assert.equal(f.controller.getSnapshot().phase, 'ACTIVE');
    await f.controller.hangup(); assert.equal(f.controller.getSnapshot().phase, 'ENDED'); assert.ok(f.leaves > 0);
    await f.controller.dispose();
  }
});
test('late permission after End cannot restore IDLE or publish permission', async () => {
  const f = fixture(), permission = deferred(); f.d.permission = () => permission.promise;
  const starting = f.start(); await settle(); await f.controller.hangup(); permission.resolve('granted'); await starting;
  assert.equal(f.controller.getSnapshot().phase, 'ENDED'); assert.equal(f.controller.getSnapshot().permission, null); assert.equal(f.joins, 0);
});
test('outgoing response for the wrong peer cannot join', async () => {
  const f = fixture(); f.api.createCall = async () => ({ ...f.model, recipient_profile_id: 'wrong-peer' }); await f.start();
  assert.equal(f.controller.getSnapshot().phase, 'FAILED'); assert.equal(f.joins, 0);
});
for (const [field, value] of [['id', 'wrong-call'], ['created_at', '2026-10-30T00:00:00Z'], ['recipient_profile_id', 'other']]) test(`incoming canonical ${field} mismatch never presents invitation`, async () => {
  const f = fixture(true), hint = f.model; f.api.getCall = async () => ({ ...hint, [field]: value });
  await f.controller.receive(hint); assert.equal(f.controller.getSnapshot().session, null); assert.equal(f.joins, 0);
});
test('wrong peer presentation is rejected after canonical admission read', async () => {
  const f = fixture(true); f.d.peer = async () => ({ profileId: 'other', name: 'Other', avatar: null }); await f.controller.receive(f.model);
  assert.equal(f.controller.getSnapshot().session, null);
});
test('same call ID with changed immutable generation cannot replace active state', async () => {
  const f = fixture(); await f.active(); f.set({ created_at: '2026-11-01T00:00:00Z', state: 'ENDED' }); await f.controller.refresh();
  assert.equal(f.controller.getSnapshot().phase, 'ACTIVE');
});
test('late unmute after End cannot change the retired view', async () => {
  const f = fixture(); await f.active(); await f.controller.toggleMute(); const pending = deferred(); f.transport.setMuted = () => pending.promise;
  const unmuting = f.controller.toggleMute(); await f.controller.hangup(); pending.resolve(); await unmuting;
  assert.equal(f.controller.getSnapshot().phase, 'ENDED'); assert.equal(f.controller.getSnapshot().muted, true);
});
test('late audio-route result and error cannot overwrite a retired view', async () => {
  for (const reject of [false, true]) {
    const f = fixture(); await f.active(); const pending = deferred(); f.transport.selectRoute = () => pending.promise;
    const selecting = f.controller.selectRoute('speaker'); await f.controller.hangup(); if (reject) pending.reject(Error('offline')); else pending.resolve(); await selecting;
    assert.equal(f.controller.getSnapshot().route, 'earpiece'); assert.equal(f.controller.getSnapshot().error, null);
  }
});
test('out-of-order route completions keep the latest selection', async () => {
  const f = fixture(); await f.active(); const first = deferred(); f.transport.selectRoute = route => route === 'speaker' ? first.promise : Promise.resolve();
  const old = f.controller.selectRoute('speaker'); await f.controller.selectRoute('bluetooth'); first.resolve(); await old;
  assert.equal(f.controller.getSnapshot().route, 'bluetooth');
});
test('End during initial route selection cannot publish late route/connected state', async () => {
  const f = fixture(); await f.start(); const pending = deferred(); f.transport.selectRoute = () => pending.promise;
  f.set({ state: 'ACTIVE' }); const connecting = f.controller.refresh(); await settle(); await f.controller.hangup(); pending.resolve(); await connecting;
  assert.equal(f.controller.getSnapshot().phase, 'ENDED'); assert.equal(f.controller.getSnapshot().muted, true);
});
test('manual output changes cannot supersede the initial route confirmation and fail call setup', async () => {
  const f = fixture(), gate = deferred(), selections = [];
  await f.start();
  f.transport.selectRoute = route => { selections.push(route); return gate.promise; };
  f.set({ state: 'ACTIVE', connected_at: '2026-10-31T08:00:30Z' });
  const connecting = f.controller.refresh(); await settle();
  assert.equal(f.controller.getSnapshot().audioSetupStage, 'audio_output');
  assert.equal(f.controller.getSnapshot().phase, 'CONNECTING');
  await f.controller.selectRoute('speaker'); assert.deepEqual(selections, ['earpiece']);
  gate.resolve(); await connecting;
  assert.equal(f.controller.getSnapshot().audioSetupStage, 'ready');
  f.transport.selectRoute = async route => { selections.push(route); };
  await f.controller.selectRoute('speaker'); assert.deepEqual(selections, ['earpiece', 'speaker']);
  assert.equal(f.controller.getSnapshot().route, 'speaker');
  await f.controller.dispose();
});

test('an empty cached output list cannot skip native confirmation and report ready', async () => {
  const f = fixture(); await f.start(); let selections = 0;
  f.transport.routes = () => [];
  f.transport.selectRoute = async () => { selections++; throw Error('connect_native_route_unavailable'); };
  f.set({ state: 'ACTIVE' }); await f.controller.refresh();
  assert.equal(selections, 1);
  assert.equal(f.controller.getSnapshot().phase, 'FAILED');
  assert.equal(f.controller.getSnapshot().audioSetupFailure.code, 'audio_output_unavailable');
  await f.controller.dispose();
});

for (const [cached, fresh, expected] of [[[], ['earpiece', 'speaker'], 'earpiece'], [['speaker'], ['speaker'], 'speaker']])
test(`fresh route confirmation retains ${expected} preference and updates cached availability`, async () => {
  const f = fixture(); await f.start(); let available = cached, selections = [];
  f.transport.routes = () => available;
  f.transport.selectRoute = async route => { selections.push(route); available = fresh; };
  f.set({ state: 'ACTIVE' }); await f.controller.refresh();
  assert.deepEqual(selections, [expected]);
  assert.equal(f.controller.getSnapshot().audioSetupStage, 'ready');
  assert.equal(f.controller.getSnapshot().route, expected);
  assert.deepEqual(f.controller.getSnapshot().routes, fresh);
  await f.controller.dispose();
});
test('controller samples local audio growth and clears it for a new call generation', async () => {
  const f = fixture(); let timestamp = 1, bytes = 0;
  f.transport.audioSample = () => ({ timestamp, sentBytes: bytes, receivedBytes: bytes, receivedPackets: bytes, lostPackets: 0, jitterMs: 2, roundTripMs: 10 });
  await f.active(); await f.controller.tick(); timestamp++; bytes = 20; f.advance(1000); await f.controller.tick();
  assert.equal(f.controller.getSnapshot().audioHealth.reception, 'receiving');
  assert.equal(f.controller.getSnapshot().quality.firstReceivedPacketMs, 1000);
  await f.controller.hangup(); await settle(); f.controller.reset();
  assert.equal(f.controller.getSnapshot().audioHealth, undefined);
  assert.equal(f.controller.getSnapshot().quality.firstReceivedPacketMs, null);
  await f.controller.dispose();
});

test('End stores the validated terminal response instead of retaining a stale ACTIVE snapshot', async () => {
  const f = fixture(); await f.active(); const version = f.model.version;
  await f.controller.hangup();
  assert.equal(f.controller.getSnapshot().endStatus, 'terminal');
  assert.equal(f.controller.getSnapshot().session.state, 'ENDED');
  assert.equal(f.controller.getSnapshot().session.version, version + 1);
  await f.controller.dispose();
});

test('End preserves an acknowledged ENDING snapshot until later terminal reconciliation', async () => {
  const f = fixture(); await f.active();
  f.api.act = async () => { f.set({ state: 'ENDING' }); return f.model; };
  await f.controller.hangup();
  assert.equal(f.controller.getSnapshot().endStatus, 'pending');
  assert.equal(f.controller.getSnapshot().session.state, 'ENDING');
  f.set({ state: 'ENDED' }); await f.controller.refreshEndStatus();
  assert.equal(f.controller.getSnapshot().session.state, 'ENDED');
  await f.controller.dispose();
});

test('retired audio observations never appear live after End or later background/foreground updates', async () => {
  const f = fixture(); let stamp = 1, packets = 0, reads = 0;
  f.transport.audioSample = () => { reads++; return { timestamp: stamp, sentBytes: packets, receivedBytes: packets, receivedPackets: packets,
    lostPackets: 0, jitterMs: 2, roundTripMs: 8 }; };
  await f.active(); await f.controller.tick(); stamp++; packets = 100; f.advance(1000); await f.controller.tick();
  assert.equal(f.controller.getSnapshot().audioHealth.reception, 'receiving');
  const first = f.controller.getSnapshot().quality.firstReceivedPacketMs;
  await f.controller.hangup(); const stoppedReads = reads;
  await f.controller.setForeground(false); f.advance(30_000); await f.controller.setForeground(true);
  const s = f.controller.getSnapshot();
  assert.equal(reads, stoppedReads); assert.equal(s.audioHealth.reception, 'unavailable');
  assert.equal(s.audioHealth.sending, null); assert.equal(s.audioHealth.jitterMs, null); assert.equal(s.audioHealth.roundTripMs, null);
  assert.equal(s.audioHealth.receivedPackets, 100); assert.equal(s.quality.firstReceivedPacketMs, first);
  assert.equal(s.audioHealth.audibleOutput, 'not_verified'); await f.controller.dispose();
});

test('hung local release does not keep a live audio claim or block authoritative End', async () => {
  const f = fixture(); await f.active(); const gate = deferred(); let stamp = 1;
  f.transport.audioSample = () => ({ timestamp: stamp, sentBytes: stamp * 100, receivedBytes: stamp * 100, receivedPackets: stamp,
    lostPackets: 0, jitterMs: 1, roundTripMs: 8 });
  await f.controller.tick(); stamp++; f.advance(1000); await f.controller.tick();
  assert.equal(f.controller.getSnapshot().audioHealth.reception, 'receiving');
  f.transport.leave = () => gate.promise; await f.controller.hangup();
  assert.equal(f.controller.getSnapshot().endStatus, 'terminal');
  assert.equal(f.controller.getSnapshot().localShutdown.resourceRelease, 'pending');
  assert.equal(f.controller.getSnapshot().audioHealth.reception, 'unavailable');
  gate.resolve(unverifiedShutdown()); await settle(); await f.controller.dispose();
});

test('a late End response after logout cannot repopulate the retired call', async () => {
  const f = fixture(); await f.active(); const gate = deferred(), response = { ...f.model, state: 'ENDED', version: f.model.version + 1 };
  f.api.act = () => gate.promise; const ending = f.controller.hangup(); await settle(); await f.controller.logout();
  gate.resolve(response); await ending; await settle();
  assert.equal(f.controller.getSnapshot().phase, 'IDLE'); assert.equal(f.controller.getSnapshot().session, null);
  await f.controller.dispose();
});

test('a delayed ENDING acknowledgement cannot downgrade a newer canonical terminal observation', async () => {
  const f = fixture(); await f.active(); const gate = deferred(), pending = { ...f.model, state: 'ENDING', version: f.model.version + 1 };
  f.api.act = () => gate.promise; const ending = f.controller.hangup(); await settle();
  f.set({ state: 'ENDING' }); f.set({ state: 'ENDED' }); await f.controller.refresh();
  gate.resolve(pending); await ending;
  assert.equal(f.controller.getSnapshot().session.state, 'ENDED'); assert.equal(f.controller.getSnapshot().endStatus, 'terminal');
  await f.controller.dispose();
});

test('unavailable backend end is distinct from local closure, then reconciles by same-call read', async () => {
  const f = fixture(); await f.active(); f.api.act = async () => { throw Error('offline'); }; f.api.getCall = async () => { throw Error('offline'); };
  await f.controller.hangup(); assert.equal(f.controller.getSnapshot().endStatus, 'unconfirmed'); assert.ok(f.leaves > 0);
  f.api.getCall = async () => ({ ...f.model, state: 'ENDED' }); await f.controller.refreshEndStatus();
  assert.equal(f.controller.getSnapshot().endStatus, 'terminal'); assert.equal(f.controller.getSnapshot().localShutdown.microphone, 'unverified');
});
test('a terminal reply belonging to another call cannot certify authoritative end', async () => {
  const f = fixture(); await f.active(); f.api.act = async () => ({ ...f.model, id: 'wrong', state: 'ENDED' });
  f.api.getCall = async () => ({ ...f.model, id: 'wrong', state: 'ENDED' }); await f.controller.hangup(); assert.equal(f.controller.getSnapshot().endStatus, 'unconfirmed');
});
test('an ACTIVE response to End is unconfirmed rather than an accepted terminal transition', async () => {
  const f = fixture(); await f.active(); f.api.act = async () => ({ ...f.model, state: 'ACTIVE' });
  await f.controller.hangup(); assert.equal(f.controller.getSnapshot().endStatus, 'unconfirmed');
});
test('late end-status read cannot populate a reset generation', async () => {
  const f = fixture(); await f.active(); f.api.act = async () => { throw Error('offline'); }; f.api.getCall = async () => { throw Error('offline'); }; await f.controller.hangup();
  const pending = deferred(); f.api.getCall = () => pending.promise; const reading = f.controller.refreshEndStatus(); f.controller.reset(); pending.resolve({ ...f.model, state: 'ENDED' }); await reading;
  assert.equal(f.controller.getSnapshot().phase, 'IDLE'); assert.equal(f.controller.getSnapshot().endStatus, undefined);
});
test('an ended reconnect attempt cannot generate repeated End commands', async () => {
  const f = fixture(); await f.active(); f.emit('reconnecting'); await f.controller.hangup(); const count = f.actions.length; f.advance(60000); await f.controller.tick();
  assert.equal(f.actions.length, count); assert.equal(f.controller.getSnapshot().phase, 'ENDED');
});
test('acknowledged block and end never certify local or remote media cessation', () => {
  const f = fixture(); const state = { ...f.controller.getSnapshot(), phase: 'ENDED', localShutdown: pendingShutdown(), endBlock: { block: 'saved', call: 'terminal', provider: 'acknowledged', media: 'unverified', error: null } };
  const lines = voiceSafetyStatus(state); assert.ok(lines.includes('Stopping local media…')); assert.ok(lines.includes('Account block saved.'));
  assert.ok(lines.includes('Provider end request acknowledged.')); assert.ok(lines.includes('Remote media shutdown has not been verified.')); assert.ok(!lines.includes('Local media shutdown verified.'));
});
test('local verification alone never implies saved block or remote enforcement', () => {
  const f = fixture(); const local = { ...unverifiedShutdown(), microphone: 'verified', camera: 'verified', publication: 'verified', playback: 'verified', subscriptions: 'verified', sdkLeave: 'completed', resourceRelease: 'completed' };
  const lines = voiceSafetyStatus({ ...f.controller.getSnapshot(), phase: 'ENDED', localShutdown: local, endStatus: 'unconfirmed' });
  assert.ok(lines.includes('Local media shutdown verified.')); assert.ok(lines.includes('Betweener call termination unconfirmed.')); assert.ok(lines.includes('Remote media shutdown has not been verified.')); assert.ok(!lines.includes('Account block saved.'));
});
