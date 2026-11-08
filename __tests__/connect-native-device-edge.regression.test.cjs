const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const id='f0110000-0000-4000-8000-000000000001';
function fixture({authorised=true,available=true}={}){
  let handler,backend=0;const rpc=[];
  const source=fs.readFileSync('supabase/functions/connect-native-device/index.ts','utf8').replace(/^import .*;\r?\n/gm,'');
  vm.runInNewContext(ts.transpile(source,{module:ts.ModuleKind.CommonJS}),{
    Deno:{serve:value=>{handler=value;}},connectJson:(data,status=200)=>Response.json(data,{status}),
    connectBackend(){backend++;return {authenticated:()=>({auth:{getUser:async()=>({data:{user:authorised?{id}:null},error:null})}})};},
    async connectRpc(_user,name,args){rpc.push([name,args]);if(!available)throw Error('disabled_or_stale_session');return true;}
  });
  const body={deviceId:id,platform:'ios',token:'synthetic-native-token',register:true};
  const send=(patch={},bearer='synthetic-auth',method='POST')=>handler(new Request('http://127.0.0.1/native-device-fixture',{
    method,headers:bearer?{Authorization:`Bearer ${bearer}`}:{},...(method==='POST'?{body:JSON.stringify({...body,...patch})}:{})}));
  return {send,rpc,backend:()=>backend};
}
test('native device endpoint rejects absent auth before privileged client construction',async()=>{
  const f=fixture();assert.equal((await f.send({},'')).status,401);assert.equal(f.backend(),0);assert.deepEqual(f.rpc,[]);
});
test('native device endpoint rejects invalid authenticated identity before intent RPC',async()=>{
  const f=fixture({authorised:false});assert.equal((await f.send()).status,401);assert.deepEqual(f.rpc,[]);
});
for(const patch of [{token:'bad token'},{register:'true'},{provider:'untrusted-provider'},{platform:'web'},{token:'x'.repeat(6100)}])test(`native device endpoint rejects malformed ${Object.keys(patch)[0]}`,async()=>{
  const f=fixture();assert.equal((await f.send(patch)).status,400);assert.equal(f.backend(),0);assert.deepEqual(f.rpc,[]);
});
test('native device enrollment queues only the owned intent and returns no token or provider payload',async()=>{
  const f=fixture(),response=await f.send();assert.equal(response.status,200);assert.deepEqual(await response.json(),{queued:true});
  assert.equal(f.rpc.length,1);assert.equal(f.rpc[0][0],'rpc_connect_native_device_intent');
  assert.deepEqual(JSON.parse(JSON.stringify(f.rpc[0][1])),{p_device:id,p_platform:'ios',p_token:'synthetic-native-token',p_register:true});
});
test('disabled or stale-session intent failure cannot turn into success',async()=>{
  const f=fixture({available:false});assert.equal((await f.send()).status,403);assert.equal(f.rpc.length,1);
});
