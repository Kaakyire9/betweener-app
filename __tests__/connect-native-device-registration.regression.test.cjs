const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const {createNativeSessionOwner}=require('../lib/auth/native-session-owner.ts');
const {id,jwt,deferred,settle}=require('./fixtures/connect-product-fixture.cjs');
async function fixture({platform='ios',permission=true,enabled=true}={}) {
  const native=createNativeSessionOwner();native.accept({user:{id:id(1)},access_token:jwt()});
  const events=[],listeners=new Map();let imports=0,wait;
  const port={canPostNotifications:permission,registerVoipToken(){},getInitialVoipEvents:()=>[],
    addEventListener(name,callback){listeners.set(name,callback);return {remove:()=>listeners.delete(name)};}};
  const module={exports:{}};
  vm.runInNewContext(ts.transpile(fs.readFileSync('features/connect/application/native-device-registration.ts','utf8'),{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}),{
    module,exports:module.exports,require(name){
      if(name.includes('native-incoming-bootstrap'))return {getConnectIncomingConfig:()=>({enabled}),handleConnectNativeCallAction:async()=>{}};
      if(name==='@stream-io/react-native-callingx')return {CallingxModule:port};
      if(name==='@react-native-firebase/messaging'){imports++;return {getMessaging:()=>({}),getToken:async()=> 'android-synthetic-token',onTokenRefresh:()=>()=>{}};}
      throw Error('unexpected_native_import');
    }
  });
  const registration=await module.exports.registerNativeIncomingDevice({auth:native.owner,deviceId:id(4),platform,
    async send(body){events.push([body.token,body.register]);if(wait){const own=wait;wait=null;await own.promise;}return true;}});
  return {native,events,registration,imports:()=>imports,emit:token=>listeners.get('voipNotificationsRegistered')?.({token}),
    pause:()=>{wait=deferred();return wait;},listeners};
}
test('native token rotation serializes removal before registration and ignores duplicates',async()=>{
  const f=await fixture(),pending=f.pause();f.emit('synthetic-token-a');await settle();
  f.emit('synthetic-token-b');await settle();assert.deepEqual(f.events,[['synthetic-token-a',true]]);
  pending.resolve();await settle();await settle();
  assert.deepEqual(f.events,[['synthetic-token-a',true],['synthetic-token-a',false],['synthetic-token-b',true]]);
  f.emit('synthetic-token-b');await settle();assert.equal(f.events.length,3);f.registration.dispose();assert.equal(f.listeners.size,0);
});
test('account switch queues old-token removal and fences a late registration callback',async()=>{
  const f=await fixture(),pending=f.pause();f.emit('synthetic-token-a');await settle();
  f.native.accept({user:{id:id(2)},access_token:jwt(id(2))});pending.resolve();await settle();
  f.emit('synthetic-token-b');await settle();assert.deepEqual(f.events,[['synthetic-token-a',true],['synthetic-token-a',false]]);
  assert.equal(f.listeners.size,0);f.registration.dispose();
});
test('a product release without logout preserves incoming registration for cold start',async()=>{
  const f=await fixture();f.emit('synthetic-token-a');await settle();f.registration.dispose();
  assert.deepEqual(f.events,[['synthetic-token-a',true]]);
});
test('disabled native incoming and denied Android notifications do not request a push token',async()=>{
  const disabled=await fixture({enabled:false});assert.equal(disabled.listeners.size,0);assert.deepEqual(disabled.events,[]);
  const android=await fixture({platform:'android',permission:false});await settle();assert.equal(android.imports(),0);assert.deepEqual(android.events,[]);android.registration.dispose();
});
