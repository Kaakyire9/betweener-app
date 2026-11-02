const test = require('node:test'); const assert = require('node:assert/strict');
const fs = require('node:fs'); const path = require('node:path'); const os = require('node:os');
const { createHash } = require('node:crypto');
const { spawn, spawnSync } = require('node:child_process');
const { readManifest, authorize, reserve } = require('../scripts/lib/connect-media-truth/approval.cjs');
const { B2, LEGACY, profileForManifest } = require('../scripts/lib/connect-media-truth/profiles.cjs');
const { parseB2Manifest, syntheticB2Ledger, buildCreateRequest, assertB2Request } = require('../scripts/lib/connect-media-truth/request.cjs');
const { inspectSdkContract, validateB2Contract } = require('../scripts/lib/connect-media-truth/sdk-contract.cjs');
const { assertLedger, ownedCall, ownedUser } = require('../scripts/lib/connect-media-truth/scope.cjs');
const { assertReadiness } = require('../scripts/test-connect-media-truth.cjs');
const { sourceHashes } = require('../scripts/lib/connect-media-truth/provenance.cjs');
const { providerDiagnostic, operationStage, projectStage } = require('../scripts/lib/connect-media-truth/provider-diagnostics.cjs');
const { jsonProcess } = require('../scripts/lib/connect-media-truth/process.cjs');
const { manifest, hash } = readManifest(B2.manifestPath); const ledger = syntheticB2Ledger();
const contract = validateB2Contract(manifest); const request = buildCreateRequest(manifest, ledger);
const invalid = (change) => { const copy = structuredClone(manifest); change(copy); return copy; };
const artifactRoot = path.resolve('tmp/connect-media-truth-b2-preparation'); fs.mkdirSync(artifactRoot, { recursive: true });
const runDirectory = fs.mkdtempSync(path.join(artifactRoot, 'regression-'));
const executionSnapshot = () => fs.existsSync(B2.executionDirectory) ? fs.readdirSync(B2.executionDirectory).sort()
  .map((name) => [name, createHash('sha256').update(fs.readFileSync(path.join(B2.executionDirectory, name))).digest('hex')]) : null;

test('B2 corrects only the prescribed contract field and isolation namespaces', () => {
  const original = readManifest(LEGACY.manifestPath);
  assert.equal(original.hash, '7ba4fb47c2a6008c30a19cd19e5edac35729e7165ba3b406b6d71ff86086f957');
  assert.equal(hash, '96f72e25ccff1e5aa9d630ec3cf597103479aceb5ec7d4e91a7afbb30a9da0f1');
  assert.deepEqual(original.manifest.perCall.settings_override.frame_recording, { mode: 'disabled' });
  assert.deepEqual(manifest.perCall.settings_override.frame_recording, { mode: 'disabled', capture_interval_in_seconds: 2 });
  const restored = structuredClone(manifest); restored.schemaVersion = original.manifest.schemaVersion; restored.experimentId = original.manifest.experimentId;
  delete restored.approval.idPrefix; delete restored.perCall.settings_override.frame_recording.capture_interval_in_seconds;
  restored.ownership.callCustomMarker = original.manifest.ownership.callCustomMarker; restored.ownership.userPrefix = original.manifest.ownership.userPrefix;
  assert.deepEqual(restored, original.manifest);
});

test('actual B2 builder output passes public SDK 0.7.63 contract without any casts', () => {
  assert.equal(contract.passed, true); assert.deepEqual(contract.errors, []);
  assert.equal(request.data.created_by_id, ledger.users[0]); assert.equal(request.data.members.length, 2);
  assert.equal(request.data.custom[B2.marker], ledger.marker); assert.equal(request.data.settings_override.frame_recording.mode, 'disabled');
});

test('missing frame interval fails runtime schema and concrete SDK compilation', () => {
  assert.throws(() => validateB2Contract(invalid((m) => { delete m.perCall.settings_override.frame_recording.capture_interval_in_seconds; })), /schema/);
  const copy = structuredClone(request); delete copy.data.settings_override.frame_recording.capture_interval_in_seconds;
  const result = inspectSdkContract(copy); assert.equal(result.passed, false); assert.ok(result.errors.some((e) => /capture_interval_in_seconds/.test(e.message)));
});

