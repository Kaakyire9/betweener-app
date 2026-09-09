begin;

create extension if not exists pgtap with schema extensions;
select plan(65);

select has_table('public', 'live_odo_copilot_suggestions', 'Copilot suggestions are installed');
select has_column('public', 'live_odo_configuration', 'pair_narration_enabled', 'pair narration has an independent flag');
select has_column('public', 'live_odo_configuration', 'scene_suggestions_enabled', 'scene suggestions have an independent flag');
select has_column('public', 'live_odo_configuration', 'transition_copy_enabled', 'transition copy has an independent flag');
select ok((select relrowsecurity from pg_class where oid = 'public.live_odo_copilot_suggestions'::regclass), 'suggestions have RLS');
select ok(not has_table_privilege('authenticated', 'public.live_odo_copilot_suggestions', 'INSERT,UPDATE,DELETE'), 'authenticated cannot directly mutate suggestions');
select ok(not has_table_privilege('service_role', 'public.live_odo_copilot_suggestions', 'INSERT,UPDATE,DELETE'), 'service role cannot directly mutate suggestions');
select ok((select convalidated from pg_constraint where conname = 'live_odo_phase10b_human_loop_invariant'), 'human-loop configuration invariant is validated');
select ok((select task_call_limits_per_minute ?& array[
  'conversation_spark','audience_pulse','pair_narration','scene_suggestion',
  'transition_copy','session_welcome','session_closing'
] from public.live_odo_configuration where id = true), 'every Copilot task has a burst budget');
select has_trigger('public', 'live_odo_session_state',
  'live_odo_session_initial_direction_mode', 'new Odo state follows the Copilot direction mode');
select has_trigger('public', 'live_odo_configuration',
  'live_odo_configuration_sync_copilot_direction_mode', 'configuration changes synchronize direction mode');
select has_trigger('public', 'live_participants',
  'live_odo_participant_stage_composition_fence', 'stage changes fence scene suggestions');
select has_trigger('public', 'live_odo_copilot_suggestions',
  'live_odo_copilot_suggestion_normalize', 'scene suggestions are normalized before storage');
select has_trigger('public', 'live_odo_copilot_suggestions',
  'live_odo_copilot_suggestion_task_metric', 'task metrics follow suggestion lifecycle');

select ok(to_regprocedure('public.rpc_service_begin_live_odo_copilot_call_v1(uuid,uuid,uuid,uuid,text,uuid,text,text,text,text)') is not null, 'begin RPC exists');
select ok(to_regprocedure('public.rpc_service_complete_live_odo_copilot_call_v1(uuid,uuid,jsonb,boolean,text,text,bigint,bigint,bigint,integer,boolean,text)') is not null, 'complete RPC exists');
select ok(to_regprocedure('public.rpc_get_live_odo_copilot_v1(uuid,integer)') is not null, 'Host state RPC exists');
select ok(to_regprocedure('public.rpc_manage_live_odo_copilot_suggestion_v1(uuid,text)') is not null, 'Host feedback RPC exists');
select ok(to_regprocedure('public.rpc_use_live_odo_copilot_suggestion_v1(uuid)') is not null, 'Host use RPC exists');
select ok(not has_function_privilege('authenticated', 'public.rpc_service_begin_live_odo_copilot_call_v1(uuid,uuid,uuid,uuid,text,uuid,text,text,text,text)', 'EXECUTE'), 'authenticated cannot begin a service call');
select ok(not has_function_privilege('authenticated', 'public.rpc_service_complete_live_odo_copilot_call_v1(uuid,uuid,jsonb,boolean,text,text,bigint,bigint,bigint,integer,boolean,text)', 'EXECUTE'), 'authenticated cannot complete a service call');
select ok(has_function_privilege('service_role', 'public.rpc_service_begin_live_odo_copilot_call_v1(uuid,uuid,uuid,uuid,text,uuid,text,text,text,text)', 'EXECUTE'), 'service role can begin through the narrow RPC');
select ok(has_function_privilege('service_role', 'public.rpc_service_complete_live_odo_copilot_call_v1(uuid,uuid,jsonb,boolean,text,text,bigint,bigint,bigint,integer,boolean,text)', 'EXECUTE'), 'service role can complete through the narrow RPC');
select ok(has_function_privilege('authenticated', 'public.rpc_get_live_odo_copilot_v1(uuid,integer)', 'EXECUTE'), 'authenticated Hosts can request private state');
select ok(has_function_privilege('authenticated', 'public.rpc_manage_live_odo_copilot_suggestion_v1(uuid,text)', 'EXECUTE'), 'authenticated Hosts can record feedback');
select ok(has_function_privilege('authenticated', 'public.rpc_use_live_odo_copilot_suggestion_v1(uuid)', 'EXECUTE'), 'authenticated Hosts can request use');

