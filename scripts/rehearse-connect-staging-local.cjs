/* global __dirname */
// Offline rehearsal in the existing disposable clone/loopback REST helper only.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
const { withConnectDatabase } = require('./lib/connect-test-database.cjs');
const root = path.resolve(__dirname, '..'), dir = path.join(root, 'tmp/connect-staging-preparation-46');
fs.mkdirSync(dir, { recursive: true });
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const proposal = JSON.parse(read('docs/betweener-connect/connect-v1-m3-3-staging-deployment-package.json'));
const measured = JSON.parse(read('tmp/connect-m3-2-inspection-45/shared-readiness.json')).data;
const legacy = JSON.parse(read('tmp/connect-m3-2-inspection-45/relationship-catalog.json')).rows;
const q = v => `'${String(v).replaceAll("'", "''")}'`;
const scalar = s => s.split(/\r?\n/).filter(x => x && !['BEGIN', 'SET', 'COMMIT'].includes(x)).at(-1);
const user = n => `f0110000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const profile = n => `f0120000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const outcome = { scope: 'LOCAL_DISPOSABLE_ONLY', hosted: false, provider: false, actualStagingClone: false,
  baselineReconstruction: [], baselineDifferences: [], applied: [], checks: [], externalPush: 'DISABLED_TEST_DOUBLE', relationshipAssertions: 88 };
