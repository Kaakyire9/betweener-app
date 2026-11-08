const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { createConnectNativeOwnerFactory } = require('../features/connect/media/connect-native-owner.ts');
const { createConnectNativeSafetyComposition, loadConnectNativeEnvironment } = require('../features/connect/media/native-safety-composition.ts');
const { adaptNativeStreamSdk } = require('../features/connect/media/native-stream-sdk.ts');
const { StreamVoiceTransport } = require('../features/connect/media/stream-voice-transport.ts');
const { StreamVideoClientLeaseRegistry } = require('../features/live/media/stream-video-client-leases.ts');
const { isLocalShutdownVerified } = require('../features/connect/media/local-shutdown.ts');
const { connectFeatureFlags } = require('../features/connect/config/connect-feature-flags.ts');
let network = 0;
globalThis.fetch = () => { network++; throw new Error('native_owner_test_network_forbidden'); };
const uuid = n => `ee390000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const credentials = (n=1) => ({ apiKey:'synthetic-key', token:'synthetic-token', expiresAt:new Date(Date.now()+60_000).toISOString(),
  user:{id:uuid(2)}, media:'voice', call:{type:'betweener_connect',id:uuid(n),cid:`betweener_connect:${uuid(n)}`} });
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
const settle=()=>new Promise(r=>setImmediate(r));
const track=()=>({enabled:true,readyState:'live',released:false,stop(){this.enabled=false;this.readyState='ended';},release(){this.released=true;}});
function fixture() {
  const events=[], states=new Set(), media=new Set(), accounts=new Set(), lifecycle=new Set(), interruptions=new Set(), devices=new Set();
  let auth={authenticated:true,userId:uuid(2),generation:'account-epoch-1'}, appState='active', permission='granted', permissionReads=0, loads=0, clientInput;
  const tracks={microphone:[track()],camera:[track()],remote:[track()]};
  const state={callingState:'idle',microphoneStatus:'disabled',cameraStatus:'disabled',audioPublishing:false,videoPublishing:false,publisherPresent:false,subscriberPresent:false};
  const handle={...credentials().call,state:()=>({...state}),tracks:()=>tracks,
    observeState(fn){states.add(fn);fn(state.callingState);return()=>states.delete(fn);}, observeMedia(fn){media.add(fn);fn();return()=>media.delete(fn);},
    async enableMicrophone(){events.push('enable');state.microphoneStatus='enabled';state.audioPublishing=true;},
    async disableMicrophone(){events.push('disable-mic');state.microphoneStatus='disabled';state.audioPublishing=false;},
    async disableCamera(){events.push('disable-camera');state.cameraStatus='disabled';state.videoPublishing=false;},
    async disposePublisher(){events.push('dispose-publisher');state.publisherPresent=false;},
    async disposeSubscriber(){events.push('dispose-subscriber');state.subscriberPresent=false;},
    async join(){events.push('join');state.callingState='joined';state.publisherPresent=true;state.subscriberPresent=true;for(const f of states)f('joined');},
    async leave(){events.push('leave');state.callingState='left';state.publisherPresent=false;state.subscriberPresent=false;for(const f of states)f('left');},
  };
  let audioState={devices:[{id:'earpiece-id',type:'Earpiece'},{id:'speaker-id',type:'Speaker'},{id:'bt-id',type:'Bluetooth Device'}],selectedDeviceId:'earpiece-id'};
  const audio={configure(){events.push('audio-configure');},clearConfiguration(){events.push('audio-clear');},async devices(){return audioState;},
    select(id){events.push(['route',id]);audioState={...audioState,selectedDeviceId:id};},observeDevices(fn){devices.add(fn);return()=>devices.delete(fn);},
    observeInterruption(fn){interruptions.add(fn);return()=>interruptions.delete(fn);}};
  const client={call(type,id){assert.equal(type,'betweener_connect');handle.id=id;handle.cid=`${type}:${id}`;return handle;},async disconnectUser(){events.push('disconnect');}};
  const sdk={createClient(input){clientInput=input;events.push('client-created');return client;},audio:()=>audio};
  const registry=new StreamVideoClientLeaseRegistry();
  const access={auth:{snapshot:()=>auth,subscribe(fn){accounts.add(fn);return()=>accounts.delete(fn);}},
    lifecycle:{platform:'ios',appState:()=>appState,subscribeAppState(fn){lifecycle.add(fn);return()=>lifecycle.delete(fn);}},
    permission:async()=>{permissionReads++;return permission;},registry,flags:{nativeSafetyOwner:true,endCallAndBlock:true},loadSdk:async()=>{loads++;return sdk;}};
  const factory=createConnectNativeOwnerFactory(access);
  return {events,tracks,state,handle,audio,client,sdk,registry,access,factory,states,media,accounts,lifecycle,devices,interruptions,
    create:(c=credentials(),refresh=async()=> 'synthetic-refreshed',guard)=>factory.create(c,refresh,guard),
    input:()=>clientInput,reads:()=>({loads,permissionReads}),permission(value){permission=value;},
    account(value){auth=value;for(const fn of [...accounts])fn();},background(value){appState=value;for(const fn of [...lifecycle])fn(value);},
    interrupt(value){for(const fn of [...interruptions])fn(value);},emitMedia(){for(const fn of [...media])fn();},
    device(value){audioState=value;for(const fn of [...devices])fn(value);}};
}
test('default flags deny native factory/composition before SDK, permissions or credentials',async()=>{
  assert.equal(connectFeatureFlags.nativeSafetyOwner,false);assert.equal(connectFeatureFlags.endCallAndBlock,false);
  const f=fixture();delete f.access.flags;
  await assert.rejects(createConnectNativeOwnerFactory(f.access).create(credentials(),async()=>''),/disabled/);
  assert.throws(()=>createConnectNativeSafetyComposition({...f.access,api:{}}),/disabled/);
  await assert.rejects(loadConnectNativeEnvironment(),/disabled/);
  assert.deepEqual(f.reads(),{loads:0,permissionReads:0});assert.equal(f.events.length,0);
});
for(const [name,mutate] of Object.entries({wrongUser:c=>{c.user.id=uuid(9);},wrongType:c=>{c.call.type='betweener_live';},wrongCid:c=>{c.call.cid='other';},
  wrongId:c=>{c.call.id='not-a-uuid';},video:c=>{c.media='video';},expired:c=>{c.expiresAt='2000-01-01T00:00:00Z';},missingToken:c=>{c.token='';}})) {
  test(`rejects ${name} admission before native load`,async()=>{const f=fixture(),c=credentials();mutate(c);await assert.rejects(f.create(c),/identity_invalid/);assert.equal(f.reads().loads,0);});
}
test('missing Auth epoch and signed-out account cannot own media',async()=>{
  for(const a of [null,{authenticated:true,userId:uuid(2),generation:''}]){const f=fixture();f.account(a);await assert.rejects(f.create(),/identity_invalid/);assert.equal(f.reads().loads,0);}
});
test('denied/blocked microphone permission creates no native client',async()=>{
  for(const value of ['denied','blocked']){const f=fixture();f.permission(value);await assert.rejects(f.create(),/permission_denied/);assert.equal(f.reads().loads,0);}
});
test('account change during lazy load denies client creation',async()=>{
  const f=fixture(),gate=deferred();f.access.loadSdk=()=>gate.promise;const factory=createConnectNativeOwnerFactory(f.access),p=factory.create(credentials(),async()=> 'token');
  await settle();f.account({authenticated:true,userId:uuid(8),generation:'new'});gate.resolve(f.sdk);await assert.rejects(p,/retired/);assert.equal(f.events.length,0);
});
test('leave during lazy load retires transport epoch before client creation',async()=>{
  const f=fixture(),gate=deferred();f.access.loadSdk=()=>gate.promise;const factory=createConnectNativeOwnerFactory(f.access),transport=new StreamVoiceTransport(factory.create);
  const joining=transport.join(credentials(),async()=>credentials(),()=>{});await settle();await transport.leave();gate.resolve(f.sdk);
  await assert.rejects(joining,/retired/);assert.equal(f.events.length,0);
});
test('active owner uses only its own token callback and retires refresh after logout',async()=>{
  const f=fixture();let refresh=0;await f.create(credentials(),async()=>{refresh++;return 'new';});assert.equal(await f.input().tokenProvider(),'synthetic-token');
  assert.equal(await f.input().tokenProvider(),'new');assert.equal(refresh,1);f.account(null);
  await assert.rejects(f.input().tokenProvider(),/denied/);assert.equal(refresh,1);await f.factory.current().release();
});
test('refresh completes after retirement without delivering stale credentials',async()=>{
  const f=fixture(),gate=deferred();await f.create(credentials(),()=>gate.promise);await f.input().tokenProvider();const refresh=f.input().tokenProvider();
  f.factory.current().retire('navigation');gate.resolve('late');await assert.rejects(refresh,/denied/);await f.factory.current().release();
});
test('mutation of original credential and Auth objects cannot retarget owner scope',async()=>{
  const f=fixture(),original=credentials(),auth=f.access.auth.snapshot();const b=await f.create(original);original.token='mutated';original.call.cid='mutated';original.user.id=uuid(9);
  assert.equal(await f.input().tokenProvider(),'synthetic-token');assert.equal(f.factory.current().getSnapshot().cid,credentials().call.cid);
  auth.generation='mutated-in-place';await assert.rejects(f.input().tokenProvider(),/denied/);await b.release();
});
test('a disabled but unended track remains observable and quarantines release',async()=>{
  const f=fixture();f.tracks.microphone=[{enabled:false,readyState:'live',stop(){}}];const b=await f.create();await assert.rejects(b.release(),/unconfirmed/);
  assert.equal(f.factory.current().getSnapshot().tracks.microphone.live,1);assert.equal((await b.inspectShutdown()).microphoneStopped,false);
});
test('throwing inspection observers cannot prevent independent shutdown and release',async()=>{
  const f=fixture(),b=await f.create();f.factory.current().subscribe(()=>{throw Error('observer');});await b.call.leave();await b.release();
  assert.equal(f.factory.current().getSnapshot().operations.release,'completed');
});
test('valid refreshed admission can outlive initial token expiry but changed CID cannot',async()=>{
  const f=fixture();let now=Date.now();f.access.now=()=>now;const factory=createConnectNativeOwnerFactory(f.access);await factory.create(credentials(),async()=> 'new');
  await f.input().tokenProvider();now+=120_000;assert.equal(await f.input().tokenProvider(),'new');await factory.current().release();
  const g=fixture(),transport=new StreamVoiceTransport(g.factory.create);await transport.join(credentials(),async()=>credentials(10),()=>{});await g.input().tokenProvider();
  await assert.rejects(g.input().tokenProvider(),/unavailable/);await transport.leave();
});
test('tracks stop synchronously while SFU disable and leave are hung; independent operations start',async()=>{
  const f=fixture(),never=new Promise(()=>{});f.handle.disableMicrophone=()=>never;f.handle.disableCamera=()=>never;f.handle.leave=()=>never;
  const b=await f.create();await b.call.join({create:false});const ending=b.call.leave();void ending.catch(()=>{});
  assert.equal(f.tracks.microphone[0].readyState,'ended');assert.equal(f.tracks.camera[0].readyState,'ended');assert.equal(f.tracks.remote[0].readyState,'ended');
  assert.equal(f.tracks.microphone[0].released,true);assert.equal(f.tracks.camera[0].released,true);assert.equal(f.tracks.remote[0].released,false);
  assert.ok(f.events.includes('dispose-publisher'));assert.ok(f.events.includes('dispose-subscriber'));await settle();
  assert.equal(f.factory.current().getSnapshot().operations.leave,'pending');assert.equal(f.factory.current().getSnapshot().operations.release,'pending');
  assert.throws(()=>f.registry.acquire('live',()=>f.client),/busy/);
});
test('SDK-only shutdown is observable without becoming independent physical proof',async()=>{
  const f=fixture(),transport=new StreamVoiceTransport(f.factory.create);await transport.join(credentials(),async()=>credentials(),()=>{});await transport.setMuted(false);
  const result=await transport.leave();assert.equal(result.sdkLeave,'completed');assert.equal(result.resourceRelease,'completed');assert.equal(isLocalShutdownVerified(result),false);
  const s=f.factory.current().getSnapshot();assert.equal(s.evidenceSource,'sdk_reported');assert.equal(s.physicalDeviceShutdown,'not_verified');
  assert.equal(s.tracks.microphone.live,0);assert.equal(s.sdk.callingState,'left');assert.equal(f.events.filter(e=>e==='disconnect').length,1);
});
test('failed SDK inspection returns unknown evidence and cannot confirm resource release',async()=>{
  const f=fixture(),b=await f.create();await b.call.join({create:false});const original=f.handle.state;f.handle.state=()=>{throw Error('native-state-unavailable');};
  const s=f.factory.current().getSnapshot();assert.equal(s.inspection,'failed');assert.equal(s.sdk.publisherPresent,null);assert.equal(s.physicalDeviceShutdown,'not_verified');
  assert.equal((await b.inspectShutdown()).subscriptionsStopped,false);await b.call.leave();await assert.rejects(b.release(),/unconfirmed/);
  f.handle.state=original;await b.release();
});
test('failed leave remains failed and quarantines native ownership until confirmed retry',async()=>{
  const f=fixture(),b=await f.create();await b.call.join({create:false});const leave=f.handle.leave;f.handle.leave=async()=>{throw Error('secret-provider-message');};
  await assert.rejects(b.call.leave(),/operation_failed/);await assert.rejects(b.release(),/unconfirmed/);assert.equal(f.factory.current().getSnapshot().operations.release,'failed');
  assert.throws(()=>f.registry.acquire('live',()=>f.client),/busy/);f.handle.leave=leave;await b.release();
  const next=f.registry.acquire('live',()=>f.client);await next.release();
});
test('hung subscriber cleanup cannot suppress capture stop, leave or quarantine',async()=>{
  const f=fixture();f.handle.disposeSubscriber=()=>new Promise(()=>{});const b=await f.create();await b.call.join({create:false});void b.call.leave();await settle();
  const s=f.factory.current().getSnapshot();assert.equal(s.operations.subscriber,'pending');assert.equal(s.operations.leave,'completed');assert.equal(s.operations.release,'pending');
  assert.equal(s.tracks.microphone.live,0);assert.throws(()=>f.registry.acquire('live',()=>f.client),/busy/);
});
test('failed publisher dispose stays observable even if SDK leave later succeeds',async()=>{
  const f=fixture();f.handle.disposePublisher=async()=>{throw Error('dispose-failed');};const b=await f.create();await b.call.join({create:false});await b.call.leave();await b.release();
  assert.equal(f.factory.current().getSnapshot().operations.publisher,'failed');assert.equal(f.factory.current().getSnapshot().operations.leave,'completed');
  assert.equal((await b.inspectShutdown()).evidenceSource,'sdk_reported');
});
test('missing/throwing native capture release remains explicit and quarantined',async()=>{
  for(const release of [undefined,()=>{throw Error('native-bridge-failed');}]) {
    const f=fixture();f.tracks.microphone[0].release=release;const b=await f.create();await b.call.leave();await assert.rejects(b.release(),/unconfirmed/);
    assert.equal(f.factory.current().getSnapshot().operations.microphoneTrackRelease,'failed');assert.throws(()=>f.registry.acquire('live',()=>f.client),/busy/);
    f.tracks.microphone[0].release=()=>{};await b.call.microphone.disable();await b.release();
  }
});
test('failed listener removal holds ownership and supports a scoped release retry',async()=>{
  const f=fixture();let fail=true;f.audio.observeDevices=()=>()=>{if(fail)throw Error('native-listener-failed');};const b=await f.create();await b.call.join({create:false});
  await b.call.leave();await assert.rejects(b.release(),/unconfirmed/);assert.throws(()=>f.registry.acquire('live',()=>f.client),/busy/);
  fail=false;await b.release();assert.equal(f.factory.current().getSnapshot().operations.release,'completed');
});
test('failed direct track stop remains live/unsafe instead of certifying shutdown',async()=>{
  const f=fixture();f.tracks.microphone=[{enabled:true,readyState:'live',stop(){throw Error('bridge-failed');}}];
  Object.defineProperty(f.tracks.microphone[0],'enabled',{get:()=>true,set(){throw Error('bridge-failed');}});
  const b=await f.create();await assert.rejects(b.call.microphone.disable(),/track_stop_failed/);await assert.rejects(b.release(),/unconfirmed/);
  assert.equal(f.factory.current().getSnapshot().tracks.microphone.live,1);assert.equal((await b.inspectShutdown()).microphoneStopped,false);
  assert.throws(()=>f.registry.acquire('live',()=>f.client),/busy/);
});
test('late join completion cannot restart media or release successor early',async()=>{
  const f=fixture(),gate=deferred();f.handle.join=async()=>{await gate.promise;f.state.callingState='joined';f.state.publisherPresent=true;f.tracks.microphone.push(track());f.emitMedia();};
  const b=await f.create(),joining=b.call.join({create:false});f.factory.current().retire('navigation');await settle();assert.throws(()=>f.registry.acquire('live',()=>f.client),/busy/);
  gate.resolve();await assert.rejects(joining,/retired/);await b.release();assert.equal(f.factory.current().getSnapshot().tracks.microphone.live,0);assert.equal(f.state.callingState,'left');
});
test('late unmute is stopped after a background retirement',async()=>{
  const f=fixture(),gate=deferred();f.handle.enableMicrophone=async()=>{await gate.promise;f.tracks.microphone.push(track());f.state.microphoneStatus='enabled';f.emitMedia();};
  const b=await f.create(),enabling=b.call.microphone.enable();await settle();f.background('background');gate.resolve();await assert.rejects(enabling,/retired/);await b.release();
  assert.equal(f.factory.current().getSnapshot().tracks.microphone.live,0);assert.equal(f.state.microphoneStatus,'disabled');
});
for(const reason of ['background','inactive','interruption'])test(`${reason} retires and foreground/end does not automatically resume`,async()=>{
  const f=fixture(),b=await f.create();await b.call.join({create:false});if(reason==='interruption')f.interrupt('began');else f.background(reason);
  f.background('active');f.interrupt('ended');await assert.rejects(b.call.microphone.enable(),/retired/);await assert.rejects(b.call.join({create:false}),/retired/);await b.release();
  assert.equal(f.events.filter(e=>e==='enable').length,0);
});
test('permission revoked after acquisition retires owner before enable',async()=>{
  const f=fixture(),b=await f.create();f.permission('blocked');await assert.rejects(b.call.microphone.enable(),/permission_denied/);await b.release();assert.ok(!f.events.includes('enable'));
});
test('stable audio IDs and observed selection confirm routing without global speaker mute',async()=>{
  const f=fixture(),b=await f.create();await settle();assert.deepEqual(b.routes(),['earpiece','speaker','bluetooth']);await b.selectRoute('bluetooth');
  assert.ok(f.events.some(e=>Array.isArray(e)&&e[1]==='bt-id'));f.device({devices:[{id:'wired-new',type:'Wired Headset'}],selectedDeviceId:'wired-new'});
  assert.deepEqual(b.routes(),['wired']);await assert.rejects(b.selectRoute('bluetooth'),/unavailable/);await b.release();assert.deepEqual(b.routes(),[]);
});
test('native routing may return the previous output until the asynchronous change event arrives',async()=>{
  const f=fixture(),b=await f.create();await settle();
  f.audio.select=id=>{setTimeout(()=>f.device({devices:[{id:'earpiece-id',type:'Earpiece'},{id:'speaker-id',type:'Speaker'}],selectedDeviceId:id}),20);};
  try { await b.selectRoute('speaker'); assert.equal(f.factory.current().getSnapshot().retired,false); }
  finally { await b.release(); }
});
test('a uniquely identified built-in output can be observed by endpoint type when native selected ID is absent',async()=>{
  const f=fixture(),b=await f.create();await settle();
  f.device({devices:[{id:'earpiece-id',type:'Earpiece'},{id:'speaker-id',type:'Speaker'}],currentEndpointType:'Earpiece'});
  try { await b.selectRoute('earpiece'); assert.ok(!f.events.some(e=>Array.isArray(e)&&e[0]==='route')); }
  finally { await b.release(); }
});
test('unconfirmed route and delayed route readback after retirement are rejected',async()=>{
  const f=fixture(),b=await f.create();await settle();f.audio.select=()=>{};await assert.rejects(b.selectRoute('speaker'),/unconfirmed/);
  const gate=deferred();f.audio.devices=()=>gate.promise;const selecting=b.selectRoute('speaker');f.factory.current().retire();gate.resolve({devices:[],selectedDeviceId:'speaker-id'});
  await assert.rejects(selecting,/retired/);await b.release();
});
test('connection error retires owner without exposing SDK error text',async()=>{
  const f=fixture(),b=await f.create();f.input().onConnectionFailure();await assert.rejects(b.call.join({create:false}),/retired/);await b.release();assert.equal(f.factory.current().getSnapshot().reason,'connection_failed');
});
test('normal Live ref-count sharing remains intact',async()=>{
  const f=fixture();let created=0;const a=f.registry.acquire('live',()=>{created++;return f.client;}),b=f.registry.acquire('live',()=>{throw Error('not-new');});
  await a.release();assert.equal(f.events.length,0);await a.release();assert.equal(f.events.length,0);await b.release();assert.equal(created,1);assert.deepEqual(f.events,['disconnect']);
});
test('Live lease blocks Connect before factory; Connect blocks every Live key',async()=>{
  const f=fixture(),live=f.registry.acquire('live-other-account',()=>f.client);await assert.rejects(f.create(),/busy/);assert.ok(!f.events.includes('client-created'));await live.release();
  const b=await f.create();assert.throws(()=>f.registry.acquire('another-live-key',()=>f.client),/busy/);await assert.rejects(f.create(credentials(9)),/busy/);await b.release();
});
test('exclusive reservation prevents reentrant factories and resets after factory throw',async()=>{
  const r=new StreamVideoClientLeaseRegistry();assert.throws(()=>r.acquireNativeExclusive('x',()=>{r.acquire('live',()=>({}));}),/busy/);
  const a=r.acquireNativeExclusive('x',()=>({async disconnectUser(){}}));await a.release();
});
test('Live factory reservation also prevents a reentrant Connect acquisition',async()=>{
  const r=new StreamVideoClientLeaseRegistry();
  const lease=r.acquire('live',()=>{assert.throws(()=>r.acquireNativeExclusive('connect',()=>({})),/busy/);return {async disconnectUser(){}};});await lease.release();
});
test('hung disconnect retains tombstone and concurrent release shares one request',async()=>{
  const r=new StreamVideoClientLeaseRegistry(),gate=deferred();let calls=0;const a=r.acquireNativeExclusive('x',()=>({async disconnectUser(){calls++;await gate.promise;}}));
  const p=a.release(),q=a.release();await settle();assert.equal(calls,1);assert.throws(()=>r.acquire('live',()=>({})),/busy/);gate.resolve();await Promise.all([p,q]);
  const b=r.acquire('live',()=>({async disconnectUser(){}}));await a.release();await b.release();assert.equal(calls,1);
});
test('failed client disconnect remains quarantined and can be retried',async()=>{
  const r=new StreamVideoClientLeaseRegistry();let fail=true;const a=r.acquireNativeExclusive('x',()=>({async disconnectUser(){if(fail)throw Error('offline');}}));
  await assert.rejects(a.release());assert.throws(()=>r.acquire('live',()=>({})),/busy/);fail=false;await a.release();const b=r.acquire('live',()=>({async disconnectUser(){}}));await b.release();
});
function composition(f) {
  const call={id:uuid(1),caller_profile_id:uuid(3),recipient_profile_id:uuid(4),media:'voice',authorization:'matched',state:'ACTIVE',version:1,
    created_at:'2026-10-31T00:00:00Z',connected_at:null,ended_at:null};
  const context={call_id:call.id,generation:call.created_at,actor_user_id:uuid(2),peer_user_id:uuid(5),peer_profile_id:uuid(4),
    caller_profile_id:uuid(3),recipient_profile_id:uuid(4),media:'voice',authorization:'matched',grant_id:null,block_id:null,revocation_at:null};
  const api={async createCall(){return call;},async act(){f.events.push('authority-end');return {...call,state:'ENDED'};},async getCall(){return call;},async getHistory(){return [];},async credentials(){return credentials();},
    async prepareEndBlock(){f.events.push('authority-prepare');return context;},async endCallAndBlock(c,key){f.events.push('authority-block');return {...c,request_id:key,block:'saved',call:'terminal',provider:'pending',media:'unverified'};}};
  return createConnectNativeSafetyComposition({...f.access,api,selfProfileId:uuid(3),deviceId:uuid(6),uuid:()=>uuid(7),peer:async()=>({profileId:uuid(4),name:'Synthetic',avatar:null})});
}
test('real composition starts block independently of hung native leave',async()=>{
  const f=fixture(),c=composition(f);await c.controller.start({profileId:uuid(4),name:'Synthetic',avatar:null},'matched');
  f.handle.leave=()=>new Promise(()=>{});await c.controller.endCallAndBlock();assert.ok(f.events.includes('authority-block'));
  assert.equal(c.controller.getSnapshot().endBlock.block,'saved');assert.equal(c.owner().getSnapshot().retired,true);assert.equal(c.owner().getSnapshot().operations.leave,'pending');
  assert.equal(c.controller.getSnapshot().localShutdown.sdkLeave,'pending');assert.equal(f.tracks.microphone[0].readyState,'ended');
});
test('navigation callbacks capture one owner and cannot stop successor',async()=>{
  const f=fixture(),c=composition(f);await c.transport.join(credentials(),async()=>credentials(),()=>{});const old=c.navigationCleanup(credentials().call.cid);await c.transport.leave();
  await c.transport.join(credentials(10),async()=>credentials(10),()=>{});const next=c.owner();old();assert.equal(next.getSnapshot().retired,false);await c.transport.leave();await c.dispose();
});
test('navigation cancellation before lazy ownership prevents late client construction',async()=>{
  const f=fixture(),gate=deferred();f.access.loadSdk=()=>gate.promise;const c=composition(f),cleanup=c.navigationCleanup(credentials().call.cid);
  const joining=c.transport.join(credentials(),async()=>credentials(),()=>{});await settle();cleanup();gate.resolve(f.sdk);await assert.rejects(joining,/identity_invalid|retired/);
  assert.ok(!f.events.includes('client-created'));await c.dispose();
});
test('account switch retires owner and rejects old controller authority callbacks',async()=>{
  const f=fixture(),c=composition(f);await c.controller.start({profileId:uuid(4),name:'Synthetic',avatar:null},'matched');f.events.length=0;
  f.account({authenticated:true,userId:uuid(9),generation:'replacement'});await settle();assert.equal(c.owner().getSnapshot().retired,true);
  assert.ok(!f.events.includes('authority-end'));await assert.rejects(c.controller.endCallAndBlock(),/unavailable/);await c.owner().release();
});
test('SDK adapter passes exact native options, force-stops and owns only call peers',async()=>{
  const events=[],t=track(),observable={subscribe(fn){fn();return {unsubscribe(){events.push('unsubscribe');}};}};
  const call={id:uuid(1),cid:`betweener_connect:${uuid(1)}`,type:'betweener_connect',state:{callingState:'joined',remoteParticipants:[{audioStream:{getTracks:()=>[t]}}],callingState$:observable,remoteParticipants$:observable},
    microphone:{state:{status:'enabled',mediaStream:{getTracks:()=>[t]},mediaStream$:observable},async enable(){events.push('enable');},async disable(force){events.push(['mic',force]);}},
    camera:{state:{status:'disabled',mediaStream$:observable},async disable(force){events.push(['camera',force]);}},publisher:{getPublishedTracks:()=>[],isPublishing:n=>n===1,async dispose(){events.push('publisher');}},subscriber:{async dispose(){events.push('subscriber');}},
    async join(options){events.push(['join',options]);},async leave(options){events.push(['leave',options]);}};
  let options;
  const client={streamClient:{options:{}},call:()=>call,async disconnectUser(){events.push('disconnect');}};
  const manager={start:o=>events.push(['audio',o]),stop:()=>events.push('clear-config'),audioDevices:{getStatus:async()=>({devices:[]}),select:id=>events.push(id),addChangeListener:()=>()=>{}},ios:{addAudioInterruptionListener:()=>()=>{}}};
  let provider=async()=>({dispose:async()=>true});
  const sdk=adaptNativeStreamSdk({StreamVideoClient:{getOrCreateInstance(o){options=o;client.streamClient.options=o.options;return client;}},callManager:manager,SfuModels:{TrackType:{AUDIO:1,VIDEO:2}},getCallMediaEngineProvider:()=>provider,setCallMediaEngineProvider:value=>{provider=value;}});
  const owned=sdk.createClient({apiKey:'synthetic',userId:uuid(2),tokenProvider:async()=> 'synthetic',onConnectionFailure(){}}),handle=owned.call('betweener_connect',uuid(1));
  assert.equal(require('../features/live/media/stream-video-background-client.ts').getStreamVideoBackgroundClient(),client);
  assert.equal(options.token,undefined);assert.equal(typeof options.tokenProvider,'function');assert.equal(options.options.maxConnectUserRetries,1);
  assert.equal(handle.state().audioPublishing,true);assert.deepEqual(handle.tracks().remote,[t]);await handle.disableMicrophone();await handle.disableCamera();await handle.join();await handle.disposePublisher();await handle.disposeSubscriber();await handle.leave();
  assert.ok(events.some(e=>Array.isArray(e)&&e[0]==='mic'&&e[1]===true));assert.ok(events.some(e=>Array.isArray(e)&&e[0]==='camera'&&e[1]===true));
  assert.deepEqual(events.find(e=>Array.isArray(e)&&e[0]==='join')[1],{create:false});assert.deepEqual(events.find(e=>Array.isArray(e)&&e[0]==='leave')[1],{reject:false});
  sdk.audio('ios').configure();sdk.audio('ios').clearConfiguration();assert.ok(events.includes('clear-config'));assert.ok(!events.includes('disconnect'));
  const background=require('../features/live/media/stream-video-background-client.ts'),successor={};
  background.registerStreamVideoBackgroundClient(successor);
  await owned.disconnectUser();assert.equal(background.getStreamVideoBackgroundClient(),successor,'Connect cleanup cannot clear a successor registry owner');
  background.unregisterStreamVideoBackgroundClient(successor);assert.equal(background.getStreamVideoBackgroundClient(),undefined);
});
test('foreign cached SDK client is rejected without borrowing token closure or disconnecting',()=>{
  let disconnected=0;const foreign={streamClient:{options:{onConnectUserError(){}}},disconnectUser(){disconnected++;}};
  const sdk=adaptNativeStreamSdk({StreamVideoClient:{getOrCreateInstance:()=>foreign},callManager:{},SfuModels:{}});
  assert.throws(()=>sdk.createClient({apiKey:'x',userId:'y',tokenProvider:async()=>'',onConnectionFailure(){}}),/foreign/);assert.equal(disconnected,0);
});
test('native boundary avoids process-wide speaker mute and Live token ownership',()=>{
  const source=fs.readFileSync('features/connect/media/native-stream-sdk.ts','utf8');
  assert.ok(!source.includes('speaker.setMute'));assert.ok(!source.includes('getStreamVideoBackgroundClient'));assert.ok(!source.includes('live-rtc-token'));
  assert.equal(fs.existsSync('app/connect/voice-preview.tsx'),false,'The retired mock route cannot mount a native owner');
  assert.equal(network,0);
});

test('the native adapter configures the initial video speaker before join, while voice stays on earpiece', () => {
  const configs = [];
  const sdk = adaptNativeStreamSdk({ callManager: { start: config => configs.push(config) } });
  sdk.audio('ios', 'voice').configure(); sdk.audio('ios', 'video').configure(); sdk.audio('android', 'video').configure();
  assert.deepEqual(configs, [
    { audioRole: 'communicator', deviceEndpointType: 'earpiece' },
    { audioRole: 'communicator', deviceEndpointType: 'speaker' },
    { audioRole: 'communicator', deviceEndpointType: 'speaker' },
  ]);
});

test('the factory binds audio configuration to canonical video admission before native join', async () => {
  const f = fixture(); f.access.flags.videoCalling = true;
  Object.assign(f.handle, { enableCamera: async () => {}, flipCamera: async () => 'front', cameraEnabled: () => false,
    videoPresentation: () => ({ participants: () => [], subscribe: () => () => {}, render: () => null }) });
  const selections = []; f.sdk.audio = (platform, media, cid) => { selections.push([platform, media, cid]); return f.audio; };
  const b = await f.create({ ...credentials(), media: 'video' });
  assert.deepEqual(selections, [['ios', 'video', credentials().call.cid]]); assert.ok(f.events.includes('audio-configure'));
  assert.ok(!f.events.includes('join')); await b.release();
});

test('native route snapshots expose only bounded route categories and confirmed selection', async () => {
  const f = fixture(), b = await f.create();
  await b.selectRoute('speaker');
  const route = f.factory.current().getSnapshot().audioRoute;
  assert.deepEqual(route, { requested: 'speaker', status: 'confirmed', available: ['earpiece', 'speaker', 'bluetooth'], selected: 'speaker', output: null });
  assert.ok(!JSON.stringify(route).includes('speaker-id')); await b.release();
});

test('a native owner activates only its joined current call before completing setup', async () => {
  const f = fixture(), gate = deferred(); let calls = 0;
  f.handle.activateSystemCall = async current => {
    calls++; assert.equal(f.state.callingState, 'joined'); assert.equal(current(), true); await gate.promise;
  };
  const b = await f.create(); let complete = false;
  const joining = b.call.join(); void joining.then(() => { complete = true; }); await settle();
  assert.equal(calls, 1); assert.equal(complete, false); gate.resolve(); await joining; await b.release();
});

test('failed native activation retires the joined owner and preserves independent cleanup', async () => {
  const f = fixture(); f.handle.activateSystemCall = async () => { throw Error('SECRET_NATIVE_BODY'); };
  const b = await f.create(); await assert.rejects(b.call.join(), /connect_native_join_failed/); await b.release();
  const s = f.factory.current().getSnapshot(); assert.equal(s.reason, 'connection_failed');
  assert.equal(s.sdk.callingState, 'left'); assert.equal(s.operations.release, 'completed');
  assert.equal(f.tracks.microphone[0].readyState, 'ended');
});

test('account retirement while SDK join is pending prevents native activation', async () => {
  const f = fixture(), gate = deferred(); let activations = 0;
  f.handle.join = async () => { await gate.promise; };
  f.handle.activateSystemCall = async () => { activations++; };
  const b = await f.create(), joining = b.call.join(); const rejected = assert.rejects(joining, /connect_native_owner_retired/);
  f.account(null); gate.resolve(); await rejected; await b.release(); assert.equal(activations, 0);
});

for (const event of [{ kind: 'end', cause: 'error' }, { kind: 'hold' }])
test(`native ${event.kind} retains its first bounded cause and immediately shuts down`, async () => {
  const f = fixture(); let system;
  f.handle.observeSystemActions = listener => { system = listener; return () => {}; };
  const b = await f.create(); await b.call.join(); system(event);
  const first = f.factory.current().getSnapshot(); assert.equal(first.reason, 'interruption');
  assert.deepEqual(first.systemInterruption, { kind: event.kind, cause: event.cause ?? 'unknown' });
  assert.equal(f.tracks.microphone[0].readyState, 'ended');
  system({ kind: 'end', cause: 'remote' }); await b.release();
  assert.deepEqual(f.factory.current().getSnapshot().systemInterruption, first.systemInterruption);
});

test('audio-session interruption is distinguishable from native End and Hold', async () => {
  const f = fixture(), b = await f.create(); await b.call.join(); f.interrupt('began'); await b.release();
  assert.deepEqual(f.factory.current().getSnapshot().systemInterruption, { kind: 'audio_session', cause: 'unknown' });
});
