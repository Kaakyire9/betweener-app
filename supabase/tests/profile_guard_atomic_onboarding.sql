begin;

create extension if not exists pgtap with schema extensions;
select plan(16);

select ok(
  not has_function_privilege('public',
    'public.rpc_service_complete_profile_onboarding_with_guard_v1(uuid,jsonb,timestamptz,jsonb)',
    'EXECUTE'),
  'PUBLIC cannot execute atomic onboarding'
);
select ok(
  not has_function_privilege('anon',
    'public.rpc_service_complete_profile_onboarding_with_guard_v1(uuid,jsonb,timestamptz,jsonb)',
    'EXECUTE'),
  'anon cannot execute atomic onboarding'
);
select ok(
  not has_function_privilege('authenticated',
    'public.rpc_service_complete_profile_onboarding_with_guard_v1(uuid,jsonb,timestamptz,jsonb)',
    'EXECUTE'),
  'authenticated cannot execute atomic onboarding'
);
select ok(
  has_function_privilege('service_role',
    'public.rpc_service_complete_profile_onboarding_with_guard_v1(uuid,jsonb,timestamptz,jsonb)',
    'EXECUTE'),
  'service role can execute atomic onboarding'
);

select set_config('app.profile_guard_write', 'on', true);
insert into auth.users(id, email) values
  ('9b000000-0000-4000-8000-000000000001', 'atomic-safe@example.test'),
  ('9b000000-0000-4000-8000-000000000002', 'atomic-unsafe@example.test'),
  ('9b000000-0000-4000-8000-000000000003', 'atomic-incomplete@example.test'),
  ('9b000000-0000-4000-8000-000000000004', 'atomic-stale@example.test');
insert into public.profiles(
  id, user_id, phone_number, phone_verified, identity_status,
  profile_completed, discoverable_in_vibes, profile_moderation_state
) values
  ('9b000000-0000-4000-8000-000000000001', '9b000000-0000-4000-8000-000000000001',
   '+447700901001', true, 'pending_onboarding', false, false, 'CLEAR'),
  ('9b000000-0000-4000-8000-000000000002', '9b000000-0000-4000-8000-000000000002',
   '+447700901002', true, 'pending_onboarding', false, false, 'CLEAR'),
  ('9b000000-0000-4000-8000-000000000003', '9b000000-0000-4000-8000-000000000003',
   '+447700901003', true, 'pending_onboarding', false, false, 'CLEAR'),
  ('9b000000-0000-4000-8000-000000000004', '9b000000-0000-4000-8000-000000000004',
   '+447700901004', true, 'pending_onboarding', false, false, 'CLEAR');
select set_config('app.profile_guard_write', 'off', true);

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);

select is(
  (public.rpc_service_complete_profile_onboarding_with_guard_v1(
    '9b000000-0000-4000-8000-000000000001',
    '{"full_name":"Safe Member","bio":"I enjoy museums and weekend walks.","age":31,"gender":"FEMALE"}'::jsonb,
    (select updated_at from public.profiles
     where user_id = '9b000000-0000-4000-8000-000000000001'),
    '{"profile_updates":{"bio":"I enjoy museums and weekend walks."}}'::jsonb
  )->>'ok')::boolean,
  true,
  'safe onboarding transaction succeeds'
);
select is(
  (select profile_completed from public.profiles
   where user_id = '9b000000-0000-4000-8000-000000000001'),
  true,
  'safe onboarding is completed atomically'
);
select is(
  (select bio from public.profiles
   where user_id = '9b000000-0000-4000-8000-000000000001'),
  'I enjoy museums and weekend walks.',
  'safe guarded fields are persisted'
);
select is(
  (select identity_status from public.profiles
   where user_id = '9b000000-0000-4000-8000-000000000001'),
  'active',
  'identity becomes active in the same transaction'
);

select is(
  (public.rpc_service_complete_profile_onboarding_with_guard_v1(
    '9b000000-0000-4000-8000-000000000001',
    '{"bio":"Subscribe to my private photos away from this app."}'::jsonb,
    null,
    '{}'::jsonb
  )->>'already_completed')::boolean,
  true,
  'a lost successful response can be retried idempotently'
);
select is(
  (select bio from public.profiles
   where user_id = '9b000000-0000-4000-8000-000000000001'),
  'I enjoy museums and weekend walks.',
  'an onboarding retry cannot mutate a completed profile'
);

select is(
  (public.rpc_service_complete_profile_onboarding_with_guard_v1(
    '9b000000-0000-4000-8000-000000000002',
    '{"full_name":"Unsafe Member","bio":"Subscribe to my private photos away from this app.","age":31,"gender":"FEMALE"}'::jsonb,
    (select updated_at from public.profiles
     where user_id = '9b000000-0000-4000-8000-000000000002'),
    '{"profile_updates":{"bio":"Subscribe to my private photos away from this app."}}'::jsonb
  )->>'ok')::boolean,
  false,
  'unsafe onboarding is rejected by the authoritative Guard'
);
select is(
  (select profile_completed from public.profiles
   where user_id = '9b000000-0000-4000-8000-000000000002'),
  false,
  'unsafe onboarding is not completed'
);
select ok(
  (select profile_moderation_state in ('ACTION_REQUIRED', 'RESTRICTED')
   from public.profiles
   where user_id = '9b000000-0000-4000-8000-000000000002'),
  'unsafe onboarding records an enforcement state'
);

select throws_ok($sql$
  select public.rpc_service_complete_profile_onboarding_with_guard_v1(
    '9b000000-0000-4000-8000-000000000003',
    '{"full_name":"Incomplete Member","bio":"A safe biography.","gender":"FEMALE"}'::jsonb,
    (select updated_at from public.profiles
     where user_id = '9b000000-0000-4000-8000-000000000003'),
    '{}'::jsonb
  )
$sql$, '42501', 'ONBOARDING_REQUIREMENTS_NOT_MET',
  'incomplete onboarding fails as one transaction'
);
select is(
  (select bio from public.profiles
   where user_id = '9b000000-0000-4000-8000-000000000003'),
  null,
  'failed completion rolls back guarded field writes'
);

select throws_ok($sql$
  select public.rpc_service_complete_profile_onboarding_with_guard_v1(
    '9b000000-0000-4000-8000-000000000004',
    '{"full_name":"Stale Member","bio":"A safe biography.","age":31,"gender":"FEMALE"}'::jsonb,
    timezone('utc', now()) - interval '1 day',
    '{}'::jsonb
  )
$sql$, '40001', 'PROFILE_WRITE_CONFLICT',
  'stale onboarding submissions cannot overwrite newer state'
);

reset role;
select * from finish();
rollback;
