import assert from 'node:assert/strict';
import test from 'node:test';
import { VoiceController } from '../features/connect/voice/voice-controller.ts';
import { StreamVoiceTransport, type VoiceBindings } from '../features/connect/media/stream-voice-transport.ts';
import { createNativeAudioRouteSelector } from '../features/connect/media/native-audio-route.ts';
import { resolveMicrophonePermission } from '../features/connect/media/microphone-permission.ts';
import { unverifiedShutdown } from '../features/connect/media/local-shutdown.ts';
import { createVoicePreview } from '../features/connect/voice/voice-preview.ts';
import type { ConnectSession } from '../features/connect/domain/connect.ts';
import type { VoiceApi, VoiceCredentials, VoiceTransport, VoiceTransportState, MicrophonePermission } from '../features/connect/voice/voice-types.ts';
const self = 'ab220000-0000-4000-8000-000000000001';
const peer = 'ab220000-0000-4000-8000-000000000002';
const call = 'ab220000-0000-4000-8000-000000000003';
const device = 'ab220000-0000-4000-8000-000000000004';
const credentials = (): VoiceCredentials => ({ apiKey: 'test-key', token: 'test-user-token', media: 'voice',
  expiresAt: new Date(Date.now() + 120000).toISOString(), user: { id: self }, call: { id: call, cid: `betweener_connect:${call}`, type: 'betweener_connect' } });
const deferred = <T,>() => { let resolve!: (value: T) => void; const promise = new Promise<T>((r) => { resolve = r; }); return { promise, resolve }; };
const settle = () => new Promise<void>((resolve) => setImmediate(resolve));
function fixture(incoming = false) {
  let now = Date.now(); let permission: MicrophonePermission = 'granted'; let capturing = false;
  let listener: (state: VoiceTransportState) => void = () => {};
  let model: ConnectSession = { id: call, caller_profile_id: incoming ? peer : self, recipient_profile_id: incoming ? self : peer,
    media: 'voice', authorization: 'matched', state: 'RINGING', version: 1, created_at: new Date(now).toISOString(),
    accepted_at: null, connected_at: null, ended_at: null, deadline: new Date(now + 45000).toISOString(), reason: null, duration_seconds: null };
  const actions: string[] = []; const starts: unknown[][] = []; let joins = 0; let leaves = 0; let keys = 0;
  const api: VoiceApi = {
    async createCall(...args) { starts.push(args); return { ...model }; },
    async act(_, action, version) {
      actions.push(action);
      if (version !== model.version) throw new Error('connect_conflict');
      model = { ...model, state: action === 'accept' ? 'ACCEPTED' : action === 'decline' ? 'DECLINED' : action === 'cancel' ? 'CANCELLED' : 'ENDED',
        version: model.version + 1, accepted_at: action === 'accept' ? new Date(now).toISOString() : model.accepted_at,
        ended_at: action === 'accept' ? null : new Date(now).toISOString() };
      return { ...model };
    },
    async getCall() { return { ...model }; }, async getHistory() { return [{ ...model }]; }, async credentials() { return credentials(); },
  };
  const transport: VoiceTransport = {
    async join(_, __, next) { joins++; listener = next; next('joined'); },
    async setMuted(muted) { capturing = !muted; }, routes: () => ['earpiece', 'speaker', 'bluetooth'],
    async selectRoute() {}, async leave() { leaves++; capturing = false; },
  };
  const controller = new VoiceController({ api, transport, selfProfileId: self, userId: self, deviceId: device,
    permission: async () => permission, uuid: () => `idempotency-${++keys}`, now: () => now,
    peer: async () => ({ profileId: peer, name: 'Alex', avatar: null }) });
  const set = (patch: Partial<ConnectSession>) => { model = { ...model, ...patch, version: model.version + 1 }; };
  const start = () => controller.start({ profileId: peer, name: 'Alex', avatar: null }, 'matched');
  const connected = async () => { await start(); set({ state: 'ACCEPTED', accepted_at: new Date(now).toISOString() }); await controller.refresh();
    set({ state: 'ACTIVE', deadline: null, connected_at: new Date(now).toISOString() }); await controller.refresh(); };
  return { controller, api, transport, actions, starts, start, connected, set, get model() { return { ...model }; },
    setPermission: (p: MicrophonePermission) => { permission = p; }, advance: (ms: number) => { now += ms; },
    emit: (s: VoiceTransportState) => listener(s), get joins() { return joins; }, get leaves() { return leaves; }, get capturing() { return capturing; } };
}
for (const reset of ['reset', 'dismiss', 'logout'] as const) test(`${reset} clears the previous call recovery clock before the next invitation`, async () => {
  const f = fixture();
  // SDK completion is a fixture observation, not a hardware shutdown assertion.
  f.transport.leave = async () => ({ ...unverifiedShutdown(), sdkLeave: 'completed', resourceRelease: 'completed' });
  await f.connected(); f.emit('reconnecting');
  assert.equal(f.controller.getSnapshot().phase, 'RECONNECTING');
  if (reset === 'logout') await f.controller.logout();
  else {
    await f.controller.hangup(); await settle();
    if (reset === 'dismiss') assert.equal(f.controller.dismissCompletedCall(), true);
    else f.controller.reset();
  }
  f.set({ id: 'ab220000-0000-4000-8000-000000000099', state: 'RINGING', accepted_at: null,
    connected_at: null, ended_at: null, deadline: new Date(Date.now() + 120000).toISOString() });
  await f.start(); const actions = f.actions.length;
  f.advance(31000); await f.controller.tick();
  assert.equal(f.controller.getSnapshot().phase, 'RINGING');
  assert.equal(f.controller.getSnapshot().error, null);
  assert.equal(f.actions.length, actions);
  await f.controller.dispose();
});

