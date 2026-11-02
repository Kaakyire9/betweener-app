const test = require('node:test'); const assert = require('node:assert/strict');
const fs = require('node:fs'); const path = require('node:path'); const vm = require('node:vm');
const { spawnSync } = require('node:child_process'); const { createHash } = require('node:crypto');
const ts = require('typescript');
const { buildCreateRequest, syntheticB2Ledger, parseB2Manifest } = require('../scripts/lib/connect-media-truth/request.cjs');
const { inspectSdkContract } = require('../scripts/lib/connect-media-truth/sdk-contract.cjs');
const { cachedDeno } = require('../scripts/lib/connect-media-truth/provider-process.cjs');
const { providerDiagnostic } = require('../scripts/lib/connect-media-truth/provider-diagnostics.cjs');
const root = path.resolve('tmp/connect-live-comparison-27'); fs.mkdirSync(root, { recursive: true });
const directory = fs.mkdtempSync(path.join(root, 'contracts-'));
const read = (file) => JSON.parse(fs.readFileSync(file));
const sha = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const artifacts = {};
const save = (name, value) => {
  const file = path.join(directory, name); fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
  artifacts[name] = { path: file.replaceAll('\\', '/'), sha256: sha(file) }; return file;
};
function expression(file, context) {
  const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true); const calls = [];
  const visit = (node) => {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === 'getOrCreate') calls.push(node);
    ts.forEachChild(node, visit);
  };
  visit(source); assert.equal(calls.length, 1);
  const compiled = ts.transpileModule(`(${calls[0].arguments[0].getText(source)})`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } });
  return JSON.parse(JSON.stringify(vm.runInNewContext(compiled.outputText, context, { timeout: 1000 })));
}
const ledger = syntheticB2Ledger();
const snapshot = { id: ledger.callId, caller_user_id: ledger.users[0], recipient_user_id: ledger.users[1], media: 'voice', state: 'REQUESTED', ended_at: null, can_provision: true };
const b2 = read('docs/betweener-connect/stream-staging-connect-media-truth-b2-proposal.json');
const legacy = read('docs/betweener-connect/stream-staging-connect-media-truth-proposal.json');
const type = read('docs/betweener-connect/stream-staging-connect-validation.json').providerConfiguration.readback;
const production = expression('supabase/functions/_shared/connect-stream-adapter.ts', { s: snapshot });
const cases = [
  { name: 'A_live_app', type: 'betweener_live', evidence: 'CURRENT_SOURCE_RECONSTRUCTION',
    request: expression('supabase/functions/live-rtc-token/index.ts', { admission: { maximum_participants: 4 }, userId: ledger.users[0], sessionId: ledger.callId }) },
  { name: 'A_web_studio', type: 'betweener_live', evidence: 'CURRENT_SOURCE_RECONSTRUCTION',
    request: expression('supabase/functions/live-studio-media-token/index.ts', { admission: { maximumParticipants: 4, providerUserId: 'studio-offline-source' }, sessionId: ledger.callId }) },
  { name: 'B_earlier_connect', type: 'betweener_connect', evidence: 'SOURCE_RECONSTRUCTION_WITH_RETAINED_SETUP_SUCCESS_NO_WIRE_BODY',
    request: expression('scripts/lib/connect-stream-closure-worker.ts', { args: production, approvedTimer: true,
      fixtures: { boundary: true, videoOnly: false, users: [...ledger.users, 'offline_fixture_creator'] } }) },
  { name: 'C_media_truth_B1', type: 'betweener_connect', evidence: 'IMMUTABLE_MANIFEST_AND_SOURCE_RECONSTRUCTION_NO_WIRE_BODY', request: buildCreateRequest(legacy, ledger) },
  { name: 'D_media_truth_B2', type: 'betweener_connect', evidence: 'IMMUTABLE_MANIFEST_AND_SOURCE_RECONSTRUCTION_NO_WIRE_BODY', request: buildCreateRequest(b2, ledger) },
];
const full = structuredClone(cases.at(-1).request);
full.data.settings_override.video.target_resolution = read('docs/betweener-connect/stream-staging-connect-video-resolution-audit.json').candidate.change.value;
cases.push({ name: 'E_complete_resolution', type: 'betweener_connect', evidence: 'OFFLINE_CANDIDATE_ONLY', request: full });
const lean = structuredClone(full); lean.data.settings_override = { limits: { max_participants: 2, max_duration_seconds: 60 } };
cases.push({ name: 'F_limits_only', type: 'betweener_connect', evidence: 'GATED_INHERITANCE_MODEL_NOT_APPROVED_OR_PROVIDER_VERIFIED', request: lean });
save('request-matrix.json', { callId: ledger.callId, production, cases });

