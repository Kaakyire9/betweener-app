begin;

create extension if not exists pgtap with schema extensions;
select plan(13);

select set_config('app.profile_guard_write', 'on', true);
insert into auth.users(id, email) values
  ('9a000000-0000-4000-8000-000000000001', 'legacy-safe@example.test'),
  ('9a000000-0000-4000-8000-000000000002', 'legacy-unsafe@example.test'),
  ('9a000000-0000-4000-8000-000000000003', 'legacy-upsert@example.test');
insert into public.profiles(
  id, user_id, full_name, bio, age, gender, phone_number, phone_verified,
  identity_status, profile_completed, discoverable_in_vibes,
  profile_moderation_state, city, region, current_country, location
) values
  ('9a000000-0000-4000-8000-000000000001', '9a000000-0000-4000-8000-000000000001',
   null, null, null, null, '+447700900101', true, 'pending_onboarding', false, false, 'CLEAR',
   null, null, null, null),
  ('9a000000-0000-4000-8000-000000000002', '9a000000-0000-4000-8000-000000000002',
   null, null, null, null, '+447700900102', true, 'pending_onboarding', false, false, 'CLEAR',
   null, null, null, null),
  ('9a000000-0000-4000-8000-000000000003', '9a000000-0000-4000-8000-000000000003',
   null, null, null, null, '+447700900103', true, 'pending_onboarding', false, false, 'CLEAR',
   null, null, null, null);
select set_config('app.profile_guard_write', 'off', true);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '9a000000-0000-4000-8000-000000000001', true);

select lives_ok($sql$
  update public.profiles set
    full_name = 'Safe Member', bio = 'I enjoy museums and weekend walks.',
    age = 31, gender = 'FEMALE', city = 'London', region = 'Greater London',
    current_country = 'United Kingdom', location = 'London, Greater London, United Kingdom',
    profile_completed = true, identity_status = 'active',
    onboarding_completed_at = timezone('utc', now()),
    identity_finalized_at = timezone('utc', now())
  where user_id = '9a000000-0000-4000-8000-000000000001'
$sql$, 'legacy production client can complete a safe owned profile once');

select is(
  (select profile_completed from public.profiles
   where user_id = '9a000000-0000-4000-8000-000000000001'),
  true,
  'safe legacy onboarding completion is persisted'
);

select lives_ok($sql$
  update public.profiles set bio = 'A different biography after onboarding.'
  where user_id = '9a000000-0000-4000-8000-000000000001'
$sql$, 'released production clients can save a deterministic-safe profile edit');

select is(
  (select bio from public.profiles
   where user_id = '9a000000-0000-4000-8000-000000000001'),
  'A different biography after onboarding.',
  'safe released-client profile edit is persisted'
);

select throws_ok($sql$
  update public.profiles set bio = 'Subscribe to my private photos away from this app.'
  where user_id = '9a000000-0000-4000-8000-000000000001'
$sql$, '42501', 'PROFILE_CONTENT_NOT_ALLOWED',
  'released-client profile edits still cannot bypass deterministic solicitation checks');

select set_config('request.jwt.claim.sub', '9a000000-0000-4000-8000-000000000002', true);
select throws_ok($sql$
  update public.profiles set
    full_name = 'Unsafe Member', bio = 'Subscribe to my private photos away from this app.',
    age = 31, gender = 'FEMALE', city = 'London', region = 'Greater London',
    current_country = 'United Kingdom', location = 'London, Greater London, United Kingdom',
    profile_completed = true, identity_status = 'active',
    onboarding_completed_at = timezone('utc', now()),
    identity_finalized_at = timezone('utc', now())
  where user_id = '9a000000-0000-4000-8000-000000000002'
$sql$, '42501', 'PROFILE_CONTENT_NOT_ALLOWED',
  'legacy compatibility still blocks deterministic solicitation');

select set_config('request.jwt.claim.sub', '9a000000-0000-4000-8000-000000000001', true);
select lives_ok($sql$
  update public.profiles set full_name = 'Cross-account overwrite'
  where user_id = '9a000000-0000-4000-8000-000000000002'
$sql$, 'cross-account update is safely filtered by row-level security');

reset role;
select is(
  (select full_name from public.profiles
   where user_id = '9a000000-0000-4000-8000-000000000002'),
  null,
  'legacy compatibility cannot change another member profile'
);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '9a000000-0000-4000-8000-000000000003', true);

select lives_ok($sql$
  insert into public.profiles(
    user_id, full_name, bio, age, gender, phone_number, phone_verified,
    identity_status, profile_completed, onboarding_completed_at,
    identity_finalized_at, city, region, current_country, location
  ) values (
    '9a000000-0000-4000-8000-000000000003', 'Safe Upsert Member',
    'I enjoy museums and weekend walks.', 31, 'FEMALE', '+447700900103', true,
    'active', true, timezone('utc', now()), timezone('utc', now()),
    'London', 'Greater London', 'United Kingdom', 'London'
  ) on conflict (user_id) do update set
    full_name = excluded.full_name,
    bio = excluded.bio,
    age = excluded.age,
    gender = excluded.gender,
    phone_number = excluded.phone_number,
    phone_verified = excluded.phone_verified,
    identity_status = excluded.identity_status,
    profile_completed = excluded.profile_completed,
    onboarding_completed_at = excluded.onboarding_completed_at,
    identity_finalized_at = excluded.identity_finalized_at,
    city = excluded.city,
    region = excluded.region,
    current_country = excluded.current_country,
    location = excluded.location
$sql$, 'released-client upsert can complete a safe existing partial profile');

select is(
  (select profile_completed from public.profiles
   where user_id = '9a000000-0000-4000-8000-000000000003'),
  true,
  'released-client upsert completion is persisted'
);

select lives_ok($sql$
  insert into public.profiles(user_id, full_name, bio, age, gender, updated_at)
  values (
    '9a000000-0000-4000-8000-000000000003', 'Safe Upsert Member',
    'A safe profile edit from the released app.', 31, 'FEMALE', timezone('utc', now())
  ) on conflict (user_id) do update set
    full_name = excluded.full_name,
    bio = excluded.bio,
    age = excluded.age,
    gender = excluded.gender,
    updated_at = excluded.updated_at
$sql$, 'released-client upsert can edit an existing completed profile');

select is(
  (select bio from public.profiles
   where user_id = '9a000000-0000-4000-8000-000000000003'),
  'A safe profile edit from the released app.',
  'released-client upsert profile edit is persisted'
);

select throws_ok($sql$
  insert into public.profiles(user_id, full_name, bio, age, gender, updated_at)
  values (
    '9a000000-0000-4000-8000-000000000003', 'Unsafe Upsert Member',
    'Message me on WhatsApp +44 7000 000003', 31, 'FEMALE', timezone('utc', now())
  ) on conflict (user_id) do update set
    full_name = excluded.full_name,
    bio = excluded.bio,
    age = excluded.age,
    gender = excluded.gender,
    updated_at = excluded.updated_at
$sql$, '42501', 'PROFILE_CONTENT_NOT_ALLOWED',
  'released-client upsert still blocks contact solicitation'
);

reset role;
select * from finish();
rollback;
