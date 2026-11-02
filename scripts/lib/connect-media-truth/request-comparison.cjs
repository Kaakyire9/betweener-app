const fs = require('node:fs'); const vm = require('node:vm'); const ts = require('typescript');
const { B2, B3 } = require('./profiles.cjs');
const { readManifest } = require('./approval.cjs');
const { syntheticB2Ledger, syntheticB3Ledger, buildCreateRequest } = require('./request.cjs');
function sourceRequest(file, context) {
  const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true); const calls = [];
  const visit = (node) => {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === 'getOrCreate') calls.push(node);
    ts.forEachChild(node, visit);
  };
  visit(source); if (calls.length !== 1) throw new Error('request_source_expression_ambiguous');
  const compiled = ts.transpileModule(`(${calls[0].arguments[0].getText(source)})`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } });
  return JSON.parse(JSON.stringify(vm.runInNewContext(compiled.outputText, context, { timeout: 1000 })));
}
function differences(before, after, prefix = '') {
  if (JSON.stringify(before) === JSON.stringify(after)) return [];
  if (before && after && typeof before === 'object' && typeof after === 'object' && !Array.isArray(before) && !Array.isArray(after)) {
    return [...new Set([...Object.keys(before), ...Object.keys(after)])].flatMap((name) => {
      const path = prefix ? `${prefix}.${name}` : name;
      if (!Object.hasOwn(before, name)) return [{ operation: 'add', path, after: after[name] }];
      if (!Object.hasOwn(after, name)) return [{ operation: 'remove', path, before: before[name] }];
      return differences(before[name], after[name], path);
    });
  }
  return [{ operation: 'replace', path: prefix, before, after }];
}
function compareRequests() {
  const b2 = readManifest(B2.manifestPath); const b3 = readManifest(B3.manifestPath);
  const ledger = syntheticB3Ledger(); const request = buildCreateRequest(b3.manifest, ledger);
  const rejected = buildCreateRequest(b2.manifest, syntheticB2Ledger());
  const snapshot = { id: ledger.callId, caller_user_id: ledger.users[0], recipient_user_id: ledger.users[1], media: 'voice' };
  const production = sourceRequest('supabase/functions/_shared/connect-stream-adapter.ts', { s: snapshot });
  const fixture = sourceRequest('scripts/lib/connect-stream-closure-worker.ts', { args: production, approvedTimer: true,
    fixtures: { boundary: true, videoOnly: false, users: [...ledger.users, 'offline_reference_creator'] } });
  return { mode: 'OFFLINE_REQUEST_COMPARISON_NO_HISTORICAL_WIRE_BODY',
    b2ManifestSha256: b2.hash, b3ManifestSha256: b3.hash,
    requests: { b3: request, rejectedB2: rejected, productionIntended: production, earlierFixtureSourceReconstruction: fixture },
    settingsDifferenceFromB2: differences(rejected.data.settings_override, request.data.settings_override),
    fullRequestDifferenceFromB2: differences(rejected, request),
    differenceFromProduction: differences(production, request), differenceFromEarlierFixture: differences(fixture, request),
    limits: ['Synthetic placeholder IDs only; no resources reserved', 'Earlier successful fixture has no immutable run-start source or historical HTTP-body capture'] };
}
module.exports = { sourceRequest, differences, compareRequests };
