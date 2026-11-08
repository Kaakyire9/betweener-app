// Offline proposal only. Reads source and retained read-only deployment receipts;
// never loads credentials, contacts a service or consumes an approval.
const fs=require('node:fs'),path=require('node:path');
const {Buffer}=require('node:buffer');
const {edgeSourceClosure,sha256,root}=require('./lib/connect-source-closure.cjs');
const location='docs/betweener-connect/connect-secure-calling.proposal.json';
const artifactRoot='tmp/connect-secure-calling/package';
const read=file=>fs.readFileSync(path.join(root,file));
const draftDigests=['1fec4d288e806a0772a4a6a8ad9529e366fefd88688dbe33caad84f35906a888','cd0fff61f5a2c760a6396f668fb79e93129e8d7dad7e9db01951cc85dd1adfd7','20b341864dec96348dee68ba7cb577c1fa333bd7cde30966a300de2d7fcbd525'];
const initialDigest=fs.existsSync(path.join(root,location))?sha256(read(location)):draftDigests[0];
const revision=draftDigests.indexOf(initialDigest)+2;
const previousDraft='tmp/connect-secure-calling/proposal-draft-'+initialDigest+'.json';
const amendment=process.argv.includes('--amend-local-draft');
if(fs.existsSync(path.join(root,location))){
  if(!amendment||!draftDigests.includes(initialDigest))throw Error('connect_secure_proposal_already_frozen');
  if(fs.existsSync(path.join(root,previousDraft))){if(sha256(read(previousDraft))!==initialDigest)throw Error('connect_draft_receipt_drift');}
  else fs.writeFileSync(path.join(root,previousDraft),read(location),{flag:'wx'});
}else if(amendment)throw Error('connect_initial_draft_missing');
const historical=[
  ['docs/betweener-connect/connect-provider-update.proposal.json','4a2fb86d7c477cb78cb29326be0073f32ada6a63e8899dcec07db8e9cdd015e3'],
  ['docs/betweener-connect/connect-provider-update.recovery-addendum.json','a068158cdf76c0d8864e420bec90dc13423bf61928cbfee6a43e604e867cdbbc'],
  ['docs/betweener-connect/connect-staging-operations-package.json','ce84c688bdb91f9b2d394f6d35f0669b631748db57d9b11341f3f36e7487ead7'],
  ['docs/betweener-connect/connect-v1-m3-3-staging-deployment-package.json','4769fc763db17990a3d37018e69a4150458b0ef89e87aa5ba14fb2cd13582ed3'],
];
for(const [file,hash]of historical)if(sha256(read(file))!==hash)throw Error('connect_historical_package_drift');
function snapshot(name,variant,rows){
  const prefix=`${artifactRoot}/${name}/${variant}`;
  for(const row of rows){
    const target=path.join(root,prefix,row.path);fs.mkdirSync(path.dirname(target),{recursive:true});
    if(fs.existsSync(target)&&sha256(fs.readFileSync(target))!==row.sha256)throw Error('connect_secure_artifact_drift');
    if(!fs.existsSync(target))fs.writeFileSync(target,row.bytes,{flag:'wx'});
  }
  return {root:prefix,files:rows.map(row=>({path:row.path,sha256:row.sha256}))};
}
const functions=['connect-provider-worker','connect-credentials','connect-native-device'].map(name=>{
  const verifyJwt=name!=='connect-provider-worker',entrypoint=`supabase/functions/${name}/index.ts`,configuration=`supabase/functions/${name}/deno.json`;
  const gateway=read('supabase/config.toml').toString().match(new RegExp(`\\[functions\\.${name}\\]\\s*verify_jwt\\s*=\\s*(true|false)`));
  if(!gateway||(gateway[1]==='true')!==verifyJwt)throw Error('connect_gateway_drift');
  const closure=edgeSourceClosure(entrypoint);
  if(closure.external.some(name=>!['npm:@stream-io/node-sdk@0.7.63','npm:@supabase/supabase-js@2.110.7'].includes(name)))throw Error('connect_dependency_drift');
  closure.files.push({path:configuration,sha256:sha256(read(configuration)),bytes:read(configuration)});
  const forward={...snapshot(name,'forward',closure.files),external:closure.external};
  let rollback=null;
  if(name!=='connect-native-device'){
    const receipt=JSON.parse(read(`tmp/connect-secure-calling/deployed/${name}.json`));
    const expected=name==='connect-provider-worker'?'3e6accbf65f8ecc10034d54a743c3681b667640665fb4cb0a0c8c263a1b997cd':'5d3876633a52d81603676af8e17aab5a2896c960d7b4a2037040511b5529630f';
    if(receipt.slug!==name||receipt.version!==2||receipt.verify_jwt!==verifyJwt||receipt.ezbr_sha256!==expected
      ||!receipt.entrypoint_path.includes('xsgzxadwuxuziubglvps'))throw Error('connect_deployed_revision_drift');
    const rows=receipt.files.map(row=>{
      const file='supabase/'+row.name;
      if(!/^supabase\/functions\/[a-zA-Z0-9_./-]+$/.test(file)||file.includes('..')||typeof row.content!=='string')throw Error('connect_deployed_path_invalid');
      const bytes=Buffer.from(row.content);return {path:file,bytes,sha256:sha256(bytes)};
    });
    const byPath=new Map(rows.map(row=>[row.path,row.bytes]));if(byPath.size!==rows.length)throw Error('connect_duplicate_artifact');
    edgeSourceClosure(entrypoint,file=>{const bytes=byPath.get(file);if(!bytes)throw Error('connect_rollback_dependency_missing');return bytes;});
    if(!byPath.has(configuration))throw Error('connect_rollback_configuration_missing');
    rollback={...snapshot(name,'rollback',rows),revision:2,bundleSha256:expected,source:'READ_ONLY_STAGING_SOURCE_RECEIPT_2026_11_03'};
  }
  return {name,verifyJwt,authentication:verifyJwt?'gateway JWT + auth.getUser + actor-bound RPC':'dedicated worker HMAC before privileged processing',
    deploymentArguments:['functions','deploy',name,'--project-ref','xsgzxadwuxuziubglvps','--use-api',...(!verifyJwt?['--no-verify-jwt']:[])],forward,rollback};
});
const migration='supabase/migrations/20261103150558_connect_secure_calling.sql';
snapshot('database','forward',[{path:migration,bytes:read(migration),sha256:sha256(read(migration))}]);
const mobilePaths=fs.readdirSync(path.join(root,'features/connect'),{recursive:true}).filter(name=>/\.tsx?$/.test(name))
  .map(name=>'features/connect/'+name.replaceAll('\\','/'));
