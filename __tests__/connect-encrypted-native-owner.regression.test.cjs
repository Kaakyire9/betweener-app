const test=require('node:test'),assert=require('node:assert/strict');
const {adaptNativeStreamSdk}=require('../features/connect/media/native-stream-sdk.ts');
const {id,deferred}=require('./fixtures/connect-product-fixture.cjs');
function fixture({supported=true,mode='auto-on',confirmed=true,createGate,withMicrophone=false,configureInput=async()=>{}}={}) {
  const events=[],listeners=new Map();let nativeProvider=()=>{},current=true,attached,disposed=false;
  const observable={subscribe(){return{unsubscribe(){}};}};
  const state={callingState:'idle',settings:{encryption:{mode}},e2eeEnabled:false,remoteParticipants:[],participants:[],callingState$:observable};
  const track=()=>({kind:'audio',enabled:true,readyState:'live',stop(){this.enabled=false;this.readyState='ended';}});
  const capture=track(),sender=track();let publishing=[];
  const microphoneState={status:'disabled',setPendingStatus(status){this.pendingStatus=status;},setStatus(status){this.status=status;}};
  const call={id:id(20),cid:`betweener_connect:${id(20)}`,type:'betweener_connect',state,
    on(event,listener){listeners.set(`call.${event}`,listener);return()=>listeners.delete(`call.${event}`);},
    microphone:{state:microphoneState,
      enable:async()=>{events.push('sdk-mic-enable');microphoneState.status='enabled';microphoneState.mediaStream={getTracks:()=>[capture]};publishing=[sender];},
      disable:async()=>{events.push('sdk-mic-disable');capture.stop();sender.stop();publishing=[];microphoneState.status='disabled';microphoneState.mediaStream=undefined;},
      disableSpeakingWhileMutedNotification:async()=>{events.push('muted-detector-disabled');}},camera:{state:{status:'disabled'},disable:async()=>{}},
    async get(){events.push('get');},setE2EEManager(manager){events.push('attach');attached=manager;},
    async join(){events.push('join');state.callingState='joined';state.e2eeEnabled=confirmed;if(withMicrophone){
      attached.encrypt({track:null},'opus','AUDIO');
      call.publisher={getPublishedTracks:()=>publishing.filter(t=>t.readyState==='live'),isPublishing:type=>type===1&&publishing.some(t=>t.enabled&&t.readyState==='live')};
    }},
    async leave(){events.push('leave');state.callingState='left';call.publisher=undefined;}};
  const manager={setSharedKey(index,key){events.push('key');assert.equal(key.byteLength,32);},removeSharedKey(){events.push('remove-key');},dispose(){disposed=true;events.push('dispose');},
    encrypt(){if(disposed)throw Error('EncryptionManager is disposed');events.push('encrypt');},
    decrypt(){if(disposed)throw Error('EncryptionManager is disposed');events.push('decrypt');},
    on(event,listener){listeners.set(event,listener);return()=>listeners.delete(event);}};
  const client={streamClient:{options:{}},call:()=>call,disconnectUser:async()=>{}};
  const sdk=adaptNativeStreamSdk({StreamVideoClient:{getOrCreateInstance(options){client.streamClient.options=options.options;return client;}},
    getCallMediaEngineProvider:()=>nativeProvider,setCallMediaEngineProvider:value=>{nativeProvider=value;},
    EncryptionManager:{isSupported:()=>supported,async create(){events.push('manager');if(createGate)await createGate.promise;return manager;}},
    SfuModels:{TrackType:{AUDIO:1,VIDEO:2},ErrorCode:{205:'PARTICIPANT_MEDIA_TRANSPORT_FAILURE'},WebsocketReconnectStrategy:{1:'FAST'}}},configureInput);
  const owner=sdk.createClient({apiKey:'synthetic',userId:id(1),tokenProvider:async()=> 'synthetic',onConnectionFailure(){}});
  const handle=owner.call('betweener_connect',id(20));
  const admission={call:{id:id(20),cid:call.cid,type:call.type},user:{id:id(1)},encryption:{mode:'required',generation:'2026-11-03T00:00:00Z',participants:[id(1),id(2)]}};
  const agent={async acquire(binding){events.push('acquire');return{...binding,mode:'required',epoch:0,expiresAt:Date.now()+60000,key:new Uint8Array(32).fill(3).buffer};}};
  return{events,handle,call,agent,admission,listeners,manager,capture,sender,retire(){current=false;},current:()=>current,attached:()=>attached};
}

