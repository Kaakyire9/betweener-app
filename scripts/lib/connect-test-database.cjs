/* global __dirname */
// Disposable local schema clone. Never loads .env or retargets the app REST API.
const { execFileSync, spawn } = require('node:child_process');
const { readFileSync } = require('node:fs');
const { randomBytes, createHmac } = require('node:crypto');
const { Buffer } = require('node:buffer');
const path = require('node:path');
const container = 'supabase_db_betweener-app';
const root = path.resolve(__dirname, '../..');
const docker = (args, options = {}) => execFileSync('docker', args, {
  encoding: 'utf8', windowsHide: true, maxBuffer: 128 * 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe'], ...options,
});
const file = (name) => readFileSync(path.join(root, name), 'utf8');
async function withConnectDatabase(run, options = {}) {
  const db = `betweener_connect_security_test_${process.pid}`;
  const rest = `betweener-connect-security-rest-${process.pid}`;
  if (!/^betweener_connect_security_test_\d+$/.test(db)) throw new Error('invalid_test_target');
  let created = false; let restCreated = false;
  const args = ['exec', '-i', container, 'psql', '-U', 'postgres', '-d', db, '-X', '-v', 'ON_ERROR_STOP=1', '-A', '-t'];
  const sql = (input) => docker(args, { input }).trim();
  const concurrent = (input) => new Promise((resolve, reject) => {
    const child = spawn('docker', args, { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    let output = ''; let error = '';
    child.stdout.on('data', (s) => { output += s; }); child.stderr.on('data', (s) => { error += s; });
    child.on('error', reject); child.on('close', (code) => code === 0 ? resolve(output) : reject(new Error(error)));
    child.stdin.end(input);
  });
  try {
    if (docker(['exec', container, 'psql', '-U', 'postgres', '-d', 'postgres', '-Atc', "select to_regclass('private.relationship_acceptance_proofs') is not null or to_regclass('private.connect_sessions') is not null"]).trim() !== 'f') {
      throw new Error('Use the unpatched local schema baseline; never remove app security to satisfy tests.');
    }
    docker(['exec', container, 'createdb', '-U', 'postgres', '-T', 'template0', db]); created = true;
    const schema = docker(['exec', container, 'pg_dump', '-U', 'postgres', '-d', 'postgres', '--schema-only', '--lock-wait-timeout=5s',
      '--exclude-extension=pg_cron', '--exclude-schema=cron', '--exclude-extension=pg_graphql', '--exclude-schema=graphql',
      '--exclude-schema=graphql_public', '--no-publications', '--no-subscriptions']);
    const config = JSON.parse(docker(['inspect', container]))[0];
    const password = config.Config.Env.find((s) => s.startsWith('POSTGRES_PASSWORD=')).slice('POSTGRES_PASSWORD='.length);
    docker(['exec', '-i', '-e', `PGPASSWORD=${password}`, container, 'psql', '-U', 'supabase_admin', '-d', db, '-X', '--single-transaction', '-v', 'ON_ERROR_STOP=1'], { input: schema });
    // Optional offline staging-shape preparation runs only inside this empty clone.
    await options.prepareBaseline?.({ sql, file });
    sql(file('supabase/tests/fixtures/relationship_acceptance_legacy.sql'));
    for (const migration of ['20261028064220_relationship_acceptance_authority', '20261028074908_connect_v1_foundation',
      '20261028143424_connect_m2a_revocation_cleanup', '20261029081013_connect_forensic_repair_1']) {
      const name = `supabase/migrations/${migration}.sql`;
      sql(file(name));
      await options.onMigrationApplied?.({ name, sql });
    }
    const relationship = sql(file('supabase/tests/relationship_acceptance_authority.sql'));
    if (/^not ok\b/m.test(relationship)) throw new Error(relationship.split(/\r?\n/).filter((line) => /^(not ok|#)/.test(line)).join('\n'));
    const relationshipAssertions = [...relationship.matchAll(/^ok \d+/gm)].length;
    if (relationshipAssertions !== 88) throw new Error('relationship_regression_assertion_count_changed');
    console.log(JSON.stringify({ earlierRelationshipAssertionsWithConnectInstalled: relationshipAssertions }));
    const source = JSON.parse(docker(['inspect', 'supabase_rest_betweener-app']))[0];
    const uri = new URL(source.Config.Env.find((s) => s.startsWith('PGRST_DB_URI=')).slice('PGRST_DB_URI='.length)); uri.pathname = `/${db}`;
    const secret = randomBytes(48).toString('hex');
    docker(['run', '-d', '--pull=never', '--name', rest, '--network', Object.keys(source.NetworkSettings.Networks)[0], '-p', '127.0.0.1::3000',
      '-e', `PGRST_DB_URI=${uri}`, '-e', 'PGRST_DB_SCHEMAS=public', '-e', 'PGRST_DB_ANON_ROLE=anon', '-e', `PGRST_JWT_SECRET=${secret}`, source.Config.Image]); restCreated = true;
    const port = JSON.parse(docker(['inspect', rest]))[0].NetworkSettings.Ports['3000/tcp'][0].HostPort;
    const origin = `http://127.0.0.1:${port}`;
    for (let n = 0; ; n++) {
      try { if ((await fetch(origin)).ok) break; } catch { /* startup */ }
      if (n > 30) throw new Error('isolated_rest_not_ready');
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    const http = (user, route, body, method = 'POST') => {
      const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
      const payload = Buffer.from(JSON.stringify({ role: 'authenticated', sub: user, exp: Math.floor(Date.now() / 1000) + 300 })).toString('base64url');
      const value = `${header}.${payload}`;
      const token = `${value}.${createHmac('sha256', secret).update(value).digest('base64url')}`;
      return fetch(`${origin}/${route}`, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    };
    await run({ sql, concurrent, http, file });
  } finally {
    if (restCreated) docker(['rm', '-f', rest]);
    if (created) docker(['exec', container, 'dropdb', '-U', 'postgres', '--if-exists', '--force', db]);
    console.log(JSON.stringify({ disposableConnectDatabaseRemoved: created, disposableRestRemoved: restCreated, sharedAppDatabaseModified: false }));
  }
}
module.exports = { withConnectDatabase };