mobilePaths.push('index.js','app.config.js','lib/auth-context.tsx','lib/auth/application-native-owner.ts','patches/@stream-io+video-react-native-sdk+1.46.3.patch');
const mobileFiles=mobilePaths.sort().map(file=>({path:file,sha256:sha256(read(file))}));
snapshot(amendment?`mobile-revision-${revision}`:'mobile','forward',mobileFiles.map(row=>({...row,bytes:read(row.path)})));
const previous=JSON.parse(read(historical[0][0]));
const before=new Map(previous.functions.flatMap(fn=>fn.forward.files).map(row=>[row.path,row.sha256]));
const sourceDeltas=[...before].filter(([file,hash])=>sha256(read(file))!==hash).map(([file,hash])=>({path:file,previousSha256:hash,sha256:sha256(read(file))}));
for(const delta of sourceDeltas)if(!functions.some(fn=>fn.forward.files.some(row=>row.path===delta.path&&row.sha256===delta.sha256)))throw Error('connect_unreviewed_source_delta');
const earlierDrafts=amendment?JSON.parse(read(location)).historicalPackages.filter(row=>row.path.startsWith('tmp/connect-secure-calling/proposal-draft-')):[];
const proposal={schemaVersion:1,revision:amendment?revision:1,scope:'LOCAL_PROPOSAL_ONLY_NOT_AUTHORISED',target:{name:'betweener-staging',reference:'xsgzxadwuxuziubglvps',region:'eu-north-1',streamApplication:1731011,callType:'betweener_connect'},
  ...(amendment?{sourceAmendment:{previousDraft,sha256:initialDigest,reason:revision===2?'SDK automatic push-device enrollment must not bypass the authenticated journal or log tokens; use the native Android handler rather than a deprecated no-op shim.':revision===3?'Strengthen call-generation validation at the SDK key-lease boundary and correct mounted-lifecycle documentation.':'Do not retire a foreground-answered call on delayed OS events; route outgoing system End through the existing hangup/cancel authority. No server, provider or gate changes.'}}:{}),
  historicalPackages:[...historical.map(([file,hash])=>({path:file,sha256:hash})),...earlierDrafts,...(amendment?[{path:previousDraft,sha256:initialDigest}]:[])],sourceDeltas,
  migrations:[{path:migration,sha256:sha256(read(migration)),after:['20261101060133_connect_staging_tester_scope','20261102165936_connect_staging_video_testing'],defaultOff:['native_incoming_enabled','e2ee_enabled']}],
  functions,mobileFiles,
  serverConfigurationNames:['CONNECT_NATIVE_APNS_PROVIDER','CONNECT_NATIVE_FCM_PROVIDER'],
  publicClientConfigurationNames:['EXPO_PUBLIC_CONNECT_NATIVE_INCOMING','EXPO_PUBLIC_CONNECT_APNS_PROVIDER','EXPO_PUBLIC_CONNECT_FCM_PROVIDER'],
  providerPrerequisites:['Approved staging APNS VoIP and FCM provider aliases bound to the correct native app and Firebase project; preserve existing aliases/Live providers.',
    'Read-only attestation: custom betweener_connect call type supports encryption available/auto-on. If absent, separately approve only this encryption setting; no role/global/Live changes.',
    'Provider payload template must contain only generic caller display and exact Connect CID; no secrets or unnecessary private content.'],
  nativePrerequisites:['Check actual iPhone entitlements/VoIP background mode, PushKit/CallKit and APS environment.',
    'Check actual Android Firebase messaging, Telecom/Callingx, foreground service and notification/full-screen intent declarations and OS permissions.',
    'EncryptionManager.isSupported and secure keychain access after first unlock on both installed clients.',
    'Use current root Metro; build/sign/install only if an actual native/entitlement incompatibility is confirmed and separately approved.'],
  preflight:['Fresh exact staging identity, migration history and both deployed revision-2 source closures; stop on drift.',
    'Verify every frozen artifact; no broad migration push.',
    'Pause phone calls; no active Connect setup or unresolved owned provider work at installation.',
    'Names-only configuration checks; never retrieve secret-bearing responses.',
    'Confirm JWT/custom authentication, private table ACL/RLS and exact RPC signatures after installation.',
    'Verify new gates remain false, existing approved settings unchanged, worker scheduler/webhook2/shared-push28 and Live unchanged.'],
  activation:{authorised:false,installationOnly:{native_incoming_enabled:false,e2ee_enabled:false},
    later:'Separate approval for the two new staging gates, public native incoming opt-in and matching provider aliases. Both existing owner accounts must reopen the app and register device public keys/destinations before an encrypted invitation. Existing match, consent, block, admission, account scope and budget remain authoritative.',
    createsDuringThisPreparation:{users:0,calls:0,participantTokens:0,pushes:0},accountChanges:[],budgetChanges:[],existingSecretChanges:[],schedulerChanges:[],sharedPushChanges:[],liveChanges:[]},
  securityLimits:['Encrypted transport is not an audited Signal-style ratchet or post-compromise forward-secrecy claim. Compare safety codes out of band; first use is unverified.',
    'Manual SDK device registration disables automatic token logging and client-side provider registration. All Connect device enrollment uses the authenticated native-device endpoint and durable worker.',
    'SDK encryption state is not encrypted-media device proof. No plaintext fallback is permitted for a required-encryption call.',
    'Provider device writes are not remotely atomic with SQL. Recheck lease/session/gates before registering; retain private possible-owner tombstones and reconcile transferred/removed tokens every five minutes. An audited retention/purge process is separate; do not discard unresolved removal work.',
    'OS force-stop, first boot before unlock and platform push delivery limits still apply. Incoming push never grants admission.',
    'JWT expiry and local watchdogs do not prove remote media cutoff.'],
  rollback:{automatic:false,sql:'Forward-only: retain new SQL, terminal truth, leases, envelopes and removal tombstones. No database downgrade.',
    steps:['Disable only the new admission/encryption/native incoming features with separately reviewed authority; flags alone do not stop existing media.',
      'End owned active calls through existing call-bound authority and retain termination processing.',
      'Keep the new authenticated worker while native registration/removal work or private tombstones exist. Older worker2 cannot process that journal.',
      'Restore credential2 only after every required-encryption call is terminal; restoring it earlier would bypass the new key-envelope admission fence.',
      'Restore worker2 only after independently verified device removals, no in-flight destination writes and an approved tombstone handoff. Otherwise retain the new cleanup-capable worker.',
      'The new JWT-protected native-device endpoint may remain deployed with its gate false. Restore mobile root configuration and pinned SDK patch only after call owners release.',
      'Preserve existing 5-second scheduler, webhook2, push28, prior approvals and consumed ledgers.'],
    stop:['ambiguous write: read back effects, do not retry blindly','source/revision/auth drift','missing native/provider prerequisites','unknown provider removal outcome','unverified cleanup/recovery path']},
  M2A:'BLOCKED',M2B:'BLOCKED',remoteRevocation:'UNVERIFIED',deviceValidation:'NOT_RUN'};
fs.writeFileSync(path.join(root,location),JSON.stringify(proposal,null,2)+'\n',{flag:amendment?'w':'wx'});
console.log(JSON.stringify({path:location,sha256:sha256(read(location)),migrations:1,functions:functions.map(fn=>fn.name),rollbackFiles:functions.reduce((n,fn)=>n+(fn.rollback?.files.length||0),0),hostedWrites:false}));
