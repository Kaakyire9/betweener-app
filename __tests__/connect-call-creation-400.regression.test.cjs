const test = require('node:test'); const assert = require('node:assert/strict');
const fs = require('node:fs'); const path = require('node:path'); const vm = require('node:vm');
const { spawnSync } = require('node:child_process'); const ts = require('typescript');
const { cachedDeno } = require('../scripts/lib/connect-media-truth/provider-process.cjs');
const { buildCreateRequest } = require('../scripts/lib/connect-media-truth/request.cjs');
const artifactRoot = path.resolve('tmp/connect-media-truth-b2-preparation'); fs.mkdirSync(artifactRoot, { recursive: true });
const directory = fs.mkdtempSync(path.join(artifactRoot, 'historical-contract-'));
const manifest = JSON.parse(fs.readFileSync('docs/betweener-connect/stream-staging-connect-media-truth-proposal.json'));
const source = ts.createSourceFile('provider.mts', fs.readFileSync('scripts/lib/connect-media-truth/provider.mts', 'utf8'), ts.ScriptTarget.Latest, true);
const calls = [];
function visit(node) {
  if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === 'getOrCreate') calls.push(node);
  ts.forEachChild(node, visit);
}
visit(source); assert.equal(calls.length, 1);
const expression = calls[0].arguments[0].getText(source);
const compiled = ts.transpileModule(`(${expression})`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } });
const request = JSON.parse(JSON.stringify(vm.runInNewContext(compiled.outputText, {
  manifest, buildCreateRequest, ledger: { users: ['fixture_member_a', 'fixture_member_b'], marker: 'synthetic_fixture_marker' },
}, { timeout: 1000 })));
fs.writeFileSync(path.join(directory, 'reconstructed-request.json'), JSON.stringify(request, null, 2) + '\n');

test('the actual provider call expression reconstructs the exact approved public request shape', () => {
  assert.deepEqual(request, { ring: false, notify: false, data: {
    created_by_id: 'fixture_member_a', members: [{ user_id: 'fixture_member_a', role: 'connect_voice' }, { user_id: 'fixture_member_b', role: 'connect_voice' }],
    custom: { connect_media_truth_21: 'synthetic_fixture_marker', media: 'voice' }, settings_override: manifest.perCall.settings_override,
  } });
  assert.deepEqual(request.data.settings_override.frame_recording, { mode: 'disabled' });
});

function checkTypes(value, name) {
  const cache = process.env.DENO_DIR ?? path.join(process.env.LOCALAPPDATA ?? path.join(require('node:os').homedir(), 'AppData/Local'), 'deno');
  const sdk = path.join(cache, 'npm/registry.npmjs.org/@stream-io/node-sdk/0.7.63');
  assert.equal(JSON.parse(fs.readFileSync(path.join(sdk, 'package.json'))).version, '0.7.63');
  const input = path.join(directory, `${name}.ts`);
  fs.writeFileSync(input, `import type { GetOrCreateCallRequest } from '${path.join(sdk, 'dist/index.d.ts').replaceAll('\\', '/')}';\nconst request: GetOrCreateCallRequest = ${JSON.stringify(value)};\nvoid request;\n`);
  const program = ts.createProgram([input], { noEmit: true, strict: true, skipLibCheck: true, types: [], target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext, allowImportingTsExtensions: true });
  const errors = ts.getPreEmitDiagnostics(program).filter((d) => d.category === ts.DiagnosticCategory.Error)
    .map((d) => ({ code: d.code, message: ts.flattenDiagnosticMessageText(d.messageText, '\n') }));
  fs.writeFileSync(path.join(directory, `${name}-diagnostics.json`), JSON.stringify(errors, null, 2) + '\n');
  return errors;
}

test('the exact reconstructed request fails the pinned SDK type contract only on the missing frame interval', () => {
  const errors = checkTypes(request, 'actual-request');
  assert.equal(errors.length, 1, JSON.stringify(errors));
  assert.equal(errors[0].code, 2741); assert.match(errors[0].message, /capture_interval_in_seconds.*missing/);
});

test('adding the single required field satisfies types without changing the disabled mode or manifest', () => {
  const hypothetical = structuredClone(request);
  hypothetical.data.settings_override.frame_recording.capture_interval_in_seconds = 2;
  assert.deepEqual(checkTypes(hypothetical, 'hypothetical-one-field'), []);
  assert.deepEqual(manifest.perCall.settings_override.frame_recording, { mode: 'disabled' });
});

test('earlier timer fixture reconstruction omits frame_recording and satisfies the same pinned types', () => {
  const reconstruct = (file, context) => {
    const ast = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true); const found = [];
    const search = (n) => { if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) && n.expression.name.text === 'getOrCreate') found.push(n); ts.forEachChild(n, search); };
    search(ast); assert.equal(found.length, 1);
    const js = ts.transpileModule(`(${found[0].arguments[0].getText(ast)})`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
    return JSON.parse(JSON.stringify(vm.runInNewContext(js, context, { timeout: 1000 })));
  };
  const base = reconstruct('supabase/functions/_shared/connect-stream-adapter.ts', { s: {
    id: '00000000-0000-4000-8000-000000000001', caller_user_id: 'fixture_member_a', recipient_user_id: 'fixture_member_b', media: 'voice',
  } });
  const previous = reconstruct('scripts/lib/connect-stream-closure-worker.ts', { args: base, approvedTimer: true,
    fixtures: { boundary: true, videoOnly: false, users: ['fixture_member_a', 'fixture_member_b', 'fixture_creator_c'] } });
  fs.writeFileSync(path.join(directory, 'earlier-timer-request-reconstructed.json'), JSON.stringify(previous, null, 2) + '\n');
  assert.deepEqual(previous.data.settings_override, { limits: { max_participants: 2, max_duration_seconds: 60 },
    video: { enabled: false, camera_default_on: false, target_resolution: { width: 640, height: 480, bitrate: 600000 } } });
  assert.deepEqual(checkTypes(previous, 'earlier-timer-request'), []);
});

test('real pinned SDK passes the omitted required field through fake fetch and drops structured exception_fields', () => {
  const input = path.join(directory, 'reconstructed-request.json');
  const result = spawnSync(cachedDeno(), ['run', '--no-prompt', '--cached-only', '--no-lock', '--config', 'scripts/lib/connect-media-truth/deno.json',
    '--deny-net', `--allow-read=${input}`, '--allow-env=PKG_VERSION', '__tests__/fixtures/connect-call-creation-sdk-offline.mts', input],
  { encoding: 'utf8', timeout: 30000, windowsHide: true });
  fs.writeFileSync(path.join(directory, 'sdk-offline-stderr.log'), result.stderr ?? '');
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout.trim());
  fs.writeFileSync(path.join(directory, 'sdk-offline-result.json'), JSON.stringify(output, null, 2) + '\n');
  assert.equal(output.actualNetworkCalls, 0); assert.equal(output.transportCalls, 1);
  assert.equal(output.captured.method, 'POST'); assert.equal(output.captured.path, '/api/v2/video/call/betweener_connect/00000000-0000-4000-8000-000000000001');
  assert.deepEqual(output.captured.body, request);
  assert.equal(output.sdkError.descriptiveMessagePreserved, true); assert.equal(output.sdkError.exceptionFieldsPreserved, false);
  assert.deepEqual(output.beforeSdk.fields, ['data.settings_override.frame_recording.capture_interval_in_seconds']);
  assert.equal(JSON.stringify(output).includes('PRIVATE_SYNTHETIC_SENTINEL'), false);
});
