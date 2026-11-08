const fs = require('node:fs');
const path = require('node:path');
const { dir, sha, saveJson, prepare } = require('./prepare.cjs');
async function artifacts() {
  const deps = await prepare();
  const result=[];
  for(const variant of ['forward','v26']) {
    const target=path.join(dir,variant);
    fs.cpSync(path.join(dir,'vendor'),path.join(target,'vendor'),{recursive:true});
    fs.copyFileSync(path.join(process.env.LOCALAPPDATA,'deno/npm/registry.npmjs.org/@supabase/supabase-js/2.110.7/LICENSE'),path.join(target,'vendor/SUPABASE-LICENSE'));
    fs.mkdirSync(path.join(target,'supabase'),{recursive:true});
    fs.writeFileSync(path.join(target,'supabase/config.toml'),'project_id = "connect-push-recovery-48"\n\n[functions.push-notifications]\nverify_jwt = false\nentrypoint = "./functions/push-notifications/index.ts"\n');
    const imports={
      'https://esm.sh/@supabase/supabase-js@2':'./vendor/supabase-2.110.7.mjs',
      'https://deno.land/std@0.168.0/http/server.ts':'./vendor/std-0.168.0/http/server.ts',
    };
    saveJson(path.join(target,'import_map.json'),{imports});
    saveJson(path.join(target,'supabase/functions/push-notifications/deno.json'),{
      imports:Object.fromEntries(Object.entries(imports).map(([k,v])=>[k,'../../../'+v.slice(2)])),
    });
    const files=[];
    const walk=p=>{for(const entry of fs.readdirSync(p,{withFileTypes:true})){
      const name=path.join(p,entry.name);if(entry.isDirectory())walk(name);else files.push({path:path.relative(target,name).replaceAll('\\','/'),sha256:sha(fs.readFileSync(name))});
    }};walk(target);
    const manifest={schemaVersion:1,variant,source:'hash-verified frozen candidate or retained v26; originals unchanged',
      dependencies:deps.resolution,supabaseJs:deps.supabaseJs,std:deps.std,
      verifyJwt:false,mandatoryConnectState:'all database gates false and allowlist empty before restore; no provider jobs/in-flight Connect sends',
      originalHostedBundleReproduction:false,files};
    saveJson(path.join(dir,`${variant}-artifact.json`),manifest);result.push({variant,files:files.length,manifestSha256:sha(JSON.stringify(manifest,null,2)+'\n')});
  }
  saveJson(path.join(dir,'artifact-index.json'),result);console.log(JSON.stringify(result));
}
module.exports={artifacts};
if(require.main===module)artifacts().catch(e=>{console.error(e.message);process.exitCode=1;});
