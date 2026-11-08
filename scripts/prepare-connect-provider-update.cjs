// Offline source snapshot/proposal only. No environment loading, deployment,
// activation, provider access, migration execution or approval consumption.
const fs = require('node:fs'), path = require('node:path'), { execFileSync } = require('node:child_process');
const { edgeSourceClosure, sha256, root } = require('./lib/connect-source-closure.cjs');
const proposalPath = 'docs/betweener-connect/connect-provider-update.proposal.json';
const artifactRoot = 'tmp/connect-provider-update';
const retainedCommit = '12efef7a3af11ecf12d680a34780492cf1ddefe9';
const read = file => fs.readFileSync(path.join(root, file));
const gitRead = file => execFileSync('git', ['show', `${retainedCommit}:${file}`], { cwd: root, maxBuffer: 1024 * 1024 });
const frozen = [
  ['docs/betweener-connect/connect-staging-operations-package.json', 'ce84c688bdb91f9b2d394f6d35f0669b631748db57d9b11341f3f36e7487ead7'],
  ['docs/betweener-connect/connect-v1-m3-3-staging-deployment-package.json', '4769fc763db17990a3d37018e69a4150458b0ef89e87aa5ba14fb2cd13582ed3'],
];
for (const [file, digest] of frozen) if (sha256(read(file)) !== digest) throw Error('connect_historical_package_drift');
if (fs.existsSync(path.join(root, proposalPath))) throw Error('connect_provider_proposal_already_frozen');
const config = read('supabase/config.toml').toString('utf8');
const functions = ['connect-provider-worker', 'connect-revoke-consent'].map(name => {
  const verifyJwt = name !== 'connect-provider-worker';
  const section = config.match(new RegExp(`\\[functions\\.${name}\\]\\s*verify_jwt\\s*=\\s*(true|false)`));
  if (!section || (section[1] === 'true') !== verifyJwt) throw Error('connect_gateway_source_drift');
  const entrypoint = `supabase/functions/${name}/index.ts`, configuration = `supabase/functions/${name}/deno.json`;
  const variants = {};
  for (const [variant, reader] of [['forward', read], ['rollbackCandidate', gitRead]]) {
    const closure = edgeSourceClosure(entrypoint, reader);
    closure.files.push({ path: configuration, sha256: sha256(reader(configuration)), bytes: reader(configuration) });
    for (const file of closure.files) {
      const target = path.join(root, artifactRoot, variant, file.path);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      if (fs.existsSync(target) && sha256(fs.readFileSync(target)) !== file.sha256) throw Error('connect_provider_artifact_drift');
      if (!fs.existsSync(target)) fs.writeFileSync(target, file.bytes, { flag: 'wx' });
    }
    variants[variant] = { root: `${artifactRoot}/${variant}`, files: closure.files.map(({ path: file, sha256: digest }) => ({ path: file, sha256: digest })), external: closure.external };
  }
  const allowed = ['npm:@stream-io/node-sdk@0.7.63', 'npm:@supabase/supabase-js@2.110.7'];
  if (variants.forward.external.some(name => !allowed.includes(name))) throw Error('connect_provider_dependency_changed');
  return { name, verifyJwt, authentication: verifyJwt ? 'gateway JWT + auth.getUser + authoritative RPC' : 'dedicated x-connect-worker-secret before privileged work',
    deploymentArguments: ['functions', 'deploy', name, '--project-ref', 'xsgzxadwuxuziubglvps', '--use-api', ...(!verifyJwt ? ['--no-verify-jwt'] : [])], ...variants };
});
const proposal = { schemaVersion: 1, scope: 'LOCAL_PROPOSAL_ONLY_NOT_AUTHORISED',
  target: { name: 'betweener-staging', reference: 'xsgzxadwuxuziubglvps', region: 'eu-north-1' },
  historicalPackages: frozen.map(([file, digest]) => ({ path: file, sha256: digest })), functions,
  changes: ['fresh scoped provider End readback', 'bounded sequential worker batch', 'single completion write on ambiguous database ACK'],
  migrations: [], secretChanges: [], schedulerChanges: [], providerPolicyChanges: [], callingGateChanges: [], accountChanges: [], budgetChanges: [], sharedPushChanges: [], liveChanges: [],
  preflight: ['exact staging identity and fresh deployed source/gateway readback', 'verify every snapshot hash', 'names-only configuration presence', 'preserve authenticated cleanup and pending jobs', 'verify retained rollback candidate matches actually deployed source or stop'],
  rollback: { candidateCommit: retainedCommit, hostedParity: 'NOT_READ_THIS_TURN', automatic: false,
    instructions: 'Review exact previous deployed closures before replacement. Preserve all SQL, jobs, leases and authenticated cleanup. Stop new admission separately if needed; do not delete work or imply that flags stop existing media.' },
  dependencyLimit: 'Direct SDK imports are version-pinned; full transitive hosted bundle reproducibility is not attested by local source hashes.',
  activation: { endCallAndBlock: 'SEPARATE_APPROVAL_FOR_CLIENT_AND_STAGING_DB_GATE', recovery: 'LOCAL_DEFAULT_OFF_PENDING_DEVICE_APPROVAL', nativeIncoming: 'UNMOUNTED_NATIVE_PUSH_AND_BINARY_WORK_REQUIRED', e2ee: 'UNMOUNTED_AUTHENTICATED_KEY_DISTRIBUTION_REQUIRED' },
  M2A: 'BLOCKED', M2B: 'BLOCKED', remoteRevocation: 'UNVERIFIED' };
fs.writeFileSync(path.join(root, proposalPath), JSON.stringify(proposal, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ path: proposalPath, sha256: sha256(read(proposalPath)), functions: functions.map(f => f.name), hostedWrites: false }));
