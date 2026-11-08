import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import test from 'node:test';
import { canTransition, connectedDuration, terminalStates, transitions, type ConnectState } from '../features/connect/domain/connect.ts';
import { createConnectRepository } from '../features/connect/data/connect-repository.ts';
import { assertConnectCallType, createConnectStreamAdapter, type ProviderSnapshot, type StreamServerPort } from '../supabase/functions/_shared/connect-stream-adapter.ts';
import { runConnectProviderJob, type ConnectWorkerStore } from '../supabase/functions/_shared/connect-provider-worker.ts';
import { connectWebhookCall, verifyConnectWebhook } from '../supabase/functions/_shared/connect-webhook.ts';
import { assertConnectEnvironment } from '../supabase/functions/_shared/connect-environment.ts';

const id = 'aa110000-0000-4000-8000-000000000001';
const caller = 'aa110000-0000-4000-8000-000000000002';
const recipient = 'aa110000-0000-4000-8000-000000000003';
const snapshot: ProviderSnapshot = { id, caller_user_id: caller, recipient_user_id: recipient, state: 'REQUESTED', media: 'voice', ended_at: null, can_provision: true, provider_session_id: null };
const policy = () => ({ name: 'betweener_connect', grants: {
  user: [], admin: [], host: [], moderator: [], call_member: [],
  connect_invited: ['read-call'], connect_voice: ['read-call', 'join-call', 'send-audio'], connect_video: ['read-call', 'join-call', 'send-audio', 'send-video'],
}, settings: {
  recording: { mode: 'disabled' }, transcription: { mode: 'disabled', closed_caption_mode: 'disabled' },
  individual_recording: { mode: 'disabled' }, raw_recording: { mode: 'disabled' }, frame_recording: { mode: 'disabled' },
  audio: { access_request_enabled: false }, video: { enabled: false, camera_default_on: false, access_request_enabled: false },
  screensharing: { enabled: false, access_request_enabled: false }, thumbnails: { enabled: false }, ingress: { enabled: false },
  broadcasting: { enabled: false, hls: { enabled: false }, rtmp: { enabled: false } }, limits: { max_participants: 2 },
} });
test('Connect backend identity rejects production, mismatched and missing environment configuration', () => {
  assert.doesNotThrow(() => assertConnectEnvironment('local', 'http://127.0.0.1:54321'));
  assert.doesNotThrow(() => assertConnectEnvironment('staging', 'https://xsgzxadwuxuziubglvps.supabase.co'));
  for (const environment of ['production', 'local', 'staging', '']) {
    assert.throws(() => assertConnectEnvironment(environment, 'https://jbyblhithbqwojhwlenv.supabase.co'));
  }
  assert.throws(() => assertConnectEnvironment('staging', 'http://xsgzxadwuxuziubglvps.supabase.co'));
  assert.throws(() => assertConnectEnvironment('local', 'https://example.com'));
});
function fixture() {
  const operations: { name: string; input: unknown }[] = [];
  const result = { call: { id, type: 'betweener_connect', ended_at: null as string | null, custom: { betweener_connect_id: id, media: 'voice' }, settings: policy().settings, session: {
    id: 'provider-session', participants: [{ user: { id: caller } }, { user: { id: recipient } }],
  } }, members: [{ user_id: caller }, { user_id: recipient }] };
  const call = { async getOrCreate(input: unknown) { operations.push({ name: 'create', input }); },
    async get() { return result; }, async updateCallMembers(input: unknown) { operations.push({ name: 'members', input }); },
    async end() { operations.push({ name: 'end', input: null }); result.call.ended_at = '2026-11-03T12:00:00Z'; return { duration: '1ms', metadata: { responseCode: 200 } }; } };
  const stream: StreamServerPort = { async getApp() { return { app: { id: 1731011, disable_auth_checks: false, disable_permissions_checks: false } }; }, video: { async getCallType() { return policy(); }, call(type, callId) {
    assert.equal(type, 'betweener_connect'); assert.equal(callId, id); return call;
  } }, async upsertUsers(input) { operations.push({ name: 'users', input }); }, generateUserToken(input) { operations.push({ name: 'token', input }); return 'test-token'; } };
  return { operations, result, call, stream, adapter: createConnectStreamAdapter(stream, 1731011) };
}
test('all terminal states are absorbing; exhaustive state edges are explicit', () => {
  for (const terminal of terminalStates) for (const state of Object.keys(transitions) as ConnectState[]) assert.equal(canTransition(terminal, state), terminal === state);
  assert.equal(canTransition('RINGING', 'ACTIVE'), false); assert.equal(canTransition('ACCEPTED', 'ACTIVE'), false);
  assert.equal(canTransition('CONNECTING', 'ACTIVE'), true); assert.equal(canTransition('ACTIVE', 'RECONNECTING'), true);
});
test('duration requires actual connection, excludes ringing and clamps invalid input', () => {
  assert.equal(connectedDuration(null, new Date().toISOString()), null);
  assert.equal(connectedDuration('2026-01-01T00:01:00Z', '2026-01-01T00:02:03.999Z'), 63);
  assert.equal(connectedDuration('2026-01-01T00:02:00Z', '2026-01-01T00:01:00Z'), 0);
  assert.equal(connectedDuration('invalid', 'invalid'), null);
});
test('repository derives actor on server and preserves command identity', async () => {
  const calls: unknown[] = [];
  const repository = createConnectRepository({ async rpc(name, args) { calls.push([name, args]); return { data: {}, error: null }; } });
  await repository.createCall(recipient, 'voice', 'pre_match', 'key', 'device', 'grant');
  assert.deepEqual(calls, [['rpc_connect_create_call', { p_peer: recipient, p_media: 'voice', p_authorization: 'pre_match', p_key: 'key', p_device: 'device', p_grant: 'grant' }]]);
});
test('repository never surfaces raw provider/database error details', async () => {
  const repository = createConnectRepository({ async rpc() { return { data: null, error: { message: 'secret raw payload' } }; } });
  await assert.rejects(repository.getCall(id), { message: 'connect_unavailable' });
});
test('private call type accepts only exact reviewed grants', () => {
  assert.doesNotThrow(() => assertConnectCallType(policy()));
  for (const permission of ['create-call', 'join-call', 'update-call', 'update-call-members', 'join-ended-call']) {
    const p = policy(); (p.grants.user as string[]).push(permission); assert.throws(() => assertConnectCallType(p));
  }
  const p = policy(); p.grants.connect_invited.push('join-call'); assert.throws(() => assertConnectCallType(p));
});
test('actual provider readback may omit empty optional roles but never adds their permissions', () => {
  const p = policy() as Record<string, any>;
  delete p.grants.host; delete p.grants.moderator;
  assert.doesNotThrow(() => assertConnectCallType(p));
  p.grants.host = ['join-call'];
  assert.throws(() => assertConnectCallType(p));
});
test('provider application identity and global authorization checks must match the reviewed target', async () => {
  for (const app of [
    { id: 1731011, disable_auth_checks: true, disable_permissions_checks: false },
    { id: 1731011, disable_auth_checks: false, disable_permissions_checks: true },
    { id: 9999999, disable_auth_checks: false, disable_permissions_checks: false },
  ]) {
    const f = fixture(); f.stream.getApp = async () => ({ app });
    await assert.rejects(f.adapter.provision(snapshot), /connect_provider_policy_unsafe/);
    assert.equal(f.operations.length, 0);
  }
});
test('extra roles, missing roles and all recording paths fail closed', () => {
  const p = policy() as Record<string, any>;
  p.grants.unexpected = ['create-call']; assert.throws(() => assertConnectCallType(p)); delete p.grants.unexpected;
  delete p.grants.user; assert.throws(() => assertConnectCallType(p));
  for (const field of ['recording', 'transcription', 'individual_recording', 'raw_recording', 'frame_recording']) {
    const candidate = policy(); (candidate.settings as any)[field].mode = 'auto-on'; assert.throws(() => assertConnectCallType(candidate));
  }
});
test('voice provision creates only an invitation, with camera disabled and no PII', async () => {
  const f = fixture(); await f.adapter.provision(snapshot);
  const creation = f.operations.find((o) => o.name === 'create')!.input as any;
  assert.equal(creation.ring, true); assert.equal(creation.notify, false); assert.equal(creation.data.settings_override.video.enabled, false);
  assert.deepEqual(creation.data.settings_override.video.target_resolution, { width: 640, height: 480, bitrate: 600000 });
  assert.deepEqual(creation.data.members, [caller, recipient].map((user_id) => ({ user_id, role: 'connect_invited' })));
  assert.deepEqual(f.operations[0].input, [{ id: 'betweener-connect-system' }, { id: caller }, { id: recipient }]);
  assert.equal(f.operations.some((o) => o.name === 'token'), false);
});
test('disabled or terminal provisioning has no provider side effects', async () => {
  const f = fixture();
  await assert.rejects(f.adapter.provision({ ...snapshot, can_provision: false }));
  await assert.rejects(f.adapter.provision({ ...snapshot, ended_at: new Date().toISOString() }));
  assert.equal(f.operations.length, 0);
});
test('credentials require acceptance and membership, use ordinary two-minute user tokens', async () => {
  const f = fixture(); await assert.rejects(f.adapter.credentials(snapshot, caller));
  const result = await f.adapter.credentials({ ...snapshot, state: 'CONNECTING' }, caller);
  assert.equal(result.token, 'test-token');
  const token = f.operations.find((o) => o.name === 'token')!.input as any;
  assert.equal(token.user_id, caller); assert.equal(token.validity_in_seconds, 120);
  assert.equal(token.exp - token.iat, 150);
  assert.ok(Math.abs(token.exp - Math.floor(Date.now() / 1000) - 120) <= 1);
  assert.equal(new Date(result.expiresAt).getTime(), token.exp * 1000);
  const members = f.operations.find((o) => o.name === 'members')!.input as any;
  assert.ok(members.update_members.every((m: any) => m.role === 'connect_voice'));
  await assert.rejects(f.adapter.credentials({ ...snapshot, state: 'ACTIVE' }, 'attacker'));
});
test('unexpected provider membership and call identity prevent credentials', async () => {
  const f = fixture(); f.result.members.push({ user_id: 'attacker' });
  await assert.rejects(f.adapter.credentials({ ...snapshot, state: 'ACTIVE' }, caller));
  assert.equal(f.operations.some((o) => o.name === 'token'), false);
});
test('trusted provider snapshot reports actual users only', async () => {
  const f = fixture(); assert.deepEqual(await f.adapter.media(snapshot), { session: 'provider-session', users: [caller, recipient], callEnded: false, sessionEnded: false, missing: false });
});
test('provider retry failure is persisted with no raw error output', async () => {
  const f = fixture(); f.call.getOrCreate = async () => { throw new Error('secret'); };
  const completions: boolean[] = [];
  const store: ConnectWorkerStore = { async snapshot() { return snapshot; }, async complete(_, success) { completions.push(success); }, async reconcile() {} };
  assert.deepEqual(await runConnectProviderJob({ call_id: id, operation: 'create', lease: 'lease' }, store, f.adapter), { success: false });
  assert.deepEqual(completions, [false]);
});
test('cancel during provider creation compensates before completing durable work', async () => {
  const f = fixture(); let reads = 0; let completed = false;
  const store: ConnectWorkerStore = { async snapshot() { return reads++ === 0 ? snapshot : { ...snapshot, state: 'CANCELLED', ended_at: new Date().toISOString() }; },
    async complete(_, success) { assert.equal(success, true); assert.equal(f.operations.at(-1)?.name, 'end'); completed = true; }, async reconcile() {} };
  await runConnectProviderJob({ call_id: id, operation: 'create', lease: 'lease' }, store, f.adapter); assert.equal(completed, true);
});
test('provider cleanup requires scoped numeric404 readback and retries code-only errors and outages', async () => {
  const f = fixture(); f.call.end = async () => { throw { code: 16 }; }; await assert.rejects(f.adapter.end(snapshot));
  f.call.end = async () => { throw { code: 16, metadata: { responseCode: 404 } }; };
  f.call.get = async () => { throw { code: 16, metadata: { responseCode: 404 } }; };
  assert.equal((await f.adapter.end(snapshot)).outcome, 'absent');
  f.call.end = async () => { throw { code: 9 }; }; await assert.rejects(f.adapter.end(snapshot));
});
test('cleanup can terminate a provider call after its Auth and session records are deleted', async () => {
  const f = fixture(); let completed = false;
  const store: ConnectWorkerStore = { async snapshot() { throw new Error('deleted session must not be loaded for cleanup'); },
    async complete(_, success) { completed = success; }, async reconcile() {} };
  await runConnectProviderJob({ call_id: id, operation: 'end', lease: 'lease' }, store, f.adapter);
  assert.equal(completed, true); assert.equal(f.operations.at(-1)?.name, 'end');
});
test('deleted session during provider creation triggers orphan compensation', async () => {
  const f = fixture(); let reads = 0;
  const store: ConnectWorkerStore = { async snapshot() { return reads++ === 0 ? snapshot : null; },
    async complete(_, success) { assert.equal(success, true); assert.equal(f.operations.at(-1)?.name, 'end'); }, async reconcile() {} };
  await runConnectProviderJob({ call_id: id, operation: 'create', lease: 'lease' }, store, f.adapter);
});
test('raw webhook signature rejects forgery, changed bytes and wrong application secret', async () => {
  const body = JSON.stringify({ type: 'call.session_started', call_cid: `betweener_connect:${id}`, created_at: new Date().toISOString() });
  const signature = createHmac('sha256', 'test-secret').update(body).digest('hex');
  assert.equal(await verifyConnectWebhook(body, signature, 'test-secret'), true);
  assert.equal(await verifyConnectWebhook(`${body} `, signature, 'test-secret'), false);
  assert.equal(await verifyConnectWebhook(body, signature, 'another-secret'), false);
  assert.equal(await verifyConnectWebhook(body, 'invalid', 'test-secret'), false);
  assert.equal(connectWebhookCall(body), id);
});
test('webhooks for Live, stale events and arbitrary client data never certify Connect media', () => {
  const event = { type: 'call.custom', call_cid: `betweener_connect:${id}`, created_at: new Date().toISOString(), state: 'ACTIVE', participants: ['forged'] };
  assert.equal(connectWebhookCall(JSON.stringify(event)), id); // Wake GET reconciliation only.
  assert.equal(connectWebhookCall(JSON.stringify({ ...event, call_cid: `default:${id}` })), null);
  assert.equal(connectWebhookCall(JSON.stringify({ ...event, created_at: '2020-01-01T00:00:00Z' })), null);
});
