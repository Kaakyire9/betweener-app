begin;

set local role postgres;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, private, pg_catalog;

select plan(26);

select has_table('private', 'live_scene_manifest_v2', 'server manifest mirror exists');
select is((select count(*)::integer from private.live_scene_manifest_v2
  where manifest_version = 'adaptive-stage-v2.0.0-m1'), 21, 'server manifest contains all scenes');
select ok(to_regprocedure('public.rpc_studio_take_live_program_v3(uuid,uuid,bigint,bigint,bigint,text,uuid,text,text,jsonb,text,text)') is not null,
  'manifest and graph-fenced Studio TAKE exists');
select ok(to_regprocedure('public.rpc_mobile_take_live_program_v2(uuid,bigint,bigint,text,uuid,text,text,jsonb,text,text)') is not null,
  'manifest and graph-fenced mobile TAKE exists');
select ok(not has_table_privilege('authenticated', 'private.live_scene_manifest_v2', 'SELECT'),
  'members cannot read server validation metadata directly');
select ok(not has_function_privilege('authenticated',
  'private.live_program_assignment_error_v2(uuid,text,text,jsonb,text,bigint)', 'EXECUTE'),
  'members cannot invoke the private validator directly');
select ok(to_regprocedure('public.rpc_service_record_adaptive_stage_v2_diagnostic_v1(uuid,uuid,bigint,text,jsonb)') is not null,
  'fenced compositor diagnostic RPC exists');
select ok(not has_function_privilege('authenticated',
  'public.rpc_service_record_adaptive_stage_v2_diagnostic_v1(uuid,uuid,bigint,text,jsonb)', 'EXECUTE'),
  'members cannot invoke the compositor diagnostic RPC');
select ok(position('flags.shadow_enabled and flags.diagnostics_enabled' in
  pg_get_functiondef('public.rpc_record_adaptive_stage_v2_diagnostic_v1(uuid,text,jsonb)'::regprocedure)) > 0,
  'member diagnostics require both shadow and diagnostics flags');
select ok(position('runtime.lease_generation = p_lease_generation' in
  pg_get_functiondef('public.rpc_service_record_adaptive_stage_v2_diagnostic_v1(uuid,uuid,bigint,text,jsonb)'::regprocedure)) > 0,
  'compositor diagnostics require the current fenced lease');

insert into auth.users(id, email)
select ('a1000000-0000-4000-8000-' || lpad(value::text, 12, '0'))::uuid,
  'adaptive-stage-' || value || '@example.test'
from generate_series(1, 8) value;

select set_config('request.jwt.claim.role', 'service_role', true);
select set_config('app.profile_guard_write', 'on', true);
insert into public.profiles(
  id, user_id, full_name, age, gender, profile_completed, verification_level,
  min_age_interest, max_age_interest, age_preference_confirmed_at,
  phone_verified, phone_number, identity_status, region
)
select ('a2000000-0000-4000-8000-' || lpad(value::text, 12, '0'))::uuid,
  ('a1000000-0000-4000-8000-' || lpad(value::text, 12, '0'))::uuid,
  'Adaptive Stage ' || value, 30 + value,
  (case when value % 2 = 0 then 'FEMALE' else 'MALE' end)::public.gender,
  true, 1, 25, 50, now(), true, '+44710000' || lpad(value::text, 4, '0'),
  'active', 'London'
from generate_series(1, 8) value;
select set_config('app.profile_guard_write', 'off', true);

insert into public.live_sessions(
  id, title, format, status, context_type, created_by_user_id,
  created_by_profile_id, provider_call_id, maximum_publishers
) values
  ('a3000000-0000-4000-8000-000000000001', 'Adaptive Stage test', 'special_event', 'live',
    'global', 'a1000000-0000-4000-8000-000000000001',
    'a2000000-0000-4000-8000-000000000001', 'adaptive_stage_test', 4),
  ('a3000000-0000-4000-8000-000000000002', 'Foreign source test', 'special_event', 'live',
    'global', 'a1000000-0000-4000-8000-000000000001',
    'a2000000-0000-4000-8000-000000000001', 'adaptive_stage_foreign', 4);

