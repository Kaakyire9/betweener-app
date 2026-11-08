import assert from 'node:assert/strict';
import test from 'node:test';
import { createConnectStreamAdapter, type ProviderSnapshot, type StreamServerPort } from '../supabase/functions/_shared/connect-stream-adapter.ts';
import { runConnectProviderJob, type ConnectWorkerStore } from '../supabase/functions/_shared/connect-provider-worker.ts';

const id = 'aa210000-0000-4000-8000-000000000001';
const users = ['aa210000-0000-4000-8000-000000000002', 'aa210000-0000-4000-8000-000000000003'];
const endedAt = '2026-10-29T10:00:00.000Z';
const policy = {
  name: 'betweener_connect', grants: { user: [], admin: [], call_member: [],
    connect_invited: ['read-call'], connect_voice: ['read-call', 'join-call', 'send-audio'],
    connect_video: ['read-call', 'join-call', 'send-audio', 'send-video'] },
  settings: { recording: { mode: 'disabled' }, transcription: { mode: 'disabled', closed_caption_mode: 'disabled' },
    individual_recording: { mode: 'disabled' }, raw_recording: { mode: 'disabled' }, frame_recording: { mode: 'disabled' },
    audio: { access_request_enabled: false }, video: { enabled: false, camera_default_on: false, access_request_enabled: false },
    screensharing: { enabled: false, access_request_enabled: false }, thumbnails: { enabled: false }, ingress: { enabled: false },
    broadcasting: { enabled: false, hls: { enabled: false }, rtmp: { enabled: false } }, limits: { max_participants: 2 } },
};
function fixture(callEnded: boolean, session: 'active' | 'ended' | null) {
  const snapshot: ProviderSnapshot = { id, caller_user_id: users[0], recipient_user_id: users[1], state: 'ACTIVE', media: 'voice',
    ended_at: null, can_provision: true, provider_session_id: 'session-1' };
  const response = { call: { id, type: policy.name, custom: { betweener_connect_id: id, media: 'voice' }, settings: policy.settings,
    ended_at: callEnded ? endedAt : null, session: session === null ? null : { id: 'session-1', ended_at: session === 'ended' ? endedAt : null,
      participants: users.map((userId) => ({ user: { id: userId } })) } }, members: users.map((user_id) => ({ user_id })) };
  let getError: unknown = null;
  let reconcileError = false;
  const observations: unknown[] = [];
  const completions: boolean[] = [];
  let gets = 0;
  const stream: StreamServerPort = {
    async getApp() { return { app: { id: 1731011, disable_auth_checks: false, disable_permissions_checks: false } }; },
    video: { async getCallType() { return policy; }, call() { return {
      async get() { gets++; if (getError) throw getError; return response; },
      async getOrCreate() { throw new Error('unexpected_provider_write'); },
      async updateCallMembers() { throw new Error('unexpected_provider_write'); },
      async end() { throw new Error('unexpected_provider_write'); },
    }; } },
    async upsertUsers() { throw new Error('unexpected_provider_write'); },
    generateUserToken() { throw new Error('unexpected_token_issue'); },
  };
  const store: ConnectWorkerStore = {
    async snapshot() { return snapshot; },
    async complete(_job, success) { completions.push(success); },
    async reconcile(_id, observation) { if (reconcileError) throw new Error('transient_database_failure'); observations.push(observation); },
  };
  return { snapshot, response, observations, completions, store, stream, adapter: createConnectStreamAdapter(stream, 1731011),
    getCount: () => gets, failGet: (error: unknown) => { getError = error; }, failReconcile: (fail: boolean) => { reconcileError = fail; } };
}
const job = { call_id: id, operation: 'sync' as const, lease: 'owned-lease' };

