// Narrow disposable proof for temporary pair restriction + the atomic budget.
const assert=require('node:assert/strict'),fs=require('node:fs'),{randomUUID}=require('node:crypto');
const {withConnectDatabase}=require('./lib/connect-test-database.cjs');
const {baseline}=require('./lib/connect-push-rehearsal/baseline.cjs');
const {ownedEndSql}=require('./lib/connect-pilot-operator.cjs');
const dir='tmp/connect-pilot-scope-b-preparation';fs.mkdirSync(dir,{recursive:true});
const receipt={scope:'DISPOSABLE_LOCAL_ONLY',hosted:false,provider:'NONE',reconstructed:[],checks:[]};
const q=v=>`'${String(v).replaceAll("'","''")}'`,user=n=>`f0110000-0000-4000-8000-${String(n).padStart(12,'0')}`,profile=n=>`f0120000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const scalar=s=>s.split(/\r?\n/).filter(x=>x&&!['BEGIN','COMMIT','SET'].includes(x)).at(-1),parse=s=>JSON.parse(scalar(s));
const ok=name=>{receipt.checks.push(name);console.log(`ok ${receipt.checks.length} - ${name}`);};
withConnectDatabase(async({sql,file,concurrent})=>{
  for(const name of ['20261031035826_connect_end_block_local_foundation','20261031191352_connect_m3_1_intent_and_notifications','20261101060133_connect_staging_tester_scope'])sql(file(`supabase/migrations/${name}.sql`));
  sql(file('supabase/tests/fixtures/connect_v1.sql'));
  const scope=`update private.connect_config set environment='staging',enabled=true,voice_enabled=true,provider_ready=true,staging_open_testing=false,staging_test_users=array[${q(user(1))},${q(user(2))}]::uuid[],staging_calls_remaining=4`;
  const create=(peer=2,key=randomUUID(),device=randomUUID())=>`select public.rpc_connect_create_call(${q(profile(peer))},'voice','matched',${q(key)},${q(device)},null)`;
  const auth=(n,s)=>`begin;set local role authenticated;select set_config('request.jwt.claim.sub',${q(user(n))},true);${s};commit;`;
  const before=sql(`begin;${scope};set local role authenticated;select set_config('request.jwt.claim.sub',${q(user(1))},true);${create()};reset role;select staging_calls_remaining from private.connect_config;rollback;`);
  assert.equal(before.split(/\r?\n/).filter(x=>x&&!['BEGIN','COMMIT','ROLLBACK','SET','RESET'].includes(x)).at(-1),'4');ok('existing restricted mode reproduces an uncharged canonical call; rollback leaves no call');
  assert.equal(sql('select count(*) from private.connect_sessions'),'0');
  sql(file('docs/betweener-connect/operations/staging-pilot-budget.proposed.sql'));
  assert.equal(sql("select proacl::text from pg_proc where oid='private.connect_consume_staging_call_budget()'::regprocedure"),'{postgres=X/postgres}');ok('exact proposed patch applies only to measured definition and preserves private ACL');
  sql(scope);
  assert.equal(sql(`select private.connect_authorized(${q(profile(1))},${q(profile(2))},'voice','matched',null)`),'t');
  assert.equal(sql(`select private.connect_authorized(${q(profile(5))},${q(profile(6))},'voice','matched',null)`),'f');
  assert.throws(()=>sql(auth(5,create(6))),/connect_consent_required|connect_unavailable/);ok('temporary existing two-account scope rejects another genuinely matched pair');
  sql(`update private.connect_preferences set voice=false where user_id=${q(user(2))}`);assert.throws(()=>sql(auth(1,create())),/connect_consent_required/);sql(`update private.connect_preferences set voice=true where user_id=${q(user(2))}`);ok('scope never bypasses recipient voice consent');
  for(let n=0;n<4;n++){
    const key=randomUUID(),device=randomUUID(),statement=create(2,key,device),call=parse(sql(auth(1,statement)));
    assert.equal(sql('select staging_calls_remaining from private.connect_config'),String(3-n));
    assert.equal(parse(sql(auth(1,statement))).id,call.id);assert.equal(sql('select staging_calls_remaining from private.connect_config'),String(3-n));
    // A synthetic create ACK must settle the existing create lease before an
    // end ACK may release occupancy. No provider operation is performed here.
    const created=parse(sql('select public.rpc_connect_claim_job()'));
    assert.equal(created.call_id,call.id);assert.equal(created.operation,'create');
    assert.equal(sql(`select public.rpc_connect_complete_job(${q(call.id)},'create',${q(created.lease)},true)`),'t');
    const fresh=parse(sql(`select private.connect_snapshot(${q(call.id)})`));
    if(n===0){
      const binding={id:call.id,createdAt:call.created_at,callerUser:user(1),recipientUser:user(2),callerProfile:profile(1),recipientProfile:profile(2),providerSession:null};
      sql(ownedEndSql(binding));assert.equal(sql(`select state from private.connect_sessions where id=${q(call.id)}`),'CANCELLED');
    }else sql(auth(1,`select public.rpc_connect_act(${q(call.id)},'cancel',${fresh.version},${q(device)})`));
    const job=parse(sql(`select public.rpc_connect_claim_end(${q(call.id)})`));assert.equal(sql(`select public.rpc_connect_complete_job(${q(call.id)},'end',${q(job.lease)},true)`),'t');
  }ok('four restricted-scope calls debit exactly four slots; idempotent retries never debit again');
  assert.throws(()=>sql(auth(1,create())),/connect_test_budget_exhausted/);assert.equal(sql('select count(*) from private.connect_sessions'),'4');ok('fifth restricted-scope creation fails without another canonical call');
  sql('update private.connect_config set staging_open_testing=true,staging_test_users=array[]::uuid[],staging_calls_remaining=1');
  const insert=(a,b)=>`begin;insert into private.connect_sessions(caller_user_id,recipient_user_id,caller_profile_id,recipient_profile_id,caller_device,media,auth_mode,idempotency_key) values(${q(user(a))},${q(user(b))},${q(profile(a))},${q(profile(b))},${q(randomUUID())},'voice','matched',${q(randomUUID())});commit;`;
  const race=await Promise.allSettled([concurrent(insert(5,6)),concurrent(insert(7,8))]);assert.equal(race.filter(x=>x.status==='fulfilled').length,1);assert.equal(sql('select staging_calls_remaining from private.connect_config'),'0');ok('open staging remains supported and its final budget slot remains atomic');
  assert.equal(sql(`select private.connect_test_pair_allowed(${q(profile(5))},${q(profile(6))})`),'t');ok('no permanent pair restriction is added to open-testing architecture');
},{prepareBaseline:baseline(receipt)}).then(()=>{receipt.status='PASS';receipt.passed=receipt.checks.length;receipt.failed=0;fs.writeFileSync(dir+'/scope-rehearsal-results.json',JSON.stringify(receipt,null,2));console.log(JSON.stringify({pass:receipt.passed,fail:0,hosted:false}));}).catch(e=>{receipt.status='FAIL';receipt.failure=String(e.stderr??e.message).slice(0,1800);fs.writeFileSync(dir+'/scope-rehearsal-results.json',JSON.stringify(receipt,null,2));console.error(receipt.failure);process.exitCode=1;});
