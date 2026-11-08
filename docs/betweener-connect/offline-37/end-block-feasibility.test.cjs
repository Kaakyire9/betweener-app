'use strict';
// Private executable proposal and unchanged-code probes. No runtime exports or hosted clients.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {createHash,createHmac}=require('node:crypto');
const {VoiceController}=require('../../../features/connect/voice/voice-controller.ts');
const {StreamVoiceTransport}=require('../../../features/connect/media/stream-voice-transport.ts');
const {createConnectStreamAdapter}=require('../../../supabase/functions/_shared/connect-stream-adapter.ts');
const {issueConnectCredentials}=require('../../../supabase/functions/_shared/connect-credential-issuance.ts');
const {runConnectEndJob,runConnectProviderJob}=require('../../../supabase/functions/_shared/connect-provider-worker.ts');
const {connectWebhookCall,verifyConnectWebhook}=require('../../../supabase/functions/_shared/connect-webhook.ts');
const root='tmp/connect-end-block-37';
const source=p=>fs.readFileSync(p,'utf8');
const sha=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const protectedFiles=['supabase/functions/_shared/connect-stream-adapter.ts','features/connect/voice/voice-controller.ts','features/connect/media/stream-voice-transport.ts'];
const before=protectedFiles.map(p=>[p,sha(p)]);
let networkAttempts=0;
globalThis.fetch=()=>{networkAttempts++;throw new Error('offline_network_forbidden');};
const id='e0370000-0000-4000-8000-000000000001';
const other='e0370000-0000-4000-8000-000000000002';
const binding={id,caller_user_id:'user-a',recipient_user_id:'user-b',caller_profile_id:'profile-a',recipient_profile_id:'profile-b',media:'voice',authorization:'matched',grant:null};
const actor={user:'user-a',profile:'profile-a',owner:'account-a-generation-1',authenticated:true};
const intent=(patch={})=>({actorUser:'user-a',owner:actor.owner,call:id,peerUser:'user-b',peerProfile:'profile-b',expectedBinding:{...binding},priorWatermark:0,mode:'insert_if_absent',...patch});
const state=()=>({blocked:false,blockId:null,watermark:0,relationshipValid:true,
  calls:{[id]:{...binding,state:'ACTIVE',ended:false,version:7}},jobs:{},occupancy:true,createPending:false});
