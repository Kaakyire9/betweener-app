// Synthetic, disposable PostgreSQL + loopback Deno handlers. No actual push delivery.
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const {execFileSync}=require('node:child_process');
const { withConnectDatabase } = require('./lib/connect-test-database.cjs');
const { prepare, json, read, sha, dir, saveJson } = require('./lib/connect-push-rehearsal/prepare.cjs');
const { baseline } = require('./lib/connect-push-rehearsal/baseline.cjs');
const { gateway, launch } = require('./lib/connect-push-rehearsal/edge.cjs');
const receipt = { schemaVersion:1, scope:'DISPOSABLE_LOCAL_ONLY', hosted:false, actualPushes:0, reconstructed:[], applied:[], checks:[], limitations:[] };
const package48 = json('docs/betweener-connect/connect-v1-m3-3-staging-deployment-package.json');
const q = v => `'${String(v).replaceAll("'", "''")}'`;
const user = n => `f0110000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const profile = n => `f0120000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const scalar = s => s.split(/\r?\n/).filter(x=>x&&!['BEGIN','SET','COMMIT'].includes(x)).at(-1);
let failures = 0;
const check = async (name, fn) => {
  try { await fn(); receipt.checks.push({ name, status:'PASS' }); console.log('ok - '+name); }
  catch(e) { failures++; receipt.checks.push({ name, status:'FAIL', reason:String(e.message).slice(0,1500) }); console.log('not ok - '+name+' : '+String(e.message).slice(0,500)); }
};
const applied = ({ name }) => {
  const entry = package48.migrations[receipt.applied.length];
  assert.equal(name, entry.path); assert.equal(sha(read(name)),entry.sha256); receipt.applied.push(entry);
};
async function run({ sql, concurrent, file }) {
  const database=sql('select current_database()');assert.equal(database,`betweener_connect_security_test_${process.pid}`);
  const adminSql=input=>{
    const config=JSON.parse(execFileSync('docker',['inspect','supabase_db_betweener-app'],{encoding:'utf8',windowsHide:true}))[0];
    const password=config.Config.Env.find(s=>s.startsWith('POSTGRES_PASSWORD=')).slice('POSTGRES_PASSWORD='.length);
    try{return execFileSync('docker',['exec','-i','-e',`PGPASSWORD=${password}`,'supabase_db_betweener-app','psql','-U','supabase_admin','-d',database,'-X','-v','ON_ERROR_STOP=1','-At'],{input,encoding:'utf8',windowsHide:true,stdio:['pipe','pipe','pipe']}).trim();}
    catch(e){throw Error(String(e.stderr??'local_admin_fixture_failed'));}
  };
  for(const m of package48.migrations.slice(4)) { sql(file(m.path)); applied({name:m.path}); }
  sql(file('supabase/tests/fixtures/connect_v1.sql'));
  sql("update private.connect_config set environment='staging',enabled=false,voice_enabled=false,video_enabled=false,pre_match_enabled=false,provider_ready=false,end_block_enabled=false,notifications_enabled=false,staging_test_users='{}';update public.notification_prefs set push_enabled=true,quiet_hours_enabled=false where user_id::text like 'f0110000-%';notify pgrst,'reload schema'");
  await new Promise(resolve=>setTimeout(resolve,400));
  const service = command => `begin;set local role service_role;set local request.jwt.claim.role='service_role';${command};commit;`;
  const rpc = (name,args) => JSON.parse(scalar(sql(service(`select public.${name}(${args})`))));
  const tokens=[];
  const token = (n=1,patch={}) => {
    const t={ id:randomUUID(), user:user(n), token:`ExponentPushToken[offline48-${randomUUID()}]`, installation:randomUUID(),...patch };
    sql(`insert into public.push_tokens(id,user_id,token,platform,device_id,installation_id,app_version,app_environment,application_id,expo_project_id,provenance_status,verified_at)
      values(${q(t.id)},${q(t.user)},${q(t.token)},'android',${q(t.installation)},${q(t.installation)},'9.0.0','staging','com.aduboffour.betweener.staging','7f38a835-2da7-419b-a20b-e1a12e021547','verified',now())`);
    tokens.push(t); return t;
  };
  const good=token(1), foreign=token(2);
  const event = (patch={}) => {
    const e={ id:randomUUID(), recipient:user(1), actor:null, type:'system_message', data:{type:'system_message',reference:'synthetic-only'}, ...patch };
    sql(`insert into private.push_notification_events(id,delivery_kind,recipient_user_id,actor_user_id,event_type,title,body,data,idempotency_key,expires_at)
      values(${q(e.id)},'unicast',${q(e.recipient)},${e.actor?q(e.actor):'null'},${q(e.type)},'Offline fixture','Synthetic notification',${q(JSON.stringify(e.data))}::jsonb,${q(e.id)},clock_timestamp()+interval '10 minutes')`);
    return e.id;
  };
  const state = id => JSON.parse(sql(`select json_build_object('status',status,'outcome',outcome,'accepted',accepted_ticket_count,'claimed',claimed_at is not null) from private.push_notification_events where id=${q(id)}`));
  const reserved = id => Number(sql(`select count(*) from private.push_notification_delivery_reservations where event_id=${q(id)}`));
  const pendingLegacy = event(), pendingConnect=event({type:'connect_voice_incoming',data:{type:'connect_voice_incoming'}});
  let edge, proxy;
  try {
    proxy = await gateway();
    for(const variant of ['forward','v26']) {
      edge=await launch(variant,proxy.origin);
      receipt.runtime = await edge.control();
      const test = async (label,fn) => {
        // Prevent unrelated rate-window accumulation in independent cases; no reservation/event is deleted.
        sql("update private.push_notification_events set claimed_at=clock_timestamp()-interval '2 minutes' where claimed_at is not null");
        await edge.control({clear:true,fault:'',env:{CONNECT_NOTIFICATIONS_ENABLED:'false',PUSH_DELIVERY_MODE:'enabled',PUSH_APP_ENVIRONMENT:'staging',PUSH_APPLICATION_ID:'com.aduboffour.betweener.staging',PUSH_EXPO_PROJECT_ID:'7f38a835-2da7-419b-a20b-e1a12e021547',PUSH_HMAC_CURRENT_SECRET:'offline-only-signing-material-48-at-least-43-characters'}});
        await check(`${variant}: ${label}`,fn);
      };
      const messages = async()=> (await edge.control()).deliveries.flat();
      await test('starts with resolved SDK/std dependencies and external network denied',async()=> {
        const r=await edge.control();assert.equal(r.externalNetPermission,'denied');assert.equal(r.runtime.deno,'2.5.4');
      });
      await test('actual SQL dispatcher signs synthetic canonical envelope; missing key remains pending',async()=>{
        // Intercept pg_net BEFORE restoring the measured dispatcher. Never contacts its URL.
        sql('create table if not exists private.rehearsal_http(body_text text,headers jsonb)');
        adminSql(`
          create or replace function net.http_post(url text,body jsonb default '{}'::jsonb,params jsonb default '{}'::jsonb,headers jsonb default '{}'::jsonb,timeout_milliseconds integer default 5000)
          returns bigint language plpgsql as $$begin insert into private.rehearsal_http values(body::text,headers);return 48001;end$$;`);
        sql(receipt.dispatcherDefinition);
        try {
          const missing=event();sql("update private.push_config set active_signing_key_id=null,active_signing_secret_name=null");
          assert.equal(sql(`select private.dispatch_push_notification_event_v1(${q(missing)})`),'f');assert.equal(state(missing).status,'pending');
          assert.equal(sql('select count(*) from private.rehearsal_http'),'0');
          sql(`select vault.create_secret('offline-only-signing-material-48-at-least-43-characters','offline-push-48-${variant}');
            update private.push_config set active_signing_key_id='offline-48',active_signing_secret_name='offline-push-48-${variant}';`);
          const id=event();assert.equal(sql(`select private.dispatch_push_notification_event_v1(${q(id)})`),'t');
          const envelope=JSON.parse(sql('select json_build_object(\'body\',body_text,\'headers\',headers) from private.rehearsal_http limit 1'));
          assert.deepEqual(Object.keys(JSON.parse(envelope.body)),['event_id']);
          assert.equal((await edge.request(id,{body:envelope.body,time:envelope.headers['x-betweener-timestamp'],signature:envelope.headers['x-betweener-signature'],keyId:envelope.headers['x-betweener-key-id']})).status,200);
          assert.equal(state(id).status,'delivered');
        } finally {
          sql('create or replace function private.dispatch_push_notification_event_v1(p_event_id uuid) returns boolean language sql as $$select false$$;truncate private.rehearsal_http');
        }
      });
      await test('ordinary canonical unicast works while all Connect gates are off',async()=>{
        const id=event();const r=await edge.request(id);assert.equal(r.status,200);assert.equal(state(id).status,'delivered');assert.equal(reserved(id),1);
        const m=await messages();assert.equal(m.length,1);assert.equal(m[0].to,good.token);assert.deepEqual(m[0].data,{type:'system_message',reference:'synthetic-only'});
      });
      await test('duplicate and delayed signed delivery does not redeliver',async()=>{
        const id=event();assert.equal((await edge.request(id)).status,200);assert.equal((await edge.request(id)).status,409);assert.equal((await messages()).length,1);
        assert.equal((await edge.request(id,{time:Math.floor(Date.now()/1000)-181})).status,401);assert.equal(reserved(id),1);
      });
      await test('concurrent handlers claim and reserve at most once',async()=>{
        const id=event();const codes=await Promise.all([edge.request(id),edge.request(id)].map(async r=>(await r).status));assert.deepEqual(codes.sort(),[200,409]);assert.equal((await messages()).length,1);assert.equal(reserved(id),1);
      });
      await test('missing/bad HMAC and wrong key never claim an event',async()=>{
        const id=event();for(const opts of [{signature:'0'.repeat(64)},{keyId:'untrusted'}])assert.equal((await edge.request(id,opts)).status,401);assert.equal(state(id).claimed,false);assert.equal((await messages()).length,0);
      });
      await test('signed malformed/oversized/injected envelopes are rejected',async()=>{
        const id=event();for(const body of ['[]',JSON.stringify({event_id:id,title:'injected'}),JSON.stringify({event_id:id,padding:'x'.repeat(200)})])assert.ok([400,413].includes((await edge.request(id,{body})).status));assert.equal(state(id).claimed,false);
      });
      await test('missing signing configuration fails closed without claiming',async()=>{
        const id=event();await edge.control({env:{PUSH_HMAC_CURRENT_SECRET:null}});assert.equal((await edge.request(id)).status,503);assert.equal(state(id).claimed,false);
      });
      await test('disabled shared delivery fails closed without affecting durable rows',async()=>{
        const id=event();await edge.control({env:{PUSH_DELIVERY_MODE:'disabled'}});assert.equal((await edge.request(id)).status,503);assert.equal(state(id).status,'pending');
      });
      await test('inconsistent app provenance configuration fails closed',async()=>{
        const id=event();await edge.control({env:{PUSH_APPLICATION_ID:'com.aduboffour.betweener'}});assert.equal((await edge.request(id)).status,503);assert.equal(state(id).claimed,false);
      });
      await test('cross-environment, quarantined and unverified destinations are not selected',async()=>{
        const bad=token(1);sql(`update public.push_tokens set app_environment='production',application_id='com.aduboffour.betweener',quarantined_at=now(),provenance_status='quarantined' where id=${q(bad.id)}`);
        const id=event();assert.equal((await edge.request(id)).status,200);assert.deepEqual((await messages()).map(m=>m.to),[good.token]);
      });
      await test('different EAS project and missing installation cannot receive',async()=>{
        const bad=token(1);sql(`update public.push_tokens set expo_project_id='734d06b2-57f3-49f0-85cd-197a84c4c477' where id=${q(bad.id)}`);
        const id=event();assert.equal((await edge.request(id)).status,200);assert.deepEqual((await messages()).map(m=>m.to),[good.token]);
        assert.throws(()=>sql(`update public.push_tokens set expo_project_id='7f38a835-2da7-419b-a20b-e1a12e021547',installation_id=null where id=${q(bad.id)}`),/push_tokens_provenance_shape_valid/);
        sql(`delete from public.push_tokens where id=${q(bad.id)}`);
      });
      await test('disabled recipient preference suppresses canonical claim',async()=>{
        sql(`update public.notification_prefs set push_enabled=false where user_id=${q(user(1))}`);const id=event();assert.equal((await edge.request(id)).status,409);assert.equal(state(id).status,'suppressed');assert.equal((await messages()).length,0);sql(`update public.notification_prefs set push_enabled=true where user_id=${q(user(1))}`);
      });
      await test('quiet hours suppress canonical delivery',async()=>{
        sql(`update public.notification_prefs set quiet_hours_enabled=true,quiet_hours_start='00:00',quiet_hours_end='23:59:59' where user_id=${q(user(1))}`);const id=event();assert.equal((await edge.request(id)).status,409);assert.equal(state(id).status,'suppressed');sql(`update public.notification_prefs set quiet_hours_enabled=false where user_id=${q(user(1))}`);
      });
      await test('account block suppresses canonical delivery in either direction',async()=>{
        sql(`insert into public.blocks(blocker_id,blocked_id) values(${q(user(1))},${q(user(2))})`);const id=event({actor:user(2)});assert.equal((await edge.request(id)).status,409);assert.equal((await messages()).length,0);sql(`delete from public.blocks where blocker_id=${q(user(1))} and blocked_id=${q(user(2))}`);
        sql(`insert into public.blocks(blocker_id,blocked_id) values(${q(user(2))},${q(user(1))})`);assert.equal((await edge.request(event({actor:user(2)}))).status,409);assert.equal((await messages()).length,0);sql(`delete from public.blocks where blocker_id=${q(user(2))} and blocked_id=${q(user(1))}`);
      });
      await test('expired record cannot be delivered or reserved',async()=>{
        const id=event();sql(`update private.push_notification_events set created_at=now()-interval '20 minutes',expires_at=now()-interval '10 minutes' where id=${q(id)}`);assert.equal((await edge.request(id)).status,409);assert.equal(state(id).status,'expired');assert.equal(reserved(id),0);
      });
      await test('Connect pending/malformed/terminal types never become legacy pushes while disabled',async()=>{
        for(const type of ['connect_voice_incoming','connect_voice_cancelled','connect_voice_blocked','connect_voice_missed']){const id=event({type,data:{type,call_id:randomUUID(),token:'adversarial'}});assert.equal((await edge.request(id)).status,409);assert.equal(state(id).status,'suppressed');assert.equal(reserved(id),0);}assert.equal((await messages()).length,0);
      });
      await test('Edge-only Connect flag cannot bypass disabled authoritative SQL gate',async()=>{
        await edge.control({env:{CONNECT_NOTIFICATIONS_ENABLED:'true'}});const id=event({type:'connect_voice_incoming',data:{type:'connect_voice_incoming'}});assert.equal((await edge.request(id)).status,409);assert.equal((await messages()).length,0);
      });
      await test('destination reservation rejects another user token and duplicates',async()=>{
        const id=event();assert.equal(rpc('rpc_service_claim_push_notification_event_v1',q(id)).claimStatus,'claimed');
        const count=()=>Number(scalar(sql(service(`select count(*) from public.rpc_service_reserve_push_notification_deliveries_v1(${q(id)},array[${q(good.id)},${q(foreign.id)},${q(good.id)}]::uuid[])`))));assert.equal(count(),1);assert.equal(count(),0);assert.equal(reserved(id),1);
      });
      await test('mock Expo failure preserves reservation; retries cannot duplicate delivery',async()=>{
        await edge.control({fault:'expo_503'});const id=event();assert.equal((await edge.request(id)).status,502);assert.equal(state(id).status,'failed');assert.equal(reserved(id),1);await edge.control({fault:''});assert.equal((await edge.request(id)).status,409);assert.equal((await messages()).length,0);
      });
      await test('shared SQL wrapper public signatures and private delegate ACL remain compatible',()=>{
        for(const role of ['anon','authenticated','service_role'])assert.equal(sql(`select has_function_privilege(${q(role)},'public.rpc_service_claim_push_notification_event_pre_connect_v1(uuid)','EXECUTE')`),'f');
        assert.equal(sql("select has_function_privilege('service_role','public.rpc_service_claim_push_notification_event_v1(uuid)','EXECUTE')"),'t');
        assert.equal(sql("select pg_get_function_identity_arguments('public.rpc_service_reserve_push_notification_deliveries_v1(uuid,uuid[])'::regprocedure)"),'p_event_id uuid, p_token_ids uuid[]');
      });
      await test('Live campaign routes only canonical recipients with paging/reservations',async()=>{
        const session=randomUUID(),campaign=randomUUID(),id=randomUUID();
        sql(`insert into public.live_sessions(id,title,status,provider_call_id,created_by_user_id,created_by_profile_id) values(${q(session)},'Offline campaign','live',${q('offline-'+session)},${q(user(1))},${q(profile(1))});
          insert into public.live_notification_campaigns(id,session_id,kind,title,body,data) values(${q(campaign)},${q(session)},'live_now','Offline campaign','Synthetic',${q(JSON.stringify({type:'live_now',session_id:session}))}::jsonb);
          insert into public.live_notification_campaign_recipients(campaign_id,recipient_user_id,recipient_role) values(${q(campaign)},${q(user(2))},'attendee') on conflict do nothing;
          insert into private.push_notification_events(id,delivery_kind,campaign_id,event_type,data,idempotency_key,expires_at) values(${q(id)},'live_campaign',${q(campaign)},'live_now','{}',${q(id)},clock_timestamp()+interval '10 minutes')`);
        assert.equal((await edge.request(id)).status,200);assert.deepEqual((await messages()).map(m=>m.to),[foreign.token]);assert.equal(reserved(id),1);assert.equal(state(id).status,'delivered');
      });
      await edge.stop();edge=null;
      if(variant==='forward') receipt.forwardCheckpoint={passed:receipt.checks.filter(c=>c.name.startsWith('forward:')&&c.status==='PASS').length,
        pendingLegacy:state(pendingLegacy),pendingConnect:state(pendingConnect)};
    }
    edge=await launch('v26',proxy.origin);
    await check('rollback handoff: queued legacy work delivers; queued Connect work suppresses without deletion',async()=>{
      assert.equal(state(pendingLegacy).status,'pending');assert.equal(state(pendingConnect).status,'pending');
      assert.equal((await edge.request(pendingLegacy)).status,200);assert.equal((await edge.request(pendingConnect)).status,409);
      assert.equal(state(pendingLegacy).status,'delivered');assert.equal(state(pendingConnect).status,'suppressed');assert.equal(reserved(pendingLegacy),1);assert.equal(reserved(pendingConnect),0);
    });
    for(const fault of ['crash_before_reservation','crash_after_reservation','crash_after_delivery']) {
      await check(`rollback crash recovery: ${fault} preserves at-most-once state and does not invent retries`,async()=>{
        const id=event();await edge.control({fault});await assert.rejects(edge.request(id));await edge.closed;await edge.stop();edge=null;
        assert.equal(state(id).status,'processing');assert.equal(reserved(id),fault==='crash_before_reservation'?0:1);
        edge=await launch('v26',proxy.origin);assert.equal((await edge.request(id)).status,409);
        sql(`update private.push_notification_events set claimed_at=clock_timestamp()-interval '2 hours' where id=${q(id)};select private.prune_push_notification_events_v1()`);
        assert.equal(state(id).status,'failed');assert.equal(state(id).outcome,'processing_claim_abandoned');assert.equal((await edge.request(id)).status,409);
      });
    }
    await check('simultaneous SQL reservations retain one delivery per token',async()=>{
      const id=event();rpc('rpc_service_claim_push_notification_event_v1',q(id));const statement=service(`select count(*) from public.rpc_service_reserve_push_notification_deliveries_v1(${q(id)},array[${q(good.id)}]::uuid[])`);
      const counts=await Promise.all([concurrent(statement),concurrent(statement)]);assert.deepEqual(counts.map(s=>Number(scalar(s))).sort(),[0,1]);assert.equal(reserved(id),1);
    });
    await check('all Connect gates and allowlist remain disabled; no provider jobs were created',()=>{
      const c=JSON.parse(sql('select row_to_json(c) from private.connect_config c'));for(const key of package48.activation.databaseFlagsOff)assert.equal(c[key],false,key);assert.deepEqual(c.staging_test_users,[]);assert.equal(sql('select count(*) from private.connect_provider_jobs'),'0');assert.equal(sql('select count(*) from private.connect_sessions'),'0');
    });
    receipt.sqlState={ events:Number(sql('select count(*) from private.push_notification_events')), reservations:Number(sql('select count(*) from private.push_notification_delivery_reservations')),
      configs:'all Connect gates false; allowlist empty', migrationsRetained:6, downgrade:false };
  } finally { if(edge)await edge.stop(); if(proxy)await proxy.close(); }
}
(async()=>{
  receipt.dependencies=await prepare();
  await withConnectDatabase(run,{prepareBaseline:baseline(receipt),onMigrationApplied:applied});
  receipt.status=failures?'FAIL':'PASS';receipt.passed=receipt.checks.filter(c=>c.status==='PASS').length;receipt.failed=failures;
  saveJson(dir+'/rehearsal-results.json',receipt);console.log(JSON.stringify({passed:receipt.passed,failed:failures,actualPushes:0,hosted:false}));
  if(failures)process.exitCode=1;
})().catch(e=>{receipt.status='FAIL';receipt.fatal=String(e.stderr??e.message).slice(0,2500);saveJson(dir+'/rehearsal-results.json',receipt);console.error(receipt.fatal);process.exitCode=1;});
