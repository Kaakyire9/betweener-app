const { createNativeSessionOwner } = require('../../lib/auth/native-session-owner.ts');
const { Buffer } = require('node:buffer');
const { createAuthenticatedConnectServices } = require('../../features/connect/data/authenticated-connect-services.ts');
const { createConnectNativeSafetyComposition } = require('../../features/connect/media/native-safety-composition.ts');
const { StreamVideoClientLeaseRegistry } = require('../../features/live/media/stream-video-client-leases.ts');
const id = n => `a0330000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const jwt = (user = id(1), session = id(5), expires = Date.now() + 3600000) => `e30.${Buffer.from(JSON.stringify({ sub: user, session_id: session, exp: Math.floor(expires / 1000) })).toString('base64url')}.synthetic`;
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const settle = () => new Promise(resolve => setImmediate(resolve));
function fixture(incoming = false, options = {}) {
  const nativeAuth = createNativeSessionOwner(); nativeAuth.accept({ user: { id: id(1) }, access_token: jwt() });
  const events = [], states = new Set(), media = new Set(), appListeners = new Set();
  let appState = 'active', eligible = true, blocked = false, permission = 'granted', permissionCalls = 0, createCount = 0, credentialCount = 0, model;
  const seed = () => ({ id: id(10 + createCount), caller_profile_id: incoming ? id(3) : id(2), recipient_profile_id: incoming ? id(2) : id(3),
    media: 'voice', authorization: 'matched', state: 'RINGING', version: 1, created_at: new Date(Date.now() - 1000).toISOString(),
    accepted_at: null, connected_at: null, ended_at: null, deadline: null, reason: null, duration_seconds: null });
  model = seed(); let context, receipt, preferences = { voice: false, video: false };
  const ports = {
    async rpc(name, args, token) {
      events.push({ rpc: name, args, token });
      const ok = data => ({ data, error: null }), fail = message => ({ data: null, error: { message } });
      if (name === 'rpc_is_relationship_mutually_verified' || name === 'rpc_reconfirm_relationship') return ok(true);
      if (name === 'rpc_connect_get_preferences') return ok({ ...preferences });
      if (name === 'rpc_connect_set_preferences') { preferences = { voice: args.p_voice, video: args.p_video }; return ok(null); }
      if (name === 'rpc_connect_check_eligibility') return ok(eligible && !blocked);
      if (name === 'rpc_connect_create_call') {
        if (!eligible || blocked) return fail('connect_consent_required');
        createCount++; model = seed(); return ok({ ...model });
      }
      if (name === 'rpc_connect_get_call') return ok({ ...model });
      if (name === 'rpc_connect_get_history') return ok([{ ...model }]);
      if (name === 'rpc_connect_act') {
        if (args.p_action === 'accept') {
          if (!incoming || blocked || !eligible || model.state !== 'RINGING') return fail('connect_invalid_transition');
          model.state = 'ACCEPTED';
        } else { model.state = 'ENDED'; model.ended_at = new Date().toISOString(); }
        model.version++; return ok({ ...model });
      }
      if (name === 'rpc_connect_end_block_context') {
        context = { call_id: model.id, generation: model.created_at, actor_user_id: id(1), peer_user_id: id(7), peer_profile_id: id(3),
          caller_profile_id: model.caller_profile_id, recipient_profile_id: model.recipient_profile_id, media: 'voice', authorization: 'matched',
          grant_id: null, block_id: null, revocation_at: null }; return ok({ ...context });
      }
      if (name === 'rpc_connect_end_call_and_block') {
        blocked = true; model.state = 'ENDED';
        receipt = { ...context, request_id: args.p_key, block: 'saved', call: 'terminal', provider: 'pending', media: 'unverified' }; return ok({ ...receipt });
      }
      if (name === 'rpc_connect_end_block_status') return ok(receipt ? { ...receipt } : null);
      throw Error(`Unexpected RPC ${name}`);
    },
    async credentials(callId, deviceId, token) {
      events.push({ credential: callId, deviceId, token }); credentialCount++;
      if (!eligible || blocked || !['ACCEPTED', 'CONNECTING', 'ACTIVE', 'RECONNECTING'].includes(model.state)) throw Error('connect_unavailable');
      return { apiKey: 'offline-key', token: 'offline-stream-token', user: { id: id(1) }, media: 'voice', expiresAt: new Date(Date.now() + 120000).toISOString(),
        call: { id: callId, type: 'betweener_connect', cid: `betweener_connect:${callId}` } };
    },
    async peer(profileId) { return { profileId, name: 'Ama', avatar: null }; },
  };
  const services = createAuthenticatedConnectServices(nativeAuth.owner, id(2), ports);
  const sdkState = { callingState: 'idle', microphoneStatus: 'disabled', cameraStatus: 'disabled', audioPublishing: false, videoPublishing: false, publisherPresent: false, subscriberPresent: false };
  const tracks = [];
  const handle = {
    id: model.id, type: 'betweener_connect', cid: `betweener_connect:${model.id}`, state: () => ({ ...sdkState }),
    tracks: () => ({ microphone: tracks, camera: [], remote: [] }),
    observeState(fn) { states.add(fn); return () => states.delete(fn); }, observeMedia(fn) { media.add(fn); return () => media.delete(fn); },
    async enableMicrophone() {
      events.push('capture'); const track = { enabled: true, readyState: 'live', stop() { this.readyState = 'ended'; }, release() { events.push('track-release'); } };
      tracks.push(track); sdkState.microphoneStatus = 'enabled'; sdkState.audioPublishing = true; for (const fn of media) fn();
    },
    async disableMicrophone() { sdkState.microphoneStatus = 'disabled'; sdkState.audioPublishing = false; },
    async disableCamera() { sdkState.cameraStatus = 'disabled'; },
    async disposePublisher() { sdkState.publisherPresent = false; sdkState.audioPublishing = false; },
    async disposeSubscriber() { sdkState.subscriberPresent = false; },
    async join() { sdkState.callingState = 'joined'; sdkState.publisherPresent = true; sdkState.subscriberPresent = true; for (const fn of [...states]) fn('joined'); },
    async leave() { sdkState.callingState = 'left'; sdkState.publisherPresent = false; sdkState.subscriberPresent = false; for (const fn of [...states]) fn('left'); },
  };
  let selectedDeviceId = 'ear';
  const registry = new StreamVideoClientLeaseRegistry();
  const client = { call(_type, callId) { handle.id = callId; handle.cid = `betweener_connect:${callId}`; return handle; }, async disconnectUser() { events.push('disconnect'); } };
  const sdk = { createClient(input) { events.push('client-created'); client.input = input; return client; }, audio: () => ({ configure() {}, clearConfiguration() {},
    devices: async () => ({ devices: [{ id: 'ear', type: 'Earpiece' }, { id: 'speaker', type: 'Speaker' }], selectedDeviceId }), select(id) { selectedDeviceId = id; },
    observeDevices: () => () => {}, observeInterruption: () => () => {} }) };
  const composition = createConnectNativeSafetyComposition({ auth: nativeAuth.owner, api: services.api, selfProfileId: id(2), deviceId: id(4), peer: services.peer,
    uuid: () => id(6), now: Date.now, registry, flags: { nativeSafetyOwner: true, endCallAndBlock: true }, retireOnReconnect: true, failClosedAuthority: true,
    lifecycle: { platform: 'android', appState: () => appState, subscribeAppState(fn) { appListeners.add(fn); return () => appListeners.delete(fn); } },
    permission: async () => { permissionCalls++; return permission; }, loadSdk: options.loadSdk ?? (async () => sdk) });
  const product = { ...composition, services, selfProfileId: id(2), authGeneration: nativeAuth.owner.snapshot().generation };
  return { nativeAuth, ports, services, composition, product, events, registry, client, handle, sdkState, tracks,
    get model() { return model; }, counts: () => ({ permissionCalls, createCount, credentialCount }),
    eligible(v) { eligible = v; }, permission(v) { permission = v; },
    emit(state) { sdkState.callingState = state; for (const fn of [...states]) fn(state); },
    background(v) { appState = v; for (const fn of [...appListeners]) fn(v); },
    async start() { await composition.controller.start({ profileId: id(3), name: 'Ama', avatar: null }, 'matched'); },
    async active() { if (incoming) { await composition.controller.openCall(model.id); await composition.controller.accept(); }
      else { await this.start(); model.state = 'ACTIVE'; model.connected_at = new Date().toISOString(); await composition.controller.refresh(); } },
  };
}
module.exports = { fixture, id, jwt, deferred, settle };
