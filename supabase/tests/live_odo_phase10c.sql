begin;

create extension if not exists pgtap with schema extensions;
select plan(92);

select has_table('public','live_odo_guarded_autopilot_host_allowlist','internal Host allowlist exists');
select has_table('public','live_odo_guarded_autopilot_settings','session settings exist');
select has_table('public','live_odo_guarded_autopilot_updates','content-free Realtime projection exists');
select has_table('public','live_odo_guarded_autopilot_events','durable trigger queue exists');
select has_table('public','live_odo_guarded_autopilot_actions','immutable automatic action envelopes exist');
select has_trigger('public','live_odo_guarded_autopilot_actions',
  'live_odo_guarded_project_scene_action',
  'scene actions are projected from authoritative state');
select has_trigger('public','live_odo_guarded_autopilot_events',
  'live_odo_guarded_activation_scene',
  'activation queues current-state scene reconciliation');
select has_trigger('public','live_participants',
  'live_odo_participant_stage_composition_fence',
  'stage composition changes are fenced and signal scene reconciliation');
select has_column('public','live_odo_configuration','guarded_autopilot_enabled','guarded rollout has an umbrella flag');
select has_column('public','live_odo_configuration','full_autopilot_enabled','full Autopilot has a separate flag');
select has_column('public','live_odo_configuration','auto_narration_enabled','narration has a global flag');
select has_column('public','live_odo_configuration','auto_scene_enabled','scenes have a global flag');
select has_column('public','live_odo_configuration','auto_spark_enabled','Sparks have a global flag');
select has_column('public','live_odo_configuration','auto_audience_pulse_enabled','Pulse has a global flag');
select has_column('public','live_odo_configuration','auto_intermission_enabled','intermission has a global flag');
select has_column('public','live_odo_configuration','automatic_scene_minimum_dwell_seconds','scene dwell is configurable');
select ok((select convalidated from pg_constraint
  where conname = 'live_odo_phase10c_full_autopilot_disabled'),
  'full Autopilot remains structurally disabled');
select ok((select relrowsecurity from pg_class
  where oid = 'public.live_odo_guarded_autopilot_host_allowlist'::regclass),'allowlist has RLS');
select ok((select relrowsecurity from pg_class
  where oid = 'public.live_odo_guarded_autopilot_settings'::regclass),'settings have RLS');
select ok((select relrowsecurity from pg_class
  where oid = 'public.live_odo_guarded_autopilot_updates'::regclass),'updates have RLS');
select ok((select relrowsecurity from pg_class
  where oid = 'public.live_odo_guarded_autopilot_events'::regclass),'events have RLS');
select ok((select relrowsecurity from pg_class
  where oid = 'public.live_odo_guarded_autopilot_actions'::regclass),'actions have RLS');
select ok(not has_table_privilege('authenticated','public.live_odo_guarded_autopilot_settings','INSERT,UPDATE,DELETE'),
  'authenticated cannot write settings directly');
select ok(not has_table_privilege('authenticated','public.live_odo_guarded_autopilot_events','INSERT,UPDATE,DELETE'),
  'authenticated cannot forge trigger events');
select ok(not has_table_privilege('authenticated','public.live_odo_guarded_autopilot_actions','INSERT,UPDATE,DELETE'),
  'authenticated cannot forge automatic actions');
select ok(not has_function_privilege('authenticated',
  'public.rpc_service_claim_live_odo_guarded_event_v1(uuid,uuid,uuid,text,text)','EXECUTE'),
  'authenticated cannot claim events');
select ok(has_function_privilege('service_role',
  'public.rpc_service_claim_live_odo_guarded_event_v1(uuid,uuid,uuid,text,text)','EXECUTE'),
  'service role can claim through the narrow RPC');
select ok(not has_function_privilege('authenticated',
  'public.rpc_service_complete_live_odo_guarded_action_v1(uuid,uuid,jsonb,boolean,text,text,bigint,bigint,bigint,integer,boolean,text)','EXECUTE'),
  'authenticated cannot execute automatic actions');
select ok(has_function_privilege('service_role',
  'public.rpc_service_complete_live_odo_guarded_action_v1(uuid,uuid,jsonb,boolean,text,text,bigint,bigint,bigint,integer,boolean,text)','EXECUTE'),
  'service role can execute only through the Policy Gate');
