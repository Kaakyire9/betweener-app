// Disposable local PostgreSQL/REST only. Never loads .env or contacts a hosted service.
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { withConnectDatabase } = require('./lib/connect-test-database.cjs');
const user = n => `f0110000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const profile = n => `f0120000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const q = value => `'${String(value).replaceAll("'", "''")}'`;
const parse = s => JSON.parse(s.split(/\r?\n/).findLast(line => line.startsWith('{')));
const boolean = s => s.split(/\r?\n/).filter(line => line === 't' || line === 'f').at(-1);
let passed = 0; const failures = [];
withConnectDatabase(async ({ sql, concurrent, http, file }) => {
  sql(file('supabase/migrations/20261031035826_connect_end_block_local_foundation.sql'));
  sql(file('supabase/tests/fixtures/connect_v1.sql'));
  const auth = (n, command) => `begin;set local statement_timeout='15s';set local lock_timeout='8s';set local role authenticated;
    select set_config('request.jwt.claim.sub',${q(user(n))},true);${command};commit;`;
  const run = (n, command) => sql(auth(n, command));
  const set = (n, media, enabled) => run(n, `select public.rpc_connect_set_media_preference(${q(media)},${enabled})`);
  const get = n => parse(run(n, 'select public.rpc_connect_get_preferences()'));
  const check = async (name, fn) => { try { await fn(); passed++; console.log('ok - '+name); } catch (e) { failures.push(name); console.error('not ok - '+name+': '+e.message); } };
  // Reproduce the stale-pair counterexample BEFORE applying the repair.
  run(1, 'select public.rpc_connect_set_preferences(true,false)');
  run(1, 'select public.rpc_connect_set_preferences(true,true)');
  assert.equal(get(1).video, true);
  console.log('counterexample reproduced: legacy stale voice update restored video opt-in');
  sql(file('supabase/migrations/20261102151043_connect_media_preference_updates.sql'));
  await check('the migration leaves every calling gate off and creates no provider work', () => {
    const flags = parse(sql("select jsonb_build_object('enabled',enabled,'voice',voice_enabled,'video',video_enabled,'provider',provider_ready) from private.connect_config"));
    assert.deepEqual(flags, { enabled: false, voice: false, video: false, provider: false });
    assert.equal(sql('select count(*) from private.connect_provider_jobs'), '0');
  });
  await check('anonymous and service roles cannot execute media preference writes', () => {
    assert.throws(() => sql("set role anon; select public.rpc_connect_set_media_preference('video',true)"), /permission denied/);
    assert.throws(() => sql("set role service_role; select public.rpc_connect_set_media_preference('video',true)"), /permission denied/);
    assert.throws(() => sql("set role authenticated; select public.rpc_connect_set_media_preference('video',true)"), /connect_unauthenticated/);
  });
  await check('invalid media, null media and null booleans fail without a preference write', () => {
    for (const args of ["'screen',true", 'null,true', "'voice',null"]) assert.throws(() => run(1, `select public.rpc_connect_set_media_preference(${args})`), /connect_invalid_input/);
  });
  await check('changing one medium cannot implicitly grant the other', () => {
    set(1, 'voice', false); set(1, 'video', false); set(1, 'video', true);
    assert.deepEqual(get(1), { voice: false, video: true });
    set(1, 'video', false); set(1, 'voice', true);
    assert.deepEqual(get(1), { voice: true, video: false });
  });
  await check('the reproduced stale legacy opt-in is rejected after repair', () => {
    set(1, 'video', false);
    assert.throws(() => run(1, 'select public.rpc_connect_set_preferences(true,true)'), /connect_invalid_input/);
    assert.equal(get(1).video, false);
  });
  await check('legacy voice edits and withdrawal of both media remain supported', () => {
    run(1, 'select public.rpc_connect_set_preferences(true,false)');
    set(1, 'video', true); run(1, 'select public.rpc_connect_set_preferences(false,false)');
    assert.deepEqual(get(1), { voice: false, video: false });
  });
  await check('overlapping media updates preserve both choices without a lost update', async () => {
    await Promise.all([concurrent(auth(1, "select public.rpc_connect_set_media_preference('voice',true)")),
      concurrent(auth(1, "select public.rpc_connect_set_media_preference('video',true)"))]);
    assert.deepEqual(get(1), { voice: true, video: true });
    await Promise.all([concurrent(auth(1, "select public.rpc_connect_set_media_preference('voice',false)")),
      concurrent(auth(1, "select public.rpc_connect_set_media_preference('video',false)"))]);
    assert.deepEqual(get(1), { voice: false, video: false });
  });
  await check('the REST endpoint binds writes to the JWT owner, never a caller-selected account', async () => {
    const before = get(1);
    const response = await http(user(2), 'rpc/rpc_connect_set_media_preference', { p_media: 'video', p_enabled: false });
    assert.equal(response.status, 204); assert.deepEqual(get(1), before); assert.equal(get(2).video, false);
    const forged = await http(user(2), 'rpc/rpc_connect_set_media_preference', { p_media: 'video', p_enabled: true, p_user: user(1) });
    assert.ok(forged.status >= 400); assert.deepEqual(get(1), before);
  });
  await check('recipient video consent is independent; caller preferences or voice consent cannot grant it', () => {
    sql("update private.connect_config set environment='local',enabled=true,voice_enabled=true,video_enabled=true,provider_ready=true");
    set(1, 'voice', true); set(1, 'video', false); set(2, 'voice', true); set(2, 'video', false);
    assert.equal(boolean(run(1, `select public.rpc_connect_check_eligibility(${q(profile(2))},'voice','matched',null)`)), 't');
    assert.equal(boolean(run(1, `select public.rpc_connect_check_eligibility(${q(profile(2))},'video','matched',null)`)), 'f');
    set(1, 'video', true); set(2, 'video', false);
    assert.equal(boolean(run(1, `select public.rpc_connect_check_eligibility(${q(profile(2))},'video','matched',null)`)), 'f');
    set(2, 'video', true);
    assert.equal(boolean(run(1, `select public.rpc_connect_check_eligibility(${q(profile(2))},'video','matched',null)`)), 't');
  });
  const seed = (a, b, media) => {
    const id = randomUUID(), device = randomUUID();
    sql(`insert into private.connect_sessions(id,caller_user_id,recipient_user_id,caller_profile_id,recipient_profile_id,
      caller_device,recipient_device,media,auth_mode,idempotency_key,state,connected_at)
      values(${q(id)},${q(user(a))},${q(user(b))},${q(profile(a))},${q(profile(b))},${q(device)},${q(device)},${q(media)},'matched',${q(randomUUID())},'ACTIVE',clock_timestamp());
      insert into private.connect_occupancy values(${q(user(a))},${q(id)}),(${q(user(b))},${q(id)})`);
    return id;
  };
  const video = seed(1, 2, 'video'), voice = seed(5, 6, 'voice');
  await check('video withdrawal atomically preserves the block-independent terminal/outbox boundary', () => {
    set(1, 'video', false);
    assert.equal(sql(`select state from private.connect_sessions where id=${q(video)}`), 'ENDED');
    assert.equal(sql(`select count(*) from private.connect_provider_jobs where call_id=${q(video)} and operation='end'`), '1');
    assert.equal(sql(`select state from private.connect_sessions where id=${q(voice)}`), 'ACTIVE');
    assert.equal(get(1).voice, true);
  });
  await check('duplicate withdrawal preserves existing owned cleanup leases and terminal version', () => {
    const lease = randomUUID(), version = sql(`select version from private.connect_sessions where id=${q(video)}`);
    sql(`update private.connect_provider_jobs set status='working',lease=${q(lease)},lease_until=clock_timestamp()+interval '1 minute' where call_id=${q(video)} and operation='end'`);
    set(1, 'video', false); set(1, 'video', false);
    assert.equal(sql(`select version from private.connect_sessions where id=${q(video)}`), version);
    assert.equal(sql(`select lease from private.connect_provider_jobs where call_id=${q(video)} and operation='end'`), lease);
  });
  await check('gates-off withdrawal remains available and keeps pending cleanup', () => {
    sql('update private.connect_config set enabled=false,voice_enabled=false,video_enabled=false,provider_ready=false');
    set(5, 'voice', false);
    assert.equal(sql(`select state from private.connect_sessions where id=${q(voice)}`), 'ENDED');
    assert.equal(sql(`select count(*) from private.connect_provider_jobs where call_id=${q(voice)} and operation='end'`), '1');
  });
  await check('the real call-bound End Call & Block RPC accepts video and preserves its pending cleanup', () => {
    sql('update private.connect_config set end_block_enabled=true');
    const generation = sql(`select created_at from private.connect_sessions where id=${q(video)}`);
    const args = `${q(video)},${q(profile(2))},${q(generation)}`;
    const context = parse(run(1, `select public.rpc_connect_end_block_context(${args})`));
    assert.equal(context.media, 'video');
    const receipt = parse(run(1, `select public.rpc_connect_end_call_and_block(${args},${q(randomUUID())},${q(JSON.stringify(context))}::jsonb)`));
    assert.equal(receipt.block, 'saved'); assert.equal(receipt.call, 'terminal'); assert.equal(receipt.provider, 'pending');
    assert.equal(sql(`select count(*) from private.connect_provider_jobs where call_id=${q(video)} and operation='end'`), '1');
  });
  await check('blocking cannot prevent a participant from withdrawing their own preferences', () => {
    sql(`insert into public.blocks(blocker_id,blocked_id) values(${q(user(2))},${q(user(1))})`);
    set(1, 'video', false); assert.equal(get(1).video, false);
    assert.equal(boolean(run(1, `select public.rpc_connect_check_eligibility(${q(profile(2))},'video','matched',null)`)), 'f');
  });
  console.log(JSON.stringify({ passed, failed: failures.length, failures, hosted: false, provider: false, actualMedia: false }));
  if (failures.length) process.exitCode = 1;
}).catch(error => { console.error(error.message); process.exitCode = 1; });