for (const value of [0, -1, 61, 2.5, '2', null]) test(`invalid or unapproved frame interval ${JSON.stringify(value)} fails before request creation`, () => {
  assert.throws(() => buildCreateRequest(invalid((m) => { m.perCall.settings_override.frame_recording.capture_interval_in_seconds = value; }), ledger), /schema/);
});

for (const [name, change] of [
  ['audio enum', (m) => { m.perCall.settings_override.audio.default_device = 'headphones'; }],
  ['recording enum', (m) => { m.perCall.settings_override.recording.mode = 'off'; }],
  ['transcription enum', (m) => { m.perCall.settings_override.transcription.mode = 'none'; }],
  ['member role', (m) => { m.roles.memberRole = 'admin'; }],
  ['missing nested audio default', (m) => { delete m.perCall.settings_override.audio.default_device; }],
  ['missing frame mode', (m) => { delete m.perCall.settings_override.frame_recording.mode; }],
  ['unknown root key', (m) => { m.unreviewed = true; }],
  ['unknown nested key', (m) => { m.perCall.settings_override.video.unreviewed = true; }],
  ['unexpected schema version', (m) => { m.schemaVersion = 3; }],
  ['incorrect settings nesting', (m) => { m.perCall.data = { settings_override: m.perCall.settings_override }; delete m.perCall.settings_override; }],
  ['camera enabled', (m) => { m.perCall.settings_override.video.enabled = true; }],
  ['recording enabled', (m) => { m.perCall.settings_override.frame_recording.mode = 'auto-on'; }],
  ['replacement fixture', (m) => { m.resources.replacementCalls = 1; }],
]) test(`${name} is rejected by the closed B2 parser`, () => assert.throws(() => parseB2Manifest(invalid(change)), /schema/));

test('unsupported enums and missing nested fields also fail the independent SDK declaration check', () => {
  const copy = structuredClone(request); copy.data.settings_override.audio.default_device = 'headphones';
  delete copy.data.settings_override.recording.mode;
  const result = inspectSdkContract(copy); assert.equal(result.passed, false); assert.ok(result.errors.length >= 2);
});

test('incorrect request nesting and member structures fail SDK and exact domain contracts', () => {
  const copy = structuredClone(request); copy.settings_override = copy.data.settings_override; delete copy.data.settings_override;
  delete copy.data.members[0].user_id; copy.data.members[0].id = ledger.users[0];
  assert.throws(() => assertB2Request(copy, manifest, ledger), /structure/);
  assert.equal(inspectSdkContract(copy).passed, false);
});

test('all required call, creator and member identifiers are checked independently of optional SDK fields', () => {
  for (const change of [
    (l) => { delete l.callId; }, (l) => { l.marker = ''; }, (l) => { l.users[0] = ''; },
    (l) => { l.users = [l.users[0]]; }, (l) => { l.users[1] = l.users[0]; }, (l) => { l.experimentId = LEGACY.experimentId; },
  ]) { const copy = structuredClone(ledger); change(copy); assert.throws(() => buildCreateRequest(manifest, copy), /identifiers/); }
  const copy = structuredClone(request); delete copy.data.created_by_id;
  assert.throws(() => assertB2Request(copy, manifest, ledger), /structure/);
});

test('unapproved manifest paths cannot redirect the provider or watchdog to arbitrary files', () => {
  assert.equal(profileForManifest(B2.manifestPath), B2);
  assert.throws(() => profileForManifest('tmp/arbitrary.json'), /rejected/);
  assert.throws(() => buildCreateRequest({ ...manifest, experimentId: 'unreviewed', schemaVersion: 99 }, ledger), /profile/);
});

test('default B2 entrypoint is proposal-only, with no execution directory or resource reservation', () => {
  const before = executionSnapshot();
  const result = spawnSync(process.execPath, ['scripts/test-connect-media-truth-b2.cjs'], { encoding: 'utf8', timeout: 15000, windowsHide: true });
  assert.equal(result.status, 0, result.stderr); const output = JSON.parse(result.stdout);
  assert.equal(output.mode, 'PROPOSAL_ONLY_NO_PROVIDER_ACCESS'); assert.equal(output.requestContract.passed, true);
  assert.equal(output.manifestSha256, hash); assert.deepEqual(executionSnapshot(), before);
});

