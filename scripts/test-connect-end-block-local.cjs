// Disposable database clone only. Never reads .env or calls a hosted/provider endpoint.
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { withConnectDatabase } = require('./lib/connect-test-database.cjs');
const { issueConnectCredentials } = require('../supabase/functions/_shared/connect-credential-issuance.ts');
const migration = 'supabase/migrations/20261031035826_connect_end_block_local_foundation.sql';
const user = n => `f0110000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const profile = n => `f0120000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const q = s => s === null ? 'null' : `'${String(s).replaceAll("'", "''")}'`;
const auth = (n, text) => `begin;set local statement_timeout='20s';set local lock_timeout='5s';set local role authenticated;
select set_config('request.jwt.claim.sub',${q(user(n))},true);${text};commit;`;
const parse = text => JSON.parse(text.split(/\r?\n/).findLast(x => x.startsWith('{') || x === 'null'));
let passed = 0; const failures = [];
const check = async (name, run) => { try { await run(); passed++; console.log(`ok - ${name}`); } catch(e) { failures.push(name); console.error(`not ok - ${name}: ${e.message}`); } };
withConnectDatabase(async ({ sql, concurrent, http, file }) => {
  sql(file(migration)); sql(file('supabase/tests/fixtures/connect_v1.sql'));
  const run = (n, text) => sql(auth(n, text));
  function seed(a=1,b=2) {
    const id=randomUUID(),device=randomUUID();
    sql(`delete from public.blocks where blocker_id in(${q(user(a))},${q(user(b))}) and blocked_id in(${q(user(a))},${q(user(b))});
      delete from private.connect_occupancy where user_id in(${q(user(a))},${q(user(b))});
      insert into private.connect_sessions(id,caller_user_id,recipient_user_id,caller_profile_id,recipient_profile_id,caller_device,recipient_device,
        media,auth_mode,idempotency_key,state,connected_at,deadline)
      values(${q(id)},${q(user(a))},${q(user(b))},${q(profile(a))},${q(profile(b))},${q(device)},${q(device)},'voice','matched',${q(randomUUID())},'ACTIVE',clock_timestamp(),null);
      insert into private.connect_occupancy values(${q(user(a))},${q(id)}),(${q(user(b))},${q(id)})`);
    const generation=parse(sql(`select jsonb_build_object('value',created_at) from private.connect_sessions where id=${q(id)}`)).value;
    return {id,device,generation,a,b,key:randomUUID()};
  }
  const args = c => `${q(c.id)},${q(profile(c.b))},${q(c.generation)}`;
  const context = c => parse(run(c.a,`select public.rpc_connect_end_block_context(${args(c)})`));
  const command = (c,ctx,key=c.key) => `select public.rpc_connect_end_call_and_block(${args(c)},${q(key)},${q(JSON.stringify(ctx))}::jsonb)`;
  const status = c => parse(run(c.a,`select public.rpc_connect_end_block_status(${args(c)})`));
  const observe = c => parse(sql(`select jsonb_build_object('state',s.state,'ended',s.ended_at is not null,
    'block',(select count(*) from public.blocks where blocker_id=${q(user(c.a))} and blocked_id=${q(user(c.b))}),
    'jobs',(select count(*) from private.connect_provider_jobs where call_id=s.id and operation='end'),
    'occupancy',(select count(*) from private.connect_occupancy where call_id=s.id)) from private.connect_sessions s where id=${q(c.id)}`));
  await check('database and client calling flags stay off by default',()=>{
    const config=parse(sql(`select jsonb_build_object('feature',end_block_enabled,'calling',enabled,'provider',provider_ready,'voice',voice_enabled,'video',video_enabled) from private.connect_config`));
    assert.deepEqual(config,{feature:false,calling:false,provider:false,voice:false,video:false});
    const c=seed();assert.throws(()=>context(c),/connect_disabled/);
    const ctx=parse(sql(`select set_config('request.jwt.claim.sub',${q(user(1))},false);
      select private.connect_end_block_context(s) from private.connect_sessions s where id=${q(c.id)}`));
    assert.throws(()=>run(1,command(c,ctx)),/connect_disabled/);assert.equal(observe(c).block,0);
  });
  sql("update private.connect_config set environment='local',end_block_enabled=true");
  await check('production cannot enable the new flag',()=>assert.throws(()=>sql("update private.connect_config set environment='production'"),/connect_end_block_never_production/));
  await check('anonymous has no RPC access and authenticated has no private helper access',()=>{
    assert.throws(()=>sql('set role anon;select public.rpc_connect_end_block_status(null,null,null)'),/permission denied/);
    assert.throws(()=>run(1,'select private.connect_end_block_session(null,null,null)'),/permission denied/);
  });
  await check('successful atomic block/terminal/outbox result without active consent or calling flags',()=>{
    const c=seed(),r=parse(run(c.a,command(c,context(c))));
    assert.equal(r.block,'saved');assert.equal(r.call,'terminal');assert.equal(r.provider,'pending');assert.equal(r.media,'unverified');
    assert.deepEqual(observe(c),{state:'ENDED',ended:true,block:1,jobs:1,occupancy:2});
  });
  await check('same request retry preserves one block, one job and an existing worker lease',()=>{
    const c=seed(),ctx=context(c);run(c.a,command(c,ctx));const lease=randomUUID();
    sql(`update private.connect_provider_jobs set status='working',lease=${q(lease)},lease_until=clock_timestamp()+interval '1 minute' where call_id=${q(c.id)} and operation='end'`);
    const before=sql(`select revoked_at from private.relationship_consent_revocations where profile_a_id=${q(profile(1))} and profile_b_id=${q(profile(2))}`);
    assert.equal(parse(run(c.a,command(c,ctx))).block,'saved');
    assert.equal(sql(`select lease from private.connect_provider_jobs where call_id=${q(c.id)} and operation='end'`),lease);
    assert.equal(sql(`select revoked_at from private.relationship_consent_revocations where profile_a_id=${q(profile(1))} and profile_b_id=${q(profile(2))}`),before);
    assert.equal(observe(c).block,1);assert.equal(observe(c).jobs,1);
  });
  await check('wrong actor, peer profile, generation and peer account context reject without writes',()=>{
    const c=seed(),ctx=context(c);
    assert.throws(()=>run(3,command(c,ctx)),/connect_unavailable/);
    assert.throws(()=>run(2,`select public.rpc_connect_end_call_and_block(${q(c.id)},${q(profile(1))},${q(c.generation)},${q(c.key)},${q(JSON.stringify(ctx))}::jsonb)`),/connect_unavailable/);
    assert.throws(()=>run(1,`select public.rpc_connect_end_block_context(${q(randomUUID())},${q(profile(2))},${q(c.generation)})`),/connect_unavailable/);
    assert.throws(()=>run(1,`select public.rpc_connect_end_block_context(${q(c.id)},${q(profile(3))},${q(c.generation)})`),/connect_unavailable/);
    assert.throws(()=>run(1,`select public.rpc_connect_end_block_context(${q(c.id)},${q(profile(2))},'2000-01-01')`),/connect_unavailable/);
    assert.throws(()=>run(1,command(c,{...ctx,peer_user_id:user(3)})),/connect_unavailable/);
    assert.equal(observe(c).block,0);assert.equal(observe(c).state,'ACTIVE');
  });
  await check('different key cannot substitute for the original committed action',()=>{
    const c=seed(),ctx=context(c);run(1,command(c,ctx));assert.throws(()=>run(1,command(c,ctx,randomUUID())),/connect_idempotency_conflict/);
  });
  await check('existing block row is reused without blind upsert and terminal cleanup is ensured',()=>{
    const c=seed();run(1,`insert into public.blocks(blocker_id,blocked_id) values(${q(user(1))},${q(user(2))})`);
    const ctx=context(c);assert.ok(ctx.block_id);assert.equal(parse(run(1,command(c,ctx))).block,'saved');assert.equal(observe(c).block,1);assert.equal(observe(c).jobs,1);
  });
  await check('unblock then delayed committed retry observes no_longer_saved, never reinserts',()=>{
    const c=seed(),ctx=context(c);run(1,command(c,ctx));run(1,`delete from public.blocks where blocker_id=${q(user(1))} and blocked_id=${q(user(2))}`);
    assert.equal(parse(run(1,command(c,ctx))).block,'no_longer_saved');assert.equal(status(c).block,'no_longer_saved');assert.equal(observe(c).block,0);assert.equal(observe(c).state,'ENDED');
  });
  await check('replacement block row cannot be attributed to the old action',()=>{
    const c=seed(),ctx=context(c);run(1,command(c,ctx));run(1,`delete from public.blocks where blocker_id=${q(user(1))} and blocked_id=${q(user(2))};insert into public.blocks(blocker_id,blocked_id) values(${q(user(1))},${q(user(2))})`);
    assert.equal(parse(run(1,command(c,ctx))).block,'no_longer_saved');assert.equal(observe(c).block,1);
  });
  await check('first delayed request rejects after intervening block/unblock watermark change',()=>{
    const c=seed(),ctx=context(c);run(1,`insert into public.blocks(blocker_id,blocked_id) values(${q(user(1))},${q(user(2))});delete from public.blocks where blocker_id=${q(user(1))} and blocked_id=${q(user(2))}`);
    assert.throws(()=>run(1,command(c,ctx)),/connect_conflict/);assert.equal(observe(c).block,0);
  });
  await check('prepared existing-block confirmation rejects if it was unblocked before first execution',()=>{
    const c=seed();run(1,`insert into public.blocks(blocker_id,blocked_id) values(${q(user(1))},${q(user(2))})`);const ctx=context(c);
    run(1,`delete from public.blocks where blocker_id=${q(user(1))} and blocked_id=${q(user(2))}`);
    assert.throws(()=>run(1,command(c,ctx)),/connect_conflict/);assert.equal(observe(c).block,0);
  });
  await check('concurrent identical commands serialize to one durable intent',async()=>{
    const c=seed(),ctx=context(c);const values=await Promise.all([concurrent(auth(1,command(c,ctx))),concurrent(auth(1,command(c,ctx)))]);
    assert.equal(parse(values[0]).block,'saved');assert.equal(parse(values[1]).block,'saved');assert.equal(observe(c).block,1);assert.equal(observe(c).jobs,1);
  });
  for(const order of ['block_first','end_first'])await check(`real concurrent ordinary end/block: ${order}`,async()=>{
    const c=seed(),ctx=context(c);const end=`select public.rpc_connect_act(${q(c.id)},'end',1,${q(c.device)})`;
    const first=concurrent(auth(order==='block_first'?1:2,(order==='block_first'?command(c,ctx):end)+`;select pg_sleep(0.15)`));
    const second=concurrent(auth(order==='block_first'?2:1,order==='block_first'?end:command(c,ctx)));
    await Promise.all([first,second]);assert.equal(observe(c).block,1);assert.equal(observe(c).state,'ENDED');
  });
  await check('real concurrent replay/delete never recreates a later unblocked row',async()=>{
    const c=seed(),ctx=context(c);run(1,command(c,ctx));
    await Promise.all([concurrent(auth(1,command(c,ctx)+';select pg_sleep(0.15)')),
      concurrent(auth(1,`delete from public.blocks where blocker_id=${q(user(1))} and blocked_id=${q(user(2))}`))]);
    assert.equal(parse(run(1,command(c,ctx))).block,'no_longer_saved');assert.equal(observe(c).block,0);
  });
  await check('injected failure after trigger work rolls back block, terminal state and outbox atomically',()=>{
    const c=seed(),ctx=context(c);
    sql(`create function private.test_end_block_abort() returns trigger language plpgsql as $$begin if new.end_block_requests<>old.end_block_requests then raise exception 'test_end_block_abort';end if;return new;end$$;
      create trigger test_end_block_abort before update on private.connect_sessions for each row execute function private.test_end_block_abort()`);
    try {assert.throws(()=>run(1,command(c,ctx)),/test_end_block_abort/);assert.deepEqual(observe(c),{state:'ACTIVE',ended:false,block:0,jobs:0,occupancy:2});}
    finally {sql('drop trigger test_end_block_abort on private.connect_sessions;drop function private.test_end_block_abort()');}
  });
  await check('credential post-issue admission fence sees real block commit and suppresses response',async()=>{
    const c=seed(5,6),ctx=context(c);let issued=false;
    await assert.rejects(issueConnectCredentials({admit:async()=>parse(run(5,`select public.rpc_connect_admission(${q(c.id)},${q(c.device)})`)),
      snapshot:async()=>({id:c.id,media:'voice'}),issue:async()=>{issued=true;run(5,command(c,ctx));return {token:'synthetic-only'};}},user(5),c.id),/connect_unavailable/);
    assert.equal(issued,true);assert.equal(observe(c).block,1);
    assert.equal(parse(run(5,`select public.rpc_connect_admission(${q(c.id)},${q(c.device)})`)).admitted,false);
  });
  await check('pending end, stale lease and literal acknowledged completion remain distinct',()=>{
    const c=seed(),ctx=context(c);run(1,command(c,ctx));const j=parse(sql(`select public.rpc_connect_claim_end(${q(c.id)})`));
    assert.equal(sql(`select public.rpc_connect_complete_job(${q(c.id)},'end',${q(randomUUID())},true)`),'f');assert.equal(status(c).provider,'pending');assert.equal(observe(c).occupancy,2);
    assert.equal(sql(`select public.rpc_connect_complete_job(${q(c.id)},'end',${q(j.lease)},true)`),'t');assert.equal(status(c).provider,'acknowledged');assert.equal(status(c).media,'unverified');
  });
  await check('status is readable on another device and after feature disable without new writes',()=>{
    const c=seed(),ctx=context(c);run(1,command(c,ctx));sql('update private.connect_config set end_block_enabled=false');
    assert.equal(status(c).block,'saved');assert.equal(parse(run(1,command(c,ctx))).block,'saved');sql('update private.connect_config set end_block_enabled=true');
  });
  await check('outstanding creation keeps cleanup pending even after an accepted end completion',()=>{
    const c=seed(),ctx=context(c);run(1,command(c,ctx));
    sql(`insert into private.connect_provider_jobs(call_id,operation) values(${q(c.id)},'create')`);
    const j=parse(sql(`select public.rpc_connect_claim_end(${q(c.id)})`));
    assert.equal(sql(`select public.rpc_connect_complete_job(${q(c.id)},'end',${q(j.lease)},true)`),'t');
    assert.equal(status(c).provider,'pending');assert.equal(observe(c).occupancy,2);
  });
  await check('loopback authenticated REST uses the real RPC and denies another account',async()=>{
    const c=seed(),ctx=context(c);const response=await http(user(1),'rpc/rpc_connect_end_call_and_block',{p_call:c.id,p_peer:profile(2),p_generation:c.generation,p_key:c.key,p_context:ctx});
    assert.equal(response.ok,true);assert.equal((await response.json()).block,'saved');
    const wrong=await http(user(3),'rpc/rpc_connect_end_block_status',{p_call:c.id,p_peer:profile(2),p_generation:c.generation});assert.equal(wrong.ok,false);
  });
  console.log(JSON.stringify({localEndBlockDatabase:{passed,failed:failures.length,failures},hostedAccess:false,providerAccess:false}));
  if(failures.length)process.exitCode=1;
}).catch(()=>{console.error('DATABASE_NOT_VERIFIED: isolated database setup or cleanup failed');process.exitCode=1;});
