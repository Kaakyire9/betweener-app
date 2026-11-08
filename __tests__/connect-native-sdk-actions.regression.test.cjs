const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm'), ts = require('typescript');
const base = 'node_modules/@stream-io/video-react-native-sdk/';
const evaluate = (file, dependencies) => {
  const module = { exports: {} };
  vm.runInNewContext(ts.transpile(fs.readFileSync(base + file,'utf8'), { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }), {
    module, exports: module.exports, require: name => dependencies(name), setTimeout, clearTimeout,
  }); return module.exports;
};
for (const variant of ['src','dist/module','dist/commonjs']) test(`installed ${variant} native Answer uses the app-owned action before SDK client creation`, async () => {
  const ext = variant === 'src' ? 'ts' : 'js'; let clients = 0, fulfilled;
  const hooks = evaluate(`${variant}/utils/internal/ringingCallLifecycle.${ext}`, () => ({ videoLoggerSystem: { getLogger: () => ({ debug(){},warn(){},error(){} }) }, CallingState: {} }));
  hooks.setRingingCallLifecycleHooks({ onNativeCallAction: async event => ({ handled: event.cid.startsWith('betweener_connect:'), success: true }) });
  const helpers = evaluate(`${variant}/utils/push/internal/utils.${ext}`, name => {
    if (name.includes('ringingCallLifecycle')) return hooks;
    if (name === '@stream-io/video-client') return { videoLoggerSystem: { getLogger: () => ({ debug(){},warn(){},error(){} }) }, CallingState: {} };
    if (name === 'react-native') return { AppState: { currentState:'background' } };
    return { pushUnsubscriptionCallbacks:new Map() };
  });
  await helpers.processCallFromPushInBackground({ createStreamVideoClient: async () => { clients++; return undefined; } }, 'betweener_connect:test', 'accept', value => { fulfilled = value; });
  assert.equal(clients,0); assert.equal(fulfilled,false);
  await helpers.processCallFromPushInBackground({ createStreamVideoClient: async () => { clients++; return undefined; } }, 'livestream:test', 'accept', value => { fulfilled = value; });
  assert.equal(clients,1); assert.equal(fulfilled,true);
});

for (const variant of ['src','dist/module','dist/commonjs']) test(`installed ${variant} fulfills native Answer once before join and does not refulfill after failure`, async () => {
  const ext=variant==='src'?'ts':'js', fulfilled=[];
  const dependencies=name=> name==='react-native'?{AppState:{currentState:'background'}}
    :{videoLoggerSystem:{getLogger:()=>({debug(){},warn(){},error(){}})},CallingState:{}};
  const hooks=evaluate(`${variant}/utils/internal/ringingCallLifecycle.${ext}`,dependencies);
  hooks.setRingingCallLifecycleHooks({onNativeCallAction:async event=>{
    event.onAnswerReady();event.onAnswerReady();assert.deepEqual(fulfilled,[false]);
    return {handled:true,success:false};
  }});
  const helpers=evaluate(`${variant}/utils/push/internal/utils.${ext}`,name=>name.includes('ringingCallLifecycle')?hooks:dependencies(name));
  await helpers.processCallFromPushInBackground({createStreamVideoClient:async()=>{throw Error('SDK autojoin forbidden');}},'betweener_connect:test','accept',value=>fulfilled.push(value));
  assert.deepEqual(fulfilled,[false]);
});

for (const variant of ['src','dist/module','dist/commonjs']) {
  test(`installed ${variant} manual Android enrollment never sends or logs a token through the SDK`,async()=>{
    const ext=variant==='src'?'ts':'js';let devices=0,logs=0;
    const port=evaluate(`${variant}/utils/push/android.${ext}`,name=>{
      if(name==='react-native')return {Platform:{OS:'android'}};
      if(name==='@stream-io/video-client')return {videoLoggerSystem:{getLogger:()=>({debug(){logs++;},warn(){logs++;}})}};
      return {getFirebaseMessagingLib:()=>{throw Error('manual path cannot request token');},setPushLogoutCallback(){throw Error('manual path cannot own logout');}};
    });
    await port.initAndroidPushToken({addDevice:async()=>{devices++;}},{deviceRegistration:'manual',android:{pushProviderName:'staging-only'}},()=>{});
    assert.equal(devices,0);assert.equal(logs,0);
  });
  test(`installed ${variant} manual iOS enrollment skips both automatic token effects`,()=>{
    const ext=variant==='src'?'ts':'js';let devices=0,native=0;
    const port=evaluate(`${variant}/hooks/push/useIosVoipPushEventsSetupEffect.${ext}`,name=>{
      if(name==='react')return {useEffect:work=>work(),useRef:value=>({current:value}),useState:()=>[undefined,()=>{}]};
      if(name==='react-native')return {Platform:{OS:'ios'}};
      if(name==='@stream-io/video-client')return {videoLoggerSystem:{getLogger:()=>({debug(){},warn(){}})}};
      if(name==='@stream-io/video-react-bindings')return {useConnectedUser:()=>({id:'synthetic'}),useStreamVideoClient:()=>({addVoipDevice(){devices++;}})};
      if(name==='../../utils')return {StreamVideoRN:{getConfig:()=>({push:{deviceRegistration:'manual',ios:{pushProviderName:'staging-only'}}})}};
      return {getCallingxLibIfAvailable(){native++;throw Error('manual path cannot register native token');}};
    });
    port.useIosVoipPushEventsSetupEffect();assert.equal(devices,0);assert.equal(native,0);
  });
}
