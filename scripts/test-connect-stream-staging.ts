// @ts-nocheck -- Real staging provider tests. Every adversarial request uses an ordinary user JWT.
import { digest, evidenceDirectory, isolatedCallTypes, requireCondition, safeError, stagingClient, verifyApp, writeEvidence } from './lib/connect-stream-audit.ts';
import { assertConnectCallType, createConnectStreamAdapter } from '../supabase/functions/_shared/connect-stream-adapter.ts';
import { reviewConnectStreamEvidence } from './lib/connect-stream-verdict.ts';

requireCondition(Deno.args.includes('--run-approved-isolated-tests'), 'explicit_test_argument_required');
const report = { timestamp: new Date().toISOString(), appId: 1731011, mode: 'ISOLATED_ORDINARY_USER_TESTS', cases: [], cleanup: [], result: 'IN_PROGRESS' };
let client; let key; let redact = () => 'provider_request_failed'; let manifest; let fixturesValidated = false;
let baselineHash;
const callPath = (id, type = 'betweener_connect') => `/api/v2/video/call/${type}/${id}`;
const timeClaims = () => ({ iat: Math.floor(Date.now() / 1000) - 30, exp: Math.floor(Date.now() / 1000) + 120 });
async function request(name, actor, method, path, body, options = {}) {
  const token = options.token ?? client.generateUserToken({ user_id: actor, ...timeClaims() });
  const url = new URL(path, 'https://video.stream-io-api.com');
  url.searchParams.set('api_key', key);
  url.searchParams.set('user_id', options.claimedUser ?? actor);
  const response = await fetch(url, { method, signal: AbortSignal.timeout(20000), headers: {
    Authorization: token, 'stream-auth-type': 'jwt', 'Content-Type': 'application/json',
    'X-Stream-Client': 'betweener-connect-security-audit/1.0', 'x-client-request-id': crypto.randomUUID(),
  }, body: method === 'GET' ? undefined : JSON.stringify(body ?? {}) });
  const payload = await response.json();
  const item = { name, actor: manifest.users.indexOf(actor), method, path, status: response.status,
    code: payload.code ?? null, message: response.ok ? undefined : redact(payload.message ?? 'provider_error'),
    capabilities: payload.own_capabilities, videoEnabled: payload.call?.settings?.video?.enabled,
    memberCount: payload.members?.length, endedAt: payload.call?.ended_at,
    receivedSfuCredentials: !!payload.credentials?.token };
  report.cases.push(item);
  await writeEvidence('provider-security-results.json', report);
  console.log(JSON.stringify(item));
  return { response, payload, item };
}
async function task(id, operation) {
  if (!id) return;
  for (let attempt = 0; attempt < 12; attempt++) {
    const response = await client.getTask({ id });
    if (response.status === 'completed') { report.cleanup.push({ operation, status: 'completed' }); return; }
    requireCondition(response.status !== 'failed', 'fixture_cleanup_task_failed');
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error('fixture_cleanup_task_timeout');
}
try {
  const staging = await stagingClient(); ({ client, key, redact } = staging);
  report.app = await verifyApp(client);
  assertConnectCallType(await client.video.getCallType({ name: 'betweener_connect' }));
  baselineHash = await digest(isolatedCallTypes((await client.video.listCallTypes()).call_types));
  // Reuse this manifest on retry: never grow the approved set of four identities/call IDs.
  try { manifest = JSON.parse(await Deno.readTextFile(new URL('provider-fixtures.json', evidenceDirectory))); }
  catch (error) { if (!(error instanceof Deno.errors.NotFound)) throw error; }
  if (!manifest) {
    const run = crypto.randomUUID();
    manifest = { appId: 1731011, users: ['a', 'b', 'c', 'setup'].map((name) => `betweener-connect-m2-test-${run}-${name}`),
      calls: ['accepted', 'terminal', 'arbitrary', 'live'].map((purpose) => ({ purpose, id: crypto.randomUUID(), type: purpose === 'live' ? 'betweener_live' : 'betweener_connect' })), cleaned: false };
    await writeEvidence('provider-fixtures.json', manifest);
  }
  requireCondition(manifest.appId === 1731011 && manifest.users.length === 4 && manifest.calls.length === 4
    && manifest.users.every((id) => /^betweener-connect-m2-test-[a-f0-9-]+-(a|b|c|setup)$/.test(id))
    && manifest.calls.every((call) => /^[a-f0-9-]{36}$/.test(call.id) && ['betweener_connect', 'betweener_live'].includes(call.type)), 'fixture_scope_invalid');
  fixturesValidated = true;
  if (manifest.cleaned) {
    const previous = JSON.parse(await Deno.readTextFile(new URL('provider-security-results.json', evidenceDirectory)));
    requireCondition((Deno.args.includes('--retry-fixture-setup') && previous.cases.length === 0)
      || Deno.args.includes('--repeat-same-approved-fixtures'), 'fixtures_already_cleaned_do_not_recreate');
    manifest.cleaned = false;
    await writeEvidence('provider-fixtures.json', manifest);
  }
  const [a, b, c, setup] = manifest.users;
  const [accepted, terminal, arbitrary, live] = manifest.calls;
  // These are newly generated fixtures only; no application roles on existing users are updated.
  const users = await client.upsertUsers(manifest.users.map((id) => ({ id, role: 'user', name: 'Connect M2 isolated fixture' })));
  report.fixtureApplicationRoles = Object.values(users.users).map((user) => user.role);
  requireCondition(report.fixtureApplicationRoles.length === 4 && report.fixtureApplicationRoles.every((role) => role === 'user'), 'fixture_application_roles_not_ordinary');
  const fixture = client.video.call('betweener_connect', accepted.id);
  const createFixture = (id, role, ring = false, type = 'betweener_connect') => client.video.call(type, id).getOrCreate({ ring, notify: false, data: {
    created_by_id: setup, members: [a, b].map((user_id) => ({ user_id, role })),
    custom: { betweener_connect_id: id, media: 'voice', isolated_security_fixture: true },
    settings_override: { video: { enabled: false, camera_default_on: false, target_resolution: { width: 640, height: 480, bitrate: 600000 } }, limits: { max_participants: 2 } },
  } });
  await createFixture(accepted.id, 'connect_invited');
  await request('A_arbitrary_create', c, 'POST', callPath(arbitrary.id), { data: { members: [{ user_id: c, role: 'connect_voice' }, { user_id: b, role: 'connect_voice' }] } });
  await request('B_unrelated_read', c, 'GET', callPath(accepted.id));
  await request('B_unrelated_join', c, 'POST', callPath(accepted.id) + '/join', { create: false, location: 'LHR' });
  await request('D_unmatched_ring_create', c, 'POST', callPath(arbitrary.id), { ring: true, notify: false, data: { members: [{ user_id: c }, { user_id: b }] } });
  await request('D_unrelated_existing_ring', c, 'POST', callPath(accepted.id) + '/ring', { members_ids: [b] });
  await request('control_invited_read', a, 'GET', callPath(accepted.id));
  await request('control_invited_cannot_join', a, 'POST', callPath(accepted.id) + '/join', { create: false, location: 'LHR' });
  const adapter = createConnectStreamAdapter(client, 1731011);
  const credentials = await adapter.credentials({ id: accepted.id, state: 'ACCEPTED', media: 'voice', ended_at: null, can_provision: false,
    caller_user_id: a, recipient_user_id: b, provider_session_id: null }, a);
  const heldToken = credentials.token;
  await request('control_voice_member_a', a, 'GET', callPath(accepted.id), undefined, { token: heldToken });
  await request('control_voice_member_b', b, 'GET', callPath(accepted.id));
  await request('control_voice_join_a', a, 'POST', callPath(accepted.id) + '/join', { create: false, location: 'LHR', video: false }, { token: heldToken });
  await request('control_voice_join_b', b, 'POST', callPath(accepted.id) + '/join', { create: false, location: 'LHR', video: false });
  await request('C_add_third_member', a, 'POST', callPath(accepted.id) + '/members', { update_members: [{ user_id: c, role: 'connect_voice' }] });
  await request('F_override_video_setting', a, 'PATCH', callPath(accepted.id), { settings_override: { video: { enabled: true,
    target_resolution: { width: 640, height: 480, bitrate: 600000 } } } });
  await request('F_join_with_video_flag', a, 'POST', callPath(accepted.id) + '/join', { create: false, location: 'LHR', video: true });
  await request('F_grant_self_video', a, 'POST', callPath(accepted.id) + '/user_permissions', { user_id: a, grant_permissions: ['send-video'] });
  await request('F_request_video', a, 'POST', callPath(accepted.id) + '/request_permission', { permissions: ['send-video'] });
  await request('F_request_screenshare', a, 'POST', callPath(accepted.id) + '/request_permission', { permissions: ['screenshare'] });
  await request('F_capabilities_after_request', a, 'GET', callPath(accepted.id));
  if (Deno.args.includes('--probe-sfu')) {
    const admission = await request('F_sfu_probe_admission', a, 'POST', callPath(accepted.id) + '/join', { create: false, location: 'LHR' });
    requireCondition(admission.response.ok, 'sfu_probe_admission_failed');
    const child = new Deno.Command('node', { args: ['scripts/lib/connect-stream-sfu-probe.cjs'], stdin: 'piped', stdout: 'piped', stderr: 'piped' }).spawn();
    const writer = child.stdin.getWriter();
    await writer.write(new TextEncoder().encode(JSON.stringify({ key, userId: a, cid: `betweener_connect:${accepted.id}`, credentials: admission.payload.credentials })));
    await writer.close();
    const output = await child.output();
    report.sfuProbe = JSON.parse(new TextDecoder().decode(output.stdout));
    console.log(JSON.stringify(report.sfuProbe));
  }
  await request('G_mismatched_query_identity', c, 'GET', callPath(accepted.id), undefined, { claimedUser: a });
  const own = client.generateUserToken({ user_id: c, ...timeClaims() });
  const parts = own.split('.');
  parts[1] = btoa(JSON.stringify({ ...JSON.parse(atob(parts[1].replaceAll('-', '+').replaceAll('_', '/'))), user_id: a })).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
  await request('G_tampered_signed_identity', a, 'GET', callPath(accepted.id), undefined, { token: parts.join('.') });
  await request('I_self_role_escalation', a, 'POST', callPath(accepted.id) + '/members', { update_members: [{ user_id: a, role: 'connect_video' }] });
  await request('I_update_settings', a, 'PATCH', callPath(accepted.id), { settings_override: { limits: { max_participants: 3 } } });
  await request('I_end_call', a, 'POST', callPath(accepted.id) + '/mark_ended');
  await request('I_start_recording', a, 'POST', callPath(accepted.id) + '/start_recording');
  await request('I_start_transcription', a, 'POST', callPath(accepted.id) + '/start_transcription');
  await request('I_start_broadcasting', a, 'POST', callPath(accepted.id) + '/start_broadcasting');
  await createFixture(live.id, 'call_member', false, 'betweener_live');
  const liveToken = client.generateCallToken({ user_id: c, call_cids: [`betweener_live:${live.id}`], ...timeClaims() });
  await request('J_valid_live_call_token_control', c, 'GET', callPath(live.id, 'betweener_live'), undefined, { token: liveToken });
  await request('J_live_call_token_connect_join', c, 'POST', callPath(accepted.id) + '/join', { create: false, location: 'LHR' }, { token: liveToken });
  await request('J_live_call_token_connect_create', c, 'POST', callPath(arbitrary.id), { data: { members: [{ user_id: c }, { user_id: b }] } }, { token: liveToken });
  // Revocation is staged explicitly: show the held token before and after provider cleanup ACK.
  await request('E_held_token_before_provider_cleanup', a, 'POST', callPath(accepted.id) + '/join', { create: false, location: 'LHR' }, { token: heldToken });
  await adapter.end({ id: accepted.id });
  await request('E_held_token_after_end_ack', a, 'POST', callPath(accepted.id) + '/join', { create: false, location: 'LHR' }, { token: heldToken });
  await fixture.updateCallMembers({ remove_members: [a, b] });
  await request('E_held_token_after_membership_removal', a, 'POST', callPath(accepted.id) + '/join', { create: false, location: 'LHR' }, { token: heldToken });
  await createFixture(terminal.id, 'connect_voice', true);
  await client.video.call('betweener_connect', terminal.id).end();
  await request('H_terminal_ringing_rejoin', a, 'POST', callPath(terminal.id) + '/join', { create: false, location: 'LHR' });
  await request('H_terminal_rering', a, 'POST', callPath(terminal.id) + '/ring', { members_ids: [b] });
  const final = await client.video.call('betweener_connect', terminal.id).get();
  report.terminalEndedPreserved = !!final.call.ended_at;
  report.result = 'EXECUTED_REQUIRES_SECURITY_REVIEW';
} catch (error) {
  report.failure = { ...safeError(error), message: redact(error?.message ?? 'provider_test_failed') };
  report.result = 'BLOCKED';
} finally {
  if (client && manifest && fixturesValidated && !manifest.cleaned) {
    for (const fixture of manifest.calls) {
      try {
        const call = client.video.call(fixture.type, fixture.id);
        try { await call.end(); } catch (error) { if (![4, 16].includes(Number(error.code))) throw error; }
        try { await task((await call.delete({ hard: true })).task_id, `delete_${fixture.purpose}_call`); }
        catch (error) { if (![4, 16].includes(Number(error.code))) throw error; }
        report.cleanup.push({ operation: `remove_${fixture.purpose}_call`, status: 'requested' });
      } catch (error) { report.cleanup.push({ operation: `remove_${fixture.purpose}_call`, ...safeError(error), message: redact(error.message) }); }
    }
    try {
      await task((await client.deleteUsers({ user_ids: manifest.users, user: 'hard', messages: 'hard', conversations: 'hard', calls: 'hard' })).task_id, 'delete_fixture_users');
      const remaining = await client.queryUsers({ payload: { filter_conditions: { id: { $in: manifest.users } } } });
      report.remainingFixtureUsers = remaining.users.length;
      report.remainingFixtureCalls = [];
      for (const fixture of manifest.calls) {
        try { const response = await client.video.call(fixture.type, fixture.id).get(); report.remainingFixtureCalls.push({ purpose: fixture.purpose, exists: true, deleted: !!response.call.deleted_at }); }
        catch (error) {
          const failure = safeError(error);
          report.remainingFixtureCalls.push({ purpose: fixture.purpose, exists: failure.status === 404 && failure.code === 16 ? false : null, ...failure });
        }
      }
      manifest.cleaned = report.remainingFixtureUsers === 0 && report.remainingFixtureCalls.every((call) => call.exists === false || call.deleted === true);
      await writeEvidence('provider-fixtures.json', manifest);
    } catch (error) { report.cleanup.push({ operation: 'delete_fixture_users', ...safeError(error), message: redact(error.message) }); }
    try {
      report.existingTypesUnchanged = baselineHash === await digest(isolatedCallTypes((await client.video.listCallTypes()).call_types));
      report.globalChecksEnabled = !!await verifyApp(client);
    } catch (error) { report.cleanup.push({ operation: 'isolation_readback', ...safeError(error) }); }
  }
  report.review = reviewConnectStreamEvidence(report);
  if (!report.failure) report.result = report.review.result;
  await writeEvidence('provider-security-results.json', report);
  await writeEvidence(`provider-security-${report.timestamp.replaceAll(':', '-')}.json`, report);
  console.log(JSON.stringify({ result: report.result, count: report.cases.length, failure: report.failure, cleanup: report.cleanup,
    remainingFixtureUsers: report.remainingFixtureUsers, remainingFixtureCalls: report.remainingFixtureCalls,
    existingTypesUnchanged: report.existingTypesUnchanged, globalChecksEnabled: report.globalChecksEnabled }));
}
if (report.result !== 'PASS' || !manifest?.cleaned) Deno.exit(1);
