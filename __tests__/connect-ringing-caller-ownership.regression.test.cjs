const test = require('node:test');
const assert = require('node:assert/strict');
const { createConnectStreamAdapter } = require('../supabase/functions/_shared/connect-stream-adapter.ts');
const { createNativeCallCoordinator } = require('../features/connect/application/native-call-coordinator.ts');
const { id } = require('./fixtures/connect-product-fixture.cjs');

function providerFixture(media, nativeIncoming = true) {
  const caller = id(1), recipient = id(2), callId = id(40), requests = [], recipients = [];
  const settings = {
    recording: { mode: 'disabled' }, transcription: { mode: 'disabled', closed_caption_mode: 'disabled' },
    individual_recording: { mode: 'disabled' }, raw_recording: { mode: 'disabled' }, frame_recording: { mode: 'disabled' },
    audio: { access_request_enabled: false }, video: { enabled: media === 'video', camera_default_on: false, access_request_enabled: false },
    screensharing: { enabled: false, access_request_enabled: false }, thumbnails: { enabled: false }, ingress: { enabled: false },
    broadcasting: { enabled: false, hls: { enabled: false }, rtmp: { enabled: false } }, limits: { max_participants: 2 },
    encryption: { mode: 'auto-on' },
  };
  const type = { name: 'betweener_connect', grants: { user: [], admin: [], call_member: [],
    connect_invited: ['read-call'], connect_voice: ['read-call', 'join-call', 'send-audio'],
    connect_video: ['read-call', 'join-call', 'send-audio', 'send-video'] }, settings };
  const port = {
    async getOrCreate(input) {
      requests.push(input);
      // Stream excludes the creator from incoming ringing delivery.
      if (input.ring) recipients.push(...input.data.members.filter(member => member.user_id !== input.data.created_by_id).map(member => member.user_id));
    },
    async get() { return { call: { id: callId, type: type.name, custom: { betweener_connect_id: callId, media }, settings },
      members: [caller, recipient].map(user_id => ({ user_id, role: 'connect_invited' })) }; },
  };
  const stream = { async getApp() { return { app: { id: 1731011, disable_auth_checks: false, disable_permissions_checks: false } }; },
    video: { async getCallType() { return type; }, call() { return port; } }, async upsertUsers() {},
    generateUserToken() { throw Error('Provisioning must not issue participant tokens'); } };
  const snapshot = { id: callId, caller_user_id: caller, recipient_user_id: recipient, state: 'REQUESTED', media,
    ended_at: null, can_provision: true, provider_session_id: null, encryption_required: true, native_incoming: nativeIncoming };
  return { caller, recipient, requests, recipients, snapshot, adapter: createConnectStreamAdapter(stream, 1731011) };
}

for (const media of ['voice', 'video']) test(`${media}: provider rings the recipient only and preserves invitation permissions`, async () => {
  const f = providerFixture(media); await f.adapter.provision(f.snapshot);
  assert.deepEqual(f.recipients, [f.recipient]);
  assert.equal(f.requests[0].data.created_by_id, f.caller);
  assert.equal(f.requests[0].video, media === 'video');
  assert.equal(f.requests[0].notify, false);
  assert.deepEqual(f.requests[0].data.members, [f.caller, f.recipient].map(user_id => ({ user_id, role: 'connect_invited' })));
  assert.equal(f.requests[0].data.settings_override.encryption.mode, 'auto-on');
  assert.equal(f.requests[0].data.settings_override.video.camera_default_on, false);
});

test('disabled native incoming still creates no ringing recipients', async () => {
  const f = providerFixture('voice', false); await f.adapter.provision(f.snapshot);
  assert.deepEqual(f.recipients, []); assert.equal(f.requests[0].ring, false);
});

function nativeFixture({ recipient = false, owned = false, phase = 'RINGING', differentGeneration = false, differentCall = false, transferOwnership = false } = {}) {
  const call = { id: id(40), created_at: '2026-11-17T09:00:00.000Z', caller_profile_id: id(2), recipient_profile_id: id(3),
    media: 'voice', authorization: 'matched', grant_id: null, state: phase, version: 1, native_incoming: true, ended_at: null, deadline: null };
  const view = { session: owned ? { ...call, id: differentCall ? id(41) : call.id,
    created_at: differentGeneration ? '2026-11-16T09:00:00.000Z' : call.created_at } : null, phase: owned ? phase : 'IDLE' };
  const counts = { hangups: 0, acts: [], releases: 0, disposals: 0 };
  const product = { selfProfileId: recipient ? id(3) : id(2), accountUserId: id(1), authGeneration: 'epoch',
    services: { api: { async getCall() { return { ...call }; }, async act(_id, action) { counts.acts.push(action); return { ...call }; } } },
    controller: { getSnapshot: () => view, async hangup() { counts.hangups++; view.phase = 'ENDED'; } },
    async answerNative() { throw Error('End must not answer'); }, async dispose() { counts.disposals++; } };
  const closed = [];
  const coordinator = createNativeCallCoordinator({ enabled: () => true, load: async () => product, deviceId: async () => id(4),
    current: () => true, now: Date.now, close: async (_id, reason) => { closed.push(reason); },
    keepAlive: async () => {
      if (transferOwnership) view.session = { ...call, id: id(41) };
      return async () => { counts.releases++; };
    } });
  return { call, view, counts, closed, coordinator, event: { cid: `betweener_connect:${call.id}`, action: 'end' } };
}

for (const options of [{}, { owned: true, differentCall: true }, { owned: true, differentGeneration: true }]) {
  test(`a caller device without ownership cannot cancel another device's ringing call: ${JSON.stringify(options)}`, async () => {
    const f = nativeFixture(options);
    assert.deepEqual(await f.coordinator.handle(f.event), { handled: true, success: false });
    assert.equal(f.counts.hangups, 0); assert.deepEqual(f.counts.acts, []);
    assert.equal(f.call.state, 'RINGING'); assert.deepEqual(f.closed, ['error']);
    await f.coordinator.dispose();
  });
}

for (const phase of ['RINGING', 'ACTIVE']) test(`explicit native End still stops the caller's owned ${phase} call`, async () => {
  const f = nativeFixture({ owned: true, phase });
  assert.equal((await f.coordinator.handle(f.event)).success, true);
  assert.equal(f.counts.hangups, 1); assert.deepEqual(f.counts.acts, []);
  await f.coordinator.dispose();
});

test('an explicit recipient End can still decline an unanswered native invitation', async () => {
  const f = nativeFixture({ recipient: true });
  assert.equal((await f.coordinator.handle(f.event)).success, true);
  assert.equal(f.counts.hangups, 0); assert.deepEqual(f.counts.acts, ['decline']);
  await f.coordinator.dispose();
});

for (const phase of ['RINGING', 'ACTIVE']) test(`a caller End cannot stop a replacement ${phase} call after acquiring the lease`, async () => {
  const f = nativeFixture({ owned: true, phase, transferOwnership: true });
  assert.equal((await f.coordinator.handle(f.event)).success, false);
  assert.equal(f.counts.hangups, 0); assert.deepEqual(f.counts.acts, []);
  assert.equal(f.view.session.id, id(41)); assert.equal(f.view.phase, phase);
  assert.equal(f.counts.releases, 1);
  await f.coordinator.dispose();
});
