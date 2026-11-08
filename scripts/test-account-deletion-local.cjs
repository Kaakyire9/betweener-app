// Synthetic users in a disposable schema clone. No hosted data, Storage or Auth deletion.
const assert = require('node:assert/strict');
const { withConnectDatabase } = require('./lib/connect-test-database.cjs');
const { baseline } = require('./lib/connect-push-rehearsal/baseline.cjs');
const migration = 'supabase/migrations/20261105054114_account_deletion_guarded_profile_mask.sql';
const user = number => `f0110000-0000-4000-8000-${String(number).padStart(12, '0')}`;
const profile = number => `f0120000-0000-4000-8000-${String(number).padStart(12, '0')}`;
const request = number => `f0990000-0000-4000-8000-${String(number).padStart(12, '0')}`;
const quote = value => `'${String(value).replaceAll("'", "''")}'`;
let passed = 0;

withConnectDatabase(async ({ sql, file, http }) => {
  sql(file('supabase/tests/fixtures/connect_v1.sql'));
  const guardHashes = () => sql(`select jsonb_agg(md5(pg_get_functiondef(p.oid)) order by p.proname)
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in ('profile_guard_prevent_direct_public_text_write',
      'profile_guard_protect_system_fields','profile_handle_prevent_unmanaged_write')`);
  const guardsBefore = guardHashes();
  const configBefore = sql('select to_jsonb(c) from private.connect_config c');
  sql(file(migration));
  const service = query => sql(`begin;set local role service_role;
    select set_config('request.jwt.claim.role','service_role',true);
    select set_config('request.jwt.claims','{"role":"service_role"}',true);
    ${query};commit;`);
  const mask = number => service(`select public.rpc_mask_account_deletion_profile(${quote(request(number))})`);
  const insertRequest = (number, owner, ownerProfile = owner) => sql(`insert into public.account_deletion_requests
    (id,user_id,profile_id,reason_keys) values(${quote(request(number))},${quote(user(owner))},
    ${ownerProfile === null ? 'null' : quote(profile(ownerProfile))},array['privacy_concerns'])`);
  const check = (name, run) => {
    run(); passed += 1; console.log(`ok ${passed} - ${name}`);
  };
  insertRequest(1, 1);
  insertRequest(2, 3, 4);
  insertRequest(3, 5, null);
  sql(`begin;select set_config('request.jwt.claim.role','service_role',true);
    select set_config('app.profile_guard_write','on',true);
    update public.profiles set username='deletion_fixture',bio='A synthetic profile for local testing'
      where id=${quote(profile(1))};commit;`);
  const otherBefore = sql(`select md5(to_jsonb(p)::text) from public.profiles p where id=${quote(profile(2))}`);

  check('the original direct service update reproduces PROFILE_GUARD_REQUIRED', () => {
    assert.throws(() => service(`update public.profiles set full_name=null where id=${quote(profile(1))}`), /PROFILE_GUARD_REQUIRED/);
    assert.equal(sql(`select deleted_at is null from public.profiles where id=${quote(profile(1))}`), 't');
  });
  check('only the service role can execute the fixed masking function', () => {
    assert.equal(sql(`select has_function_privilege('service_role','public.rpc_mask_account_deletion_profile(uuid)','execute')
      and not has_function_privilege('anon','public.rpc_mask_account_deletion_profile(uuid)','execute')
      and not has_function_privilege('authenticated','public.rpc_mask_account_deletion_profile(uuid)','execute')`), 't');
    assert.equal(sql(`select prosecdef from pg_proc where oid='public.rpc_mask_account_deletion_profile(uuid)'::regprocedure`), 'f');
  });
  check('a request belonging to another profile is rejected without masking its owner', () => {
    assert.throws(() => mask(2), /ACCOUNT_DELETION_PROFILE_MISMATCH/);
    assert.equal(sql(`select deleted_at is null from public.profiles where id=${quote(profile(3))}`), 't');
  });
  check('unknown and completed requests cannot invoke masking', () => {
    assert.throws(() => mask(99), /ACCOUNT_DELETION_REQUEST_INVALID/);
    sql(`update public.account_deletion_requests set status='completed' where id=${quote(request(3))}`);
    assert.throws(() => mask(3), /ACCOUNT_DELETION_REQUEST_INVALID/);
  });
  check('the request-bound operation clears the established profile fields and hides the account', () => {
    assert.ok(mask(1).includes(profile(1)));
    assert.equal(sql(`select deleted_at is not null and account_state='deleted' and not is_active
      and not discoverable_in_vibes and not profile_completed and full_name is null and username is null
      and bio is null and phone_number is null and not phone_verified and photos='{}'::text[]
      from public.profiles where id=${quote(profile(1))}`), 't');
    assert.equal(sql(`select md5(to_jsonb(p)::text) from public.profiles p where id=${quote(profile(2))}`), otherBefore);
  });
  check('retries preserve the original deletion timestamp and the guard context is restored', () => {
    const deletedAt = sql(`select deleted_at from public.profiles where id=${quote(profile(1))}`);
    sql(`update public.account_deletion_requests set status='failed' where id=${quote(request(1))}`);
    assert.ok(mask(1).includes(profile(1)));
    assert.equal(sql(`select deleted_at from public.profiles where id=${quote(profile(1))}`), deletedAt);
    const restored = service(`select set_config('app.profile_guard_write','off',true);
      select public.rpc_mask_account_deletion_profile(${quote(request(1))});
      select 'guard_restored='||current_setting('app.profile_guard_write')`);
    assert.ok(restored.includes('guard_restored=off'));
    assert.throws(() => service(`update public.profiles set full_name=null where id=${quote(profile(2))}`), /PROFILE_GUARD_REQUIRED/);
  });
  check('profile creation between request and mask is bound back to its real owner', () => {
    sql(`update public.account_deletion_requests set status='requested' where id=${quote(request(3))}`);
    assert.ok(mask(3).includes(profile(5)));
    assert.equal(sql(`select profile_id from public.account_deletion_requests where id=${quote(request(3))}`), profile(5));
  });
  check('accounts without profiles return null safely', () => {
    sql(`insert into auth.users(id) values(${quote(user(90))})`);
    insertRequest(4, 90, null);
    assert.ok(mask(4).includes('\n\n'));
    assert.equal(sql(`select count(*) from public.profiles where user_id=${quote(user(90))}`), '0');
  });
  check('profile guards and the calling configuration retain their original definitions and values', () => {
    assert.equal(guardHashes(), guardsBefore);
    assert.equal(sql('select to_jsonb(c) from private.connect_config c'), configBefore);
  });
  const denied = await http(user(2), 'rpc/rpc_mask_account_deletion_profile', { p_request_id: request(1) });
  assert.equal(denied.status, 403);
  passed += 1; console.log(`ok ${passed} - real disposable PostgREST denies mobile access to another account's deletion RPC`);
  console.log(JSON.stringify({ passed, failed: 0, hosted: false, realAccountDeletions: 0, sharedDatabaseModified: false }));
}, { prepareBaseline: baseline({ reconstructed: [] }) }).catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