insert into public.live_participants(
  session_id, user_id, profile_id, origin_context_type, role, state, stage_slot
)
select 'a3000000-0000-4000-8000-000000000001',
  ('a1000000-0000-4000-8000-' || lpad(value::text, 12, '0'))::uuid,
  ('a2000000-0000-4000-8000-' || lpad(value::text, 12, '0'))::uuid,
  'global', case when value = 1 then 'host' else 'audience' end,
  'on_stage', value
from generate_series(1, 6) value;

insert into public.live_program_sources(
  session_id, source_key, source_type, source_role, owner_user_id,
  provider_user_id, has_video, has_audio, readiness, health
) values
  ('a3000000-0000-4000-8000-000000000001','fixture.host','host_camera','visual','a1000000-0000-4000-8000-000000000001','host-provider',true,true,'ready','healthy'),
  ('a3000000-0000-4000-8000-000000000001','fixture.host.as_guest','participant_camera','visual','a1000000-0000-4000-8000-000000000001','host-guest-provider',true,true,'ready','healthy'),
  ('a3000000-0000-4000-8000-000000000001','fixture.guest1','participant_camera','visual','a1000000-0000-4000-8000-000000000002','guest-1-provider',true,true,'ready','healthy'),
  ('a3000000-0000-4000-8000-000000000001','fixture.guest1.duplicate','participant_camera','visual','a1000000-0000-4000-8000-000000000002','guest-1-provider-2',true,true,'ready','healthy'),
  ('a3000000-0000-4000-8000-000000000001','fixture.guest2','participant_camera','visual','a1000000-0000-4000-8000-000000000003','guest-2-provider',true,true,'ready','healthy'),
  ('a3000000-0000-4000-8000-000000000001','fixture.guest3','participant_camera','visual','a1000000-0000-4000-8000-000000000004','guest-3-provider',true,true,'ready','healthy'),
  ('a3000000-0000-4000-8000-000000000001','fixture.guest4','participant_camera','visual','a1000000-0000-4000-8000-000000000005','guest-4-provider',true,true,'ready','healthy'),
  ('a3000000-0000-4000-8000-000000000001','fixture.guest5','participant_camera','visual','a1000000-0000-4000-8000-000000000006','guest-5-provider',true,true,'ready','healthy'),
  ('a3000000-0000-4000-8000-000000000001','fixture.unadmitted','host_camera','visual','a1000000-0000-4000-8000-000000000007','unadmitted-provider',true,true,'ready','healthy'),
  ('a3000000-0000-4000-8000-000000000001','fixture.screen','screen_share','visual','a1000000-0000-4000-8000-000000000001','screen-provider',true,false,'ready','healthy'),
  ('a3000000-0000-4000-8000-000000000001','fixture.odo','odo_stage','visual',null,null,false,false,'ready','healthy'),
  ('a3000000-0000-4000-8000-000000000001','fixture.pulse','audience_pulse','visual',null,null,false,false,'ready','healthy'),
  ('a3000000-0000-4000-8000-000000000002','fixture.foreign','host_camera','visual','a1000000-0000-4000-8000-000000000001','foreign-provider',true,true,'ready','healthy');

select is(private.live_program_assignment_error_v2(
  'a3000000-0000-4000-8000-000000000001','host_focus','portrait_9_16',
  '{"host":"fixture.host"}','obsolete-manifest',null), 'manifest_outdated',
  'obsolete manifest fails closed');
select is(private.live_program_assignment_error_v2(
  'a3000000-0000-4000-8000-000000000001','unknown_scene','portrait_9_16',
  '{}','adaptive-stage-v2.0.0-m1',null), 'program_scene_unknown', 'unknown scene fails closed');
select is(private.live_program_assignment_error_v2(
  'a3000000-0000-4000-8000-000000000001','host_focus','cinema',
  '{"host":"fixture.host"}','adaptive-stage-v2.0.0-m1',null), 'program_canvas_unsupported',
  'unsupported canvas fails closed');
select is(private.live_program_assignment_error_v2(
  'a3000000-0000-4000-8000-000000000001','host_focus','portrait_9_16',
  '{}','adaptive-stage-v2.0.0-m1',null), 'program_required_source_missing',
  'missing required source fails closed');
select is(private.live_program_assignment_error_v2(
  'a3000000-0000-4000-8000-000000000001','host_focus','portrait_9_16',
  '{"host":"fixture.screen"}','adaptive-stage-v2.0.0-m1',null), 'program_source_type_invalid',
  'screen source cannot occupy a human slot');