test('startup transport diagnostics keep the first bounded SFU cause without retaining provider payloads',async()=>{
  const f=fixture();
  try{
    const observe=f.listeners.get('call.error');
    observe({error:{code:205,message:'SECRET_PROVIDER_MESSAGE',token:'SECRET'},reconnectStrategy:1,sdp:'SECRET_SDP'});
    assert.deepEqual(f.handle.state().transportFailure,{code:'PARTICIPANT_MEDIA_TRANSPORT_FAILURE',strategy:'FAST'});
    observe({error:{code:999999},reconnectStrategy:999999});
    assert.deepEqual(f.handle.state().transportFailure,{code:'PARTICIPANT_MEDIA_TRANSPORT_FAILURE',strategy:'FAST'});
    assert.equal(f.handle.state().failure,undefined,'observational transport metadata is not an encryption failure');
    assert.equal(JSON.stringify(f.handle.state()).includes('SECRET'),false);
    await f.handle.leave();assert.equal(f.listeners.has('call.error'),false);
    observe({error:{code:999999}});
    assert.equal(f.handle.state().transportFailure.code,'PARTICIPANT_MEDIA_TRANSPORT_FAILURE');
  }finally{await f.handle.leave();}
});

test('unreadable or unknown SFU metadata cannot break native call preparation',async()=>{
  const f=fixture();
  try{
    assert.doesNotThrow(()=>f.listeners.get('call.error')({get error(){throw Error('SECRET_NATIVE_BODY');}}));
    assert.deepEqual(f.handle.state().transportFailure,{code:'unknown',strategy:'unknown'});
    await f.handle.prepareEncryption(f.admission,f.agent,f.current,'epoch');await f.handle.join();
    assert.equal(f.handle.encryptionStatus().sdkConfirmed,true);
  }finally{await f.handle.leave();}
});

test('publisher retirement removes the closed SDK reference before device unpublish while retaining sender tracks',async()=>{
  const f=fixture({withMicrophone:true}),gate=deferred();
  try{
    await f.handle.prepareEncryption(f.admission,f.agent,f.current,'epoch');await f.handle.join();await f.handle.enableMicrophone();
    const publisher=f.call.publisher;
    publisher.dispose=async()=>{f.events.push('publisher-close');publisher.getPublishedTracks=()=>{throw Error('retired cache unavailable');};await gate.promise;};
    const disable=f.call.microphone.disable;
    f.call.microphone.disable=async()=>{assert.equal(f.call.publisher,undefined,'closed publishers must not receive SDK stopPublish');await disable();};
    const disposal=f.handle.disposePublisher();
    assert.equal(f.call.publisher,undefined);
    assert.ok(f.handle.tracks().microphone.includes(f.sender),'retain sender clones until independent hard stop');
    await f.handle.disableMicrophone();
    assert.equal(f.capture.readyState,'ended');assert.equal(f.sender.readyState,'ended');
    gate.resolve();await disposal;
  }finally{gate.resolve();await f.handle.leave();}
});

test('a failed publisher disposal stays visible for SDK retry and cannot be certified absent',async()=>{
  const f=fixture({withMicrophone:true});
  try{
    await f.handle.prepareEncryption(f.admission,f.agent,f.current,'epoch');await f.handle.join();await f.handle.enableMicrophone();
    const publisher=f.call.publisher;publisher.dispose=async()=>{throw Error('synthetic close failure');};
    await assert.rejects(f.handle.disposePublisher());
    assert.equal(f.call.publisher,publisher);assert.equal(f.handle.state().publisherPresent,true);
    await f.handle.disableMicrophone();assert.equal(f.sender.readyState,'ended');
  }finally{await f.handle.leave();}
});
test('native encryption is attached with a device-held key before joining, and disposed only after leave',async()=>{
  const f=fixture();await f.handle.prepareEncryption(f.admission,f.agent,f.current,'epoch');assert.equal(f.events.includes('join'),false);
  await f.handle.join();assert.equal(f.handle.encryptionStatus().sdkConfirmed,true);
  assert.ok(f.events.indexOf('key')<f.events.indexOf('attach'));assert.ok(f.events.indexOf('attach')<f.events.indexOf('join'));
  assert.equal(f.events.includes('dispose'),false);await f.handle.leave();assert.ok(f.events.indexOf('leave')<f.events.indexOf('dispose'));
});

