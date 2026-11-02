const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {inspectBinaryContract}=require('../harnesses/connect-device-safety/binary-contract.ts');
function fixture(){let nativeCalls=0;const rtc={};for(const name of ['createCallFactory','disposeCallFactory','getUserMedia','mediaStreamTrackRelease'])rtc[name]=()=>{nativeCalls++;throw Error('must_not_run');};
 const input={development:true,platform:'android',webRtc:()=>rtc,rtcView:()=>({}),callingx:()=>({}),optionalModule:()=>({})};return {input,rtc,calls:()=>nativeCalls};}
test('complete inspection checks presence without invoking native APIs or claiming hardware/versions',()=>{
 const f=fixture(),r=inspectBinaryContract(f.input);assert.equal(r.moduleContractComplete,true);assert.deepEqual(r.missing,[]);assert.equal(f.calls(),0);
 assert.equal(r.hardwareTested,false);assert.equal(r.nativeVersionsVerified,false);assert.equal(r.streamConnectionCreated,false);
});
for(const name of ['createCallFactory','disposeCallFactory','getUserMedia','mediaStreamTrackRelease'])test(`missing ${name} is reported by name and blocks arming`,()=>{
 const f=fixture();delete f.rtc[name];const r=inspectBinaryContract(f.input);assert.equal(r.moduleContractComplete,false);assert.ok(r.missing.includes(name));assert.equal(f.calls(),0);
});
for(const name of ['WebRTCModule','RTCView','Callingx','ExpoAudio','FileSystem'])test(`missing ${name} is explicit and cannot be mistaken for compatibility`,()=>{
 const f=fixture();if(name==='WebRTCModule')f.input.webRtc=()=>undefined;else if(name==='RTCView')f.input.rtcView=()=>null;else if(name==='Callingx')f.input.callingx=()=>null;else f.input.optionalModule=n=>n===name?null:{};
 const r=inspectBinaryContract(f.input);assert.equal(r.moduleContractComplete,false);assert.ok(r.missing.includes(name));assert.equal(f.calls(),0);
});
test('throwing bridge metadata becomes structured incomplete evidence without raw provider/native prose',()=>{
 const f=fixture();f.input.callingx=()=>{throw Error('sensitive_native_error_SENTINEL');};const r=inspectBinaryContract(f.input);
 assert.equal(r.moduleContractComplete,false);assert.ok(r.inspectionErrors.includes('Callingx'));assert.ok(!JSON.stringify(r).includes('SENTINEL'));
});
test('a throwing method getter does not abort the remaining module checks',()=>{
 const f=fixture();Object.defineProperty(f.rtc,'createCallFactory',{get(){throw Error('getter');}});const r=inspectBinaryContract(f.input);
 assert.ok(r.missing.includes('createCallFactory'));assert.equal(r.checks.FileSystem,true);assert.ok(r.inspectionErrors.includes('WebRTCModule.createCallFactory'));
});
test('release builds and unsupported platforms cannot pass',()=>{
 const f=fixture();f.input.development=false;assert.equal(inspectBinaryContract(f.input).moduleContractComplete,false);f.input.development=true;f.input.platform='web';assert.equal(inspectBinaryContract(f.input).moduleContractComplete,false);
});
test('inspection is fresh and does not cache a previously compatible bridge',()=>{
 const f=fixture();assert.equal(inspectBinaryContract(f.input).moduleContractComplete,true);delete f.rtc.disposeCallFactory;assert.equal(inspectBinaryContract(f.input).moduleContractComplete,false);
});
test('screen exposes no-capture inspection before arming and repeats inspection at arm',()=>{
 const s=fs.readFileSync('harnesses/connect-device-safety/DeviceSafetyScreen.tsx','utf8');assert.ok(s.indexOf('1. Check native modules (no sensors)')<s.indexOf('2. Arm local test session'));
 assert.ok(s.includes('!binary?.moduleContractComplete'));assert.ok(s.includes('const inspected = inspectLocalBinary(); setBinary(inspected);'));
 const start=s.indexOf('title="1. Check native modules');const end=s.indexOf('title="2. Arm local test session');const action=s.slice(start,end);
 for(const forbidden of ['loadLocalHardware(','.microphone(','.camera(','.startTone(','.create('])assert.ok(!action.includes(forbidden));
});
test('LAN is never labelled isolated merely by reachability and guards/default flags remain',()=>{
 const s=fs.readFileSync('harnesses/connect-device-safety/DeviceSafetyScreen.tsx','utf8');assert.ok(s.includes('ordinary home Wi-Fi does not qualify'));assert.ok(s.includes('disabled={!isolated'));
 const g=fs.readFileSync('harnesses/connect-device-safety/network-guard.ts','utf8');assert.ok(g.includes('configurable: false, writable: false'));assert.ok(g.includes('device_harness_network_forbidden'));
 const flags=require('../features/connect/config/connect-feature-flags.ts').connectFeatureFlags;assert.equal(flags.nativeSafetyOwner,false);assert.equal(flags.endCallAndBlock,false);
});
