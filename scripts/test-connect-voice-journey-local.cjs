// Real disposable PostgreSQL/REST, actual Auth-bound product/controllers/worker,
// synthetic provider/native ports only. No hosted queries, credentials or calls.
const assert=require('node:assert/strict');
const {randomUUID,createHash}=require('node:crypto');
const {Buffer}=require('node:buffer');
const {withConnectDatabase}=require('./lib/connect-test-database.cjs');
const {baseline}=require('./lib/connect-push-rehearsal/baseline.cjs');
const {createNativeSessionOwner}=require('../lib/auth/native-session-owner.ts');
const {createAuthenticatedConnectServices}=require('../features/connect/data/authenticated-connect-services.ts');
const {createConnectNativeSafetyComposition}=require('../features/connect/media/native-safety-composition.ts');
const {StreamVideoClientLeaseRegistry}=require('../features/live/media/stream-video-client-leases.ts');
const {issueConnectCredentials}=require('../supabase/functions/_shared/connect-credential-issuance.ts');
const {runConnectProviderJob,assertConnectJobAcknowledged}=require('../supabase/functions/_shared/connect-provider-worker.ts');
const {nativePort}=require('../__tests__/fixtures/connect-journey-native.cjs');
const fs=require('node:fs');
const dir='tmp/connect-m3-4';fs.mkdirSync(dir,{recursive:true});
const outcome={scope:'DISPOSABLE_LOCAL_ONLY',hosted:false,providerMedia:'MOCK',nativeMedia:'MOCK',checks:[],reconstructed:[]};
const frozen=JSON.parse(fs.readFileSync('docs/betweener-connect/connect-v1-m3-3-staging-deployment-package.json'));
for(const m of frozen.migrations)assert.equal(createHash('sha256').update(fs.readFileSync(m.path)).digest('hex'),m.sha256,'frozen migration drift');
outcome.migrations=[...frozen.migrations.map(m=>({path:m.path,sha256:m.sha256})),{path:'supabase/migrations/20261101060133_connect_staging_tester_scope.sql',
  sha256:createHash('sha256').update(fs.readFileSync('supabase/migrations/20261101060133_connect_staging_tester_scope.sql')).digest('hex')}];
