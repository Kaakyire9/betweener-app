const test = require('node:test'); const assert = require('node:assert/strict');
const fs = require('node:fs'); const path = require('node:path'); const os = require('node:os');
const { spawnSync, spawn } = require('node:child_process'); const { createHash } = require('node:crypto');
const { B2, B3, LEGACY, profileForManifest } = require('../scripts/lib/connect-media-truth/profiles.cjs');
const { readManifest, authorize, reserve } = require('../scripts/lib/connect-media-truth/approval.cjs');
const { parseB2Manifest, parseB3Manifest, syntheticB2Ledger, syntheticB3Ledger, buildCreateRequest, assertB3Request, validateRequestNumbers } = require('../scripts/lib/connect-media-truth/request.cjs');
const { compareRequests } = require('../scripts/lib/connect-media-truth/request-comparison.cjs');
const { validateB3Contract, inspectSdkContract } = require('../scripts/lib/connect-media-truth/sdk-contract.cjs');
const { sourceHashes } = require('../scripts/lib/connect-media-truth/provenance.cjs');
const { assertLedger, ownedCall, ownedUser } = require('../scripts/lib/connect-media-truth/scope.cjs');
const { providerDiagnostic, providerDiagnosticV2, projectDiagnostic, captureErrorResponse } = require('../scripts/lib/connect-media-truth/provider-diagnostics.cjs');
const { assertReadiness } = require('../scripts/test-connect-media-truth.cjs');
const { jsonProcess } = require('../scripts/lib/connect-media-truth/process.cjs');
const { cachedDeno } = require('../scripts/lib/connect-media-truth/provider-process.cjs');
const artifactRoot = path.resolve('tmp/connect-media-truth-b3-preparation'); fs.mkdirSync(artifactRoot, { recursive: true });
const directory = fs.mkdtempSync(path.join(artifactRoot, 'regression-'));
const save = (name, value) => { const file = path.join(directory, name); fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n', { flag: 'wx' }); return file; };
const sha = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const { manifest, hash } = readManifest(B3.manifestPath); const previous = readManifest(B2.manifestPath);
const ledger = syntheticB3Ledger(); const request = buildCreateRequest(manifest, ledger);
const contract = validateB3Contract(manifest); const comparison = compareRequests();
save('request-comparison.json', comparison); save('request-contract.json', contract);
const changed = (mutate) => { const copy = structuredClone(manifest); mutate(copy); return copy; };
const executionState = () => fs.existsSync(B3.executionDirectory) ? fs.readdirSync(B3.executionDirectory).sort() : null;

test('B3 changes exactly one B2 settings object; identity namespace and all safety/protocol values are pinned', () => {
  assert.deepEqual(comparison.settingsDifferenceFromB2, [{ operation: 'add', path: 'video.target_resolution', after: { width: 640, height: 480, bitrate: 600000 } }]);
  const restored = structuredClone(manifest); delete restored.perCall.settings_override.video.target_resolution;
  restored.schemaVersion = 2; restored.experimentId = B2.experimentId; restored.approval.idPrefix = B2.approvalPrefix;
  restored.ownership.callCustomMarker = B2.marker; restored.ownership.userPrefix = B2.userPrefix;
  assert.deepEqual(restored, previous.manifest);
  assert.equal(previous.hash, '96f72e25ccff1e5aa9d630ec3cf597103479aceb5ec7d4e91a7afbb30a9da0f1');
  assert.deepEqual(request.data.settings_override.video, comparison.requests.productionIntended.data.settings_override.video);
  assert.deepEqual(request.data.settings_override.video, comparison.requests.earlierFixtureSourceReconstruction.data.settings_override.video);
});

test('actual B3 builder uses its new namespace, two voice members and first-member creator', () => {
  assert.equal(request.data.created_by_id, ledger.users[0]); assert.deepEqual(request.data.members, ledger.users.map(user_id => ({ user_id, role: 'connect_voice' })));
  assert.deepEqual(request.data.custom, { [B3.marker]: ledger.marker, media: 'voice' });
  assert.deepEqual(request.data.settings_override.limits, { max_participants: 2, max_duration_seconds: 60 });
  assert.equal(request.ring, false); assert.equal(request.notify, false); assertB3Request(request, manifest, ledger);
  assert.throws(() => buildCreateRequest(manifest, syntheticB2Ledger()), /identifiers/);
  assert.throws(() => buildCreateRequest(previous.manifest, ledger), /identifiers/);
  assert.throws(() => parseB2Manifest(manifest), /schema/);
});

test('concrete public pinned SDK declaration validates all B3 nested fields without casts', () => {
  assert.equal(contract.passed, true); assert.deepEqual(contract.errors, []); assert.equal(contract.numericConstraints, 'PASS');
  for (const drop of [copy => { delete copy.data.settings_override.video.target_resolution.width; }, copy => { delete copy.data.settings_override.video.target_resolution.height; },
    copy => { delete copy.data.settings_override.frame_recording.capture_interval_in_seconds; }, copy => { delete copy.data.settings_override.audio.default_device; }]) {
    const copy = structuredClone(request); drop(copy); assert.equal(inspectSdkContract(copy).passed, false);
  }
});

for (const [name, mutate] of [
  ['missing resolution', m => { delete m.perCall.settings_override.video.target_resolution; }],
  ['null resolution', m => { m.perCall.settings_override.video.target_resolution = null; }],
  ['missing width', m => { delete m.perCall.settings_override.video.target_resolution.width; }],
  ['video enabled', m => { m.perCall.settings_override.video.enabled = true; }],
  ['camera default enabled', m => { m.perCall.settings_override.video.camera_default_on = true; }],
  ['screen enabled', m => { m.perCall.settings_override.screensharing.enabled = true; }],
  ['frame capture enabled', m => { m.perCall.settings_override.frame_recording.mode = 'available'; }],
  ['recording enabled', m => { m.perCall.settings_override.recording.mode = 'auto-on'; }],
  ['captions enabled', m => { m.perCall.settings_override.transcription.closed_caption_mode = 'available'; }],
  ['admin membership', m => { m.roles.memberRole = 'admin'; }],
  ['three members', m => { m.resources.participantsMaximum = 3; }],
  ['replacement call', m => { m.resources.replacementCalls = 1; }],
  ['creation retry', m => { m.resources.creationRetries = 1; }],
  ['longer deadline', m => { m.windowsMs.totalBeforeCleanup++; }],
  ['lower confidence', m => { m.observation.minimumMeanSymbolConfidence = 0.9; }],
  ['different modulation', m => { m.observation.codec.symbolMs = 60; }],
  ['unknown root key', m => { m.unreviewed = true; }],
  ['unknown nested key', m => { m.perCall.settings_override.video.unreviewed = true; }],
  ['built-in type', m => { m.application.callType = 'audio_call'; }],
  ['other application', m => { m.application.id++; }],
]) test(`closed B3 manifest rejects ${name}`, () => assert.throws(() => parseB3Manifest(changed(mutate)), /schema/));

test('independent numeric validation rejects wrong primitives, fractions, nonfinite and documented range violations', () => {
  validateRequestNumbers(request);
  for (const [group, field, values] of [
    ['video.target_resolution', 'width', [239, 3841, 640.5, '640', null, NaN, Infinity]],
    ['video.target_resolution', 'height', [0, 3841, 480.5]],
    ['video.target_resolution', 'bitrate', [6000001, 600000.5, '600000', null, Infinity]],
    ['frame_recording', 'capture_interval_in_seconds', [1, 61, 2.5, null]],
    ['limits', 'max_participants', [0, 2.5, Infinity]], ['limits', 'max_duration_seconds', [-1, 60.5, NaN]],
  ]) for (const value of values) { const copy = structuredClone(request); let target = copy.data.settings_override;
    for (const key of group.split('.')) target = target[key]; target[field] = value; assert.throws(() => validateRequestNumbers(copy), /numeric/); }
  const typedButInvalid = structuredClone(request); typedButInvalid.data.settings_override.video.target_resolution.width = 239;
  assert.equal(inspectSdkContract(typedButInvalid).passed, true); // Range validation is independent of SDK number typing.
});

test('B3 remains compatible with retained hardened type under actual adapter validators; no inherited security assumption authorizes joining', async () => {
  const { assertConnectCallType, assertConnectSessionSettings } = await import('../supabase/functions/_shared/connect-stream-adapter.ts');
  const type = JSON.parse(fs.readFileSync('docs/betweener-connect/stream-staging-connect-validation.json')).providerConfiguration.readback;
  assertConnectCallType(type);
  const settings = { ...type.settings, ...request.data.settings_override };
  settings.video = { ...type.settings.video, ...request.data.settings_override.video };
  settings.audio = { ...type.settings.audio, ...request.data.settings_override.audio };
  settings.screensharing = { ...type.settings.screensharing, ...request.data.settings_override.screensharing };
  settings.broadcasting = { ...type.settings.broadcasting, ...request.data.settings_override.broadcasting };
  assertConnectSessionSettings(settings, 'voice');
  save('retained-policy-model.json', { providerVerified: false, grants: type.grants, settings });
  assert.throws(() => assertConnectCallType({ ...type, grants: { ...type.grants, user: ['join-call'] } }), /unsafe/);
});

test('unapproved execution/profile paths fail before any provider import, ledger or fixture', async () => {
  assert.equal(profileForManifest(B3.manifestPath), B3); assert.throws(() => profileForManifest('tmp/unreviewed-b3.json'), /rejected/);
  const state = executionState(); const mod = require('../scripts/lib/connect-media-truth/provider-process.cjs'); const saved = mod.providerProcess; let calls = 0;
  mod.providerProcess = () => { calls++; throw Error('provider_forbidden'); };
  try { await assert.rejects(require('../scripts/test-connect-media-truth-b3.cjs').main(['--execute']), /approval/); assert.equal(calls, 0); }
  finally { mod.providerProcess = saved; }
  const run = spawnSync(process.execPath, ['scripts/test-connect-media-truth-b3.cjs'], { encoding: 'utf8', timeout: 15000, windowsHide: true });
  assert.equal(run.status, 0, run.stderr); const result = JSON.parse(run.stdout); assert.equal(result.mode, 'PROPOSAL_ONLY_NO_PROVIDER_ACCESS');
  assert.equal(result.manifestSha256, hash); assert.equal(result.requestContract.passed, true); assert.deepEqual(executionState(), state);
});

test('B3 approval is a separate one-use/hash-bound in-memory unit value; former namespaces and widened scope fail', () => {
  const now = Date.now(); const approval = { explicitExecutionApproval: true, approvedBy: 'offline-unit-test', approvalId: B3.approvalPrefix + 'offline-unit-only',
    experimentId: B3.experimentId, manifestSha256: hash, executionCount: 1, replacementExperiments: 0,
    approvedAt: new Date(now - 100).toISOString(), expiresAt: new Date(now + 1000).toISOString() };
  assert.equal(authorize({ execute: true, approval, manifest, hash, now }), approval);
  for (const mutate of [a => { a.approvalId = B2.approvalPrefix + 'offline-unit-only'; }, a => { a.experimentId = B2.experimentId; },
    a => { a.manifestSha256 = previous.hash; }, a => { a.executionCount = 2; }, a => { a.replacementExperiments = 1; },
    a => { a.expiresAt = new Date(now + 86400001).toISOString(); }]) { const copy = structuredClone(approval); mutate(copy);
    assert.throws(() => authorize({ execute: true, approval: copy, manifest, hash, now })); }
});

test('disposable B3 unit reservation retains experiment-wide single-use and exact marker ownership', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'b3-offline-unit-'));
  try {
    const approved = { approvalId: B3.approvalPrefix + 'offline-unit-only' }; const { ledger: value } = reserve(temp, approved, manifest, hash);
    assertLedger(value, manifest, hash); assert.throws(() => reserve(temp, approved, manifest, hash), /EEXIST/);
    assert.throws(() => reserve(temp, { approvalId: B3.approvalPrefix + 'another-offline-id' }, manifest, hash), /EEXIST/);
    const call = { call: { id: value.callId, type: 'betweener_connect', custom: { [B3.marker]: value.marker } }, members: value.users.map(user_id => ({ user_id })) };
    assert.equal(ownedCall(call, value), true); assert.equal(ownedUser({ id: value.users[0], custom: { [B3.marker]: value.marker } }, value), true);
    assert.equal(ownedUser({ id: value.users[0], custom: { [B2.marker]: value.marker } }, value), false);
    call.members[1] = call.members[0]; assert.equal(ownedCall(call, value), false);
    assert.throws(() => assertLedger({ ...value, hardDeadlineUtc: new Date(Date.parse(value.reservedAt) + 180001).toISOString() }, manifest, hash), /deadline/);
    assert.throws(() => assertLedger({ ...value, users: syntheticB2Ledger().users }, manifest, hash), /invalid/);
  } finally { for (const file of fs.readdirSync(temp)) fs.unlinkSync(path.join(temp, file)); fs.rmdirSync(temp); }
});

