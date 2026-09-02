begin;

create extension if not exists pgtap with schema extensions;
select plan(24);

select set_config('app.profile_guard_write', 'on', true);
insert into auth.users(id, email) values
  ('91000000-0000-4000-8000-000000000001', 'guard-owner@example.test'),
  ('91000000-0000-4000-8000-000000000002', 'guard-other@example.test'),
  ('91000000-0000-4000-8000-000000000003', 'guard-review@example.test');
insert into public.profiles(
  id, user_id, full_name, age, gender, bio, phone_number, phone_verified,
  identity_status, profile_completed, discoverable_in_vibes,
  profile_moderation_state, account_state, is_active
) values
  ('92000000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000001',
    'Guard Owner', 30, 'MALE', 'I enjoy hiking.', '+447000000001', true,
    'active', true, true, 'CLEAR', 'active', true),
  ('92000000-0000-4000-8000-000000000002', '91000000-0000-4000-8000-000000000002',
    'Guard Other', 29, 'FEMALE', 'I enjoy cooking.', '+447000000002', true,
    'active', true, true, 'CLEAR', 'active', true),
  ('92000000-0000-4000-8000-000000000003', '91000000-0000-4000-8000-000000000003',
    'Guard Review', 31, 'FEMALE', 'I enjoy books.', '+447000000003', true,
    'active', true, false, 'REVIEW_REQUIRED', 'active', true);
select set_config('app.profile_guard_write', 'off', true);

select ok(not exists (
  select 1
  from pg_catalog.pg_proc procedure_row,
    lateral aclexplode(coalesce(procedure_row.proacl, acldefault('f', procedure_row.proowner))) acl
  where procedure_row.oid = 'public.rpc_service_update_profile_with_guard(uuid,jsonb)'::regprocedure
    and acl.grantee = 0 and acl.privilege_type = 'EXECUTE'
), 'PUBLIC cannot execute bridge');
select ok(not has_function_privilege('anon', 'public.rpc_service_update_profile_with_guard(uuid,jsonb)', 'EXECUTE'), 'anon cannot execute bridge');
select ok(not has_function_privilege('authenticated', 'public.rpc_service_update_profile_with_guard(uuid,jsonb)', 'EXECUTE'), 'authenticated cannot execute bridge');
select ok(has_function_privilege('service_role', 'public.rpc_service_update_profile_with_guard(uuid,jsonb)', 'EXECUTE'), 'service_role can execute bridge');
select ok(
  not has_function_privilege(
    'anon',
    'public.rpc_backfill_profile_contact_guard(integer,uuid,boolean)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'public.rpc_backfill_profile_contact_guard(integer,uuid,boolean)',
    'EXECUTE'
  ),
  'client roles cannot execute backfill'
);

set local role anon;
select results_eq(
  $$
    with attempted_update as (
      update public.profiles
      set bio = 'anon write'
      where id = '92000000-0000-4000-8000-000000000001'
      returning 1
    )
    select count(*) from attempted_update
  $$,
  $$ values (0::bigint) $$,
  'anon direct update affects no rows'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '91000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select throws_ok(
  $$ update public.profiles set bio = 'direct owner write' where id = '92000000-0000-4000-8000-000000000001' $$,
  '42501', 'PROFILE_GUARD_REQUIRED', 'owner direct protected-field update is denied'
);
select set_config('request.jwt.claim.sub', '91000000-0000-4000-8000-000000000003', true);
select throws_ok(
  $$ update public.profiles set profile_moderation_state = 'CLEAR' where id = '92000000-0000-4000-8000-000000000003' $$,
  '42501', 'PROFILE_MODERATION_STATE_SERVER_MANAGED', 'owner cannot clear moderation state directly'
);
select set_config('request.jwt.claim.sub', '91000000-0000-4000-8000-000000000001', true);
select throws_ok(
  $$ select public.rpc_service_update_profile_with_guard('91000000-0000-4000-8000-000000000002', '{"bio":"wrong user"}'::jsonb) $$,
  null, null, 'authenticated caller cannot invoke bridge for another user'
);
select throws_ok(
  $$ insert into public.profile_moderation_events(user_id, profile_id, risk_score, decision, source, detector_version)
     values ('91000000-0000-4000-8000-000000000001', '92000000-0000-4000-8000-000000000001', 0, 'ALLOW', 'profile_write', 'test') $$,
  null, null, 'authenticated cannot mutate moderation evidence'
);
select throws_ok(
  $$ select public.rpc_resolve_profile_guard_review('92000000-0000-4000-8000-000000000003', 'CLEAR', 'not-admin') $$,
  '42501', 'ADMIN_REQUIRED', 'non-admin cannot resolve review'
);
reset role;

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select is(
  (public.rpc_service_update_profile_with_guard(
    '91000000-0000-4000-8000-000000000001', '{"bio":"I enjoy museums.","city":"Accra","region":"Greater Accra","current_country":"Ghana","location":"Accra, Greater Accra, Ghana"}'::jsonb
  )->>'ok')::boolean,
  true,
  'service bridge accepts an owner-safe guarded update'
);
select throws_ok(
  $$ select public.rpc_service_update_profile_with_guard(
       '91000000-0000-4000-8000-000000000001',
       '{"verification_level":99}'::jsonb
     ) $$,
  '42501', 'PROFILE_FIELD_NOT_ALLOWED', 'bridge rejects a non-allowlisted security field'
);
select throws_ok(
  $$ select public.rpc_service_update_profile_with_guard(
       '91000000-0000-4000-8000-000000000001',
       '{"city":"Subscribe Now","location":"Subscribe Now, Ghana"}'::jsonb
     ) $$,
  '22023', 'INVALID_STRUCTURED_PROFILE_FIELD', 'structured location rejects promotional prose'
);
select is(
  public.rpc_service_update_profile_with_guard(
    '91000000-0000-4000-8000-000000000001',
    '{"bio":"Message me on WhatsApp +44 7000 000001"}'::jsonb
  )->>'code',
  'PROFILE_CONTENT_NOT_ALLOWED',
  'unsafe guarded update receives a moderation decision'
);
reset role;

