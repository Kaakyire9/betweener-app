const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { fixture, id, jwt, deferred, settle } = require('./fixtures/connect-product-fixture.cjs');
const { createNativeSessionOwner } = require('../lib/auth/native-session-owner.ts');
const { connectRuntimeAvailability, connectProductPolicy, connectRuntimeFeatureFlags } = require('../features/connect/config/connect-runtime-policy.ts');
const { readConnectLaunch, connectNotificationTarget, connectNotificationTypes } = require('../features/connect/domain/call-navigation.ts');
const { videoPreparationStatus } = require('../features/connect/domain/video-preparation.ts');
const { readCanonicalVoiceSession, invokePinnedConnectRpc } = require('../features/connect/data/authenticated-connect-services.ts');
const { ConnectProductCoordinator } = require('../features/connect/application/product-coordinator.ts');
const { retainNativeCaptureTracks } = require('../features/connect/media/native-capture-tracks.ts');
const { createInstallationIdLookup } = require('../lib/notifications/installation-id.ts');
let network = 0; globalThis.fetch = () => { network++; throw Error('offline-only'); };
const identity = { development: true, platform: 'android', variant: 'staging', environment: 'staging', bundleIdentifier: 'com.aduboffour.betweener.staging', supabaseUrl: 'https://xsgzxadwuxuziubglvps.supabase.co' };
const policy = { ui: true, nativeRuntime: true, videoTransport: true }, flags = { nativeSafetyOwner: true, endCallAndBlock: true };