const user=n=>`f0110000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const profile=n=>`f0120000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const q=v=>`'${String(v).replaceAll("'","''")}'`;
const scalar=s=>s.split(/\r?\n/).filter(x=>x&&!['BEGIN','COMMIT','SET'].includes(x)).at(-1);
const settle=()=>new Promise(resolve=>setImmediate(resolve));
let passed=0;
withConnectDatabase(async({sql,file,http,concurrent})=>{
  for(const name of ['20261031035826_connect_end_block_local_foundation','20261031191352_connect_m3_1_intent_and_notifications','20261101060133_connect_staging_tester_scope'])sql(file(`supabase/migrations/${name}.sql`));
  sql(file('supabase/tests/fixtures/connect_v1.sql'));sql("notify pgrst,'reload schema'");await new Promise(r=>setTimeout(r,400));
  const service=command=>JSON.parse(scalar(sql(`begin;set local role service_role;set local request.jwt.claim.role='service_role';select jsonb_build_object('value',public.${command});commit;`))).value;
  const call=id=>service(`rpc_connect_worker_snapshot(${q(id)})`);
  const check=async(name,fn)=>{try{await fn();passed++;outcome.checks.push({name,status:'PASS'});console.log('ok - '+name);}catch(e){outcome.checks.push({name,status:'FAIL',reason:String(e.message).slice(0,1600)});throw e;}};
  const members=new Map();let endFails=false;
  const provider={async provision(){},async media(s){return{session:`offline-${s.id}`,users:[...(members.get(s.id)??[])],callEnded:false,missing:false,sessionEnded:false};},
    async end({id}){if(endFails)throw Error('mock-provider-down');return{type:'betweener_connect',id,outcome:'accepted',mediaEnforcement:'unverified'};}};
  const store={snapshot:async id=>call(id),complete:async(j,ok)=>assertConnectJobAcknowledged(service(`rpc_connect_complete_job(${q(j.call_id)},${q(j.operation)},${q(j.lease)},${ok})`)),
    reconcile:async(id,m)=>{service(`rpc_connect_reconcile_media(${q(id)},${q(m.session)},array[${m.users.map(q).join(',')}]::uuid[],${m.ended})`);}};
  const pump=async()=>{const job=service('rpc_connect_claim_job()');if(job)return runConnectProviderJob(job,store,provider);};
  const drain=async()=>{for(let i=0;i<30;i++){const result=await pump();if(!result)return;}throw Error('offline_jobs_did_not_drain');};
  const peers=[];
  const make=n=>{
    const auth=createNativeSessionOwner();auth.accept({user:{id:user(n)},access_token:`e30.${Buffer.from(JSON.stringify({sub:user(n),session_id:randomUUID(),exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')}.synthetic`});
    const native=nativePort(user(n),(id,u,active)=>{if(!members.has(id))members.set(id,new Set());if(active)members.get(id).add(u);else members.get(id).delete(u);});
    let permissionCalls=0,credentialCalls=0;
    const rpc=async(name,args)=>{const r=await http(user(n),'rpc/'+name,args);const data=await r.json();return r.ok?{data,error:null}:{data:null,error:data};};
    const services=createAuthenticatedConnectServices(auth.owner,profile(n),{rpc,
      peer:async id=>({profileId:id,name:'Synthetic tester',avatar:null}),
      credentials:async(id,device)=>{
        credentialCalls++;
        return issueConnectCredentials({admit:async()=>{const r=await rpc('rpc_connect_admission',{p_call:id,p_device:device});if(r.error)throw Error(r.error.message);return r.data;},
          snapshot:async()=>call(id),issue:async()=>({apiKey:'offline',token:'synthetic-not-a-provider-token',expiresAt:new Date(Date.now()+120000).toISOString(),user:{id:user(n)},call:{id,type:'betweener_connect',cid:`betweener_connect:${id}`}})},user(n),id);
      }});
    const registry=new StreamVideoClientLeaseRegistry();
    const product=createConnectNativeSafetyComposition({auth:auth.owner,api:services.api,selfProfileId:profile(n),deviceId:randomUUID(),uuid:randomUUID,peer:services.peer,
      flags:{nativeSafetyOwner:true,endCallAndBlock:true},registry,retireOnReconnect:true,failClosedAuthority:true,
      permission:async()=>{permissionCalls++;return'granted';},loadSdk:async()=>native.sdk,lifecycle:{platform:'android',appState:()=> 'active',subscribeAppState:()=>()=>{}}});
    const peer={...product,services,auth,registry,native,counts:()=>({permissionCalls,credentialCalls})};peers.push(peer);return peer;
  };
  const stop=async p=>{if(p.owner())await p.owner().release();await settle();};
  try{
    await check('new open-test mode defaults off and empty scope still denies admission',async()=>{
      assert.equal(sql('select staging_open_testing from private.connect_config'),'f');assert.equal(sql('select staging_calls_remaining from private.connect_config'),'0');
      sql("update private.connect_config set environment='staging',enabled=true,voice_enabled=true,provider_ready=true");
      const p=make(1);assert.equal(await p.services.checkEligibility(profile(2),'voice','matched'),false);
      await assert.rejects(p.controller.start({profileId:profile(2),name:'Synthetic',avatar:null},'matched').then(()=>{if(p.controller.getSnapshot().phase==='FAILED')throw Error(p.controller.getSnapshot().error);}),/approved/);
      assert.equal(sql('select count(*) from private.connect_sessions'),'0');
    });
    await check('open staging mode cannot run outside staging or enable video; clients cannot set scope/budget',async()=>{
      assert.throws(()=>sql("update private.connect_config set environment='production',staging_open_testing=true"),/check constraint/);
      sql('update private.connect_config set staging_open_testing=true');assert.throws(()=>sql('update private.connect_config set video_enabled=true'),/connect_open_testing_staging_voice_only/);
      assert.throws(()=>sql("set role authenticated;update private.connect_config set staging_calls_remaining=100"),/permission denied/);
    });
    await check('open scope admits other matched testers but does not bypass proof, preferences or video consent',async()=>{
      const p=make(5);assert.equal(await p.services.checkEligibility(profile(6),'voice','matched'),true);
      assert.equal(await p.services.checkEligibility(profile(3),'voice','matched'),false);assert.equal(await p.services.checkEligibility(profile(6),'video','matched'),false);
      sql(`update private.connect_preferences set voice=false where user_id=${q(user(6))}`);assert.equal(await p.services.checkEligibility(profile(6),'voice','matched'),false);sql(`update private.connect_preferences set voice=true where user_id=${q(user(6))}`);
    });
    await check('zero budget denies creation and leaves no partial call/outbox',async()=>{
      const p=make(1);await p.controller.start({profileId:profile(2),name:'Synthetic',avatar:null},'matched');assert.match(p.controller.getSnapshot().error,/call limit/);
      assert.equal(sql('select count(*) from private.connect_sessions'),'0');assert.equal(sql('select count(*) from private.connect_provider_jobs'),'0');
    });
    sql('update private.connect_config set staging_calls_remaining=4,end_block_enabled=true');
    const a=make(1),b=make(2);
    await check('real create RPC and existing worker produce ringing; recipient sees no pre-answer capture',async()=>{
      assert.equal(await a.services.checkEligibility(profile(2),'voice','matched'),true);await a.controller.start({profileId:profile(2),name:'Synthetic',avatar:null},'matched');
      assert.equal(a.controller.getSnapshot().phase,'REQUESTED');await drain();await a.controller.refresh();assert.equal(a.controller.getSnapshot().phase,'RINGING');await b.controller.tick();
      assert.equal(b.controller.getSnapshot().phase,'RINGING');assert.deepEqual(b.counts(),{permissionCalls:0,credentialCalls:0});assert.equal(sql('select staging_calls_remaining from private.connect_config'),'3');
    });
    await check('idempotent creation consumes one budget slot and caller cannot accept for recipient',async()=>{
      const id=a.controller.getSnapshot().session.id;const s=call(id);
      const retry=await http(user(1),'rpc/rpc_connect_create_call',{p_peer:profile(2),p_media:'voice',p_authorization:'matched',p_key:sql(`select idempotency_key from private.connect_sessions where id=${q(id)}`),p_device:sql(`select caller_device from private.connect_sessions where id=${q(id)}`),p_grant:null});assert.equal(retry.status,200);assert.equal(sql('select staging_calls_remaining from private.connect_config'),'3');
      await assert.rejects(a.services.api.act(id,'accept',s.version,randomUUID()),/unavailable|transition/);
    });
    await check('recipient accepts; both actual controllers/owners join via dual SQL credential fences',async()=>{
      await b.controller.accept();assert.equal(b.counts().credentialCalls,1);await a.controller.refresh();assert.equal(a.counts().credentialCalls,1);
      const id=a.controller.getSnapshot().session.id;
      assert.equal(members.get(id).size,2);service(`rpc_connect_reconcile_media(${q(id)},${q('offline-'+id)},array[${q(user(1))},${q(user(2))}]::uuid[],false)`);
      await a.controller.refresh();await b.controller.refresh();assert.equal(a.controller.getSnapshot().phase,'ACTIVE');assert.equal(b.controller.getSnapshot().phase,'ACTIVE');
      assert.equal(a.native.handles.get(id).state().audioPublishing,true);assert.equal(b.native.handles.get(id).state().audioPublishing,true);assert.equal(a.native.handles.get(id).state().videoPublishing,false);
    });
    await check('mute and speaker controls use the existing native owner; ordinary end leaves durable cleanup',async()=>{
      await a.controller.toggleMute();assert.equal(a.controller.getSnapshot().muted,true);await a.controller.selectRoute('speaker');assert.equal(a.controller.getSnapshot().route,'speaker');
      await a.controller.hangup();await stop(a);await b.controller.refresh();await stop(b);
      assert.equal(a.controller.getSnapshot().phase,'ENDED');assert.equal(a.controller.getSnapshot().endStatus,'pending');assert.equal(b.controller.getSnapshot().phase,'ENDING');
      assert.equal(sql("select count(*) from private.connect_provider_jobs where operation='end' and status='pending'"),'1');
      assert.equal(a.controller.getSnapshot().localShutdown.microphone,'unverified');await drain();await a.controller.refreshEndStatus();await b.controller.refresh();await stop(b);
      assert.equal(b.controller.getSnapshot().phase,'ENDED');assert.equal(sql('select count(*) from private.connect_occupancy'),'0');assert.equal(a.controller.dismissCompletedCall(),true);assert.equal(b.controller.dismissCompletedCall(),true);
    });
    await check('decline and missed invitation terminate without issuing media credentials',async()=>{
      const before=b.counts().credentialCalls;await a.controller.start({profileId:profile(2),name:'Synthetic',avatar:null},'matched');await drain();await a.controller.refresh();await b.controller.openCall(a.controller.getSnapshot().session.id);await b.controller.decline();await a.controller.refresh();await drain();
      assert.equal(call(a.controller.getSnapshot().session.id).state,'DECLINED');assert.equal(b.counts().credentialCalls,before);a.controller.dismissCompletedCall();b.controller.dismissCompletedCall();
      await a.controller.start({profileId:profile(2),name:'Synthetic',avatar:null},'matched');await drain();const id=a.controller.getSnapshot().session.id;
      sql(`update private.connect_sessions set deadline=clock_timestamp()-interval '1 second' where id=${q(id)}`);await a.controller.refresh();assert.equal(call(id).state,'MISSED');await drain();a.controller.dismissCompletedCall();
    });
    await check('last budget slot remains usable through acceptance and refresh after counter reaches zero',async()=>{
      await a.controller.start({profileId:profile(2),name:'Synthetic',avatar:null},'matched');await drain();await a.controller.refresh();const id=a.controller.getSnapshot().session.id;
      assert.equal(sql('select staging_calls_remaining from private.connect_config'),'0');await b.controller.openCall(id);await b.controller.accept();await a.controller.refresh();assert.equal(members.get(id).size,2);
      service(`rpc_connect_reconcile_media(${q(id)},${q('offline-'+id)},array[${q(user(1))},${q(user(2))}]::uuid[],false)`);await a.controller.refresh();await b.controller.refresh();assert.equal(a.controller.getSnapshot().phase,'ACTIVE');
    });
    await check('End & Block commits while provider end fails; retries preserve pending work and deny new admission',async()=>{
      await a.controller.endCallAndBlock();await stop(a);await b.controller.refresh();await stop(b);assert.equal(a.controller.getSnapshot().endBlock.block,'saved');assert.equal(a.controller.getSnapshot().endBlock.provider,'pending');
      endFails=true;await drain();assert.equal(sql("select count(*) from private.connect_provider_jobs where operation='end' and status='pending'"),'1');
      assert.equal(await a.services.checkEligibility(profile(2),'voice','matched'),false);endFails=false;
      sql("update private.connect_provider_jobs set available_at=clock_timestamp() where operation='end' and status='pending'");await drain();await a.controller.refreshEndBlockStatus();assert.equal(a.controller.getSnapshot().endBlock.provider,'acknowledged');assert.equal(a.controller.getSnapshot().endBlock.media,'unverified');
    });
    await check('concurrent staging call inserts cannot exceed a shared one-call budget',async()=>{
      sql('update private.connect_config set staging_calls_remaining=1');
      const insert=(a,b)=>`begin;insert into private.connect_sessions(caller_user_id,recipient_user_id,caller_profile_id,recipient_profile_id,caller_device,media,auth_mode,idempotency_key) values(${q(user(a))},${q(user(b))},${q(profile(a))},${q(profile(b))},${q(randomUUID())},'voice','matched',${q(randomUUID())});commit;`;
      const results=await Promise.allSettled([concurrent(insert(5,6)),concurrent(insert(7,8))]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.match(results.find(r=>r.status==='rejected').reason.message,/connect_test_budget_exhausted/);assert.equal(sql('select staging_calls_remaining from private.connect_config'),'0');
    });
    await check('quota rollback restores its slot; turning open testing off restores the frozen empty-scope denial',async()=>{
      sql('update private.connect_config set staging_calls_remaining=1');sql(`begin;insert into private.connect_sessions(caller_user_id,recipient_user_id,caller_profile_id,recipient_profile_id,caller_device,media,auth_mode,idempotency_key) values(${q(user(9))},${q(user(10))},${q(profile(9))},${q(profile(10))},${q(randomUUID())},'voice','matched',${q(randomUUID())});rollback;`);assert.equal(sql('select staging_calls_remaining from private.connect_config'),'1');
      sql('update private.connect_config set enabled=false,voice_enabled=false,provider_ready=false,end_block_enabled=false,staging_open_testing=false,staging_calls_remaining=0');const p=make(5);assert.equal(await p.services.checkEligibility(profile(6),'voice','matched'),false);assert.equal(sql('select cardinality(staging_test_users) from private.connect_config'),'0');
    });
  }finally{for(const p of peers)await p.dispose();}
},{prepareBaseline:baseline(outcome)}).then(()=>{outcome.status='PASS';outcome.passed=passed;fs.writeFileSync(dir+'/journey-results.json',JSON.stringify(outcome,null,2)+'\n');console.log(JSON.stringify({passed,failed:0,hosted:false,realMedia:false}));})
 .catch(e=>{outcome.status='FAIL';outcome.failure=String(e.stderr??e.message).slice(0,2600);fs.writeFileSync(dir+'/journey-results.json',JSON.stringify(outcome,null,2)+'\n');console.error(outcome.failure);process.exitCode=1;});
