begin;

create extension if not exists pgtap with schema extensions;
select plan(55);

select has_table('public', 'live_odo_configuration', 'Odo configuration is installed');
select has_table('public', 'live_odo_session_state', 'Odo session state is installed');
select has_table('public', 'live_odo_ai_usage', 'Odo usage ledger is installed');
select has_table('public', 'live_odo_action_attempts', 'Odo action attempts are installed');
select has_table('public', 'live_odo_budget_windows', 'Odo budget windows are installed');
select has_table('public', 'live_director_events', 'director events are installed');
select has_table('public', 'live_director_updates', 'director invalidations are installed');
select has_table('public', 'live_odo_trace_events', 'admin traces are installed');
select has_column('public', 'live_director_events', 'visibility', 'director event visibility is explicit');
select has_column('public', 'live_director_events', 'action_id', 'director events can correlate a safe action ID');
select has_column('public', 'live_director_events', 'expires_at', 'director events carry bounded expiry');

select is((
  select concat_ws(':', odo_enabled, shadow_mode, copilot_enabled,
    autopilot_enabled, conversation_spark_enabled, audience_pulse_enabled, music_enabled)
  from public.live_odo_configuration where id = true
), 'f:t:f:f:f:f:f', 'Phase 10A defaults are shadow-only');

select ok(to_regprocedure('public.rpc_service_begin_live_odo_call_v1(uuid,uuid,uuid,uuid,text,text,text,text,text)') is not null, 'begin RPC exists');
select ok(to_regprocedure('public.rpc_service_evaluate_live_odo_action_v1(uuid,uuid,jsonb,boolean,text,text,bigint,bigint,bigint,integer,boolean,text)') is not null, 'evaluate RPC exists');
select ok(to_regprocedure('public.rpc_service_renew_live_odo_lease_v1(uuid,uuid,bigint)') is not null, 'lease renewal RPC exists');
select ok(to_regprocedure('public.rpc_service_fail_live_odo_call_v1(uuid,uuid,text,boolean)') is not null, 'failure RPC exists');
select ok(to_regprocedure('public.rpc_take_over_live_odo_v1(uuid)') is not null, 'host takeover RPC exists');
select ok(to_regprocedure('public.rpc_get_live_director_snapshot_v1(uuid,bigint,integer)') is not null, 'snapshot RPC exists');
select ok(to_regprocedure('public.live_odo_append_director_event_v1(uuid,integer,text,text,text,uuid,uuid,jsonb,timestamptz)') is not null, 'versioned visibility-aware event primitive exists');

select ok(not has_function_privilege('authenticated', 'public.rpc_service_begin_live_odo_call_v1(uuid,uuid,uuid,uuid,text,text,text,text,text)', 'EXECUTE'), 'authenticated cannot begin service calls');
select ok(not has_function_privilege('authenticated', 'public.rpc_service_evaluate_live_odo_action_v1(uuid,uuid,jsonb,boolean,text,text,bigint,bigint,bigint,integer,boolean,text)', 'EXECUTE'), 'authenticated cannot evaluate actions');
select ok(has_function_privilege('service_role', 'public.rpc_service_begin_live_odo_call_v1(uuid,uuid,uuid,uuid,text,text,text,text,text)', 'EXECUTE'), 'service role can use narrow begin RPC');
select ok(has_function_privilege('service_role', 'public.rpc_service_evaluate_live_odo_action_v1(uuid,uuid,jsonb,boolean,text,text,bigint,bigint,bigint,integer,boolean,text)', 'EXECUTE'), 'service role can use narrow evaluate RPC');
select ok(has_function_privilege('authenticated', 'public.rpc_take_over_live_odo_v1(uuid)', 'EXECUTE'), 'authenticated hosts can request takeover');
select ok(has_function_privilege('authenticated', 'public.rpc_get_live_director_snapshot_v1(uuid,bigint,integer)', 'EXECUTE'), 'authenticated viewers can request filtered snapshots');

