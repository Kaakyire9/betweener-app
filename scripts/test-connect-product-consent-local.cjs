// Actual disposable PostgreSQL only. Network dispatcher is replaced INSIDE the clone.
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { withConnectDatabase } = require('./lib/connect-test-database.cjs');
const migration = 'supabase/migrations/20261031191352_connect_m3_1_intent_and_notifications.sql';
const id = n => `f0140000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const user = n => `f0110000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const profile = n => `f0120000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const q = s => `'${String(s).replaceAll("'","''")}'`;
const parse = s => JSON.parse(s.split(/\r?\n/).findLast(x=>x.startsWith('{')||x==='null'));
const scalar = s => s.split(/\r?\n/).filter(x=>x && !['BEGIN','COMMIT','SET'].includes(x)).at(-1);
let passed=0;const failures=[];
withConnectDatabase(async({sql,file,concurrent,http})=>{
  // Install the real retained push prerequisites only in this empty-data clone.
  if(sql("select to_regclass('public.live_notification_campaigns') is not null")==='f') sql(file('supabase/migrations/20260913200000_live_notification_campaigns.sql'));
  if(sql("select to_regclass('private.push_notification_events') is not null")==='f') {
    for(const name of ['20260914123000_push_notification_event_security','20260914124000_push_notification_delivery_reservations',
      '20260914125000_push_notification_dispatch_reliability','20260914126000_push_notification_atomic_rate_limits','20260914127000_push_notification_expiry_lifecycle']) sql(file(`supabase/migrations/${name}.sql`));
  }
  sql("insert into private.push_config(id,webhook_url) values(1,'https://xsgzxadwuxuziubglvps.supabase.co/functions/v1/push-notifications') on conflict(id) do update set webhook_url=excluded.webhook_url");
  if(sql("select exists(select 1 from information_schema.columns where table_schema='public' and table_name='push_tokens' and column_name='installation_id')")==='f') sql(file('supabase/migrations/20261006150000_push_environment_provenance_hardening.sql'));
  sql(file('supabase/migrations/20261006170000_update_staging_push_eas_project_identity.sql'));
  sql(`create or replace function private.dispatch_push_notification_event_v1(p_event_id uuid) returns boolean language sql as $$select false$$`);
  sql(file('supabase/migrations/20261031035826_connect_end_block_local_foundation.sql'));
  sql(file(migration));sql(file('supabase/tests/fixtures/connect_v1.sql'));
  const auth=(n,s)=>`begin;set local role authenticated;select set_config('request.jwt.claim.sub',${q(user(n))},true);${s};commit;`;
  const run=(n,s)=>sql(auth(n,s));
  const service=s=>sql(`begin;set local role service_role;select set_config('request.jwt.claim.role','service_role',true);${s};commit;`);
  const check=async(name,fn)=>{try{await fn();passed++;console.log(`ok - ${name}`);}catch(e){failures.push(name);console.error(`not ok - ${name}: ${e.message}`);}};
  const context=(n=7)=>parse(run(n,`select public.rpc_connect_get_intent_consent(${q(id(1))})`));
  let grant;
  await check('new push gate defaults off and cannot enable production',()=>{
    assert.equal(sql('select notifications_enabled from private.connect_config'),'f');
    assert.throws(()=>sql("update private.connect_config set environment='production',notifications_enabled=true"),/connect_notifications_never_production/);
  });
  await check('consent discovery requires exact authenticated Intent membership',async()=>{
    assert.equal(context().grant,null);assert.throws(()=>context(3),/connect_unavailable/);
    assert.throws(()=>sql(`set role anon;select public.rpc_connect_get_intent_consent(${q(id(1))})`),/permission denied/);
    const response=await http(user(7),'rpc/rpc_connect_get_intent_consent',{p_intent:id(1)});assert.equal(response.status,200);
  });
  sql("update private.connect_config set environment='local',enabled=true,voice_enabled=true,video_enabled=true,pre_match_enabled=true,provider_ready=true");
  await check('staging default denies everyone; exact two accounts constrain admission including service work',()=>{
    sql("update private.connect_config set environment='staging'");
    assert.equal(scalar(run(1,`select public.rpc_connect_check_eligibility(${q(profile(2))},'voice','matched',null)`)),'f');
    sql(`update private.connect_config set staging_test_users=array[${q(user(1))},${q(user(2))}]::uuid[]`);
    assert.equal(scalar(run(1,`select public.rpc_connect_check_eligibility(${q(profile(2))},'voice','matched',null)`)),'t');
    assert.equal(scalar(run(5,`select public.rpc_connect_check_eligibility(${q(profile(6))},'voice','matched',null)`)),'f');
    assert.equal(sql(`select private.connect_authorized(${q(profile(1))},${q(profile(2))},'voice','matched',null)`),'t');
    assert.throws(()=>sql(`update private.connect_config set staging_test_users=array[${q(user(1))},${q(user(1))}]::uuid[]`),/check constraint/);
    assert.throws(()=>run(1,"update private.connect_config set staging_test_users='{}'"),/permission denied/);
    sql("update private.connect_config set environment='local',staging_test_users='{}'");
  });
  await check('sender voice/video offers leave both permissions false',()=>{
    grant=scalar(run(7,`select public.rpc_connect_request_grant(${q(id(1))},true,true)`));
    assert.ok(grant);const c=context(8);assert.equal(c.grant.requested_video,true);assert.equal(c.grant.voice,false);assert.equal(c.grant.video,false);
    assert.equal(c.can_call_voice,false);assert.equal(context().can_call_voice,false);
  });
  await check('sender and unrelated account cannot approve recipient media',()=>{
    assert.throws(()=>run(7,`select public.rpc_connect_decide_grant(${q(grant)},true,true)`),/connect_unavailable/);
    assert.throws(()=>run(3,`select public.rpc_connect_decide_grant(${q(grant)},true,true)`),/connect_unavailable/);
    assert.equal(context().grant.status,'pending');
  });
  await check('explicit voice-only recipient decision never authorizes video or reverse caller',()=>{
    run(8,`select public.rpc_connect_decide_grant(${q(grant)},true,false)`);
    assert.equal(context().can_call_voice,true);assert.equal(context().grant.video,false);
    assert.equal(scalar(run(7,`select public.rpc_connect_check_eligibility(${q(profile(8))},'video','pre_match',${q(grant)})`)),'f');
    assert.equal(scalar(run(8,`select public.rpc_connect_check_eligibility(${q(profile(7))},'voice','pre_match',${q(grant)})`)),'f');
  });
  await check('recipient cannot approve unoffered video and decline grants neither media',()=>{
    sql(`select set_config('request.jwt.claim.sub',${q(user(9))},false);
      insert into public.intent_requests(id,actor_id,recipient_id,type,status,expires_at) values(${q(id(4))},${q(profile(9))},${q(profile(10))},'connect','pending',clock_timestamp()+interval '1 day')`);
    const g=scalar(run(9,`select public.rpc_connect_request_grant(${q(id(4))},true,false)`));
    assert.throws(()=>run(10,`select public.rpc_connect_decide_grant(${q(g)},false,true)`),/connect_invalid_input/);
    run(10,`select public.rpc_connect_decide_grant(${q(g)},false,false)`);
    const c=parse(run(9,`select public.rpc_connect_get_intent_consent(${q(id(4))})`));
    assert.equal(c.grant.status,'revoked');assert.equal(c.grant.voice,false);assert.equal(c.grant.video,false);assert.equal(c.can_call_voice,false);
  });
  const seed=(a=7,b=8,mode='pre_match')=>{
    const call=randomUUID(),device=randomUUID();
    sql(`delete from private.connect_occupancy where user_id in(${q(user(a))},${q(user(b))});
      insert into private.connect_sessions(id,caller_user_id,recipient_user_id,caller_profile_id,recipient_profile_id,caller_device,
        media,auth_mode,grant_id,idempotency_key) values(${q(call)},${q(user(a))},${q(user(b))},${q(profile(a))},${q(profile(b))},${q(device)},
        'voice',${q(mode)},${mode==='pre_match'?q(grant):'null'},${q(randomUUID())});
      select private.connect_transition(${q(call)},'RINGING')`);return{call,device};
  };
  let call;
  await check('voice consent withdrawal terminates related calls and preserves durable cleanup',()=>{
    call=seed();run(8,`select public.rpc_connect_revoke_grant(${q(grant)})`);
    assert.equal(context().grant.status,'revoked');assert.equal(context().can_call_voice,false);
    assert.equal(sql(`select state from private.connect_sessions where id=${q(call.call)}`),'ENDED');
    assert.equal(sql(`select count(*) from private.connect_provider_jobs where call_id=${q(call.call)} and operation='end' and status='pending'`),'1');
    assert.throws(()=>run(8,`select public.rpc_connect_decide_grant(${q(grant)},true,false)`),/connect_unavailable/);
  });
  await check('expired/cancelled requests never offer new authority',()=>{
    sql(`select set_config('request.jwt.claim.sub',${q(user(11))},false);
      insert into public.intent_requests(id,actor_id,recipient_id,type,status,expires_at) values(${q(id(2))},${q(profile(11))},${q(profile(12))},'connect','pending',clock_timestamp()+interval '1 millisecond')`);
    const c=parse(run(11,`select public.rpc_connect_get_intent_consent(${q(id(2))})`));
    assert.equal(c.available,false);assert.throws(()=>run(11,`select public.rpc_connect_request_grant(${q(id(2))},true,false)`),/connect_unavailable/);
  });
  await check('block during ringing prevents acceptance and queues provider end',()=>{
    const c=seed(5,6,'matched');run(6,`insert into public.blocks(blocker_id,blocked_id) values(${q(user(6))},${q(user(5))})`);
    const result=parse(run(6,`select public.rpc_connect_act(${q(c.call)},'accept',2,${q(randomUUID())})`));assert.equal(result.state,'ENDED');
    assert.equal(sql(`select count(*) from private.connect_provider_jobs where call_id=${q(c.call)} and operation='end'`),'1');
    run(6,`delete from public.blocks where blocker_id=${q(user(6))} and blocked_id=${q(user(5))}`);
  });
  sql("update private.connect_config set notifications_enabled=true;update public.notification_prefs set push_enabled=true,quiet_hours_enabled=false where user_id::text like 'f0110000-%'");
  const events=callId=>JSON.parse(sql(`select coalesce(json_agg(json_build_object('id',id,'status',status,'type',event_type,'data',data)),'[]') from private.push_notification_events where data->>'call_id'=${q(callId)}`));
  const claimed=e=>parse(service(`select public.rpc_service_claim_push_notification_event_v1(${q(e.id)})`));
  const tokens=[];
  await check('new token cannot inherit capability, exact installation opt-in is explicit',()=>{
    for(const n of [1,2]){
      const t={id:randomUUID(),installation:randomUUID(),n};tokens.push(t);
      sql(`insert into public.push_tokens(id,user_id,token,platform,device_id,installation_id,app_version,app_environment,application_id,expo_project_id,
        provenance_status,verified_at,connect_push_contract) values(${q(t.id)},${q(user(n))},${q('ExponentPushToken[offline-'+n+']')},'android',${q(t.installation)},${q(t.installation)},'1.2.0','staging',
        'com.aduboffour.betweener.staging','734d06b2-57f3-49f0-85cd-197a84c4c477','verified',now(),1)`);
      assert.equal(sql(`select connect_push_contract from public.push_tokens where id=${q(t.id)}`),'0');
    }
    run(1,`select public.rpc_connect_register_notification_capability(${q(tokens[1].installation)},true)`);assert.equal(sql(`select connect_push_contract from public.push_tokens where id=${q(tokens[1].id)}`),'0');
    for(const t of tokens)run(t.n,`select public.rpc_connect_register_notification_capability(${q(t.installation)},true)`);
  });
  await check('authenticated clients cannot forge outbox events or call unguarded delegates',()=>{
    assert.throws(()=>run(1,'select count(*) from private.push_notification_events'),/permission denied/);
    assert.throws(()=>run(1,`select public.rpc_service_claim_push_notification_event_pre_connect_v1(${q(randomUUID())})`),/permission denied/);
    assert.throws(()=>run(1,`select public.rpc_service_reserve_push_notification_deliveries_pre_connect_v1(${q(randomUUID())},array[${q(tokens[0].id)}]::uuid[])`),/permission denied/);
  });
  await check('incoming producer uses canonical private-free call/generation/recipient payload',()=>{
    call=seed(1,2,'matched');const e=events(call.call);assert.equal(e.length,1);assert.equal(e[0].type,'connect_voice_incoming');
    assert.deepEqual(Object.keys(e[0].data).sort(),['call_generation','call_id','call_version','recipient_user_id','type']);assert.equal(e[0].data.recipient_user_id,user(2));
    assert.equal(new Date(e[0].data.call_generation).toISOString().slice(0,10),new Date().toISOString().slice(0,10));
  });
  await check('duplicate transition never creates duplicate invitations',()=>{
    sql(`select private.connect_transition(${q(call.call)},'RINGING')`);assert.equal(events(call.call).length,1);
  });
  await check('deadline-expired invitation is denied even before maintenance marks it terminal',()=>{
    const c=seed(1,2,'matched'),e=events(c.call)[0];sql(`update private.connect_sessions set deadline=clock_timestamp()-interval '1 millisecond' where id=${q(c.call)}`);
    assert.equal(claimed(e).claimStatus,'not_authorized');
  });
  await check('canonical claim and reservation are each at-most-once',()=>{
    const e=events(call.call)[0];assert.equal(claimed(e).claimStatus,'claimed');assert.equal(claimed(e).claimStatus,'duplicate');
    const reserve=()=>scalar(service(`select count(*) from public.rpc_service_reserve_push_notification_deliveries_v1(${q(e.id)},array[${q(tokens[1].id)}]::uuid[])`));
    assert.equal(reserve(),'1');assert.equal(reserve(),'0');
  });
  await check('cancel creates terminal notice and denies invitation reservation after terminal',()=>{
    const e=events(call.call)[0];run(1,`select public.rpc_connect_act(${q(call.call)},'cancel',2,${q(call.device)})`);
    assert.equal(events(call.call).filter(x=>x.type==='connect_voice_cancelled').length,1);
    assert.equal(scalar(service(`select count(*) from public.rpc_service_reserve_push_notification_deliveries_v1(${q(e.id)},array[${q(tokens[1].id)}]::uuid[])`)),'0');
  });
  await check('unsent invitation suppressed by accept and late/duplicate acceptance does not re-ring',()=>{
    const c=seed(1,2,'matched'),incoming=events(c.call)[0],device=randomUUID();
    run(2,`select public.rpc_connect_act(${q(c.call)},'accept',2,${q(device)})`);run(2,`select public.rpc_connect_act(${q(c.call)},'accept',2,${q(device)})`);
    assert.equal(claimed(incoming).claimStatus,'not_authorized');assert.equal(events(c.call).filter(e=>e.type==='connect_voice_incoming').length,1);
    assert.equal(events(c.call)[0].status,'suppressed');
  });
  for(const [state,reason,types] of [['DECLINED','recipient_declined',['connect_voice_declined']],['MISSED','deadline_expired',['connect_voice_missed','connect_voice_expired']],
    ['ENDED','consent_revoked',['connect_voice_revoked','connect_voice_revoked']],['ENDED','blocked',['connect_voice_blocked','connect_voice_blocked']]])await check(`terminal ${state}/${reason} creates only intended status hints`,()=>{
    const c=seed(1,2,'matched');sql(`select private.connect_transition(${q(c.call)},${q(state)},${q(reason)})`);
    assert.deepEqual(events(c.call).filter(e=>e.type!=='connect_voice_incoming').map(e=>e.type).sort(),types.sort());
  });
  await check('generation/version mismatch and malformed payload deny without exceptions',()=>{
    for(const patch of [{call_generation:'invalid'}, {call_generation:'2000-01-01T00:00:00Z'}, {call_version:999}, {call_version:null}, {call_version:'2'}, {token:'secret'}, {recipient_user_id:user(3)}, {recipient_user_id:null}]){
      const c=seed(1,2,'matched'),e=events(c.call)[0];sql(`update private.push_notification_events set data=data||${q(JSON.stringify(patch))}::jsonb where id=${q(e.id)}`);
      assert.equal(claimed(e).claimStatus,'not_authorized');
    }
  });
  await check('disabled push and old installation capability cannot reserve',()=>{
    const c=seed(1,2,'matched'),e=events(c.call)[0];assert.equal(claimed(e).claimStatus,'claimed');
    sql(`update public.push_tokens set token=token where id=${q(tokens[1].id)}`);assert.equal(sql(`select connect_push_contract from public.push_tokens where id=${q(tokens[1].id)}`),'0');
    assert.equal(scalar(service(`select count(*) from public.rpc_service_reserve_push_notification_deliveries_v1(${q(e.id)},array[${q(tokens[1].id)}]::uuid[])`)),'0');
    sql('update private.connect_config set notifications_enabled=false');assert.equal(claimed(events(seed(1,2,'matched').call)[0]??e).claimStatus,'not_authorized');
  });
  await check('concurrent withdrawal and acceptance cannot preserve admitted permission',async()=>{
    sql(`select set_config('request.jwt.claim.sub',${q(user(13))},false);
      insert into public.intent_requests(id,actor_id,recipient_id,type,status,expires_at) values(${q(id(3))},${q(profile(13))},${q(profile(14))},'connect','pending',clock_timestamp()+interval '1 day')`);
    const saved=grant;grant=scalar(run(13,`select public.rpc_connect_request_grant(${q(id(3))},true,false)`));
    run(14,`select public.rpc_connect_decide_grant(${q(grant)},true,false)`);const c=seed(13,14);const currentGrant=grant;grant=saved;
    await Promise.all([concurrent(auth(13,`select public.rpc_connect_revoke_grant(${q(currentGrant)})`)),
      concurrent(auth(14,`select public.rpc_connect_act(${q(c.call)},'accept',2,${q(randomUUID())})`))]);
    assert.equal(sql(`select state from private.connect_sessions where id=${q(c.call)}`),'ENDED');
    assert.equal(sql(`select status from private.connect_grants where id=${q(currentGrant)}`),'revoked');
    assert.equal(sql(`select count(*) from private.connect_provider_jobs where call_id=${q(c.call)} and operation='end' and status='pending'`),'1');
  });
  await check('atomic active End Call and Block also commits with canonical push enabled',()=>{
    sql("update private.connect_config set notifications_enabled=true,end_block_enabled=true");
    const c=seed(5,6,'matched');sql(`select private.connect_transition(${q(c.call)},'ACCEPTED');select private.connect_transition(${q(c.call)},'CONNECTING');select private.connect_transition(${q(c.call)},'ACTIVE')`);
    const generation=parse(sql(`select jsonb_build_object('generation',created_at) from private.connect_sessions where id=${q(c.call)}`)).generation;
    const ctx=parse(run(5,`select public.rpc_connect_end_block_context(${q(c.call)},${q(profile(6))},${q(generation)})`));
    const receipt=parse(run(5,`select public.rpc_connect_end_call_and_block(${q(c.call)},${q(profile(6))},${q(ctx.generation)},${q(randomUUID())},${q(JSON.stringify(ctx))}::jsonb)`));
    assert.equal(receipt.block,'saved');assert.equal(receipt.call,'terminal');assert.equal(receipt.provider,'pending');
    assert.equal(events(c.call).filter(e=>e.type==='connect_voice_blocked').length,2);
  });
  if(failures.length)throw Error(`Failures: ${failures.join(', ')}`);
}).then(()=>console.log(JSON.stringify({passed,failures:failures.length,hosted:false,provider:false}))).catch(e=>{console.error(e.message);process.exitCode=1;});