test('Live app and Studio actually construct only a participant-limit override', () => {
  for (const item of cases.slice(0, 2)) {
    assert.deepEqual(item.request.data.settings_override, { limits: { max_participants: 4 } });
    assert.equal(item.request.data.created_by_id, 'betweener-live-system');
    assert.equal(item.request.data.members.length, 1); assert.equal(item.request.data.members[0].role, 'call_member');
    assert.equal(item.request.ring, false); assert.equal(item.request.notify, false);
    assert.equal(item.request.data.custom.recording_allowed, false);
  }
});

test('earlier fixture retains the production video object but substitutes its creator and approved timer', () => {
  const previous = cases[2].request;
  assert.deepEqual(previous.data.settings_override.video, production.data.settings_override.video);
  assert.deepEqual(previous.data.settings_override.limits, { max_participants: 2, max_duration_seconds: 60 });
  assert(previous.data.members.every((member) => member.role === 'connect_invited'));
  assert.equal(previous.data.created_by_id, 'offline_fixture_creator');
  assert.equal(production.ring, true); assert.equal(previous.ring, false);
});

test('B1 and B2 differ only in frame interval within their settings, and both omit video resolution', () => {
  const first = cases[3].request.data.settings_override; const second = cases[4].request.data.settings_override;
  const restored = structuredClone(second); delete restored.frame_recording.capture_interval_in_seconds;
  assert.deepEqual(restored, first); assert.equal(second.frame_recording.capture_interval_in_seconds, 2);
  assert(!Object.hasOwn(first.video, 'target_resolution')); assert(!Object.hasOwn(second.video, 'target_resolution'));
});

test('complete candidate is exactly one object beyond B2 and preserves pair identity and voice roles', () => {
  const restored = structuredClone(full); delete restored.data.settings_override.video.target_resolution;
  assert.deepEqual(restored, cases[4].request);
  for (const request of [full, lean]) {
    assert.equal(request.data.created_by_id, ledger.users[0]);
    assert.deepEqual(request.data.members, ledger.users.map(user_id => ({ user_id, role: 'connect_voice' })));
    assert.equal(request.ring, false); assert.equal(request.notify, false);
    assert.deepEqual(request.data.settings_override.limits, { max_participants: 2, max_duration_seconds: 60 });
  }
});

test('public SDK accepts all proposed and Live shapes; B1 alone retains the known frame-interval type defect', () => {
  const results = cases.map(item => ({ name: item.name, ...inspectSdkContract(item.request) }));
  assert.deepEqual(results.filter(result => !result.passed).map(result => result.name), ['C_media_truth_B1']);
  assert(results.find(result => result.name === 'C_media_truth_B1').errors.some(error => error.code === 2741 && error.message.includes('capture_interval_in_seconds')));
  save('sdk-contracts.json', results);
});

test('unchanged B2 schema rejects both alternative manifest shapes; no execution profile is introduced', () => {
  assert.deepEqual(parseB2Manifest(b2), b2);
  for (const request of [full, lean]) {
    const proposed = structuredClone(b2); proposed.perCall.settings_override = request.data.settings_override;
    assert.throws(() => parseB2Manifest(proposed), /schema_or_value_invalid/);
  }
});

function inheritedModel(request) {
  const effective = structuredClone(type);
  effective.settings.limits = { ...effective.settings.limits, ...request.data.settings_override.limits };
  return effective;
}
test('limits-only is compatible with retained complete type settings in an explicitly offline model', async () => {
  const { assertConnectCallType, assertConnectSessionSettings } = await import('../supabase/functions/_shared/connect-stream-adapter.ts');
  const effective = inheritedModel(lean); assertConnectCallType(effective); assertConnectSessionSettings(effective.settings, 'voice');
  assert.deepEqual(effective.settings.video.target_resolution, { width: 640, height: 480, bitrate: 600000 });
  assert.equal(effective.settings.video.camera_default_on, false); assert.equal(effective.settings.audio.mic_default_on, false);
  save('inheritance-model.json', { providerVerified: false, settings: effective.settings, grants: effective.grants });
});

test('actual policy validator rejects unsafe inherited recording, screen, video, ingress and role settings', async () => {
  const { assertConnectCallType, assertConnectSessionSettings } = await import('../supabase/functions/_shared/connect-stream-adapter.ts');
  const mutations = [
    t => { t.settings.recording.mode = 'available'; }, t => { t.settings.frame_recording.mode = 'auto-on'; },
    t => { t.settings.individual_recording.mode = 'available'; }, t => { t.settings.raw_recording.mode = 'available'; },
    t => { t.settings.transcription.mode = 'available'; }, t => { t.settings.transcription.closed_caption_mode = 'auto-on'; },
    t => { t.settings.screensharing.enabled = true; }, t => { t.settings.video.enabled = true; },
    t => { t.settings.video.camera_default_on = true; }, t => { t.settings.ingress.enabled = true; },
    t => { t.settings.broadcasting.hls.enabled = true; }, t => { t.grants.user = ['join-call']; },
    t => { t.grants.connect_invited.push('join-call'); }, t => { t.grants.connect_voice.push('send-video'); },
  ];
  for (const mutate of mutations) { const copy = inheritedModel(lean); mutate(copy);
    assert.throws(() => { assertConnectCallType(copy); assertConnectSessionSettings(copy.settings, 'voice'); }, /policy_unsafe/); }
});