insert into auth.users(id, email) values
  ('8a000000-0000-4000-8000-000000000001', 'copilot-host@example.test'),
  ('8a000000-0000-4000-8000-000000000002', 'copilot-guest@example.test'),
  ('8a000000-0000-4000-8000-000000000003', 'copilot-guest-two@example.test');
select set_config('app.profile_guard_write', 'on', true);
insert into public.profiles(
  id, user_id, full_name, age, gender, profile_completed, verification_level,
  min_age_interest, max_age_interest, age_preference_confirmed_at,
  phone_verified, phone_number, identity_status, region
) values
  ('8b000000-0000-4000-8000-000000000001',
   '8a000000-0000-4000-8000-000000000001', 'Copilot Host', 35, 'FEMALE',
   true, 1, 25, 45, now(), true, '+447000008001', 'active', 'London'),
  ('8b000000-0000-4000-8000-000000000002',
   '8a000000-0000-4000-8000-000000000002', 'Copilot Guest', 34, 'MALE',
   true, 1, 25, 45, now(), true, '+447000008002', 'active', 'London'),
  ('8b000000-0000-4000-8000-000000000003',
   '8a000000-0000-4000-8000-000000000003', 'Copilot Guest Two', 32, 'FEMALE',
   true, 1, 25, 45, now(), true, '+447000008003', 'active', 'London');
select set_config('app.profile_guard_write', 'off', true);
insert into public.live_sessions(
  id, title, format, status, context_type, created_by_user_id,
  created_by_profile_id, provider_call_id
) values (
  '8c000000-0000-4000-8000-000000000001', 'Odo Copilot test',
  'hosted_match_night', 'live', 'global',
  '8a000000-0000-4000-8000-000000000001',
  '8b000000-0000-4000-8000-000000000001', 'odo_copilot_test_call'
), (
  '8c000000-0000-4000-8000-000000000002', 'Odo bootstrap test',
  'hosted_match_night', 'live', 'global',
  '8a000000-0000-4000-8000-000000000001',
  '8b000000-0000-4000-8000-000000000001', 'odo_copilot_bootstrap_test_call'
);
insert into public.live_participants(
  session_id, user_id, profile_id, origin_context_type, role, state, stage_slot
) values
  ('8c000000-0000-4000-8000-000000000001',
   '8a000000-0000-4000-8000-000000000001',
   '8b000000-0000-4000-8000-000000000001', 'global', 'host', 'on_stage', 1),
  ('8c000000-0000-4000-8000-000000000001',
   '8a000000-0000-4000-8000-000000000002',
   '8b000000-0000-4000-8000-000000000002', 'global', 'audience', 'on_stage', 2),
  ('8c000000-0000-4000-8000-000000000001',
   '8a000000-0000-4000-8000-000000000003',
   '8b000000-0000-4000-8000-000000000003', 'global', 'audience', 'on_stage', 3),
  ('8c000000-0000-4000-8000-000000000002',
   '8a000000-0000-4000-8000-000000000001',
   '8b000000-0000-4000-8000-000000000001', 'global', 'host', 'on_stage', 1);
update public.live_odo_configuration set
  odo_enabled = true,
  copilot_enabled = true,
  conversation_spark_enabled = false,
  audience_pulse_enabled = false,
  pair_narration_enabled = false,
  scene_suggestions_enabled = true,
  transition_copy_enabled = true,
  circuit_breaker_open = false,
  minimum_call_interval_seconds = 1,
  maximum_calls_per_minute = 60,
  maximum_calls_per_session = 20,
  pricing_version = 'copilot-test-v1',
  model_pricing = jsonb_build_object('test-luna', jsonb_build_object(
    'inputMicrosPerMillion', 100000,
    'cachedInputMicrosPerMillion', 10000,
    'outputMicrosPerMillion', 500000
  ))