test('B3 readiness rejects stale inventory, failed controls, changed evidence and incomplete Opus receipt', () => {
  const sources = sourceHashes();
  const opus = { unitTestOnly: true, status: 'COMPLETE', sourcesUnchanged: true, sources,
    checks: ['bidirectional_blind_opus_calibration', 'fresh_post_trigger_nonce_decoded_both_directions', 'wrong_nonce_rejected',
      'previous_audio_during_delivery_delay_rejected', 'delayed_fresh_nonce_decoded_both_directions'] };
  const file = save('unit-readiness-control.json', opus);
  const readiness = { stage: 'B3_OFFLINE_ONLY', experimentId: B3.experimentId, providerTestPrepared: 'PASS', providerTestExecuted: false,
    manifestSha256: hash, requestContract: contract, sources, offlineValidation: { status: 'PASS' }, safetyGuards: { status: 'PASS' },
    localOpusControls: { status: 'PASS', path: file }, artifacts: [{ path: file, sha256: sha(file) }] };
  assert.doesNotThrow(() => assertReadiness(readiness, manifest, hash, B3, contract));
  for (const mutate of [r => { r.stage = 'B2_OFFLINE_ONLY'; }, r => { r.sources.pop(); }, r => { r.localOpusControls.status = 'FAIL'; },
    r => { r.offlineValidation.status = 'FAIL'; }, r => { r.safetyGuards.status = 'FAIL'; }, r => { r.providerTestExecuted = true; },
    r => { r.artifacts[0].sha256 = 'old'; }, r => { r.artifacts = []; }, r => { r.requestContract.requestSha256 = 'old'; }]) {
    const copy = structuredClone(readiness); mutate(copy); assert.throws(() => assertReadiness(copy, manifest, hash, B3, contract)); }
  const badOpus = save('unit-incomplete-control.json', { ...opus, checks: [] }); const copy = structuredClone(readiness);
  copy.localOpusControls.path = badOpus; copy.artifacts = [{ path: badOpus, sha256: sha(badOpus) }];
  assert.throws(() => assertReadiness(copy, manifest, hash, B3, contract), /stale_or_incomplete/);
});

