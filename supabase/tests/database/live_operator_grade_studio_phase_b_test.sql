begin;

set local role postgres;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, pg_catalog;

select plan(31);

select has_column('public', 'live_studio_access', 'operator_role', 'Studio access has operator role');
select has_table('public', 'live_studio_run_cues', 'Run-of-show cues exist');
select has_table('public', 'live_studio_private_messages', 'Private operator messages exist');
select has_table('public', 'live_studio_operator_presence', 'Redundant operator presence exists');
select has_table('public', 'live_studio_operational_events', 'Operational telemetry exists');

select ok(to_regprocedure('public.rpc_get_live_studio_operator_console_v1(uuid)') is not null, 'Operator console RPC exists');
select ok(to_regprocedure('public.rpc_admin_set_live_studio_access_v2(uuid,boolean,text,jsonb,text,timestamptz)') is not null, 'Role-aware admin RPC exists');
select ok(to_regprocedure('public.rpc_studio_operator_heartbeat_v1(uuid,uuid,text)') is not null, 'Operator heartbeat RPC exists');
select ok(to_regprocedure('public.rpc_studio_upsert_run_cue_v1(uuid,uuid,integer,text,text,text,text,timestamptz)') is not null, 'Cue RPC exists');
select ok(to_regprocedure('public.rpc_studio_post_private_message_v1(uuid,text,text)') is not null, 'Private message RPC exists');
select ok(to_regprocedure('public.rpc_studio_record_operational_event_v1(uuid,text,text,jsonb,boolean)') is not null, 'Telemetry RPC exists');
select ok(to_regprocedure('public.rpc_studio_acknowledge_alert_v1(uuid,bigint)') is not null, 'Alert acknowledgement RPC exists');
select ok(to_regprocedure('public.rpc_studio_emergency_safe_scene_v1(uuid,text)') is not null, 'Emergency scene RPC exists');
select ok(to_regprocedure('public.rpc_studio_take_live_program_v2(uuid,uuid,bigint,bigint,uuid,text,text,jsonb,text)') is not null, 'AAL2 TAKE RPC exists');
select ok(to_regprocedure('public.rpc_get_live_studio_media_admission_v2(uuid,uuid,text)') is not null, 'AAL2 media admission exists');
select ok(to_regprocedure('public.rpc_studio_start_live_session_v1(uuid)') is not null, 'AAL2 Start Live RPC exists');
select ok(to_regprocedure('public.rpc_studio_end_live_session_v1(uuid)') is not null, 'AAL2 End Live RPC exists');

select ok(not has_table_privilege('authenticated', 'public.live_studio_run_cues', 'SELECT'), 'Cues have no direct member reads');
select ok(not has_table_privilege('authenticated', 'public.live_studio_private_messages', 'SELECT'), 'Private messages have no direct member reads');
select ok(not has_table_privilege('authenticated', 'public.live_studio_operator_presence', 'SELECT'), 'Presence has no direct member reads');
select ok(not has_table_privilege('authenticated', 'public.live_studio_operational_events', 'SELECT'), 'Telemetry has no direct member reads');
select ok(not has_function_privilege('anon', 'public.rpc_studio_emergency_safe_scene_v1(uuid,text)', 'EXECUTE'), 'Anonymous cannot use emergency scene');
select ok(has_function_privilege('authenticated', 'public.rpc_studio_emergency_safe_scene_v1(uuid,text)', 'EXECUTE'), 'Authorized members reach guarded emergency RPC');
select ok(not has_function_privilege('authenticated', 'public.rpc_studio_take_live_program_v1(uuid,uuid,bigint,bigint,uuid,text,text,jsonb,text)', 'EXECUTE'), 'Legacy TAKE bypass is closed');
select ok(has_function_privilege('authenticated', 'public.rpc_studio_take_live_program_v2(uuid,uuid,bigint,bigint,uuid,text,text,jsonb,text)', 'EXECUTE'), 'AAL2 TAKE is callable');
select ok(not has_function_privilege('authenticated', 'public.rpc_get_live_studio_media_admission_v1(uuid,uuid,text)', 'EXECUTE'), 'Legacy media bypass is closed');
select ok(has_function_privilege('authenticated', 'public.rpc_get_live_studio_media_admission_v2(uuid,uuid,text)', 'EXECUTE'), 'AAL2 media admission is callable');
select ok(position('branded_intermission' in pg_get_functiondef('public.rpc_studio_emergency_safe_scene_v1(uuid,text)'::regprocedure)) > 0, 'Emergency action selects the safe scene');
select ok(position('live_studio_has_aal2_v1' in pg_get_functiondef('public.rpc_studio_take_live_program_v2(uuid,uuid,bigint,bigint,uuid,text,text,jsonb,text)'::regprocedure)) > 0, 'TAKE enforces AAL2 server-side');
select has_trigger('public', 'live_sessions', 'live_sessions_studio_step_up_transition_v1', 'Studio publish/end transition has a step-up trigger');
select ok(position($needle$new.status in ('live','ended')$needle$ in pg_get_functiondef('public.live_studio_enforce_step_up_transition_v1()'::regprocedure)) > 0, 'Generic transition bypass is closed for Studio publishers');

select * from finish();
rollback;
