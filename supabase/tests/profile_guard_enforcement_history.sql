begin;

create extension if not exists pgtap with schema extensions;
select plan(9);

insert into auth.users(id, email) values
  ('95000000-0000-4000-8000-000000000001', 'guard-history-admin@example.test'),
  ('95000000-0000-4000-8000-000000000002', 'guard-history-member@example.test'),
  ('95000000-0000-4000-8000-000000000003', 'guard-history-outsider@example.test');
insert into public.internal_admins(user_id, email, role)
values ('95000000-0000-4000-8000-000000000001', 'guard-history-admin@example.test', 'moderation');

select set_config('app.profile_guard_write', 'on', true);
insert into public.profiles(
  id, user_id, full_name, age, gender, bio, phone_number, phone_verified,
  identity_status, profile_completed, discoverable_in_vibes,
  profile_moderation_state, account_state, is_active
) values (
  '96000000-0000-4000-8000-000000000001',
  '95000000-0000-4000-8000-000000000002',
  'Guard History Member', 30, 'FEMALE', 'A safe biography.',
  '+447000000098', true, 'active', true, true, 'CLEAR', 'active', true
);
select set_config('app.profile_guard_write', 'off', true);

select ok(
  not has_function_privilege('anon', 'public.rpc_admin_get_profile_guard_enforcement_history(integer)', 'EXECUTE'),
  'anonymous users cannot read automatic enforcement history'
);
select ok(
  has_function_privilege('authenticated', 'public.rpc_admin_get_profile_guard_enforcement_history(integer)', 'EXECUTE'),
  'authenticated admins can invoke automatic enforcement history'
);

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select lives_ok(
  $$ select public.rpc_service_update_profile_with_guard_v3(
    '95000000-0000-4000-8000-000000000002',
    '{"bio":"Message me on Signal +44 7700 900123 for my onlyfans subscription."}'::jsonb,
    (select updated_at from public.profiles where id = '96000000-0000-4000-8000-000000000001'),
    '{"profile_updates":{"bio":"Message me on Signal +44 7700 900123 for my onlyfans subscription."}}'::jsonb
  ) $$,
  'service bridge records deterministic enforcement evidence'
);
reset role;

select is(
  (select evidence_snapshot->'profile_updates'->>'bio'
   from public.profile_moderation_events
   where profile_id = '96000000-0000-4000-8000-000000000001'
   order by created_at desc limit 1),
  'Message me on Signal +44 7700 900123 for my onlyfans subscription.',
  'automatic enforcement retains the submitted guarded field'
);
select is(
  (select profile_moderation_state from public.profiles
   where id = '96000000-0000-4000-8000-000000000001'),
  'RESTRICTED',
  'severe deterministic solicitation restricts the profile'
);

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select lives_ok(
  $$ select public.rpc_service_update_profile_with_guard_v3(
    '95000000-0000-4000-8000-000000000002',
    '{"bio":"Signal +44 7700 900124 for paid private membership photos."}'::jsonb,
    (select updated_at from public.profiles where id = '96000000-0000-4000-8000-000000000001'),
    '{"profile_updates":{"bio":"Signal +44 7700 900124 for paid private membership photos."}}'::jsonb
  ) $$,
  'repeated automatic enforcement is recorded'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '95000000-0000-4000-8000-000000000003', true);
select throws_ok(
  $$ select * from public.rpc_admin_get_profile_guard_enforcement_history(100) $$,
  '42501', 'ADMIN_REQUIRED', 'non-admin cannot read automatic enforcement history'
);
select set_config('request.jwt.claim.sub', '95000000-0000-4000-8000-000000000001', true);
select is(
  (select count(*)::integer from public.rpc_admin_get_profile_guard_enforcement_history(100)
   where profile_id = '96000000-0000-4000-8000-000000000001'),
  1,
  'history is deduplicated to one row per profile'
);
select is(
  (select enforcement_count from public.rpc_admin_get_profile_guard_enforcement_history(100)
   where profile_id = '96000000-0000-4000-8000-000000000001'),
  2,
  'deduplicated history reports the total incident count'
);
reset role;

select * from finish();
rollback;
