const test = require('node:test'); const assert = require('node:assert/strict');
const fs = require('node:fs'); const path = require('node:path'); const vm = require('node:vm');
const { createHash } = require('node:crypto'); const { spawnSync } = require('node:child_process');
const ts = require('typescript');
const { buildCreateRequest, parseB2Manifest } = require('../scripts/lib/connect-media-truth/request.cjs');
const { inspectSdkContract, sdkSources } = require('../scripts/lib/connect-media-truth/sdk-contract.cjs');
const { cachedDeno } = require('../scripts/lib/connect-media-truth/provider-process.cjs');
const { providerDiagnostic, projectDiagnostic } = require('../scripts/lib/connect-media-truth/provider-diagnostics.cjs');

const root = path.resolve('tmp/connect-media-truth-25a'); fs.mkdirSync(root, { recursive: true });
const directory = fs.mkdtempSync(path.join(root, 'regression-'));
const read = (file) => JSON.parse(fs.readFileSync(file));
const sha = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const manifestPath = 'docs/betweener-connect/stream-staging-connect-media-truth-b2-proposal.json';
const manifest = read(manifestPath);
const evidence = read('docs/betweener-connect/stream-staging-connect-media-truth-b2-evidence.json');
const ledger = evidence.ownershipLedger; // Historical identifiers only; never reserve or reuse resources.
const request = buildCreateRequest(manifest, ledger);
const resolution = { width: 640, height: 480, bitrate: 600000 };
const candidate = structuredClone(request); candidate.data.settings_override.video.target_resolution = resolution;
const artifacts = {};
const save = (name, value) => {
  const file = path.join(directory, name); fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
  artifacts[name] = { path: file.replaceAll('\\', '/'), sha256: sha(file) }; return file;
};
const checkTypes = (value, name) => { const result = inspectSdkContract(value); save(`${name}-contract.json`, result); return result; };

function actualCallExpression(file, context) {
  const ast = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
  const calls = [];
  const visit = (node) => {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === 'getOrCreate') calls.push(node);
    ts.forEachChild(node, visit);
  };
  visit(ast); assert.equal(calls.length, 1);
  const js = ts.transpileModule(`(${calls[0].arguments[0].getText(ast)})`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  return JSON.parse(JSON.stringify(vm.runInNewContext(js, context, { timeout: 1000 })));
}
function resolutionPaths(value, prefix = '') {
  if (!value || typeof value !== 'object') return [];
  return Object.entries(value).flatMap(([key, child]) => [
    ...(key.includes('resolution') ? [`${prefix}${key}`] : []), ...resolutionPaths(child, `${prefix}${key}.`),
  ]);
}
// Local document constraints from official TargetResolution schema, not a server emulator.
function resolutionErrors(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return ['resolution_object_missing'];
  const errors = ['width', 'height'].filter((key) => !Number.isInteger(value[key]) || value[key] < 240 || value[key] > 3840);
  // Documentation gives no bitrate minimum. Do not invent one; the candidate pins 600000.
  if (Object.hasOwn(value, 'bitrate') && (!Number.isInteger(value.bitrate) || value.bitrate > 6000000)) errors.push('bitrate');
  return errors;
}

