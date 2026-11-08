const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
const {randomUUID}=require('node:crypto');
const {root,dir,sha,verifyFrozen,verifyArtifact,prepare}=require('../scripts/lib/connect-push-rehearsal/prepare.cjs');
const {launch}=require('../scripts/lib/connect-push-rehearsal/edge.cjs');
const scratch=path.join(dir,'negative-fixtures');fs.mkdirSync(scratch,{recursive:true});
test('all 66 historical comparisons and all five recovered originals remain unchanged',()=>{verifyFrozen({historicalReplay:true});});
test('strict current-source verification still rejects the superseded deployment candidate',()=>{assert.throws(()=>verifyFrozen(),/frozen_package_drift/);});

test('historical provider replay is pinned to retained bytes and never substitutes evolved sources',()=>{
  const {historicalWebhookSource}=require('../scripts/lib/connect-push-rehearsal/historical-source.cjs');
  const original='5b7ec7409bfe12c07277b373617ea3dfcfb2cf562c092869ee3b1871e046b695';
  const receipt=historicalWebhookSource('supabase/functions/_shared/connect-provider-end.ts',original,'new-local-source');
  assert.equal(sha(fs.readFileSync(path.join(root,receipt))),original);
  assert.throws(()=>historicalWebhookSource('supabase/functions/_shared/connect-provider-end.ts','unapproved','new-local-source'),/unreviewed_historical_source_drift/);
});
test('unreviewed source evolution is rejected rather than accepted as historical evidence',()=>{
  const {historicalWebhookSource}=require('../scripts/lib/connect-push-rehearsal/historical-source.cjs');
  assert.throws(()=>historicalWebhookSource('supabase/functions/_shared/connect-webhook.ts','unknown','unknown'),/unreviewed_historical_source_drift/);
  assert.throws(()=>historicalWebhookSource('supabase/functions/push-notifications/index.ts','unknown','unknown'),/unreviewed_historical_source_drift/);
});
test('dependency closure verifies locally without a resolver or hosted request',async()=>{const d=await prepare();assert.equal(d.files.length,14);assert.equal(d.originalHostedResolution,'UNVERIFIED');});
for(const variant of ['forward','v26'])test(`${variant} missing shared helper fails actual offline Deno startup`,()=>{
  const location=path.join(scratch,variant,'push-notifications');fs.mkdirSync(location,{recursive:true});
  fs.copyFileSync(path.join(dir,variant,'supabase/functions/push-notifications/index.ts'),path.join(location,'index.ts'));
  assert.throws(()=>execFileSync(path.join(root,'.npm-cache/_npx/2cf4608ff26a9317/node_modules/deno/deno.exe'),
    ['run','--no-remote','--deny-import','--deny-net','--no-prompt','--no-npm','--no-lock','--no-config','--import-map',path.join(dir,'import_map.json'),path.join(location,'index.ts')],
    {stdio:'pipe',timeout:10000}),e=>/Module not found/.test(String(e.stderr)));
});
test('unreviewed function version is rejected before starting any runtime',async()=>{await assert.rejects(launch('v27-unreviewed','http://127.0.0.1:1'),/unreviewed_function_version/);});
test('final loopback seam loads v26 and denies unsigned input with external net denied',async()=>{
  const edge=await launch('v26','http://127.0.0.1:1');try{
    assert.equal((await edge.control()).externalNetPermission,'denied');assert.equal((await edge.request(randomUUID(),{signature:'0'.repeat(64)})).status,401);
  }finally{await edge.stop();}
});
test('an already frozen dependency closure cannot be silently regenerated',async()=>{await assert.rejects(prepare({resolvePublic:true}),/dependency_closure_already_frozen/);});
test('dependency/content drift is rejected, rather than silently re-resolved',()=>{
  const base=path.join(scratch,'drift');fs.mkdirSync(base,{recursive:true});fs.writeFileSync(path.join(base,'dependency.js'),'known');
  const m={variant:'v26',verifyJwt:false,originalHostedBundleReproduction:false,files:[{path:'dependency.js',sha256:sha('known')}]};
  verifyArtifact(m,base);fs.writeFileSync(path.join(base,'dependency.js'),'changed');assert.throws(()=>verifyArtifact(m,base),/artifact_hash_drift/);
});
test('gateway drift and false original-bundle attestation are rejected',()=>{
  for(const patch of [{verifyJwt:true},{originalHostedBundleReproduction:true}])assert.throws(()=>verifyArtifact({variant:'v26',files:[],verifyJwt:false,originalHostedBundleReproduction:false,...patch},scratch),/artifact_configuration_drift/);
});
test('recovery manifest cannot reach outside its artifact directory',()=>{
  assert.throws(()=>verifyArtifact({variant:'v26',files:[{path:'../outside',sha256:''}]},scratch),/artifact_path_escape/);
});
