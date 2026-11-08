// Local-only permanent adversarial RPC/race tests. No provider credentials.
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { withConnectDatabase } = require('./lib/connect-test-database.cjs');
const user = (n) => `f0110000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const profile = (n) => `f0120000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const q = (s) => `'${String(s).replaceAll("'", "''")}'`;
const auth = (n, query) => `begin;set local role authenticated;select set_config('request.jwt.claim.sub',${q(user(n))},true);select set_config('request.jwt.claim.role','authenticated',true);${query};commit;`;
const parse = (value) => JSON.parse(value.split(/\r?\n/).findLast((line) => line.startsWith('{')));
let checks = 0;
const pass = (name) => { checks++; console.log(`ok ${checks} - ${name}`); };
withConnectDatabase(async ({ sql, concurrent, http, file }) => {
  sql(file('supabase/tests/fixtures/connect_v1.sql'));
  sql("update private.connect_config set environment='local',enabled=true,provider_ready=true,voice_enabled=true,video_enabled=true,pre_match_enabled=true");
  const run = (n, query) => sql(auth(n, query));
  const get = (id) => parse(run(7, `select public.rpc_connect_get_call(${q(id)})`));
  const newGrant = (voice = true, video = false) => {
    // Independent scenarios share synthetic actors; reset fixture throttle usage,
    // without changing any throttle function or policy under test.
    sql(`delete from private.connect_rates where user_id in (${q(user(7))},${q(user(8))})`);
    sql(`update public.intent_requests set status='expired' where actor_id=${q(profile(7))} and recipient_id=${q(profile(8))} and status='pending'`);
    const intent = randomUUID(); sql(`insert into public.intent_requests(id,actor_id,recipient_id,type,status,expires_at) values(${q(intent)},${q(profile(7))},${q(profile(8))},'connect','pending',clock_timestamp()+interval '1 hour')`);
    const id = run(7, `select public.rpc_connect_request_grant(${q(intent)},true,true)`).split(/\r?\n/).findLast((line) => /^[a-f0-9-]{36}$/.test(line));
    run(8, `select public.rpc_connect_decide_grant(${q(id)},${voice},${video})`); return id;
  };
  const create = (grant, media = 'voice') => parse(run(7, `select public.rpc_connect_create_call(${q(profile(8))},${q(media)},'pre_match',${q(randomUUID())},${q(randomUUID())},${q(grant)})`));
  const ack = (id, operation) => { const lease = randomUUID(); sql(`update private.connect_provider_jobs set status='working',lease=${q(lease)},lease_until=clock_timestamp()+interval '1 minute' where call_id=${q(id)} and operation=${q(operation)};select public.rpc_connect_complete_job(${q(id)},${q(operation)},${q(lease)},true)`); };
  const clean = (id) => { ack(id, 'create'); ack(id, 'end'); };
  for (const [role, granted] of [['anon', false], ['authenticated', false], ['service_role', true]]) {
    assert.equal(sql(`select has_function_privilege(${q(role)},'public.rpc_connect_claim_end(uuid)','EXECUTE')`), granted ? 't' : 'f'); pass(`${role} cleanup claim ACL`);
  }
  assert.equal(sql("select has_function_privilege('anon','public.rpc_connect_revoke_consent(uuid)','EXECUTE')"), 'f'); pass('anonymous revocation denied');
  let g = newGrant();
  assert.equal((await http(user(3), 'rpc/rpc_connect_revoke_consent', { p_grant: g })).status, 403); pass('unrelated actor cannot revoke or enumerate affected sessions');
  assert.throws(() => create(g, 'video')); pass('voice consent never authorizes a VIDEO session');
  run(8, `select public.rpc_connect_revoke_consent(${q(g)})`); assert.throws(() => create(g)); pass('revocation before creation denies fresh sessions');
  g = newGrant(false, true); assert.throws(() => create(g, 'voice'));
  const video = create(g, 'video'); assert.equal(video.media, 'video');
  run(8, `select public.rpc_connect_revoke_consent(${q(g)})`); clean(video.id);
  pass('independent recipient video approval authorizes VIDEO without authorizing voice');
  for (const state of ['REQUESTED', 'RINGING', 'ACCEPTED', 'ACTIVE', 'RECONNECTING']) {
    g = newGrant(); const s = create(g);
    if (state !== 'REQUESTED') ack(s.id, 'create');
    const device = randomUUID();
    if (['ACCEPTED', 'ACTIVE', 'RECONNECTING'].includes(state)) run(8, `select public.rpc_connect_act(${q(s.id)},'accept',${get(s.id).version},${q(device)})`);
    if (['ACTIVE', 'RECONNECTING'].includes(state)) {
      assert.equal(parse(run(8, `select public.rpc_connect_admission(${q(s.id)},${q(device)})`)).admitted, true);
      sql(`select public.rpc_connect_reconcile_media(${q(s.id)},'local-fixture-only',array[${q(user(7))},${q(user(8))}]::uuid[],false)`);
      if (state === 'RECONNECTING') sql(`select public.rpc_connect_reconcile_media(${q(s.id)},'local-fixture-only',array[${q(user(7))}]::uuid[],false)`);
    }
    assert.equal(get(s.id).state, state);
    const result = parse(run(8, `select public.rpc_connect_revoke_consent(${q(g)})`)); assert.equal(result.revoked, true); assert.equal(get(s.id).state, 'ENDED');
    assert.ok(result.calls.includes(s.id)); assert.equal(sql(`select count(*) from private.connect_occupancy where call_id=${q(s.id)}`), '2');
    assert.equal(parse(run(8, `select public.rpc_connect_admission(${q(s.id)},${q(device)})`)).admitted, false);
    assert.equal(parse(run(8, `select public.rpc_connect_admission(${q(s.id)},${q(randomUUID())})`)).admitted, false);
    sql(`select public.rpc_connect_reconcile_media(${q(s.id)},'late-local-fixture',array[${q(user(7))},${q(user(8))}]::uuid[],false)`);
    assert.equal(get(s.id).state, 'ENDED'); clean(s.id); pass(`${state} revocation fences both devices, retains cleanup and ignores late evidence`);
  }
  // Real separate-connection create/revoke and accept/revoke races.
  for (const action of ['create', 'accept']) {
    g = newGrant(); let s;
    if (action === 'accept') { s = create(g); ack(s.id, 'create'); }
    const outcomes = await Promise.allSettled([
      concurrent(auth(7 + Number(action === 'accept'), action === 'create'
        ? `select public.rpc_connect_create_call(${q(profile(8))},'voice','pre_match',${q(randomUUID())},${q(randomUUID())},${q(g)})`
        : `select public.rpc_connect_act(${q(s.id)},'accept',${get(s.id).version},${q(randomUUID())})`)),
      concurrent(auth(8, `select public.rpc_connect_revoke_consent(${q(g)})`)),
    ]);
    assert.equal(outcomes[1].status, 'fulfilled');
    if (action === 'create' && outcomes[0].status === 'fulfilled') s = parse(outcomes[0].value);
    if (s) { assert.equal(get(s.id).state, 'ENDED'); clean(s.id); }
    assert.throws(() => create(g)); pass(`real concurrent ${action}/revoke cannot restore authority`);
  }
  g = newGrant(); const orphan = create(g); sql(`delete from private.connect_sessions where id=${q(orphan.id)}`);
  const claimed = parse(sql('select public.rpc_connect_claim_job()')); assert.equal(claimed.call_id, orphan.id); assert.equal(claimed.operation, 'end'); pass('deleted-session cleanup preserves provider ID and has priority');
  const double = await Promise.all([
    concurrent(`select coalesce(public.rpc_connect_claim_end(${q(orphan.id)}),'{}'::jsonb)`),
    concurrent(`select coalesce(public.rpc_connect_claim_end(${q(orphan.id)}),'{}'::jsonb)`),
  ]);
  assert.ok(double.every((item) => Object.keys(JSON.parse(item.trim())).length === 0)); pass('an existing cleanup lease excludes duplicate fast-path claims');
  sql(`update private.connect_provider_jobs set lease_until=clock_timestamp()-interval '1 second' where call_id=${q(orphan.id)} and operation='end'`);
  const expired = await Promise.all([
    concurrent(`select coalesce(public.rpc_connect_claim_end(${q(orphan.id)}),'{}'::jsonb)`),
    concurrent(`select coalesce(public.rpc_connect_claim_end(${q(orphan.id)}),'{}'::jsonb)`),
  ]);
  assert.equal(expired.map((item) => JSON.parse(item.trim())).filter((item) => item.call_id === orphan.id).length, 1);
  pass('expired cleanup lease has exactly one winner across separate connections');
  const { assertConnectJobAcknowledged } = await import('../supabase/functions/_shared/connect-provider-worker.ts');
  const winner = expired.map((item) => JSON.parse(item.trim())).find((item) => item.call_id === orphan.id);
  const complete = (lease) => parse(sql(`begin;set local role service_role;select jsonb_build_object('ack',public.rpc_connect_complete_job(${q(orphan.id)},'end',${q(lease)},true));commit;`)).ack;
  const stale = complete(randomUUID());
  assert.equal(stale, false); assert.throws(() => assertConnectJobAcknowledged(stale), /connect_job_not_acknowledged/);
  assert.equal(sql(`select lease from private.connect_provider_jobs where call_id=${q(orphan.id)} and operation='end'`), winner.lease);
  pass('actual stale-lease RPC false cannot become an Edge cleanup acknowledgement');
  const accepted = complete(winner.lease);
  assert.equal(accepted, true); assert.doesNotThrow(() => assertConnectJobAcknowledged(accepted));
  pass('actual owner completion RPC true is accepted by the Edge acknowledgement guard');
  console.log(JSON.stringify({ revocationDatabaseCases: checks, separateConnectionRaces: 4, realProviderCalls: 0 }));
}).catch((error) => { console.error(error.stderr ? String(error.stderr).slice(0, 1200) : error.message); process.exitCode = 1; });