test('B3 v2 diagnostics distinguish full paths, qualified aliases and bare hints while v1 stays historical', () => {
  const full = providerDiagnosticV2({ code: 4, message: 'data.settings_override.video.target_resolution.height is required' }, 400);
  const bare = providerDiagnosticV2({ code: 4, message: 'height is required' }, 400);
  assert.deepEqual(full.fields, bare.fields); assert.equal(full.fieldEvidence[0].match, 'qualified_path');
  assert.equal(bare.fieldEvidence[0].match, 'bare_alias'); assert.notDeepEqual(full, bare);
  const keys = providerDiagnosticV2({ exception_fields: { 'VideoSettings.TargetResolution.Height': 'required', width: 'minimum' } }, 400);
  assert(keys.fieldEvidence.every(row => row.origin === 'exception_key')); assert.equal(keys.fieldEvidence[0].match, 'qualified_alias');
  assert.equal(keys.fieldEvidence[1].match, 'bare_alias');
  assert.deepEqual(providerDiagnostic({ message: 'height width' }, 400), providerDiagnostic({ message: 'data.settings_override.video.target_resolution.height data.settings_override.video.target_resolution.width' }, 400));
});

test('v2 independently reprojects finite evidence, bounds it and never preserves error prose or unknown values', async () => {
  const path = 'data.settings_override.video.target_resolution.height';
  const diagnostic = providerDiagnosticV2({ code: 4, message: `${path} PRIVATE_B3_SENTINEL jane@example.invalid https://private.invalid?token=secret v=0 a=ice-pwd:private`,
    exception_fields: { [path]: 'required PRIVATE_B3_SENTINEL', PRIVATE_B3_SENTINEL: 'private' } }, 400);
  const projected = projectDiagnostic({ ...diagnostic, fieldEvidence: [...diagnostic.fieldEvidence, { path, origin: 'PRIVATE_B3_SENTINEL', match: 'qualified_path' },
    { path: 'private.secret', origin: 'message', match: 'bare_alias' }], raw: 'PRIVATE_B3_SENTINEL' });
  assert.deepEqual(projected, diagnostic); assert(!JSON.stringify(projected).includes('PRIVATE_B3_SENTINEL'));
  for (const capture of ['invalid_json', 'too_large', 'timeout']) {
    const response = capture === 'timeout' ? { status: 400, clone: () => ({ body: new ReadableStream() }) }
      : new Response(capture === 'invalid_json' ? 'PRIVATE' : 'PRIVATE'.repeat(500), { status: 400 });
    const result = await captureErrorResponse(response, { diagnosticVersion: 2, maxBytes: 100, timeoutMs: 20 });
    assert.equal(result.version, 2); assert.equal(result.capture, capture); assert.deepEqual(result.fieldEvidence, []);
  }
});