test('voice start preserves server authorization and never sends actor identity', async () => {
  const f = fixture(); await f.controller.start({ profileId: peer, name: 'Alex', avatar: null }, 'matched', null);
  assert.deepEqual(f.starts[0], [peer, 'voice', 'matched', 'idempotency-1', device, null]);
  assert.equal(f.controller.getSnapshot().phase, 'RINGING'); assert.equal(f.joins, 0); assert.equal(f.capturing, false);
});
for (const permission of ['denied', 'blocked'] as const) test(`${permission} microphone prevents outgoing creation`, async () => {
  const f = fixture(); f.setPermission(permission); await f.start();
  assert.equal(f.starts.length, 0); assert.equal(f.controller.getSnapshot().permission, permission); assert.ok(f.controller.getSnapshot().error);
});
test('repeated Call taps share one in-flight command', async () => {
  const f = fixture(); const pending = deferred<ConnectSession>(); let count = 0;
  f.api.createCall = async () => { count++; return pending.promise; };
  const a = f.start(); const b = f.start(); await settle(); assert.equal(count, 1);
  pending.resolve(f.model); await Promise.all([a, b]); assert.equal(f.controller.getSnapshot().session?.id, call);
});
test('ambiguous start failure retries with the original idempotency key', async () => {
  const f = fixture(); const first = f.api.createCall;
  f.api.createCall = async (...args) => { await first(...args); throw new Error('network'); };
  await f.start(); f.api.createCall = first; await f.start();
  assert.equal(f.starts.length, 2); assert.equal(f.starts[0][3], f.starts[1][3]);
});
test('cancellation during server creation terminates the late session without joining', async () => {
  const f = fixture(); const pending = deferred<ConnectSession>(); f.api.createCall = () => pending.promise;
  const starting = f.start(); await settle(); await f.controller.hangup(); pending.resolve(f.model); await starting;
  assert.deepEqual(f.actions, ['cancel']); assert.equal(f.joins, 0); assert.equal(f.controller.getSnapshot().phase, 'ENDED');
});
test('incoming hints require current authorized server state', async () => {
  const f = fixture(true); f.set({ state: 'CANCELLED', ended_at: new Date().toISOString() });
  await f.controller.receive({ ...f.model, state: 'RINGING' }); assert.equal(f.controller.getSnapshot().session, null);
  await f.controller.receive({ ...f.model, state: 'RINGING', recipient_profile_id: 'someone-else' }); assert.equal(f.joins, 0);
});
test('foreground polling presents only an incoming voice invitation', async () => {
  const f = fixture(true); await f.controller.tick(); assert.equal(f.controller.getSnapshot().incoming, true);
  assert.equal(f.controller.getSnapshot().phase, 'RINGING'); assert.equal(f.capturing, false);
});
test('acceptance obtains permission and connects once without certifying ACTIVE', async () => {
  const f = fixture(true); await f.controller.receive(f.model); await Promise.all([f.controller.accept(), f.controller.accept()]);
  assert.deepEqual(f.actions, ['accept']); assert.equal(f.joins, 1); assert.equal(f.controller.getSnapshot().phase, 'CONNECTING');
  assert.equal(f.controller.getSnapshot().durationSeconds, null);
});
test('denied incoming microphone does not accept or join', async () => {
  const f = fixture(true); await f.controller.receive(f.model); f.setPermission('blocked'); await f.controller.accept();
  assert.equal(f.actions.length, 0); assert.equal(f.joins, 0); assert.equal(f.controller.getSnapshot().phase, 'RINGING');
});
test('another-device acceptance dismisses local ringing without ending the winner', async () => {
  const f = fixture(true); await f.controller.receive(f.model);
  f.api.act = async () => { throw new Error('connect_device_conflict'); }; await f.controller.accept(); await f.controller.tick();
  assert.equal(f.controller.getSnapshot().phase, 'ENDED'); assert.equal(f.capturing, false); assert.equal(f.joins, 0);
});
test('polling another-device acceptance never prompts capture or ends its call', async () => {
  const f = fixture(true); await f.controller.receive(f.model); f.set({ state: 'ACCEPTED' }); await f.controller.refresh();
  assert.equal(f.controller.getSnapshot().phase, 'ENDED'); assert.equal(f.joins, 0); assert.equal(f.capturing, false);
  assert.deepEqual(f.actions, []); assert.equal(f.controller.getSnapshot().permission, null);
});
test('polling during our own pending acceptance waits for the winning device response', async () => {
  const f = fixture(true); await f.controller.receive(f.model); const pending = deferred<ConnectSession>();
  f.api.act = () => pending.promise; const accepting = f.controller.accept(); await settle();
  f.set({ state: 'ACCEPTED' }); await f.controller.refresh(); assert.equal(f.joins, 0);
  pending.resolve(f.model); await accepting; assert.equal(f.joins, 1); assert.equal(f.controller.getSnapshot().phase, 'CONNECTING');
});
test('device conflict at media admission dismisses locally without ending the winner', async () => {
  const f = fixture(true); await f.controller.receive(f.model); f.api.credentials = async () => { throw new Error('connect_device_conflict'); };
  await f.controller.accept(); assert.deepEqual(f.actions, ['accept']);
  assert.equal(f.controller.getSnapshot().phase, 'ENDED'); assert.equal(f.capturing, false);
});
test('late acceptance failure after hang-up cannot revive local ringing or connection UI', async () => {
  const f = fixture(true); await f.controller.receive(f.model); let reject!: (error: Error) => void;
  const pending = new Promise<ConnectSession>((_, fail) => { reject = fail; }); const original = f.api.act;
  f.api.act = (...args) => args[1] === 'accept' ? pending : original(...args);
  const accepting = f.controller.accept(); await settle(); await f.controller.hangup();
  reject(new Error('network')); await accepting; await f.controller.tick();
  assert.equal(f.controller.getSnapshot().phase, 'ENDED'); assert.equal(f.joins, 0); assert.equal(f.capturing, false);
});
test('server connection evidence and joined local transport start connected duration', async () => {
  const f = fixture(); await f.connected(); f.advance(9000); await f.controller.tick();
  assert.equal(f.controller.getSnapshot().phase, 'ACTIVE'); assert.equal(f.controller.getSnapshot().durationSeconds, 9); assert.equal(f.capturing, true);
});
test('mute and output selection respect actual available routes', async () => {
  const f = fixture(); await f.connected(); await f.controller.toggleMute(); assert.equal(f.capturing, false);
  await f.controller.toggleMute(); assert.equal(f.capturing, true);
  await f.controller.selectRoute('bluetooth'); assert.equal(f.controller.getSnapshot().route, 'bluetooth');
  await f.controller.selectRoute('wired'); assert.equal(f.controller.getSnapshot().route, 'bluetooth');
});
test('remote termination stops capture and late activity cannot revive the UI', async () => {
  const f = fixture(); await f.connected(); f.set({ state: 'ENDED', ended_at: new Date().toISOString() }); await f.controller.refresh();
  f.set({ state: 'ACTIVE' }); f.emit('joined'); f.advance(2000); await f.controller.tick();
  assert.equal(f.controller.getSnapshot().phase, 'ENDED'); assert.equal(f.capturing, false);
});
test('SDK reconnect uses the same call and recovery returns ACTIVE', async () => {
  const f = fixture(); await f.connected(); f.emit('reconnecting'); assert.equal(f.controller.getSnapshot().phase, 'RECONNECTING');
  f.advance(5000); f.emit('joined'); await f.controller.tick(); assert.equal(f.controller.getSnapshot().phase, 'ACTIVE'); assert.equal(f.joins, 1);
});
test('recovery timeout terminates capture and server session', async () => {
  const f = fixture(); await f.connected(); f.emit('reconnecting'); f.advance(31000); await f.controller.tick();
  assert.equal(f.controller.getSnapshot().phase, 'FAILED'); assert.equal(f.capturing, false); assert.ok(f.actions.includes('end'));
});
test('hang-up during connection uses end rather than invalid caller cancellation', async () => {
  const f = fixture(); await f.start(); f.set({ state: 'ACCEPTED' }); await f.controller.refresh(); await f.controller.hangup();
  assert.equal(f.actions.at(-1), 'end'); assert.equal(f.capturing, false);
});
test('cancel versus accept conflict reloads the winning state and ends it safely', async () => {
  const f = fixture(); await f.start(); f.set({ state: 'ACCEPTED' }); await f.controller.hangup();
  assert.deepEqual(f.actions, ['cancel', 'end']); assert.equal(f.model.state, 'ENDED');
});
test('permission/connection failure leaves no active capture', async () => {
  const f = fixture(); await f.start(); f.set({ state: 'ACCEPTED' }); f.transport.join = async () => { throw new Error('private-provider-payload'); };
  await f.controller.refresh(); assert.equal(f.controller.getSnapshot().phase, 'FAILED');
  assert.equal(f.capturing, false); assert.doesNotMatch(f.controller.getSnapshot().error ?? '', /private-provider/);
});
test('background transition mutes without silently restarting on foreground', async () => {
  const f = fixture(); await f.connected(); await f.controller.setForeground(false); assert.equal(f.capturing, false);
  await f.controller.setForeground(true); assert.equal(f.capturing, false); assert.equal(f.controller.getSnapshot().muted, true);
});
test('logout while ringing cancels and clears presentation state', async () => {
  const f = fixture(); await f.start(); await f.controller.logout();
  assert.equal(f.controller.getSnapshot().phase, 'IDLE'); assert.deepEqual(f.actions, ['cancel']); assert.equal(f.capturing, false);
});
test('ringing timeout dismisses abandoned UI even when polling fails', async () => {
  const f = fixture(); await f.start(); f.api.getCall = async () => { throw new Error('offline'); };
  f.advance(46000); await f.controller.tick(); assert.equal(f.controller.getSnapshot().phase, 'ENDED');
  assert.equal(f.capturing, false); assert.equal(f.controller.getSnapshot().error, 'There was no answer.');
});
test('accepted audio setup has a bounded local failure deadline', async () => {
  const f = fixture(); await f.start(); f.set({ state: 'ACCEPTED', deadline: new Date(Date.now() + 60000).toISOString() }); await f.controller.refresh();
  f.advance(61000); await f.controller.tick(); assert.equal(f.controller.getSnapshot().phase, 'FAILED'); assert.equal(f.capturing, false);
});
test('server block termination while ACTIVE immediately stops local capture on reconciliation', async () => {
  const f = fixture(); await f.connected(); f.set({ state: 'ENDED', ended_at: new Date().toISOString(), reason: 'blocked' });
  await f.controller.refresh(); assert.equal(f.controller.getSnapshot().phase, 'ENDED'); assert.equal(f.capturing, false);
});
test('logout fences a late refresh response', async () => {
  const f = fixture(); await f.connected(); const pending = deferred<ConnectSession>(); f.api.getCall = () => pending.promise;
  const refresh = f.controller.refresh(); const logout = f.controller.logout(); await settle(); pending.resolve(f.model); await Promise.all([refresh, logout]);
  assert.equal(f.controller.getSnapshot().phase, 'IDLE'); assert.equal(f.capturing, false);
});
test('microphone permission resolution handles current grants, denial and permanent denial', async () => {
  let requests = 0;
  assert.equal(await resolveMicrophonePermission({ get: async () => ({ granted: true, canAskAgain: true }), request: async () => { requests++; return { granted: false, canAskAgain: false }; } }), 'granted');
  assert.equal(requests, 0);
  assert.equal(await resolveMicrophonePermission({ get: async () => ({ granted: false, canAskAgain: false }), request: async () => { throw new Error('must not prompt'); } }), 'blocked');
  assert.equal(await resolveMicrophonePermission({ get: async () => ({ granted: false, canAskAgain: true }), request: async () => ({ granted: false, canAskAgain: true }) }), 'denied');
  assert.equal(await resolveMicrophonePermission({ get: async () => ({ granted: false, canAskAgain: true }), request: async () => ({ granted: true, canAskAgain: true }) }), 'granted');
});
function transportFixture() {
  const operations: string[] = []; let capture = false; let stateListener = (_: string) => {};
  const bindings: VoiceBindings = {
    call: { camera: { async disable() { operations.push('camera.disable'); } }, microphone: {
      async disable() { capture = false; operations.push('mic.disable'); }, async enable() { capture = true; operations.push('mic.enable'); },
    }, state: { callingState$: { subscribe(listener) { stateListener = listener; return { unsubscribe() { operations.push('unsubscribe'); } }; } } },
    async join(options) { assert.deepEqual(options, { create: false }); operations.push('join'); stateListener('joined'); }, async leave() { operations.push('leave'); } },
    async release() { operations.push('release'); }, routes: () => ['earpiece', 'speaker'], async selectRoute(route) { operations.push(route); },
  };
  let refreshToken: (() => Promise<string>) | null = null;
  const transport = new StreamVoiceTransport(async (_, refresh) => { refreshToken = refresh; return bindings; });
  return { bindings, transport, operations, get capture() { return capture; }, refresh: () => refreshToken!() };
}