where id = true;

select is((select count(*)::integer from public.live_odo_session_state
  where session_id = '8c000000-0000-4000-8000-000000000002'), 0,
  'a fresh Live session starts without requiring pre-seeded Odo state');
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '8a000000-0000-4000-8000-000000000001', true);
create temporary table copilot_bootstrap_state as
select public.rpc_get_live_odo_copilot_v1(
  '8c000000-0000-4000-8000-000000000002', 20
) payload;
select is((select payload->>'enabled' from copilot_bootstrap_state), 'true',
  'authorized first Host read initializes and returns Copilot state');
select is((select payload->>'directionMode' from copilot_bootstrap_state), 'hybrid',
  'Phase 10B Host state reports hybrid direction mode');
select is((select direction_mode from public.live_odo_session_state
  where session_id = '8c000000-0000-4000-8000-000000000002'), 'hybrid',
  'lazy initialization persists hybrid direction mode');

select set_config('request.jwt.claim.role', 'service_role', true);
select set_config('request.jwt.claim.sub', '', true);
create temporary table copilot_welcome_call as
select public.rpc_service_begin_live_odo_copilot_call_v1(
  '8c000000-0000-4000-8000-000000000001',
  '8a000000-0000-4000-8000-000000000001',
  '8d000000-0000-4000-8000-000000000001',
  '8e000000-0000-4000-8000-000000000001',
  'session_welcome', null, 'openai', 'luna', 'test-luna', 'copilot_routine'
) payload;

select is((select payload->>'allowed' from copilot_welcome_call), 'true', 'authorized Host request acquires a call lease');
select is((select payload->'safeContext'->'taskContext'->>'sessionStatus' from copilot_welcome_call), 'live', 'safe context is built from current server state');
select is((select payload->'safeContext'->'taskContext'->>'onStageParticipantCount'
  from copilot_welcome_call), '3', 'safe context distinguishes the authoritative on-stage count');
select is((select payload->'safeContext'->'profiles' from copilot_welcome_call), '[]'::jsonb, 'session-wide copy receives no profile context');
select ok((select (payload->'safeContext')::text !~* '(phone|email|bio|media|transcript|private)' from copilot_welcome_call), 'safe context excludes private and sensitive fields');
select is((select model_class from public.live_odo_ai_usage where action_id = '8e000000-0000-4000-8000-000000000001'), 'luna', 'synchronous Copilot routes to Luna');
select is(public.live_odo_build_copilot_context_v1(
  '8c000000-0000-4000-8000-000000000001', 'scene_suggestion', null
)->'deterministicFallback'->>'scene', 'COMMUNITY_WIDE',
  'three on-stage participants produce a useful deterministic community scene');

create temporary table copilot_welcome_completion as
select public.rpc_service_complete_live_odo_copilot_call_v1(
  (select (payload->>'callId')::uuid from copilot_welcome_call),
  '8d000000-0000-4000-8000-000000000001',
  jsonb_build_object(
    'decision','suggest','reasonCode','test_welcome','context',null,
    'question',null,'copy','Welcome. Settle in and enjoy the room.','locale','en',
    'templateKey',null,'durationSeconds',null,'scene',null,
    'signalCodesUsed',jsonb_build_array()
  ), true, 'content_safe', 'test-request-welcome', 100, 20, 30, 45, false, null
) payload;

select is((select payload->>'accepted' from copilot_welcome_completion), 'true', 'safe generated copy becomes a private suggestion');
select is((select status from public.live_odo_copilot_suggestions where action_id = '8e000000-0000-4000-8000-000000000001'), 'ready', 'completed suggestion starts ready');
select is((select count(*)::integer from public.live_director_events where session_id = '8c000000-0000-4000-8000-000000000001'), 0, 'generation alone emits no Director event');
select is((select status from public.live_odo_ai_usage where action_id = '8e000000-0000-4000-8000-000000000001'), 'succeeded', 'usage reaches a terminal success state');