select ok(has_function_privilege('authenticated',
  'public.rpc_get_live_odo_guarded_autopilot_v1(uuid)','EXECUTE'),'Host state RPC is callable');
select ok(has_function_privilege('authenticated',
  'public.rpc_enable_live_odo_guarded_autopilot_v1(uuid,jsonb)','EXECUTE'),'Host enable RPC is callable');
select ok(has_function_privilege('authenticated',
  'public.rpc_take_over_live_odo_v1(uuid)','EXECUTE'),'Host takeover RPC is callable');
select is((select jsonb_agg(action order by ordinality) from unnest(array[
    'NO_ACTION','WAIT','SESSION_NARRATION','ANNOUNCE_EXISTING_PAIR',
    'REQUEST_SCENE','SHOW_CONVERSATION_SPARK','SHOW_AUDIENCE_PULSE',
    'SHOW_INTERMISSION','TIME_CUE','TRANSITION_COPY'
  ]) with ordinality allowed(action,ordinality)
  where public.live_odo_guarded_action_allowed_v1(action)),
  '["NO_ACTION", "WAIT", "SESSION_NARRATION", "ANNOUNCE_EXISTING_PAIR", "REQUEST_SCENE", "SHOW_CONVERSATION_SPARK", "SHOW_AUDIENCE_PULSE", "SHOW_INTERMISSION", "TIME_CUE", "TRANSITION_COPY"]'::jsonb,
  'the exact ten actions are allowlisted');
select is((select jsonb_agg(public.live_odo_guarded_action_risk_tier_v1(action)
    order by ordinality) from unnest(array[
      'NO_ACTION','WAIT','SESSION_NARRATION','ANNOUNCE_EXISTING_PAIR',
      'REQUEST_SCENE','SHOW_CONVERSATION_SPARK','SHOW_AUDIENCE_PULSE',
      'SHOW_INTERMISSION','TIME_CUE','TRANSITION_COPY'
    ]) with ordinality listed(action,ordinality)),
  '[0,0,1,1,1,2,2,2,1,1]'::jsonb,'risk tiers are explicit');
select ok(not exists (select 1 from unnest(array[
    'OPEN_POOL','CLOSE_POOL','PAUSE_POOL','RESUME_POOL','CREATE_PAIR','START_ROUND',
    'CLOSE_ROUND','RETURN_TO_POOL','PROMOTE_TO_STAGE','REMOVE_FROM_STAGE',
    'MUTE_PARTICIPANT','REMOVE_PARTICIPANT','BAN_PARTICIPANT','CREATE_PRIVATE_SPARK',
    'START_PRIVATE_SPARK','END_PRIVATE_SPARK','SUBMIT_PRIVATE_DECISION','CREATE_MATCH',
    'END_SESSION','START_SESSION','ENABLE_RECORDING','ENABLE_CAPTIONS_PRIVATE',
    'ISSUE_RTC_TOKEN','SESSION_POOLING'
  ]) denied(action) where public.live_odo_guarded_action_allowed_v1(action)),
  'every named Tier 3 action is denied');
select is(public.live_odo_guarded_action_allowed_v1('UNKNOWN_ACTION'),false,
  'unknown actions fail closed');
select ok((select not guarded_autopilot_enabled and not full_autopilot_enabled
    from public.live_odo_configuration where id = true),
  'the migration does not enable automatic rollout');

insert into auth.users(id,email) values
  ('9a000000-0000-4000-8000-000000000001','guarded-host@example.test'),
  ('9a000000-0000-4000-8000-000000000002','guarded-a@example.test'),
  ('9a000000-0000-4000-8000-000000000003','guarded-b@example.test');
select set_config('app.profile_guard_write','on',true);
insert into public.profiles(
  id,user_id,full_name,age,gender,profile_completed,verification_level,
  min_age_interest,max_age_interest,age_preference_confirmed_at,
  phone_verified,phone_number,identity_status,region
) values
  ('9b000000-0000-4000-8000-000000000001','9a000000-0000-4000-8000-000000000001',
   'Guarded Host',35,'FEMALE',true,1,25,45,now(),true,'+447000009001','active','London'),
  ('9b000000-0000-4000-8000-000000000002','9a000000-0000-4000-8000-000000000002',
   'Guarded A',34,'MALE',true,1,25,45,now(),true,'+447000009002','active','London'),
  ('9b000000-0000-4000-8000-000000000003','9a000000-0000-4000-8000-000000000003',
   'Guarded B',32,'FEMALE',true,1,25,45,now(),true,'+447000009003','active','London');