select is(private.live_program_assignment_error_v2(
  'a3000000-0000-4000-8000-000000000001','screen_full','portrait_9_16',
  '{"primary":"fixture.host"}','adaptive-stage-v2.0.0-m1',null), 'program_source_type_invalid',
  'camera cannot occupy a screen slot');
select is(private.live_program_assignment_error_v2(
  'a3000000-0000-4000-8000-000000000001','host_focus','portrait_9_16',
  '{"host":"fixture.odo"}','adaptive-stage-v2.0.0-m1',null), 'program_source_type_invalid',
  'Odo cannot occupy a human slot');
select is(private.live_program_assignment_error_v2(
  'a3000000-0000-4000-8000-000000000001','host_focus','portrait_9_16',
  '{"host":"fixture.pulse"}','adaptive-stage-v2.0.0-m1',null), 'program_source_type_invalid',
  'Pulse cannot occupy a human slot');
select is(private.live_program_assignment_error_v2(
  'a3000000-0000-4000-8000-000000000001','screen_plus_host','portrait_9_16',
  '{"primary":"fixture.screen","host":"fixture.screen"}','adaptive-stage-v2.0.0-m1',null),
  'program_source_duplicated', 'duplicate source key fails closed');
select is(private.live_program_assignment_error_v2(
  'a3000000-0000-4000-8000-000000000001','panel_focus','portrait_9_16',
  '{"host":"fixture.host","guest_1":"fixture.host.as_guest"}',
  'adaptive-stage-v2.0.0-m1',null), 'program_human_duplicated', 'duplicate person fails closed');
select is(private.live_program_assignment_error_v2(
  'a3000000-0000-4000-8000-000000000001','host_focus','portrait_9_16',
  '{"host":"fixture.unadmitted"}','adaptive-stage-v2.0.0-m1',null), 'program_human_not_admitted',
  'unadmitted human fails closed');
select is(private.live_program_assignment_error_v2(
  'a3000000-0000-4000-8000-000000000001','host_focus','portrait_9_16',
  '{"host":"fixture.foreign"}','adaptive-stage-v2.0.0-m1',null), 'program_source_not_found',
  'foreign-session source fails closed');

update public.live_sessions set maximum_publishers = 4
where id = 'a3000000-0000-4000-8000-000000000001';
select is(private.live_program_assignment_error_v2(
  'a3000000-0000-4000-8000-000000000001','panel_focus','portrait_9_16',
  '{"host":"fixture.host","guest_1":"fixture.guest1","guest_2":"fixture.guest2","guest_3":"fixture.guest3","guest_4":"fixture.guest4"}',
  'adaptive-stage-v2.0.0-m1',null), 'program_capacity_exceeded', 'four-person capacity cannot be bypassed');

update public.live_sessions set maximum_publishers = 6
where id = 'a3000000-0000-4000-8000-000000000001';
update public.live_odo_configuration set large_panel_enabled = false where id = true;
select is(private.live_program_assignment_error_v2(
  'a3000000-0000-4000-8000-000000000001','panel_focus','portrait_9_16',
  '{"host":"fixture.host","guest_1":"fixture.guest1","guest_2":"fixture.guest2","guest_3":"fixture.guest3","guest_4":"fixture.guest4"}',
  'adaptive-stage-v2.0.0-m1',null), 'program_large_panel_unavailable',
  'six-person assignment requires the large-panel flag');

update public.live_sessions set maximum_publishers = 4, format = 'quick_connect'
where id = 'a3000000-0000-4000-8000-000000000001';
select is(private.live_program_assignment_error_v2(
  'a3000000-0000-4000-8000-000000000001','panel_focus','portrait_9_16',
  '{"host":"fixture.host","guest_1":"fixture.guest1","guest_2":"fixture.guest2"}',
  'adaptive-stage-v2.0.0-m1',null), 'program_quick_connect_capacity_exceeded',
  'Quick Connect remains two-person');

select is(private.live_program_assignment_error_v2(
  'a3000000-0000-4000-8000-000000000001','host_focus','portrait_9_16',
  '{"host":"fixture.host"}','adaptive-stage-v2.0.0-m1',
  (select version + 1 from public.live_program_source_updates
    where session_id = 'a3000000-0000-4000-8000-000000000001')),
  'source_graph_stale', 'stale source graph fails closed');

select * from finish();
rollback;