test('a late receiver callback after leave stops its track without calling the disposed decryptor',async()=>{
  const f=fixture();await f.handle.prepareEncryption(f.admission,f.agent,f.current,'epoch');await f.handle.join();
  const attached=f.attached();attached.decrypt({track:{}},id(2),'AUDIO');assert.equal(f.events.at(-1),'decrypt');
  await f.handle.leave();
  f.call.state.callingState='joining'; // A stale SDK transition must not revive the old transform.
  const track={enabled:true,readyState:'live',stop(){this.readyState='ended';}};
  assert.doesNotThrow(()=>attached.decrypt({track},id(2),'AUDIO'));
  assert.equal(track.enabled,false);assert.equal(track.readyState,'ended');
  assert.equal(f.events.filter(e=>e==='decrypt').length,1);
  assert.equal(f.handle.encryptionStatus().sdkConfirmed,false);
  assert.throws(()=>attached.encrypt({},'opus','AUDIO'),/owner_retired/);
});

test('retirement before leave drops late receivers without waiting for manager disposal',async()=>{
  const f=fixture();await f.handle.prepareEncryption(f.admission,f.agent,f.current,'epoch');await f.handle.join();f.retire();
  const track={enabled:true,readyState:'live',stop(){this.readyState='ended';}};
  f.attached().decrypt({track},id(2),'AUDIO');
  assert.equal(track.enabled,false);assert.equal(track.readyState,'ended');assert.equal(f.events.includes('decrypt'),false);
  await f.handle.leave();
});

test('live transform failures propagate instead of being mistaken for retired callbacks',async()=>{
  const f=fixture();await f.handle.prepareEncryption(f.admission,f.agent,f.current,'epoch');await f.handle.join();
  const failure=Error('synthetic active encryption failure');f.manager.decrypt=()=>{throw failure;};f.manager.encrypt=()=>{throw failure;};
  assert.throws(()=>f.attached().decrypt({track:{}},id(2)),e=>e===failure);
  assert.throws(()=>f.attached().encrypt({}),e=>e===failure);await f.handle.leave();
});

test('an unconfirmed retired receiver shutdown remains an error and never invokes decryption',async()=>{
  const f=fixture();await f.handle.prepareEncryption(f.admission,f.agent,f.current,'epoch');await f.handle.join();await f.handle.leave();
  const track={enabled:true,readyState:'live',stop(){throw Error('native stop unavailable');}};
  assert.throws(()=>f.attached().decrypt({track},id(2)),/retired_track_unconfirmed/);
  assert.equal(track.enabled,false);assert.equal(f.events.includes('decrypt'),false);
});
for(const options of [{supported:false},{mode:'disabled'}])test(`required encryption refuses ${JSON.stringify(options)} without a join`,async()=>{
  const f=fixture(options);await assert.rejects(f.handle.prepareEncryption(f.admission,f.agent,f.current,'epoch'));
  assert.equal(f.events.includes('join'),false);assert.equal(f.events.includes('attach'),false);await f.handle.leave();
});
test('SDK confirmation mismatch refuses a usable connection instead of dropping encryption',async()=>{
  const f=fixture({confirmed:false});await f.handle.prepareEncryption(f.admission,f.agent,f.current,'epoch');
  await assert.rejects(f.handle.join(),/not_confirmed/);assert.equal(f.handle.encryptionStatus().sdkConfirmed,false);await f.handle.leave();
});
test('fatal encrypted-frame errors report failure and never switch to plaintext',async()=>{
  const f=fixture();await f.handle.prepareEncryption(f.admission,f.agent,f.current,'epoch');await f.handle.join();
  const states=[];const remove=f.handle.observeState(state=>states.push(state));f.listeners.get('e2ee.unencrypted_frame')();
  assert.ok(states.includes('reconnecting-failed'));assert.equal(f.handle.encryptionStatus().sdkConfirmed,false);remove();await f.handle.leave();
});
test('retirement during native manager creation disposes it and never attaches or joins',async()=>{
  const gate=deferred(),f=fixture({createGate:gate});const pending=f.handle.prepareEncryption(f.admission,f.agent,f.current,'epoch');
  await new Promise(resolve=>setImmediate(resolve));f.retire();gate.resolve();await assert.rejects(pending);
  assert.equal(f.events.includes('attach'),false);assert.equal(f.events.includes('join'),false);assert.equal(f.events.includes('dispose'),true);await f.handle.leave();
});