select set_config('app.profile_guard_write','off',true);
insert into public.live_sessions(
  id,title,format,status,context_type,created_by_user_id,created_by_profile_id,provider_call_id
) values (
  '9c000000-0000-4000-8000-000000000001','Guarded test','hosted_match_night','live',
  'global','9a000000-0000-4000-8000-000000000001',
  '9b000000-0000-4000-8000-000000000001','odo_guarded_test_call'
);
insert into public.live_participants(
  session_id,user_id,profile_id,origin_context_type,role,state,stage_slot
) values
  ('9c000000-0000-4000-8000-000000000001','9a000000-0000-4000-8000-000000000001',
   '9b000000-0000-4000-8000-000000000001','global','host','on_stage',1),
  ('9c000000-0000-4000-8000-000000000001','9a000000-0000-4000-8000-000000000002',
   '9b000000-0000-4000-8000-000000000002','global','audience','audience',null),
  ('9c000000-0000-4000-8000-000000000001','9a000000-0000-4000-8000-000000000003',
   '9b000000-0000-4000-8000-000000000003','global','audience','audience',null);
update public.live_odo_configuration set
  odo_enabled = true,copilot_enabled = true,guarded_autopilot_enabled = true,
  auto_narration_enabled = true,auto_scene_enabled = true,auto_spark_enabled = true,
  auto_audience_pulse_enabled = true,auto_intermission_enabled = true,
  conversation_spark_enabled = true,audience_pulse_enabled = true,
  pair_narration_enabled = true,scene_suggestions_enabled = true,
  transition_copy_enabled = true,circuit_breaker_open = false,
  maximum_calls_per_minute = 60,maximum_calls_per_session = 100,
  guarded_autopilot_internal_only = true,pricing_version = 'guarded-test-v1'
where id = true;
insert into public.live_odo_guarded_autopilot_host_allowlist(user_id)
values ('9a000000-0000-4000-8000-000000000001');

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','9a000000-0000-4000-8000-000000000001',true);
select is(public.rpc_get_live_odo_guarded_autopilot_v1(
  '9c000000-0000-4000-8000-000000000001')->>'available','true',
  'an authorized allowlisted Host can see availability');
create temporary table guarded_enable as select public.rpc_enable_live_odo_guarded_autopilot_v1(
  '9c000000-0000-4000-8000-000000000001','{}'::jsonb
) payload;
select is((select payload->>'autopilotState' from guarded_enable),'starting',
  'explicit enable starts from starting');
select is((select direction_mode from public.live_odo_session_state
  where session_id = '9c000000-0000-4000-8000-000000000001'),'autopilot',
  'explicit enable selects autopilot direction mode');
select is((select count(*)::integer from public.live_odo_guarded_autopilot_events
  where session_id = '9c000000-0000-4000-8000-000000000001'
    and trigger_type = 'HOST_RESUMED_AUTOPILOT' and status = 'pending'),1,
  'enable queues a fresh activation event');
select is((select count(*)::integer from public.live_odo_guarded_autopilot_events
  where session_id = '9c000000-0000-4000-8000-000000000001'
    and trigger_type = 'SCENE_CHANGED' and status = 'pending'),1,
  'enable also queues current-state scene reconciliation');

select set_config('request.jwt.claim.role','service_role',true);
select set_config('request.jwt.claim.sub','',true);
create temporary table guarded_activation_claim as
select public.rpc_service_claim_live_odo_guarded_event_v1(
  '9c000000-0000-4000-8000-000000000001',
  '9a000000-0000-4000-8000-000000000001',
  '9d000000-0000-4000-8000-000000000001','test-luna','guarded_test'
) payload;
select is((select payload->>'allowed' from guarded_activation_claim),'true',
  'service worker claims the activation event');
select is((select payload->'action'->>'type' from guarded_activation_claim),'NO_ACTION',
  'activation itself causes no visible action');
select is((select autopilot_state from public.live_odo_session_state
  where session_id = '9c000000-0000-4000-8000-000000000001'),'active',
  'fresh service claim promotes starting to active');