test('v2 error origin/qualification survives the real child bridge with re-projection', async () => {
  const d = providerDiagnosticV2({ code: 4, message: 'height required' }, 400);
  const code = `console.log(JSON.stringify({ready:true}));process.stdin.on('data',b=>{const r=JSON.parse(b);console.log(JSON.stringify({id:r.id,error:{status:400,code:4,stage:'create_call',diagnostic:${JSON.stringify(d)}}}))})`;
  const port = jsonProcess(process.execPath, ['-e', code], { timeoutMs: 2000 });
  try { await port.ready; await assert.rejects(port.request('createCall'), error => {
    assert.deepEqual(error.safeError.diagnostic, d); return true;
  }); } finally { await port.close(); }
});

test('actual pinned SDK serializes the exact closed B3 builder request with net and credential reads denied', () => {
  const input = save('sdk-input.json', { manifest, ledger });
  const run = spawnSync(cachedDeno(), ['run', '--no-prompt', '--cached-only', '--no-lock', '--config', 'scripts/lib/connect-media-truth/deno.json',
    '--deny-net', `--deny-read=${path.resolve('.env.stream-audit.local')}`,
    `--allow-read=${input},${LEGACY.manifestPath},${B2.manifestPath},${path.resolve('scripts/lib/connect-media-truth')}`, '--allow-env=PKG_VERSION',
    '__tests__/fixtures/connect-b3-sdk-offline.mts', input], { encoding: 'utf8', windowsHide: true, timeout: 30000 });
  assert.equal(run.status, 0, run.stderr); const output = JSON.parse(run.stdout);
  assert.equal(output.transportCalls, 1); assert.equal(output.actualNetworkCalls, 0); assert.equal(output.networkPermission, 'denied');
  assert.equal(output.credentialReadPermission, 'denied'); assert.deepEqual(output.captured.body, request);
  assert.deepEqual(JSON.parse(output.captured.serializedBody), request); assert.equal(output.beforeSdk.version, 2);
  assert(output.beforeSdk.fieldEvidence.some(row => row.match === 'qualified_path' && row.origin === 'message'));
  assert(output.beforeSdk.fieldEvidence.some(row => row.match === 'bare_alias' && row.origin === 'exception_key'));
  assert(!JSON.stringify(output).includes('PRIVATE_B3_SENTINEL')); save('sdk-serialization.json', output);
});