for(const code of ['e2ee.encryption_failed','e2ee.decryption_stalled','e2ee.missing_key','e2ee.unencrypted_frame','e2ee.unsupported_version'])
test(`${code} retains its bounded cause before failing the active encrypted owner`,async()=>{
  const f=fixture();await f.handle.prepareEncryption(f.admission,f.agent,f.current,'epoch');await f.handle.join();
  let observed;
  const remove=f.handle.observeState(state=>{if(state==='reconnecting-failed')observed=f.handle.state().failure;});
  f.listeners.get(code)({userId:id(2),trackType:'AUDIO',reason:'SECRET_NATIVE_BODY',key:'SECRET_KEY'});
  assert.deepEqual(observed,{code,trackType:'AUDIO',party:'remote',context:{callingState:'joined',microphoneStatus:'disabled',
    publisherPresent:false,subscriberPresent:false,localRetirementRequested:false}});
  assert.equal(f.handle.encryptionStatus().sdkConfirmed,false);
  f.listeners.get('e2ee.encryption_failed')({userId:id(1),trackType:'VIDEO'});
  assert.deepEqual(f.handle.state().failure,observed,'the first fault must survive later noise');
  assert.ok(!JSON.stringify(f.handle.state()).includes('SECRET'));
  remove();await f.handle.leave();
});

test('fault context survives synchronous retirement and peer removal before logging',async()=>{
  const f=fixture({withMicrophone:true});
  try{
    await f.handle.prepareEncryption(f.admission,f.agent,f.current,'epoch');await f.handle.join();await f.handle.enableMicrophone();
    f.call.subscriber={};
    const remove=f.handle.observeState(state=>{if(state==='reconnecting-failed'){
      f.call.publisher=undefined;f.call.subscriber=undefined;f.call.microphone.state.status='disabled';f.handle.beginRetirement();
    }});
    f.listeners.get('e2ee.unencrypted_frame')({userId:id(2),trackType:'AUDIO'});
    assert.deepEqual(f.handle.state().failure.context,{callingState:'joined',microphoneStatus:'enabled',
      publisherPresent:true,subscriberPresent:true,localRetirementRequested:false});
    remove();
  }finally{await f.handle.leave();}
});

test('adapter setup diagnostics distinguish provider read, key preparation, media join and input acknowledgement',async()=>{
  const read=deferred(),input=deferred(),f=fixture({configureInput:enabled=>enabled?input.promise:Promise.resolve()});
  f.call.get=()=>read.promise;
  try{
    const preparing=f.handle.prepareEncryption(f.admission,f.agent,f.current,'epoch');
    assert.equal(f.handle.setupTimings().providerReadMs,undefined);
    read.resolve();await preparing;
    for(const field of ['providerReadMs','keyPreparationMs'])assert.ok(f.handle.setupTimings()[field]>=0,field);
    const joining=f.handle.join();await new Promise(resolve=>setImmediate(resolve));
    assert.ok(f.handle.setupTimings().mediaJoinMs>=0);assert.equal(f.handle.setupTimings().microphoneInputMs,undefined);
    input.resolve();await joining;assert.ok(f.handle.setupTimings().microphoneInputMs>=0);
  }finally{read.resolve();input.resolve();await f.handle.leave();}
});