select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '8a000000-0000-4000-8000-000000000002', true);
select throws_ok(
  $$ select public.rpc_get_live_odo_copilot_v1('8c000000-0000-4000-8000-000000000001', 20) $$,
  '42501', 'live_odo_copilot_host_required',
  'non-Host cannot read private Copilot suggestions'
);
select throws_ok(
  $$ select public.rpc_use_live_odo_copilot_suggestion_v1((select id from public.live_odo_copilot_suggestions where action_id = '8e000000-0000-4000-8000-000000000001')) $$,
  '42501', 'live_odo_copilot_host_required',
  'non-Host cannot use a Copilot suggestion'
);

select set_config('request.jwt.claim.sub', '8a000000-0000-4000-8000-000000000001', true);
select is(jsonb_array_length(public.rpc_get_live_odo_copilot_v1(
  '8c000000-0000-4000-8000-000000000001', 20
)->'suggestions'), 1, 'Host can read the private ready suggestion');
create temporary table copilot_welcome_use as
select public.rpc_use_live_odo_copilot_suggestion_v1(
  (select id from public.live_odo_copilot_suggestions
   where action_id = '8e000000-0000-4000-8000-000000000001')
) payload;
select is((select payload->>'ok' from copilot_welcome_use), 'true', 'Host Use accepts a fresh suggestion');
select is((select status from public.live_odo_copilot_suggestions where action_id = '8e000000-0000-4000-8000-000000000001'), 'used', 'Host Use records the terminal lifecycle');
select is((select source from public.live_director_events where action_id = '8e000000-0000-4000-8000-000000000001'), 'host', 'published event is attributed to the Host');
select is((select visibility from public.live_director_events where action_id = '8e000000-0000-4000-8000-000000000001'), 'participant', 'Host-approved event is participant visible');
select is((select event_type from public.live_director_events where action_id = '8e000000-0000-4000-8000-000000000001'), 'SESSION_WELCOME_PUBLISHED', 'Host Use emits the typed welcome event');
select is(public.rpc_use_live_odo_copilot_suggestion_v1(
  (select id from public.live_odo_copilot_suggestions
   where action_id = '8e000000-0000-4000-8000-000000000001')
)->>'idempotent', 'true', 'repeated Host Use is idempotent');
select is((select count(*)::integer from public.live_director_events where action_id = '8e000000-0000-4000-8000-000000000001'), 1, 'idempotent use emits exactly one event');

select set_config('request.jwt.claim.role', 'service_role', true);
select set_config('request.jwt.claim.sub', '', true);
update public.live_odo_session_state set last_decision_at = now() - interval '2 seconds'
where session_id = '8c000000-0000-4000-8000-000000000001';
create temporary table copilot_scene_call as
select public.rpc_service_begin_live_odo_copilot_call_v1(
  '8c000000-0000-4000-8000-000000000001',
  '8a000000-0000-4000-8000-000000000001',
  '8d000000-0000-4000-8000-000000000004',
  '8e000000-0000-4000-8000-000000000004',
  'scene_suggestion', null, 'openai', 'luna', 'test-luna', 'copilot_routine'
) payload;
select is((select payload->>'allowed' from copilot_scene_call), 'true',
  'three-person stage can request a scene suggestion');
create temporary table copilot_scene_completion as
select public.rpc_service_complete_live_odo_copilot_call_v1(
  (select (payload->>'callId')::uuid from copilot_scene_call),
  '8d000000-0000-4000-8000-000000000004',
  jsonb_build_object(
    'decision','suggest','reasonCode','stage_composition','context',null,
    'question',null,'copy',null,'locale','en','templateKey',null,
    'durationSeconds',null,'scene','COMMUNITY_WIDE','signalCodesUsed',jsonb_build_array()
  ), true, 'content_safe', 'test-request-scene', 70, 0, 18, 30, false, null
) payload;
select is((select payload->>'accepted' from copilot_scene_completion), 'true',
  'safe predefined scene is stored as a private suggestion');
select is((select payload->>'scene' from public.live_odo_copilot_suggestions
  where action_id = '8e000000-0000-4000-8000-000000000004'), 'pool_focus',
  'community scene maps to the existing bounded scene vocabulary');
select ok(exists (select 1 from public.live_odo_trace_events
  where action_id = '8e000000-0000-4000-8000-000000000004'
    and trace_type = 'odo_scene_suggested'), 'scene suggestion emits the task metric');