for (const reason of ['hard-deadline', 'parent-exit']) test(`B3 watchdog ${reason} rejects unowned input before provider access`, async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'b3-offline-watchdog-')); const file = path.join(temp, 'unowned.json');
  fs.writeFileSync(file, JSON.stringify({ experimentId: B3.experimentId, hardDeadlineUtc: new Date(Date.now() + (reason === 'hard-deadline' ? 10 : 5000)).toISOString() }));
  const child = spawn(process.execPath, ['scripts/lib/connect-media-truth/watchdog.cjs', file, path.join(temp, 'no-approval.json'), B3.manifestPath],
    { windowsHide: true, stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
  try {
    await new Promise((resolve, reject) => { const timer = setTimeout(() => reject(Error('watchdog_timeout')), 3000);
      child.on('message', message => { if (message.watchdogReady && reason === 'parent-exit') child.disconnect(); });
      child.once('exit', () => { clearTimeout(timer); resolve(); }); child.once('error', reject); });
    const receipt = JSON.parse(fs.readFileSync(file + '.cleanup.json')); assert.equal(receipt.reason, reason);
    assert(receipt.errors.includes('watchdog_cleanup_failed')); assert.deepEqual(receipt.attempts, []);
  } finally { child.kill(); for (const name of fs.readdirSync(temp)) fs.unlinkSync(path.join(temp, name)); fs.rmdirSync(temp); }
});

test.after(() => {
  const names = fs.readdirSync(directory); save('test-receipt.json', { kind: 'B3_OFFLINE_REGRESSIONS', createdAt: new Date().toISOString(),
    manifestSha256: hash, artifacts: names.map(name => ({ path: path.join(directory, name).replaceAll('\\', '/'), sha256: sha(path.join(directory, name)) })),
    providerExecuted: false, ownerApprovalCreated: false });
  console.log(`B3 offline artifacts: ${directory}`);
});
