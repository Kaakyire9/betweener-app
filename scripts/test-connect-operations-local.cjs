// Isolated PostgreSQL clone; HTTP dispatch and Stream ports replaced locally.
const assert=require('node:assert/strict');const {randomUUID}=require('node:crypto');
const {execFileSync}=require('node:child_process');
const {withConnectDatabase}=require('./lib/connect-test-database.cjs');
const {connectWebhookReceiptDigest}=require('../supabase/functions/_shared/connect-webhook.ts');
const {runConnectProviderJob,assertConnectJobAcknowledged}=require('../supabase/functions/_shared/connect-provider-worker.ts');
const q=s=>`'${String(s).replaceAll("'","''")}'`,user=n=>`f0110000-0000-4000-8000-${String(n).padStart(12,'0')}`,profile=n=>`f0120000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const scalar=s=>s.split(/\r?\n/).filter(l=>l&&!['BEGIN','COMMIT','SET'].includes(l)).at(-1);
const parse=s=>s.trim()?JSON.parse(scalar(s)):null;let passed=0;
const ok=name=>{passed++;console.log(`ok ${passed} - ${name}`)};
withConnectDatabase(async({sql,file,concurrent})=>{
  const database=sql('select current_database()');
  if(!/^betweener_connect_security_test_\d+$/.test(database))throw Error('invalid_disposable_target');
  // Elevated DB ownership is used only to replace net.http_post INSIDE this clone.
  // The password expands inside the local container; never in host args/output.
  const adminSql=input=>execFileSync('docker',['exec','-i','supabase_db_betweener-app','sh','-c',
    'PGPASSWORD="$POSTGRES_PASSWORD" exec psql -U supabase_admin -d "$1" -X -v ON_ERROR_STOP=1 -A -t',
    'connect-disposable-test',database],{input,encoding:'utf8',windowsHide:true,stdio:['pipe','pipe','pipe']});
  // No requests may enter the real pg_net queue, even inside the disposable DB.
  adminSql(`create table private.connect_mock_http(id bigint generated always as identity primary key,url text,headers jsonb,timeout_ms integer);
    create or replace function net.http_post(url text,body jsonb default '{}'::jsonb,params jsonb default '{}'::jsonb,headers jsonb default '{"Content-Type":"application/json"}'::jsonb,timeout_milliseconds integer default 2000)
    returns bigint language plpgsql security definer set search_path=pg_catalog as $$declare i bigint;begin insert into private.connect_mock_http(url,headers,timeout_ms) values(url,headers,timeout_milliseconds) returning id into i;return i;end$$;
    grant select on private.connect_mock_http to postgres;`);
  assert.equal(sql("select has_table_privilege('postgres','net._http_response','select')"),'t','real response-catalog read privilege required, never patched by this fixture');
  sql(file('docs/betweener-connect/operations/staging-worker-support.proposed.sql'));
  assert.throws(()=>sql('select private.connect_dispatch_staging_worker()'),/dispatch_unavailable/);ok('absent Vault reference fails without HTTP dispatch');
  sql("select vault.create_secret(repeat('a',64),'connect_staging_worker_secret')");
  const first=sql('select private.connect_dispatch_staging_worker()');assert.equal(first,'1');
  assert.equal(sql("select url='https://xsgzxadwuxuziubglvps.supabase.co/functions/v1/connect-provider-worker' and headers->>'x-connect-worker-secret'=repeat('a',64) and timeout_ms=20000 from private.connect_mock_http where id=1"),'t');
  assert.equal(sql('select count(*) from private.connect_staging_worker_dispatches'),'1');ok('gates-OFF dispatcher uses exact staging target and existing-secret reference');
  assert.equal(sql('select private.connect_dispatch_staging_worker()'),'');assert.equal(sql('select count(*) from private.connect_mock_http'),'1');ok('in-flight HTTP dispatch suppresses schedule overlap');
  adminSql("insert into net._http_response(id,status_code,content) values(1,200,'{\"processed\":false}')");
  assert.equal(sql('select private.connect_dispatch_staging_worker()'),'2');ok('completed no-op response allows next scheduled tick');
  sql("update private.connect_staging_worker_dispatches set dispatched_at=clock_timestamp()-interval '21 seconds' where request_id=2");
  assert.equal(sql('select private.connect_dispatch_staging_worker()'),'3');ok('missing response cannot wedge dispatch forever; durable worker lease remains the fence');
  adminSql("insert into net._http_response(id,status_code,content) values(2,503,'{\"error\":\"unavailable\"}'),(3,401,'{\"error\":\"unauthorized\"}')");
  const monitor=file('docs/betweener-connect/operations/staging-worker-monitor.sql').split('\n\n')[0];
  const output=sql(monitor);assert.match(output,/503/);assert.match(output,/401/);assert.doesNotMatch(output,/aaaaaa/);ok('monitor distinguishes failed HTTP results without exposing headers or secret values');
  for(const role of ['anon','authenticated','service_role']){
    assert.equal(sql(`select has_function_privilege(${q(role)},'private.connect_dispatch_staging_worker()','execute')`),'f');
    assert.equal(sql(`select has_table_privilege(${q(role)},'private.connect_staging_worker_dispatches','select')`),'f');
  }ok('dispatcher and operational request IDs are inaccessible to app roles');
  sql("update private.connect_config set environment='local'");assert.throws(()=>sql('select private.connect_dispatch_staging_worker()'),/dispatch_unavailable/);ok('non-staging dispatcher configuration fails closed');

  sql(file('supabase/tests/fixtures/connect_v1.sql'));
  sql("update private.connect_config set environment='local',enabled=true,voice_enabled=true,provider_ready=true");
  const auth=(n,s)=>`begin;set local role authenticated;select set_config('request.jwt.claim.sub',${q(user(n))},true);${s};commit;`;
  const device=randomUUID(),c=parse(sql(auth(1,`select public.rpc_connect_create_call(${q(profile(2))},'voice','matched',${q(randomUUID())},${q(randomUUID())},null)`)));
  const snapshot=id=>parse(sql(`select public.rpc_connect_worker_snapshot(${q(id)})`));
  const store={snapshot:async id=>snapshot(id),complete:async(j,success)=>assertConnectJobAcknowledged(sql(`select public.rpc_connect_complete_job(${q(j.call_id)},${q(j.operation)},${q(j.lease)},${success})`)==='t'),
    reconcile:async(id,m)=>{sql(`select public.rpc_connect_reconcile_media(${q(id)},${q(m.session)},array[${m.users.map(q).join(',')}]::uuid[],${m.ended})`);}};
  let down=false,ends=0,reads=0;
  const provider={provision:async()=>{},media:async()=>{reads++;return{session:'operational-session',users:[user(1),user(2)],sessionEnded:false,callEnded:false,missing:false}},
    end:async({id})=>{ends++;if(down)throw Error('synthetic_outage');return{type:'betweener_connect',id,outcome:'accepted',mediaEnforcement:'unverified'}}};
  const pump=async()=>{const job=parse(sql('select public.rpc_connect_claim_job()'));return job?runConnectProviderJob(job,store,provider):null;};
  await pump();const ring=parse(sql(`select private.connect_snapshot(${q(c.id)})`));
  sql(auth(2,`select public.rpc_connect_act(${q(c.id)},'accept',${ring.version},${q(device)})`));sql(auth(2,`select public.rpc_connect_admission(${q(c.id)},${q(device)})`));
  sql(`update private.connect_sessions set maintenance_due=clock_timestamp()-interval '1 second' where id=${q(c.id)};select public.rpc_connect_sweep()`);
  await pump();assert.equal(reads,1);assert.equal(snapshot(c.id).state,'ACTIVE');assert.equal(sql('select count(*) from private.connect_webhook_receipts'),'0');ok('sweep plus actual worker/provider GET reconciles ACTIVE without any webhook');
  const raw=JSON.stringify({type:'call.session_started',call_cid:`betweener_connect:${c.id}`,created_at:new Date().toISOString()});
  const digest1=await connectWebhookReceiptDigest(raw,c.id,'1731011','stable-delivery');const digest2=await connectWebhookReceiptDigest(raw+' ',c.id,'1731011','stable-delivery');assert.equal(digest1,digest2);
  await Promise.all([concurrent(`select public.rpc_connect_enqueue_sync(${q(c.id)},${q(digest1)})`),concurrent(`select public.rpc_connect_enqueue_sync(${q(c.id)},${q(digest2)})`)]);
  assert.equal(sql(`select count(*) from private.connect_webhook_receipts where digest=${q(digest1)}`),'1');ok('changed-body same-delivery retry deduplicates atomically in existing receipt table');
  await pump();sql("update private.connect_config set enabled=false,voice_enabled=false,video_enabled=false,pre_match_enabled=false,provider_ready=false");
  const active=parse(sql(`select private.connect_snapshot(${q(c.id)})`));sql(auth(2,`select public.rpc_connect_act(${q(c.id)},'end',${active.version},${q(device)})`));
  down=true;await pump();assert.equal(sql(`select status from private.connect_provider_jobs where call_id=${q(c.id)} and operation='end'`),'pending');assert.equal(snapshot(c.id).state,'ENDING');ok('gates OFF do not suppress cleanup; provider outage retains authoritative end and durable retry');
  down=false;sql(`update private.connect_provider_jobs set available_at=clock_timestamp() where call_id=${q(c.id)} and operation='end'`);await pump();
  assert.equal(snapshot(c.id).state,'ENDED');assert.equal(sql(`select count(*) from private.connect_occupancy where call_id=${q(c.id)}`),'0');assert.equal(ends,2);ok('same persisted end job recovers after provider return without reopening admission');
  console.log(JSON.stringify({pass:passed,fail:0,hosted:false,httpProvider:'MOCK',realSchedulesInstalled:0}));
}).catch(e=>{console.error(String(e.stderr??e.message).slice(0,1800));process.exitCode=1});
