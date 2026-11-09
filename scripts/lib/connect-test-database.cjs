/* global __dirname */
// Disposable local schema clone. Never loads .env or retargets the app REST API.
const { createDockerRunner, cleanupResources, SQL_TIMEOUT_MS } = require('./connect-test-runtime.cjs');
const { readFileSync } = require('node:fs');
const { randomBytes, createHmac } = require('node:crypto');
const { Buffer } = require('node:buffer');
const path = require('node:path');
const container = 'supabase_db_betweener-app';
const root = path.resolve(__dirname, '../..');
const { sync: docker, concurrent: concurrentDocker } = createDockerRunner();
const file = (name) => readFileSync(path.join(root, name), 'utf8');
async function withConnectDatabase(run, options = {}) {
  const suffix = `${process.pid}_${randomBytes(8).toString('hex')}`;
  const db = `betweener_connect_security_test_${suffix}`;
  const rest = `betweener-connect-security-rest-${suffix}`;
  if (!/^betweener_connect_security_test_\d+_[a-f0-9]{16}$/.test(db)) throw new Error('invalid_test_target');
  let databaseAttempted = false; let restAttempted = false; let runFailure;
  const args = ['exec', '-i', '-e', 'PGOPTIONS=-c statement_timeout=90000 -c lock_timeout=5000', container, 'psql', '-U', 'postgres', '-d', db, '-X', '-v', 'ON_ERROR_STOP=1', '-A', '-t'];
  const sql = (input) => docker(args, { input, timeout: SQL_TIMEOUT_MS }).trim();
  const concurrent = (input) => concurrentDocker(args, input);
  try {
    if (docker(['inspect', '--format', '{{.State.Health.Status}}', container]).trim() !== 'healthy') {
      throw new Error('Local Supabase database is unhealthy; preserve its volume and repair Docker before testing.');
    }
    if (docker(['exec', container, 'psql', '-U', 'postgres', '-d', 'postgres', '-Atc', "select to_regclass('private.relationship_acceptance_proofs') is not null or to_regclass('private.connect_sessions') is not null"]).trim() !== 'f') {
      throw new Error('Use the unpatched local schema baseline; never remove app security to satisfy tests.');
    }
    // Track attempts before awaiting acknowledgement: a timed-out client may have created the resource.
    databaseAttempted = true;
    docker(['exec', container, 'createdb', '-U', 'postgres', '-T', 'template0', db]);
    const schema = docker(['exec', container, 'pg_dump', '-U', 'postgres', '-d', 'postgres', '--schema-only', '--lock-wait-timeout=5s',
      '--exclude-extension=pg_cron', '--exclude-schema=cron', '--exclude-extension=pg_graphql', '--exclude-schema=graphql',
      '--exclude-schema=graphql_public', '--no-publications', '--no-subscriptions']);
    const config = JSON.parse(docker(['inspect', container]))[0];
    const password = config.Config.Env.find((s) => s.startsWith('POSTGRES_PASSWORD=')).slice('POSTGRES_PASSWORD='.length);
    docker(['exec', '-i', '-e', `PGPASSWORD=${password}`, '-e', 'PGOPTIONS=-c statement_timeout=90000 -c lock_timeout=5000', container, 'psql', '-U', 'supabase_admin', '-d', db, '-X', '--single-transaction', '-v', 'ON_ERROR_STOP=1'], { input: schema, timeout: SQL_TIMEOUT_MS });
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
    restAttempted = true;
    docker(['run', '-d', '--pull=never', '--name', rest, '--network', Object.keys(source.NetworkSettings.Networks)[0], '-p', '127.0.0.1::3000',
      '-e', `PGRST_DB_URI=${uri}`, '-e', 'PGRST_DB_SCHEMAS=public', '-e', 'PGRST_DB_ANON_ROLE=anon', '-e', `PGRST_JWT_SECRET=${secret}`, source.Config.Image]);
    const port = JSON.parse(docker(['inspect', rest]))[0].NetworkSettings.Ports['3000/tcp'][0].HostPort;
    const origin = `http://127.0.0.1:${port}`;
    for (let n = 0; ; n++) {
      try { if ((await fetch(origin, { signal: AbortSignal.timeout(1000) })).ok) break; } catch { /* startup */ }
      if (n > 30) throw new Error('isolated_rest_not_ready');
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    const http = (user, route, body, method = 'POST') => {
      const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
      const payload = Buffer.from(JSON.stringify({ role: 'authenticated', sub: user, exp: Math.floor(Date.now() / 1000) + 300 })).toString('base64url');
      const value = `${header}.${payload}`;
      const token = `${value}.${createHmac('sha256', secret).update(value).digest('base64url')}`;
      return fetch(`${origin}/${route}`, { method, signal: AbortSignal.timeout(15_000), headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    };
    await run({ sql, concurrent, http, file });
  } catch (error) {
    runFailure = error;
    throw error;
  } finally {
    const actions = [];
    if (restAttempted) actions.push(['rest', () => {
      // Removing an absent container is a successful cleanup after an uncertain create acknowledgement.
      if (docker(['ps', '-aq', '--filter', `name=^/${rest}$`]).trim()) docker(['rm', '-f', rest]);
    }]);
    if (databaseAttempted) actions.push(['database', () => docker(['exec', container, 'dropdb', '-U', 'postgres', '--if-exists', '--force', db])]);
    const cleanup = cleanupResources(actions);
    console.log(JSON.stringify({
      disposableConnectDatabaseRemoved: cleanup.removed.database ?? false,
      disposableRestRemoved: cleanup.removed.rest ?? false,
      sharedAppDatabaseModified: false,
      cleanupFailures: cleanup.errors.length,
    }));
    if (cleanup.errors.length) throw new AggregateError(
      [...(runFailure ? [runFailure] : []), ...cleanup.errors],
      'Disposable Connect cleanup incomplete; inspect only the named test resources before retrying.',
    );
  }
}
module.exports = { withConnectDatabase };
