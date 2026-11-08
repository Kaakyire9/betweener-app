-- M0 diagnostic only. Passing assertions REPRODUCE an existing security blocker.
-- This is not a Connect readiness test or a schema migration.
-- Run only against the local supabase_db_betweener-app container as postgres.
-- Synthetic fixtures, push suppression, and every write roll back. RLS and
-- relationship triggers stay enabled during the authenticated attack attempts.
\set ON_ERROR_STOP on
begin;
set local statement_timeout = '20s';
set local lock_timeout = '3s';
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, pg_catalog;
select plan(9);

insert into auth.users(id) values
  ('c0110000-0000-4000-8000-000000000001'),
  ('c0110000-0000-4000-8000-000000000002'),
  ('c0110000-0000-4000-8000-000000000003'),
  ('c0110000-0000-4000-8000-000000000004');

-- Suppress notification production for these synthetic users only.
insert into public.notification_prefs(user_id, push_enabled, matches)
select id, false, false from auth.users
where id in (
  'c0110000-0000-4000-8000-000000000001',
  'c0110000-0000-4000-8000-000000000002',
  'c0110000-0000-4000-8000-000000000003',
  'c0110000-0000-4000-8000-000000000004'
)
on conflict (user_id) do update set push_enabled = false, matches = false;

select set_config('request.jwt.claim.role', 'service_role', true);
select set_config('app.profile_guard_write', 'on', true);
insert into public.profiles(id, user_id, full_name) values
  ('c0120000-0000-4000-8000-000000000001', 'c0110000-0000-4000-8000-000000000001', 'Connect audit caller'),
  ('c0120000-0000-4000-8000-000000000002', 'c0110000-0000-4000-8000-000000000002', 'Connect audit recipient'),
  ('c0120000-0000-4000-8000-000000000003', 'c0110000-0000-4000-8000-000000000003', 'Connect audit outsider'),
  ('c0120000-0000-4000-8000-000000000004', 'c0110000-0000-4000-8000-000000000004', 'Connect audit second recipient');
select set_config('app.profile_guard_write', 'off', true);

insert into public.matches(id, user1_id, user2_id, status) values (
  'c0130000-0000-4000-8000-000000000002',
  'c0120000-0000-4000-8000-000000000001',
  'c0120000-0000-4000-8000-000000000004', 'PENDING'
);

select is((select count(*) from public.intent_requests where actor_id =
  'c0120000-0000-4000-8000-000000000001'), 0::bigint,
  'diagnostic: caller has no Intent Request or recipient approval');
select is((select count(*) from public.swipes where swiper_id in (
  'c0120000-0000-4000-8000-000000000001',
  'c0120000-0000-4000-8000-000000000002',
  'c0120000-0000-4000-8000-000000000004')), 0::bigint,
  'diagnostic: no mutual swipe evidence exists');

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'c0110000-0000-4000-8000-000000000001', true);
select lives_ok($$
  insert into public.matches(id, user1_id, user2_id, status) values (
    'c0130000-0000-4000-8000-000000000001',
    'c0120000-0000-4000-8000-000000000001',
    'c0120000-0000-4000-8000-000000000002', 'ACCEPTED'
  )
$$, 'BLOCKER reproduced: authenticated caller inserts ACCEPTED unilaterally');
select is((select status::text from public.matches where id =
  'c0130000-0000-4000-8000-000000000001'), 'ACCEPTED',
  'BLOCKER reproduced: forged match is visible as ACCEPTED');
select ok(public.can_users_chat(
  'c0110000-0000-4000-8000-000000000001',
  'c0110000-0000-4000-8000-000000000002'
), 'BLOCKER reproduced: legacy relationship helper trusts the forged match');
select lives_ok($$
  update public.matches set status = 'ACCEPTED'
  where id = 'c0130000-0000-4000-8000-000000000002'
$$, 'BLOCKER reproduced: authenticated caller promotes PENDING unilaterally');
select is((select status::text from public.matches where id =
  'c0130000-0000-4000-8000-000000000002'), 'ACCEPTED',
  'BLOCKER reproduced: unilateral promotion persists inside transaction');

select set_config('request.jwt.claim.sub', 'c0110000-0000-4000-8000-000000000003', true);
select throws_ok($$
  insert into public.matches(user1_id, user2_id, status) values (
    'c0120000-0000-4000-8000-000000000001',
    'c0120000-0000-4000-8000-000000000002', 'ACCEPTED'
  )
$$, '42501', 'new row violates row-level security policy for table "matches"',
  'control: unrelated user is denied by actual RLS');

set local role postgres;
select is((select count(*) from private.push_notification_events where
  recipient_user_id in (
    'c0110000-0000-4000-8000-000000000001',
    'c0110000-0000-4000-8000-000000000002',
    'c0110000-0000-4000-8000-000000000003',
    'c0110000-0000-4000-8000-000000000004'
  )), 0::bigint, 'no push events produced for synthetic users');

select * from finish();
rollback;