test('B2 reconstruction uses the real provider expression, immutable manifest and retained ledger', () => {
  assert.equal(sha('docs/betweener-connect/stream-staging-connect-media-truth-b2-evidence.json'), 'ff77e3cb8c6bb741e666925405919b027fe9f99e65458a81e942b45ed941b8ab');
  assert.equal(sha(manifestPath), '96f72e25ccff1e5aa9d630ec3cf597103479aceb5ec7d4e91a7afbb30a9da0f1');
  assert.deepEqual(actualCallExpression('scripts/lib/connect-media-truth/provider.mts', { buildCreateRequest, manifest, ledger }), request);
  // B3 deliberately evolves these shared guards/diagnostics. Historical hashes stay
  // authoritative for what ran, rather than an assertion that current source never evolves.
  const evolvedForB3 = new Set(['scripts/lib/connect-media-truth/approval.cjs', 'scripts/lib/connect-media-truth/profiles.cjs',
    'scripts/lib/connect-media-truth/provenance.cjs', 'scripts/lib/connect-media-truth/provider-diagnostics.cjs',
    'scripts/lib/connect-media-truth/provider.mts', 'scripts/lib/connect-media-truth/request.cjs',
    'scripts/lib/connect-media-truth/scope.cjs', 'scripts/lib/connect-media-truth/sdk-contract.cjs', 'scripts/test-connect-media-truth.cjs']);
  const evolution = [];
  // Phase B changes current cleanup semantics and their fixtures, not the B2 request.
  // Keep the immutable execution receipt above; never refresh old preparation hashes.
  const evolvedForLocalEndBlock = new Set(['__tests__/connect-consent-revocation.regression.test.ts',
    '__tests__/connect-foundation.regression.test.ts', 'supabase/functions/_shared/connect-stream-adapter.ts',
    // Product audio regressions evolved after B2; the receipt and provider request above stay immutable.
    '__tests__/connect-voice.regression.test.ts',
    // Subsequent dependency maintenance uses the archived B2 manifest for replay.
    'package.json', 'package-lock.json', 'node_modules/playwright-core/package.json', 'node_modules/playwright/package.json']);
  const oldPackagePath = 'docs/betweener-connect/archive/retired-code/package.b2-replay.json.txt';
  assert.equal(sha(oldPackagePath), '17a8635a595d10980a00c837a2163002d69da3467c324449c9189fcdbfabe195');
  const oldPackage = read(oldPackagePath), currentPackage = read('package.json');
  // Later owner-approved dependency maintenance does not rewrite B2 evidence.
  // Keep the transport versions and Metro overrides used by the replay pinned.
  for (const [name, value] of Object.entries(oldPackage.overrides)) {
    assert.deepEqual(currentPackage.overrides[name], value, name);
  }
  for (const name of ['@stream-io/react-native-webrtc', '@stream-io/react-native-callingx', 'react-native', 'react', 'react-dom']) {
    assert.equal(currentPackage.dependencies[name], oldPackage.dependencies[name], name);
  }
  assert.equal(currentPackage.dependencies['@stream-io/video-react-native-sdk'].replace(/^[~^]/, ''),
    oldPackage.dependencies['@stream-io/video-react-native-sdk'].replace(/^[~^]/, ''));
  for (const entry of evidence.runnerEvidence.provenance.sources) {
    const current = sha(entry.path);
    if (evolvedForB3.has(entry.path) || evolvedForLocalEndBlock.has(entry.path)) evolution.push({ path: entry.path, historicalSha256: entry.sha256, currentSha256: current });
    else assert.equal(current, entry.sha256, entry.path);
  }
  save('b2-historical-versus-current-provenance.json', { sourceEvolutionIsNotHistoricalWireEvidence: true, evolution });
  save('b2-request-reconstructed.json', request);
});

test('B2 omits all resolution objects; false values survive without null or empty-object substitution', () => {
  assert.deepEqual(request.data.settings_override.video, { enabled: false, camera_default_on: false });
  assert(!Object.hasOwn(request.data.settings_override.video, 'target_resolution'));
  assert.deepEqual(resolutionPaths(request), []);
  assert.deepEqual(checkTypes(request, 'b2').errors, []);
});

test('candidate changes exactly one nested object while retaining every media, role and capacity restriction', () => {
  assert.deepEqual(candidate.data.settings_override.video, { enabled: false, camera_default_on: false, target_resolution: resolution });
  const restored = structuredClone(candidate); delete restored.data.settings_override.video.target_resolution;
  assert.deepEqual(restored, request);
  assert(candidate.data.members.every((member) => member.role === 'connect_voice'));
  assert.deepEqual(candidate.data.settings_override.limits, { max_participants: 2, max_duration_seconds: 60 });
  for (const key of ['recording', 'individual_recording', 'raw_recording', 'frame_recording', 'transcription']) assert.equal(candidate.data.settings_override[key].mode, 'disabled');
  for (const key of ['screensharing', 'broadcasting', 'ingress', 'thumbnails']) assert.equal(candidate.data.settings_override[key].enabled, false);
  assert.equal(candidate.data.settings_override.transcription.closed_caption_mode, 'disabled');
  assert.equal(candidate.data.settings_override.audio.mic_default_on, false);
  assert.equal(candidate.data.settings_override.frame_recording.capture_interval_in_seconds, 2);
  assert.equal(candidate.ring, false); assert.equal(candidate.notify, false);
  assert.deepEqual(resolutionErrors(resolution), []); assert.deepEqual(checkTypes(candidate, 'candidate').errors, []);
  save('candidate-request-offline-only.json', candidate);
  const declaration = sdkSources().find((file) => file.endsWith('/dist/index.d.ts'));
  const typedFile = path.join(directory, 'candidate-request.ts');
  fs.writeFileSync(typedFile, `import type { GetOrCreateCallRequest } from '${declaration}';\nconst request: GetOrCreateCallRequest = ${JSON.stringify(candidate, null, 2)};\nvoid request;\n`, { flag: 'wx' });
  artifacts['candidate-request.ts'] = { path: typedFile.replaceAll('\\', '/'), sha256: sha(typedFile) };
});

