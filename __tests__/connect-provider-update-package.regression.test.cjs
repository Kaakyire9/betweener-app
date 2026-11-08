const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { execFileSync } = require('node:child_process');
const { Buffer } = require('node:buffer');
const { edgeSourceClosure, sha256, root } = require('../scripts/lib/connect-source-closure.cjs');
const location = 'docs/betweener-connect/connect-provider-update.proposal.json';
test('provider proposal pins only the two intended staging functions with their existing authentication', () => {
  const proposal = JSON.parse(fs.readFileSync(location));
  const next = JSON.parse(fs.readFileSync('docs/betweener-connect/connect-secure-calling.proposal.json'));
  assert.equal(proposal.scope, 'LOCAL_PROPOSAL_ONLY_NOT_AUTHORISED'); assert.equal(proposal.target.reference, 'xsgzxadwuxuziubglvps');
  assert.deepEqual(proposal.functions.map(f => [f.name, f.verifyJwt]), [['connect-provider-worker', false], ['connect-revoke-consent', true]]);
  for (const field of ['migrations', 'secretChanges', 'schedulerChanges', 'providerPolicyChanges', 'callingGateChanges', 'accountChanges', 'budgetChanges', 'sharedPushChanges', 'liveChanges']) assert.deepEqual(proposal[field], []);
  for (const row of proposal.historicalPackages) assert.equal(sha256(fs.readFileSync(row.path)), row.sha256);
  for (const fn of proposal.functions) for (const variant of ['forward', 'rollbackCandidate']) for (const row of fn[variant].files) {
    assert.equal(sha256(fs.readFileSync(path.join(fn[variant].root, row.path))), row.sha256);
    if (variant === 'forward') {
      const current=sha256(fs.readFileSync(row.path));
      if(current!==row.sha256) assert.ok(next.sourceDeltas.some(delta=>delta.path===row.path&&delta.previousSha256===row.sha256&&delta.sha256===current),'current source delta must be pinned in the explicit secure-calling proposal');
    }
  }
});
test('source closure follows re-exports and literal imports and denies path escape and computed imports', () => {
  const files = { 'supabase/functions/test/index.ts': 'export * from "../_shared/helper.ts"; import("../_shared/helper.ts");', 'supabase/functions/_shared/helper.ts': 'import "npm:unused";' };
  assert.equal(edgeSourceClosure('supabase/functions/test/index.ts', file => Buffer.from(files[file])).files.length, 2);
  assert.throws(() => edgeSourceClosure('supabase/functions/test/index.ts', () => Buffer.from('import("../../../../outside.ts");')), /path_invalid/);
  assert.throws(() => edgeSourceClosure('supabase/functions/test/index.ts', () => Buffer.from('import(variable);')), /unpinned/);
});
test('a frozen proposal cannot be silently regenerated', () => {
  const before = sha256(fs.readFileSync(location));
  assert.throws(() => execFileSync(process.execPath, ['scripts/prepare-connect-provider-update.cjs'], { cwd: root, stdio: 'pipe' }), error => /already_frozen/.test(String(error.stderr)));
  assert.equal(sha256(fs.readFileSync(location)), before);
});
