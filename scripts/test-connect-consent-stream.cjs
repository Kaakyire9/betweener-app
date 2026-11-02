// Actual disposable Postgres + actual staging Stream adapter/worker. No shared DB writes.
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const { mkdirSync, writeFileSync } = require('node:fs');
const readline = require('node:readline');
const { withConnectDatabase } = require('./lib/connect-test-database.cjs');
const user = (n) => `f0110000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const profile = (n) => `f0120000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const q = (s) => s === null ? 'null' : `'${String(s).replaceAll("'", "''")}'`;
const parse = (s) => JSON.parse(s.split(/\r?\n/).findLast((line) => /^(\{|\[|null$|true$|false$)/.test(line)));
const auth = (n, query) => `begin;set local role authenticated;select set_config('request.jwt.claim.sub',${q(user(n))},true);select set_config('request.jwt.claim.role','authenticated',true);${query};commit;`;
const report = { date: new Date().toISOString(), scope: 'DISPOSABLE_DB_AND_STREAM_1731011', checks: [], provider: [], sharedDatabaseModified: false };
const passed = (name) => { report.checks.push(name); console.log(`ok ${report.checks.length} - ${name}`); };
withConnectDatabase(async ({ sql, concurrent, file, http }) => {
  sql(file('supabase/tests/fixtures/connect_v1.sql'));
  sql("update private.connect_config set environment='local',enabled=true,provider_ready=true,voice_enabled=true,video_enabled=false,pre_match_enabled=true");
  const run = (n, query) => sql(auth(n, query));
  const get = (id) => parse(run(7, `select public.rpc_connect_get_call(${q(id)})`));
  const service = (query) => parse(sql(`begin;set local role service_role;${query};commit;`));
  const claim = () => service('select public.rpc_connect_claim_job()');
  const snapshot = (id) => service(`select public.rpc_connect_worker_snapshot(${q(id)})`);
  const create = (grant, device = randomUUID()) => ({ session: parse(run(7, `select public.rpc_connect_create_call(${q(profile(8))},'voice','pre_match',${q(randomUUID())},${q(device)},${q(grant)})`)), device });
  const grant = () => {
    const intent = randomUUID();
    sql(`update public.intent_requests set status='expired' where actor_id=${q(profile(7))} and recipient_id=${q(profile(8))} and type='connect' and status='pending'`);
    sql(`insert into public.intent_requests(id,actor_id,recipient_id,type,status,expires_at) values(${q(intent)},${q(profile(7))},${q(profile(8))},'connect','pending',clock_timestamp()+interval '1 hour')`);
    const id = run(7, `select public.rpc_connect_request_grant(${q(intent)},true,false)`).split(/\r?\n/).findLast((line) => /^[0-9a-f-]{36}$/.test(line));
    run(8, `select public.rpc_connect_decide_grant(${q(id)},true,false)`); return id;
  };
  const deny = (n, query) => {
    if (query.includes('public.rpc_connect_admission(')) assert.equal(parse(run(n, query)).admitted, false);
    else assert.throws(() => run(n, query), /Command failed/);
  };
  const child = spawn('cmd.exe', ['/d', '/c', 'npm.cmd exec --yes --package=deno@2.5.4 -- deno run --no-config --no-lock --node-modules-dir=none --allow-read=.env.stream-audit.local --allow-write=tmp/connect-m2a --allow-net=chat.stream-io-api.com,video.stream-io-api.com --allow-env --allow-run=node scripts/lib/connect-stream-closure-worker.ts'], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
  let sequence = 0; let ready; let rejectReady; let onCreated; let setup = false;
  const pending = new Map(); const readyPromise = new Promise((resolve, reject) => { ready = resolve; rejectReady = reject; });
  const readyTimeout = setTimeout(() => rejectReady(new Error('provider_fixture_start_timeout')), 30000);
  child.stderr.resume();
  const send = (message) => child.stdin.write(JSON.stringify(message) + '\n');
  const request = (op, args = {}) => new Promise((resolve, reject) => { const id = ++sequence; pending.set(id, { resolve, reject }); send({ id, op, args }); });
  child.on('exit', (code) => { clearTimeout(readyTimeout); rejectReady(new Error('provider_fixture_process_closed')); if (code) for (const entry of pending.values()) entry.reject(new Error('provider_fixture_process_failed')); });
  readline.createInterface({ input: child.stdout }).on('line', async (line) => {
    if (!line.startsWith('{')) return;
    const item = JSON.parse(line);
    if (item.event === 'ready') { clearTimeout(readyTimeout); ready(); }
    else if (item.event === 'created_before_database_ack') onCreated?.();
    else if (item.rpc) {
      try {
        const a = item.args; let data;
        if (item.name === 'snapshot') data = snapshot(a.id);
        else if (item.name === 'complete') data = service(`select jsonb_build_object('ack',public.rpc_connect_complete_job(${q(a.job.call_id)},${q(a.job.operation)},${q(a.job.lease)},${a.success}))`);
        else if (item.name === 'reconcile') data = service(`select jsonb_build_object('ack',public.rpc_connect_reconcile_media(${q(a.id)},${q(a.evidence.session)},array[${a.evidence.users.map(q).join(',')}]::uuid[],${a.evidence.ended}))`);
        else if (item.name === 'revoke') data = parse(run(8, `select public.rpc_connect_revoke_consent(${q(a.grant)})`));
        else if (item.name === 'claimEnd') data = service(`select public.rpc_connect_claim_end(${q(a.id)})`);
        else if (item.name === 'admission') data = parse(run(a.user === user(7) ? 7 : 8, `select public.rpc_connect_admission(${q(a.id)},${q(a.device)})`));
        else throw new Error('unknown_rpc');
        send({ rpcResult: item.rpc, data });
      } catch { send({ rpcResult: item.rpc, error: true }); }
    } else if (item.id) {
      const entry = pending.get(item.id); pending.delete(item.id);
      if (item.error) entry.reject(new Error(JSON.stringify(item.error))); else entry.resolve(item.data);
    }
  });
  const endJob = async (id) => {
    const job = service(`select public.rpc_connect_claim_end(${q(id)})`);
    assert.ok(job); assert.equal((await request('job', { job })).success, true);
  };
  const claimFor = async (id, operation) => {
    for (let n = 0; n < 16; n++) {
      const job = claim();
      if (job.call_id === id && job.operation === operation) return job;
      assert.equal((await request('job', { job })).success, true);
    }
    throw new Error('expected_job_not_found');
  };
  const begin = async (id) => { const job = await claimFor(id, 'create'); assert.equal((await request('job', { job })).success, true); };
  const accept = (id, device) => parse(run(8, `select public.rpc_connect_act(${q(id)},'accept',${get(id).version},${q(device)})`));
  const creds = (id, n, device) => request('credentials', { id, user: user(n), device });
  const join = async (handle, name) => { const response = await request('join', { handle }); report.provider.push({ name, ...response }); return response; };
  try {
    await readyPromise; report.identity = await request('setup', { users: [user(7), user(8), user(9)] }); setup = true;
    // 1. A real provider create returns while revocation wins before the DB ACK.
    let g = grant(); let { session: s } = create(g); const creation = new Promise((resolve) => { onCreated = resolve; });
    const creating = request('job', { job: claim(), pauseCreate: true }); await creation;
    run(8, `select public.rpc_connect_revoke_grant(${q(g)})`);
    assert.equal(get(s.id).state, 'ENDED'); send({ op: 'resume' }); await creating;
    assert.equal((await request('providerGet', { id: s.id })).ended, true); await endJob(s.id);
    assert.equal(sql(`select count(*) from private.connect_occupancy where call_id=${q(s.id)}`), '0'); passed('real provider create versus revoke compensates and retains fenced cleanup');
    deny(7, `select public.rpc_connect_create_call(${q(profile(8))},'voice','pre_match',${q(randomUUID())},${q(randomUUID())},${q(g)})`); passed('revocation before a fresh call denies creation');
    // 2. Separate database connections race acceptance and revocation while ringing.
    g = grant(); ({ session: s } = create(g)); await begin(s.id); const version = get(s.id).version;
    const raced = await Promise.allSettled([
      concurrent(auth(8, `select public.rpc_connect_act(${q(s.id)},'accept',${version},${q(randomUUID())})`)),
      concurrent(auth(8, `select public.rpc_connect_revoke_grant(${q(g)})`)),
    ]);
    assert.equal(raced[1].status, 'fulfilled'); assert.equal(get(s.id).state, 'ENDED');
    await endJob(s.id); passed('ringing acceptance versus revocation serializes to terminal state');
    const duplicate = parse(run(8, `select public.rpc_connect_revoke_consent(${q(g)})`)); assert.equal(duplicate.pending_count, 0); passed('duplicate revocation after cleanup is idempotent');
    // 3. Both real SFU sessions, actual adapter + actual DB reconcile, immediate revoke path.
    g = grant(); let deviceA; ({ session: s, device: deviceA } = create(g)); await begin(s.id); const deviceB = randomUUID(); accept(s.id, deviceB);
    const a = await creds(s.id, 7, deviceA); const b = await creds(s.id, 8, deviceB);
    assert.equal((await join(a.handle, 'active_a_before_revoke')).status, 201); assert.equal((await join(b.handle, 'active_b_before_revoke')).status, 201);
    report.activeMediaA = await request('mediaOpen', { handle: a.handle }); report.activeMediaB = await request('mediaOpen', { handle: b.handle });
    const mediaSnapshot = await request('providerGet', { id: s.id }); report.activeProvider = mediaSnapshot;
    if (mediaSnapshot.users.includes(user(7)) && mediaSnapshot.users.includes(user(8))) {
      const live = snapshot(s.id);
      // The sync worker, rather than test-authored participant evidence, certifies ACTIVE.
      sql(`select public.rpc_connect_enqueue_sync(${q(s.id)},${q('b'.repeat(64))})`);
      const sync = await claimFor(live.id, 'sync'); await request('job', { job: sync });
      report.reconciledStateBeforeRevoke = get(s.id).state;
    }
    const revokedAt = Date.now(); const revoked = await request('revoke', { grant: g }); report.fastRevoke = { ...revoked, elapsedMs: Date.now() - revokedAt };
    assert.equal(revoked.providerCleanup, 'complete'); assert.equal(get(s.id).state, 'ENDED');
    assert.equal((await join(a.handle, 'held_a_after_fast_revoke')).status, 403); assert.equal((await join(b.handle, 'held_b_after_fast_revoke')).status, 403);
    for (let n = 0; n < 12; n++) {
      report.endedMediaA = await request('mediaStats', { handle: a.handle }); report.endedMediaB = await request('mediaStats', { handle: b.handle });
      if (report.endedMediaA.callEndedObserved && report.endedMediaB.callEndedObserved) break;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    passed('actual database revoke and provider worker end ACK deny both held identities');
    await request('mediaClose', { handle: a.handle }); await request('mediaClose', { handle: b.handle });
    deny(8, `select public.rpc_connect_admission(${q(s.id)},${q(randomUUID())})`); passed('another device cannot obtain fresh admission after revoke');
    service(`select jsonb_build_object('ignored',public.rpc_connect_reconcile_media(${q(s.id)},'late',array[${q(user(7))},${q(user(8))}]::uuid[],false))`);
    assert.equal(get(s.id).state, 'ENDED'); passed('late trusted provider evidence cannot resurrect a revoked session');
    // 4. Inject failure at the real worker's end port. Authority commits, retry stays durable.
    g = grant(); ({ session: s, device: deviceA } = create(g)); await begin(s.id); accept(s.id, randomUUID());
    const held = await creds(s.id, 7, deviceA); assert.equal((await join(held.handle, 'outage_before_revoke')).status, 201);
    const outage = await request('revoke', { grant: g, outage: true }); assert.equal(outage.providerCleanup, 'pending');
    assert.equal(get(s.id).state, 'ENDED'); assert.equal(sql(`select count(*) from private.connect_occupancy where call_id=${q(s.id)}`), '2');
    report.outageJoin = await join(held.handle, 'held_join_after_database_revoke_during_outage');
    if (report.outageJoin.status === 201) report.outageMedia = await request('mediaOpen', { handle: held.handle });
    const response = await http(user(7), 'rpc/rpc_connect_create_call', { p_peer: profile(8), p_media: 'voice', p_authorization: 'pre_match', p_key: randomUUID(), p_device: randomUUID(), p_grant: g });
    assert.equal(response.ok, false); passed('provider outage retains retry/occupancy and denies fresh backend creation');
    run(8, `insert into public.blocks(blocker_id,blocked_id) values(${q(user(8))},${q(user(7))})`);
    deny(7, `select public.rpc_connect_admission(${q(s.id)},${q(deviceA)})`); passed('block overrides revoked consent during pending provider cleanup');
    sql(`update private.connect_provider_jobs set available_at=clock_timestamp() where call_id=${q(s.id)} and operation='end'`);
    await endJob(s.id); assert.equal((await join(held.handle, 'held_join_after_outage_recovery')).status, 403);
    if (report.outageMedia) { report.outageEndedMedia = await request('mediaStats', { handle: held.handle }); await request('mediaClose', { handle: held.handle }); }
    assert.equal(sql(`select count(*) from private.connect_occupancy where call_id=${q(s.id)}`), '0'); passed('durable retry performs real provider cleanup after recovery');
    report.consentGate = report.outageJoin.status === 201 ? 'BLOCKED_HELD_TOKEN_WINDOW_PROVEN' : 'REQUIRES_REVIEW';
  } finally {
    if (setup) report.cleanup = await request('cleanup');
    child.stdin.end(); await new Promise((resolve) => child.once('exit', resolve));
    mkdirSync('tmp/connect-m2a', { recursive: true }); writeFileSync('tmp/connect-m2a/integrated-results.json', JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ checks: report.checks.length, consentGate: report.consentGate, cleanup: report.cleanup }));
    if (!report.cleanup?.cleaned || report.cleanup.unchangedCallTypes !== true) process.exitCode = 1;
    else if (report.consentGate === 'BLOCKED_HELD_TOKEN_WINDOW_PROVEN') process.exitCode = 2;
  }
}).catch((error) => { console.error(error.stderr ? String(error.stderr).slice(0, 1200) : error.message); process.exitCode = 1; });