select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '8a000000-0000-4000-8000-000000000001', true);
create temporary table copilot_scene_use as
select public.rpc_use_live_odo_copilot_suggestion_v1(
  (select id from public.live_odo_copilot_suggestions
   where action_id = '8e000000-0000-4000-8000-000000000004')
) payload;
select is((select payload->>'ok' from copilot_scene_use), 'true',
  'Host Switch accepts the fresh scene suggestion');
select is((select current_scene from public.live_odo_session_state
  where session_id = '8c000000-0000-4000-8000-000000000001'), 'pool_focus',
  'Host Switch updates authoritative scene state');
select is((select event_type from public.live_director_events
  where action_id = '8e000000-0000-4000-8000-000000000004'), 'SCENE_CHANGED',
  'Host Switch emits the predefined scene event');
select ok(exists (select 1 from public.live_odo_trace_events
  where action_id = '8e000000-0000-4000-8000-000000000004'
    and trace_type = 'odo_scene_used'), 'Host Switch emits the scene-use metric');

select set_config('request.jwt.claim.role', 'service_role', true);
select set_config('request.jwt.claim.sub', '', true);
update public.live_odo_session_state set last_decision_at = now() - interval '2 seconds'
where session_id = '8c000000-0000-4000-8000-000000000001';
create temporary table copilot_stale_call as
select public.rpc_service_begin_live_odo_copilot_call_v1(
  '8c000000-0000-4000-8000-000000000001',
  '8a000000-0000-4000-8000-000000000001',
  '8d000000-0000-4000-8000-000000000002',
  '8e000000-0000-4000-8000-000000000002',
  'transition_copy', null, 'openai', 'luna', 'test-luna', 'copilot_routine'
) payload;
select is((select payload->>'allowed' from copilot_stale_call), 'true', 'another task can acquire a fresh fenced lease');
create temporary table copilot_stale_completion as
select public.rpc_service_complete_live_odo_copilot_call_v1(
  (select (payload->>'callId')::uuid from copilot_stale_call),
  '8d000000-0000-4000-8000-000000000002',
  jsonb_build_object(
    'decision','suggest','reasonCode','test_transition','context',null,
    'question',null,'copy','Let us move gently into the next moment.','locale','en',
    'templateKey',null,'durationSeconds',null,'scene',null,
    'signalCodesUsed',jsonb_build_array()
  ), true, 'content_safe', 'test-request-stale', 80, 0, 20, 35, false, null
) payload;
select is((select payload->>'accepted' from copilot_stale_completion), 'true', 'fresh transition copy is stored privately');
update public.live_odo_session_state set state_version = state_version + 1
where session_id = '8c000000-0000-4000-8000-000000000001';
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '8a000000-0000-4000-8000-000000000001', true);
select is(public.rpc_use_live_odo_copilot_suggestion_v1(
  (select id from public.live_odo_copilot_suggestions
   where action_id = '8e000000-0000-4000-8000-000000000002')
)->>'reasonCode', 'suggestion_stale', 'fresh-state revalidation rejects changed state');
select is((select status from public.live_odo_copilot_suggestions where action_id = '8e000000-0000-4000-8000-000000000002'), 'superseded', 'stale suggestion becomes terminally superseded');
select is((select count(*)::integer from public.live_director_events where action_id = '8e000000-0000-4000-8000-000000000002'), 0, 'stale use emits no event');

update public.live_odo_configuration set circuit_breaker_open = true where id = true;
select set_config('request.jwt.claim.role', 'service_role', true);
select set_config('request.jwt.claim.sub', '', true);
update public.live_odo_session_state set last_decision_at = now() - interval '2 seconds'
where session_id = '8c000000-0000-4000-8000-000000000001';
select is(public.rpc_service_begin_live_odo_copilot_call_v1(
  '8c000000-0000-4000-8000-000000000001',
  '8a000000-0000-4000-8000-000000000001',
  '8d000000-0000-4000-8000-000000000003',
  '8e000000-0000-4000-8000-000000000003',
  'session_closing', null, 'openai', 'luna', 'test-luna', 'copilot_routine'
)->>'reasonCode', 'circuit_breaker_open', 'circuit breaker stops new Copilot calls');

select * from finish();
rollback;
