// Disposable cloned schema and synthetic fixture users only. No credentials/provider/native requests.
const assert=require('node:assert/strict');
const {withConnectDatabase}=require('./lib/connect-test-database.cjs');
const {baseline}=require('./lib/connect-push-rehearsal/baseline.cjs');
const q=v=>`'${String(v).replaceAll("'","''")}'`;
const user=n=>`f0110000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const profile=n=>`f0120000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const call=n=>`f0550000-0000-4000-8000-${String(n).padStart(12,'0')}`;
let passed=0;
withConnectDatabase(async({sql,file,http})=>{
 sql(file('supabase/tests/fixtures/connect_v1.sql'));
 const helper=file('supabase/migrations/20260719213000_chat_trust_and_privacy_hardening.sql');
 const start=helper.indexOf('create or replace function public.can_users_chat('),end=helper.indexOf('revoke all on function public.can_users_chat');
 assert.ok(start>=0&&end>start);sql(helper.slice(start,end));
 sql(file('supabase/migrations/20260926110000_user_scoped_chat_broadcast.sql'));
 const before=sql('select to_jsonb(c) from private.connect_config c');
 sql(file('supabase/migrations/20261105031025_connect_connection_journal.sql'));
 const run=(actor,query={})=>JSON.parse(sql(`begin; set local role authenticated; select set_config('request.jwt.claim.sub',${q(user(actor))},true); select public.rpc_connect_journal(${q(JSON.stringify(query))}::jsonb); commit;`).split(/\r?\n/).find(s=>s.startsWith('{')));
 const check=(name,fn)=>{fn();passed++;console.log(`ok ${passed} - ${name}`);};
 const base=sql("select (clock_timestamp()-interval '1 day')::text");
 for(let n=1;n<=6;n++)sql(`insert into private.connect_sessions(id,caller_user_id,recipient_user_id,caller_profile_id,recipient_profile_id,caller_device,idempotency_key,media,auth_mode,state,version,created_at,accepted_at,connected_at,ended_at,deadline,reason)
 values(${q(call(n))},${q(user(1))},${q(user(2))},${q(profile(1))},${q(profile(2))},gen_random_uuid(),gen_random_uuid(),${q(n%2?'voice':'video')},'matched',${q(['ENDED','MISSED','DECLINED','CANCELLED','FAILED','ACTIVE'][n-1])},5,${q(base)},${n===1||n===6?`${q(base)}::timestamptz+interval '1 minute'`:'null'},${n===1||n===6?`${q(base)}::timestamptz+interval '2 minutes'`:'null'},${n===6?'null':`${q(base)}::timestamptz+interval '3 minutes'`},null,null)`);
 check('participant-only reads are independent of calling gates',()=>{assert.equal(run(1).items.length,6);assert.equal(run(2).items.length,6);assert.equal(run(3).items.length,0);assert.equal(run(1).items.every(e=>e.redialAllowed===false),true);assert.equal(sql('select to_jsonb(c) from private.connect_config c'),before);});
 check('canonical keyset pages do not lose equal-timestamp calls',()=>{let cursor={},ids=[];do{const p=run(1,{limit:2,...cursor});ids.push(...p.items.map(r=>r.call.id));cursor=p.next_cursor?{before:p.next_cursor.at,before_id:p.next_cursor.id}:null;}while(cursor);assert.equal(ids.length,6);assert.equal(new Set(ids).size,6);assert.deepEqual(ids,[6,5,4,3,2,1].map(call));});
 check('search, media, direction, missed and date filters remain inside the actor scope',()=>{assert.equal(run(1,{filter:'video'}).items.length,3);assert.equal(run(1,{filter:'missed'}).items.length,0);assert.equal(run(2,{filter:'missed'}).items[0].call.id,call(2));assert.equal(run(1,{direction:'incoming'}).items.length,0);assert.equal(run(3,{search:'',peer_user_id:user(2)}).items.length,0);assert.equal(run(1,{from:'2099-01-01T00:00Z'}).items.length,0);});
 check('outcome filters distinguish completion, cancellation, decline and failed setup',()=>{for(const [outcome,id]of [['ended',1],['declined',3],['cancelled',4],['failed',5]])assert.equal(run(1,{outcome}).items[0].call.id,call(id));assert.equal(run(1,{outcome:'interrupted'}).items.length,0);});
 check('read projection does not expose devices, tokens or provider metadata',()=>{const p=run(1).items[0];for(const key of ['caller_user_id','caller_device','recipient_device','provider_session_id','token','idempotency_key'])assert.equal(p.call[key],undefined);assert.equal(p.direction,'outgoing');});
 check('hidden chat removes timeline/preview access without erasing personal or peer history',()=>{sql(`insert into public.peer_visibility_prefs(user_id,peer_user_id,hidden) values(${q(user(1))},${q(user(2))},true) on conflict(user_id,peer_user_id) do update set hidden=true`);assert.equal(run(1,{scope:'chat',peer_user_id:user(2)}).items.length,0);assert.equal(run(1).items.length,6);assert.equal(run(2).items.length,6);sql(`update public.peer_visibility_prefs set hidden=false where user_id=${q(user(1))}`);});
 check('blocked relationships retain generic personal history and disable chat visibility',()=>{sql(`insert into public.blocks(blocker_id,blocked_id) values(${q(user(1))},${q(user(2))})`);const p=run(1).items[0];assert.equal(p.peer.blocked,true);assert.equal(p.peer.available,false);assert.equal(p.peer.avatar,null);assert.equal(run(1,{scope:'chat',peer_user_id:user(2)}).items.length,0);sql(`delete from public.blocks where blocker_id=${q(user(1))} and blocked_id=${q(user(2))}`);});
 check('invalid cursor and client actor parameters are rejected',()=>{assert.throws(()=>run(1,{before:'2026-11-05T00:00Z'}));assert.throws(()=>run(1,{actor:user(3)}));assert.throws(()=>run(1,{limit:500}));});
 check('canonical rows remain unwritable to mobile clients and helpers remain private',()=>{assert.equal(sql("select has_table_privilege('authenticated','private.connect_sessions','insert') or has_function_privilege('anon','public.rpc_connect_journal(jsonb)','execute') or has_function_privilege('authenticated','private.connect_journal_entry(uuid)','execute')"),'f');});
 const response=await http(user(1),'rpc/rpc_connect_journal',{p_query:{limit:2}});assert.equal(response.status,200);const body=await response.json();assert.equal(body.items.length,2);passed++;console.log(`ok ${passed} - real disposable PostgREST resolves the history contract`);
 check('participant channel authorization remains owner scoped',()=>{const policy=sql("select qual from pg_policies where schemaname='realtime' and tablename='messages' and policyname='members receive own chat broadcasts'");assert.match(policy,/auth.uid/);assert.match(policy,/realtime.topic/);});
 check('migration leaves configuration, canonical identities and durable cleanup data intact',()=>{assert.equal(sql('select to_jsonb(c) from private.connect_config c'),before);assert.equal(run(1).items.length,6);});
 check('reopening or deleting a visibility preference cannot resurrect old chat call cards',()=>{assert.equal(run(1,{scope:'chat',peer_user_id:user(2)}).items.length,0);sql(`delete from public.peer_visibility_prefs where user_id=${q(user(1))} and peer_user_id=${q(user(2))}`);assert.equal(run(1,{scope:'chat',peer_user_id:user(2)}).items.length,0);assert.equal(run(2,{scope:'chat',peer_user_id:user(1)}).items.length,6);assert.equal(run(1).items.length,6);});
 check('mobile clients cannot edit another owner visibility cutoff or forge canonical calls',()=>{assert.equal(sql("select has_table_privilege('authenticated','private.connect_journal_chat_hides','select') or has_table_privilege('authenticated','private.connect_journal_chat_hides','insert')"),'f');assert.throws(()=>sql(`begin;set local role authenticated;select set_config('request.jwt.claim.sub',${q(user(3))},true);insert into private.connect_sessions(id) values(gen_random_uuid());commit;`),/permission denied/);});
 check('repeated state reads and terminal reconciliation do not duplicate or reactivate records',()=>{sql(`select private.connect_transition(${q(call(1))},'ACTIVE')`);assert.equal(run(1,{call_id:call(1)}).items[0].call.state,'ENDED');assert.equal(new Set(run(1).items.map(e=>e.call.id)).size,6);});
 check('private invalidation payloads contain only identity/version hints and enforce owner topic access',()=>{
   assert.ok(Number(sql("select count(*) from realtime.messages where event='CONNECT_JOURNAL'"))>0);
   assert.equal(sql("select count(*) from realtime.messages where event='CONNECT_JOURNAL' and (payload ? 'call' or payload ? 'token' or payload ? 'provider_session_id')"),'0');
   const topicRead=(actor,topic)=>sql(`begin;set local role authenticated;select set_config('request.jwt.claim.sub',${q(user(actor))},true);select set_config('realtime.topic',${q(`user:${user(topic)}:chat`)},true);select count(*) from realtime.messages where event='CONNECT_JOURNAL';commit;`).split(/\r?\n/).filter(v=>/^\d+$/.test(v)).at(-1);
   assert.equal(topicRead(3,1),'0');assert.ok(Number(topicRead(1,1))>0);
 });
 check('account masking and deletion order preserve privacy and durable cleanup',()=>{
   sql(`insert into private.connect_provider_jobs(call_id,operation) values(${q(call(1))},'end') on conflict do nothing`);
   // Trusted fixture setup uses the existing profile guard; this does not validate
   // the delete-account Edge Function's separate profile-write workflow.
   sql(`begin;select set_config('app.profile_guard_write','on',true);update public.profiles set deleted_at=clock_timestamp(),account_state='deleted',is_active=false,full_name=null,username=null,avatar_url=null where id=${q(profile(2))};commit;`);
   assert.equal(run(1).items.every(e=>e.peer.available===false&&e.peer.name==='Unavailable contact'&&e.peer.avatar===null),true);
   assert.throws(()=>run(2),/connect_unavailable/);
   sql(`delete from public.swipes where swiper_id=${q(profile(2))} or target_id=${q(profile(2))};delete from public.matches where user1_id in(${q(profile(2))},${q(user(2))}) or user2_id in(${q(profile(2))},${q(user(2))});delete from public.intent_requests where actor_id=${q(profile(2))} or recipient_id=${q(profile(2))}`);
   // An eventual hard purge is stricter than the existing Auth soft-delete call.
   sql(`delete from auth.users where id=${q(user(2))}`);assert.equal(run(1).items.length,0);
   assert.equal(sql(`select count(*) from private.connect_provider_jobs where call_id=${q(call(1))} and operation='end'`),'1');
   assert.equal(sql(`select count(*) from private.connect_journal_chat_hides where peer_user_id=${q(user(2))}`),'0');
 });
 console.log(JSON.stringify({passed,failed:0,hosted:false,providerCalls:0,sharedDatabaseModified:false}));
},{prepareBaseline:baseline({reconstructed:[]})}).catch(error=>{console.error(error.message);process.exitCode=1;});
