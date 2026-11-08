// Deno-only ES module, checked separately from the Expo TypeScript project.
// eslint-disable-next-line import/no-unresolved -- Pinned Deno npm import, checked with Deno.
import { StreamClient } from 'npm:@stream-io/node-sdk@0.7.63';
import { assertConnectCallType, assertConnectSessionSettings } from '../../../supabase/functions/_shared/connect-stream-adapter.ts';
import { digest, matchesSubset, safeError, verifyApp } from '../connect-stream-audit.ts';
import approvalModule from './approval.cjs';
import scopeModule from './scope.cjs';
import diagnosticModule from './provider-diagnostics.cjs';
import requestModule from './request.cjs';
const { authorize, readManifest } = approvalModule;
const { assertLedger, ownedCall, ownedUser } = scopeModule;
const { captureErrorResponse, providerDiagnostic, providerDiagnosticV2, projectDiagnostic, operationStage } = diagnosticModule;
const { buildCreateRequest } = requestModule;
const option = (key: string) => { const index = Deno.args.indexOf(key); return index >= 0 ? Deno.args[index + 1] : undefined; };
const file = option('--ledger'); const approvalFile = option('--approval'); const cleanupOnly = Deno.args.includes('--cleanup-only');
if (!file || !approvalFile) throw new Error('provider_arguments_missing');
const { manifest, hash } = readManifest(option('--manifest'));
const approval = JSON.parse(await Deno.readTextFile(approvalFile));
const read = async () => JSON.parse(await Deno.readTextFile(file));
let ledger = await read(); assertLedger(ledger, manifest, hash);
buildCreateRequest(manifest, ledger); // Validate identifiers/closed schema before credential access or any provider operation.
const diagnosticVersion = manifest.schemaVersion === 3 ? 2 : 1;
const describeError = diagnosticVersion === 2 ? providerDiagnosticV2 : providerDiagnostic;
authorize({ execute: true, approval, manifest, hash, now: cleanupOnly ? Date.parse(ledger.reservedAt) : Date.now() });
if (ledger.approvalId !== approval.approvalId) throw new Error('approval_ledger_mismatch');
const values = Object.fromEntries((await Deno.readTextFile('.env.stream-audit.local')).split(/\r?\n/).flatMap((line) => {
  const match = /^\s*([A-Z_][A-Z_0-9]*)\s*=\s*(.*?)\s*$/.exec(line);
  return match ? [[match[1], match[2].replace(/^(['"])(.*)\1$/, '$2')]] : [];
}));
const key = values.STREAM_STAGING_API_KEY; const secret = values.STREAM_STAGING_API_SECRET;
if (!key || !secret) throw new Error('staging_credentials_missing');
const traffic: unknown[] = []; let trafficTruncated = false;
const nativeFetch = globalThis.fetch;
const tick = () => ({ mono: performance.now(), utc: new Date().toISOString(), timeOrigin: performance.timeOrigin });
globalThis.fetch = async (input, init) => {
  const url = new URL(input instanceof Request ? input.url : String(input));
  if (!['video.stream-io-api.com', 'chat.stream-io-api.com'].includes(url.hostname) || url.protocol !== 'https:') throw new Error('provider_http_host_rejected');
  const route = url.pathname.endsWith('/mark_ended') ? 'mark_ended' : url.pathname.endsWith('/join') ? 'coordinator_join'
    : url.pathname.includes(`/call/betweener_connect/${ledger.callId}`) ? 'owned_call'
    : /\/users\b/.test(url.pathname) ? 'fixture_users' : /\/task/.test(url.pathname) ? 'owned_cleanup_task' : 'app_or_policy_read';
  const started = tick();
  try {
    const response = await nativeFetch(input, init);
    const responseHeaders = tick();
    const diagnostic = await captureErrorResponse(response, { diagnosticVersion });
    if (traffic.length < 1024) traffic.push({ service: url.hostname, route, method: init?.method ?? (input instanceof Request ? input.method : 'GET'),
      started, responseHeaders, status: response.status, ...(diagnostic ? { diagnostic } : {}) }); else trafficTruncated = true;
    return response;
  } catch (error) {
    if (traffic.length < 1024) traffic.push({ service: url.hostname, route, started, failed: tick() }); else trafficTruncated = true;
    throw error;
  }
};
const client = new StreamClient(key, secret, { timeout: 5000 });
await verifyApp(client);
const call = client.video.call('betweener_connect', ledger.callId);
const issued = new Set<string>();
const absent = (error: unknown) => { const safe = safeError(error); return safe.status === 404 && safe.code === 16; };
const users = async () => (await client.queryUsers({ payload: { filter_conditions: { id: { $in: ledger.users } } } })).users;
async function get() {
  const response = await call.get();
  if (!ownedCall(response, ledger)) throw new Error('call_ownership_mismatch');
  assertConnectSessionSettings(response.call.settings, 'voice');
  if (!matchesSubset(response.call.settings, manifest.perCall.settings_override)
    || response.members.some((member) => member.role !== 'connect_voice')) throw new Error('effective_call_settings_mismatch');
  return response;
}
async function task(id?: string) {
  if (!id) return;
  const deadline = performance.now() + 10000;
  while (performance.now() < deadline) {
    const state = await client.getTask({ id });
    if (state.status === 'completed') return;
    if (state.status === 'failed') throw new Error('cleanup_task_failed');
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('cleanup_task_timeout');
}
async function command(op: string, args: { sender?: number }) {
  ledger = await read(); assertLedger(ledger, manifest, hash);
  if (op !== 'cleanup') {
    if (cleanupOnly) throw new Error('cleanup_process_scope');
    authorize({ execute: true, approval, manifest, hash });
    if (Date.now() >= Date.parse(ledger.hardDeadlineUtc)) throw new Error('hard_deadline');
  }
  if (op === 'preflight') {
    const type = await client.video.getCallType({ name: 'betweener_connect' }); assertConnectCallType(type);
    if (type.notification_settings?.enabled !== false) throw new Error('call_notifications_not_disabled');
    if ((await users()).length) throw new Error('fixture_identity_exists');
    try { await call.get(); throw new Error('fixture_call_exists'); } catch (error) { if (!absent(error)) throw error; }
    return { absent: true, baselineHash: await digest((await client.video.listCallTypes()).call_types), app: await verifyApp(client) };
  }
  if (op === 'createUsers') {
    if (!ledger.preflightAbsent || !ledger.usersAttempted || ledger.callAttempted) throw new Error('creation_order_invalid');
    if (issued.has(op)) throw new Error('duplicate_creation_forbidden'); issued.add(op);
    await client.upsertUsers(ledger.users.map((id: string) => ({ id, name: 'Synthetic media fixture', custom: { [manifest.ownership.callCustomMarker]: ledger.marker } })));
    const found = await users(); if (found.length !== 2 || !found.every((user) => ownedUser(user, ledger))) throw new Error('user_ownership_mismatch');
    return { created: 2 };
  }
  if (op === 'createCall') {
    if (!ledger.preflightAbsent || !ledger.usersAttempted || !ledger.callAttempted) throw new Error('creation_order_invalid');
    if (issued.has(op)) throw new Error('duplicate_creation_forbidden'); issued.add(op);
    const response = await call.getOrCreate(buildCreateRequest(manifest, ledger));
    // settings_override belongs in data, never on a shared type.
    if (!ownedCall(response, ledger)) throw new Error('created_call_ownership_mismatch');
    await get(); return { created: true };
  }
  if (op === 'join') {
    if (![1, 2].includes(args.sender ?? 0)) throw new Error('fixture_sender_invalid');
    await get(); const userId = ledger.users[args.sender! - 1];
    const token = client.generateUserToken({ user_id: userId, validity_in_seconds: 240 });
    const url = new URL(`https://video.stream-io-api.com/api/v2/video/call/betweener_connect/${ledger.callId}/join`);
    url.searchParams.set('api_key', key); url.searchParams.set('user_id', userId);
    const response = await fetch(url, { method: 'POST', headers: { Authorization: token, 'stream-auth-type': 'jwt', 'Content-Type': 'application/json' },
      body: JSON.stringify({ create: false, location: 'LHR' }), signal: AbortSignal.timeout(10000) });
    const payload = await response.json();
    if (!response.ok || !payload.credentials) throw new Error('coordinator_join_failed');
    // Only this private stdin/stdout control pipe carries credentials. Never persist this response.
    return { key, userId, cid: `betweener_connect:${ledger.callId}`, credentials: payload.credentials };
  }
  if (op === 'get') {
    const response = await get(); const session = response.call.session;
    return { callId: response.call.id, cid: response.call.cid, ended: !!response.call.ended_at, endedAt: response.call.ended_at ?? null,
      session: session ? { id: session.id, startedAt: session.started_at, endedAt: session.ended_at, timerEndsAt: session.timer_ends_at } : null,
      users: session?.participants?.map((participant) => participant.user.id) ?? [] };
  }
  if (op === 'end') { await get(); await call.end(); return { ack: true }; }
  if (op === 'cleanup') {
    const errors: string[] = [];
    let attemptReserved = false;
    for (let attempt = 0; attempt <= manifest.cleanup.cleanupOnlyRetryMaximum; attempt++) {
      try {
        const slot = await Deno.open(`${file}.cleanup-attempt-${attempt + 1}`, { write: true, createNew: true });
        await slot.write(new TextEncoder().encode(JSON.stringify({ approvalId: ledger.approvalId, at: new Date().toISOString() }))); slot.close();
        attemptReserved = true; break;
      } catch (error) { if (!(error instanceof Deno.errors.AlreadyExists)) throw error; }
    }
    if (!attemptReserved) throw new Error('cleanup_attempt_budget_consumed');
    // Prefix/ledger membership never substitutes for marker readback. Unknown ownership fails closed.
    if (ledger.callAttempted) {
      try { const response = await call.get(); if (!ownedCall(response, ledger)) throw new Error('call_ownership_mismatch');
        await call.end(); await task((await call.delete({ hard: true })).task_id);
      } catch (error) { if (!absent(error)) errors.push('owned_call_cleanup_failed'); }
    }
    if (ledger.usersAttempted) {
      try { const found = await users(); if (!found.every((user) => ownedUser(user, ledger))) throw new Error('user_ownership_mismatch');
        if (found.length) await task((await client.deleteUsers({ user_ids: found.map((user) => user.id), user: 'hard', messages: 'hard', conversations: 'hard' })).task_id);
      } catch { errors.push('owned_user_cleanup_failed'); }
    }
    let callAbsent = !ledger.callAttempted;
    try { await call.get(); callAbsent = false; } catch (error) { callAbsent = absent(error); }
    const usersAbsent = (await users()).length === 0;
    const afterHash = await digest((await client.video.listCallTypes()).call_types);
    const sharedUnchanged = !ledger.baselineHash || afterHash === ledger.baselineHash;
    if (!callAbsent || !usersAbsent || !sharedUnchanged) errors.push('cleanup_verification_failed');
    return { errors, callAbsent, usersAbsent, sharedUnchanged, afterHash };
  }
  throw new Error('unknown_provider_operation');
}
console.log(JSON.stringify({ ready: true, runtime: { deno: Deno.version.deno, serverSdk: '0.7.63' }, startupRequests: traffic }));
let buffer = '';
for await (const chunk of Deno.stdin.readable.pipeThrough(new TextDecoderStream())) {
  buffer += chunk;
  while (buffer.includes('\n')) {
    const index = buffer.indexOf('\n'); const line = buffer.slice(0, index); buffer = buffer.slice(index + 1);
    const request = JSON.parse(line); const started = tick(); const offset = traffic.length;
    try { const data = await command(request.op, request); console.log(JSON.stringify({ id: request.id, data,
      timing: { started, decodedResponseCompleted: tick(), requests: traffic.slice(offset), truncated: trafficTruncated } })); }
    catch (error) { console.log(JSON.stringify({ id: request.id, error: { ...safeError(error), stage: operationStage(request.op),
      diagnostic: projectDiagnostic((traffic.slice(offset).at(-1) as { diagnostic?: unknown } | undefined)?.diagnostic) ?? describeError(error),
      reason: error instanceof Error && /^[a-z][a-z0-9_]{0,80}$/.test(error.message) ? error.message : 'provider_operation_failed' },
      timing: { started, decodedResponseCompleted: tick(), requests: traffic.slice(offset), truncated: trafficTruncated } })); }
  }
}