create temporary table guarded_activation_complete as
select public.rpc_service_complete_live_odo_guarded_action_v1(
  (select (payload->'action'->>'actionId')::uuid from guarded_activation_claim),
  '9d000000-0000-4000-8000-000000000001',null,true,
  'deterministic_template_approved',null,0,0,0,0,false,null
) payload;
select is((select payload->>'accepted' from guarded_activation_complete),'true',
  'fresh no-effect activation passes the Policy Gate');
select is((select count(*)::integer from public.live_director_events
  where session_id = '9c000000-0000-4000-8000-000000000001'),0,
  'NO_ACTION does not emit a visible Director event');

create temporary table guarded_initial_scene_claim as
select public.rpc_service_claim_live_odo_guarded_event_v1(
  '9c000000-0000-4000-8000-000000000001',
  '9a000000-0000-4000-8000-000000000001',
  '9d000000-0000-4000-8000-000000000011','test-luna','guarded_test'
) payload;
select is((select payload->>'allowed' from guarded_initial_scene_claim),'true',
  'the worker claims activation scene reconciliation');
select is((select payload->'action'->>'type' from guarded_initial_scene_claim),
  'NO_ACTION','an already-suitable activation scene remains a no-op');
select is(public.rpc_service_complete_live_odo_guarded_action_v1(
  (select (payload->'action'->>'actionId')::uuid from guarded_initial_scene_claim),
  '9d000000-0000-4000-8000-000000000011',null,true,
  'deterministic_template_approved',null,0,0,0,0,false,null
)->>'accepted','true','the no-op activation reconciliation completes safely');

insert into public.live_match_rounds(
  id,session_id,client_proposal_id,created_by_user_id,
  participant_a_user_id,participant_a_profile_id,
  participant_b_user_id,participant_b_profile_id,state,expires_at
) values (
  '9e000000-0000-4000-8000-000000000001',
  '9c000000-0000-4000-8000-000000000001',
  '9f000000-0000-4000-8000-000000000001',
  '9a000000-0000-4000-8000-000000000001',
  '9a000000-0000-4000-8000-000000000002','9b000000-0000-4000-8000-000000000002',
  '9a000000-0000-4000-8000-000000000003','9b000000-0000-4000-8000-000000000003',
  'public_introduction',timezone('utc',now()) + interval '10 minutes'
);
select is((select count(*)::integer from public.live_odo_guarded_autopilot_events
  where session_id = '9c000000-0000-4000-8000-000000000001'
    and trigger_type = 'PAIRING_READY_FOR_PRESENTATION' and status = 'pending'),1,
  'an authoritative existing pair queues presentation work');
select is((select count(*)::integer from public.live_odo_guarded_autopilot_events
  where session_id = '9c000000-0000-4000-8000-000000000001'
    and trigger_type = 'SCENE_CHANGED' and source_kind = 'hosted_round'
    and status = 'pending'),1,
  'a Hosted introduction also queues its predefined pair scene');
create temporary table guarded_pair_scene_claim as
select public.rpc_service_claim_live_odo_guarded_event_v1(
  '9c000000-0000-4000-8000-000000000001',
  '9a000000-0000-4000-8000-000000000001',
  '9d000000-0000-4000-8000-000000000012','test-luna','guarded_test'
) payload;
select is((select payload->'action'->>'type' from guarded_pair_scene_claim),
  'REQUEST_SCENE','the server projects the Hosted introduction into a scene request');
select is(public.rpc_service_complete_live_odo_guarded_action_v1(
  (select (payload->'action'->>'actionId')::uuid from guarded_pair_scene_claim),
  '9d000000-0000-4000-8000-000000000012',null,true,
  'deterministic_template_approved',null,0,0,0,0,false,null
)->>'accepted','true','the fresh pair scene passes the guarded execution gate');
select is((select current_scene from public.live_odo_session_state
  where session_id = '9c000000-0000-4000-8000-000000000001'),
  'pair_forming','the Hosted introduction uses the predefined pair-forming scene');
create temporary table guarded_pair_claim as
select public.rpc_service_claim_live_odo_guarded_event_v1(
  '9c000000-0000-4000-8000-000000000001',
  '9a000000-0000-4000-8000-000000000001',
  '9d000000-0000-4000-8000-000000000002','test-luna','guarded_test'
) payload;
select is((select payload->'action'->>'type' from guarded_pair_claim),
  'ANNOUNCE_EXISTING_PAIR','Odo may narrate but not choose the existing pair');

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','9a000000-0000-4000-8000-000000000001',true);
create temporary table guarded_takeover as select public.rpc_take_over_live_odo_v1(
  '9c000000-0000-4000-8000-000000000001'
) payload;
select is((select payload->>'takenOver' from guarded_takeover),'true',
  'Host takeover is immediate');