for (const field of ['width', 'height']) test(`SDK requires ${field} inside an explicitly supplied target resolution`, () => {
  const copy = structuredClone(candidate); delete copy.data.settings_override.video.target_resolution[field];
  const result = checkTypes(copy, `missing-${field}`); assert.equal(result.passed, false);
  assert(result.errors.some((error) => error.code === 2741 && error.message.includes(field)));
});

test('null, empty and string-valued resolutions fail strict public SDK declarations', () => {
  for (const [label, value] of [['null', null], ['empty', {}], ['string-width', { width: '640', height: 480 }]]) {
    const copy = structuredClone(request); copy.data.settings_override.video.target_resolution = value;
    assert.equal(checkTypes(copy, label).passed, false);
  }
});

test('documented resolution boundaries reject invalid integers separately from SDK number types', () => {
  const cases = [];
  for (const field of ['width', 'height']) for (const value of [239, 3841, 0, -1, 640.5, NaN, Infinity, '640', null]) {
    const proposed = { ...resolution, [field]: value }; assert(resolutionErrors(proposed).includes(field));
    cases.push({ field, value: Number.isFinite(value) || typeof value !== 'number' ? value : String(value), accepted: false });
  }
  for (const edge of [240, 3840]) assert.deepEqual(resolutionErrors({ width: edge, height: edge }), []);
  assert.deepEqual(resolutionErrors({ width: 640, height: 480 }), []);
  assert.deepEqual(resolutionErrors({ ...resolution, bitrate: 6000000 }), []);
  assert(resolutionErrors({ ...resolution, bitrate: 6000001 }).includes('bitrate'));
  assert(resolutionErrors({ ...resolution, bitrate: 600000.5 }).includes('bitrate'));
  const outsideRange = structuredClone(candidate); outsideRange.data.settings_override.video.target_resolution.width = 239;
  assert.equal(checkTypes(outsideRange, 'sdk-does-not-check-minimum').passed, true);
  save('documented-range-controls.json', { cases, widthHeightRange: [240, 3840], bitrateMaximum: 6000000, bitrateMinimum: 'NOT_SPECIFIED', serverValidator: false });
});

test('changed manifest is rejected by the existing B2 parser rather than becoming executable', () => {
  assert.deepEqual(parseB2Manifest(manifest), manifest);
  const copy = structuredClone(manifest); copy.perCall.settings_override.video.target_resolution = resolution;
  assert.throws(() => parseB2Manifest(copy), /b2_manifest_schema_or_value_invalid/);
  assert.deepEqual(manifest.perCall.settings_override.video, { enabled: false, camera_default_on: false });
});

test('earlier fixture AST and retained readback support the exact disabled 640x480 candidate with bounded provenance', () => {
  const base = actualCallExpression('supabase/functions/_shared/connect-stream-adapter.ts', { s: {
    id: '00000000-0000-4000-8000-000000000001', media: 'voice', caller_user_id: 'historical_fixture_a', recipient_user_id: 'historical_fixture_b',
  } });
  const earlier = actualCallExpression('scripts/lib/connect-stream-closure-worker.ts', { args: base, approvedTimer: true,
    fixtures: { boundary: true, videoOnly: false, users: ['historical_fixture_a', 'historical_fixture_b', 'historical_creator_c'] } });
  assert.deepEqual(earlier.data.settings_override.video, candidate.data.settings_override.video);
  assert.deepEqual(checkTypes(earlier, 'earlier-fixture').errors, []);
  const config = read('docs/betweener-connect/stream-staging-connect-validation.json').providerConfiguration.readback;
  assert.deepEqual(config.settings.video.target_resolution, resolution); assert.equal(config.settings.video.enabled, false);
  const boundary = read('docs/betweener-connect/stream-staging-connect-revocation-boundary-evidence.json');
  const calls = boundary.experiment.results.calls;
  assert.equal(calls.length, 3); assert(calls.every((call) => call.joins.every((join) => join.status === 201)));
  assert.equal(calls[1].afterMedia.limits.max_duration_seconds, 60); assert.equal(calls[1].receiveControl.length, 2);
  save('earlier-fixture-reconstructed.json', { request: earlier, retainedTypeVideo: config.settings.video,
    successfulCallIds: calls.map((call) => call.id), sourceAtRunHashAvailable: false, originalWireBodyAvailable: false });
});

test('deep inheritance preserves a valid target while group replacement loses it; models do not establish server behavior', () => {
  const inherited = read('docs/betweener-connect/stream-staging-connect-validation.json').providerConfiguration.readback.settings.video;
  const override = request.data.settings_override.video;
  const deep = { ...inherited, ...override }; const replacement = structuredClone(override);
  assert.deepEqual(resolutionErrors(deep.target_resolution), []);
  assert.deepEqual(resolutionErrors(replacement.target_resolution), ['resolution_object_missing']);
  save('merge-hypothesis-controls.json', { inherited, override, deep, replacement, confirmedServerAlgorithm: false });
});

