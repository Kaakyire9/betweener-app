const test=require('node:test');const assert=require('node:assert/strict');
const {createHash,createHmac,webcrypto}=require('node:crypto');const fs=require('node:fs');const vm=require('node:vm');const ts=require('typescript');
const {connectWebhookReceiptDigest,connectWebhookCall,verifyConnectWebhook}=require('../supabase/functions/_shared/connect-webhook.ts');
const id='aa110000-0000-4000-8000-000000000001',other='aa110000-0000-4000-8000-000000000002',secret='synthetic-only';
const body=(patch={})=>JSON.stringify({type:'call.session_ended',call_cid:`betweener_connect:${id}`,created_at:new Date().toISOString(),...patch});
const digest=(raw,delivery='retry-123',call=id,app='1731011')=>connectWebhookReceiptDigest(raw,call,app,delivery);
test('documented stable delivery ID deduplicates changed retry body and JSON formatting',async()=>{
 const raw=body();const changed=JSON.stringify({...JSON.parse(raw),retry_detail:'different'},null,2);
 assert.equal(await digest(raw),await digest(changed));
});
test('delivery identities remain case-sensitive and scoped to the exact call',async()=>{
 assert.notEqual(await digest(body()),await digest(body(),'RETRY-123'));
 assert.notEqual(await digest(body()),await digest(body(),'retry-123',other));
 assert.equal(await digest(body(),'retry-123',id.toUpperCase()),await digest(body()));
});
test('different provider events have different receipt identities even with identical payloads',async()=>{
 const raw=body();assert.notEqual(await digest(raw,'event-a'),await digest(raw,'event-b'));
});
test('no-header delivery preserves exact legacy SHA256 receipt identity',async()=>{
 const raw=body();assert.equal(await digest(raw,null),createHash('sha256').update(raw).digest('hex'));
});
for(const invalid of ['', 'x'.repeat(129),'id with space','id\nnext','💡'])test(`invalid delivery identity fails closed: ${JSON.stringify(invalid)}`,async()=>{
 await assert.rejects(digest(body(),invalid),/identity_invalid/);
});
test('foreign application or invalid call cannot obtain a receipt key',async()=>{
 await assert.rejects(digest(body(),'retry',id,'999'),/binding_invalid/);
 await assert.rejects(digest(body(),'retry','arbitrary'),/binding_invalid/);
});
function handler(){let serve;const calls=[];const seen=new Set();let enqueues=0;
 const source=fs.readFileSync('supabase/functions/connect-webhook/index.ts','utf8').replace(/^import .*;\r?\n/gm,'');
 vm.runInNewContext(ts.transpile(source,{module:ts.ModuleKind.CommonJS}),{Deno:{serve:fn=>serve=fn},crypto:webcrypto,TextEncoder,Response,
  connectEnv:n=>n==='CONNECT_STREAM_APP_ID'?'1731011':secret,connectJson:(v,s=200)=>Response.json(v,{status:s}),connectBackend:()=>({service:{}}),
  connectRpc:async(_,name,args)=>{calls.push({name,args});if(!seen.has(args.p_digest)){seen.add(args.p_digest);enqueues++;}},
  connectWebhookCall,connectWebhookReceiptDigest,verifyConnectWebhook});
 return{serve,calls,enqueues:()=>enqueues};
}
const req=(raw,delivery='same-event',sig=createHmac('sha256',secret).update(raw).digest('hex'))=>new Request('http://localhost/fixture',{
 method:'POST',body:raw,headers:{'x-webhook-id':delivery,'x-signature':sig}});
test('actual Edge handler passes stable delivery key to existing deduplicated RPC',async()=>{
 const f=handler(),a=body(),b=body({detail:'retry'});await Promise.all([f.serve(req(a)),f.serve(req(b))]);
 assert.equal(f.calls.length,2);assert.equal(f.enqueues(),1);assert.equal(f.calls[0].args.p_call,id);assert.equal(f.calls[0].name,'rpc_connect_enqueue_sync');
});
test('same event ID on a tampered or unsigned body never reaches receipt storage',async()=>{
 const f=handler(),a=body(),sig=createHmac('sha256',secret).update(a).digest('hex');
 assert.equal((await f.serve(req(a+' ','same-event',sig))).status,401);
 assert.equal((await f.serve(req(a,'same-event',''))).status,401);assert.equal(f.calls.length,0);
});
test('Live events and stale signed callbacks do not enqueue Connect work',async()=>{
 const f=handler();await f.serve(req(body({call_cid:`default:${id}`})));
 await f.serve(req(body({created_at:'2020-01-01T00:00:00Z'})));assert.equal(f.calls.length,0);
});
test('validly signed unknown call event is only a GET wakeup, never an admission claim',async()=>{
 const f=handler();await f.serve(req(body({type:'call.future_type',state:'ACTIVE',accepted:true,participants:['forged']})));
 assert.equal(f.calls.length,1);assert.deepEqual(Object.keys(f.calls[0].args).sort(),['p_call','p_digest']);
});