test('transport uses fresh native route confirmation when its advertised routes lag', async () => {
  const f = transportFixture(); let reads = 0;
  const selector = createNativeAudioRouteSelector({ isCurrent: () => true, audio: {
    async devices() { reads++; return { devices: [{ id: 'ear', type: 'Earpiece' }], selectedDeviceId: 'ear' }; },
    select() { throw new Error('already selected; no switch required'); },
  } });
  f.bindings.routes = () => [];
  f.bindings.selectRoute = async route => { await selector.select(route); };
  await f.transport.join(credentials(), async () => credentials(), () => {});
  await f.transport.selectRoute('earpiece');
  assert.equal(reads, 1);
  await f.transport.leave();
});

test('transport output selection without a current binding has a specific diagnostic', async () => {
  const f = transportFixture();
  await assert.rejects(f.transport.selectRoute('earpiece'), /connect_native_route_no_owner/);
  assert.deepEqual(f.operations, []);
});

test('transport cannot confirm an output after its call generation has retired', async () => {
  const f = transportFixture(); const gate = deferred();
  f.bindings.selectRoute = async () => { await gate.promise; };
  await f.transport.join(credentials(), async () => credentials(), () => {});
  const selecting = assert.rejects(f.transport.selectRoute('speaker'), /connect_native_owner_retired/);
  await f.transport.leave(); gate.resolve(undefined); await selecting;
});
test('voice transport disables camera/capture, joins only an existing call, and releases its lease', async () => {
  const f = transportFixture(); await f.transport.join(credentials(), async () => credentials(), () => {});
  assert.deepEqual(f.operations.slice(0, 3), ['camera.disable', 'mic.disable', 'join']);
  await f.transport.setMuted(false); assert.equal(f.capture, true); await f.transport.leave(); await f.transport.leave();
  assert.equal(f.capture, false); assert.equal(f.operations.filter((s) => s === 'release').length, 1);
});
test('credential refresh rejects user, key and call drift', async () => {
  for (const patch of [{ user: { id: peer } }, { apiKey: 'different-key' }, { call: { ...credentials().call, id: peer, cid: `betweener_connect:${peer}` } }]) {
    const f = transportFixture(); await f.transport.join(credentials(), async () => ({ ...credentials(), ...patch }), () => {});
    await assert.rejects(f.refresh(), /connect_unavailable/); await f.transport.leave();
  }
});
test('leaving during a delayed SDK join stops late capture and releases the lease once', async () => {
  const f = transportFixture(); const pending = deferred<void>();
  f.bindings.call.join = async () => { await pending.promise; await f.bindings.call.microphone.enable(); };
  const joining = f.transport.join(credentials(), async () => credentials(), () => {}); await settle();
  await f.transport.leave(); pending.resolve(); await joining;
  assert.equal(f.capture, false); assert.equal(f.operations.filter((s) => s === 'release').length, 1);
});
test('media identity and expired tokens fail before any native binding is acquired', async () => {
  let acquired = 0; const transport = new StreamVoiceTransport(async () => { acquired++; throw new Error('must not acquire'); });
  await assert.rejects(transport.join({ ...credentials(), media: 'video' as 'voice' }, async () => credentials(), () => {}));
  await assert.rejects(transport.join({ ...credentials(), expiresAt: '2000-01-01T00:00:00Z' }, async () => credentials(), () => {}));
  assert.equal(acquired, 0);
});
test('terminated call IDs cannot be reused by a native transport', async () => {
  const f = transportFixture(); await f.transport.join(credentials(), async () => credentials(), () => {}); await f.transport.leave();
  await assert.rejects(f.transport.join(credentials(), async () => credentials(), () => {}), /connect_unavailable/);
  assert.equal(f.operations.filter((s) => s === 'join').length, 1);
});
test('preview allocates a fresh canonical ID for each new invitation', async () => {
  const f = createVoicePreview(); await f.start(); const first = f.controller.getSnapshot().session!.id;
  await f.controller.hangup(); f.controller.reset(); await f.start();
  assert.notEqual(f.controller.getSnapshot().session!.id, first); await f.controller.dispose();
});
