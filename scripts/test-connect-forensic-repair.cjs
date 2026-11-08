// Local disposable database only. Provider operations are in-memory ports.
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { withConnectDatabase } = require('./lib/connect-test-database.cjs');
const user = (n) => `f0110000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const profile = (n) => `f0120000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const q = (s) => s === null ? 'null' : `'${String(s).replaceAll("'", "''")}'`;
const auth = (n, query) => `begin;set local statement_timeout='20s';set local lock_timeout='10s';set local role authenticated;
select set_config('request.jwt.claim.sub',${q(user(n))},true);select set_config('request.jwt.claim.role','authenticated',true);${query};commit;`;
const parse = (value) => JSON.parse(value.split(/\r?\n/).findLast((line) => line.startsWith('{')));
let passed = 0; const failures = [];
async function check(name, run) {
  try { await run(); passed++; console.log(`ok - ${name}`); }
  catch (error) { failures.push(name); console.error(`not ok - ${name}: ${error.message}`); }
}
withConnectDatabase(async ({ sql, concurrent, http, file }) => {
  sql(file('supabase/tests/fixtures/connect_v1.sql'));
  sql("update private.connect_config set environment='local',enabled=true,provider_ready=true,voice_enabled=true,video_enabled=true,pre_match_enabled=true");
  const run = (n, command) => sql(auth(n, command));
  const state = (id) => parse(sql(`select jsonb_build_object('state',s.state,'ended',s.ended_at is not null,'version',s.version,
    'reason',s.reason,'occupancy',(select count(*) from private.connect_occupancy where call_id=s.id),
    'endJobs',(select count(*) from private.connect_provider_jobs where call_id=s.id and operation='end'),
    'endStatus',(select status from private.connect_provider_jobs where call_id=s.id and operation='end')) from private.connect_sessions s where s.id=${q(id)}`));
  const ack = (id, operation, success = true) => {
    const lease = randomUUID();
    sql(`update private.connect_provider_jobs set status='working',lease=${q(lease)},lease_until=clock_timestamp()+interval '1 minute'
      where call_id=${q(id)} and operation=${q(operation)};
      select public.rpc_connect_complete_job(${q(id)},${q(operation)},${q(lease)},${success})`);
  };
  const clean = (id) => { ack(id, 'create'); ack(id, 'end'); };
  const start = () => {
    sql(`delete from private.connect_rates where user_id in (${q(user(7))},${q(user(8))});
      update public.intent_requests set status='expired' where actor_id=${q(profile(7))} and recipient_id=${q(profile(8))} and status='pending'`);
    const intent = randomUUID();
    sql(`insert into public.intent_requests(id,actor_id,recipient_id,type,status,expires_at)
      values(${q(intent)},${q(profile(7))},${q(profile(8))},'connect','pending',clock_timestamp()+interval '1 hour')`);
    const grant = run(7, `select public.rpc_connect_request_grant(${q(intent)},true,true)`).split(/\r?\n/).findLast((line) => /^[a-f0-9-]{36}$/.test(line));
    run(8, `select public.rpc_connect_decide_grant(${q(grant)},true,false)`);
    const device = randomUUID();
    const call = parse(run(7, `select public.rpc_connect_create_call(${q(profile(8))},'voice','pre_match',${q(randomUUID())},${q(randomUUID())},${q(grant)})`));
    ack(call.id, 'create');
    run(8, `select public.rpc_connect_act(${q(call.id)},'accept',${state(call.id).version},${q(device)})`);
    return { id: call.id, grant, intent, device };
  };
  const admit = (c, device = c.device) => run(8, `select public.rpc_connect_admission(${q(c.id)},${q(device)})`);
  const denied = (c, device = c.device) => {
    let response; let raised = false;
    try { response = parse(admit(c, device)); } catch { raised = true; }
    // Inspect in a NEW connection, before any get_call/sweep could repair the state.
    const committed = state(c.id);
    console.log(JSON.stringify({ admissionRejected: raised || response?.admitted === false, raised, committed }));
    assert.equal(committed.ended, true, 'denied admission must commit terminality');
    assert.equal(committed.endJobs, 1, 'denied admission must commit one durable end job');
    assert.equal(committed.endStatus, 'pending'); assert.equal(committed.occupancy, 2);
    assert.equal(raised, false, 'expected invalidation must return a successful transaction with structured denial');
    assert.equal(response.admitted, false); assert.equal(response.error, 'connect_unavailable');
    assert.equal(response.user_id, undefined); return committed;
  };
  for (const cause of ['deadline', 'expired_grant', 'revoked_grant', 'expired_source']) {
    const c = start();
    if (cause === 'deadline') sql(`update private.connect_sessions set deadline=clock_timestamp()-interval '1 second' where id=${q(c.id)}`);
    if (cause === 'expired_grant') sql(`update private.connect_grants set expires_at=clock_timestamp()-interval '1 second' where id=${q(c.grant)}`);
    if (cause === 'revoked_grant') sql(`update private.connect_grants set status='revoked',revoked_at=clock_timestamp() where id=${q(c.grant)}`);
    if (cause === 'expired_source') sql(`update public.intent_requests set status='expired' where id=${q(c.intent)}`);
    await check(`${cause}: denial commits terminal call, durable cleanup and occupancy`, () => {
      const first = denied(c); const second = denied(c);
      assert.equal(first.version, second.version); assert.equal(first.state, cause === 'deadline' ? 'FAILED' : 'ENDED');
    });
    clean(c.id);
  }
  const outage = start();
  sql(`update private.connect_grants set expires_at=clock_timestamp()-interval '1 second' where id=${q(outage.grant)}`);
  await check('provider failure and stale lease cannot erase committed admission invalidation', async () => {
    denied(outage); ack(outage.id, 'end', false);
    assert.equal(state(outage.id).occupancy, 2); assert.equal(state(outage.id).endStatus, 'pending');
    assert.equal(sql(`select public.rpc_connect_complete_job(${q(outage.id)},'end',${q(randomUUID())},true)`), 'f');
    assert.equal(state(outage.id).occupancy, 2);
  }); clean(outage.id);
  const race = start();
  await check('separate-connection admission versus revoke cannot restore authority', async () => {
    const outcomes = await Promise.allSettled([
      concurrent(auth(8, `select public.rpc_connect_admission(${q(race.id)},${q(race.device)})`)),
      concurrent(auth(7, `select public.rpc_connect_revoke_consent(${q(race.grant)})`)),
    ]);
    assert.equal(outcomes[1].status, 'fulfilled'); denied(race);
    sql(`select public.rpc_connect_reconcile_media(${q(race.id)},'late-active',array[${q(user(7))},${q(user(8))}]::uuid[],false)`);
    assert.equal(state(race.id).state, 'ENDED');
  }); clean(race.id);
  const valid = start();
  await check('positive admission is explicit; wrong/null device never gets affirmative authority', () => {
    const result = parse(admit(valid)); assert.equal(result.admitted, true); assert.equal(result.id, valid.id); assert.equal(result.user_id, user(8));
    for (const device of [null, randomUUID()]) {
      const invalid = parse(admit(valid, device)); assert.equal(invalid.admitted, false); assert.equal(invalid.error, 'connect_device_conflict');
    }
  });
  await check('unexpected database failures are not hidden as expected denials', () => {
    sql(`create function private.connect_repair_test_fault() returns trigger language plpgsql as $$begin raise exception 'repair_test_unexpected';end$$;
      create trigger connect_repair_test_fault before update on private.connect_sessions for each row execute function private.connect_repair_test_fault()`);
    try {
      // Force a real transition for a valid admission. A genuine database fault must escape.
      sql(`alter table private.connect_sessions disable trigger connect_repair_test_fault;
        update private.connect_sessions set state='ACCEPTED' where id=${q(valid.id)};
        alter table private.connect_sessions enable trigger connect_repair_test_fault`);
      assert.throws(() => admit(valid), (error) => /repair_test_unexpected/.test(String(error.stderr)));
    } finally { sql('drop trigger connect_repair_test_fault on private.connect_sessions;drop function private.connect_repair_test_fault()'); }
  });
  run(8, `select public.rpc_connect_act(${q(valid.id)},'end',${state(valid.id).version},${q(valid.device)})`); clean(valid.id);
  await check('RPC ACLs and fixed SECURITY DEFINER search paths survive correction', () => {
    for (const role of ['anon', 'service_role']) assert.equal(sql(`select has_function_privilege(${q(role)},'public.rpc_connect_admission(uuid,uuid)','execute')`), 'f');
    assert.equal(sql("select has_function_privilege('authenticated','public.rpc_connect_admission(uuid,uuid)','execute')"), 't');
    assert.equal(sql("select has_function_privilege('authenticated','public.rpc_connect_reconcile_media(uuid,text,uuid[],boolean)','execute')"), 'f');
    assert.equal(sql("select has_function_privilege('service_role','public.rpc_connect_reconcile_media(uuid,text,uuid[],boolean)','execute')"), 't');
    assert.equal(sql("select count(*) from pg_proc where oid in ('public.rpc_connect_admission(uuid,uuid)'::regprocedure,'public.rpc_connect_reconcile_media(uuid,text,uuid[],boolean)'::regprocedure) and prosecdef and 'search_path=pg_catalog'=any(proconfig)"), '2');
  });
  await check('structured denial is persisted through isolated PostgREST and exposes no credentials', async () => {
    const c = start();
    sql(`update private.connect_grants set status='revoked',revoked_at=clock_timestamp() where id=${q(c.grant)}`);
    const response = await http(user(8), 'rpc/rpc_connect_admission', { p_call: c.id, p_device: c.device });
    const body = await response.json(); const committed = state(c.id);
    assert.equal(committed.ended, true); assert.equal(committed.endJobs, 1); assert.equal(committed.occupancy, 2);
    assert.equal(response.status, 200); assert.deepEqual(body, { admitted: false, error: 'connect_unavailable' });
    clean(c.id);
  });
  const { createConnectStreamAdapter } = await import('../supabase/functions/_shared/connect-stream-adapter.ts');
  const { runConnectProviderJob, assertConnectJobAcknowledged } = await import('../supabase/functions/_shared/connect-provider-worker.ts');
  const policy = { name: 'betweener_connect', grants: { user: [], admin: [], call_member: [], connect_invited: ['read-call'],
    connect_voice: ['read-call', 'join-call', 'send-audio'], connect_video: ['read-call', 'join-call', 'send-audio', 'send-video'] },
    settings: { recording: { mode: 'disabled' }, transcription: { mode: 'disabled', closed_caption_mode: 'disabled' },
      individual_recording: { mode: 'disabled' }, raw_recording: { mode: 'disabled' }, frame_recording: { mode: 'disabled' },
      audio: { access_request_enabled: false }, video: { enabled: false, camera_default_on: false, access_request_enabled: false },
      screensharing: { enabled: false, access_request_enabled: false }, thumbnails: { enabled: false }, ingress: { enabled: false },
      broadcasting: { enabled: false, hls: { enabled: false }, rtmp: { enabled: false } }, limits: { max_participants: 2 } } };
  for (const [name, callEnded, sessionEnded, sessionId, missing, expected] of [
    ['ended call, no session', true, false, null, false, 'ENDED'],
    ['ended call, stale live session', true, false, 'session-1', false, 'ENDED'],
    ['active call, active session', false, false, 'session-1', false, 'ACTIVE'],
    ['ended session only', false, true, 'session-1', false, 'RECONNECTING'],
    ['call and session ended', true, true, 'session-1', false, 'ENDED'],
    ['active call, no session', false, false, null, false, 'RECONNECTING'],
    ['provider call missing', false, false, null, true, 'ENDED'],
    ['call end precedes mismatched session', true, false, 'different-session', false, 'ENDED'],
  ]) {
    const c = start(); admit(c);
    sql(`select public.rpc_connect_reconcile_media(${q(c.id)},'session-1',array[${q(user(7))},${q(user(8))}]::uuid[],false)`);
    await check(`actual adapter + worker + SQL: ${name}`, async () => {
      const response = { call: { id: c.id, type: policy.name, custom: { betweener_connect_id: c.id, media: 'voice' }, settings: policy.settings,
        ended_at: callEnded ? '2026-10-29T10:00:00Z' : null, session: sessionId === null ? null : {
          id: sessionId, ended_at: sessionEnded ? '2026-10-29T10:00:00Z' : null, participants: [7, 8].map((n) => ({ user: { id: user(n) } })) } },
        members: [7, 8].map((n) => ({ user_id: user(n) })) };
      let gets = 0; let transient = true;
      const adapter = createConnectStreamAdapter({ video: { call() { return { async get() {
        gets++; if (missing) throw { code: 16, metadata: { responseCode: 404 } }; return response;
      } }; } } }, 1731011);
      const store = {
        async snapshot(id) { return parse(sql(`select public.rpc_connect_worker_snapshot(${q(id)})`)); },
        async reconcile(id, m) {
          if (name === 'ended call, no session' && transient) { transient = false; throw new Error('transient_reconcile_failure'); }
          sql(`begin;set local role service_role;select public.rpc_connect_reconcile_media(${q(id)},${q(m.session)},array[${m.users.map(q)}]::uuid[],${m.ended});commit;`);
        },
        async complete(j, success) {
          assertConnectJobAcknowledged(sql(`select public.rpc_connect_complete_job(${q(j.call_id)},'sync',${q(j.lease)},${success})`) === 't');
        },
      };
      const job = () => {
        const lease = randomUUID();
        sql(`update private.connect_provider_jobs set status='working',lease=${q(lease)},attempts=attempts+1,
          lease_until=clock_timestamp()+interval '1 minute' where call_id=${q(c.id)} and operation='sync'`);
        return { call_id: c.id, operation: 'sync', lease };
      };
      if (name === 'ended call, no session') {
        assert.deepEqual(await runConnectProviderJob(job(), store, adapter), { success: false });
        assert.equal(sql(`select status from private.connect_provider_jobs where call_id=${q(c.id)} and operation='sync'`), 'pending');
        assert.equal(state(c.id).state, 'ACTIVE');
      }
      assert.deepEqual(await runConnectProviderJob(job(), store, adapter), { success: true });
      const committed = state(c.id); assert.equal(committed.state, expected); assert.equal(committed.occupancy, 2);
      assert.equal(sql(`select provider_session_id from private.connect_sessions where id=${q(c.id)}`), 'session-1');
      if (expected === 'ENDED') {
        assert.equal(committed.endJobs, 1); assert.equal(committed.endStatus, 'pending');
        // Actual service RPCs, not a fake in-memory terminal-state model.
        sql(`select public.rpc_connect_reconcile_media(${q(c.id)},null,'{}'::uuid[],true);
          select public.rpc_connect_reconcile_media(${q(c.id)},'late-active',array[${q(user(7))},${q(user(8))}]::uuid[],false)`);
        const duplicate = state(c.id); assert.equal(duplicate.state, 'ENDED'); assert.equal(duplicate.version, committed.version); assert.equal(duplicate.endJobs, 1);
        const priorGets = gets; await runConnectProviderJob(job(), store, adapter); assert.equal(gets, priorGets);
      } else {
        assert.equal(committed.endJobs, 0);
        run(8, `select public.rpc_connect_act(${q(c.id)},'end',${committed.version},${q(c.device)})`);
      }
    });
    clean(c.id);
  }
  console.log(JSON.stringify({ forensicDatabaseCases: passed + failures.length, pass: passed, fail: failures.length, failedCases: failures, realProviderCalls: 0 }));
  if (failures.length) throw new Error(`${failures.length} forensic regression cases failed`);
}).catch((error) => { console.error(error.stderr ? String(error.stderr).slice(0, 1200) : error.message); process.exitCode = 1; });
