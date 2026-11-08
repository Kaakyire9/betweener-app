const test=require('node:test'),assert=require('node:assert/strict');
const {Buffer}=require('node:buffer');
const {createNativeSessionOwner}=require('../lib/auth/native-session-owner.ts');
const {createJournalService}=require('../features/connect/journal/journal-service.ts');
const {createJournalSafetyActions}=require('../features/connect/journal/journal-safety-actions.ts');
const {journalReadRuntime}=require('../features/connect/journal/journal-runtime.ts');
const {journalContinuation}=require('../features/connect/journal/journal-continuity.ts');
const {nearbyJournalGroups}=require('../features/connect/journal/journal-presentation.ts');
const {entry,id,deferred}=require('./fixtures/connect-journal-fixture.cjs');
function auth(){const a=createNativeSessionOwner();a.accept({user:{id:id(3)},access_token:`e30.${Buffer.from(JSON.stringify({sub:id(3),session_id:id(9),exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')}.synthetic`});return a;}
test('history requests are pinned to the owner epoch; no actor parameter or credential API is sent',async()=>{
 const a=auth(),calls=[],service=createJournalService(a.owner,id(1),{rpc:async(name,args,token)=>{calls.push({name,args,pinned:token===a.owner.accessToken(a.owner.snapshot())});return{data:{items:[entry()],next_cursor:null},error:null};}});
 const page=await service.page({search:' Dufie ',limit:30});assert.equal(page.items[0].call.id,id(101));assert.equal(calls[0].pinned,true);
 assert.equal(calls[0].name,'rpc_connect_journal');assert.equal(calls[0].args.p_query.search,'Dufie');assert.equal(calls[0].args.p_query.actor,undefined);
 a.accept(null);await assert.rejects(service.page({}),/unauthenticated/);assert.equal(calls.length,1);
});
test('a late RPC response after account retirement cannot populate history',async()=>{
 const a=auth(),gate=deferred(),service=createJournalService(a.owner,id(1),{rpc:()=>gate.promise});const pending=service.page({});a.accept(null);gate.resolve({data:{items:[entry()],next_cursor:null},error:null});await assert.rejects(pending,/unauthenticated/);
});
test('forged participants and another conversation cannot enter a chat history page',async()=>{
 const a=auth(),service=createJournalService(a.owner,id(1),{rpc:async()=>({data:{items:[entry()],next_cursor:null},error:null})});
 await assert.rejects(service.page({scope:'chat',peerUserId:id(8)}),/invalid/);
});
test('safety actions require a fresh canonical peer and preserve the pinned account',async()=>{
 const a=auth();let writes=0;
 const service=createJournalService(a.owner,id(1),{rpc:async()=>({data:{items:[entry()],next_cursor:null},error:null})});
 const safety=createJournalSafetyActions(a.owner,service,{block:async(user,peer,token)=>{assert.equal(user,id(3));assert.equal(peer,id(4));assert.equal(token===a.owner.accessToken(a.owner.snapshot()),true);writes++;return{error:null};},report:async()=>({error:null})});
 await safety.block(entry());assert.equal(writes,1);a.accept(null);await assert.rejects(safety.block(entry()),/unauthenticated/);assert.equal(writes,1);
});
test('production and unapproved read activation fail closed without changing calling flags',()=>{
 const input={enabled:true,development:true,variant:'staging',environment:'staging',supabaseUrl:'https://xsgzxadwuxuziubglvps.supabase.co'};
 assert.equal(journalReadRuntime(input),true);for(const patch of [{enabled:false},{enabled:undefined},{development:false},{variant:'production'},{environment:'production'},{supabaseUrl:'https://jbyblhithbqwojhwlenv.supabase.co'}])assert.equal(journalReadRuntime({...input,...patch}),false);
});
test('return to chat requires local dismissal safety and a bound, available peer',()=>{
 const e=entry();assert.equal(journalContinuation(e.call,e,false),null);assert.equal(journalContinuation({...e.call,state:'ACTIVE'},e,true),null);
 assert.equal(journalContinuation(e.call,{...e,peer:{...e.peer,blocked:true}},true),null);
 assert.equal(journalContinuation(e.call,{...e,peer:{...e.peer,chatVisible:false}},true),null);
 assert.equal(journalContinuation(e.call,e,true).params.peerUserId,id(4));
 assert.equal(journalContinuation(e.call,{...e,peer:{...e.peer,profileId:id(8)}},true),null);
});
test('nearby grouping never combines media, direction or different outcomes; all IDs are retained',()=>{
 const rows=[entry(1),entry(2,{created_at:'2026-11-05T09:59Z'}),entry(3,{created_at:'2026-11-05T09:58Z',state:'MISSED',connected_at:null}),entry(4,{created_at:'2026-11-05T09:57Z',media:'video'})];
 const groups=nearbyJournalGroups(rows);assert.equal(groups.get(rows[0].call.id),2);assert.equal(groups.size,1);assert.equal(rows.length,4);
});