test('recording_allowed custom data cannot replace provider setting verification', async () => {
  const { assertConnectSessionSettings } = await import('../supabase/functions/_shared/connect-stream-adapter.ts');
  const copy = inheritedModel(lean); copy.settings.recording.mode = 'available';
  assert.equal(cases[0].request.data.custom.recording_allowed, false);
  assert.throws(() => assertConnectSessionSettings(copy.settings, 'voice'), /policy_unsafe/);
});

test('actual production adapter inherits security settings while retaining invited-only membership and complete video', async () => {
  const { createConnectStreamAdapter } = await import('../supabase/functions/_shared/connect-stream-adapter.ts');
  const writes = []; let tokens = 0;
  const call = { getOrCreate: async request => { writes.push(request); }, get: async () => ({ call: {
    id: snapshot.id, type: 'betweener_connect', custom: { betweener_connect_id: snapshot.id, media: 'voice' }, settings: type.settings,
  }, members: ledger.users.map(user_id => ({ user_id })) }), updateCallMembers: async () => {}, end: async () => {} };
  const adapter = createConnectStreamAdapter({ getApp: async () => ({ app: { id: 1731011, disable_auth_checks: false, disable_permissions_checks: false } }),
    video: { getCallType: async () => type, call: () => call }, upsertUsers: async () => {}, generateUserToken: () => { tokens++; return 'offline'; } }, 1731011);
  await adapter.provision(snapshot); assert.deepEqual(writes, [production]); assert.equal(tokens, 0);
  await assert.rejects(adapter.credentials(snapshot, ledger.users[0]), /unavailable/); assert.equal(tokens, 0);
});

test('retained built-in and Live grants cannot substitute for the strict Connect type', async () => {
  const { assertConnectCallType } = await import('../supabase/functions/_shared/connect-stream-adapter.ts');
  const previous = read('tmp/connect-m2/provider-configuration-before.json').existingCallTypes;
  for (const name of ['betweener_live', 'audio_call', 'default']) {
    assert(previous[name].grants.user.includes('join-call')); assert(previous[name].grants.user.includes('create-call'));
    assert.throws(() => assertConnectCallType({ ...previous[name], name: 'betweener_connect' }), /policy_unsafe/);
  }
});

test('error field normalization remains a hint, not proof of a required resolution or server validation rule', () => {
  const detail = read('docs/betweener-connect/stream-staging-connect-media-truth-b2-evidence.json').runnerEvidence.errors[0].detail;
  assert.equal(detail.stage, 'create_call'); assert.equal(detail.status, 400); assert.equal(detail.code, 4);
  const projected = providerDiagnostic({ code: 4, message: 'height width PRIVATE_SYNTHETIC_SENTINEL' }, 400);
  assert.deepEqual(projected, detail.diagnostic); assert.equal(JSON.stringify(projected).includes('PRIVATE_SYNTHETIC_SENTINEL'), false);
});

test('pinned SDK serializes every source-derived request through network-denied fake fetch', () => {
  const input = save('sdk-input.json', { callId: ledger.callId, cases });
  const run = spawnSync(cachedDeno(), ['run', '--no-prompt', '--cached-only', '--no-lock', '--config', 'scripts/lib/connect-media-truth/deno.json',
    '--deny-net', `--deny-read=${path.resolve('.env.stream-audit.local')}`, `--allow-read=${input}`, '--allow-env=PKG_VERSION',
    '__tests__/fixtures/connect-live-contract-sdk-offline.mts', input], { encoding: 'utf8', windowsHide: true, timeout: 30000 });
  assert.equal(run.status, 0, run.stderr); const output = JSON.parse(run.stdout.trim());
  assert.equal(output.networkPermission, 'denied'); assert.equal(output.credentialReadPermission, 'denied'); assert.equal(output.actualNetworkCalls, 0);
  assert.equal(output.results.length, cases.length);
  for (const item of cases) { const result = output.results.find(row => row.name === item.name);
    assert.equal(result.captured.method, 'POST'); assert.deepEqual(result.captured.body, item.request);
    assert.equal(result.captured.path, `/api/v2/video/call/${item.type}/${ledger.callId}`);
    assert.deepEqual(JSON.parse(result.captured.serializedBody), item.request);
    assert.equal(result.projected.category, 'input_error'); assert.equal(result.projected.fields.length, 2);
  }
  assert(!JSON.stringify(output).includes('PRIVATE_SYNTHETIC_SENTINEL')); save('sdk-serialization.json', output);
});

test.after(() => {
  save('test-receipt.json', { date: new Date().toISOString(), kind: 'OFFLINE_LIVE_CONNECT_CONTRACT_COMPARISON',
    artifacts: { ...artifacts }, candidateExecuted: false, providerCalls: 0, ownerApprovalCreated: false });
  console.log(`Live/Connect contract artifacts: ${directory}`);
});
