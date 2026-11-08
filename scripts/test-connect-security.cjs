const assert = require('node:assert/strict');
const { withConnectDatabase } = require('./lib/connect-test-database.cjs');
const id = (kind, n) => `f01${kind}0000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const user = (n) => id(1, n); const profile = (n) => id(2, n); const device = (n) => id(5, n); const key = (n) => id(6, n);
const q = (value) => value === null ? 'null' : `'${String(value).replaceAll("'", "''")}'`;
const asUser = (n, command) => `begin;set local statement_timeout='20s';set local lock_timeout='10s';set local role authenticated;
select set_config('request.jwt.claim.sub',${q(user(n))},true);select set_config('request.jwt.claim.role','authenticated',true);${command};commit;`;
const parse = (output) => JSON.parse(output.split(/\r?\n/).findLast((line) => line.startsWith('{') || line.startsWith('[')));
const create = (peer, k, media = 'voice', authorization = 'matched', grant = null) =>
  `select public.rpc_connect_create_call(${q(profile(peer))},${q(media)},${q(authorization)},${q(key(k))},${q(device(k))},${q(grant)})`;
let cases = 0;
const passed = (name) => { cases++; console.log(`ok ${cases} - ${name}`); };
withConnectDatabase(async ({ sql, concurrent, http, file }) => {
  const tap = sql(file('supabase/tests/connect_v1_authority.sql'));
  assert.doesNotMatch(tap, /^not ok/m, tap);
  console.log(JSON.stringify({ databaseAclAssertions: [...tap.matchAll(/^ok \d+/gm)].length }));
  sql(file('supabase/tests/fixtures/connect_v1.sql'));
  const deny = (n, command, code) => {
    if (command.includes('public.rpc_connect_admission(')) {
      const result = parse(sql(asUser(n, command)));
      assert.equal(result.admitted, false); assert.equal(result.error, code);
    } else assert.throws(() => sql(asUser(n, command)), (e) => new RegExp(code).test(String(e.stderr ?? e.message)));
    passed(code);
  };
  const run = (n, command) => sql(asUser(n, command));
  const get = (n, call) => parse(run(n, `select public.rpc_connect_get_call(${q(call)})`));
  const act = (n, s, action, d = n) => parse(run(n, `select public.rpc_connect_act(${q(s.id)},${q(action)},${s.version},${q(device(d))})`));
  const ack = (call, operation, success = true) => {
    const lease = sql(`update private.connect_provider_jobs set status='working',lease=gen_random_uuid(),attempts=attempts+1 where call_id=${q(call)} and operation=${q(operation)} returning lease;`).split(/\r?\n/)[0];
    sql(`select public.rpc_connect_complete_job(${q(call)},${q(operation)},${q(lease)},${success});`);
  };
  const clean = (call) => { ack(call, 'create'); ack(call, 'end'); };
  deny(1, create(2, 1), 'connect_disabled');
  sql("update private.connect_config set environment='local',enabled=true,voice_enabled=true,video_enabled=true,pre_match_enabled=true,provider_ready=true;");
  assert.match(run(1, `select public.rpc_connect_check_eligibility(${q(profile(2))},'voice','matched')`), /^t$/m); passed('verified mutual relationship eligible');
  deny(3, create(4, 1), 'connect_consent_required');
  deny(7, create(8, 1, 'voice', 'pre_match', id(7, 99)), 'connect_consent_required');
  const grant = run(7, `select public.rpc_connect_request_grant(${q(id(4, 1))},true,false)`).split(/\r?\n/).findLast((s) => /^[0-9a-f-]{36}$/.test(s));
  assert.ok(grant); passed('sender can request voice only grant');
  deny(7, create(8, 2, 'voice', 'pre_match', grant), 'connect_consent_required');
  deny(7, `select public.rpc_connect_decide_grant(${q(grant)},true,false)`, 'connect_unavailable');
  deny(8, `select public.rpc_connect_decide_grant(${q(grant)},true,true)`, 'connect_invalid_input');
  run(8, `select public.rpc_connect_decide_grant(${q(grant)},true,false)`);
  const pre = parse(run(7, create(8, 3, 'voice', 'pre_match', grant))); assert.equal(pre.state, 'REQUESTED'); passed('recipient explicitly approved voice');
  deny(7, create(8, 4, 'video', 'pre_match', grant), 'connect_consent_required');
  deny(8, create(7, 4, 'voice', 'pre_match', grant), 'connect_consent_required');
  sql(`update private.connect_grants set expires_at=clock_timestamp()-interval '1 second' where id=${q(grant)}`);
  deny(7, create(8, 4, 'voice', 'pre_match', grant), 'connect_consent_required');
  assert.equal(get(7, pre.id).state, 'ENDED'); passed('expiry fences existing session'); clean(pre.id);
  sql(`update private.connect_grants set expires_at=clock_timestamp()+interval '1 hour' where id=${q(grant)}`);
  sql("update private.connect_config set enabled=false;");
  run(8, `select public.rpc_connect_revoke_grant(${q(grant)})`); passed('revocation permitted with flags off');
  sql("update private.connect_config set enabled=true;");
  deny(7, create(8, 5, 'voice', 'pre_match', grant), 'connect_consent_required');
  deny(8, `select public.rpc_connect_decide_grant(${q(grant)},true,false)`, 'connect_unavailable');

  let s = parse(run(1, create(2, 10)));
  assert.equal(s.state, 'REQUESTED'); assert.equal(s.connected_at, null); passed('verified call request uses server ID without media evidence');
  assert.equal(parse(run(1, create(2, 10))).id, s.id); passed('duplicate create returns same session');
  deny(1, create(2, 10, 'video'), 'connect_idempotency_conflict');
  deny(3, `select public.rpc_connect_get_call(${q(s.id)})`, 'connect_unavailable');
  deny(1, `select public.rpc_connect_act(${q(s.id)},'accept',1,${q(device(1))})`, 'connect_unavailable');
  deny(1, `select public.rpc_connect_admission(${q(s.id)},${q(device(10))})`, 'connect_unavailable');
  ack(s.id, 'create'); s = get(2, s.id); assert.equal(s.state, 'RINGING'); passed('provider ACK alone rings invitation');
  const accepted = await Promise.allSettled([
    concurrent(asUser(2, `select public.rpc_connect_act(${q(s.id)},'accept',${s.version},${q(device(21))})`)),
    concurrent(asUser(2, `select public.rpc_connect_act(${q(s.id)},'accept',${s.version},${q(device(22))})`)),
  ]);
  assert.equal(accepted.filter((r) => r.status === 'fulfilled').length, 1);
  assert.match(accepted.find((r) => r.status === 'rejected').reason.message, /connect_device_conflict/); passed('real concurrent acceptance has one device winner');
  s = get(2, s.id); assert.equal(s.state, 'ACCEPTED'); assert.equal(s.connected_at, null); passed('accepted invitation is not active media');
  const winner = sql(`select recipient_device from private.connect_sessions where id=${q(s.id)}`);
  const admission = parse(run(2, `select public.rpc_connect_admission(${q(s.id)},${q(winner)})`)); assert.equal(admission.admitted, true); assert.equal(admission.id, s.id);
  s = get(1, s.id); assert.equal(s.state, 'CONNECTING'); passed('authenticated admission begins connecting');
  const eventDigest = 'a'.repeat(64);
  sql(`select public.rpc_connect_enqueue_sync(${q(s.id)},${q(eventDigest)});select public.rpc_connect_enqueue_sync(${q(s.id)},${q(eventDigest)})`);
  assert.equal(sql(`select count(*) from private.connect_webhook_receipts where digest=${q(eventDigest)}`), '1'); passed('verified webhook replay receipts deduplicate durably');
  sql(`select public.rpc_connect_reconcile_media(${q(s.id)},'session-a',array[${q(user(1))}]::uuid[],false)`);
  assert.equal(get(1, s.id).connected_at, null); passed('single participant cannot certify connection');
  sql(`select public.rpc_connect_reconcile_media(${q(s.id)},'session-a',array[${q(user(1))},${q(user(2))}]::uuid[],false)`);
  s = get(1, s.id); assert.equal(s.state, 'ACTIVE'); assert.ok(s.connected_at); passed('trusted both-participant evidence establishes active media');
  sql("update private.connect_config set enabled=false");
  assert.equal(parse(run(2, `select public.rpc_connect_admission(${q(s.id)},${q(winner)})`)).admitted, true); passed('ordinary flag change permits active refresh');
  sql(`select public.rpc_connect_reconcile_media(${q(s.id)},'session-a',array[${q(user(1))}]::uuid[],false)`);
  assert.equal(get(1, s.id).state, 'RECONNECTING'); passed('transport loss enters bounded reconnect');
  sql(`select public.rpc_connect_reconcile_media(${q(s.id)},'session-a',array[${q(user(1))},${q(user(2))}]::uuid[],false)`);
  s = act(1, get(1, s.id), 'end'); assert.equal(s.state, 'ENDING'); passed('ending fences admission while flags off');
  deny(2, `select public.rpc_connect_admission(${q(s.id)},${q(winner)})`, 'connect_unavailable');
  ack(s.id, 'end'); s = get(1, s.id); assert.equal(s.state, 'ENDED'); assert.ok(s.ended_at); assert.equal(typeof s.duration_seconds, 'number');
  sql(`select public.rpc_connect_reconcile_media(${q(s.id)},'session-a',array[${q(user(1))},${q(user(2))}]::uuid[],false)`);
  assert.deepEqual(get(1, s.id), s); passed('late media and duplicate commands cannot revive terminal state');
  assert.equal(act(2, s, 'accept', 22).state, 'ENDED'); passed('terminal duplicate returns final outcome');
  assert.equal(JSON.parse(run(3, 'select public.rpc_connect_get_history()').split(/\r?\n/).findLast((l) => l.startsWith('['))).length, 0); passed('unrelated history empty');
  sql("update private.connect_config set enabled=true");

  // Crossed calls must collide even though their caller/callee indexes differ.
  const crossed = await Promise.allSettled([concurrent(asUser(5, create(6, 30))), concurrent(asUser(6, create(5, 31)))]);
  assert.equal(crossed.filter((r) => r.status === 'fulfilled').length, 1); assert.match(crossed.find((r) => r.status === 'rejected').reason.message, /connect_busy/);
  const collision = parse(crossed.find((r) => r.status === 'fulfilled').value); passed('real crossed calls reserve exactly one session');
  const owner = collision.caller_profile_id === profile(5) ? 5 : 6;
  act(owner, collision, 'cancel'); clean(collision.id);
  const differentPairs = await Promise.allSettled([concurrent(asUser(5, create(6, 34))), concurrent(asUser(6, create(9, 35)))]);
  assert.equal(differentPairs.filter((r) => r.status === 'fulfilled').length, 1);
  assert.match(differentPairs.find((r) => r.status === 'rejected').reason.message, /connect_busy/);
  const different = parse(differentPairs.find((r) => r.status === 'fulfilled').value);
  passed('real different-pair collisions share one user occupancy');
  act(different.caller_profile_id === profile(5) ? 5 : 6, different, 'cancel'); clean(different.id);
  const duplicates = await Promise.all([concurrent(asUser(5, create(6, 32))), concurrent(asUser(5, create(6, 32)))]);
  assert.equal(parse(duplicates[0]).id, parse(duplicates[1]).id); passed('real concurrent duplicate creation is idempotent');
  const repeated = parse(duplicates[0]);
  ack(repeated.id, 'create', false); assert.equal(get(5, repeated.id).state, 'REQUESTED');
  ack(repeated.id, 'create', false); ack(repeated.id, 'create', false);
  assert.equal(get(5, repeated.id).state, 'FAILED'); passed('provider failures become terminal and retain cleanup');
  assert.equal(sql(`select count(*) from private.connect_occupancy where call_id=${q(repeated.id)}`), '2'); passed('failed setup retains occupancy until cleanup');
  clean(repeated.id);
  assert.equal(sql(`select count(*) from private.connect_occupancy where call_id=${q(repeated.id)}`), '0'); passed('compensating cleanup releases occupancy');

  const delayed = parse(run(5, create(6, 33)));
  const oldLease = sql(`update private.connect_provider_jobs set status='working',lease=gen_random_uuid(),lease_until=clock_timestamp()+interval '1 minute' where call_id=${q(delayed.id)} and operation='create' returning lease`).split(/\r?\n/)[0];
  act(5, delayed, 'cancel'); ack(delayed.id, 'end');
  assert.equal(sql(`select count(*) from private.connect_occupancy where call_id=${q(delayed.id)}`), '2'); passed('early end ACK cannot release occupancy while creation is in flight');
  sql(`select public.rpc_connect_complete_job(${q(delayed.id)},'create',${q(oldLease)},true)`);
  assert.equal(sql(`select status from private.connect_provider_jobs where call_id=${q(delayed.id)} and operation='end'`), 'pending'); passed('late create ACK schedules another compensating end');
  ack(delayed.id, 'end'); assert.equal(sql(`select count(*) from private.connect_occupancy where call_id=${q(delayed.id)}`), '0');
  sql(`select public.rpc_connect_complete_job(${q(delayed.id)},'create',${q(oldLease)},true)`);
  assert.equal(sql(`select status from private.connect_provider_jobs where call_id=${q(delayed.id)} and operation='end'`), 'pending'); passed('stale create completion cannot acknowledge old cleanup');
  ack(delayed.id, 'end');

  const deleted = parse(run(9, create(6, 61)));
  // Existing delete-account removes matches before profile/Auth deletion. The
  // baseline Vibes DELETE trigger otherwise queues an already-deleted profile.
  sql(`delete from public.matches where user1_id=${q(profile(9))} or user2_id=${q(profile(9))}`);
  sql(`delete from auth.users where id=${q(user(9))}`);
  assert.equal(sql(`select count(*) from private.connect_sessions where id=${q(deleted.id)}`), '0');
  assert.equal(sql(`select status from private.connect_provider_jobs where call_id=${q(deleted.id)} and operation='end'`), 'pending');
  passed('actual Auth deletion preserves provider cleanup work');
  assert.equal(sql(`select count(*) from private.connect_occupancy where call_id=${q(deleted.id)}`), '1'); passed('peer stays occupied after account deletion until cleanup');
  ack(deleted.id, 'create'); ack(deleted.id, 'end');
  assert.equal(sql(`select count(*) from private.connect_occupancy where call_id=${q(deleted.id)}`), '0'); passed('deleted-account cleanup releases remaining peer');
  let video = parse(run(6, create(5, 71, 'video'))); assert.equal(video.media, 'video'); passed('verified matched video request retains authorized media');
  ack(video.id, 'create'); video = get(5, video.id); video = act(5, video, 'decline');
  assert.equal(video.state, 'DECLINED'); assert.equal(video.connected_at, null); ack(video.id, 'end'); passed('recipient decline remains terminal without media connection');

  s = parse(run(1, create(2, 40))); ack(s.id, 'create'); s = get(2, s.id);
  sql(`update private.connect_sessions set deadline=clock_timestamp()-interval '1 second' where id=${q(s.id)}`);
  assert.equal(act(2, s, 'accept').state, 'MISSED'); passed('expired ringing cannot be accepted'); clean(s.id);
  s = parse(run(1, create(2, 41)));
  const blocked = await Promise.allSettled([
    concurrent(asUser(2, `insert into public.blocks(blocker_id,blocked_id) values(${q(user(2))},${q(user(1))})`)),
    concurrent(`select public.rpc_connect_worker_snapshot(${q(s.id)})`),
  ]);
  assert.equal(blocked[0].status, 'fulfilled'); assert.equal(get(1, s.id).state, 'ENDED'); passed('block versus provider snapshot cannot preserve authorization');
  deny(1, create(2, 42), 'connect_consent_required');
  sql(`delete from public.blocks where blocker_id=${q(user(2))} and blocked_id=${q(user(1))}`);
  deny(1, create(2, 43), 'connect_consent_required'); clean(s.id);
  sql(`update auth.users set banned_until=clock_timestamp()+interval '1 hour' where id=${q(user(5))}`);
  deny(5, create(6, 44), 'connect_unavailable');
  sql(`update auth.users set banned_until=null where id=${q(user(5))}`);
  // Successful mutations are rate-limited server-side.
  // Keep this burst on one connection; Docker round trips can cross the minute bucket.
  // Catch only the expected 21st-call error in a subtransaction; commit the 20 successes.
  run(16, `do $$begin
    for n in 1..20 loop perform public.rpc_connect_set_preferences(true,false); end loop;
    begin
      perform public.rpc_connect_set_preferences(true,false);
      raise exception 'expected_connect_rate_limit';
    exception when sqlstate 'P0001' then
      if sqlerrm <> 'connect_rate_limited' then raise; end if;
    end;
  end $$`); passed('connect_rate_limited');

  let response = await http(user(3), 'rpc/rpc_connect_create_call', {
    p_peer: profile(4), p_media: 'voice', p_authorization: 'matched', p_key: key(90), p_device: device(90), p_caller: user(1),
  }); assert.equal(response.status, 404); passed('HTTP forged caller argument rejected by RPC signature');
  response = await http(user(3), 'rpc/rpc_connect_create_call', { p_peer: profile(4), p_media: 'voice', p_authorization: 'matched', p_key: key(90), p_device: device(90) });
  assert.equal(response.status, 403); passed('HTTP historical accepted label cannot authorize creation');
  response = await http(user(3), 'rpc/rpc_connect_get_call', { p_call: s.id }); assert.equal(response.status, 403); passed('HTTP unrelated session read denied');
  response = await http(user(3), 'rpc/rpc_connect_reconcile_media', { p_call: s.id, p_session: 'forged', p_users: [user(1), user(2)], p_ended: false });
  assert.equal(response.status, 403); passed('HTTP client provider-state forgery denied');
  response = await http(user(3), 'connect_sessions', { caller_user_id: user(1), state: 'ACTIVE' }); assert.equal(response.status, 404); passed('HTTP private table unavailable');
  response = await http(user(3), 'rpc/rpc_connect_claim_job', {}); assert.equal(response.status, 403); passed('HTTP user cannot claim privileged provider work');

  // M2 collision and safety controls, retaining every M1 assertion above.
  let racing = parse(run(6, create(5, 73))); ack(racing.id, 'create'); racing = get(6, racing.id);
  const cancelAccept = await Promise.allSettled([
    concurrent(asUser(5, `select public.rpc_connect_act(${q(racing.id)},'accept',${racing.version},${q(device(5))})`)),
    concurrent(asUser(6, `select public.rpc_connect_act(${q(racing.id)},'cancel',${racing.version},${q(device(73))})`)),
  ]);
  assert.ok(cancelAccept.some((r) => r.status === 'fulfilled'));
  for (const outcome of cancelAccept) if (outcome.status === 'rejected') assert.match(outcome.reason.message, /connect_conflict|connect_invalid_transition/);
  const raceWinner = get(6, racing.id); assert.ok(['ACCEPTED', 'CANCELLED'].includes(raceWinner.state));
  assert.equal(raceWinner.connected_at, null); passed('real accept versus caller cancellation has one non-active canonical outcome');
  if (raceWinner.state === 'ACCEPTED') act(6, raceWinner, 'end'); ack(racing.id, 'end');
  assert.equal(sql(`select count(*) from private.connect_occupancy where call_id=${q(racing.id)}`), '0'); passed('cancel-accept race cleanup releases both reservations');

  let active = parse(run(6, create(5, 72))); ack(active.id, 'create'); active = get(5, active.id); act(5, active, 'accept', 5);
  assert.equal(parse(run(6, `select public.rpc_connect_admission(${q(active.id)},${q(device(72))})`)).admitted, true);
  sql(`select public.rpc_connect_reconcile_media(${q(active.id)},'m2-active-session',array[${q(user(5))},${q(user(6))}]::uuid[],false)`);
  assert.equal(get(6, active.id).state, 'ACTIVE');
  run(5, `insert into public.blocks(blocker_id,blocked_id) values(${q(user(5))},${q(user(6))})`);
  const blockedActive = get(6, active.id); assert.equal(blockedActive.state, 'ENDED'); assert.equal(blockedActive.reason, 'blocked');
  passed('actual block immediately fences an ACTIVE call in Postgres');
  deny(6, `select public.rpc_connect_admission(${q(active.id)},${q(device(72))})`, 'connect_unavailable');
  ack(active.id, 'end'); assert.equal(sql(`select count(*) from private.connect_occupancy where call_id=${q(active.id)}`), '0');
  passed('blocked active call retains durable cleanup and releases after provider ACK');
  console.log(JSON.stringify({ connectDatabaseIntegrationCases: cases, separateConnectionRaceCases: 6, directHttpAdversarialCases: 6, realStreamCalls: 0 }));
}).catch((e) => { console.error(e.stderr ? String(e.stderr).slice(0, 5000) : e.stack ?? e.message); process.exitCode = 1; });