select ok((select indisvalid and indisready from pg_index where indexrelid = 'public.live_director_events_idempotency_unique'::regclass), 'event idempotency index is ready');
select ok((select indisvalid and indisready from pg_index where indexrelid = 'public.live_odo_usage_open_idx'::regclass), 'open-call index is ready');
select ok((select indisvalid and indisready from pg_index where indexrelid = 'public.live_odo_session_active_lease_idx'::regclass), 'active-lease index is ready');

select is((
  select count(*)::integer from pg_constraint
  where conrelid in ('public.live_odo_session_state'::regclass, 'public.live_odo_ai_usage'::regclass, 'public.live_odo_action_attempts'::regclass)
    and conname in ('live_odo_session_lease_shape','live_odo_usage_completion_shape','live_odo_action_shadow_only')
    and convalidated
), 3, 'all delayed Phase 10A constraints are validated');

select is(public.live_odo_validate_action_payload_v1('WAIT', '{"waitMs":5000}'::jsonb), null, 'bounded WAIT is valid');
select is(public.live_odo_validate_action_payload_v1('SHOW_INTERMISSION', '{"durationSeconds":30,"copy":"https://unsafe.test","locale":"en"}'::jsonb), 'forbidden_control_data', 'URLs are rejected');
select is(public.live_odo_validate_action_payload_v1('CALL_RPC', '{}'::jsonb), 'unknown_action_type', 'arbitrary actions are rejected');
select ok((select task_call_limits_per_minute ?& array[
  'director_action','conversation_spark','audience_pulse','intermission_copy'
] from public.live_odo_configuration where id = true), 'task-specific call budgets are configured');

select ok(pg_get_functiondef('public.rpc_service_evaluate_live_odo_action_v1(uuid,uuid,jsonb,boolean,text,text,bigint,bigint,bigint,integer,boolean,text)'::regprocedure) not like '%insert into public.live_director_events%', 'evaluate never emits participant-visible events');

select set_config('request.jwt.claim.role', 'service_role', true);
select throws_ok(
  $$ select public.live_odo_append_director_event_v1(
    gen_random_uuid(), 1, 'ODO_ACTION_SHADOW_APPROVED', 'odo', 'participant',
    gen_random_uuid(), gen_random_uuid(), '{}'::jsonb, now() + interval '1 minute'
  ) $$,
  '55000', 'live_odo_phase10a_shadow_only',
  'Odo director events are hard-disabled in Phase 10A'
);

select is((
  select count(*)::integer from pg_class
  where oid in (
    'public.live_odo_configuration'::regclass, 'public.live_odo_session_state'::regclass,
    'public.live_odo_ai_usage'::regclass, 'public.live_odo_action_attempts'::regclass,
    'public.live_odo_budget_windows'::regclass, 'public.live_director_events'::regclass,
    'public.live_director_updates'::regclass, 'public.live_odo_trace_events'::regclass
  ) and relrowsecurity
), 8, 'RLS is enabled on every Phase 10A table');

select ok(not has_table_privilege('authenticated', 'public.live_odo_action_attempts', 'INSERT,UPDATE,DELETE'), 'authenticated has no direct action writes');

insert into auth.users(id, email) values
  ('9a000000-0000-4000-8000-000000000001', 'odo-host@example.test');
select set_config('app.profile_guard_write', 'on', true);
insert into public.profiles(
  id, user_id, full_name, age, gender, profile_completed, verification_level,
  min_age_interest, max_age_interest, age_preference_confirmed_at,
  phone_verified, phone_number, identity_status, region
) values (
  '9b000000-0000-4000-8000-000000000001',
  '9a000000-0000-4000-8000-000000000001',
  'Odo Host', 35, 'FEMALE', true, 1, 25, 45, now(),
  true, '+447000009001', 'active', 'London'
);
select set_config('app.profile_guard_write', 'off', true);
insert into public.live_sessions(
  id, title, format, status, context_type, created_by_user_id,
  created_by_profile_id, provider_call_id
) values (
  '9c000000-0000-4000-8000-000000000001', 'Odo shadow test',
  'hosted_match_night', 'live', 'global',
  '9a000000-0000-4000-8000-000000000001',
  '9b000000-0000-4000-8000-000000000001', 'odo_shadow_test_call'
);
insert into public.live_participants(
  session_id, user_id, profile_id, origin_context_type, role, state, stage_slot
) values (
  '9c000000-0000-4000-8000-000000000001',
  '9a000000-0000-4000-8000-000000000001',
  '9b000000-0000-4000-8000-000000000001',
  'global', 'host', 'on_stage', 1
);
update public.live_odo_configuration
set odo_enabled = true, minimum_call_interval_seconds = 1
where id = true;
select set_config('request.jwt.claim.role', 'service_role', true);
select set_config('request.jwt.claim.sub', '', true);

