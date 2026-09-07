begin;

create extension if not exists pgtap with schema extensions;
select plan(35);

select has_column('public', 'live_sessions', 'creation_request_id', 'Studio request identity is installed');
select has_column('public', 'live_sessions', 'schedule_revision', 'schedule revisions are installed');
select has_column('public', 'live_sessions', 'archived_at', 'owner archive state is installed');
select has_column('public', 'live_participants', 'rsvp_status', 'RSVP state remains explicit');
select ok(
  to_regprocedure('public.rpc_list_live_studio_sessions(integer,timestamptz)') is not null,
  'the production 1.1.1 catalogue RPC remains installed'
);
select ok(
  to_regprocedure('public.rpc_list_live_studio_sessions_v2(integer,timestamptz)') is not null,
  'the expanded Studio catalogue is separately versioned'
);

select ok(not has_function_privilege('public', 'public.rpc_schedule_live_studio_session_v1(uuid,text,text,timestamptz,integer,text,boolean,uuid,integer)', 'EXECUTE'), 'PUBLIC cannot publish Studio Lives');
select ok(not has_function_privilege('anon', 'public.rpc_update_live_studio_session_v1(uuid,bigint,text,text,timestamptz,integer,boolean,integer)', 'EXECUTE'), 'anon cannot edit Studio Lives');
select ok(has_function_privilege('authenticated', 'public.rpc_schedule_live_studio_session_v1(uuid,text,text,timestamptz,integer,text,boolean,uuid,integer)', 'EXECUTE'), 'authenticated creators can publish through Studio');
select ok(has_function_privilege('authenticated', 'public.rpc_update_live_studio_session_v1(uuid,bigint,text,text,timestamptz,integer,boolean,integer)', 'EXECUTE'), 'authenticated owners can use controlled edits');
select ok(has_function_privilege('authenticated', 'public.rpc_cancel_live_studio_session_v1(uuid,bigint,text)', 'EXECUTE'), 'authenticated owners can use controlled cancellation');
select ok(has_function_privilege('authenticated', 'public.rpc_archive_live_studio_session_v1(uuid,bigint)', 'EXECUTE'), 'authenticated owners can use controlled archiving');
select ok(has_function_privilege('authenticated', 'public.rpc_list_live_studio_sessions_v2(integer,timestamptz)', 'EXECUTE'), 'authenticated members can use the versioned Studio catalogue');
select ok((
  select index_metadata.indisunique
    and index_metadata.indisvalid
    and index_metadata.indisready
  from pg_index index_metadata
  where index_metadata.indexrelid =
    to_regclass('public.live_sessions_creator_request_unique_idx')
), 'the concurrent request-id index is unique, ready and valid');
select ok((
  select index_metadata.indisvalid and index_metadata.indisready
  from pg_index index_metadata
  where index_metadata.indexrelid =
    to_regclass('public.live_sessions_owner_archive_idx')
), 'the concurrent owner archive index is ready and valid');
select is((
  select count(*)::integer
  from pg_constraint constraint_metadata
  where constraint_metadata.conrelid in (
      'public.live_sessions'::regclass,
      'public.live_participants'::regclass
    )
    and constraint_metadata.conname in (
      'live_sessions_scheduled_duration_valid',
      'live_sessions_schedule_revision_valid',
      'live_sessions_cancellation_reason_valid',
      'live_participants_rsvp_status_valid'
    )
    and constraint_metadata.convalidated
), 4, 'all expand-first Studio constraints are validated');

insert into auth.users(id, email) values
  ('7a000000-0000-4000-8000-000000000001', 'studio-host@example.test'),
  ('7a000000-0000-4000-8000-000000000002', 'studio-guest@example.test');

select set_config('app.profile_guard_write', 'on', true);
insert into public.profiles(
  id, user_id, full_name, age, gender, profile_completed, verification_level,
  min_age_interest, max_age_interest, age_preference_confirmed_at,
  phone_verified, phone_number, identity_status, region
) values
  ('7b000000-0000-4000-8000-000000000001', '7a000000-0000-4000-8000-000000000001', 'Studio Host', 35, 'FEMALE', true, 1, 25, 45, now(), true, '+447000001001', 'active', 'London'),
  ('7b000000-0000-4000-8000-000000000002', '7a000000-0000-4000-8000-000000000002', 'Studio Guest', 36, 'MALE', true, 1, 25, 45, now(), true, '+447000001002', 'active', 'London');
select set_config('app.profile_guard_write', 'off', true);

insert into public.live_creator_eligibility(user_id, granted_by_user_id, allowed_context_types)
values (
  '7a000000-0000-4000-8000-000000000001',
  '7a000000-0000-4000-8000-000000000001',
  array['global']::text[]
);

select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '7a000000-0000-4000-8000-000000000001', true);

select lives_ok(
  $$ select public.rpc_schedule_live_studio_session_v1(
    '7c000000-0000-4000-8000-000000000001', 'Studio premiere',
    'A thoughtful opening room.', now() + interval '2 days', 60,
    'hosted_match_night', true, null, 2
  ) $$,
  'a verified eligible host can publish a Studio Live'
);

select is((
  select count(*)::integer from public.live_sessions
  where creation_request_id = '7c000000-0000-4000-8000-000000000001'
), 1, 'publication creates one authoritative Live row');

