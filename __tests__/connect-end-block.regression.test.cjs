const test = require('node:test');
const assert = require('node:assert/strict');
const { VoiceController } = require('../features/connect/voice/voice-controller.ts');
const { StreamVoiceTransport } = require('../features/connect/media/stream-voice-transport.ts');
const { isLocalShutdownVerified, unverifiedShutdown, normalizeShutdown } = require('../features/connect/media/local-shutdown.ts');
const { connectFeatureFlags } = require('../features/connect/config/connect-feature-flags.ts');
const { createConnectRepository } = require('../features/connect/data/connect-repository.ts');
const { createConnectStreamAdapter } = require('../supabase/functions/_shared/connect-stream-adapter.ts');
const { runConnectEndJob, assertConnectJobAcknowledged } = require('../supabase/functions/_shared/connect-provider-worker.ts');
const { readEndBlockReceipt } = require('../features/connect/domain/end-block.ts');
let networkAttempts = 0;
globalThis.fetch = () => { networkAttempts++; throw new Error('offline_network_forbidden'); };
const uuid = n => `ee380000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const id=uuid(1), self=uuid(2), peer=uuid(3), selfUser=uuid(4), peerUser=uuid(5);
const session=()=>({id,caller_profile_id:self,recipient_profile_id:peer,media:'voice',authorization:'matched',state:'RINGING',version:1,
  created_at:'2026-10-31T00:00:00+00:00',accepted_at:null,connected_at:null,ended_at:null,deadline:null,reason:null,duration_seconds:null});
const context=()=>({call_id:id,generation:session().created_at,actor_user_id:selfUser,peer_user_id:peerUser,peer_profile_id:peer,
  caller_profile_id:self,recipient_profile_id:peer,media:'voice',authorization:'matched',grant_id:null,block_id:null,revocation_at:null});
const receipt=(c,key,patch={})=>({call_id:c.call_id,generation:c.generation,actor_user_id:c.actor_user_id,peer_user_id:c.peer_user_id,
  peer_profile_id:c.peer_profile_id,request_id:key,block:'saved',call:'terminal',provider:'pending',media:'unverified',...patch});
// This proof is a mock owner observation, never physical-device evidence.
const mockVerified=()=>({microphone:'verified',camera:'verified',publication:'verified',playback:'verified',subscriptions:'verified',sdkLeave:'completed',resourceRelease:'completed'});
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};
const settle=()=>new Promise(r=>setImmediate(r));
function fixture(flags={endCallAndBlock:true}){
  const events=[];let keys=10;
  const api={async createCall(){return session();},async act(){events.push('ordinary-end');return {...session(),state:'ENDED',ended_at:'synthetic'};},
    async getCall(){return session();},async getHistory(){return [];},async credentials(){throw new Error('not_joining');},
    async prepareEndBlock(){events.push('prepare');return context();},async endCallAndBlock(c,key){events.push(['block',c,key]);return receipt(c,key);},async getEndBlockStatus(){return null;}};
  const transport={async leave(){events.push('leave');return unverifiedShutdown();},async join(){},async setMuted(){},routes:()=>[],async selectRoute(){}};
  const controller=new VoiceController({api,transport,selfProfileId:self,userId:selfUser,deviceId:uuid(6),permission:async()=> 'granted',uuid:()=>uuid(++keys),now:()=>Date.now(),peer:async()=>({profileId:peer,name:'Fixture',avatar:null}),...(flags?{flags}:{})});
  return {api,transport,controller,events,start:()=>controller.start({profileId:peer,name:'Fixture',avatar:null},'matched')};
}
test('default-off action has no RPC, shutdown or UI side effects',async()=>{
  assert.equal(connectFeatureFlags.endCallAndBlock,false);const f=fixture(null);await f.start();const previous=f.controller.getSnapshot();
  await assert.rejects(f.controller.endCallAndBlock(),/connect_disabled/);assert.equal(f.events.length,0);assert.deepEqual(f.controller.getSnapshot(),previous);
});
test('combined action starts local shutdown before RPC and returns separate authority/provider states',async()=>{
  const f=fixture();f.transport.leave=async()=>{f.events.push('leave');return mockVerified();};await f.start();await f.controller.endCallAndBlock();await settle();
  assert.deepEqual(f.events.slice(0,2),['leave','prepare']);const v=f.controller.getSnapshot();assert.equal(isLocalShutdownVerified(v.localShutdown),true);
  assert.equal(v.endBlock.block,'saved');assert.equal(v.endBlock.call,'terminal');assert.equal(v.endBlock.provider,'pending');assert.equal(v.endBlock.media,'unverified');
});
test('duplicate taps share the same key and in-flight operation',async()=>{
  const f=fixture(),gate=deferred();f.api.prepareEndBlock=()=>gate.promise;await f.start();const a=f.controller.endCallAndBlock(),b=f.controller.endCallAndBlock();
  assert.equal(a,b);gate.resolve(context());await Promise.all([a,b]);assert.equal(f.events.filter(e=>Array.isArray(e)&&e[0]==='block').length,1);
});
test('hanging leave cannot delay the authoritative block command',async()=>{
  const f=fixture();f.transport.leave=()=>new Promise(()=>{});await f.start();await f.controller.endCallAndBlock();
  assert.equal(f.controller.getSnapshot().endBlock.block,'saved');assert.equal(f.controller.getSnapshot().localShutdown.sdkLeave,'pending');
});
test('throwing local shutdown stays unverified while server block can commit',async()=>{
  const f=fixture();f.transport.leave=()=>{throw new Error('shutdown_failed');};await f.start();await f.controller.endCallAndBlock();await settle();
  assert.equal(f.controller.getSnapshot().localShutdown.sdkLeave,'failed');assert.equal(isLocalShutdownVerified(f.controller.getSnapshot().localShutdown),false);
  assert.equal(f.controller.getSnapshot().endBlock.block,'saved');
});
test('database failure never claims a saved block or provider end',async()=>{
  const f=fixture();f.api.prepareEndBlock=async()=>{throw new Error('db_down');};await f.start();await f.controller.endCallAndBlock();
  const v=f.controller.getSnapshot();assert.equal(v.endBlock.block,'pending');assert.equal(v.endBlock.call,'pending');assert.equal(v.endBlock.provider,'pending');assert.ok(v.endBlock.error);
});
test('failed preparation cannot renew an old intent baseline after an intervening unblock',async()=>{
  const f=fixture();let preparations=0;f.api.prepareEndBlock=async()=>{preparations++;throw new Error('lost_context');};
  await f.start();await f.controller.endCallAndBlock();f.api.prepareEndBlock=async()=>{preparations++;return context();};
  await f.controller.endCallAndBlock();assert.equal(preparations,1);assert.equal(f.events.some(e=>Array.isArray(e)),false);
});
test('retry after lost response reuses context/key and never refreshes the revocation baseline',async()=>{
  const f=fixture();let contexts=0;const commands=[];
  f.api.prepareEndBlock=async()=>{contexts++;return context();};f.api.endCallAndBlock=async(c,key)=>{commands.push([c,key]);if(commands.length===1)throw new Error('lost');return receipt(c,key,{block:'no_longer_saved'});};
  await f.start();await f.controller.endCallAndBlock();await f.controller.endCallAndBlock();
  assert.equal(contexts,1);assert.deepEqual(commands[0],commands[1]);assert.equal(f.controller.getSnapshot().endBlock.block,'no_longer_saved');
});
test('lost command ACK reconciles by read and keeps remote enforcement unverified',async()=>{
  const f=fixture();f.api.endCallAndBlock=async()=>{throw new Error('lost_ack');};f.api.getEndBlockStatus=async c=>receipt(c,uuid(12),{provider:'acknowledged'});
  await f.start();await f.controller.endCallAndBlock();assert.equal(f.controller.getSnapshot().endBlock.provider,'acknowledged');assert.equal(f.controller.getSnapshot().endBlock.media,'unverified');
});
test('read-only status refresh observes worker ACK and unblock without another write',async()=>{
  const f=fixture();await f.start();await f.controller.endCallAndBlock();const writes=f.events.filter(e=>Array.isArray(e)).length;
  f.api.getEndBlockStatus=async c=>receipt(c,uuid(12),{provider:'acknowledged'});await f.controller.refreshEndBlockStatus();
  assert.equal(f.controller.getSnapshot().endBlock.provider,'acknowledged');
  f.api.getEndBlockStatus=async c=>receipt(c,uuid(12),{block:'no_longer_saved',provider:'acknowledged'});await f.controller.tick();
  assert.equal(f.controller.getSnapshot().endBlock.block,'no_longer_saved');assert.equal(f.events.filter(e=>Array.isArray(e)).length,writes);
  assert.equal(f.controller.getSnapshot().endBlock.media,'unverified');
});
test('wrong account context is rejected before the write and never used for reconciliation',async()=>{
  const f=fixture();let reads=0;f.api.prepareEndBlock=async()=>({...context(),actor_user_id:peerUser});f.api.getEndBlockStatus=async()=>{reads++;return null;};
  await f.start();await f.controller.endCallAndBlock();assert.equal(f.events.some(e=>Array.isArray(e)),false);assert.equal(reads,0);assert.equal(f.controller.getSnapshot().endBlock.block,'pending');
});
for(const patch of [{peer_user_id:selfUser},{call_id:uuid(9)},{generation:'2000-01-01'},{peer_profile_id:self},{media:'video'}])test(`wrong context binding ${Object.keys(patch)[0]} cannot write`,async()=>{
  const f=fixture();f.api.prepareEndBlock=async()=>({...context(),...patch});await f.start();await f.controller.endCallAndBlock();assert.equal(f.events.some(e=>Array.isArray(e)),false);
});
test('account logout retires an in-flight preparation and cannot retarget its write',async()=>{
  const f=fixture(),gate=deferred();f.api.prepareEndBlock=()=>gate.promise;await f.start();const action=f.controller.endCallAndBlock();await f.controller.logout();gate.resolve(context());await action;
  assert.equal(f.events.some(e=>Array.isArray(e)),false);assert.equal(f.controller.getSnapshot().endBlock,null);assert.equal(f.controller.getSnapshot().session,null);
});
test('dispose ignores late saved-block ACK and never restarts capture',async()=>{
  const f=fixture(),gate=deferred();f.api.endCallAndBlock=()=>gate.promise;await f.start();const action=f.controller.endCallAndBlock();await settle();await f.controller.dispose();
  const before=f.controller.getSnapshot();gate.resolve(receipt(context(),uuid(12)));await action;assert.equal(f.controller.getSnapshot(),before);
});
test('ordinary End Call remains separate and can race block without erasing its receipt',async()=>{
  const f=fixture(),gate=deferred();f.api.endCallAndBlock=(c,key)=>gate.promise.then(()=>receipt(c,key));await f.start();const combined=f.controller.endCallAndBlock();await settle();
  await f.controller.hangup();gate.resolve();await combined;assert.ok(f.events.includes('ordinary-end'));assert.equal(f.controller.getSnapshot().endBlock.block,'saved');
  const ordinary=fixture();await ordinary.start();await ordinary.controller.hangup();assert.equal(ordinary.events.some(e=>Array.isArray(e)),false);assert.equal(ordinary.controller.getSnapshot().endBlock,null);
});
test('a second-device read can observe committed authority without claiming its local device is stopped',async()=>{
  const f=fixture();f.api.endCallAndBlock=async()=>{throw new Error('other_device_won');};f.api.getEndBlockStatus=async c=>receipt(c,uuid(99));
  await f.start();await f.controller.endCallAndBlock();assert.equal(f.controller.getSnapshot().endBlock.block,'saved');assert.equal(isLocalShutdownVerified(f.controller.getSnapshot().localShutdown),false);
});
test('remote enforcement assertions in an RPC receipt are rejected',()=>{
  assert.throws(()=>readEndBlockReceipt(receipt(context(),uuid(10),{media:'verified'}),context()));
  assert.throws(()=>readEndBlockReceipt(receipt(context(),uuid(10),{actor_user_id:peerUser}),context()));
  assert.throws(()=>readEndBlockReceipt(receipt(context(),uuid(10),{block:['saved']}),context()));
});
test('coerced shutdown evidence and an old-owner late inspection cannot become verified',async()=>{
  assert.equal(normalizeShutdown({microphone:['verified']}).microphone,'unverified');
  const f=fixture(),gate=deferred();f.transport.leave=()=>gate.promise;await f.start();await f.controller.endCallAndBlock();await f.controller.logout();
  gate.resolve(mockVerified());await settle();assert.equal(isLocalShutdownVerified(f.controller.getSnapshot().localShutdown),false);
});
test('repository submits only the bound context and parses the structured result',async()=>{
  const calls=[];const repo=createConnectRepository({async rpc(name,args){calls.push([name,args]);return {data:name.endsWith('_context')?context():receipt(context(),uuid(10)),error:null};}});
  const c=await repo.prepareEndBlock(session(),peer);await repo.endCallAndBlock(c,uuid(10));
  assert.equal(calls[1][0],'rpc_connect_end_call_and_block');assert.deepEqual(calls[1][1],{p_call:id,p_peer:peer,p_generation:session().created_at,p_key:uuid(10),p_context:context()});
});
function transportFixture(){
  const events=[];let fail=false,hang=false;
  const bindings={call:{camera:{async disable(){events.push('camera');if(fail)throw new Error('camera');}},microphone:{async disable(){events.push('microphone');if(hang)await new Promise(()=>{});if(fail)throw new Error('mic');},async enable(){}},
    state:{callingState$:{subscribe:()=>({unsubscribe(){}})}},async join(){},async leave(){events.push('leave');if(fail)throw new Error('leave');}},
    async release(){events.push('release');if(fail)throw new Error('release');},routes:()=>[],async selectRoute(){}};
  const transport=new StreamVoiceTransport(async()=>bindings);
  const credentials={apiKey:'synthetic',token:'synthetic',media:'voice',expiresAt:new Date(Date.now()+120000).toISOString(),user:{id:selfUser},call:{id,cid:`betweener_connect:${id}`,type:'betweener_connect'}};
  return {transport,bindings,events,credentials,setFail:()=>{fail=true;},setHang:()=>{hang=true;}};
}
test('resolved SDK stop/leave/release without an owner inspector stays unverified',async()=>{
  const f=transportFixture();await f.transport.join(f.credentials,async()=>f.credentials,()=>{});const r=await f.transport.leave();
  assert.equal(r.sdkLeave,'completed');assert.equal(r.resourceRelease,'completed');assert.equal(r.microphone,'unverified');assert.equal(r.playback,'unverified');assert.equal(isLocalShutdownVerified(r),false);
});
test('individual SDK failures are retained and not suppressed into full shutdown',async()=>{
  const f=transportFixture();await f.transport.join(f.credentials,async()=>f.credentials,()=>{});f.setFail();const r=await f.transport.leave();
  assert.equal(r.microphone,'failed');assert.equal(r.camera,'failed');assert.equal(r.sdkLeave,'failed');assert.equal(r.resourceRelease,'failed');assert.equal(isLocalShutdownVerified(r),false);
});
test('stalled microphone stop cannot suppress camera stop, leave or lease release attempts',async()=>{
  const f=transportFixture();await f.transport.join(f.credentials,async()=>f.credentials,()=>{});f.events.length=0;f.setHang();void f.transport.leave();await settle();
  // Retire/close the publisher first; capture stop attempts remain independent.
  assert.deepEqual(f.events,['leave','microphone','camera','release']);
});
test('mock native-owner inspection supplies separate capture/publication/playback/subscription facts',async()=>{
  const f=transportFixture();f.bindings.inspectShutdown=async()=>({microphoneStopped:true,cameraStopped:true,publicationStopped:true,playbackStopped:false,subscriptionsStopped:true});
  await f.transport.join(f.credentials,async()=>f.credentials,()=>{});const r=await f.transport.leave();assert.equal(r.microphone,'verified');assert.equal(r.publication,'verified');
  assert.equal(r.playback,'unverified');assert.equal(r.subscriptions,'verified');assert.equal(isLocalShutdownVerified(r),false);
});
test('starting another generation never borrows the earlier shutdown proof',async()=>{
  const f=transportFixture();f.bindings.inspectShutdown=async()=>({microphoneStopped:true,cameraStopped:true,publicationStopped:true,playbackStopped:true,subscriptionsStopped:true});
  const gate=deferred();let first=true;
  const transport=new StreamVoiceTransport(async()=>{if(first){first=false;return f.bindings;}return gate.promise;});
  await transport.join(f.credentials,async()=>f.credentials,()=>{});assert.equal(isLocalShutdownVerified(await transport.leave()),true);
  const joining=transport.join({...f.credentials,call:{...f.credentials.call,id:uuid(40),cid:`betweener_connect:${uuid(40)}`}},async()=>f.credentials,()=>{});
  assert.equal(isLocalShutdownVerified(await transport.leave()),false);gate.resolve({...f.bindings});await joining;
});
const accepted = () => ({type:'betweener_connect',id,outcome:'accepted',mediaEnforcement:'unverified'});
function providerFixture(){
  let ends=0,gets=0;const port={async getOrCreate(){},async updateCallMembers(){},async end(){ends++;return {duration:'1ms',metadata:{responseCode:200}};},async get(){gets++;throw {code:16,metadata:{responseCode:404}};}};
  const stream={async getApp(){return {app:{id:1731011,disable_auth_checks:false,disable_permissions_checks:false}};},video:{call(type,callId){assert.equal(type,'betweener_connect');assert.equal(callId,id);return port;},async getCallType(){throw new Error('ending must not require unchanged type settings');}}};
  return {port,stream,adapter:createConnectStreamAdapter(stream,1731011),counts:()=>({ends,gets})};
}
test('qualified server end still needs readback and returns scoped absence without media proof',async()=>{
  const f=providerFixture();assert.deepEqual(await f.adapter.end({id}),{...accepted(),outcome:'absent'});assert.equal(f.counts().gets,1);
});
for(const [status,code,category]of [[401,16,'permission'],[403,16,'permission'],[503,16,'ambiguous'],[undefined,16,'ambiguous'],[404,'16','ambiguous'],['404',16,'ambiguous'],[408,23,'timeout']])test(`provider end HTTP${status}/code${code} stays ${category}`,async()=>{
  const f=providerFixture();f.port.end=async()=>{throw {code,metadata:{responseCode:status}};};await assert.rejects(f.adapter.end({id}),e=>e.category===category);assert.equal(f.counts().gets,0);
});
test('strict numeric404/code16 requires a fresh scoped authenticated absence read',async()=>{
  const f=providerFixture();f.port.end=async()=>{throw {code:16,metadata:{responseCode:404}};};const result=await f.adapter.end({id});assert.equal(result.outcome,'absent');assert.equal(f.counts().gets,1);
  f.port.get=async()=>{throw {code:16,metadata:{responseCode:401}};};await assert.rejects(f.adapter.end({id}),e=>e.category==='permission');
});
test('404 end response followed by a successful GET remains ambiguous',async()=>{
  const f=providerFixture();f.port.end=async()=>{throw {code:16,metadata:{responseCode:404}};};f.port.get=async()=>({call:{id}});
  await assert.rejects(f.adapter.end({id}),e=>e.category==='ambiguous');
});
test('wrong application cannot issue an end operation',async()=>{
  const f=providerFixture();f.stream.getApp=async()=>({app:{id:999,disable_auth_checks:false,disable_permissions_checks:false}});await assert.rejects(f.adapter.end({id}));assert.equal(f.counts().ends,0);
});
for(const value of [undefined,{}, {duration:'1ms'}, {metadata:{responseCode:204}}, {duration:'1ms',metadata:{responseCode:'200'}}, {duration:'1ms',metadata:{responseCode:200},code:16}])test(`malformed/missing acknowledgement ${JSON.stringify(value)} is not success`,async()=>{
  const f=providerFixture();f.port.end=async()=>value;await assert.rejects(f.adapter.end({id}),e=>e.category==='ambiguous');
});
test('generic wrapped timeout prose is ambiguous, not evidence that the operation did not commit',async()=>{
  const f=providerFixture();f.port.end=async()=>{throw new Error('timeout');};await assert.rejects(f.adapter.end({id}),e=>e.category==='ambiguous');
});
test('worker keeps missing ACK pending and retries without accepting a stale database ACK',async()=>{
  const calls=[];const job={call_id:id,operation:'end',lease:'current'};
  assert.equal((await runConnectEndJob(job,{complete:async(_,ok)=>calls.push(ok)},{end:async()=>undefined})).success,false);assert.deepEqual(calls,[false]);
  let attempts=0;const store={complete:async(_,ok)=>{calls.push(ok);assertConnectJobAcknowledged(++attempts>1?true:false);}};
  await assert.rejects(runConnectEndJob(job,store,{end:async()=>accepted()}),/connect_job_not_acknowledged/);assert.deepEqual(calls.slice(1),[true]);
  assert.equal((await runConnectEndJob({...job,lease:'new'},store,{end:async()=>accepted()})).success,true);
});
test('worker rejects wrong-call acknowledgements and falsely verified media assertions',async()=>{
  for(const r of [{...accepted(),id:uuid(9)},{...accepted(),mediaEnforcement:'verified'},{...accepted(),outcome:['accepted']}]){
    let completed;await runConnectEndJob({call_id:id,operation:'end',lease:'1'},{complete:async(_,ok)=>{completed=ok;}},{end:async()=>r});assert.equal(completed,false);
  }
});
test.after(()=>assert.equal(networkAttempts,0));
