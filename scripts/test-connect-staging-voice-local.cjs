// Real disposable SQL/REST authority; provider observations are synthetic. No hosted access.
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { withConnectDatabase } = require('./lib/connect-test-database.cjs');
const { baseline } = require('./lib/connect-push-rehearsal/baseline.cjs');
const { runConnectProviderJob, assertConnectJobAcknowledged } = require('../supabase/functions/_shared/connect-provider-worker.ts');
const { issueConnectCredentials } = require('../supabase/functions/_shared/connect-credential-issuance.ts');
const user = n => `f0110000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const profile = n => `f0120000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const quote = v => `'${String(v).replaceAll("'", "''")}'`;
const scalar = value => value.split(/\r?\n/).filter(x => x && !['BEGIN', 'COMMIT', 'SET'].includes(x)).at(-1);
const receipt = { reconstructed: [] }; let passed = 0;
withConnectDatabase(async ({ sql, file, http }) => {
  for (const name of ['20261031035826_connect_end_block_local_foundation', '20261031191352_connect_m3_1_intent_and_notifications', '20261101060133_connect_staging_tester_scope']) sql(file(`supabase/migrations/${name}.sql`));
  sql(file('supabase/tests/fixtures/connect_v1.sql'));
  // Pair 3/4 intentionally models an accepted legacy match with no mutual proof.
  sql(`delete from private.connect_preferences where user_id in (${quote(user(3))},${quote(user(4))});
    update private.connect_config set environment='staging',enabled=true,voice_enabled=true,provider_ready=true,
    staging_open_testing=true,staging_calls_remaining=3; notify pgrst,'reload schema'`);
  await new Promise(resolve => setTimeout(resolve, 400));
  const rpc = async (who, name, args = {}) => {
    const response = await http(user(who), 'rpc/' + name, args), body = await response.text(), data = body ? JSON.parse(body) : null;
    if (!response.ok) throw new Error(data.message || 'local_rpc_failed');
    return data;
  };
  const service = command => JSON.parse(scalar(sql(`begin;set local role service_role;set local request.jwt.claim.role='service_role';select jsonb_build_object('value',public.${command});commit;`))).value;
  const snapshot = id => service(`rpc_connect_worker_snapshot(${quote(id)})`);
  const check = async (name, run) => { await run(); passed++; console.log('ok - ' + name); };
  const eligibility = who => rpc(who, 'rpc_connect_check_eligibility', { p_peer: profile(who === 3 ? 4 : 3), p_media: 'voice', p_authorization: 'matched', p_grant: null });
  const provider = { async provision() {}, async end({ id }) { return { type: 'betweener_connect', id, outcome: 'accepted', mediaEnforcement: 'unverified' }; },
    async media(s) { return { session: 'local-only-session', users: [s.caller_user_id, s.recipient_user_id], callEnded: false, sessionEnded: false, missing: false }; } };
  const store = { snapshot: async id => snapshot(id), complete: async (j, success) => assertConnectJobAcknowledged(service(`rpc_connect_complete_job(${quote(j.call_id)},${quote(j.operation)},${quote(j.lease)},${success})`)),
    reconcile: async (id, m) => { service(`rpc_connect_reconcile_media(${quote(id)},${m.session ? quote(m.session) : 'null'},array[${m.users.map(quote).join(',')}]::uuid[],${m.ended})`); } };
  const pump = async () => { const job = service('rpc_connect_claim_job()'); assert.ok(job); return runConnectProviderJob(job, store, provider); };
  await check('old accepted label and absent voice preferences deny calling', async () => {
    assert.equal(await eligibility(3), false); assert.equal(await rpc(3, 'rpc_is_relationship_mutually_verified', { p_peer_profile_id: profile(4) }), false);
    assert.deepEqual(await rpc(3, 'rpc_connect_get_preferences'), { voice: false, video: false });
  });
  await check('each authenticated participant explicitly reconfirms; one decision is insufficient', async () => {
    assert.equal(await rpc(3, 'rpc_reconfirm_relationship', { p_peer_profile_id: profile(4) }), false);
    assert.equal(await eligibility(3), false);
    assert.equal(await rpc(4, 'rpc_reconfirm_relationship', { p_peer_profile_id: profile(3) }), true);
    assert.equal(await eligibility(3), false);
  });
  await check('each account opts into voice; video authority remains off', async () => {
    for (const who of [3, 4]) await rpc(who, 'rpc_connect_set_preferences', { p_voice: true, p_video: false });
    assert.equal(await eligibility(3), true); assert.equal(await eligibility(4), true);
  });
  let call; const deviceA = randomUUID(), deviceB = randomUUID();
  await check('create and worker provisioning reach ringing with no pre-answer credentials', async () => {
    call = await rpc(3, 'rpc_connect_create_call', { p_peer: profile(4), p_media: 'voice', p_authorization: 'matched', p_key: randomUUID(), p_device: deviceA, p_grant: null });
    assert.equal(call.state, 'REQUESTED'); assert.equal(sql('select staging_calls_remaining from private.connect_config'), '2');
    assert.equal((await pump()).success, true); call = await rpc(4, 'rpc_connect_get_call', { p_call: call.id }); assert.equal(call.state, 'RINGING');
  });
  const issue = (who, device) => issueConnectCredentials({ admit: () => rpc(who, 'rpc_connect_admission', { p_call: call.id, p_device: device }), snapshot: async () => snapshot(call.id),
    issue: async s => ({ token: 'synthetic-not-a-provider-token', expiresAt: new Date(Date.now() + 120000).toISOString(), call: { type: 'betweener_connect', id: s.id, cid: `betweener_connect:${s.id}` } }) }, user(who), call.id);
  await check('only recipient acceptance admits both bound devices and provider observation marks active', async () => {
    await assert.rejects(issue(3, deviceA));
    await assert.rejects(rpc(3, 'rpc_connect_act', { p_call: call.id, p_action: 'accept', p_version: call.version, p_device: deviceA }));
    call = await rpc(4, 'rpc_connect_act', { p_call: call.id, p_action: 'accept', p_version: call.version, p_device: deviceB });
    assert.equal((await issue(3, deviceA)).media, 'voice'); assert.equal((await issue(4, deviceB)).media, 'voice');
    assert.equal((await pump()).success, true); call = await rpc(3, 'rpc_connect_get_call', { p_call: call.id }); assert.equal(call.state, 'ACTIVE');
  });
  await check('ordinary End keeps durable cleanup then settles terminal state and occupancy', async () => {
    const ended = await rpc(3, 'rpc_connect_act', { p_call: call.id, p_action: 'end', p_version: call.version, p_device: deviceA }); assert.equal(ended.state, 'ENDING');
    assert.equal(sql(`select count(*) from private.connect_provider_jobs where call_id=${quote(call.id)} and operation='end' and status='pending'`), '1');
    assert.equal((await pump()).success, true);
    assert.equal((await rpc(4, 'rpc_connect_get_call', { p_call: call.id })).state, 'ENDED');
    assert.equal(sql('select count(*) from private.connect_occupancy'), '0'); await assert.rejects(issue(3, deviceA));
  });
}, { prepareBaseline: baseline(receipt) }).then(() => console.log(JSON.stringify({ passed, failed: 0, hosted: false, realMedia: false })))
  .catch(error => {
    const message = String(error.message);
    console.error(/PGRST_|POSTGRES_PASSWORD/.test(message) ? 'Local container startup failed; connection details withheld.' : message.slice(0, 1800));
    process.exitCode = 1;
  });