select lives_ok(
  $$ select public.rpc_schedule_live_studio_session_v1(
    '7c000000-0000-4000-8000-000000000001', 'Ignored retry title',
    'Retry.', now() + interval '3 days', 90,
    'hosted_match_night', false, null, 2
  ) $$,
  'retrying the same creation request succeeds idempotently'
);

select is((
  select count(*)::integer from public.live_sessions
  where creation_request_id = '7c000000-0000-4000-8000-000000000001'
), 1, 'an idempotent retry cannot manufacture a second room');

select is((
  select scheduled_duration_minutes from public.live_sessions
  where creation_request_id = '7c000000-0000-4000-8000-000000000001'
), 60, 'the initial duration remains authoritative after a retry');

select is((
  select count(*)::integer from public.rpc_list_live_studio_sessions(30, null)
  where id = (select id from public.live_sessions
    where creation_request_id = '7c000000-0000-4000-8000-000000000001')
), 1, 'the unchanged 1.1.1 catalogue can still read a Studio-created room');

select set_config('request.jwt.claim.sub', '7a000000-0000-4000-8000-000000000002', true);
select lives_ok(
  $$ select public.rpc_rsvp_live_session(
    (select id from public.live_sessions where creation_request_id = '7c000000-0000-4000-8000-000000000001'),
    true,
    true
  ) $$,
  'a guest can save a place before a reschedule'
);

select set_config('request.jwt.claim.sub', '7a000000-0000-4000-8000-000000000001', true);
select lives_ok(
  $$ select public.rpc_update_live_studio_session_v1(
    (select id from public.live_sessions where creation_request_id = '7c000000-0000-4000-8000-000000000001'),
    (select version from public.live_sessions where creation_request_id = '7c000000-0000-4000-8000-000000000001'),
    'Studio premiere — new time', 'A thoughtful opening room.',
    now() + interval '4 days', 90, true, 2
  ) $$,
  'the owner can reschedule with an optimistic version'
);

select is((
  select rsvp_status from public.live_participants
  where session_id = (select id from public.live_sessions where creation_request_id = '7c000000-0000-4000-8000-000000000001')
    and user_id = '7a000000-0000-4000-8000-000000000002'
), 'needs_reconfirmation', 'rescheduling makes guest consent explicit again');

select is((
  select schedule_revision from public.live_sessions
  where creation_request_id = '7c000000-0000-4000-8000-000000000001'
), 1, 'rescheduling increments the schedule revision');

select is((
  select status from public.live_sessions
  where creation_request_id = '7c000000-0000-4000-8000-000000000001'
), 'waiting_for_quorum', 'rescheduling cannot preserve stale quorum confirmation');

select throws_ok(
  $$ select public.rpc_update_live_studio_session_v1(
    (select id from public.live_sessions where creation_request_id = '7c000000-0000-4000-8000-000000000001'),
    1, 'Stale edit', null, now() + interval '5 days', 60, false, 2
  ) $$,
  '40001', 'live_session_version_conflict',
  'stale Studio edits are rejected'
);

select set_config('request.jwt.claim.sub', '7a000000-0000-4000-8000-000000000002', true);
select throws_ok(
  $$ select public.rpc_cancel_live_studio_session_v1(
    (select id from public.live_sessions where creation_request_id = '7c000000-0000-4000-8000-000000000001'),
    (select version from public.live_sessions where creation_request_id = '7c000000-0000-4000-8000-000000000001'),
    'plans_changed'
  ) $$,
  '42501', 'live_studio_manage_forbidden',
  'a guest cannot cancel the host room'
);

select set_config('request.jwt.claim.sub', '7a000000-0000-4000-8000-000000000001', true);
select lives_ok(
  $$ select public.rpc_cancel_live_studio_session_v1(
    (select id from public.live_sessions where creation_request_id = '7c000000-0000-4000-8000-000000000001'),
    (select version from public.live_sessions where creation_request_id = '7c000000-0000-4000-8000-000000000001'),
    'host_unavailable'
  ) $$,
  'the owner can cancel before going Live'
);

select is((
  select status || ':' || cancellation_reason from public.live_sessions
  where creation_request_id = '7c000000-0000-4000-8000-000000000001'
), 'cancelled:host_unavailable', 'cancellation retains a structured guest-safe outcome');

select is((
  select from_state from public.live_session_events
  where session_id = (select id from public.live_sessions where creation_request_id = '7c000000-0000-4000-8000-000000000001')
    and event_type = 'studio_session_cancelled'
  order by id desc limit 1
), 'waiting_for_quorum', 'the cancellation audit preserves the prior state');

select lives_ok(
  $$ select public.rpc_archive_live_studio_session_v1(
    (select id from public.live_sessions where creation_request_id = '7c000000-0000-4000-8000-000000000001'),
    (select version from public.live_sessions where creation_request_id = '7c000000-0000-4000-8000-000000000001')
  ) $$,
  'the owner can archive a cancelled Live'
);

select ok((
  select archived_at is not null from public.live_sessions
  where creation_request_id = '7c000000-0000-4000-8000-000000000001'
), 'archiving keeps the authoritative row and marks it hidden');

select is((
  select count(*)::integer from public.rpc_list_live_studio_sessions_v2(30, null)
  where id = (select id from public.live_sessions where creation_request_id = '7c000000-0000-4000-8000-000000000001')
), 0, 'an archived room leaves its owner Studio catalogue');

select * from finish();
rollback;