test('execute without a separate B2 approval fails before provider factory or reservation', async () => {
  const before = executionSnapshot();
  const module = require('../scripts/lib/connect-media-truth/provider-process.cjs'); const previous = module.providerProcess; let calls = 0;
  module.providerProcess = () => { calls++; throw Error('offline_provider_forbidden'); };
  try { await assert.rejects(require('../scripts/test-connect-media-truth-b2.cjs').main(['--execute']), /approval/); assert.equal(calls, 0); }
  finally { module.providerProcess = previous; }
  assert.deepEqual(executionSnapshot(), before);
});

test('B2 approval requires its own namespace, hash, single execution and zero replacements', () => {
  const now = Date.now(); const approval = { explicitExecutionApproval: true, approvedBy: 'offline-unit-test', experimentId: B2.experimentId,
    approvalId: B2.approvalPrefix + 'offline-unit-test', manifestSha256: hash, approvedAt: new Date(now - 100).toISOString(), expiresAt: new Date(now + 10000).toISOString(),
    executionCount: 1, replacementExperiments: 0 };
  assert.equal(authorize({ execute: true, manifest, hash, approval, now }), approval);
  for (const change of [(a) => { a.approvalId = 'media-truth-stage-b-old'; }, (a) => { a.manifestSha256 = 'wrong'; },
    (a) => { a.executionCount = 2; }, (a) => { a.replacementExperiments = 1; }, (a) => { a.expiresAt = new Date(now - 1).toISOString(); }]) {
    const copy = structuredClone(approval); change(copy); assert.throws(() => authorize({ execute: true, manifest, hash, approval: copy, now }));
  }
});

test('B2 unit reservation is single-use and verifies exact ownership and namespace', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'media-truth-b2-unit-'));
  try {
    const approval = { approvalId: B2.approvalPrefix + 'offline-unit-only' };
    const { ledger: l } = reserve(directory, approval, manifest, hash); assertLedger(l, manifest, hash);
    assert.ok(l.users.every((id) => id.startsWith(B2.userPrefix))); assert.throws(() => reserve(directory, approval, manifest, hash), /EEXIST/);
    assert.throws(() => reserve(directory, { approvalId: B2.approvalPrefix + 'another-offline-id' }, manifest, hash), /EEXIST/);
    const value = { call: { id: l.callId, type: 'betweener_connect', custom: { [B2.marker]: l.marker } }, members: l.users.map((user_id) => ({ user_id })) };
    assert.equal(ownedCall(value, l), true); assert.equal(ownedUser({ id: l.users[0], custom: { [B2.marker]: l.marker } }, l), true);
    assert.equal(ownedUser({ id: l.users[0], custom: { [LEGACY.marker]: l.marker } }, l), false);
    value.members[1] = value.members[0]; assert.equal(ownedCall(value, l), false);
    const late = { ...l, hardDeadlineUtc: new Date(Date.parse(l.reservedAt) + 180001).toISOString() };
    assert.throws(() => assertLedger(late, manifest, hash), /deadline/);
  } finally { for (const name of fs.readdirSync(directory)) fs.unlinkSync(path.join(directory, name)); fs.rmdirSync(directory); }
});

test('B2 readiness requires current complete provenance, contract and unexecuted offline stage', () => {
  const value = { stage: 'B2_OFFLINE_ONLY', experimentId: B2.experimentId, providerTestPrepared: 'PASS', providerTestExecuted: false,
    manifestSha256: hash, requestContract: contract, sources: sourceHashes() };
  assert.doesNotThrow(() => assertReadiness(value, manifest, hash, B2, contract));
  for (const change of [(v) => { v.sources.pop(); }, (v) => { v.requestContract.requestSha256 = 'old'; }, (v) => { v.providerTestExecuted = true; }, (v) => { v.stage = 'A_OFFLINE_ONLY'; }]) {
    const copy = structuredClone(value); change(copy); assert.throws(() => assertReadiness(copy, manifest, hash, B2, contract));
  }
});