select is((select status from public.live_odo_guarded_autopilot_actions
  where action_id = (select (payload->'action'->>'actionId')::uuid from guarded_pair_claim)),
  'stale','Host takeover fences the in-flight action');
select is((select state from public.live_match_rounds
  where id = '9e000000-0000-4000-8000-000000000001'),'public_introduction',
  'Host takeover does not alter the pairing');

select set_config('request.jwt.claim.role','service_role',true);
select set_config('request.jwt.claim.sub','',true);
select is(public.rpc_service_complete_live_odo_guarded_action_v1(
  (select (payload->'action'->>'actionId')::uuid from guarded_pair_claim),
  '9d000000-0000-4000-8000-000000000002',
  jsonb_build_object(
    'decision','suggest','reasonCode','test_pair','context',null,'question',null,
    'copy','Another connection is forming.','locale','en','templateKey',null,
    'durationSeconds',null,'scene',null,'signalCodesUsed',jsonb_build_array()
  ),true,'content_safe','test-request',10,0,5,20,false,null
)->>'accepted','false','a fenced AI response cannot execute');

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','9a000000-0000-4000-8000-000000000001',true);
select is(public.rpc_enable_live_odo_guarded_autopilot_v1(
  '9c000000-0000-4000-8000-000000000001','{}'::jsonb
)->>'enabled','true','Host can intentionally start again from fresh state');
select set_config('request.jwt.claim.role','service_role',true);
select set_config('request.jwt.claim.sub','',true);
create temporary table guarded_second_activation as
select public.rpc_service_claim_live_odo_guarded_event_v1(
  '9c000000-0000-4000-8000-000000000001',
  '9a000000-0000-4000-8000-000000000001',
  '9d000000-0000-4000-8000-000000000003','test-luna','guarded_test'
) payload;
select is(public.rpc_service_complete_live_odo_guarded_action_v1(
  (select (payload->'action'->>'actionId')::uuid from guarded_second_activation),
  '9d000000-0000-4000-8000-000000000003',null,true,
  'deterministic_template_approved',null,0,0,0,0,false,null
)->>'accepted','true','fresh resume activation completes');

update public.live_odo_configuration set
  maximum_automatic_interventions_per_window = 10,
  minimum_audience_for_automatic_pulse = 2,
  automatic_scene_minimum_dwell_seconds = 5
where id = true;
update public.live_odo_guarded_autopilot_settings set
  last_scene_changed_at = timezone('utc',now()) - interval '10 seconds',
  automatic_scene_suppressed_until = null
where session_id = '9c000000-0000-4000-8000-000000000001';

create temporary table guarded_scene_before as
select state_version from public.live_odo_session_state
where session_id = '9c000000-0000-4000-8000-000000000001';
select public.live_odo_guarded_enqueue_event_v1(
  '9c000000-0000-4000-8000-000000000001','PAIR_ACTIVE',
  'test-scene:9c000000-0000-4000-8000-000000000001',
  'session','9c000000-0000-4000-8000-000000000001',
  (select version from public.live_sessions
    where id = '9c000000-0000-4000-8000-000000000001'),
  100,timezone('utc',now()),90
);
create temporary table guarded_scene_claim as
select public.rpc_service_claim_live_odo_guarded_event_v1(
  '9c000000-0000-4000-8000-000000000001',
  '9a000000-0000-4000-8000-000000000001',
  '9d000000-0000-4000-8000-000000000005','test-luna','guarded_test'
) payload;
select is((select payload->'action'->>'type' from guarded_scene_claim),
  'REQUEST_SCENE','an authoritative presentation event proposes an approved scene');
select is(public.rpc_service_complete_live_odo_guarded_action_v1(
  (select (payload->'action'->>'actionId')::uuid from guarded_scene_claim),
  '9d000000-0000-4000-8000-000000000005',null,true,
  'deterministic_template_approved',null,0,0,0,0,false,null
)->>'accepted','true','a fresh predefined scene passes the execution gate');
select is((select current_scene from public.live_odo_session_state
  where session_id = '9c000000-0000-4000-8000-000000000001'),
  'quick_connect_active','the scene executor uses only its predefined scene');