test('voice is enabled only for the verified staging development identity; video stays off', () => {
  assert.deepEqual(connectProductPolicy, { ui: true, nativeRuntime: true, videoTransport: false });
  assert.deepEqual(connectRuntimeAvailability(identity), { ui: true, runtime: true, video: false });
  assert.deepEqual(connectRuntimeFeatureFlags(identity), { nativeSafetyOwner: true, endCallAndBlock: false });
  assert.deepEqual(connectRuntimeFeatureFlags({ ...identity, variant: 'production' }), { nativeSafetyOwner: false, endCallAndBlock: false });
  assert.equal(connectRuntimeAvailability(identity, policy, flags).runtime, true);
  assert.equal(connectRuntimeAvailability(identity, policy, flags).video, false);
});
test('push and Connect bootstrap share the same in-flight installation lookup', async () => {
  const gate = deferred(); let count = 0;
  const get = createInstallationIdLookup(async () => { count++; return gate.promise; });
  const a = get('staging'), b = get('staging'); assert.equal(a, b); await settle(); assert.equal(count, 1);
  gate.resolve(id(4)); assert.deepEqual(await Promise.all([a, b]), [id(4), id(4)]);
});
test('installation identity is isolated between application variants', async () => {
  const get = createInstallationIdLookup(async application => application === 'staging' ? id(4) : id(8));
  assert.deepEqual(await Promise.all([get('staging'), get('production')]), [id(4), id(8)]);
});
test('failed installation storage leaves no fabricated device identity and permits an explicit retry', async () => {
  let count = 0; const get = createInstallationIdLookup(async () => { if (++count === 1) throw Error('storage'); return id(4); });
  await assert.rejects(get('staging'), /storage/); assert.equal(await get('staging'), id(4));
});
for (const [key, value] of Object.entries({ development: false, platform: 'web', variant: 'production', environment: 'production', bundleIdentifier: 'com.aduboffour.betweener', supabaseUrl: 'https://jbyblhithbqwojhwlenv.supabase.co' })) {
  test(`runtime rejects mismatched ${key} despite explicitly enabled test switches`, () => assert.equal(connectRuntimeAvailability({ ...identity, [key]: value }, policy, flags).runtime, false));
}
test('token refresh keeps the same epoch while same-account new session replaces it', () => {
  const a = createNativeSessionOwner(); a.accept({ user: { id: id(1) }, access_token: jwt() }); const original = a.owner.snapshot();
  a.accept({ user: { id: id(1) }, access_token: jwt(id(1), id(5), Date.now() + 7200000) }); assert.equal(a.owner.snapshot(), original);
  a.accept({ user: { id: id(1) }, access_token: jwt(id(1), id(8)) }); assert.notEqual(a.owner.snapshot().generation, original.generation);
  assert.throws(() => a.owner.accessToken(original), /unauthenticated/);
});
test('logout synchronously retires identity and replayed pre-logout tokens cannot reactivate it', () => {
  const a = createNativeSessionOwner(); a.accept({ user: { id: id(1) }, access_token: jwt() }); let retired = false;
  a.owner.subscribe(() => { retired = a.owner.snapshot() === null; }); a.invalidate(); assert.equal(retired, true);
  a.accept({ user: { id: id(1) }, access_token: jwt() }); assert.equal(a.owner.snapshot(), null);
});
test('account switch retires both old-account and later replayed old-session operations', () => {
  const a = createNativeSessionOwner(); a.accept({ user: { id: id(1) }, access_token: jwt() }); const old = a.owner.snapshot();
  a.accept({ user: { id: id(7) }, access_token: jwt(id(7), id(8)) }); assert.throws(() => a.owner.accessToken(old), /unauthenticated/);
  a.accept({ user: { id: id(1) }, access_token: jwt() }); assert.equal(a.owner.snapshot(), null);
});
for (const token of ['invalid', jwt(id(7)), jwt(id(1), id(5), Date.now() - 1000)]) test('malformed, mismatched or expired Auth token never yields native identity', () => {
  const a = createNativeSessionOwner(); a.accept({ user: { id: id(1) }, access_token: token }); assert.equal(a.owner.snapshot(), null);
});
test('queued RPC carries captured bearer and cannot return into a new account', async () => {
  const f = fixture(), gate = deferred(), before = f.nativeAuth.owner.accessToken(f.nativeAuth.owner.snapshot()); let sent;
  f.ports.rpc = (_name, _args, token) => { sent = token; return gate.promise; };
  const request = f.services.api.getCall(f.model.id); f.nativeAuth.accept({ user: { id: id(7) }, access_token: jwt(id(7), id(8)) });
  gate.resolve({ data: f.model, error: null }); await assert.rejects(request, /unauthenticated/); assert.equal(sent, before);
  await assert.rejects(f.services.api.getCall(f.model.id), /unauthenticated/); await f.product.dispose();
});
test('real pinned Supabase builder works behind a Promise-wrapped facade and retains the captured bearer', async () => {
  const { createClient } = require('@supabase/supabase-js'); let request, calls = 0;
  const client = createClient('https://offline.invalid', 'synthetic-public', { accessToken: async () => 'other-current-account-token',
    global: { fetch: async (input, init) => {
      calls++; request = { url: String(input), headers: new Headers(init.headers), body: JSON.parse(init.body) };
      return new Response(JSON.stringify(true), { status: 200, headers: { 'Content-Type': 'application/json' } });
    } } });
  const upstream = client.rpc.bind(client); client.rpc = async (...args) => await upstream(...args);
  const result = await invokePinnedConnectRpc(client, 'rpc_connect_check_eligibility', { p_peer: id(3), p_media: 'voice', p_authorization: 'matched', p_grant: null }, 'captured-owner-token');
  assert.equal(result.data, true); assert.equal(calls, 1); assert.equal(request.headers.get('Authorization'), 'Bearer captured-owner-token');
  assert.ok(request.url.endsWith('/rest/v1/rpc/rpc_connect_check_eligibility')); assert.equal(request.body.p_peer, id(3));
});
test('pinned RPC pre-fetch hangs time out for the UI, abort, and do not manufacture a commit result', async () => {
  let signal; const gate = deferred();
  const client = { schema: () => ({ rpc: () => ({ setHeader: () => ({ abortSignal(value) { signal = value; return gate.promise; } }) }) }) };
  await assert.rejects(invokePinnedConnectRpc(client, 'rpc_connect_create_call', {}, 'offline', 5), /unavailable/);
  assert.equal(signal.aborted, true); gate.resolve({ data: true, error: null }); await settle();
});
test('read-only eligibility cannot authorize a subsequent call after a revoke', async () => {
  const f = fixture(); assert.equal(await f.services.checkEligibility(id(3), 'voice', 'matched'), true); f.eligible(false);
  await f.start(); assert.equal(f.composition.controller.getSnapshot().phase, 'FAILED'); assert.equal(f.counts().credentialCount, 0); await f.product.dispose();
});
test('outgoing ringing never loads native media or credentials before recipient acceptance', async () => {
  const f = fixture(); await f.start(); assert.equal(f.counts().createCount, 1); assert.equal(f.counts().credentialCount, 0);
  assert.ok(!f.events.includes('client-created')); assert.ok(!f.events.includes('capture')); await f.composition.controller.hangup(); await f.product.dispose();
});
test('revocation while credentials are in flight cannot construct a late native client', async () => {
  const f = fixture(), gate = deferred(); await f.start(); f.model.state = 'ACTIVE';
  const saved = await f.ports.credentials(f.model.id, id(4), 'offline'); f.ports.credentials = () => gate.promise;
  const connecting = f.composition.controller.refresh(); await settle(); await f.composition.controller.endCallAndBlock();
  gate.resolve(saved); await connecting;
  assert.ok(!f.events.includes('client-created')); assert.equal(f.composition.controller.getSnapshot().endBlock.block, 'saved'); await f.product.dispose();
});
test('failed authority polling stops cooperative media while backend end remains unconfirmed', async () => {
  const f = fixture(); await f.active(); f.ports.rpc = async () => { throw Error('control-plane-offline'); };
  await f.composition.controller.refresh(); await settle(); await settle();
  assert.equal(f.composition.owner().getSnapshot().retired, true); assert.equal(f.tracks[0].readyState, 'ended');
  assert.equal(f.composition.controller.getSnapshot().endStatus, 'unconfirmed'); await f.composition.owner().release(); await f.product.dispose();
});
test('active logout retires media synchronously and never retargets end to another account', async () => {
  const f = fixture(); await f.active(); const count = f.events.filter(x => x.rpc === 'rpc_connect_act').length;
  f.nativeAuth.invalidate(); assert.equal(f.composition.owner().getSnapshot().retired, true);
  f.nativeAuth.accept({ user: { id: id(7) }, access_token: jwt(id(7), id(8)) }); await settle();
  assert.equal(f.events.filter(x => x.rpc === 'rpc_connect_act').length, count); await f.composition.owner().release(); await f.product.dispose();
});
test('held credentials with wrong user or video authority are rejected before native ownership', async () => {
  for (const patch of [{ media: 'video' }, { user: { id: id(7) } }]) {
    const f = fixture(); await f.start(); f.model.state = 'ACTIVE'; const original = f.ports.credentials;
    f.ports.credentials = async (...args) => ({ ...await original(...args), ...patch });
    await f.composition.controller.refresh(); assert.ok(!f.events.includes('client-created')); await f.product.dispose();
  }
});
test('incoming canonical hint does not request permission, accept, or capture automatically', async () => {
  const f = fixture(true); await f.composition.controller.openCall(f.model.id);
  assert.equal(f.composition.controller.getSnapshot().phase, 'RINGING'); assert.equal(f.counts().permissionCalls, 0); assert.equal(f.counts().credentialCount, 0);
  assert.ok(!f.events.some(x => x.rpc === 'rpc_connect_act')); await f.product.dispose();
});
test('duplicate incoming Accept taps share the existing authoritative action and native owner', async () => {
  const f = fixture(true); await f.composition.controller.openCall(f.model.id);
  await Promise.all([f.composition.controller.accept(), f.composition.controller.accept()]);
  assert.equal(f.events.filter(x => x.rpc === 'rpc_connect_act' && x.args.p_action === 'accept').length, 1);
  assert.equal(f.events.filter(x => x === 'client-created').length, 1); await f.product.dispose(); await f.composition.owner().release();
});
for (const state of ['MISSED', 'CANCELLED', 'DECLINED', 'ENDED']) test(`late ${state} notification opens canonical completion without media`, async () => {
  const f = fixture(true); f.model.state = state; f.model.reason = state === 'ENDED' ? 'blocked' : null;
  await f.composition.controller.openCall(f.model.id); assert.equal(f.composition.controller.getSnapshot().phase, 'ENDED');
  assert.equal(f.counts().permissionCalls, 0); assert.equal(f.counts().credentialCount, 0); await f.product.dispose();
});
test('already accepted elsewhere cannot be accepted or terminated merely by opening its push', async () => {
  const f = fixture(true); f.model.state = 'ACTIVE'; await f.composition.controller.openCall(f.model.id); await f.product.dispose();
  assert.equal(f.counts().credentialCount, 0); assert.ok(!f.events.some(x => x.rpc === 'rpc_connect_act'));
});
test('late navigation callback cannot hang up a new generation', async () => {
  const f = fixture(); await f.start(); const old = f.composition.controller.captureNavigationCleanup();
  await f.composition.controller.hangup(); f.composition.controller.reset(); await f.start(); const calls = f.events.length; old();
  await settle(); assert.equal(f.events.length, calls); await f.product.dispose();
});
test('End Call and Block commits independently of a hung native leave and retains uncertainty', async () => {
  const f = fixture(); await f.active(); f.handle.leave = () => new Promise(() => {});
  await f.composition.controller.endCallAndBlock(); const state = f.composition.controller.getSnapshot();
  assert.equal(state.endBlock.block, 'saved'); assert.equal(state.endBlock.provider, 'pending'); assert.equal(state.endBlock.media, 'unverified');
  assert.equal(f.composition.owner().getSnapshot().operations.leave, 'pending'); assert.throws(() => f.registry.acquire('live', () => ({})), /busy/);
  await f.product.dispose();
});
test('Live lease blocks native Connect ownership without disconnecting Live', async () => {
  const f = fixture(); let disconnected = 0; const live = f.registry.acquire('live', () => ({ async disconnectUser() { disconnected++; } }));
  await f.active(); assert.ok(!f.events.includes('client-created')); assert.equal(disconnected, 0); await f.product.dispose(); await live.release();
});
for (const next of ['reconnecting', 'migrating', 'offline']) test(`product ${next} state retires media instead of silently rejoining`, async () => {
  const f = fixture(); await f.active(); f.emit(next); await settle();
  const owner = f.composition.owner(); assert.equal(owner.getSnapshot().retired, true);
  await assert.rejects(f.client.input.tokenProvider(), /denied/); await owner.release(); await f.product.dispose();
});
test('background/foreground cannot reactivate the retired native call', async () => {
  const f = fixture(); await f.active(); f.background('background'); await settle(); f.background('active');
  const before = f.events.filter(x => x === 'capture').length;
  await f.composition.controller.setForeground(true); await f.composition.controller.toggleMute();
  assert.equal(f.events.filter(x => x === 'capture').length, before); await f.composition.owner().release(); await f.product.dispose();
});
test('disabled app coordinator never invokes loader or native services', async () => {
  const f = fixture(); let loads = 0; const host = new ConnectProductCoordinator(f.nativeAuth.owner, false, async () => { loads++; return f.product; });
  await host.start(); await host.tick(); assert.equal(loads, 0); host.dispose(); await f.product.dispose();
});
test('coordinator shares one bootstrap and disposes a late result after logout', async () => {
  const f = fixture(), gate = deferred(); let loads = 0, disposed = 0;
  const product = { ...f.product, async dispose() { disposed++; await f.product.dispose(); } };
  const host = new ConnectProductCoordinator(f.nativeAuth.owner, true, () => { loads++; return gate.promise; });
  const a = host.start(), b = host.start(); assert.equal(a, b); await settle(); f.nativeAuth.invalidate(); gate.resolve(product); await a;
  assert.equal(loads, 1); assert.equal(disposed, 1); assert.equal(host.getSnapshot().product, null);
});
test('retirement before the bootstrap microtask never invokes its loader', async () => {
  const f = fixture(); let loads = 0; const host = new ConnectProductCoordinator(f.nativeAuth.owner, true, async () => { loads++; return f.product; });
  const starting = host.start(); f.nativeAuth.invalidate(); await starting; assert.equal(loads, 0); await f.product.dispose();
});
test('canonical session parser rejects wrong participants, media and malformed versions', () => {
  const f = fixture(); for (const patch of [{ caller_profile_id: id(8), recipient_profile_id: id(9) }, { media: 'video' }, { version: NaN }, { id: 'fake' }]) {
    assert.throws(() => readCanonicalVoiceSession({ ...f.model, ...patch }, id(2)), /unavailable/);
  }
});
for (const type of connectNotificationTypes) test(`${type} routes only by call ID and never transports private payload fields`, () => {
  const data = { type, call_id: id(10), token: 'secret', apiKey: 'key', userId: id(7), media: 'video', accepted: true };
  assert.deepEqual(connectNotificationTarget(data, true), { pathname: '/connect/voice', params: { callId: id(10) } });
  assert.equal(connectNotificationTarget(data, false), null);
});
test('malformed route identities and voice-to-video claims are rejected', () => {
  for (const params of [{ callId: ['array'] }, { peerId: id(3), authorization: 'pre_match' }, { peerId: id(3), authorization: 'matched', grantId: id(4) }, { peerId: id(3), authorization: 'video' }]) assert.equal(readConnectLaunch(params), null);
  assert.deepEqual(readConnectLaunch({ peerId: id(3), authorization: 'pre_match', grantId: id(4), accepted: 'true' }), { kind: 'outgoing', peerId: id(3), authorization: 'pre_match', grantId: id(4) });
});
test('even approved video preparation never enables media transport or publication', () => {
  const state = { consent: 'approved', cameraPermission: 'granted', camera: 'preview', facing: 'front', microphoneMuted: true };
  assert.equal(videoPreparationStatus(state).previewAllowed, true); assert.equal(videoPreparationStatus(state).transportEnabled, false);
  assert.equal(videoPreparationStatus({ ...state, consent: 'revoked' }).previewAllowed, false);
  assert.equal(videoPreparationStatus({ ...state, cameraPermission: 'denied' }).previewAllowed, false);
});
test('Connect SDK capture wrapper detaches stream before any native track disposal and keeps stable inspection', () => {
  const events = []; const raw = { enabled: true, readyState: 'live', stop() { this.readyState = 'ended'; }, release() { events.push('track'); } };
  const stream = { getTracks: () => [raw], release(tracks) { assert.equal(tracks, false); events.push('stream'); } };
  const [track] = retainNativeCaptureTracks(stream); track.stop(); track.release(); track.release(); track.stop();
  assert.deepEqual(events, ['stream', 'track']); assert.equal(track.readyState, 'ended'); assert.throws(() => { track.enabled = true; }, /retired/);
});
test('ambiguous native stream detach never becomes a successful track release on retry', () => {
  let releases = 0; const raw = { enabled: true, readyState: 'live', stop() {}, release() { releases++; } };
  const [track] = retainNativeCaptureTracks({ getTracks: () => [raw], release() { throw Error('bridge'); } });
  assert.throws(() => track.release(), /bridge/); assert.throws(() => track.release(), /unconfirmed/); assert.equal(releases, 0);
});
test('app host is mounted under trusted Auth, and product imports no standalone harness', () => {
  const root = fs.readFileSync('app/_layout.tsx', 'utf8'); assert.ok(root.indexOf('<AuthProvider>') < root.indexOf('<ConnectProductProvider>'));
  const source = fs.readFileSync('features/connect/data/load-connect-product.ts', 'utf8'); assert.ok(source.includes('invokePinnedConnectRpc'));
  assert.ok(!source.includes('harnesses/')); assert.ok(!source.includes('live-rtc-token')); assert.equal(network, 0);
});
