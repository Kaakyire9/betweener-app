/* global __dirname */
/* Local-only security integration runner. Never reads project .env credentials. */
const assert = require('node:assert/strict');
const { execFileSync, spawn } = require('node:child_process');
const { readFileSync, mkdirSync, writeFileSync } = require('node:fs');
const { createHmac, randomBytes } = require('node:crypto');
const { Buffer } = require('node:buffer');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const dbContainer = 'supabase_db_betweener-app';
const db = `betweener_relationship_security_test_${process.pid}`;
const restName = `betweener-relationship-security-rest-${process.pid}`;
const migration = 'supabase/migrations/20261028064220_relationship_acceptance_authority.sql';
const baseArgs = ['exec', '-i', dbContainer, 'psql', '-U', 'postgres', '-d', db, '-X', '-v', 'ON_ERROR_STOP=1', '-A', '-t'];
const docker = (args, options = {}) => execFileSync('docker', args, {
  encoding: 'utf8', windowsHide: true, maxBuffer: 128 * 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe'], ...options,
});
const sql = (input) => docker(baseArgs, { input });
const file = (name) => readFileSync(path.join(root, name), 'utf8');
const tap = (output, expected) => {
  if (/^not ok\b/m.test(output)) {
    throw new Error(output.split(/\r?\n/).filter((line) => /^(not ok|#)/.test(line)).join('\n'));
  }
  const count = [...output.matchAll(/^ok \d+\b/gm)].length;
  assert.equal(count, expected, output);
  return count;
};
const asUser = (n, command) => `begin; set local statement_timeout='20s'; set local lock_timeout='10s'; set local role authenticated;
  select set_config('request.jwt.claim.sub','d0110000-0000-4000-8000-${String(n).padStart(12, '0')}',true);
  select set_config('request.jwt.claim.role','authenticated',true); ${command}; commit;`;
const concurrentSql = (input) => new Promise((resolve, reject) => {
  const child = spawn('docker', baseArgs, { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
  let output = ''; let error = '';
  child.stdout.on('data', (chunk) => { output += chunk; });
  child.stderr.on('data', (chunk) => { error += chunk; });
  child.on('error', reject);
  child.on('close', (code) => code === 0 ? resolve(output) : reject(new Error(error)));
  child.stdin.end(input);
});
const jwt = (secret, sub) => {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ role: 'authenticated', sub, exp: Math.floor(Date.now() / 1000) + 300 })).toString('base64url');
  const signed = `${header}.${payload}`;
  return `${signed}.${createHmac('sha256', secret).update(signed).digest('base64url')}`;
};

(async () => {
  let created = false; let restCreated = false;
  try {
    assert.match(db, /^betweener_relationship_security_test_\d+$/);
    assert.match(restName, /^betweener-relationship-security-rest-\d+$/);
    const sourcePatched = docker(['exec', dbContainer, 'psql', '-U', 'postgres', '-d', 'postgres', '-X', '-A', '-t',
      '-c', "select to_regclass('private.relationship_acceptance_proofs') is not null"]);
    if (sourcePatched.trim() === 't') throw new Error('Use a pre-remediation local schema baseline for this migration-boundary rehearsal. Do not remove security from the app database.');
    docker(['exec', dbContainer, 'createdb', '-U', 'postgres', '-T', 'template0', db]);
    created = true;
    // Schema only: no real local users, messages, credentials or private rows
    // are copied. pg_cron is bound to the source database and is excluded.
    const schema = docker(['exec', dbContainer, 'pg_dump', '-U', 'postgres', '-d', 'postgres', '--schema-only', '--lock-wait-timeout=5s',
      '--exclude-extension=pg_cron', '--exclude-schema=cron', '--exclude-extension=pg_graphql', '--exclude-schema=graphql',
      '--exclude-schema=graphql_public', '--no-publications', '--no-subscriptions']);
    const dbConfig = JSON.parse(docker(['inspect', dbContainer]))[0];
    const localPassword = dbConfig.Config.Env.find((s) => s.startsWith('POSTGRES_PASSWORD=')).slice('POSTGRES_PASSWORD='.length);
    docker(['exec', '-i', '-e', `PGPASSWORD=${localPassword}`, dbContainer, 'psql', '-U', 'supabase_admin',
      '-d', db, '-X', '-v', 'ON_ERROR_STOP=1', '-A', '-t'], { input: schema });
    console.log(JSON.stringify({ phase: 'isolated_schema_restored' }));
    const before = tap(sql(file('supabase/verification/connect_v1_m0_relationship_authority_audit.sql')), 9);
    console.log(JSON.stringify({ originalVulnerabilityAssertions: before, meaning: 'vulnerability reproduced before repair' }));
    sql(file('supabase/tests/fixtures/relationship_acceptance_legacy.sql'));
    sql(file(migration));
    const testOutput = sql(file('supabase/tests/relationship_acceptance_authority.sql'));
    mkdirSync(path.join(root, 'tmp/relationship-security'), { recursive: true });
    writeFileSync(path.join(root, 'tmp/relationship-security/database-regression.log'), testOutput);
    const planned = Number(testOutput.match(/^1\.\.(\d+)$/m)?.[1]);
    const checks = tap(testOutput, planned);
    console.log(JSON.stringify({ relationshipSecurityAssertions: checks, failures: 0 }));

    // Fixtures for real separate-connection races and direct HTTP requests.
    sql(file('supabase/tests/fixtures/relationship_acceptance_races.sql'));
    await Promise.all([
      concurrentSql(asUser(1, "select public.rpc_decide_intent_request('d0140000-0000-4000-8000-000000000001','accept')")),
      concurrentSql(asUser(1, "select public.rpc_decide_intent_request('d0140000-0000-4000-8000-000000000001','accept')")),
    ]);
    assert.equal(sql("select count(*) from public.matches where user1_id='d0120000-0000-4000-8000-000000000001' and user2_id='d0120000-0000-4000-8000-000000000002';").trim(), '1');
    await Promise.all([
      concurrentSql(asUser(3, "select public.rpc_reconfirm_relationship('d0120000-0000-4000-8000-000000000004')")),
      concurrentSql(asUser(4, "select public.rpc_reconfirm_relationship('d0120000-0000-4000-8000-000000000003')")),
    ]);
    assert.match(sql(asUser(3, "select public.rpc_is_relationship_mutually_verified('d0120000-0000-4000-8000-000000000004')")), /^t$/m);
    await Promise.all([
      concurrentSql(asUser(5, "insert into public.swipes(swiper_id,target_id,action) values('d0120000-0000-4000-8000-000000000005','d0120000-0000-4000-8000-000000000006','LIKE')")),
      concurrentSql(asUser(6, "insert into public.swipes(swiper_id,target_id,action) values('d0120000-0000-4000-8000-000000000006','d0120000-0000-4000-8000-000000000005','LIKE')")),
    ]);
    assert.match(sql(asUser(5, "select public.rpc_is_relationship_mutually_verified('d0120000-0000-4000-8000-000000000006')")), /^t$/m);
    const blockedRace = await Promise.allSettled([
      concurrentSql(asUser(8, "select public.rpc_decide_intent_request('d0140000-0000-4000-8000-000000000002','accept')")),
      concurrentSql(asUser(7, "insert into public.blocks(blocker_id,blocked_id) values('d0110000-0000-4000-8000-000000000007','d0110000-0000-4000-8000-000000000008')")),
    ]);
    assert.equal(blockedRace[1].status, 'fulfilled');
    if (blockedRace[0].status === 'rejected') assert.match(blockedRace[0].reason.message, /relationship_unavailable/);
    assert.match(sql(asUser(8, "select public.rpc_is_relationship_mutually_verified('d0120000-0000-4000-8000-000000000007')")), /^f$/m);
    const decisionRace = await Promise.allSettled([
      concurrentSql(asUser(10, "select public.rpc_decide_intent_request('d0140000-0000-4000-8000-000000000003','accept')")),
      concurrentSql(asUser(10, "select public.rpc_decide_intent_request('d0140000-0000-4000-8000-000000000003','pass')")),
    ]);
    assert.equal(decisionRace.filter((x) => x.status === 'fulfilled').length, 1);
    for (const result of decisionRace) if (result.status === 'rejected') assert.match(result.reason.message, /intent_request_not_pending/);
    const cancelRace = await Promise.allSettled([
      concurrentSql(asUser(12, "select public.rpc_decide_intent_request('d0140000-0000-4000-8000-000000000004','accept')")),
      concurrentSql(asUser(11, "select public.rpc_cancel_intent_request('d0140000-0000-4000-8000-000000000004')")),
    ]);
    assert.equal(cancelRace.filter((x) => x.status === 'fulfilled').length, 1);
    for (const result of cancelRace) if (result.status === 'rejected') assert.match(result.reason.message, /intent_request_not_pending/);
    const finalStatus = sql("select status from public.intent_requests where id='d0140000-0000-4000-8000-000000000004'").trim();
    assert.ok(['accepted', 'cancelled'].includes(finalStatus));
    assert.match(sql(asUser(12, "select public.rpc_is_relationship_mutually_verified('d0120000-0000-4000-8000-000000000011')")), finalStatus === 'accepted' ? /^t$/m : /^f$/m);
    console.log(JSON.stringify({ separateConnectionConcurrencyCases: 6, failures: 0 }));

    // Reuse the installed local PostgREST image/network, with a random test-only
    // JWT key and the disposable DB. Never retarget the app's REST container.
    const sourceRest = JSON.parse(docker(['inspect', 'supabase_rest_betweener-app']))[0];
    const network = Object.keys(sourceRest.NetworkSettings.Networks)[0];
    const sourceUri = sourceRest.Config.Env.find((s) => s.startsWith('PGRST_DB_URI=')).slice('PGRST_DB_URI='.length);
    const uri = new URL(sourceUri); uri.pathname = `/${db}`;
    const secret = randomBytes(48).toString('hex');
    docker(['run', '-d', '--pull=never', '--name', restName, '--network', network, '-p', '127.0.0.1::3000',
      '-e', `PGRST_DB_URI=${uri.toString()}`, '-e', 'PGRST_DB_SCHEMAS=public',
      '-e', 'PGRST_DB_ANON_ROLE=anon', '-e', `PGRST_JWT_SECRET=${secret}`, sourceRest.Config.Image]);
    restCreated = true;
    const port = JSON.parse(docker(['inspect', restName]))[0].NetworkSettings.Ports['3000/tcp'][0].HostPort;
    const origin = `http://127.0.0.1:${port}`;
    for (let attempt = 0; ; attempt += 1) {
      try { const r = await fetch(origin); if (r.ok) break; } catch { /* readiness retry */ }
      if (attempt >= 30) throw new Error('local_test_rest_not_ready');
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    const token = jwt(secret, 'd0110000-0000-4000-8000-000000000003');
    const request = (route, method, body, extraHeaders = {}) => fetch(`${origin}/${route}`, {
      method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...extraHeaders }, body: JSON.stringify(body),
    });
    let r = await request('matches', 'POST', { user1_id: 'd0120000-0000-4000-8000-000000000003', user2_id: 'd0120000-0000-4000-8000-000000000005', status: 'ACCEPTED' });
    assert.equal(r.status, 403, 'direct HTTP insert must be denied');
    r = await request('matches?user1_id=eq.d0120000-0000-4000-8000-000000000003', 'PATCH', { status: 'ACCEPTED' });
    assert.equal(r.status, 403, 'direct HTTP promotion must be denied');
    r = await request('matches?on_conflict=user1_id,user2_id', 'POST', { user1_id: 'd0120000-0000-4000-8000-000000000003', user2_id: 'd0120000-0000-4000-8000-000000000005', status: 'ACCEPTED' }, { Prefer: 'resolution=merge-duplicates' });
    assert.equal(r.status, 403, 'direct HTTP upsert must be denied');
    r = await request('rpc/rpc_decide_intent_request', 'POST', { p_request_id: 'd0140000-0000-4000-8000-000000000001', p_decision: 'accept' });
    assert.equal(r.status, 403, 'forged HTTP recipient must be denied');
    console.log(JSON.stringify({ directHttpAdversarialCases: 4, failures: 0, endpoint: 'isolated_loopback_postgrest' }));
  } finally {
    if (restCreated) docker(['rm', '-f', restName]);
    if (created) docker(['exec', dbContainer, 'dropdb', '-U', 'postgres', '--if-exists', '--force', db]);
    console.log(JSON.stringify({ disposableDatabaseRemoved: created, disposableRestRemoved: restCreated, sharedAppDatabaseModified: false }));
  }
})().catch((error) => {
  // Never print docker command arguments (they can contain local DB credentials).
  console.error(error.stderr ? String(error.stderr).slice(0, 5000) : error.message);
  process.exitCode = 1;
});