function enqueue(draft,call){
  const key=`${call}:end`;
  if(!draft.jobs[key]||draft.jobs[key].status==='done')draft.jobs[key]={status:'pending',lease:null};
}
// Sequential copy-on-commit model, not a Postgres engine or an implemented RPC.
function proposedBlock(current,who,request,{failAt}={}){
  if(who.authenticated!==true||who.user!==request.actorUser||who.owner!==request.owner)throw new Error('actor_or_owner');
  const call=current.calls[request.call];
  if(!call||!['caller_user_id','recipient_user_id'].some(k=>call[k]===who.user))throw new Error('call_authority');
  const participantProfile=call.caller_user_id===who.user?call.caller_profile_id:call.recipient_profile_id;
  const peerUser=call.caller_user_id===who.user?call.recipient_user_id:call.caller_user_id;
  const peerProfile=call.caller_user_id===who.user?call.recipient_profile_id:call.caller_profile_id;
  if(who.profile!==participantProfile||request.peerUser!==peerUser||request.peerProfile!==peerProfile
    ||JSON.stringify(request.expectedBinding)!==JSON.stringify(Object.fromEntries(Object.keys(binding).map(k=>[k,call[k]]))))throw new Error('pair_or_generation');
  if(request.mode==='confirm_existing'&&(!current.blocked||request.expectedBlockId!==current.blockId))throw new Error('block_generation_changed');
  if(!current.blocked&&request.priorWatermark!==current.watermark)throw new Error('revocation_generation_changed');
  const draft=structuredClone(current);
  if(!draft.blocked){draft.blocked=true;draft.blockId='synthetic-block-row';draft.watermark++;draft.relationshipValid=false;}
  if(failAt==='after_block')throw new Error('simulated_statement_rollback');
  for(const s of Object.values(draft.calls)){
    const pair=[s.caller_user_id,s.recipient_user_id].sort().join('|');
    if(pair!==[who.user,peerUser].sort().join('|'))continue;
    if(!s.ended){s.ended=true;s.state='ENDED';s.version++;}
    enqueue(draft,s.id);
  }
  if(failAt==='after_terminal')throw new Error('simulated_statement_rollback');
  Object.assign(current,draft);
  return {blockSaved:true,callTerminal:current.calls[request.call].ended,cleanup:'pending',mediaEnforcement:'UNVERIFIED'};
}
const canAdmit=(s,call=id)=>!s.blocked&&s.relationshipValid&&!s.calls[call].ended;
const endOnly=(s)=>{s.calls[id].state='ENDED';s.calls[id].ended=true;enqueue(s,id);};
const unblock=(s)=>{s.blocked=false;s.blockId=null;}; // Existing delete does not revive relationship proof.
const lease=(s,n)=>{s.jobs[`${id}:end`]={status:'working',lease:n};};
function finish(s,n,outcome){
  const j=s.jobs[`${id}:end`];
  if(!j||j.status!=='working'||j.lease!==n)return false;
  j.status=outcome==='END_ACCEPTED'?'done':'pending';j.lease=null;
  if(j.status==='done'&&!s.createPending)s.occupancy=false;
  return true;
}
function beginProposedAction({shutdown,commit,owner=actor.owner,currentOwner=()=>actor.owner}){
  const view={local:'STOPPING',authority:'PENDING',provider:'PENDING',media:'UNVERIFIED',rejoin:false};
  // Invoke shutdown first; never await it before issuing the server command.
  const local=Promise.resolve().then(shutdown).then(r=>{
    if(currentOwner()!==owner)return;
    view.local=['microphoneStopped','cameraStopped','publisherClosed','receptionStopped'].every(k=>r?.[k]===true)?'STOPPED_VERIFIED':'STOP_UNVERIFIED';
  },()=>{if(currentOwner()===owner)view.local='STOP_FAILED';});
  const authority=Promise.resolve().then(commit).then(r=>{
    if(currentOwner()===owner&&r?.blockSaved===true&&r?.callTerminal===true)view.authority='COMMITTED';
  },()=>{});
  return {view,local,authority};
}
const stopped=()=>({microphoneStopped:true,cameraStopped:true,publisherClosed:true,receptionStopped:true});
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};
const settle=()=>new Promise(r=>setImmediate(r));