create temporary table odo_first_acquire as
select public.rpc_service_begin_live_odo_call_v1(
  '9c000000-0000-4000-8000-000000000001',
  '9a000000-0000-4000-8000-000000000001',
  '9d000000-0000-4000-8000-000000000001',
  '9e000000-0000-4000-8000-000000000001',
  'director_action', 'fake', 'luna', 'test-luna', 'routine_default'
) as payload;

select is((select payload->>'allowed' from odo_first_acquire), 'true', 'authorized Host shadow call acquires a lease');
select ok((select payload->'snapshot' ? 'latestSequenceNumber' from odo_first_acquire), 'snapshot exposes the stable sequenceNumber anchor');
select is((select status from public.live_odo_ai_usage where action_id = '9e000000-0000-4000-8000-000000000001'), 'started', 'acquire records an in-flight usage row');
select is((select lease_generation from public.live_odo_session_state where session_id = '9c000000-0000-4000-8000-000000000001'), 1::bigint, 'first lease has generation one');
select is((select public.rpc_service_begin_live_odo_call_v1(
  '9c000000-0000-4000-8000-000000000001',
  '9a000000-0000-4000-8000-000000000001',
  '9d000000-0000-4000-8000-000000000001',
  '9e000000-0000-4000-8000-000000000002',
  'director_action', 'fake', 'luna', 'test-luna', 'routine_default'
)->>'reasonCode'), 'lease_held', 'a concurrent owner cannot steal a live lease');

