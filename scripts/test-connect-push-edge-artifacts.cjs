// Cached Edge runtime, network=none, no real backend/delivery credentials.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { dir, sha, saveJson } = require('./lib/connect-push-rehearsal/prepare.cjs');
const image='public.ecr.aws/supabase/edge-runtime:v1.77.4';
const docker=(args)=>execFileSync('docker',args,{encoding:'utf8',windowsHide:true,stdio:['pipe','pipe','pipe']});
const receipt={scope:'LOCAL_CACHED_EDGE_RUNTIME_ONLY',checks:[],externalNetwork:false};
const owned=[];
const check=async(name,fn)=>{await fn();receipt.checks.push(name);console.log('ok - '+name);};
(async()=>{
  receipt.imageId=docker(['image','inspect',image,'--format','{{.Id}}']).trim();
  receipt.runtimeVersion=docker(['run','--rm','--pull=never','--network','none',image,'--version']).trim();
  for(const variant of ['forward','v26']) {
    const manifest=JSON.parse(fs.readFileSync(path.join(dir,`${variant}-artifact.json`)));
    await check(`${variant} artifact source/dependency/config hashes`,()=>{
      for(const f of manifest.files)assert.equal(sha(fs.readFileSync(path.join(dir,variant,f.path))),f.sha256,f.path);
    });
    // Bundle in --network none proves the runtime resolves every static dependency offline.
    await check(`${variant} eszip builds without network`,()=>{
      docker(['run','--rm','--pull=never','--network','none','--mount',`type=bind,source=${path.join(dir,variant)},target=/app,readonly`,
        '--mount',`type=bind,source=${path.join(dir,'bundles')},target=/out`,image,'bundle','--entrypoint','/app/supabase/functions/push-notifications/index.ts',
        '--output',`/out/${variant}.eszip`,'--checksum','sha256','--timeout','20']);
      assert.ok(fs.statSync(path.join(dir,`bundles/${variant}.eszip`)).size>100000);
    });
    const name=`connect-push-edge-48-${variant}-${process.pid}`;owned.push(name);
    docker(['run','-d','--pull=never','--name',name,'--network','none',
      '--mount',`type=bind,source=${path.join(dir,'bundles')},target=/payload,readonly`,
      '-e','PUSH_DELIVERY_MODE=enabled','-e','PUSH_APP_ENVIRONMENT=staging','-e','PUSH_APPLICATION_ID=com.aduboffour.betweener.staging',
      '-e','PUSH_EXPO_PROJECT_ID=7f38a835-2da7-419b-a20b-e1a12e021547','-e','PUSH_HMAC_CURRENT_KEY_ID=offline-48',
      '-e','PUSH_HMAC_CURRENT_SECRET=offline-only-signing-material-48-at-least-43-characters','-e','CONNECT_NOTIFICATIONS_ENABLED=false',
      image,'start','--main-service',`/payload/${variant}.eszip`,'--main-entrypoint','file:///app/supabase/functions/push-notifications/index.ts','--port','9000']);
    const config=JSON.parse(docker(['inspect',name]))[0];
    assert.equal(config.HostConfig.NetworkMode,'none');
    const probe=(method)=>docker(['exec',name,'bash','-c',
      `exec 3<>/dev/tcp/127.0.0.1/9000\nprintf '${method} / HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\nContent-Type: application/json\r\nContent-Length: 2\r\n\r\n{}' >&3\ncat <&3`]);
    await check(`${variant} restored bundle starts and enforces HMAC in Edge runtime`,async()=>{
      let response;
      for(let i=0;i<40;i++){
        try {response=probe('POST');break;}catch{/* startup */}
        if(i===39)throw Error(docker(['logs',name]).slice(-1600));
        await new Promise(resolve=>setTimeout(resolve,100));
      }
      assert.match(response,/HTTP\/1\.1 401/);assert.match(response,/Unauthorized/);
      assert.match(probe('GET'),/HTTP\/1\.1 405/);
    });
    fs.writeFileSync(path.join(dir,`${variant}-edge-runtime.log`),docker(['logs',name]));
    docker(['rm','-f',name]);owned.splice(owned.indexOf(name),1);
  }
  receipt.status='PASS';receipt.passed=receipt.checks.length;
})().catch(e=>{receipt.status='FAIL';receipt.failure=String(e.stderr??e.message).slice(0,2000);console.error(receipt.failure);process.exitCode=1;})
  .finally(()=>{
    for(const name of owned){fs.writeFileSync(path.join(dir,`${name}-failure.log`),docker(['logs',name]));docker(['rm','-f',name]);}
    receipt.removed=true;
    receipt.bundles=['forward','v26'].filter(v=>fs.existsSync(path.join(dir,`bundles/${v}.eszip`))).map(v=>({variant:v,sha256:sha(fs.readFileSync(path.join(dir,`bundles/${v}.eszip`)))}));
    saveJson(path.join(dir,'edge-artifact-results.json'),receipt);
  });
