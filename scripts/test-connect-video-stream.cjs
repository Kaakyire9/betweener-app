// Explicitly approved one-call VIDEO positive control. Never installs flags in a shared DB.
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } = require('node:fs');
const { withConnectDatabase } = require('./lib/connect-test-database.cjs');
const { openStreamFixture } = require('./lib/connect-stream-fixture.cjs');
assert.ok(process.argv.includes('--run-approved-video-test'), 'explicit_video_approval_argument_required');
const user = (n) => `f0110000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const profile = (n) => `f0120000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const q = (s) => s === null ? 'null' : `'${String(s).replaceAll("'", "''")}'`;
const parse = (s) => JSON.parse(s.split(/\r?\n/).findLast((line) => /^(\{|\[|null$|true$|false$)/.test(line)));
const report = { date: new Date().toISOString(), scope: 'APPROVED_ONE_VIDEO_CALL_STREAM_1731011',
  proposal: 'stream-staging-connect-video-security-proposal.json', providerPolicyWrites: 0,
  sharedDatabaseModified: false, checks: [], result: 'IN_PROGRESS' };
const passed = (name) => { report.checks.push(name); console.log(`ok ${report.checks.length} - ${name}`); };
const diagnostic = process.argv.includes('--diagnostic-retry');
const verification = process.argv.includes('--verification-run');
assert.ok(!(diagnostic && verification), 'choose_one_approved_run');
const runName = verification ? 'video-verification' : diagnostic ? 'video-diagnostic' : 'video-positive';
const priorPath = 'tmp/connect-m2a/video-positive-results.json';
if (existsSync(priorPath)) {
  assert.ok(diagnostic || verification, 'first_call_already_consumed_use_separately_approved_run');
  report.proposal = verification ? 'stream-staging-connect-video-security-verification-proposal.json' : 'stream-staging-connect-video-security-retry-proposal.json';
}
assert.ok(!existsSync(`tmp/connect-m2a/${runName}-results.json`), 'approved_call_already_consumed');
const save = () => {
  mkdirSync('tmp/connect-m2a', { recursive: true });
  writeFileSync(`tmp/connect-m2a/${runName}-results.json`, JSON.stringify(report, null, 2) + '\n');
};
const waitForDiagnosticRetry = async () => {
  const path = 'tmp/connect-m2a/video-diagnostic-control.json';
  if (existsSync(path)) unlinkSync(path);
  console.log(JSON.stringify({ diagnosticPaused: true, seconds: 300, control: path }));
  for (let seconds = 0; seconds < 300; seconds++) {
    if (existsSync(path)) {
      const { retry } = JSON.parse(readFileSync(path, 'utf8')); unlinkSync(path); return retry === true;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
    if (seconds % 30 === 29) console.log(JSON.stringify({ fixtureHeldForDiagnosticSeconds: seconds + 1, extraCallsCreated: 0 }));
  }
  return false;
};

withConnectDatabase(async ({ sql, file }) => {
  sql(file('supabase/tests/fixtures/connect_v1.sql'));
  sql("update private.connect_config set environment='local',enabled=true,provider_ready=true,voice_enabled=true,video_enabled=true,pre_match_enabled=true");
  const run = (n, query) => sql(`begin;set local role authenticated;select set_config('request.jwt.claim.sub',${q(user(n))},true);select set_config('request.jwt.claim.role','authenticated',true);${query};commit;`);
  const service = (query) => parse(sql(`begin;set local role service_role;${query};commit;`));
  const get = (id) => parse(run(7, `select public.rpc_connect_get_call(${q(id)})`));
  const grant = (video) => {
    const intent = randomUUID();
    sql(`update public.intent_requests set status='expired' where actor_id=${q(profile(7))} and recipient_id=${q(profile(8))} and type='connect' and status='pending'`);
    sql(`insert into public.intent_requests(id,actor_id,recipient_id,type,status,expires_at) values(${q(intent)},${q(profile(7))},${q(profile(8))},'connect','pending',clock_timestamp()+interval '1 hour')`);
    const id = run(7, `select public.rpc_connect_request_grant(${q(intent)},${!video},${video})`).split(/\r?\n/).findLast((line) => /^[0-9a-f-]{36}$/.test(line));
    run(8, `select public.rpc_connect_decide_grant(${q(id)},${!video},${video})`); return id;
  };
  const fixture = openStreamFixture((name, a) => {
    if (name === 'snapshot') return service(`select public.rpc_connect_worker_snapshot(${q(a.id)})`);
    if (name === 'complete') return service(`select jsonb_build_object('ack',public.rpc_connect_complete_job(${q(a.job.call_id)},${q(a.job.operation)},${q(a.job.lease)},${a.success}))`);
    if (name === 'reconcile') return service(`select jsonb_build_object('ack',public.rpc_connect_reconcile_media(${q(a.id)},${q(a.evidence.session)},array[${a.evidence.users.map(q).join(',')}]::uuid[],${a.evidence.ended}))`);
    if (name === 'admission') return parse(run(a.user === user(7) ? 7 : 8, `select public.rpc_connect_admission(${q(a.id)},${q(a.device)})`));
    throw new Error('unexpected_video_fixture_rpc');
  });
  const request = fixture.request; let setupAttempted = false;
  try {
    await fixture.ready; setupAttempted = true;
    report.identity = await request('setup', { users: [user(7), user(8), user(9)], videoOnly: true });
    const voice = grant(false);
    assert.throws(() => run(7, `select public.rpc_connect_create_call(${q(profile(8))},'video','pre_match',${q(randomUUID())},${q(randomUUID())},${q(voice)})`), /Command failed/);
    run(8, `select public.rpc_connect_revoke_grant(${q(voice)})`);
    passed('voice-only grant cannot create VIDEO, using authenticated authority');
    const video = grant(true); const deviceA = randomUUID(); const deviceB = randomUUID();
    const session = parse(run(7, `select public.rpc_connect_create_call(${q(profile(8))},'video','pre_match',${q(randomUUID())},${q(deviceA)},${q(video)})`));
    report.call = { id: session.id, media: 'video', serverGenerated: true, ring: false, notify: false };
    const job = service('select public.rpc_connect_claim_job()'); assert.equal(job.call_id, session.id); assert.equal(job.operation, 'create');
    assert.equal((await request('job', { job })).success, true);
    report.invitedPolicy = await request('videoPolicy', { id: session.id });
    assert.equal(report.invitedPolicy.members.length, 2);
    assert.ok(report.invitedPolicy.members.every((member) => member.role === 'connect_invited'));
    await assert.rejects(request('credentials', { id: session.id, user: user(7), device: deviceA }));
    passed('members remain invited and credential issuance is denied before acceptance');
    run(8, `select public.rpc_connect_act(${q(session.id)},'accept',${get(session.id).version},${q(deviceB)})`);
    report.consent = { independentRecipientVideo: true, voiceGrantDenied: true, state: get(session.id).state };
    const actors = [[7, deviceA], [8, deviceB]];
    let credentials = await Promise.all(actors.map(([n, device]) => request('credentials', { id: session.id, user: user(n), device })));
    report.joins = await Promise.all(credentials.map((entry) => request('join', entry)));
    for (const joined of report.joins) {
      assert.equal(joined.status, 201);
      assert.deepEqual(joined.capabilities.slice().sort(), ['join-call', 'read-call', 'send-audio', 'send-video']);
    }
    // Capture the adversarial matrix before a possible media failure can obscure it.
    report.privileges = await request('videoPrivileges', credentials[0]);
    for (const row of report.privileges.filter((row) => row.name !== 'capabilities_after_attempts')) {
      assert.equal(row.status, 403, row.name); assert.equal(row.code, 17, row.name);
    }
    assert.deepEqual(report.privileges.at(-1).capabilities.slice().sort(), ['join-call', 'read-call', 'send-audio', 'send-video']);
    report.acceptedPolicy = await request('videoPolicy', { id: session.id });
    assert.ok(report.acceptedPolicy.members.every((member) => member.role === 'connect_video'));
    assert.ok(report.acceptedPolicy.userRoles.every((row) => row.role === 'user'));
    assert.equal(report.acceptedPolicy.settings.video.enabled, true);
    assert.equal(report.acceptedPolicy.settings.screensharing.enabled, false);
    passed('ordinary VIDEO identities cannot add members, escalate permissions/settings, end, record, transcribe or broadcast');
    const reconcile = async () => {
      sql(`select public.rpc_connect_enqueue_sync(${q(session.id)},${q(randomUUID().replaceAll('-', '') + randomUUID().replaceAll('-', ''))})`);
      for (let pending = 0; pending < 16; pending++) {
        const claimed = service('select public.rpc_connect_claim_job()'); if (!claimed) break;
        assert.equal((await request('job', { job: claimed })).success, true);
        if (claimed.call_id === session.id && claimed.operation === 'sync') break;
      }
      report.reconciledState = get(session.id).state;
      return report.reconciledState === 'ACTIVE';
    };
    const mediaReady = (media) => media.joinAcknowledged && media.videoStats?.bytesSent > 0 && media.audioStats?.bytesSent > 0;
    for (let attempt = 0; attempt < (diagnostic || verification ? 4 : 1); attempt++) {
      report.sessions = await Promise.all(credentials.map((entry) => request('mediaOpen', entry)));
      report.sessions.forEach((media, index) => console.log(JSON.stringify({ participant: actors[index][0], media })));
      const active = await reconcile();
      if (report.sessions.every(mediaReady)) break;
      report.attempts ??= []; report.attempts.push({ sessions: report.sessions, reconciledState: report.reconciledState }); save();
      // Respect the real connection deadline. Only trusted provider reconciliation can allow a diagnostic pause.
      if (!active || !(diagnostic || verification) || attempt === 3 || !await waitForDiagnosticRetry()) break;
      await Promise.all(credentials.map((entry) => request('mediaClose', entry)));
      credentials = await Promise.all(actors.map(([n, device]) => request('credentials', { id: session.id, user: user(n), device })));
      for (const joined of await Promise.all(credentials.map((entry) => request('join', entry)))) assert.equal(joined.status, 201);
    }
    for (const media of report.sessions) {
      assert.equal(media.joinAcknowledged, true);
      for (const track of ['video', 'audio']) assert.ok(media.results.some((item) => item.track === track && item.answerReceived && item.code === null));
      assert.equal(media.videoStats?.connectionState, 'connected');
      assert.ok(media.videoStats.bytesSent > 0 && media.videoStats.packetsSent > 0 && media.videoStats.framesEncoded > 0);
      assert.equal(media.audioStats?.connectionState, 'connected'); assert.ok(media.audioStats.bytesSent > 0);
      assert.ok(media.results.some((item) => item.track === 'screenshare' && item.code === 'ERROR_CODE_PERMISSION_DENIED' && !item.answerReceived));
    }
    assert.equal(report.reconciledState, 'ACTIVE');
    passed('both consenting VIDEO identities publish real synthetic video/audio RTP; SFU explicitly denies screen sharing; actual worker reconciles ACTIVE');
    report.result = 'PASS';
  } catch (error) {
    report.result = 'BLOCKED'; report.error = error.message; throw error;
  } finally {
    try { if (setupAttempted) report.cleanup = await request('cleanup'); }
    finally {
      await fixture.close();
      save();
      console.log(JSON.stringify({ result: report.result, checks: report.checks.length, cleanup: report.cleanup }));
    }
    assert.equal(report.cleanup?.cleaned, true); assert.equal(report.cleanup.unchangedCallTypes, true);
    assert.equal(report.cleanup.calls.length, 1);
  }
}).catch((error) => { console.error(error.stderr ? 'disposable_database_operation_failed' : error.message); process.exitCode = 1; });
