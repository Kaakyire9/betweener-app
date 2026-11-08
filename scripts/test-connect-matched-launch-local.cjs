// Disposable local schema clone and synthetic identities only. No provider/native calls.
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { withConnectDatabase } = require('./lib/connect-test-database.cjs');
const { baseline } = require('./lib/connect-push-rehearsal/baseline.cjs');
const q = value => `'${String(value).replaceAll("'", "''")}'`;
const user = n => `f0110000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const profile = n => `f0120000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const parse = text => JSON.parse(text.trim().split(/\r?\n/).filter(s=>s.startsWith('{')).at(-1));
let passed=0;
withConnectDatabase(async ({sql,file})=>{
 for(const name of ['20261031035826_connect_end_block_local_foundation','20261031191352_connect_m3_1_intent_and_notifications','20261101060133_connect_staging_tester_scope','20261102151043_connect_media_preference_updates','20261102165936_connect_staging_video_testing']) sql(file(`supabase/migrations/${name}.sql`));
 sql(file('supabase/tests/fixtures/connect_v1.sql'));
 const run=(n,command)=>sql(`begin; set local role authenticated; select set_config('request.jwt.claim.sub',${q(user(n))},true); ${command}; commit;`);
 const check=(name,fn)=>{fn();passed++;console.log(`ok ${passed} - ${name}`);};
 sql("update private.connect_config set environment='local',enabled=true,provider_ready=true,voice_enabled=true,video_enabled=true,pre_match_enabled=true");
 const grant=run(7,`select public.rpc_connect_request_grant('f0140000-0000-4000-8000-000000000001',true,true)`).split(/\r?\n/).filter(v=>/^[0-9a-f-]{36}$/.test(v)).at(-1);
 assert.ok(grant);
 run(8,`select public.rpc_connect_decide_grant(${q(grant)},true,true)`);
 const device= randomUUID(),recipientDevice=randomUUID();
 const legacy=parse(run(7,`select public.rpc_connect_create_call(${q(profile(8))},'voice','pre_match',${q(randomUUID())},${q(device)},${q(grant)})`));
 sql(`select private.connect_transition(${q(legacy.id)},'RINGING')`);
 const accepted=parse(run(8,`select public.rpc_connect_act(${q(legacy.id)},'accept',2,${q(recipientDevice)})`));
 assert.equal(accepted.state,'ACCEPTED');
 assert.equal(parse(run(7,`select public.rpc_connect_admission(${q(legacy.id)},${q(device)})`)).admitted,true);
 sql(`select private.connect_transition(${q(legacy.id)},'ACTIVE')`);
 const grantsBefore=sql('select jsonb_agg(to_jsonb(g) order by id) from private.connect_grants g');
 const budgetBefore=sql('select staging_calls_remaining from private.connect_config');
 sql(file('supabase/migrations/20261105002952_connect_matched_only_launch.sql'));
 check('pre-match launch flag is off and cannot be enabled accidentally',()=>{
   assert.equal(sql("select private.connect_enabled('voice','pre_match') or private.connect_enabled('video','pre_match')"),'f');
   assert.throws(()=>sql('update private.connect_config set pre_match_enabled=true'),/connect_matched_only_launch/);
 });
 check('new pre-match creation and eligibility are denied with an otherwise valid grant',()=>{
   assert.equal(run(7,`select public.rpc_connect_check_eligibility(${q(profile(8))},'video','pre_match',${q(grant)})`).split(/\r?\n/).at(-2),'f');
   assert.throws(()=>run(7,`select public.rpc_connect_create_call(${q(profile(8))},'video','pre_match',${q(randomUUID())},${q(device)},${q(grant)})`),/connect_disabled/);
 });
 check('an existing active pre-match transport loses admission and retains durable cleanup',()=>{
   assert.equal(parse(run(7,`select public.rpc_connect_admission(${q(legacy.id)},${q(device)})`)).admitted,false);
   assert.equal(sql(`select state from private.connect_sessions where id=${q(legacy.id)}`),'ENDING');
   assert.equal(sql(`select count(*) from private.connect_provider_jobs where call_id=${q(legacy.id)} and operation='end'`),'1');
 });
 check('Intent grants, user preferences and test budget are preserved',()=>{
   assert.equal(sql('select jsonb_agg(to_jsonb(g) order by id) from private.connect_grants g'),grantsBefore);
   assert.equal(sql('select staging_calls_remaining from private.connect_config'),budgetBefore);
   assert.equal(sql(`select voice and video from private.connect_preferences where user_id=${q(user(8))}`),'t');
 });
 check('matched video and voice invitations remain eligible',()=>{
   for(const [actor,peer,media] of [[1,2,'video'],[5,6,'voice']]){
     const result=parse(run(actor,`select public.rpc_connect_create_call(${q(profile(peer))},${q(media)},'matched',${q(randomUUID())},${q(randomUUID())},null)`));
     assert.equal(result.media,media); assert.equal(result.authorization,'matched');
   }
 });
 check('authenticated admission grants are retained without exposing admission to anon',()=>{
   assert.equal(sql("select has_function_privilege('authenticated','public.rpc_connect_admission(uuid,uuid)','execute') and not has_function_privilege('anon','public.rpc_connect_admission(uuid,uuid)','execute')"),'t');
 });
 console.log(JSON.stringify({passed,failed:0,hosted:false,provider:false,actualMedia:false}));
},{prepareBaseline:baseline({reconstructed:[]})}).catch(error=>{console.error(error.message);process.exitCode=1;});