test('a fault attributed to an unrecognised native participant stays fatal without blaming the authenticated peer',async()=>{
  const f=fixture();
  try{
    await f.handle.prepareEncryption(f.admission,f.agent,f.current,'epoch');await f.handle.join();
    f.listeners.get('e2ee.unencrypted_frame')({userId:'SECRET_UNRECOGNISED_PARTICIPANT',trackType:'AUDIO'});
    assert.equal(f.handle.state().failure.party,'unknown');assert.equal(f.handle.encryptionStatus().sdkConfirmed,false);
    assert.equal(JSON.stringify(f.handle.state()).includes('SECRET'),false);
  }finally{await f.handle.leave();}
});

for(const leave of [false,true])test(`retired encryption callbacks cannot fail another owner (${leave?'after leave':'before leave'})`,async()=>{
  const f=fixture();await f.handle.prepareEncryption(f.admission,f.agent,f.current,'epoch');await f.handle.join();
  const callback=f.listeners.get('e2ee.encryption_failed'),states=[];
  const remove=f.handle.observeState(state=>states.push(state));
  f.retire();if(leave)await f.handle.leave();
  assert.doesNotThrow(()=>callback({userId:id(1),trackType:'AUDIO'}));
  assert.equal(f.handle.state().failure,undefined);
  assert.equal(states.includes('reconnecting-failed'),false);
  assert.equal(f.handle.encryptionStatus().sdkConfirmed,false);
  remove();if(!leave)await f.handle.leave();
});

test('unreadable encryption diagnostic fields do not suppress a fatal media fault',async()=>{
  const f=fixture();await f.handle.prepareEncryption(f.admission,f.agent,f.current,'epoch');await f.handle.join();
  const states=[],remove=f.handle.observeState(state=>states.push(state));
  const payload={get trackType(){throw Error('SECRET_NATIVE_FIELD');}};
  assert.doesNotThrow(()=>f.listeners.get('e2ee.encryption_failed')(payload));
  assert.equal(f.handle.state().failure.code,'e2ee.encryption_failed');
  assert.ok(states.includes('reconnecting-failed'));assert.equal(f.handle.encryptionStatus().sdkConfirmed,false);
  remove();await f.handle.leave();
});

test('encrypted native mute preserves source, sender and encryptor across repeated mute/unmute',async()=>{
  const f=fixture({withMicrophone:true});
  try{
    await f.handle.prepareEncryption(f.admission,f.agent,f.current,'epoch');await f.handle.join();await f.handle.enableMicrophone();
    assert.ok(f.events.indexOf('muted-detector-disabled')<f.events.indexOf('join'));
    for(let i=0;i<3;i++){
      await f.handle.muteMicrophone();
      assert.equal(f.capture.enabled,false);assert.equal(f.sender.enabled,false);
      assert.equal(f.capture.readyState,'live');assert.equal(f.sender.readyState,'live');
      assert.equal(f.handle.state().microphoneStatus,'disabled');assert.equal(f.handle.state().audioPublishing,false);
      assert.equal(f.handle.encryptionStatus().sdkConfirmed,true);
      await f.handle.enableMicrophone();
      assert.equal(f.capture.enabled,true);assert.equal(f.sender.enabled,true);assert.equal(f.handle.state().microphoneStatus,'enabled');
    }
    assert.equal(f.events.filter(e=>e==='sdk-mic-disable').length,0);
    assert.equal(f.events.filter(e=>e==='sdk-mic-enable').length,1);
    assert.equal(f.events.filter(e=>e==='encrypt').length,1);assert.equal(f.events.filter(e=>e==='join').length,1);
  }finally{await f.handle.disableMicrophone();await f.handle.leave();}
});

test('a real unencrypted-frame event remains fatal while encrypted microphone tracks are paused',async()=>{
  const f=fixture({withMicrophone:true});
  try{
    await f.handle.prepareEncryption(f.admission,f.agent,f.current,'epoch');await f.handle.join();await f.handle.enableMicrophone();
    await f.handle.muteMicrophone();f.listeners.get('e2ee.unencrypted_frame')({userId:id(2),trackType:'AUDIO'});
    assert.equal(f.handle.state().failure.code,'e2ee.unencrypted_frame');assert.equal(f.handle.encryptionStatus().sdkConfirmed,false);
    await assert.rejects(f.handle.enableMicrophone(),/owner_retired/);assert.equal(f.sender.enabled,false);
  }finally{await f.handle.disableMicrophone();await f.handle.leave();}
});