select ok((select state_version from public.live_odo_session_state
    where session_id = '9c000000-0000-4000-8000-000000000001')
    > (select state_version from guarded_scene_before),
  'a scene transition advances the authoritative state version');

select public.live_odo_guarded_enqueue_event_v1(
  '9c000000-0000-4000-8000-000000000001','CONVERSATION_SPARK_ELIGIBLE',
  'test-spark:9e000000-0000-4000-8000-000000000001',
  'hosted_round','9e000000-0000-4000-8000-000000000001',
  (select version from public.live_match_rounds
    where id = '9e000000-0000-4000-8000-000000000001'),
  100,timezone('utc',now()),120
);
create temporary table guarded_spark_claim as
select public.rpc_service_claim_live_odo_guarded_event_v1(
  '9c000000-0000-4000-8000-000000000001',
  '9a000000-0000-4000-8000-000000000001',
  '9d000000-0000-4000-8000-000000000006','test-luna','guarded_test'
) payload;
select is((select payload->'action'->>'type' from guarded_spark_claim),
  'SHOW_CONVERSATION_SPARK','an active existing round may receive one Spark');
select is(public.rpc_service_complete_live_odo_guarded_action_v1(
  (select (payload->'action'->>'actionId')::uuid from guarded_spark_claim),
  '9d000000-0000-4000-8000-000000000006',
  jsonb_build_object(
    'decision','suggest','reasonCode','test_spark','context','A shared moment',
    'question','What is something you have enjoyed recently?','copy',null,
    'locale','en','templateKey',null,'durationSeconds',null,'scene',null,
    'signalCodesUsed',jsonb_build_array()
  ),true,'content_safe','test-spark-request',20,0,10,30,false,null
)->>'accepted','true','a safe bounded Spark passes Content Gate and fresh policy');
select is((select conversation_spark->>'source' from public.live_match_rounds
  where id = '9e000000-0000-4000-8000-000000000001'),
  'odo_guarded_autopilot','the Spark attaches only to the existing round');
select is((select count(*)::integer from public.live_director_events
  where action_id = (select (payload->'action'->>'actionId')::uuid
    from guarded_spark_claim) and event_type = 'CONVERSATION_SPARK_PUBLISHED'),
  1,'the Spark emits one ordered Director event');

update public.live_match_rounds set
  state = 'completed',completed_at = timezone('utc',now()),version = version + 1
where id = '9e000000-0000-4000-8000-000000000001';
update public.live_odo_guarded_autopilot_events set
  status = 'cancelled',outcome_reason_code = 'test_fixture_cleanup',
  completed_at = timezone('utc',now())
where session_id = '9c000000-0000-4000-8000-000000000001'
  and status = 'pending';
update public.live_odo_guarded_autopilot_settings set
  auto_audience_pulse_enabled = true,version = version + 1
where session_id = '9c000000-0000-4000-8000-000000000001';
select public.live_odo_guarded_enqueue_event_v1(
  '9c000000-0000-4000-8000-000000000001','AUDIENCE_PULSE_ELIGIBLE',
  'test-pulse:9c000000-0000-4000-8000-000000000001',
  'session','9c000000-0000-4000-8000-000000000001',
  (select version from public.live_sessions
    where id = '9c000000-0000-4000-8000-000000000001'),
  100,timezone('utc',now()),120
);
create temporary table guarded_pulse_claim as
select public.rpc_service_claim_live_odo_guarded_event_v1(
  '9c000000-0000-4000-8000-000000000001',
  '9a000000-0000-4000-8000-000000000001',
  '9d000000-0000-4000-8000-000000000007','test-luna','guarded_test'
) payload;
select is((select payload->'action'->>'type' from guarded_pulse_claim),
  'SHOW_AUDIENCE_PULSE','sufficient audience may receive a template-first Pulse');
select is(public.rpc_service_complete_live_odo_guarded_action_v1(
  (select (payload->'action'->>'actionId')::uuid from guarded_pulse_claim),
  '9d000000-0000-4000-8000-000000000007',null,true,
  'deterministic_template_approved',null,0,0,0,0,false,null
)->>'accepted','true','a safe server-owned Pulse template passes policy');
select is((select count(*)::integer from public.live_audience_polls
  where session_id = '9c000000-0000-4000-8000-000000000001'
    and client_request_id = (select (payload->'action'->>'actionId')::uuid
      from guarded_pulse_claim) and state = 'open'),
  1,'automatic Pulse reuses the bounded Audience Pulse projection');
