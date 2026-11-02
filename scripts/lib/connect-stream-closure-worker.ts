// @ts-nocheck -- Deno fixture process; credentials never cross the JSON control pipe.
import { stagingClient, digest, requireCondition, safeError, verifyApp } from './connect-stream-audit.ts';
import { createConnectStreamAdapter, assertConnectCallType } from '../../supabase/functions/_shared/connect-stream-adapter.ts';
import { assertConnectJobAcknowledged, runConnectProviderJob } from '../../supabase/functions/_shared/connect-provider-worker.ts';
import { revokeConnectConsent } from '../../supabase/functions/_shared/connect-consent-revocation.ts';
import { issueConnectCredentials } from '../../supabase/functions/_shared/connect-credential-issuance.ts';

const emit = (message) => console.log(JSON.stringify(message));
const { client, key, redact } = await stagingClient();
assertConnectCallType(await client.video.getCallType({ name: 'betweener_connect' }));
const baseline = await digest((await client.video.listCallTypes()).call_types);
let fixtures; let outage = false; let pauseCreate = false; let resume; let approvedTimer = false;
const tokens = new Map(); const media = new Map(); const waiting = new Map();
let sequence = 0;
const rpc = (name, args = {}) => new Promise((resolve, reject) => {
  const id = ++sequence; waiting.set(id, { resolve, reject }); emit({ rpc: id, name, args });
});
const persist = async () => {
  const path = fixtures.boundary ? 'tmp/connect-boundary' : 'tmp/connect-m2a';
  await Deno.mkdir(path, { recursive: true });
  await Deno.writeTextFile(`${path}/${fixtures.boundary ? 'boundary' : fixtures.videoOnly ? 'video-positive' : 'integrated'}-fixtures.json`, JSON.stringify(fixtures));
};
const scopedCall = (type, id) => {
  requireCondition(type === 'betweener_connect' && /^[0-9a-f-]{36}$/.test(id), 'fixture_scope_invalid');
  const call = client.video.call(type, id);
  return {
    get: () => call.get(), updateCallMembers: (args) => call.updateCallMembers(args),
    end: async () => { requireCondition(fixtures.calls.includes(id), 'fixture_scope_invalid'); if (outage) throw new Error('injected_provider_outage'); return await call.end(); },
    getOrCreate: async (args) => {
      if (fixtures.videoOnly) requireCondition(args.data.custom.media === 'video', 'fixture_media_invalid');
      if (fixtures.boundary) requireCondition(args.data.custom.media === 'voice', 'fixture_media_invalid');
      if (!fixtures.calls.includes(id)) { requireCondition(fixtures.calls.length < (fixtures.boundary ? 3 : fixtures.videoOnly ? 1 : 4), 'fixture_limit'); fixtures.calls.push(id); await persist(); }
      if (fixtures.boundary && approvedTimer && !fixtures.timerCalls.includes(id)) {
        requireCondition(fixtures.timerCalls.length < 2, 'fixture_timer_limit'); fixtures.timerCalls.push(id); await persist();
      }
      const result = await call.getOrCreate({ ...args, ...(fixtures.videoOnly || fixtures.boundary ? { ring: false, notify: false } : {}), data: {
        ...args.data, created_by_id: fixtures.users[2], custom: { ...args.data.custom, isolated_security_fixture: true },
        ...(fixtures.boundary && approvedTimer ? { settings_override: { ...args.data.settings_override,
          limits: { max_participants: 2, max_duration_seconds: 60 } } } : {}),
        ...(fixtures.videoOnly ? { settings_override: { ...args.data.settings_override,
          video: { ...args.data.settings_override.video, access_request_enabled: false },
          screensharing: { enabled: false, access_request_enabled: false } } } : {}),
      } });
      if (pauseCreate) { emit({ event: 'created_before_database_ack', id }); await new Promise((resolve) => { resume = resolve; }); }
      return result;
    },
  };
};
const adapter = createConnectStreamAdapter({
  getApp: () => client.getApp(), video: { getCallType: (args) => client.video.getCallType(args), call: scopedCall },
  // The isolated creator substitutes for the fixed production system user only.
  upsertUsers: (users) => client.upsertUsers(users.filter((user) => user.id !== 'betweener-connect-system').map((user) => {
    requireCondition(fixtures.users.includes(user.id), 'fixture_scope_invalid'); return user;
  })), generateUserToken: (args) => client.generateUserToken(args),
}, 1731011);
const store = {
  snapshot: (id) => rpc('snapshot', { id }),
  complete: async (job, success) => { assertConnectJobAcknowledged((await rpc('complete', { job, success }))?.ack); },
  reconcile: (id, evidence) => rpc('reconcile', { id, evidence }),
  revoke: (grant) => rpc('revoke', { grant }), claimEnd: (id) => rpc('claimEnd', { id }),
};
async function task(id) {
  if (!id) return;
  for (let n = 0; n < 20; n++) {
    const result = await client.getTask({ id }); if (result.status === 'completed') return;
    requireCondition(result.status !== 'failed', 'cleanup_failed'); await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error('cleanup_timeout');
}
async function command(message) {
  const { op, args = {} } = message;
  if (op === 'setup') {
    requireCondition(args.users.length === 3 && args.users.every((id) => /^f0110000-0000-4000-8000-00000000000[789]$/.test(id)), 'fixture_scope_invalid');
    const existing = await client.queryUsers({ payload: { filter_conditions: { id: { $in: args.users } } } });
    requireCondition(existing.users.length === 0, 'fixture_users_already_exist_stop');
    requireCondition(!(args.videoOnly && args.boundary), 'fixture_scope_invalid');
    if (args.boundary) requireCondition(baseline === '12e74f5fca79a1dea2b48a8c950bbc3a2189a3ffdf9e04ccb43d28c4e4533a7e', 'fixture_policy_baseline_changed_stop');
    fixtures = { appId: 1731011, users: args.users, calls: [], timerCalls: [], cleaned: false, videoOnly: args.videoOnly === true, boundary: args.boundary === true }; await persist();
    await client.upsertUsers(args.users.map((id) => ({ id, role: 'user', name: 'M2A isolated consent verification' })));
    return { app: await verifyApp(client), users: 3 };
  }
  if (op === 'job') {
    requireCondition(!args.approvedTimer || fixtures.boundary, 'fixture_timer_scope_invalid');
    approvedTimer = !!args.approvedTimer; outage = !!args.outage; pauseCreate = !!args.pauseCreate;
    return await runConnectProviderJob(args.job, store, adapter);
  }
  if (op === 'revoke') { outage = !!args.outage; return await revokeConnectConsent(args.grant, store, adapter); }
  if (op === 'credentials') {
    const credentials = await issueConnectCredentials({
      admit: () => rpc('admission', { id: args.id, user: args.user, device: args.device }),
      snapshot: () => store.snapshot(args.id), issue: (snapshot, userId) => adapter.credentials(snapshot, userId),
    }, args.user, args.id);
    const handle = crypto.randomUUID(); tokens.set(handle, { ...credentials, userId: args.user }); return { handle };
  }
  if (op === 'join') {
    const credentials = tokens.get(args.handle); requireCondition(credentials, 'fixture_token_missing');
    const url = new URL(`https://video.stream-io-api.com/api/v2/video/call/betweener_connect/${credentials.call.id}/join`);
    url.searchParams.set('api_key', key); url.searchParams.set('user_id', credentials.userId);
    const response = await fetch(url, { method: 'POST', headers: { Authorization: credentials.token, 'stream-auth-type': 'jwt', 'Content-Type': 'application/json' },
      body: JSON.stringify({ create: false, location: 'LHR' }), signal: AbortSignal.timeout(15000) });
    const body = await response.json();
    if (response.ok) credentials.sfu = body.credentials;
    return { status: response.status, code: body.code ?? null, capabilities: body.own_capabilities };
  }
  if (op === 'mediaOpen') {
    const credentials = tokens.get(args.handle); requireCondition(credentials?.sfu, 'fixture_token_missing');
    const child = new Deno.Command('node', { args: ['scripts/lib/connect-stream-sfu-probe.cjs', '--hold'], stdin: 'piped', stdout: 'piped', stderr: 'piped' }).spawn();
    const writer = child.stdin.getWriter(); const reader = child.stdout.pipeThrough(new TextDecoderStream()).getReader(); let buffered = '';
    const next = async () => {
      while (!buffered.includes('\n')) { const item = await reader.read(); requireCondition(!item.done, 'sfu_process_closed'); buffered += item.value; }
      const index = buffered.indexOf('\n'); const line = buffered.slice(0, index); buffered = buffered.slice(index + 1); return JSON.parse(line);
    };
    await writer.write(new TextEncoder().encode(JSON.stringify({ key, userId: credentials.userId, cid: credentials.call.cid, credentials: credentials.sfu, audioOnly: fixtures.boundary }) + '\n'));
    const result = await next(); media.set(args.handle, { writer, reader, child, next, user: credentials.userId, sessionId: result.sessionId }); return result;
  }
  if (op === 'mediaStats') {
    const session = media.get(args.handle); requireCondition(session, 'sfu_process_missing');
    await session.writer.write(new TextEncoder().encode(JSON.stringify({ op: 'stats', id: ++sequence }) + '\n')); return await session.next();
  }
  if (op === 'mediaSubscribe') {
    const session = media.get(args.handle);
    requireCondition(fixtures.boundary && session && fixtures.users.slice(0, 2).includes(args.user), 'fixture_scope_invalid');
    requireCondition([...media.values()].some((peer) => peer.user === args.user && peer.sessionId === args.session), 'fixture_peer_invalid');
    await session.writer.write(new TextEncoder().encode(JSON.stringify({ op: 'subscribe', id: ++sequence,
      peer: { userId: args.user, sessionId: args.session } }) + '\n')); return await session.next();
  }
  if (op === 'mediaClose') {
    const session = media.get(args.handle); if (!session) return {};
    await session.writer.write(new TextEncoder().encode('{"op":"close"}\n')); await session.writer.close();
    await session.child.status; media.delete(args.handle); return { closed: true };
  }
  if (op === 'providerGet') {
    requireCondition(fixtures.calls.includes(args.id), 'fixture_scope_invalid');
    const response = await client.video.call('betweener_connect', args.id).get();
    return { ended: !!response.call.ended_at, sessionEnded: !!response.call.session?.ended_at,
      users: response.call.session?.participants?.map((item) => item.user.id) ?? [],
      endedAt: response.call.ended_at ?? null, session: response.call.session ? { id: response.call.session.id,
        startedAt: response.call.session.started_at, timerEndsAt: response.call.session.timer_ends_at,
        endedAt: response.call.session.ended_at } : null, limits: response.call.settings.limits };
  }
  if (op === 'boundaryMint') {
    requireCondition(fixtures.boundary && fixtures.calls.includes(args.id) && fixtures.users.slice(0, 2).includes(args.user), 'fixture_scope_invalid');
    const now = Math.floor(Date.now() / 1000); const handle = crypto.randomUUID();
    const token = client.generateUserToken({ user_id: args.user, iat: now - 1, exp: now + 120, jti: crypto.randomUUID() });
    const old = tokens.get(args.held);
    tokens.set(handle, { token, userId: args.user, call: { id: args.id, cid: `betweener_connect:${args.id}` } });
    return { handle, issuedAt: new Date().toISOString(), distinctFromHeld: !!old && old.token !== token };
  }
  if (op === 'boundaryProbe') {
    const credentials = tokens.get(args.handle);
    requireCondition(fixtures.boundary && credentials && fixtures.calls.includes(credentials.call.id), 'fixture_scope_invalid');
    const actions = {
      read: ['GET', '', null], recreate: ['POST', '', { ring: false, notify: false, data: { members: fixtures.users.slice(0, 2).map((user_id) => ({ user_id })) } }],
      extend: ['PATCH', '', { settings_override: { limits: { max_duration_seconds: 120 } } }],
      disableTimer: ['PATCH', '', { settings_override: { limits: { max_duration_seconds: 0 } } }],
    };
    const action = actions[args.action]; requireCondition(action, 'fixture_action_invalid');
    const [method, suffix, body] = action;
    const url = new URL(`/api/v2/video/call/betweener_connect/${credentials.call.id}${suffix}`, 'https://video.stream-io-api.com');
    url.searchParams.set('api_key', key); url.searchParams.set('user_id', credentials.userId);
    const response = await fetch(url, { method, headers: { Authorization: credentials.token, 'stream-auth-type': 'jwt', 'Content-Type': 'application/json' },
      ...(method === 'GET' ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(15000) });
    const payload = await response.json();
    return { status: response.status, code: payload.code ?? null, capabilities: payload.own_capabilities,
      ended: !!payload.call?.ended_at, limits: payload.call?.settings?.limits };
  }
  if (op === 'videoPolicy') {
    requireCondition(fixtures.videoOnly && fixtures.calls.includes(args.id), 'fixture_scope_invalid');
    const response = await client.video.call('betweener_connect', args.id).get();
    const users = await client.queryUsers({ payload: { filter_conditions: { id: { $in: fixtures.users } } } });
    return { settings: response.call.settings, custom: response.call.custom,
      members: response.members.map((member) => ({ user: member.user_id ?? member.user?.id, role: member.role })),
      userRoles: users.users.map((user) => ({ id: user.id, role: user.role })) };
  }
  if (op === 'videoPrivileges') {
    const credentials = tokens.get(args.handle);
    requireCondition(fixtures.videoOnly && credentials && fixtures.calls.includes(credentials.call.id), 'fixture_scope_invalid');
    const path = `/api/v2/video/call/betweener_connect/${credentials.call.id}`;
    const cases = [
      ['add_third_member', 'POST', '/members', { update_members: [{ user_id: fixtures.users[2], role: 'connect_video' }] }],
      ['self_admin_role', 'POST', '/members', { update_members: [{ user_id: credentials.userId, role: 'admin' }] }],
      ['grant_screenshare', 'POST', '/user_permissions', { user_id: credentials.userId, grant_permissions: ['screenshare'] }],
      ['enable_screenshare', 'PATCH', '', { settings_override: { screensharing: { enabled: true } } }],
      ['start_recording', 'POST', '/start_recording', {}],
      ['start_transcription', 'POST', '/start_transcription', {}],
      ['start_broadcasting', 'POST', '/start_broadcasting', {}],
      ['end_call', 'POST', '/mark_ended', {}],
      ['capabilities_after_attempts', 'GET', '', null],
    ];
    const results = [];
    for (const [name, method, suffix, body] of cases) {
      const url = new URL(path + suffix, 'https://video.stream-io-api.com');
      url.searchParams.set('api_key', key); url.searchParams.set('user_id', credentials.userId);
      const response = await fetch(url, { method, signal: AbortSignal.timeout(15000),
        headers: { Authorization: credentials.token, 'stream-auth-type': 'jwt', 'Content-Type': 'application/json' },
        ...(method === 'GET' ? {} : { body: JSON.stringify(body) }) });
      const payload = await response.json();
      results.push({ name, status: response.status, code: payload.code ?? null, capabilities: payload.own_capabilities });
    }
    return results;
  }
  if (op === 'cleanup') {
    if (!fixtures) return { cleaned: true, preflightAborted: true, usersRemaining: null, calls: [],
      unchangedCallTypes: baseline === await digest((await client.video.listCallTypes()).call_types) };
    for (const handle of media.keys()) await command({ op: 'mediaClose', args: { handle } });
    for (const id of fixtures.calls) {
      const call = client.video.call('betweener_connect', id); await call.end(); await task((await call.delete({ hard: true })).task_id);
    }
    await task((await client.deleteUsers({ user_ids: fixtures.users, user: 'hard', conversations: 'hard', messages: 'hard', calls: 'hard' })).task_id);
    const remaining = (await client.queryUsers({ payload: { filter_conditions: { id: { $in: fixtures.users } } } })).users.length;
    const calls = [];
    for (const id of fixtures.calls) { try { await client.video.call('betweener_connect', id).get(); calls.push({ exists: true }); } catch (error) { calls.push(safeError(error)); } }
    fixtures.cleaned = remaining === 0 && calls.every((item) => item.status === 404 && item.code === 16); await persist();
    const after = await digest((await client.video.listCallTypes()).call_types);
    return { usersRemaining: remaining, calls, unchangedCallTypes: baseline === after, callTypesBefore: baseline, callTypesAfter: after,
      app: await verifyApp(client), cleaned: fixtures.cleaned };
  }
  throw new Error('unknown_fixture_command');
}
emit({ event: 'ready' });
let buffer = '';
for await (const chunk of Deno.stdin.readable.pipeThrough(new TextDecoderStream())) {
  buffer += chunk;
  while (buffer.includes('\n')) {
    const index = buffer.indexOf('\n'); const input = JSON.parse(buffer.slice(0, index)); buffer = buffer.slice(index + 1);
    if (input.rpcResult) { const pending = waiting.get(input.rpcResult); waiting.delete(input.rpcResult); if (input.error) pending.reject(new Error('local_rpc_rejected')); else pending.resolve(input.data); }
    else if (input.op === 'resume') { pauseCreate = false; resume?.(); }
    else void command(input).then((data) => emit({ id: input.id, data })).catch((error) => emit({ id: input.id, error: { ...safeError(error), reason: redact(error.message) } }));
  }
}
