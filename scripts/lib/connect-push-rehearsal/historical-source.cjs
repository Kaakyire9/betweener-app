/* global __dirname */
// Offline replay only. Deployment verification must still compare the live source.
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '../../..');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const operationsPath = 'docs/betweener-connect/connect-staging-operations-package.json';
const operationsHash = 'ce84c688bdb91f9b2d394f6d35f0669b631748db57d9b11341f3f36e7487ead7';

function historicalWebhookSource(file, expected, current) {
  // These retained Report 46 sources are now superseded by local provider fixes.
  // Historical replay reads exact committed bytes; strict current-source freeze
  // checks still reject every delta. This never makes current code deployable.
  const retained = {
    'supabase/functions/_shared/connect-provider-end.ts': '5b7ec7409bfe12c07277b373617ea3dfcfb2cf562c092869ee3b1871e046b695',
    'supabase/functions/_shared/connect-stream-adapter.ts': '4cfc00c772d845b005ced0499897c7327a405ed67a489a120d2126f9cfc53357',
    'supabase/functions/_shared/connect-provider-worker.ts': '91c3791ff1cae470b7e9b4305ea5fce069d2fbc1161c35ca77f91df54f3d6aed',
    'supabase/functions/connect-provider-worker/index.ts': 'd9f66367c43884d4d1d3c5ef18fba8240406bf3d899ad54e4de92c75d2d61950',
  };
  if (retained[file] === expected) {
    const bytes = execFileSync('git', ['show', `12efef7a3af11ecf12d680a34780492cf1ddefe9:${file}`], { cwd: root, maxBuffer: 1024 * 1024 });
    if (hash(bytes) !== expected) throw Error('historical_provider_source_drift');
    const receipt = path.join('tmp/connect-push-rollback-48/source-history', file), absolute = path.join(root, receipt);
    if (fs.existsSync(absolute) && hash(fs.readFileSync(absolute)) !== expected) throw Error('historical_provider_receipt_drift');
    if (!fs.existsSync(absolute)) { fs.mkdirSync(path.dirname(absolute), { recursive: true }); fs.writeFileSync(absolute, bytes); }
    return receipt;
  }
  if (file === '__tests__/connect-staging-preparation.regression.test.cjs'
    && expected === 'c8f288ba06deb8ac120362726f6383d08975d5dc63cca8c494901539d0d035d8') {
    // The test now understands the later reviewed webhook revision. Preserve what ran in Report 46.
    const original = 'docs/betweener-connect/archive/retired-code/connect-staging-preparation.regression.test.cjs.txt';
    if (hash(fs.readFileSync(path.join(root, original))) !== expected) throw Error('historical_test_source_drift');
    return original;
  }
  // Later product work can supersede a Report 46 source without changing what
  // Report 46 tested. Only exact members of its immutable manifest may replay
  // from the retained commit; current-source deployment checks remain strict.
  const manifestBytes = fs.readFileSync(path.join(root,'docs/betweener-connect/connect-v1-m3-3-staging-deployment-package.json'));
  if (hash(manifestBytes) !== '4769fc763db17990a3d37018e69a4150458b0ef89e87aa5ba14fb2cd13582ed3') throw Error('historical_manifest_drift');
  const manifest = JSON.parse(manifestBytes);
  const verificationBytes = fs.readFileSync(path.join(root,'tmp/connect-staging-preparation-46/final-verification.json'));
  if (hash(verificationBytes) !== '8b66fd0abbed94d8a2048c742cb322c5dab4e0b47a0e54eed0a68685df41c766') throw Error('historical_verification_drift');
  const verification = JSON.parse(verificationBytes);
  const member = [...manifest.migrations,...manifest.edge.flatMap(e=>e.localSources),manifest.configuration,manifest.rehearsal,...verification.sourceFreeze]
    .find(row=>row?.path===file && row.sha256===expected);
  if (member) {
    const original = execFileSync('git',['show',`12efef7a3af11ecf12d680a34780492cf1ddefe9:${file}`],{cwd:root,maxBuffer:1024*1024});
    if (hash(original) === expected) {
      const receipt = path.join('tmp/connect-push-rollback-48/source-history',file), absolute = path.join(root,receipt);
      if (fs.existsSync(absolute) && hash(fs.readFileSync(absolute))!==expected) throw Error('historical_source_receipt_drift');
      if (!fs.existsSync(absolute)) { fs.mkdirSync(path.dirname(absolute),{recursive:true}); fs.writeFileSync(absolute,original); }
      return receipt;
    }
  }
  const bytes = fs.readFileSync(path.join(root, operationsPath));
  if (hash(bytes) !== operationsHash) throw Error('reviewed_operations_package_drift');
  const operations = JSON.parse(bytes);
  const delta = operations.webhook.sourceDeltas.find(row => row.path === file);
  if (!delta || delta.before !== expected || delta.after !== current) throw Error('unreviewed_historical_source_drift');
  const old = operations.webhook.sources.rollback.find(row => row.path === file);
  const next = operations.webhook.sources.forward.find(row => row.path === file);
  if (old?.sha256 !== expected || next?.sha256 !== current) throw Error('reviewed_source_binding_drift');
  for (const [variant, digest] of [['rollback', expected], ['forward', current]]) {
    const artifact = path.resolve(root, operations.webhook.roots[variant], file);
    const base = path.resolve(root, 'tmp/connect-operational-readiness', `webhook-${variant}`) + path.sep;
    if (!artifact.startsWith(base) || hash(fs.readFileSync(artifact)) !== digest) throw Error('reviewed_webhook_artifact_drift');
  }
  return path.join(operations.webhook.roots.rollback, file);
}

module.exports = { historicalWebhookSource };
