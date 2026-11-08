// Actual migrations and RPCs in a disposable local database; no hosted services.
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { withConnectDatabase } = require('./lib/connect-test-database.cjs');
const { baseline } = require('./lib/connect-push-rehearsal/baseline.cjs');
const { ownedEndSql } = require('./lib/connect-pilot-operator.cjs');
const q = value => `'${String(value).replaceAll("'", "''")}'`;
const user = n => `f0110000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const profile = n => `f0120000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const parse = value => JSON.parse(value.split(/\r?\n/).findLast(line => line.startsWith('{')));
let passed = 0;
const provenance = { reconstructed: [] };
withConnectDatabase(async ({ sql, file }) => {
  for (const name of ['20261031035826_connect_end_block_local_foundation', '20261031191352_connect_m3_1_intent_and_notifications', '20261101060133_connect_staging_tester_scope']) {
    sql(file(`supabase/migrations/${name}.sql`));
  }
  sql(file('supabase/tests/fixtures/connect_v1.sql'));
  const run = (n, command) => sql(`begin; set local role authenticated;
    select set_config('request.jwt.claim.sub',${q(user(n))},true); ${command}; commit;`);
  const check = (name, fn) => { fn(); passed++; console.log(`ok ${passed} - ${name}`); };
  const create = (n, media, key = randomUUID(), device = randomUUID()) =>
    `select public.rpc_connect_create_call(${q(profile(n))},${q(media)},'matched',${q(key)},${q(device)},null)`;
  check('the installed voice-only open-testing constraint rejects video activation', () => {
    assert.throws(() => sql("update private.connect_config set environment='staging',staging_open_testing=true,video_enabled=true"), /connect_open_testing_staging_voice_only/);
  });
  const before = sql('select to_jsonb(c) from private.connect_config c');
  sql(file('supabase/migrations/20261102151043_connect_media_preference_updates.sql'));
  sql(file('supabase/migrations/20261102165936_connect_staging_video_testing.sql'));
  check('both deployment migrations preserve every configuration field, budget and account scope', () => {
    assert.equal(sql('select to_jsonb(c) from private.connect_config c'), before);
    assert.equal(sql('select count(*) from private.connect_provider_jobs'), '0');
  });
  check('open testing still cannot target production, local or unconfigured environments', () => {
    for (const environment of ['production', 'local', 'unconfigured']) {
      assert.throws(() => sql(`update private.connect_config set environment=${q(environment)},staging_open_testing=true`), /connect_open_testing_staging_only/);
    }
  });
  sql("update private.connect_config set environment='staging',enabled=true,voice_enabled=true,provider_ready=true,staging_open_testing=true,staging_calls_remaining=3");
  check('the server video gate still denies admission and charges no budget', () => {
    assert.throws(() => run(1, create(2, 'video')), /connect_disabled/);
    assert.equal(sql('select staging_calls_remaining from private.connect_config'), '3');
  });
  sql('update private.connect_config set video_enabled=true');
  check('open scope does not bypass recipient video opt-in or relationship authority', () => {
    run(2, "select public.rpc_connect_set_media_preference('video',false)");
    assert.throws(() => run(1, create(2, 'video')), /connect_consent_required/);
    run(2, "select public.rpc_connect_set_media_preference('video',true)");
    assert.throws(() => run(1, create(4, 'video')), /connect_consent_required/);
    assert.equal(sql('select staging_calls_remaining from private.connect_config'), '3');
  });
  const key = randomUUID(), device = randomUUID(), command = create(2, 'video', key, device);
  let call;
  check('an explicitly approved matched video invitation consumes one shared slot', () => {
    call = parse(run(1, command));
    assert.equal(call.media, 'video');
    assert.equal(sql('select staging_calls_remaining from private.connect_config'), '2');
  });
  check('duplicate creation returns the same call without a second charge', () => {
    assert.equal(parse(run(1, command)).id, call.id);
    assert.equal(sql('select staging_calls_remaining from private.connect_config'), '2');
  });
  check('the operator can end the exact owned video call without touching other media', () => {
    const binding = { id: call.id, createdAt: call.created_at, callerUser: user(1), recipientUser: user(2),
      callerProfile: profile(1), recipientProfile: profile(2), providerSession: null };
    assert.throws(() => sql(ownedEndSql(binding)), /pilot_ownership_mismatch/);
    sql(ownedEndSql({ ...binding, media: 'video' }));
    assert.equal(sql(`select state from private.connect_sessions where id=${q(call.id)}`), 'CANCELLED');
  });
  check('disabling video does not prevent withdrawal or discard durable cleanup', () => {
    sql('update private.connect_config set video_enabled=false');
    run(2, "select public.rpc_connect_set_media_preference('video',false)");
    assert.equal(sql(`select state from private.connect_sessions where id=${q(call.id)}`), 'CANCELLED');
    assert.equal(sql(`select count(*) from private.connect_provider_jobs where call_id=${q(call.id)} and operation='end'`), '1');
    assert.equal(sql('select staging_calls_remaining from private.connect_config'), '2');
    assert.throws(() => run(1, create(2, 'video')), /connect_disabled/);
  });
  console.log(JSON.stringify({ passed, failed: 0, hosted: false, provider: false, actualMedia: false }));
}, { prepareBaseline: baseline(provenance) }).catch(error => { console.error(error.message); process.exitCode = 1; });
