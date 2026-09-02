begin;

create extension if not exists pgtap with schema extensions;
select plan(17);

insert into auth.users(id) values
  ('00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-000000000002'),
  ('00000000-0000-4000-8000-000000000003'),
  ('00000000-0000-4000-8000-000000000004'),
  ('00000000-0000-4000-8000-000000000005');

-- This fixture runs as postgres and intentionally seeds complete profiles.
-- Use the same transaction-local trusted-write marker as the service bridge so
-- Profile Guard remains enforced for every untrusted write path.
select set_config('app.profile_guard_write', 'on', true);

insert into public.profiles(
  id, user_id, full_name, age, gender, profile_completed, verification_level,
  min_age_interest, max_age_interest, age_preference_confirmed_at,
  phone_verified, phone_number, identity_status, region
) values
  ('10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 'Host', 40, 'MALE', true, 1, 18, 99, now(), true, '+447000000001', 'active', 'London'),
  ('10000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000002', 'A', 30, 'MALE', true, 1, 25, 30, now(), true, '+447000000002', 'active', 'London'),
  ('10000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000003', 'B', 30, 'FEMALE', true, 1, 30, 35, now(), true, '+447000000003', 'active', 'London'),
  ('10000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-000000000004', 'C', 25, 'FEMALE', true, 1, 30, 30, now(), true, '+447000000004', 'active', 'London'),
  ('10000000-0000-4000-8000-000000000005', '00000000-0000-4000-8000-000000000005', 'D', 35, 'MALE', true, 1, 30, 30, now(), true, '+447000000005', 'active', 'London');

select set_config('app.profile_guard_write', 'off', true);

insert into public.live_sessions(
  id, title, format, status, context_type, created_by_user_id,
  created_by_profile_id, provider_call_id
) values (
  '20000000-0000-4000-8000-000000000001', 'Reliability test', 'quick_connect',
  'live', 'global', '00000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001', 'reliability_test'
);

insert into public.live_participants(
  session_id, user_id, profile_id, origin_context_type, state
) values
  ('20000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'global', 'on_stage'),
  ('20000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002', 'global', 'audience'),
  ('20000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000003', 'global', 'audience'),
  ('20000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000004', 'global', 'audience'),
  ('20000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000005', 'global', 'audience');

insert into public.live_quick_connect_preferences(user_id, allowed_genders, connection_intent) values
  ('00000000-0000-4000-8000-000000000002', array['FEMALE']::public.gender[], 'serious'),
  ('00000000-0000-4000-8000-000000000003', array['MALE']::public.gender[], 'marriage'),
  ('00000000-0000-4000-8000-000000000004', array['MALE']::public.gender[], 'serious'),
  ('00000000-0000-4000-8000-000000000005', array['FEMALE']::public.gender[], 'open');

insert into public.live_quick_connect_participants(session_id, user_id, profile_id) values
  ('20000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002'),
  ('20000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000003'),
  ('20000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000004'),
  ('20000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000005');

select ok(public.live_quick_connect_pair_is_eligible(
  '20000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000002',
  '00000000-0000-4000-8000-000000000003'
), 'verified opposite-sex profiles with reciprocal ages are eligible');

update public.live_quick_connect_preferences
set allowed_genders = array['FEMALE']::public.gender[]
where user_id = '00000000-0000-4000-8000-000000000003';
select ok(public.live_quick_connect_pair_is_eligible(
  '20000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000002',
  '00000000-0000-4000-8000-000000000003'
), 'legacy gender-choice data cannot override automatic opposite-sex eligibility');
update public.live_quick_connect_preferences
set allowed_genders = array['MALE']::public.gender[]
where user_id = '00000000-0000-4000-8000-000000000003';

update public.profiles set gender = 'MALE'
where user_id = '00000000-0000-4000-8000-000000000003';
select ok(not public.live_quick_connect_pair_is_eligible(
  '20000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000002',
  '00000000-0000-4000-8000-000000000003'
), 'same-sex profiles are not eligible for Quick Connect');
update public.profiles set gender = 'FEMALE'
where user_id = '00000000-0000-4000-8000-000000000003';

select is(public.live_quick_connect_intent_compatibility(
  '00000000-0000-4000-8000-000000000002',
  '00000000-0000-4000-8000-000000000004'
)::integer, 4, 'an exact intention match receives highest priority');
select is(public.live_quick_connect_intent_compatibility(
  '00000000-0000-4000-8000-000000000002',
  '00000000-0000-4000-8000-000000000003'
)::integer, 3, 'serious, long-term and marriage intentions remain compatible');
select is(public.live_quick_connect_intent_compatibility(
  '00000000-0000-4000-8000-000000000003',
  '00000000-0000-4000-8000-000000000005'
)::integer, 2, 'open intention remains compatible without becoming a hard rejection');

update public.live_quick_connect_participants
set last_seen_at = now() - interval '46 seconds'
where session_id = '20000000-0000-4000-8000-000000000001'
  and user_id = '00000000-0000-4000-8000-000000000002';
select ok(not public.live_quick_connect_pair_is_eligible(
  '20000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000002',
  '00000000-0000-4000-8000-000000000003'
), 'expired presence lease is rejected');
update public.live_quick_connect_participants set last_seen_at = now()
where session_id = '20000000-0000-4000-8000-000000000001';

insert into public.blocks(blocker_id, blocked_id) values(
  '00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000003'
);
select ok(not public.live_quick_connect_pair_is_eligible(
  '20000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000002',
  '00000000-0000-4000-8000-000000000003'
), 'a block rejects the pair');
delete from public.blocks where blocker_id = '00000000-0000-4000-8000-000000000002';

insert into public.live_quick_connect_safety_holds(
  user_id, distinct_verified_reporters, hold_until
) values ('00000000-0000-4000-8000-000000000002', 2, now() + interval '1 day');
select ok(not public.live_quick_connect_pair_is_eligible(
  '20000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000002',
  '00000000-0000-4000-8000-000000000003'
), 'an active safety hold rejects the pair');
delete from public.live_quick_connect_safety_holds
where user_id = '00000000-0000-4000-8000-000000000002';

insert into public.live_quick_connect_rounds(id, session_id, round_number, state, ends_at, completed_at)
values ('30000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 1, 'cancelled', now() + interval '1 minute', now());
insert into public.live_quick_connect_pairings(
  id, session_id, round_id, participant_a_user_id, participant_a_profile_id,
  participant_b_user_id, participant_b_profile_id, state, provider_call_id,
  ends_at, completed_at, completion_reason, attempt_number
) values (
  '40000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002',
  '10000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000003',
  '10000000-0000-4000-8000-000000000003', 'round_incomplete', 'retry_one',
  now() + interval '1 minute', now(), 'reconnect_grace_expired', 1
);
insert into public.live_quick_connect_safety_checks(
  pairing_id, session_id, reviewer_user_id, reviewed_user_id, status,
  experience, completed_at
) values
  ('40000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000003', 'completed', 'respectful', now()),
  ('40000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000002', 'completed', 'respectful', now());
select ok(public.live_quick_connect_pair_is_eligible(
  '20000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000002',
  '00000000-0000-4000-8000-000000000003'
), 'one respectful technical failure permits one retry');

insert into public.live_quick_connect_rounds(id, session_id, round_number, state, ends_at, completed_at)
values ('30000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001', 2, 'cancelled', now() + interval '1 minute', now());
insert into public.live_quick_connect_pairings(
  id, session_id, round_id, participant_a_user_id, participant_a_profile_id,
  participant_b_user_id, participant_b_profile_id, state, provider_call_id,
  ends_at, completed_at, completion_reason, attempt_number
) values (
  '40000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000002',
  '10000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000003',
  '10000000-0000-4000-8000-000000000003', 'round_incomplete', 'retry_two',
  now() + interval '1 minute', now(), 'reconnect_grace_expired', 2
);
insert into public.live_quick_connect_safety_checks(
  pairing_id, session_id, reviewer_user_id, reviewed_user_id, status,
  experience, completed_at
) values
  ('40000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000003', 'completed', 'respectful', now()),
  ('40000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000002', 'completed', 'respectful', now());
select ok(not public.live_quick_connect_pair_is_eligible(
  '20000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000002',
  '00000000-0000-4000-8000-000000000003'
), 'a second technical attempt exhausts retries');

delete from public.live_quick_connect_pairings
where id in ('40000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000002');
delete from public.live_quick_connect_rounds where round_number in (1, 2)
  and session_id = '20000000-0000-4000-8000-000000000001';

update public.live_quick_connect_controls
set state = 'open', max_concurrent_pairs = 2
where session_id = '20000000-0000-4000-8000-000000000001';
select public.live_quick_connect_sync('20000000-0000-4000-8000-000000000001');

select is((
  select count(*)::integer from public.live_quick_connect_pairings
  where session_id = '20000000-0000-4000-8000-000000000001'
    and state in ('active', 'reconnect_grace')
), 2, 'the host concurrency limit allows exactly two active pairs');

select ok(exists (
  select 1 from public.live_quick_connect_pairings
  where session_id = '20000000-0000-4000-8000-000000000001'
    and least(participant_a_user_id, participant_b_user_id) = '00000000-0000-4000-8000-000000000002'
    and greatest(participant_a_user_id, participant_b_user_id) = '00000000-0000-4000-8000-000000000004'
), 'the most constrained C-A pair is selected');

select ok(exists (
  select 1 from public.live_quick_connect_pairings
  where session_id = '20000000-0000-4000-8000-000000000001'
    and least(participant_a_user_id, participant_b_user_id) = '00000000-0000-4000-8000-000000000003'
    and greatest(participant_a_user_id, participant_b_user_id) = '00000000-0000-4000-8000-000000000005'
), 'the remaining D-B pair is selected instead of stranding both people');

select is((
  select count(*)::integer from public.live_quick_connect_pairings pairing
  join public.live_quick_connect_events event on event.pairing_id = pairing.id
  where pairing.session_id = '20000000-0000-4000-8000-000000000001'
    and event.event_type = 'paired'
    and event.metadata ->> 'algorithm' = 'mutual_constrained_intent_fifo_v2'
    and (event.metadata ->> 'intentCompatibility')::integer between 1 and 4
), 2, 'every pairing records its algorithm audit metadata');

select ok(not exists (
  select 1 from information_schema.role_table_grants
  where table_schema = 'public' and table_name = 'live_quick_connect_preferences'
    and grantee = 'authenticated'
), 'private preferences have no authenticated table grant');

select ok(not exists (
  select 1 from information_schema.role_table_grants
  where table_schema = 'public' and table_name = 'live_quick_connect_safety_holds'
    and grantee = 'authenticated'
), 'safety holds have no authenticated table grant');

select * from finish();
rollback;
