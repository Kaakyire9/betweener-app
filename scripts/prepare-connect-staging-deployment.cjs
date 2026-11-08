/* global __dirname */
// Offline preparation only: hashes files and writes a proposal, never executes deploy arguments.
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const hash = p => createHash('sha256').update(fs.readFileSync(path.join(root, p))).digest('hex');
const describe = p => ({ path: p, sha256: hash(p) });
const projectRef = 'xsgzxadwuxuziubglvps';
const migrations = [
  '20261028064220_relationship_acceptance_authority.sql', '20261028074908_connect_v1_foundation.sql',
  '20261028143424_connect_m2a_revocation_cleanup.sql', '20261029081013_connect_forensic_repair_1.sql',
  '20261031035826_connect_end_block_local_foundation.sql', '20261031191352_connect_m3_1_intent_and_notifications.sql',
].map(n => ({ ...describe(`supabase/migrations/${n}`),
  historyRegistrationArguments: ['migration', 'repair', n.split('_')[0], '--project-ref', projectRef, '--status', 'applied'] }));
const inspected = JSON.parse(read('tmp/connect-m3-2-inspection-45/migration-comparison.json'));
for (const m of migrations) {
  const old = inspected.expected.find(e => e.path === m.path);
  assert.ok(old && !old.applied && old.localSha256 === m.sha256, `Migration differs from Report 45: ${m.path}`);
}
function closure(entrypoint, config) {
  const seen = new Set(), remote = new Set();
  function visit(p) {
    if (seen.has(p)) return;
    seen.add(p);
    for (const match of read(p).matchAll(/(?:\bfrom\s*|\bimport\s*\(\s*)['"]([^'"]+)['"]/g)) {
      const specifier = match[1];
      if (specifier.startsWith('.')) {
        const dependency = path.posix.normalize(path.posix.join(path.posix.dirname(p), specifier));
        assert.ok(dependency.startsWith('supabase/functions/'), 'Unexpected Edge source dependency');
        visit(dependency);
      } else remote.add(specifier);
    }
  }
  visit(entrypoint);
  if (fs.existsSync(path.join(root, config))) seen.add(config);
  return { localSources: [...seen].sort().map(describe), externalSpecifiers: [...remote].sort() };
}
const names = ['connect-credentials', 'connect-provider-worker', 'connect-webhook', 'connect-revoke-consent', 'push-notifications'];
const edge = names.map(name => {
  const verifyJwt = !['connect-provider-worker', 'connect-webhook', 'push-notifications'].includes(name);
  const entrypoint = `supabase/functions/${name}/index.ts`;
  return { name, entrypoint, verifyJwt, ...closure(entrypoint, `supabase/functions/${name}/deno.json`),
    requiredForInitialMatchedPilot: ['connect-credentials', 'connect-provider-worker', 'push-notifications'].includes(name),
    authentication: name === 'connect-provider-worker' ? 'dedicated x-connect-worker-secret' : name === 'connect-webhook' ? 'raw-body Stream HMAC' : name === 'push-notifications' ? 'existing event-id HMAC/replay/provenance' : 'gateway JWT plus auth.getUser and authoritative RPC fences',
    // Data for a later reviewed invocation; this script never spawns a CLI process.
    deploymentArguments: ['functions', 'deploy', name, '--project-ref', projectRef, '--use-api', ...(!verifyJwt ? ['--no-verify-jwt'] : [])],
  };
});
const output = {
  schemaVersion: 1, scope: 'M3_3_OFFLINE_STAGING_DEPLOYMENT_PROPOSAL', preparedAt: new Date().toISOString(), executionAuthorized: false,
  target: { name: 'betweener-staging', projectRef, region: 'eu-north-1', streamAppId: 1731011, callType: 'betweener_connect', productionRefDenied: 'jbyblhithbqwojhwlenv' },
  startingEvidence: describe('tmp/connect-m3-2-inspection-45/final-verification.json'),
  migrationPolicy: { exactlySixFiles: true, applyOnlyAfterFreshParity: true, broadPush: false, replayAppliedPushPrerequisites: false, repairUnrelatedHistory: false,
    method: 'Exact SQL files individually in approved staging SQL editor, then explicit history registration of only each successfully verified new version using the repository staging wrapper',
    historyRegistrationIsAWriteRequiringApproval: true, neverMarkAnUnappliedMigration: true,
    transactionPerFile: true, relationshipMigrationHasSharedStagingImpact: true },
  migrations, edge,
  rehearsal: fs.existsSync(path.join(root, 'tmp/connect-staging-preparation-46/migration-rehearsal.json'))
    ? describe('tmp/connect-staging-preparation-46/migration-rehearsal.json') : null,
  configuration: describe('supabase/config.toml'),
  activation: { accountBindingAuthorized: false, allowedAuthUsers: [], callingEnabled: false, videoEnabled: false,
    sourceSwitchesRemainOff: true, databaseInitialEnvironment: 'unconfigured', databaseStageIdentityAfterSeparateApproval: 'staging',
    databaseFlagsOff: ['enabled', 'voice_enabled', 'video_enabled', 'pre_match_enabled', 'provider_ready', 'end_block_enabled', 'notifications_enabled'],
    sourceFlagsOff: ['ui', 'nativeRuntime', 'videoTransport', 'nativeSafetyOwner', 'endCallAndBlock'],
    notificationEdgeSwitch: 'CONNECT_NOTIFICATIONS_ENABLED remains absent/false', noWorkerInvocationOrScheduleActivation: true,
    postMigrationStagingEnvironmentInitialization: 'A separately approved write may set environment=staging only with every database flag false and staging_test_users empty' },
  dependencies: { connectServerSdk: '0.7.63', connectSupabaseSdk: '2.110.7', pushSupabaseImport: 'https://esm.sh/@supabase/supabase-js@2',
    pushStdImport: 'https://deno.land/std@0.168.0/http/server.ts', completeTransitiveLock: false,
    reproducibilityLimit: 'Local source hashes are exact; inherited push major-version remote alias is not a frozen deployment bundle. Do not silently change shared push dependencies.' },
  rollback: { automaticSchemaDownMigration: false, keepSecurityAndDurableCleanup: true,
    previousPushVersion: 26, previousPushBundleSha256: '28d351d383d76ab687daf56c90f2293b78db3905694bf330c92979d3d64505d9',
    previousPushEntrypointSha256: '2b21087151fe5736861a8964b615323e5ad0c2b95f90181c1178ea48bc8169f7', previousPushSourceArchiveAvailable: false,
    prerequisites: ['Archive and verify the current deployed push revision/configuration before an approved replacement', 'No rollback may erase jobs, restore weaker authority or resurrect terminal calls'] },
  unresolved: ['Complete staging data/schema equivalence beyond retained catalog evidence', 'Safe names-only Edge configuration attestation',
    'Secret-free Stream application/type/routing attestation', 'Reviewed worker schedule and webhook routing', 'Exactly two approved Auth/profile/installation bindings',
    'Installed iOS/Android runtime compatibility and later device permission', 'Remote media revocation bound', 'Verified push rollback artifact and bundle dependency resolution'],
  gates: { CONNECT_STAGING_EXECUTION: 'NOT_AUTHORISED', CONNECT_TWO_ACCOUNT_ACTIVATION: 'NOT_AUTHORISED', CONNECT_REMOTE_REVOCATION_BOUND: 'UNVERIFIED', CONNECT_M2A_SECURITY_GATE: 'BLOCKED', CONNECT_M2B_READY: 'BLOCKED' },
};
const destination = 'docs/betweener-connect/connect-v1-m3-3-staging-deployment-package.json';
fs.writeFileSync(path.join(root, destination), JSON.stringify(output, null, 2) + '\n');
console.log(JSON.stringify({ destination, sha256: hash(destination), migrations: migrations.length, edge: edge.length, executionAuthorized: false }));