create temporary table odo_first_evaluation as
select public.rpc_service_evaluate_live_odo_action_v1(
  (select (payload->>'callId')::uuid from odo_first_acquire),
  '9d000000-0000-4000-8000-000000000001',
  jsonb_build_object(
    'schemaVersion', 1,
    'actionId', '9e000000-0000-4000-8000-000000000001',
    'sessionId', '9c000000-0000-4000-8000-000000000001',
    'snapshotVersion', (select (payload->'snapshot'->>'currentStateVersion')::bigint from odo_first_acquire),
    'leaseGeneration', (select (payload->>'leaseGeneration')::bigint from odo_first_acquire),
    'type', 'WAIT', 'reasonCode', 'test_wait',
    'expiresAt', to_char(timezone('utc', now() + interval '10 seconds'), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'payload', jsonb_build_object('waitMs', 5000)
  ),
  true, 'content_not_present', 'test-request-1', 100, 20, 10, 50, false, null
) as payload;

select is((select payload->>'policyOutcome' from odo_first_evaluation), 'shadow_approved', 'fresh bounded action is shadow-approved');
select is((select count(*)::integer from public.live_odo_action_attempts where action_id = '9e000000-0000-4000-8000-000000000001'), 1, 'one action attempt is persisted');
select is((select count(*)::integer from public.live_director_events where session_id = '9c000000-0000-4000-8000-000000000001'), 0, 'shadow approval emits no director event');
select is((select public.rpc_service_evaluate_live_odo_action_v1(
  (select (payload->>'callId')::uuid from odo_first_acquire),
  '9d000000-0000-4000-8000-000000000001',
  jsonb_build_object(
    'schemaVersion', 1, 'actionId', '9e000000-0000-4000-8000-000000000001',
    'sessionId', '9c000000-0000-4000-8000-000000000001',
    'snapshotVersion', (select (payload->'snapshot'->>'currentStateVersion')::bigint from odo_first_acquire),
    'leaseGeneration', 1, 'type', 'WAIT', 'reasonCode', 'test_wait',
    'expiresAt', to_char(timezone('utc', now() + interval '10 seconds'), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'payload', jsonb_build_object('waitMs', 5000)
  ), true, 'content_not_present', 'test-request-1', 100, 20, 10, 50, false, null
)->>'idempotent'), 'true', 'repeated evaluation is idempotent');
select is((select status from public.live_odo_ai_usage where action_id = '9e000000-0000-4000-8000-000000000001'), 'succeeded', 'usage reaches a terminal success state');
select is((select count(*)::integer from public.live_odo_trace_events
  where session_id = '9c000000-0000-4000-8000-000000000001'
    and trace_type in (
      'odo_model_routed','odo_director_call_started','odo_director_call_succeeded',
      'odo_action_proposed','odo_action_shadow_approved'
    )), 5, 'successful shadow evaluation emits the required safe telemetry');
select is((select s.status || ':' || p.state from public.live_sessions s join public.live_participants p on p.session_id = s.id where s.id = '9c000000-0000-4000-8000-000000000001'), 'live:on_stage', 'shadow evaluation cannot alter Live or participant state');

update public.live_odo_session_state set last_decision_at = now() - interval '2 seconds'
where session_id = '9c000000-0000-4000-8000-000000000001';
create temporary table odo_second_acquire as
select public.rpc_service_begin_live_odo_call_v1(
  '9c000000-0000-4000-8000-000000000001',
  '9a000000-0000-4000-8000-000000000001',
  '9d000000-0000-4000-8000-000000000003',
  '9e000000-0000-4000-8000-000000000003',
  'director_action', 'fake', 'luna', 'test-luna', 'routine_default'
) as payload;
select is((select payload->>'allowed' from odo_second_acquire), 'true', 'a later call receives a new fenced lease');

select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '9a000000-0000-4000-8000-000000000001', true);
select is(public.rpc_take_over_live_odo_v1('9c000000-0000-4000-8000-000000000001')->>'takenOver', 'true', 'Host takeover fences in-flight work');
select set_config('request.jwt.claim.role', 'service_role', true);
select set_config('request.jwt.claim.sub', '', true);

create temporary table odo_stale_evaluation as
select public.rpc_service_evaluate_live_odo_action_v1(
  (select (payload->>'callId')::uuid from odo_second_acquire),
  '9d000000-0000-4000-8000-000000000003',
  jsonb_build_object(
    'schemaVersion', 1, 'actionId', '9e000000-0000-4000-8000-000000000003',
    'sessionId', '9c000000-0000-4000-8000-000000000001',
    'snapshotVersion', (select (payload->'snapshot'->>'currentStateVersion')::bigint from odo_second_acquire),
    'leaseGeneration', (select (payload->>'leaseGeneration')::bigint from odo_second_acquire),
    'type', 'WAIT', 'reasonCode', 'stale_wait',
    'expiresAt', to_char(timezone('utc', now() + interval '10 seconds'), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'payload', jsonb_build_object('waitMs', 5000)
  ), true, 'content_not_present', 'test-request-2', 100, 0, 10, 50, false, null
) as payload;
select is((select payload->>'policyOutcome' from odo_stale_evaluation), 'rejected', 'a takeover makes the prior inference stale');
select is((select status from public.live_odo_ai_usage where action_id = '9e000000-0000-4000-8000-000000000003'), 'rejected', 'stale inference is terminally recorded');
select is((select count(*)::integer from public.live_director_events where session_id = '9c000000-0000-4000-8000-000000000001'), 0, 'rejected inference also emits no director event');

update public.live_odo_configuration set maximum_calls_per_session = 2 where id = true;
select is((select public.rpc_service_begin_live_odo_call_v1(
  '9c000000-0000-4000-8000-000000000001',
  '9a000000-0000-4000-8000-000000000001',
  '9d000000-0000-4000-8000-000000000004',
  '9e000000-0000-4000-8000-000000000004',
  'director_action', 'fake', 'luna', 'test-luna', 'routine_default'
)->>'reasonCode'), 'session_call_budget_exhausted', 'session call budget stops further provider work');

select * from finish();
rollback;
