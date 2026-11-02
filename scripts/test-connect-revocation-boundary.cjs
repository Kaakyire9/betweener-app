// Separately approved timer experiment only. No shared DB or call-type/role writes.
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { existsSync, mkdirSync, writeFileSync, readFileSync, unlinkSync } = require('node:fs');
const { withConnectDatabase } = require('./lib/connect-test-database.cjs');
const { openStreamFixture } = require('./lib/connect-stream-fixture.cjs');
assert.ok(process.argv.includes('--run-approved-boundary-tests'), 'explicit_boundary_approval_required');
assert.ok(!existsSync('tmp/connect-boundary/provider-results.json'), 'approved_boundary_run_already_consumed');
const user = (n) => `f0110000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const profile = (n) => `f0120000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const q = (s) => s === null ? 'null' : `'${String(s).replaceAll("'", "''")}'`;
const parse = (s) => JSON.parse(s.split(/\r?\n/).findLast((line) => /^(\{|\[|null$|true$|false$)/.test(line)));
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const report = { recordedAt: new Date().toISOString(), appId: 1731011, calls: [],
  scope: 'APPROVED_THREE_CALL_BOUNDARY_EXPERIMENT', fault: 'LOCAL_END_PORT_THROW_BEFORE_HTTP',
  callTypeOrRoleWrites: 0, sharedDatabaseModified: false, result: 'IN_PROGRESS' };
const save = () => { mkdirSync('tmp/connect-boundary', { recursive: true }); writeFileSync('tmp/connect-boundary/provider-results.json', JSON.stringify(report, null, 2) + '\n'); };

withConnectDatabase(async ({ sql, file }) => {
  sql(file('supabase/tests/fixtures/connect_v1.sql'));
  sql("update private.connect_config set environment='local',enabled=true,provider_ready=true,voice_enabled=true,video_enabled=false,pre_match_enabled=true");
  const run = (n, query) => sql(`begin;set local role authenticated;select set_config('request.jwt.claim.sub',${q(user(n))},true);select set_config('request.jwt.claim.role','authenticated',true);${query};commit;`);
  const service = (query) => parse(sql(`begin;set local role service_role;${query};commit;`));
  const get = (id) => parse(run(7, `select public.rpc_connect_get_call(${q(id)})`));
  const fixture = openStreamFixture((name, a) => {
    if (name === 'snapshot') return service(`select public.rpc_connect_worker_snapshot(${q(a.id)})`);
    if (name === 'complete') return service(`select jsonb_build_object('ack',public.rpc_connect_complete_job(${q(a.job.call_id)},${q(a.job.operation)},${q(a.job.lease)},${a.success}))`);
    if (name === 'reconcile') return service(`select jsonb_build_object('ack',public.rpc_connect_reconcile_media(${q(a.id)},${q(a.evidence.session)},array[${a.evidence.users.map(q).join(',')}]::uuid[],${a.evidence.ended}))`);
    if (name === 'admission') return parse(run(a.user === user(7) ? 7 : 8, `select public.rpc_connect_admission(${q(a.id)},${q(a.device)})`));
    if (name === 'revoke') return parse(run(8, `select public.rpc_connect_revoke_consent(${q(a.grant)})`));
    if (name === 'claimEnd') return service(`select public.rpc_connect_claim_end(${q(a.id)})`);
    throw new Error('unexpected_boundary_rpc');
  });
  const request = fixture.request; let setup = false;
  const work = async (id, operation, extras = {}) => {
    for (let n = 0; n < 20; n++) {
      const job = service('select public.rpc_connect_claim_job()'); assert.ok(job, 'missing_work');
      const target = job.call_id === id && job.operation === operation;
      assert.equal((await request('job', { job, ...(target ? extras : {}) })).success, true);
      if (target) return;
    }
    throw new Error('expected_boundary_job_not_found');
  };
  const stats = (handles) => Promise.all(handles.map((item) => request('mediaStats', item)));
  const closeMedia = (handles) => Promise.all(handles.map((item) => request('mediaClose', item)));
  const receiveControl = async (entry, handles) => {
    for (let attempt = 0; attempt < 3; attempt++) {
      const sessions = await Promise.all(handles.map((item) => request('mediaOpen', item))); entry.publishers = sessions;
      assert.ok(sessions.every((item) => item.audioStats?.bytesSent > 0 && item.audioStats.connectionState === 'connected'), 'audio_publisher_missing');
      sql(`select public.rpc_connect_enqueue_sync(${q(entry.id)},${q(randomUUID().replaceAll('-', '') + randomUUID().replaceAll('-', ''))})`);
      await work(entry.id, 'sync'); assert.equal(get(entry.id).state, 'ACTIVE');
      entry.subscriptions = await Promise.all(handles.map((item, index) => request('mediaSubscribe', {
        ...item, user: user(index === 0 ? 8 : 7), session: sessions[index === 0 ? 1 : 0].sessionId,
      })));
      for (let n = 0; n < 20; n++) {
        entry.receiveControl = await stats(handles);
        if (entry.receiveControl.every((row) => row.receivedAudio?.bytesReceived > 0)) return handles;
        await pause(500);
      }
      entry.receiveControlMissing = true; save(); console.log(JSON.stringify({ receiverDiagnosticPaused: true, call: entry.id, stats: entry.receiveControl }));
      const control = 'tmp/connect-boundary/media-control.json'; if (existsSync(control)) unlinkSync(control);
      let retry = false;
      for (let n = 0; n < 180; n++) {
        if (existsSync(control)) { retry = JSON.parse(readFileSync(control, 'utf8')).retry === true; unlinkSync(control); break; }
        await pause(1000); if (n % 30 === 29) console.log(JSON.stringify({ diagnosticSeconds: n + 1, callsCreated: report.calls.length }));
      }
      assert.ok(retry && attempt < 2, 'remote_receive_not_proven');
      await closeMedia(handles);
      handles = await Promise.all(entry.devices.map((device, index) => request('credentials', { id: entry.id, user: user(index + 7), device })));
      for (const item of handles) assert.equal((await request('join', item)).status, 201);
    }
    throw new Error('remote_receive_not_proven');
  };
  const begin = async (name, timed, delay = 0) => {
    const intent = randomUUID();
    sql(`update public.intent_requests set status='expired' where actor_id=${q(profile(7))} and recipient_id=${q(profile(8))} and status='pending'`);
    sql(`insert into public.intent_requests(id,actor_id,recipient_id,type,status,expires_at) values(${q(intent)},${q(profile(7))},${q(profile(8))},'connect','pending',clock_timestamp()+interval '1 hour')`);
    const grant = run(7, `select public.rpc_connect_request_grant(${q(intent)},true,false)`).split(/\r?\n/).findLast((line) => /^[0-9a-f-]{36}$/.test(line));
    run(8, `select public.rpc_connect_decide_grant(${q(grant)},true,false)`);
    const devices = [randomUUID(), randomUUID()];
    const s = parse(run(7, `select public.rpc_connect_create_call(${q(profile(8))},'voice','pre_match',${q(randomUUID())},${q(devices[0])},${q(grant)})`));
    const entry = { name, id: s.id, grant, devices, createdAt: new Date().toISOString(), timed }; report.calls.push(entry); save();
    await work(s.id, 'create', { approvedTimer: timed }); entry.beforeJoin = await request('providerGet', { id: s.id });
    if (timed) assert.equal(entry.beforeJoin.limits.max_duration_seconds, 60);
    run(8, `select public.rpc_connect_act(${q(s.id)},'accept',${get(s.id).version},${q(devices[1])})`);
    entry.acceptedState = get(s.id).state;
    let handles = await Promise.all(devices.map((device, index) => request('credentials', { id: s.id, user: user(index + 7), device })));
    if (delay) await pause(delay);
    entry.firstCoordinatorJoinAt = new Date().toISOString();
    entry.joins = await Promise.all(handles.map((item) => request('join', item))); assert.ok(entry.joins.every((row) => row.status === 201));
    entry.afterCoordinatorJoin = await request('providerGet', { id: s.id });
    handles = await receiveControl(entry, handles); entry.afterMedia = await request('providerGet', { id: s.id });
    entry.activeExtensionAttempts = await Promise.all(['extend', 'disableTimer'].map((action) => request('boundaryProbe', { ...handles[0], action })));
    assert.ok(entry.activeExtensionAttempts.every((row) => row.status === 403 && row.code === 17));
    entry.afterExtensionAttempts = await request('providerGet', { id: s.id });
    if (timed) assert.equal(entry.afterExtensionAttempts.limits.max_duration_seconds, 60);
    return { entry, handles };
  };
  const afterEnd = async (entry, handles) => {
    entry.heldTokenValidity = await Promise.all(handles.map((item) => request('boundaryProbe', { ...item, action: 'read' })));
    entry.heldRejoins = await Promise.all(handles.map((item) => request('join', item)));
    const fresh = await Promise.all(handles.map((item, index) => request('boundaryMint', { id: entry.id, user: user(index + 7), held: item.handle })));
    assert.ok(fresh.every((item) => item.distinctFromHeld));
    entry.newTokenValidity = await Promise.all(fresh.map((item) => request('boundaryProbe', { ...item, action: 'read' })));
    assert.ok(entry.newTokenValidity.every((row) => row.status === 200));
    entry.newTokenRejoins = await Promise.all(fresh.map((item) => request('join', item)));
    assert.ok(entry.newTokenRejoins.every((row) => row.status === 403 && row.code === 17));
    for (let n = 0; n < handles.length; n++) if (entry.heldTokenValidity[n].status === 200) {
      assert.equal(entry.heldRejoins[n].status, 403); assert.equal(entry.heldRejoins[n].code, 17);
    }
    entry.extensionAttempts = await Promise.all(['extend', 'disableTimer'].map((action) => request('boundaryProbe', { ...fresh[0], action })));
    assert.ok(entry.extensionAttempts.every((row) => row.status === 403 && row.code === 17));
    entry.recreateAttempt = await request('boundaryProbe', { ...fresh[0], action: 'recreate' });
    entry.providerAfterAttempts = await request('providerGet', { id: entry.id }); assert.equal(entry.providerAfterAttempts.ended, true);
    service(`select jsonb_build_object('ignored',public.rpc_connect_reconcile_media(${q(entry.id)},${q(entry.afterMedia.session.id)},array[${q(user(7))},${q(user(8))}]::uuid[],false))`);
    assert.equal(get(entry.id).state, 'ENDED'); save();
  };
  const revoke = async (entry) => {
    entry.revokeStartedAt = new Date().toISOString(); entry.revoke = await request('revoke', { grant: entry.grant, outage: true });
    entry.revocationObservedAt = new Date().toISOString(); assert.equal(entry.revoke.providerCleanup, 'pending');
    assert.equal(get(entry.id).state, 'ENDED');
    await assert.rejects(request('credentials', { id: entry.id, user: user(7), device: entry.devices[0] }));
    entry.freshBackendCredentialsDenied = true;
    entry.pendingJob = JSON.parse(sql(`select jsonb_build_object('status',status,'attempts',attempts) from private.connect_provider_jobs where call_id=${q(entry.id)} and operation='end'`));
    entry.heldJoinAfterRevoke = await request('join', { handle: entry.handles[0].handle });
    entry.providerAfterRevoke = await request('providerGet', { id: entry.id }); save();
  };
  const recover = async (entry) => {
    sql(`update private.connect_provider_jobs set available_at=clock_timestamp() where call_id=${q(entry.id)} and operation='end'`);
    await work(entry.id, 'end', { outage: false });
    assert.equal(sql(`select count(*) from private.connect_occupancy where call_id=${q(entry.id)}`), '0');
    entry.cleanupJobAcknowledged = true;
  };
  try {
    await fixture.ready; setup = true;
    report.identity = await request('setup', { users: [user(7), user(8), user(9)], boundary: true });
    // 1. Normal authoritative end: retain non-cooperative raw peers for receive measurements.
    let { entry, handles } = await begin('normal_end', false); entry.handles = handles;
    const current = get(entry.id); run(7, `select public.rpc_connect_act(${q(entry.id)},'end',${current.version},${q(entry.devices[0])})`);
    await recover(entry); entry.normalEndAckAt = new Date().toISOString();
    entry.receiveAfterEnd = [];
    for (let n = 0; n < 5; n++) { entry.receiveAfterEnd.push({ sampledAt: new Date().toISOString(), stats: await stats(handles) }); await pause(1000); }
    await afterEnd(entry, handles); await closeMedia(handles);
    // 2. Timer expiry while only the backend end operation fails.
    ({ entry, handles } = await begin('active_timer_with_end_failure', true)); entry.handles = handles;
    await revoke(entry); entry.timerSamples = [];
    const deadline = Date.parse(entry.afterMedia.session.timerEndsAt); assert.ok(Number.isFinite(deadline));
    for (let n = 0; n < 50; n++) {
      const provider = await request('providerGet', { id: entry.id });
      entry.timerSamples.push({ sampledAt: new Date().toISOString(), provider, stats: await stats(handles) }); save();
      if (provider.ended && Date.now() > deadline + 5000) break;
      if (Date.now() > deadline + 20000) break;
      if (n % 5 === 0) console.log(JSON.stringify({ phase: entry.name, timerEndsAt: entry.afterMedia.session.timerEndsAt, ended: provider.ended }));
      await pause(2000);
    }
    entry.timerEndedBeforeRecovery = (await request('providerGet', { id: entry.id })).ended;
    await recover(entry); await afterEnd(entry, handles); await closeMedia(handles);
    // 3. Delayed first join, then empty-session/rejoin before the original deadline.
    ({ entry, handles } = await begin('delayed_join_empty_session_restart', true, 10000)); entry.handles = handles;
    await revoke(entry); const initialDeadline = Date.parse(entry.afterMedia.session.timerEndsAt);
    await closeMedia(handles); entry.closedMediaAt = new Date().toISOString();
    for (let n = 0; n < 45; n++) {
      entry.emptySession = await request('providerGet', { id: entry.id });
      if (entry.emptySession.sessionEnded || entry.emptySession.ended || Date.now() > initialDeadline - 7000) break;
      if (n % 5 === 0) console.log(JSON.stringify({ phase: entry.name, waitingForEmptySession: true }));
      await pause(1000);
    }
    entry.restartJoin = await Promise.all(handles.map((item) => request('join', item)));
    entry.afterRestartJoin = await request('providerGet', { id: entry.id });
    if (entry.restartJoin.every((row) => row.status === 201)) {
      entry.restartMedia = await Promise.all(handles.map((item) => request('mediaOpen', item)));
      entry.afterRestartMedia = await request('providerGet', { id: entry.id });
      const restarted = entry.restartMedia.every((row) => row.joinAcknowledged && row.audioStats?.bytesSent > 0)
        && Number.isFinite(Date.parse(entry.afterRestartMedia.session?.timerEndsAt));
      entry.timerResetObserved = restarted ? Date.parse(entry.afterRestartMedia.session.timerEndsAt) > initialDeadline + 1000 : null;
      if (!restarted) {
        entry.restartVerification = 'INCONCLUSIVE_SFU_RECONNECT_NOT_ESTABLISHED';
      } else {
        entry.restartSubscriptions = await Promise.all(handles.map((item, index) => request('mediaSubscribe', {
          ...item, user: user(index === 0 ? 8 : 7), session: entry.restartMedia[index === 0 ? 1 : 0].sessionId,
        })));
        entry.restartReceiveSamples = [];
        for (let n = 0; n < 12; n++) {
          const sample = await stats(handles); entry.restartReceiveSamples.push({ sampledAt: new Date().toISOString(), stats: sample });
          if (sample.every((row) => row.receivedAudio?.bytesReceived > 0)) break;
          await pause(500);
        }
        while (Date.now() < initialDeadline + 5000) await pause(1000);
        entry.afterOriginalDeadline = { provider: await request('providerGet', { id: entry.id }), stats: await stats(handles) };
      }
    }
    await recover(entry); await afterEnd(entry, handles); await closeMedia(handles);
    for (const row of report.calls) delete row.handles;
    report.result = 'OBSERVATIONS_RECORDED_POLICY_NOT_APPROVED';
  } catch (error) { report.result = 'INCOMPLETE'; report.error = error.message; throw error; }
  finally {
    try { if (setup) report.cleanup = await request('cleanup'); }
    finally { await fixture.close(); save(); console.log(JSON.stringify({ result: report.result, calls: report.calls.length, cleanup: report.cleanup })); }
    assert.equal(report.cleanup?.cleaned, true); assert.equal(report.cleanup.unchangedCallTypes, true);
  }
}).catch((error) => { console.error(error.stderr ? 'disposable_database_operation_failed' : error.message); process.exitCode = 1; });