test('safe projection retains known dimensions without inventing a required or minimum rule', () => {
  const names = ['data.settings_override.video.target_resolution.height', 'data.settings_override.video.target_resolution.width'];
  const projected = providerDiagnostic({ code: 4, message: names.join(' '), details: 'PRIVATE_SYNTHETIC_SENTINEL' }, 400);
  assert.deepEqual(projected.fields, names); assert.deepEqual(projected.ruleHints, []);
  assert.equal(JSON.stringify(projected).includes('PRIVATE_SYNTHETIC_SENTINEL'), false);
  assert.deepEqual(projectDiagnostic({ ...projected, rawText: 'PRIVATE_SYNTHETIC_SENTINEL', fields: [...names, 'unknown.private.field'] }), projected);
});

test('bare dimension aliases and full paths project identically, leaving the original field qualification unknown', () => {
  const bare = providerDiagnostic({ code: 4, message: 'height width' }, 400);
  const qualified = providerDiagnostic({ code: 4, message: 'data.settings_override.video.target_resolution.height data.settings_override.video.target_resolution.width' }, 400);
  assert.deepEqual(bare, qualified);
  const actual = evidence.runnerEvidence.errors[0].detail.diagnostic;
  assert.deepEqual(actual, qualified);
  save('projection-ambiguity.json', { bare, qualified, actualB2: actual, originalRawFieldQualification: 'NOT_RETAINED', originalRule: 'UNKNOWN' });
});

test('real pinned SDK fake transport preserves B2 and candidate JSON without nested defaults or network access', () => {
  const input = save('sdk-input.json', { manifest, ledger });
  const readable = [input, path.resolve('docs/betweener-connect/stream-staging-connect-media-truth-proposal.json'), path.resolve('scripts/lib/connect-media-truth')];
  const result = spawnSync(cachedDeno(), ['run', '--no-prompt', '--cached-only', '--no-lock', '--config', 'scripts/lib/connect-media-truth/deno.json',
    '--deny-net', `--deny-read=${path.resolve('.env.stream-audit.local')}`, `--allow-read=${readable.join(',')}`, '--allow-env=PKG_VERSION', '__tests__/fixtures/connect-video-resolution-sdk-offline.mts', input],
  { encoding: 'utf8', timeout: 30000, windowsHide: true });
  fs.writeFileSync(path.join(directory, 'sdk-stderr.log'), result.stderr ?? '', { flag: 'wx' });
  assert.equal(result.status, 0, result.stderr); const output = JSON.parse(result.stdout.trim());
  assert.equal(output.networkPermission, 'denied'); assert.equal(output.credentialReadPermission, 'denied');
  assert.equal(output.actualNetworkCalls, 0); assert.equal(output.transportCalls, 5);
  const body = (name) => output.captures.find((capture) => capture.name === name && capture.method).body;
  assert.deepEqual(body('b2'), request); assert.deepEqual(body('candidate'), candidate);
  const wire = (name) => output.captures.find((capture) => capture.name === name && capture.method).serializedBody;
  assert.deepEqual(JSON.parse(wire('b2')), request); assert(!wire('b2').includes('target_resolution'));
  assert.deepEqual(JSON.parse(wire('candidate')), candidate);
  assert.deepEqual(body('empty-resolution').data.settings_override.video.target_resolution, {});
  assert.equal(body('null-resolution').data.settings_override.video.target_resolution, null);
  assert(!Object.hasOwn(body('without-video-object').data.settings_override, 'video'));
  assert(output.captures.filter((capture) => capture.method).every((capture) => capture.method === 'POST' && capture.path.endsWith(ledger.callId)));
  assert.equal(JSON.stringify(output).includes('PRIVATE_SYNTHETIC_SENTINEL'), false);
  save('sdk-serialization-results.json', output);
});

test.after(() => {
  save('audit-test-receipt.json', { kind: 'OFFLINE_VIDEO_RESOLUTION_AUDIT', createdAt: new Date().toISOString(),
    sdkVersion: '0.7.63', sdkSources: sdkSources().map((path) => ({ path, sha256: sha(path) })),
    requestHistoricalWireCaptureAvailable: false, artifacts: { ...artifacts }, providerCalls: 0,
    candidate: 'OFFLINE_ONLY_NOT_EXECUTABLE_MANIFEST', approvalCreated: false });
  console.log(`Video-resolution audit artifacts: ${directory}`);
});