test('native hard stop ends paused source and sender tracks and still invokes SDK shutdown',async()=>{
  const f=fixture({withMicrophone:true});
  try{
    await f.handle.prepareEncryption(f.admission,f.agent,f.current,'epoch');await f.handle.join();await f.handle.enableMicrophone();await f.handle.muteMicrophone();
    await f.handle.disableMicrophone();
    assert.equal(f.capture.readyState,'ended');assert.equal(f.sender.readyState,'ended');assert.ok(f.events.includes('sdk-mic-disable'));
  }finally{await f.handle.leave();}
});

test('encrypted input configuration is acknowledged before the first microphone capture',async()=>{
  const gate=deferred(),events=[],f=fixture({configureInput:async enabled=>{events.push(enabled);if(enabled)await gate.promise;}});
  try{
    await f.handle.prepareEncryption(f.admission,f.agent,f.current,'epoch');
    const joining=f.handle.join();await new Promise(resolve=>setImmediate(resolve));
    assert.deepEqual(events,[true]);assert.equal(f.events.includes('sdk-mic-enable'),false);
    gate.resolve();await joining;await f.handle.enableMicrophone();
    assert.ok(f.events.includes('sdk-mic-enable'));
    await f.handle.leave();assert.deepEqual(events,[true,false]);
  }finally{gate.resolve();await f.handle.leave();}
});

test('failed native input preparation prevents capture and still disposes the encrypted call',async()=>{
  const f=fixture({configureInput:async enabled=>{if(enabled)throw Error('synthetic input unavailable');}});
  await f.handle.prepareEncryption(f.admission,f.agent,f.current,'epoch');
  await assert.rejects(f.handle.join(),/input unavailable/);
  assert.equal(f.events.includes('sdk-mic-enable'),false);
  await f.handle.leave();assert.ok(f.events.includes('dispose'));
});

test('retirement during native input configuration cannot revive capture or leave a pinned setting',async()=>{
  const gate=deferred(),events=[],f=fixture({configureInput:async enabled=>{events.push(enabled);if(enabled)await gate.promise;}});
  await f.handle.prepareEncryption(f.admission,f.agent,f.current,'epoch');
  const joining=f.handle.join();await new Promise(resolve=>setImmediate(resolve));
  const ending=f.handle.leave();gate.resolve();await assert.rejects(joining,/owner_retired/);await ending;
  assert.deepEqual(events,[true,false]);assert.equal(f.events.includes('sdk-mic-enable'),false);
});

test('concurrent retirement and leave share one pending SDK shutdown',async()=>{
  const f=fixture(),gate=deferred();
  await f.handle.prepareEncryption(f.admission,f.agent,f.current,'epoch');await f.handle.join();
  const leave=f.call.leave;f.call.leave=async()=>{await gate.promise;await leave();};
  f.handle.beginRetirement();const one=f.handle.leave(),two=f.handle.leave();assert.equal(one,two);
  const states=[],remove=f.handle.observeState(state=>states.push(state));
  f.listeners.get('e2ee.unencrypted_frame')({userId:id(2),trackType:'AUDIO'});
  assert.equal(f.handle.state().failure,undefined,'only the retired local receiver is fenced');
  gate.resolve();await Promise.all([one,two]);remove();
  assert.equal(f.events.filter(e=>e==='leave').length,1);assert.equal(states.includes('reconnecting-failed'),false);
});

test('failed native input reset cannot postpone encryption-key disposal after peers have left',async()=>{
  let failed=true;
  const f=fixture({configureInput:async enabled=>{if(!enabled&&failed)throw Error('synthetic reset failure');}});
  await f.handle.prepareEncryption(f.admission,f.agent,f.current,'epoch');await f.handle.join();
  await assert.rejects(f.handle.leave(),/audio_input_unconfirmed/);assert.ok(f.events.includes('dispose'));
  failed=false;await f.handle.leave();assert.equal(f.events.filter(e=>e==='dispose').length,1);
});
