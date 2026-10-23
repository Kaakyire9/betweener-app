begin;

set local role postgres;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, pg_catalog;

select plan(40);

select has_column('public', 'circles', 'reach_scope', 'Circle reach is explicit');
select has_column('public', 'circles', 'access_policy', 'Circle access is explicit');
select has_column('public', 'circles', 'diaspora_origin_country_codes', 'Diaspora origin targeting exists');
select has_column('public', 'circles', 'diaspora_destination_country_codes', 'Diaspora destination targeting exists');
select has_column('public', 'circles', 'membership_eligibility_policy', 'Membership eligibility policy exists');
select has_column('public', 'circles', 'live_discovery_policy', 'Live discovery policy exists');

select ok(to_regprocedure('public.rpc_create_circle_request_v2(text,text,text,text,text,text,text,text,text,text,text[],text[],text,text,text[],text[],text[],text[],text)') is not null, 'v2 create RPC exists');
select ok(to_regprocedure('public.rpc_update_circle_request_v2(uuid,text,text,text,text,text,text,text,text,text,text,text[],text[],text,text,text[],text[],text[],text[],text)') is not null, 'v2 update RPC exists');
select ok(to_regprocedure('public.rpc_join_circle(uuid,uuid)') is not null, 'legacy join signature remains');
select ok(to_regprocedure('public.rpc_list_discoverable_circle_live_previews(integer)') is not null, 'safe Circle Live preview RPC exists');

select ok(not has_function_privilege('anon', 'public.rpc_list_discoverable_circle_live_previews(integer)', 'EXECUTE'), 'anonymous users cannot list Circle Live previews');
select ok(has_function_privilege('authenticated', 'public.rpc_list_discoverable_circle_live_previews(integer)', 'EXECUTE'), 'authenticated members can list safe previews');
select ok(not has_function_privilege('anon', 'public.rpc_join_circle(uuid,uuid)', 'EXECUTE'), 'anonymous callers cannot join Circles');
select ok(has_function_privilege('authenticated', 'public.rpc_join_circle(uuid,uuid)', 'EXECUTE'), 'authenticated callers retain legacy join access');

select has_table('public', 'circle_member_notification_preferences', 'per-Circle notification preferences exist');
select has_table('public', 'circle_notification_campaigns', 'durable notification campaigns exist');
select has_table('public', 'circle_notification_deliveries', 'per-recipient delivery state exists');
select ok(to_regprocedure('public.rpc_mark_circle_notification_seen_v1(uuid)') is not null, 'notification seen RPC exists');
select ok(to_regprocedure('public.rpc_list_my_circle_notifications_v1(integer)') is not null, 'private notification inbox RPC exists');
select ok(not has_function_privilege('anon', 'public.rpc_mark_circle_notification_seen_v1(uuid)', 'EXECUTE'), 'anonymous callers cannot mutate delivery state');
select ok(has_function_privilege('authenticated', 'public.rpc_mark_circle_notification_seen_v1(uuid)', 'EXECUTE'), 'authenticated recipients can mark their delivery seen');

select ok(not has_function_privilege('anon', 'public.enqueue_circle_pulse_push(uuid,uuid,text,text,text,jsonb)', 'EXECUTE'), 'anonymous callers cannot invoke internal push helper');
select ok(not has_function_privilege('authenticated', 'public.enqueue_circle_pulse_push(uuid,uuid,text,text,text,jsonb)', 'EXECUTE'), 'members cannot invoke internal push helper');
select ok(not has_function_privilege('service_role', 'public.enqueue_circle_pulse_push(uuid,uuid,text,text,text,jsonb)', 'EXECUTE'), 'service role cannot directly invoke trigger helper');
select ok(not has_function_privilege('authenticated', 'public.ensure_circle_pulse_welcome_member()', 'EXECUTE'), 'members cannot invoke welcome trigger helper');
select ok(has_function_privilege('authenticated', 'public.rpc_get_circle_live_snapshot(uuid)', 'EXECUTE'), 'member-gated legacy Circle Live RPC remains callable');

select ok(to_regprocedure('public.rpc_list_circle_member_previews_v1(uuid[],integer)') is not null, 'privacy-safe Circle member preview RPC exists');
select ok(not has_function_privilege('anon', 'public.rpc_list_circle_member_previews_v1(uuid[],integer)', 'EXECUTE'), 'anonymous callers cannot list Circle member previews');
select ok(has_function_privilege('authenticated', 'public.rpc_list_circle_member_previews_v1(uuid[],integer)', 'EXECUTE'), 'authenticated members can list eligible Circle previews');
select ok(not has_function_privilege('authenticated', 'public.sync_circle_member_count_v1()', 'EXECUTE'), 'members cannot invoke the internal member-count trigger helper');
select ok(not has_function_privilege('service_role', 'public.sync_circle_member_count_v1()', 'EXECUTE'), 'service role cannot invoke the member-count trigger helper directly');
select has_trigger('public', 'circle_members', 'circle_members_sync_member_count_insert_delete', 'membership inserts and deletes refresh the Circle count');
select has_trigger('public', 'circle_members', 'circle_members_sync_member_count_update', 'membership status changes refresh the Circle count');
select ok(
  position('public.blocks' in pg_get_functiondef('public.rpc_list_circle_member_previews_v1(uuid[],integer)'::regprocedure)) > 0,
  'Circle member previews enforce block relationships'
);

select ok(to_regprocedure('public.get_ranked_circles_for_profile(uuid,text,integer)') is not null, 'Circle discovery ranking signature remains compatible');
select ok(not has_function_privilege('anon', 'public.get_ranked_circles_for_profile(uuid,text,integer)', 'EXECUTE'), 'anonymous callers cannot rank Circles for a profile');
select ok(has_function_privilege('authenticated', 'public.get_ranked_circles_for_profile(uuid,text,integer)', 'EXECUTE'), 'authenticated callers retain Circle discovery access');
select ok(
  position('origin_country_code' in pg_get_functiondef('public.get_ranked_circles_for_profile(uuid,text,integer)'::regprocedure)) > 0,
  'Diaspora discovery uses explicit origin country'
);
select ok(
  position('candidate.resolved_reach = ''global''' in pg_get_functiondef('public.get_ranked_circles_for_profile(uuid,text,integer)'::regprocedure)) > 0,
  'Global discovery cannot bypass targeted reach'
);
select ok(
  position($needle$viewer.current_country_code <> ''$needle$ in pg_get_functiondef('public.get_ranked_circles_for_profile(uuid,text,integer)'::regprocedure)) > 0,
  'Targeted discovery fails closed when viewer country is missing'
);

select * from finish();
rollback;