for (const [name, callEnded, session] of [
  ['ended call without session', true, null],
  ['ended call with retained non-ended session', true, 'active'],
  ['active call and active session', false, 'active'],
  ['session ended without permanent call end', false, 'ended'],
  ['call and session both ended', true, 'ended'],
  ['active call without a current session', false, null],
] as const) {
  test(`real adapter and sync worker reconcile ${name}`, async () => {
    const f = fixture(callEnded, session);
    assert.deepEqual(await runConnectProviderJob(job, f.store, f.adapter), { success: true });
    assert.deepEqual(f.observations, [{ session: session === null ? null : 'session-1', users: session === null || session === 'ended' ? [] : users,
      ended: callEnded }]);
    assert.deepEqual(f.completions, [true]);
  });
}
test('confirmed missing provider call reconciles without fabricating a session', async () => {
  const f = fixture(false, null); f.failGet({ metadata: { responseCode: 404 }, code: 16 });
  assert.deepEqual(await runConnectProviderJob(job, f.store, f.adapter), { success: true });
  assert.deepEqual(f.observations, [{ session: null, users: [], ended: true }]);
});
test('ambiguous missing/error responses stay retryable rather than certifying termination', async () => {
  for (const error of [{ metadata: { responseCode: 503 }, code: 16 }, { metadata: { responseCode: 404 }, code: 17 }, new Error('network_error')]) {
    const f = fixture(false, null); f.failGet(error);
    assert.deepEqual(await runConnectProviderJob(job, f.store, f.adapter), { success: false });
    assert.deepEqual(f.observations, []); assert.deepEqual(f.completions, [false]);
  }
});
test('reconciliation failure does not acknowledge success; a later worker retries the same terminal observation', async () => {
  const f = fixture(true, null); f.failReconcile(true);
  assert.deepEqual(await runConnectProviderJob(job, f.store, f.adapter), { success: false });
  assert.deepEqual(f.completions, [false]);
  f.failReconcile(false);
  assert.deepEqual(await runConnectProviderJob({ ...job, lease: 'new-owned-lease' }, f.store, f.adapter), { success: true });
  assert.equal(f.observations.length, 1); assert.deepEqual(f.completions, [false, true]);
});
test('duplicate sync and out-of-order active provider data cannot revive a canonical terminal call', async () => {
  const f = fixture(true, null);
  const reconcile = f.store.reconcile;
  f.store.reconcile = async (callId, observation) => {
    await reconcile(callId, observation); f.snapshot.state = 'ENDED'; f.snapshot.ended_at = endedAt;
  };
  await runConnectProviderJob(job, f.store, f.adapter);
  f.response.call.ended_at = null;
  await runConnectProviderJob(job, f.store, f.adapter);
  await runConnectProviderJob(job, f.store, f.adapter);
  assert.equal(f.snapshot.state, 'ENDED'); assert.equal(f.getCount(), 1); assert.equal(f.observations.length, 1);
});
test('deleted application row completes sync without creating or querying a provider call', async () => {
  const f = fixture(false, null); f.store.snapshot = async () => null;
  assert.deepEqual(await runConnectProviderJob(job, f.store, f.adapter), { success: true });
  assert.equal(f.getCount(), 0); assert.deepEqual(f.observations, []);
});
test('terminal observations are reconciled while ringing or accepted, before media join', async () => {
  for (const state of ['RINGING', 'ACCEPTED']) {
    const f = fixture(true, null); f.snapshot.state = state;
    await runConnectProviderJob(job, f.store, f.adapter);
    assert.deepEqual(f.observations, [{ session: null, users: [], ended: true }]);
  }
});
test('credentials cannot promote members or mint tokens for a provider-ended call', async () => {
  const f = fixture(true, 'active');
  await assert.rejects(f.adapter.credentials(f.snapshot, users[0]), /connect_provider_unavailable/);
});
test('provision cannot acknowledge an already ended getOrCreate result as a fresh ringing call', async () => {
  const f = fixture(true, null); f.snapshot.state = 'REQUESTED';
  const call = f.stream.video.call('betweener_connect', id);
  call.getOrCreate = async () => undefined;
  f.stream.video.call = () => call;
  f.stream.upsertUsers = async () => undefined;
  assert.deepEqual(await runConnectProviderJob({ ...job, operation: 'create' }, f.store, f.adapter), { success: false });
  assert.deepEqual(f.completions, [false]);
});
