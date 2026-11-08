// Synthetic data in a disposable PostgreSQL/REST clone. No environment loading.
const assert = require('node:assert/strict'), { randomUUID } = require('node:crypto');
const { withConnectDatabase } = require('./lib/connect-test-database.cjs');
const u = n => `f0110000-0000-4000-8000-${String(n).padStart(12, '0')}`, p = n => `f0120000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const q = value => `'${String(value).replaceAll("'", "''")}'`;
const parse = text => JSON.parse(text.split(/\r?\n/).findLast(line => line.startsWith('{') || line === 'true' || line === 'false'));
let passed = 0;
withConnectDatabase(async ({ sql, file, concurrent, http }) => {
  if (sql("select to_regclass('public.live_notification_campaigns') is not null") === 'f') sql(file('supabase/migrations/20260913200000_live_notification_campaigns.sql'));
  if (sql("select to_regclass('private.push_notification_events') is not null") === 'f') {
    for (const name of ['20260914123000_push_notification_event_security', '20260914124000_push_notification_delivery_reservations',
      '20260914125000_push_notification_dispatch_reliability', '20260914126000_push_notification_atomic_rate_limits', '20260914127000_push_notification_expiry_lifecycle']) sql(file(`supabase/migrations/${name}.sql`));
  }
  // Provenance migration checks this retained staging identity. Dispatch is
  // replaced below before fixtures; no HTTP dispatch function is invoked.
  sql("insert into private.push_config(id,webhook_url) values(1,'https://xsgzxadwuxuziubglvps.supabase.co/functions/v1/push-notifications') on conflict(id) do update set webhook_url=excluded.webhook_url");
  if (sql("select exists(select 1 from information_schema.columns where table_schema='public' and table_name='push_tokens' and column_name='installation_id')") === 'f') sql(file('supabase/migrations/20261006150000_push_environment_provenance_hardening.sql'));
  sql(file('supabase/migrations/20261006170000_update_staging_push_eas_project_identity.sql'));
  sql('create or replace function private.dispatch_push_notification_event_v1(p_event_id uuid) returns boolean language sql as $$select false$$');
  for (const name of ['20261031035826_connect_end_block_local_foundation', '20261031191352_connect_m3_1_intent_and_notifications',
    '20261101060133_connect_staging_tester_scope', '20261102165936_connect_staging_video_testing', '20261103150558_connect_secure_calling']) sql(file(`supabase/migrations/${name}.sql`));
  sql(file('supabase/tests/fixtures/connect_v1.sql'));
  const auth = (n, command) => `begin; set local statement_timeout='15s'; set local role authenticated; select set_config('request.jwt.claim.sub',${q(u(n))},true); ${command}; commit;`;
  const run = (n, command) => sql(auth(n, command));
  const check = async (name, execute) => { await execute(); passed++; console.log(`ok - ${name}`); };
  const device = [randomUUID(), randomUUID()];
  const register = (n, publicKey = String(n).repeat(64)) => run(n, `select public.rpc_connect_register_secure_device(${q(device[n - 1])},${q(publicKey)})`);
  await check('new capabilities default off and production cannot enable them', () => {
    assert.deepEqual(parse(run(1, 'select public.rpc_connect_security_capabilities()')), { e2ee: false, native_incoming: false });
    assert.throws(() => register(1), /connect_disabled/);
    assert.throws(() => sql("update private.connect_config set environment='production',native_incoming_enabled=true"), /connect_secure_calling_environment/);
  });
  await check('no direct table access or anonymous privileged RPC access', async () => {
    assert.throws(() => sql('set role authenticated; select * from private.connect_secure_devices'), /permission denied/);
    assert.throws(() => sql('set role authenticated; select * from private.connect_key_envelopes'), /permission denied/);
    assert.throws(() => sql('set role anon; select public.rpc_connect_security_capabilities()'), /permission denied/);
    const response = await http(u(1), 'connect_key_envelopes', undefined, 'GET'); assert.notEqual(response.status, 200);
  });
  sql("update private.connect_config set environment='local',enabled=true,provider_ready=true,voice_enabled=true,e2ee_enabled=true,native_incoming_enabled=true");
  await check('unregistered devices cannot create encrypted calls', () => {
    assert.throws(() => run(1, `select public.rpc_connect_create_call(${q(p(2))},'voice','matched',${q(randomUUID())},${q(device[0])},null)`), /connect_encryption_unavailable/);
  });
  await check('device registration is owner-bound, idempotent and refuses replacement', () => {
    register(1); register(1); register(2);
    assert.throws(() => register(1, 'a'.repeat(64)), /connect_device_key_changed/);
    assert.throws(() => run(1, `select public.rpc_connect_register_secure_device(${q(randomUUID())},'bad')`), /connect_invalid_input/);
  });
  await check('matching and recipient voice consent remain independent', () => {
    assert.throws(() => run(3, `select public.rpc_connect_create_call(${q(p(4))},'voice','matched',${q(randomUUID())},${q(randomUUID())},null)`), /connect_(unavailable|consent_required|encryption_unavailable)/);
    sql(`update private.connect_preferences set voice=false where user_id=${q(u(2))}`);
    assert.throws(() => run(1, `select public.rpc_connect_create_call(${q(p(2))},'voice','matched',${q(randomUUID())},${q(device[0])},null)`), /connect_(unavailable|consent_required)/);
    sql(`update private.connect_preferences set voice=true where user_id=${q(u(2))}`);
  });
  await check('identity review exposes only an eligible peer public device set',()=>{
    const own=parse(run(1,`select public.rpc_connect_peer_key_context(${q(p(2))},'voice','matched',null)`));
    const peer=parse(run(2,`select public.rpc_connect_peer_key_context(${q(p(1))},'voice','matched',null)`));
    assert.deepEqual(own.devices,peer.devices);assert.equal(own.devices.length,2);
    assert.throws(()=>run(3,`select public.rpc_connect_peer_key_context(${q(p(2))},'voice','matched',null)`),/connect_unavailable/);
  });
  let call;
  await check('actual create RPC pins encryption and native incoming without client claims', () => {
    call = parse(run(1, `select public.rpc_connect_create_call(${q(p(2))},'voice','matched',${q(randomUUID())},${q(device[0])},null)`));
    assert.equal(call.encryption_required, true); assert.equal(call.native_incoming, true);
    sql(`select private.connect_transition(${q(call.id)},'RINGING')`);
  });
  const context = n => parse(run(n, `select public.rpc_connect_key_context(${q(call.id)},${q(device[n - 1])})`));
  await check('context checks participants and exposes public keys with no plaintext media key', () => {
    assert.equal(context(1).devices.length, 2); assert.deepEqual(context(2).envelopes, []);
    assert.throws(() => run(3, `select public.rpc_connect_key_context(${q(call.id)},${q(device[0])})`), /connect_unavailable/);
  });
  const fresh = parse(run(2, `select public.rpc_connect_get_call(${q(call.id)})`));
  run(2, `select public.rpc_connect_act(${q(call.id)},'accept',${fresh.version},${q(device[1])})`);
  await check('secure credential admission refuses a device without its key envelope', () => {
    assert.throws(() => run(2, `select public.rpc_connect_secure_admission(${q(call.id)},${q(device[1])})`), /connect_encryption_unavailable/);
  });
  const envelopes = [1, 2].map(n => ({ user_id: u(n), device_id: device[n - 1], nonce: '1'.repeat(48), ciphertext: String(n).repeat(128) }));
  const publish = (n, generation = call.created_at, values = envelopes) => `select public.rpc_connect_publish_key_envelopes(${q(call.id)},${q(device[n - 1])},${q(generation)},${q(JSON.stringify(values))}::jsonb)`;
  await check('recipient, stale generation and malformed batches cannot publish', () => {
    assert.throws(() => run(2, publish(2)), /connect_unavailable/);
    assert.throws(() => run(1, publish(1, '2000-01-01T00:00:00Z')), /connect_unavailable/);
    assert.throws(() => run(1, publish(1, call.created_at, [envelopes[0], envelopes[0]])), /connect_invalid_input/);
    assert.throws(() => run(1, publish(1, call.created_at, [{ ...envelopes[0], nonce: 'bad' }, envelopes[1]])), /constraint/);
  });
  await check('concurrent publishers commit one atomic envelope batch', async () => {
    const results = await Promise.all([concurrent(auth(1, publish(1))), concurrent(auth(1, publish(1)))]);
    assert.deepEqual(results.map(text => /\nt\n/.test(`\n${text}\n`)).sort(), [false, true]);
    assert.equal(sql(`select count(*) from private.connect_key_envelopes where call_id=${q(call.id)}`), '2');
  });
  await check('ciphertext is isolated per receiving device and accepted devices admit', () => {
    assert.equal(context(1).envelopes.length, 1); assert.equal(context(2).envelopes.length, 1);
    assert.equal(context(2).envelopes[0].user_id, u(2));
    assert.equal(parse(run(2, `select public.rpc_connect_secure_admission(${q(call.id)},${q(device[1])})`)).admitted, true);
  });
  await check('revocation ends authority, deletes envelopes and preserves a durable end job while admission is off', () => {
    sql('update private.connect_config set enabled=false');
    run(2, `select public.rpc_connect_revoke_secure_device(${q(device[1])})`);
    assert.equal(sql(`select state from private.connect_sessions where id=${q(call.id)}`), 'ENDED');
    assert.equal(sql(`select count(*) from private.connect_key_envelopes where call_id=${q(call.id)}`), '0');
    assert.equal(sql(`select count(*) from private.connect_provider_jobs where call_id=${q(call.id)} and operation='end' and status<>'done'`), '1');
    assert.throws(() => context(1), /connect_unavailable/);
    assert.throws(() => run(2, `select public.rpc_connect_secure_admission(${q(call.id)},${q(device[1])})`), /connect_unavailable/);
  });
  const sessions = [randomUUID(),randomUUID()];
  sql(`insert into auth.sessions(id,user_id) values(${q(sessions[0])},${q(u(1))}),(${q(sessions[1])},${q(u(2))})`);
  device[1]=randomUUID(); register(2);
  const intent=(n,token,enabled=true)=>`select set_config('request.jwt.claims',${q(JSON.stringify({sub:u(n),role:'authenticated',session_id:sessions[n-1]}))},true);
    select public.rpc_connect_native_device_intent(${q(device[n-1])},'ios',${q(token)},${enabled})`;
  const service=text=>`begin;set local role service_role;${text};commit;`;
  const readClaim=text=>{const value=text.split(/\r?\n/).findLast(line=>line==='null'||line.startsWith('{'));return value ? JSON.parse(value) : null;};
  const claim=()=>readClaim(sql(service('select public.rpc_connect_claim_native_destination()')));
  const complete=(job,success=true)=>JSON.parse(sql(service(`select jsonb_build_object('ack',public.rpc_connect_complete_native_destination(${q(job.token_hash)},${job.generation},${q(job.lease)},${success}))`)).split(/\r?\n/).findLast(line=>line.startsWith('{'))).ack;
  const current=job=>sql(service(`select public.rpc_connect_native_destination_current(${q(job.token_hash)},${job.generation},${q(job.lease)})`)).split(/\r?\n/).includes('t');
  const token='synthetic-native-destination-1';
  await check('native destinations require an actual Auth session and expose no raw table/worker access',()=>{
    assert.throws(()=>run(1,`select public.rpc_connect_native_device_intent(${q(device[0])},'ios',${q(token)},true)`),/connect_unavailable/);
    assert.throws(()=>run(1,'select public.rpc_connect_claim_native_destination()'),/permission denied/);
    assert.throws(()=>run(1,`select public.rpc_connect_native_destination_current('none',1,${q(randomUUID())})`),/permission denied/);
    assert.throws(()=>sql('set role authenticated;select * from private.connect_native_destinations'),/permission denied/);
    run(1,intent(1,token));
  });
  let first;
  await check('overlapping workers cannot claim the same native registration',async()=>{
    const result=await Promise.all([concurrent(service('select public.rpc_connect_claim_native_destination()')),concurrent(service('select public.rpc_connect_claim_native_destination()'))]);
    const jobs=result.map(readClaim);
    assert.equal(jobs.filter(Boolean).length,1); first=jobs.find(Boolean); assert.equal(first.user_id,u(1));
  });
  await check('account transfer fences stale completion and tracks every possible provider owner',()=>{
    assert.equal(current(first),true);run(2,intent(2,token));assert.equal(current(first),false); assert.equal(complete(first),false);
    const second=claim(); assert.equal(second.user_id,u(2)); assert.ok(second.possible_users.includes(u(1))); assert.ok(second.possible_users.includes(u(2)));
    assert.equal(current(second),true);assert.throws(()=>complete({...second,lease:randomUUID()}),/connect_conflict/); assert.equal(complete(second),true);
    run(2,intent(2,token)); assert.equal(claim(),null);
    run(1,intent(1,token,false)); assert.equal(claim(),null);
  });
  await check('logout/session deletion queues cleanup even while call admission is disabled',()=>{
    sql(`delete from auth.sessions where id=${q(sessions[1])}`);
    const job=claim(); assert.equal(job.user_id,null); assert.ok(job.possible_users.includes(u(2))); assert.equal(complete(job),true); assert.equal(claim(),null);
    assert.equal(sql(`select push_token is not null and cardinality(possible_users)>0 from private.connect_native_destinations where token_hash=${q(job.token_hash)}`),'t');
    sql(`update private.connect_native_destinations set available_at=clock_timestamp()-interval '1 second' where token_hash=${q(job.token_hash)}`);
    const replay=claim(); assert.equal(replay.user_id,null); assert.ok(replay.possible_users.includes(u(2))); assert.equal(complete(replay),true);
  });
  await check('turning off native incoming preserves deletion work and ambiguous failures retry with backoff',()=>{
    run(1,intent(1,'synthetic-native-destination-2')); const registration=claim(); assert.equal(complete(registration),true);
    sql('update private.connect_config set native_incoming_enabled=false');
    const cleanup=claim(); assert.equal(cleanup.user_id,null); assert.equal(complete(cleanup,false),true); assert.equal(claim(),null);
    assert.equal(sql(`select status from private.connect_native_destinations where token_hash=${q(cleanup.token_hash)}`),'pending');
  });
}).then(() => console.log(JSON.stringify({ passed, failed: 0, hosted: false, providerCalls: 0 }))).catch(error => { console.error(error.message); process.exitCode = 1; });
