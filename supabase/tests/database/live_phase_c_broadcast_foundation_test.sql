begin;

set local role postgres;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, pg_catalog;

select plan(22);

select has_table('public', 'live_broadcast_runtimes', 'Broadcast runtime table exists');
select has_table('public', 'live_public_media_consents', 'Public media consent table exists');
select has_table('public', 'live_broadcast_artifacts', 'Broadcast artifact table exists');
select has_table('public', 'live_broadcast_runtime_events', 'Broadcast runtime event table exists');

select has_column('public', 'live_sessions', 'broadcast_delivery_mode', 'Live has delivery mode');
select has_column('public', 'live_sessions', 'caption_source_language', 'Live has caption language');
select has_column('public', 'live_sessions', 'caption_translation_languages', 'Live has translation targets');

select ok(to_regprocedure('public.rpc_service_list_live_broadcast_work_v1(uuid,integer)') is not null, 'Work discovery RPC exists');
select ok(to_regprocedure('public.rpc_service_claim_live_broadcast_v1(uuid,uuid)') is not null, 'Compositor claim RPC exists');
select ok(to_regprocedure('public.rpc_service_heartbeat_live_broadcast_v1(uuid,uuid,bigint,bigint,text,text,text,text,text,text)') is not null, 'Compositor heartbeat RPC exists');
select ok(to_regprocedure('public.rpc_service_release_live_broadcast_v1(uuid,uuid,bigint,text)') is not null, 'Compositor release RPC exists');
select ok(to_regprocedure('public.rpc_service_maintain_live_broadcast_v1(integer)') is not null, 'Compositor maintenance RPC exists');
select ok(to_regprocedure('public.run_live_maintenance_without_broadcast_phase_c_v1()') is not null, 'Prior maintenance chain is preserved');
select ok(to_regprocedure('public.rpc_get_live_audience_delivery_v1(uuid)') is not null, 'Audience delivery RPC exists');
select ok(to_regprocedure('public.rpc_set_live_public_media_consent_v1(uuid,text,boolean,text)') is not null, 'Consent RPC exists');

select ok(not has_table_privilege('authenticated', 'public.live_broadcast_runtimes', 'SELECT'), 'Members cannot read runtime internals');
select ok(not has_table_privilege('authenticated', 'public.live_public_media_consents', 'SELECT'), 'Members cannot read other consent rows');
select ok(not has_table_privilege('authenticated', 'public.live_broadcast_artifacts', 'SELECT'), 'Members cannot read artifact object keys');
select ok(not has_table_privilege('authenticated', 'public.live_broadcast_runtime_events', 'SELECT'), 'Members cannot read worker telemetry');
select ok(not has_function_privilege('authenticated', 'public.rpc_service_claim_live_broadcast_v1(uuid,uuid)', 'EXECUTE'), 'Members cannot claim compositor work');
select ok(has_function_privilege('authenticated', 'public.rpc_get_live_audience_delivery_v1(uuid)', 'EXECUTE'), 'Members can request guarded delivery');
select ok(has_function_privilege('authenticated', 'public.rpc_set_live_public_media_consent_v1(uuid,text,boolean,text)', 'EXECUTE'), 'Members can decide their own consent');

select * from finish();
rollback;
