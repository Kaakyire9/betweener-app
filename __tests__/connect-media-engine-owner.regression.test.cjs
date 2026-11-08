const test=require('node:test'),assert=require('node:assert/strict');
const {createNativeMediaEngineOwner}=require('../features/connect/media/native-media-engine-owner.ts');
const {connectRingtone}=require('../features/connect/voice/ringtone.ts');
const {adaptNativeStreamSdk}=require('../features/connect/media/native-stream-sdk.ts');
const {deferred}=require('./fixtures/connect-product-fixture.cjs');
test('SDK-swallowed factory failure cannot become a successful lease release',async()=>{
 let fail=true,count=0;const owner=createNativeMediaEngineOwner(async()=>({dispose:async()=>{count++;if(fail)throw Error('native');return true;}}));
 const engine=await owner.provider();await engine.dispose().catch(()=>undefined);
 await assert.rejects(owner.release(),/native/);fail=false;await owner.release();assert.equal(count,3);
 await assert.rejects(owner.provider(),/retired/);
});
test('false native disposal acknowledgement remains unconfirmed',async()=>{
 const owner=createNativeMediaEngineOwner(()=>({dispose:async()=>false}));await owner.provider();await assert.rejects(owner.release(),/unconfirmed/);
});
test('a late factory must finish and dispose before ownership can release',async()=>{
 const gate=deferred();let disposed=0,released=false;
 const owner=createNativeMediaEngineOwner(()=>gate.promise),loading=owner.provider(),release=owner.release().then(()=>{released=true;});
 await Promise.resolve();assert.equal(released,false);gate.resolve({dispose:async()=>{disposed++;return true;}});
 await loading;await release;assert.equal(disposed,1);
});
test('SDK leave and owner release share a pending disposal and dispose once',async()=>{
 const gate=deferred();let count=0;const owner=createNativeMediaEngineOwner(()=>({dispose:async()=>{count++;await gate.promise;return true;}}));
 const engine=await owner.provider(),first=engine.dispose(),release=owner.release();gate.resolve();await Promise.all([first,release]);await owner.release();assert.equal(count,1);
});
test('failed factory allocation remains quarantined instead of becoming an empty release',async()=>{
 const owner=createNativeMediaEngineOwner(async()=>{throw Error('allocation_unknown');});await assert.rejects(owner.provider(),/unknown/);await assert.rejects(owner.release(),/unknown/);
});
test('ringing tones stop on accept, decline, connection, background and completion',()=>{
 const state={foreground:true,busy:false,phase:'RINGING',incoming:true};assert.equal(connectRingtone(state),'incoming');
 assert.equal(connectRingtone({...state,incoming:false}),'outgoing');
 for(const patch of [{busy:true},{foreground:false},...['REQUESTED','CONNECTING','ACTIVE','ENDING','ENDED','FAILED'].map(phase=>({phase}))])assert.equal(connectRingtone({...state,...patch}),null);
});
test('the installed SDK adapter fences disconnect and restores the original provider only after disposal',async()=>{
 let fail=true,disconnects=0;
 const previous=async()=>({dispose:async()=>{if(fail)throw Error('native_disposal_failed');return true;}});let current=previous;
 const client={streamClient:{options:{}},disconnectUser:async()=>{disconnects++;}};
 const sdk=adaptNativeStreamSdk({StreamVideoClient:{getOrCreateInstance(options){client.streamClient.options=options.options;return client;}},
   callManager:{},SfuModels:{},getCallMediaEngineProvider:()=>current,setCallMediaEngineProvider:value=>{current=value;}});
 const owner=sdk.createClient({apiKey:'offline',userId:'synthetic',tokenProvider:async()=> 'offline',onConnectionFailure(){}});
 const wrapped=current,engine=await current();await engine.dispose().catch(()=>undefined);
 await assert.rejects(owner.disconnectUser(),/native_disposal_failed/);assert.equal(disconnects,0);assert.equal(current,wrapped);
 fail=false;await owner.disconnectUser();assert.equal(current,previous);await owner.disconnectUser();assert.equal(disconnects,1);
});