let initialFunctions;
const catalog = sql => JSON.parse(sql(`select coalesce(json_agg(json_build_object('schema',n.nspname,'name',p.proname,
  'args',pg_get_function_identity_arguments(p.oid),'md5',md5(pg_get_functiondef(p.oid))) order by n.nspname,p.proname,p.oid),'[]')
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in('public','private') and p.prokind='f'`));
const key = f => `${f.schema}.${f.name}(${f.args})`;
async function prepareBaseline({ sql, file }) {
  // These are BASELINE reconstruction, not the six-file deployment delta.
  // Never replay them against hosted staging; Report 45 confirms they are applied there.
  const install = name => { sql(file(`supabase/migrations/${name}.sql`)); outcome.baselineReconstruction.push(name); };
  if (sql("select to_regclass('public.live_notification_campaigns') is not null") === 'f') install('20260913200000_live_notification_campaigns');
  if (sql("select to_regclass('private.push_notification_events') is not null") === 'f') {
    for (const name of ['20260914123000_push_notification_event_security', '20260914124000_push_notification_delivery_reservations',
      '20260914125000_push_notification_dispatch_reliability', '20260914126000_push_notification_atomic_rate_limits', '20260914127000_push_notification_expiry_lifecycle']) install(name);
  }
  // Nonsecret synthetic configuration; no rows/users/keys are copied from staging.
  sql("insert into private.push_config(id,webhook_url) values(1,'https://xsgzxadwuxuziubglvps.supabase.co/functions/v1/push-notifications') on conflict(id) do update set webhook_url=excluded.webhook_url");
  if (sql("select exists(select 1 from information_schema.columns where table_schema='public' and table_name='push_tokens' and column_name='installation_id')") === 'f') install('20261006150000_push_environment_provenance_hardening');
  install('20261006170000_update_staging_push_eas_project_identity');
  // Restore an existing baseline routine from its retained SQL definition only
  // when the local dump differs. It is not a deployment migration/replay.
  const reservationName = 'rpc_service_reserve_push_notification_deliveries_v1';
  const expectedReservation = measured.pushFunctions.find(f => f.name === reservationName);
  const originalReservation = catalog(sql).find(f => f.name === reservationName && f.schema === 'public');
  if (originalReservation?.md5 !== expectedReservation.definitionMd5) {
    const baselineSource = 'supabase/migrations/20260914124000_push_notification_delivery_reservations.sql';
    const definition = file(baselineSource).match(/create or replace function public\.rpc_service_reserve_push_notification_deliveries_v1\([\s\S]*?\n\$\$;/i)?.[0];
    assert.ok(definition, 'Retained reservation definition missing');
    sql(definition);
    outcome.baselineRestoredDefinitions = [{ name: `public.${reservationName}`, source: baselineSource,
      sourceSha256: createHash('sha256').update(file(baselineSource)).digest('hex'), originalLocalMd5: originalReservation?.md5 ?? null }];
  }
  const actual = catalog(sql);
  for (const expected of [...measured.pushFunctions, ...legacy]) {
    const got = actual.find(f => f.schema === expected.schema && f.name === expected.name);
    const wanted = expected.definitionMd5;
    if (!got || got.md5 !== wanted) outcome.baselineDifferences.push({ name: `${expected.schema}.${expected.name}`, expectedMd5: wanted, actualMd5: got?.md5 ?? null });
  }
  outcome.baselineComparedFunctions = measured.pushFunctions.length + legacy.length;
  outcome.baselineMatchedFunctions = outcome.baselineComparedFunctions - outcome.baselineDifferences.length;
  assert.equal(sql("select to_regclass('private.connect_config') is null and to_regclass('private.relationship_acceptance_proofs') is null"), 't');
  // No outbound HTTP: replace this function INSIDE the clone after measuring its real definition.
  sql('create or replace function private.dispatch_push_notification_event_v1(p_event_id uuid) returns boolean language sql as $$select false$$');
  initialFunctions = catalog(sql);
}
const applied = ({ name }) => {
  const sha256 = createHash('sha256').update(fs.readFileSync(path.join(root, name))).digest('hex');
  assert.equal(sha256, proposal.migrations[outcome.applied.length].sha256);
  outcome.applied.push({ path: name, sha256 });
};
withConnectDatabase(async ({ sql, file, http }) => {
  const check = async (name, fn) => { await fn(); outcome.checks.push(name); console.log(`ok - ${name}`); };
  const endBlock = proposal.migrations[4].path, notifications = proposal.migrations[5].path;
  sql(file(endBlock)); applied({ name: endBlock });
  await check('a late M3.1 name collision rolls back all changes from that migration', () => {
    sql('create function public.rpc_service_claim_push_notification_event_pre_connect_v1(uuid) returns void language sql as $$select$$');
    assert.throws(() => sql(file(notifications)), /already exists/);
    assert.equal(sql("select not exists(select 1 from information_schema.columns where table_schema='private' and table_name='connect_config' and column_name='notifications_enabled')"), 't');
    assert.equal(sql("select count(*) from pg_trigger where tgname='connect_reset_push_capability'"), '0');
    sql('drop function public.rpc_service_claim_push_notification_event_pre_connect_v1(uuid)');
  });
  sql(file(notifications)); applied({ name: notifications });
  await check('all six exact files apply in the frozen dependency order', () => assert.deepEqual(outcome.applied,
    proposal.migrations.map(({ path: sourcePath, sha256 }) => ({ path: sourcePath, sha256 }))));
  await check('new config starts unconfigured, all gates off and allowlist empty', () => {
    const c = JSON.parse(sql('select row_to_json(c) from private.connect_config c'));
    assert.equal(c.environment, 'unconfigured'); assert.deepEqual(c.staging_test_users, []);
    for (const k of proposal.activation.databaseFlagsOff) assert.equal(c[k], false, k);
  });
  await check('both existing-block guards are installed without another block table', () => {
    const names = JSON.parse(sql("select json_agg(t.tgname order by t.tgname) from pg_trigger t where t.tgrelid='public.blocks'::regclass and not t.tgisinternal"));
    assert.deepEqual(names, ['connect_block_guard', 'relationship_block_guard']);
    assert.equal(sql("select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='private' and c.relname='connect_blocks'"), '0');
  });
  await check('user, service and private delegate execution boundaries remain separate', () => {
    for (const role of ['anon', 'authenticated']) assert.equal(sql(`select has_function_privilege(${q(role)},'public.rpc_connect_claim_job()','EXECUTE')`), 'f');
    assert.equal(sql("select has_function_privilege('service_role','public.rpc_connect_claim_job()','EXECUTE')"), 't');
    for (const role of ['anon', 'authenticated', 'service_role']) assert.equal(sql(`select has_function_privilege(${q(role)},'public.rpc_service_claim_push_notification_event_pre_connect_v1(uuid)','EXECUTE')`), 'f');
    assert.equal(sql("select has_function_privilege('anon','public.rpc_connect_end_call_and_block(uuid,uuid,timestamptz,uuid,jsonb)','EXECUTE')"), 'f');
  });
  await check('function changes stay within reviewed six-file impact including private merge wrapper', () => {
    const before = new Map(initialFunctions.map(f => [key(f), f.md5]));
    const after = catalog(sql); const afterKeys = new Set(after.map(key));
    const changed = after.filter(f => before.get(key(f)) !== f.md5).map(f => `${f.schema}.${f.name}`);
    const allowed = new Set(proposal.migrations.flatMap(m => [...file(m.path).matchAll(/create(?: or replace)? function\s+(public|private)\.([a-z0-9_]+)/gi)].map(x => `${x[1]}.${x[2]}`)));
    for (const n of ['private.relationship_execute_legacy_merge_v1', 'public.rpc_service_claim_push_notification_event_pre_connect_v1', 'public.rpc_service_reserve_push_notification_deliveries_pre_connect_v1']) allowed.add(n);
    outcome.functionImpact = { changed, removed: initialFunctions.filter(f => !afterKeys.has(key(f))).map(key), unexpected: changed.filter(n => !allowed.has(n)) };
    assert.deepEqual(outcome.functionImpact.unexpected, []);
    assert.deepEqual(outcome.functionImpact.removed, []);
  });
  // Synthetic local fixtures only; restore disabled staging shape immediately after their setup.
  sql(file('supabase/tests/fixtures/connect_v1.sql'));
  sql("update private.connect_config set environment='staging',enabled=false,voice_enabled=false,video_enabled=false,pre_match_enabled=false,provider_ready=false,end_block_enabled=false,notifications_enabled=false,staging_test_users='{}'");
  const auth = (n, command) => `begin;set local role authenticated;select set_config('request.jwt.claim.sub',${q(user(n))},true);${command};commit;`;
  await check('loopback REST cannot create a call with all staging gates disabled', async () => {
    const response = await http(user(1), 'rpc/rpc_connect_create_call', { p_peer: profile(2), p_media: 'voice', p_authorization: 'matched', p_key: randomUUID(), p_device: randomUUID(), p_grant: null });
    assert.equal(response.status, 400); assert.match(await response.text(), /connect_disabled/);
  });
  await check('empty allowlist denies otherwise enabled and eligible synthetic accounts', () => {
    sql('update private.connect_config set enabled=true,voice_enabled=true,provider_ready=true');
    assert.equal(scalar(sql(auth(1, `select public.rpc_connect_check_eligibility(${q(profile(2))},'voice','matched',null)`))), 'f');
  });
  await check('exact pair scope does not admit another valid matched synthetic pair', () => {
    sql(`update private.connect_config set staging_test_users=array[${q(user(1))},${q(user(2))}]::uuid[]`);
    assert.equal(scalar(sql(auth(1, `select public.rpc_connect_check_eligibility(${q(profile(2))},'voice','matched',null)`))), 't');
    assert.equal(scalar(sql(auth(5, `select public.rpc_connect_check_eligibility(${q(profile(6))},'voice','matched',null)`))), 'f');
  });
  await check('production and invalid scope configurations remain rejected', () => {
    assert.throws(() => sql("update private.connect_config set environment='production'"), /check constraint/);
    assert.throws(() => sql(`update private.connect_config set staging_test_users=array[${q(user(1))}]::uuid[]`), /check constraint/);
    assert.throws(() => sql(`update private.connect_config set staging_test_users=array[${q(user(1))},${q(user(1))}]::uuid[]`), /check constraint/);
  });
  await check('ending the rehearsal restores all synthetic gates off with no calls or provider work', () => {
    sql("update private.connect_config set enabled=false,voice_enabled=false,provider_ready=false,staging_test_users='{}'");
    assert.equal(sql('select count(*) from private.connect_sessions'), '0');
    assert.equal(sql('select count(*) from private.connect_provider_jobs'), '0');
    assert.equal(sql('select cardinality(staging_test_users) from private.connect_config'), '0');
  });
}, { prepareBaseline, onMigrationApplied: applied }).then(() => {
  outcome.status = outcome.baselineDifferences.length ? 'INCOMPLETE_STAGING_BASELINE_EQUIVALENCE' : 'PASS_MEASURED_STAGING_CONTRACTS';
  outcome.passed = outcome.checks.length; outcome.failed = 0;
  fs.writeFileSync(path.join(dir, 'migration-rehearsal.json'), JSON.stringify(outcome, null, 2) + '\n');
  console.log(JSON.stringify({ status: outcome.status, passed: outcome.passed, failed: 0, matchedBaselineFunctions: outcome.baselineMatchedFunctions, compared: outcome.baselineComparedFunctions, hosted: false }));
}).catch(error => {
  outcome.status = 'FAIL'; outcome.failed = 1;
  outcome.failure = String(error.stderr ?? error.message).replace(/PGPASSWORD=\S+/g, 'PGPASSWORD=[REDACTED]')
    .replace(/postgres(?:ql)?:\/\/[^\s]+/g, '[REDACTED_LOCAL_DATABASE_URI]').slice(0, 1600);
  fs.writeFileSync(path.join(dir, 'migration-rehearsal.json'), JSON.stringify(outcome, null, 2) + '\n');
  console.error('Disposable migration rehearsal failed; inspect its local receipt.'); process.exitCode = 1;
});
