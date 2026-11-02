/* global __dirname */
// Offline replay only. Deployment verification must still compare the live source.
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const root = path.resolve(__dirname, '../../..');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const operationsPath = 'docs/betweener-connect/connect-staging-operations-package.json';
const operationsHash = 'ce84c688bdb91f9b2d394f6d35f0669b631748db57d9b11341f3f36e7487ead7';

function historicalWebhookSource(file, expected, current) {
  if (file === '__tests__/connect-staging-preparation.regression.test.cjs'
    && expected === 'c8f288ba06deb8ac120362726f6383d08975d5dc63cca8c494901539d0d035d8') {
    // The test now understands the later reviewed webhook revision. Preserve what ran in Report 46.
    const original = 'docs/betweener-connect/archive/retired-code/connect-staging-preparation.regression.test.cjs.txt';
    if (hash(fs.readFileSync(path.join(root, original))) !== expected) throw Error('historical_test_source_drift');
    return original;
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