test('real pinned SDK serializes the corrected shared-builder request using network-denied fake transport', () => {
  const directory = path.join(runDirectory, 'sdk-control'); fs.mkdirSync(directory, { recursive: true });
  const input = path.join(directory, 'builder-input.json'); fs.writeFileSync(input, JSON.stringify({ manifest, ledger }));
  const result = spawnSync(require('../scripts/lib/connect-media-truth/provider-process.cjs').cachedDeno(), ['run', '--no-prompt', '--cached-only', '--no-lock',
    '--config', 'scripts/lib/connect-media-truth/deno.json', '--deny-net', `--allow-read=${input},${LEGACY.manifestPath},${path.resolve('scripts/lib/connect-media-truth')}`, '--allow-env=PKG_VERSION', '__tests__/fixtures/connect-call-creation-sdk-offline.mts', input, '--b2-builder'],
  { encoding: 'utf8', timeout: 30000, windowsHide: true });
  assert.equal(result.status, 0, result.stderr); const output = JSON.parse(result.stdout);
  fs.writeFileSync(path.join(directory, 'result.json'), JSON.stringify(output, null, 2) + '\n');
  assert.deepEqual(output.captured.body, request); assert.equal(output.actualNetworkCalls, 0);
  assert.equal(output.beforeSdk.category, 'input_error'); // Synthetic response only; not a server acceptance test.
});

test('local media runner refuses an existing historical receipt before opening a browser', async () => {
  const historical = fs.readFileSync('tmp/connect-media-truth-preparation/local-browser-results.json');
  await assert.rejects(require('../scripts/test-connect-media-truth-local.cjs').runLocal(['--output-dir', 'tmp/connect-media-truth-preparation']), /already_exists/);
  assert.equal(fs.readFileSync('tmp/connect-media-truth-preparation/local-browser-results.json').equals(historical), true);
});

test('B2 errors retain bounded category and operation stage, never arbitrary stage text', async () => {
  assert.equal(operationStage('createCall'), 'create_call'); assert.equal(projectStage('PRIVATE_STAGE'), null);
  const diagnostic = providerDiagnostic({ status_code: 400, code: 4, message: 'capture_interval_in_seconds is required' });
  assert.equal(diagnostic.category, 'input_error');
  const code = `console.log(JSON.stringify({ready:true}));process.stdin.on('data',b=>{const r=JSON.parse(b);console.log(JSON.stringify({id:r.id,error:{status:400,code:4,stage:'create_call',diagnostic:${JSON.stringify(diagnostic)}}}))})`;
  const port = jsonProcess(process.execPath, ['-e', code], { timeoutMs: 2000 });
  try { await port.ready; await assert.rejects(port.request('createCall'), (error) => error.safeError.stage === 'create_call' && error.safeError.diagnostic.category === 'input_error'); }
  finally { await port.close(); }
});

for (const reason of ['hard-deadline', 'parent-exit']) test(`B2 watchdog ${reason} refuses unproved ownership without loading provider credentials`, async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'media-truth-b2-watchdog-'));
  const file = path.join(directory, 'unowned.json');
  fs.writeFileSync(file, JSON.stringify({ experimentId: B2.experimentId, hardDeadlineUtc: new Date(Date.now() + (reason === 'hard-deadline' ? 10 : 5000)).toISOString() }));
  const child = spawn(process.execPath, ['scripts/lib/connect-media-truth/watchdog.cjs', file, path.join(directory, 'no-approval.json'), B2.manifestPath],
    { windowsHide: true, stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
  try {
    await new Promise((resolve, reject) => { const timer = setTimeout(() => reject(Error('watchdog_timeout')), 3000);
      child.on('message', (message) => { if (message.watchdogReady && reason === 'parent-exit') child.disconnect(); });
      child.once('exit', () => { clearTimeout(timer); resolve(); }); child.once('error', reject); });
    const result = JSON.parse(fs.readFileSync(file + '.cleanup.json')); assert.equal(result.reason, reason);
    assert.ok(result.errors.includes('watchdog_cleanup_failed')); assert.deepEqual(result.attempts, []);
  } finally { child.kill(); for (const name of fs.readdirSync(directory)) fs.unlinkSync(path.join(directory, name)); fs.rmdirSync(directory); }
});