select is((select count(*)::integer from public.live_director_events
  where action_id = (select (payload->'action'->>'actionId')::uuid
    from guarded_pulse_claim) and event_type = 'AUDIENCE_PULSE_LAUNCHED'),
  1,'automatic Pulse emits one ordered Director event');

update public.live_odo_guarded_autopilot_settings set
  last_scene_changed_at = timezone('utc',now()) - interval '10 seconds',
  automatic_scene_suppressed_until = null
where session_id = '9c000000-0000-4000-8000-000000000001';
select public.live_odo_guarded_enqueue_event_v1(
  '9c000000-0000-4000-8000-000000000001','INTERMISSION_REQUIRED',
  'test-intermission:9c000000-0000-4000-8000-000000000001',
  'session','9c000000-0000-4000-8000-000000000001',
  (select version from public.live_sessions
    where id = '9c000000-0000-4000-8000-000000000001'),
  100,timezone('utc',now()),120
);
create temporary table guarded_intermission_claim as
select public.rpc_service_claim_live_odo_guarded_event_v1(
  '9c000000-0000-4000-8000-000000000001',
  '9a000000-0000-4000-8000-000000000001',
  '9d000000-0000-4000-8000-000000000008','test-luna','guarded_test'
) payload;
select is((select payload->'action'->>'type' from guarded_intermission_claim),
  'SHOW_INTERMISSION','a safe pacing event may request visual-only intermission');
select is(public.rpc_service_complete_live_odo_guarded_action_v1(
  (select (payload->'action'->>'actionId')::uuid from guarded_intermission_claim),
  '9d000000-0000-4000-8000-000000000008',null,true,
  'deterministic_template_approved',null,0,0,0,0,false,null
)->>'accepted','true','a fresh visual-only intermission passes scene policy');
select is((select current_scene from public.live_odo_session_state
  where session_id = '9c000000-0000-4000-8000-000000000001'),
  'music_intermission_visual_only','intermission never enables real music');
select is((select count(*)::integer from public.live_director_events
  where action_id = (select (payload->'action'->>'actionId')::uuid
    from guarded_intermission_claim) and event_type = 'ODO_INTERMISSION_STARTED'),
  1,'intermission emits one ordered Director event');
select set_config('app.live_odo_guarded_executor','on',true);
update public.live_odo_guarded_autopilot_settings set
  last_scene_changed_at = timezone('utc',now()),
  automatic_scene_suppressed_until = null
where session_id = '9c000000-0000-4000-8000-000000000001';
select throws_ok(
  $$ update public.live_odo_session_state set current_scene = 'host_focus'
    where session_id = '9c000000-0000-4000-8000-000000000001' $$,
  '23514','live_odo_scene_dwell_active',
  'every automatic scene transition, including intermission, respects dwell time'
);
select set_config('app.live_odo_guarded_executor','off',true);
update public.live_odo_guarded_autopilot_settings set
  last_scene_changed_at = timezone('utc',now()) - interval '10 seconds'
where session_id = '9c000000-0000-4000-8000-000000000001';
update public.live_odo_session_state set current_scene = 'host_focus'
where session_id = '9c000000-0000-4000-8000-000000000001';
select ok((select automatic_scene_suppressed_until > timezone('utc',now())
  from public.live_odo_guarded_autopilot_settings
  where session_id = '9c000000-0000-4000-8000-000000000001'),
  'a manual Host scene change starts automatic scene suppression');

insert into public.live_quick_connect_rounds(
  id,session_id,round_number,state,starts_at,ends_at
) values (
  '91000000-0000-4000-8000-000000000001',
  '9c000000-0000-4000-8000-000000000001',1,'active',
  timezone('utc',now()) - interval '2 minutes',
  timezone('utc',now()) + interval '60 seconds'
);
update public.live_odo_guarded_autopilot_events set
  status = 'cancelled',outcome_reason_code = 'test_fixture_cleanup',
  completed_at = timezone('utc',now())
where session_id = '9c000000-0000-4000-8000-000000000001'
  and status = 'pending';