select ok(not public.can_profile_surface_publicly('92000000-0000-4000-8000-000000000001'), 'ACTION_REQUIRED or RESTRICTED profile is absent publicly');
select ok(not public.can_profile_surface_publicly('92000000-0000-4000-8000-000000000003'), 'REVIEW_REQUIRED profile is absent publicly');

select set_config('app.profile_guard_write', 'on', true);
update public.profiles set profile_moderation_state = 'ACTION_REQUIRED', discoverable_in_vibes = false
where id = '92000000-0000-4000-8000-000000000003';
select set_config('app.profile_guard_write', 'off', true);
select ok(not public.can_profile_surface_publicly('92000000-0000-4000-8000-000000000003'), 'ACTION_REQUIRED profile is absent publicly');
select set_config('app.profile_guard_write', 'on', true);
update public.profiles set profile_moderation_state = 'REVIEW_REQUIRED', discoverable_in_vibes = false
where id = '92000000-0000-4000-8000-000000000003';
select set_config('app.profile_guard_write', 'off', true);

select set_config('app.profile_guard_write', 'on', true);
update public.profiles set profile_moderation_state = 'SUSPENDED', discoverable_in_vibes = false
where id = '92000000-0000-4000-8000-000000000002';
select set_config('app.profile_guard_write', 'off', true);
select ok(not public.can_profile_surface_publicly('92000000-0000-4000-8000-000000000002'), 'SUSPENDED profile is absent publicly');

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select is(
  (public.rpc_service_update_profile_with_guard(
    '91000000-0000-4000-8000-000000000001', '{"bio":"I enjoy safe community events."}'::jsonb
  )->>'ok')::boolean,
  true,
  'safe correction is accepted'
);
reset role;
select is((select profile_moderation_state from public.profiles where id = '92000000-0000-4000-8000-000000000001'), 'CLEAR', 'safe correction clears deterministic action state');

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select is(
  (public.rpc_service_update_profile_with_guard(
    '91000000-0000-4000-8000-000000000003', '{"bio":"A corrected, safe profile."}'::jsonb
  )->>'ok')::boolean,
  true,
  'safe correction can be stored while review is pending'
);
reset role;
select is((select profile_moderation_state from public.profiles where id = '92000000-0000-4000-8000-000000000003'), 'REVIEW_REQUIRED', 'safe correction does not clear REVIEW_REQUIRED');

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select lives_ok(
  $$ select public.rpc_apply_profile_guard_semantic_decision(
    '91000000-0000-4000-8000-000000000003', 'spam',
    '{"normal_dating_profile":0.1,"external_contact":0,"external_redirection":0,"commercial_solicitation":0,"paid_content_promotion":0,"sexual_service_solicitation":0,"financial_solicitation":0,"spam":0.9}'::jsonb
  ) $$,
  'service role can record an authorized semantic management action'
);
reset role;

select * from finish();
rollback;