test('source chain: existing block table, BEFORE relationship guard and AFTER Connect terminal/outbox guard',()=>{
  const rel=source('supabase/migrations/20261028064220_relationship_acceptance_authority.sql');
  const connect=source('supabase/migrations/20261028074908_connect_v1_foundation.sql');
  assert.match(rel,/relationship_block_guard before insert or update on public\.blocks/);
  assert.match(rel,/perform private\.relationship_revoke_pair\(v_a,v_b\)/);
  assert.match(connect,/connect_block_guard after insert on public\.blocks/);
  assert.match(connect,/connect_transition\(s\.id,'ENDED','blocked'\)/);
  assert.match(connect,/perform private\.connect_enqueue\(p_call,'end'\)/);
  assert.match(rel,/pg_advisory_xact_lock/);
});
test('source: account IDs are distinct from profile IDs and block INSERT RLS binds auth.uid()',()=>{
  const sql=source('supabase/migrations/20260713034644_remote_production_baseline.sql');
  assert.match(sql,/Users can block users[^\n]+auth"\."uid"\(\) = "blocker_id"/);
  assert.match(sql,/blocks_blocker_id_blocked_id_key[^\n]+UNIQUE/);
  assert.notEqual(binding.caller_user_id,binding.caller_profile_id);
});
test('source: admission serializes pair and commits denied invalidation; private terminal IDs absorb later transitions',()=>{
  const repair=source('supabase/migrations/20261029081013_connect_forensic_repair_1.sql');
  const base=source('supabase/migrations/20261028074908_connect_v1_foundation.sql');
  assert.match(repair,/relationship_lock_pair[\s\S]*connect_expire[\s\S]*'admitted',false/);
  assert.match(base,/if s\.state=p_state or s\.ended_at is not null then return/);
  assert.match(base,/private\.connect_occupancy/);
});
test('model: block, terminal call and one end intent commit together; another pair is unaffected',()=>{
  const s=state();s.calls[other]={...binding,id:other,recipient_user_id:'user-c',state:'ACTIVE',ended:false};
  const r=proposedBlock(s,actor,intent());assert.equal(r.blockSaved,true);assert.equal(s.calls[id].ended,true);
  assert.equal(canAdmit(s),false);assert.deepEqual(Object.keys(s.jobs),[`${id}:end`]);assert.equal(s.calls[other].ended,false);assert.equal(s.occupancy,true);
});
for(const failAt of ['after_block','after_terminal'])test(`model rollback at ${failAt} leaves no partial authority writes`,()=>{
  const s=state(),previous=structuredClone(s);assert.throws(()=>proposedBlock(s,actor,intent(),{failAt}));assert.deepEqual(s,previous);
});
test('model: block includes reversed pair associations and simultaneous raw/device admission is denied',()=>{
  const s=state();s.calls[other]={...binding,id:other,caller_user_id:'user-b',recipient_user_id:'user-a',state:'RECONNECTING',ended:false};
  proposedBlock(s,actor,intent());assert.equal(s.calls[other].ended,true);
  for(const device of ['device-a1','device-a2','device-b1'])assert.equal(canAdmit(s),false,`${device}: authoritative admission denied`);
});
test('model: the same account block denies matched/pre-match voice/video without granting a different media consent',()=>{
  for(const media of ['voice','video'])for(const authorization of ['matched','pre_match']){
    const s=state();s.calls[id].media=media;s.calls[id].authorization=authorization;s.calls[id].grant=authorization==='pre_match'?'synthetic-grant':null;
    const expectedBinding=Object.fromEntries(Object.keys(binding).map(k=>[k,s.calls[id][k]]));
    proposedBlock(s,actor,intent({expectedBinding}));assert.equal(canAdmit(s),false);assert.equal(s.calls[id].ended,true);
  }
});
test('model: duplicate taps/retries do not duplicate the account row or end job, nor reset a working lease',()=>{
  const s=state();proposedBlock(s,actor,intent());lease(s,'lease-a');const watermark=s.watermark;
  proposedBlock(s,actor,intent());assert.equal(s.watermark,watermark);assert.equal(Object.keys(s.jobs).length,1);assert.equal(s.jobs[`${id}:end`].lease,'lease-a');
});
for(const order of ['end-then-block','block-then-end'])test(`model serialized ${order} preserves account block and terminality`,()=>{
  const s=state();if(order==='end-then-block')endOnly(s);proposedBlock(s,actor,intent());if(order==='block-then-end')endOnly(s);
  assert.equal(s.blocked,true);assert.equal(s.calls[id].ended,true);assert.equal(Object.keys(s.jobs).length,1);
});
for(const [name,who,request]of [
  ['outsider',{...actor,user:'user-c'},intent({actorUser:'user-c'})],
  ['unauthenticated',{...actor,authenticated:false},intent()],
  ['wrong target',actor,intent({peerUser:'user-c'})],
  ['profile ID substituted for account ID',actor,intent({peerUser:'profile-b'})],
  ['wrong call',actor,intent({call:other})],
  ['wrong immutable call binding',actor,intent({expectedBinding:{...binding,media:'video'}})],
  ['old account owner',actor,intent({owner:'old-owner'})],
])test(`model rejects ${name} before any writes`,()=>{
  const s=state(),previous=structuredClone(s);assert.throws(()=>proposedBlock(s,who,request));assert.deepEqual(s,previous);
});
test('model: unblock does not restore old proof, rejoin or the terminal call ID',()=>{
  const s=state();proposedBlock(s,actor,intent());unblock(s);assert.equal(canAdmit(s),false);assert.equal(s.relationshipValid,false);assert.equal(s.calls[id].ended,true);
});
test('proposal fence: a delayed pre-block intent cannot silently re-block after unblock',()=>{
  const s=state();const old=intent();proposedBlock(s,actor,old);unblock(s);
  assert.throws(()=>proposedBlock(s,actor,old),/revocation_generation_changed/);assert.equal(s.blocked,false);
});
test('proposal fence: an already-blocked confirmation must not recreate a deleted block row',()=>{
  const s=state();proposedBlock(s,actor,intent());const confirm=intent({mode:'confirm_existing',priorWatermark:s.watermark,expectedBlockId:s.blockId});
  unblock(s);assert.throws(()=>proposedBlock(s,actor,confirm),/block_generation_changed/);
});
test('proposed local shutdown begins before commit; never waits for network completion',async()=>{
  const order=[],gate=deferred();const a=beginProposedAction({shutdown:()=>{order.push('shutdown');return stopped();},commit:()=>{order.push('commit');return gate.promise;}});
  await a.local;assert.deepEqual(order,['shutdown','commit']);assert.equal(a.view.local,'STOPPED_VERIFIED');assert.equal(a.view.authority,'PENDING');
  gate.resolve({blockSaved:true,callTerminal:true});await a.authority;assert.equal(a.view.authority,'COMMITTED');assert.equal(a.view.media,'UNVERIFIED');
});
test('model normal path: verified local stop, atomic block/end intent and accepted provider control stay separate',async()=>{
  const s=state();const a=beginProposedAction({shutdown:async()=>stopped(),commit:async()=>proposedBlock(s,actor,intent())});
  await Promise.all([a.local,a.authority]);lease(s,'normal');assert.equal(finish(s,'normal','END_ACCEPTED'),true);
  assert.equal(a.view.local,'STOPPED_VERIFIED');assert.equal(a.view.authority,'COMMITTED');assert.equal(s.jobs[`${id}:end`].status,'done');
  assert.equal(a.view.media,'UNVERIFIED');assert.equal(s.calls[id].ended,true);assert.equal(s.blocked,true);
});
test('proposed server intent proceeds even if local teardown never settles',async()=>{
  const gate=deferred();const a=beginProposedAction({shutdown:()=>gate.promise,commit:async()=>({blockSaved:true,callTerminal:true})});
  await a.authority;assert.equal(a.view.authority,'COMMITTED');assert.equal(a.view.local,'STOPPING');gate.resolve(stopped());await a.local;
});
test('model: database unavailable does not stop local shutdown or claim saved account blocking',async()=>{
  const a=beginProposedAction({shutdown:async()=>stopped(),commit:async()=>{throw new Error('database_offline');}});
  await Promise.all([a.local,a.authority]);assert.equal(a.view.local,'STOPPED_VERIFIED');assert.equal(a.view.authority,'PENDING');assert.equal(a.view.provider,'PENDING');
});
for(const mode of ['failed','unverified'])test(`model: ${mode} shutdown remains visible despite saved block`,async()=>{
  const a=beginProposedAction({shutdown:async()=>{if(mode==='failed')throw new Error('capture_failed');return {...stopped(),microphoneStopped:false};},commit:async()=>({blockSaved:true,callTerminal:true})});
  await Promise.all([a.local,a.authority]);assert.equal(a.view.local,mode==='failed'?'STOP_FAILED':'STOP_UNVERIFIED');assert.equal(a.view.authority,'COMMITTED');
});
test('model: account switching discards late ACKs and never retargets the operation to the new account',async()=>{
  const gate=deferred();let currentOwner=actor.owner;
  const a=beginProposedAction({shutdown:async()=>stopped(),commit:()=>gate.promise,currentOwner:()=>currentOwner});await a.local;
  currentOwner='account-c';gate.resolve({blockSaved:true,callTerminal:true});await a.authority;assert.equal(a.view.authority,'PENDING');assert.equal(a.view.rejoin,false);
});
test('unchanged credential issuance suppresses delivery when block commits after provider promotion',async()=>{
  let blocked=false,issued=false,admissions=0;
  await assert.rejects(issueConnectCredentials({admit:async()=>{admissions++;return blocked?{admitted:false}:{admitted:true,id,user_id:'user-a',media:'voice',call_type:'betweener_connect',state:'ACTIVE'};},
    snapshot:async()=>({...binding,media:'voice'}),issue:async()=>{issued=true;blocked=true;return {token:'synthetic-token'};}},'user-a',id),/connect_unavailable/);
  assert.equal(issued,true);assert.equal(admissions,2); // Side effect may remain; no token response delivered.
});
test('unchanged first admission fence prevents issuing after authoritative block',async()=>{
  let issued=false;await assert.rejects(issueConnectCredentials({admit:async()=>({admitted:false}),snapshot:async()=>null,issue:async()=>{issued=true;}},'user-a',id));assert.equal(issued,false);
});
test('model: held credentials and promoted provider membership are NOT a remote-expiry proof',()=>{
  const s=state();proposedBlock(s,actor,intent());const adversary={heldToken:true,promoted:true,ignoresCleanup:true,streamEndReachable:false};
  assert.equal(canAdmit(s),false);assert.equal(adversary.heldToken&&adversary.promoted&&adversary.ignoresCleanup,true);
  assert.equal(s.occupancy,true); // Deliberately no assertion that the remote media stops.
});
function adapterWithEnd(end){return createConnectStreamAdapter({video:{call:()=>({end})}},1731011);}
test('unchanged adapter still resolves a contradictory code16/401: a documented repair blocker',async()=>{
  await assert.doesNotReject(adapterWithEnd(async()=>{throw {code:16,metadata:{responseCode:401}};}).end({id}));
});
test('unchanged end worker retains failed cleanup while authoritative block remains committed',async()=>{
  const s=state();proposedBlock(s,actor,intent());const completions=[];
  const r=await runConnectEndJob({operation:'end',call_id:id,lease:'x'},{complete:async(_,ok)=>completions.push(ok)},adapterWithEnd(async()=>{throw new Error('provider_offline');}));
  assert.equal(r.success,false);assert.deepEqual(completions,[false]);assert.equal(s.blocked,true);assert.equal(s.calls[id].ended,true);
});
for(const outcome of ['TIMEOUT','AUTH_REJECTED','AMBIGUOUS','KICK_BLOCK_ACCEPTED'])test(`model: ${outcome} cannot discharge the durable end obligation`,()=>{
  const s=state();proposedBlock(s,actor,intent());lease(s,'1');finish(s,'1',outcome);assert.equal(s.jobs[`${id}:end`].status,'pending');assert.equal(s.occupancy,true);
});
test('model: an accepted end clears only control work; interrupted retry is lease-fenced',()=>{
  const s=state();proposedBlock(s,actor,intent());lease(s,'old');lease(s,'new');assert.equal(finish(s,'old','END_ACCEPTED'),false);
  assert.equal(finish(s,'new','END_ACCEPTED'),true);assert.equal(s.occupancy,false);assert.equal(s.blocked,true);assert.equal(s.calls[id].ended,true);
});
test('model: outstanding create work prevents occupancy release even after an end ACK',()=>{
  const s=state();s.createPending=true;proposedBlock(s,actor,intent());lease(s,'1');finish(s,'1','END_ACCEPTED');assert.equal(s.occupancy,true);
});
test('unchanged worker retries after accepted end but interrupted database completion (mock replay only)',async()=>{
  let ends=0,failed=false;const completions=[];
  const job={operation:'end',call_id:id,lease:'current'};
  const store={complete:async(_,ok)=>{completions.push(ok);if(ok&&!failed){failed=true;throw new Error('lost_database_ack');}}};
  const provider={end:async()=>{ends++;}};
  assert.equal((await runConnectEndJob(job,store,provider)).success,false);
  assert.equal((await runConnectEndJob({...job,lease:'retry'},store,provider)).success,true);
  assert.equal(ends,2);assert.deepEqual(completions,[true,false,true]);
});
test('unchanged worker compensates provider creation that races a committed terminal block',async()=>{
  let reads=0,ended=0;const completions=[];
  const r=await runConnectProviderJob({operation:'create',call_id:id,lease:'1'},
    {snapshot:async()=>++reads===1?{id,state:'REQUESTED',ended_at:null,can_provision:true}:{id,state:'ENDED',ended_at:'synthetic-commit',can_provision:false},complete:async(_,ok)=>completions.push(ok)},
    {provision:async()=>{},end:async()=>{ended++;}});
  assert.equal(r.success,true);assert.equal(ended,1);assert.deepEqual(completions,[true]);
});
test('unchanged webhook signature/CID/age checks reject wrong-scope and delayed hints; duplicate hints never prove media',async()=>{
  const now=Date.now(),raw=JSON.stringify({type:'call.ended',call_cid:`betweener_connect:${id}`,created_at:new Date(now).toISOString()});
  const signature=createHmac('sha256','synthetic-only-secret').update(raw).digest('hex');
  assert.equal(await verifyConnectWebhook(raw,signature,'synthetic-only-secret'),true);assert.equal(await verifyConnectWebhook(raw,signature,'wrong'),false);
  assert.equal(connectWebhookCall(raw,now),id);assert.equal(connectWebhookCall(raw,now),id);assert.equal(connectWebhookCall(raw,now+6*60_000),null);
  assert.equal(connectWebhookCall(raw.replace('betweener_connect','betweener_live'),now),null);
  const sql=source('supabase/migrations/20261028074908_connect_v1_foundation.sql');
  assert.match(sql,/connect_webhook_receipts\(digest\)[\s\S]*on conflict do nothing/);
});
test('unchanged sync worker ignores delayed hints for a terminal call instead of reopening it',async()=>{
  let reads=0;
  const result=await runConnectProviderJob({operation:'sync',call_id:id,lease:'1'},
    {snapshot:async()=>({id,state:'ENDED',ended_at:'synthetic-commit'}),complete:async()=>{},reconcile:async()=>{throw new Error('terminal_reconcile_forbidden');}},
    {media:async()=>{reads++;throw new Error('terminal_media_read_forbidden');}});
  assert.equal(result.success,true);assert.equal(reads,0);
});
const credentials=()=>({apiKey:'synthetic-key',token:'synthetic-token',media:'voice',expiresAt:new Date(Date.now()+60_000).toISOString(),user:{id:'user-a'},call:{id,cid:`betweener_connect:${id}`,type:'betweener_connect'}});
function transportFixture(fail=false){
  let failing=fail;
  const calls=[];const op=name=>async()=>{calls.push(name);if(failing)throw new Error('synthetic_shutdown_failure');};
  const transport=new StreamVoiceTransport(async()=>({call:{camera:{disable:op('camera')},microphone:{disable:op('microphone'),enable:op('enable')},state:{callingState$:{subscribe:()=>({unsubscribe(){}})}},join:op('join'),leave:op('leave')},release:op('release'),routes:()=>[],selectRoute:async()=>{}}));
  return {transport,calls,failCleanup:()=>{failing=true;}};
}
test('unchanged transport attempts microphone/camera disable before leave/release (mock order only)',async()=>{
  const f=transportFixture();await f.transport.join(credentials(),async()=>credentials(),()=>{});f.calls.length=0;
  await f.transport.leave();assert.deepEqual(f.calls,['microphone','camera','leave','release']);
  await assert.rejects(f.transport.join(credentials(),async()=>credentials(),()=>{}),/connect_unavailable/);
});
test('unchanged transport suppresses cleanup failures; resolved leave is not verified shutdown',async()=>{
  const f=transportFixture();await f.transport.join(credentials(),async()=>credentials(),()=>{});
  f.failCleanup();f.calls.length=0;
  await assert.doesNotReject(f.transport.leave());assert.deepEqual(f.calls,['microphone','camera','leave','release']);
});
function controllerFixture(leave){
  const actions=[];const session={...binding,state:'RINGING',version:1,deadline:null,ended_at:null};
  const controller=new VoiceController({api:{createCall:async()=>session,act:async()=>{actions.push('server');throw new Error('database_offline');},getCall:async()=>{throw new Error('database_offline');}},
    transport:{leave},selfProfileId:'profile-a',userId:'user-a',deviceId:'device-a',permission:async()=> 'granted',uuid:()=>id,now:()=>Date.now(),peer:async()=>({profileId:'profile-b',name:'Fixture',avatar:null})});
  return {controller,actions};
}
test('unchanged controller can render ENDED despite failed local shutdown and failed server intent',async()=>{
  const f=controllerFixture(async()=>{throw new Error('shutdown_failed');});await f.controller.start({profileId:'profile-b'},'matched');
  await f.controller.hangup();assert.equal(f.controller.getSnapshot().phase,'ENDED');assert.ok(f.actions.length>0);
});
test('unchanged controller waits for local leave before server end: proposal must remove that dependency',async()=>{
  const gate=deferred();const f=controllerFixture(()=>gate.promise);await f.controller.start({profileId:'profile-b'},'matched');
  const ending=f.controller.hangup();await settle();assert.equal(f.actions.length,0);gate.resolve();await ending;assert.ok(f.actions.length>0);
});
test('installed SDK distinguishes call block, combined kick/block and platform user blocking',()=>{
  const sdk=`${process.env.LOCALAPPDATA}/deno/npm/registry.npmjs.org/@stream-io/node-sdk/0.7.63/src`;
  const api=source(`${sdk}/gen/video/VideoApi.ts`),models=source(`${sdk}/gen/models/index.ts`),common=source(`${sdk}/gen/common/CommonApi.ts`);
  assert.match(api,/async kickUser[\s\S]*?block: request\?\.block[\s\S]*?call\/\{type\}\/\{id\}\/kick/);
  assert.match(api,/async blockUser[\s\S]*?call\/\{type\}\/\{id\}\/block/);
  assert.match(common,/async blockUsers[\s\S]*?\/users\/block/);
  assert.match(models,/interface KickUserRequest[\s\S]*?block\?: boolean/);
  for(const name of ['BlockUserResponse','KickUserResponse','EndCallResponse'])assert.match(models,new RegExp(`interface ${name} \\{[\\s\\S]*?duration: string;`));
});
test.after(()=>{
  for(const [p,h]of before)assert.equal(sha(p),h);assert.equal(networkAttempts,0);
  const directory=fs.mkdtempSync(`${root}/focused-`);
  fs.writeFileSync(`${directory}/scope.json`,JSON.stringify({networkAttempts,scope:'OFFLINE_MODELS_AND_UNCHANGED_CODE_WITH_MOCKS',databaseEngineExecuted:false,nativeShutdownVerified:false,providerBlockEndVerified:false,remoteRevocationBound:'UNVERIFIED'},null,2)+'\n',{flag:'wx'});
  console.log(`END_BLOCK_SCOPE=${directory}/scope.json`);
});