select public.live_odo_guarded_enqueue_event_v1(
  '9c000000-0000-4000-8000-000000000001','ROUND_NEAR_END',
  'test-time-cue:91000000-0000-4000-8000-000000000001',
  'quick_round','91000000-0000-4000-8000-000000000001',1,
  100,timezone('utc',now()),90
);
create temporary table guarded_time_cue_claim as
select public.rpc_service_claim_live_odo_guarded_event_v1(
  '9c000000-0000-4000-8000-000000000001',
  '9a000000-0000-4000-8000-000000000001',
  '9d000000-0000-4000-8000-000000000009','test-luna','guarded_test'
) payload;
select is((select payload->'action'->>'type' from guarded_time_cue_claim),
  'TIME_CUE','the authoritative round clock proposes a deterministic time cue');
select is(public.rpc_service_complete_live_odo_guarded_action_v1(
  (select (payload->'action'->>'actionId')::uuid from guarded_time_cue_claim),
  '9d000000-0000-4000-8000-000000000009',null,true,
  'deterministic_template_approved',null,0,0,0,0,false,null
)->>'accepted','true','a due authoritative time cue passes fresh policy');
select is((select count(*)::integer from public.live_director_events
  where action_id = (select (payload->'action'->>'actionId')::uuid
    from guarded_time_cue_claim) and event_type = 'TIME_CUE_PUBLISHED'
    and payload->>'copy' = 'One minute remaining.'),
  1,'time cue uses deterministic copy and one ordered Director event');

select public.live_odo_guarded_enqueue_event_v1(
  '9c000000-0000-4000-8000-000000000001','SESSION_NEARING_END',
  'test-policy-pause:9c000000-0000-4000-8000-000000000001',
  'session','9c000000-0000-4000-8000-000000000001',1,80,timezone('utc',now()),90
);
create temporary table guarded_policy_claim as
select public.rpc_service_claim_live_odo_guarded_event_v1(
  '9c000000-0000-4000-8000-000000000001',
  '9a000000-0000-4000-8000-000000000001',
  '9d000000-0000-4000-8000-000000000004','test-luna','guarded_test'
) payload;
select is(public.rpc_service_pause_live_odo_policy_v1(
  '9c000000-0000-4000-8000-000000000001','safety_test'
)->>'paused','true','Safety can pause immediately');
select is((select autopilot_state from public.live_odo_session_state
  where session_id = '9c000000-0000-4000-8000-000000000001'),'paused_by_policy',
  'Safety pause becomes authoritative state');
select is((select status from public.live_odo_guarded_autopilot_actions
  where action_id = (select (payload->'action'->>'actionId')::uuid from guarded_policy_claim)),
  'stale','Safety fences in-flight automatic work');
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','9a000000-0000-4000-8000-000000000001',true);
select is(public.rpc_resume_live_odo_autopilot_v1(
  '9c000000-0000-4000-8000-000000000001'
)->>'resumed','false','Host cannot bypass an uncleared Safety pause');
select throws_ok(
  $$ select public.rpc_enable_live_odo_guarded_autopilot_v1(
    '9c000000-0000-4000-8000-000000000001','{}'::jsonb
  ) $$,
  '42501','live_odo_policy_clearance_required',
  'Host cannot bypass Safety pause through the enable RPC'
);
select throws_ok(
  $$ select public.rpc_take_over_live_odo_v1(
    '9c000000-0000-4000-8000-000000000001'
  ) $$,
  '42501','live_odo_policy_clearance_required',
  'Host cannot convert a Safety pause into a resumable Host pause'
);
select set_config('request.jwt.claim.role','service_role',true);
select set_config('request.jwt.claim.sub','',true);
select is(public.rpc_service_clear_live_odo_policy_pause_v1(
  '9c000000-0000-4000-8000-000000000001','safety_review_complete'
)->>'cleared','true','Safety service can clear the policy fence into manual mode');
select is((select autopilot_state from public.live_odo_session_state
  where session_id = '9c000000-0000-4000-8000-000000000001'),'paused_by_host',
  'policy clearance still requires an explicit Host resume');
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','9a000000-0000-4000-8000-000000000001',true);
select is(public.rpc_resume_live_odo_autopilot_v1(
  '9c000000-0000-4000-8000-000000000001'
)->>'resumed','true','Host may explicitly resume only after Safety clearance');

select * from finish();
rollback;
