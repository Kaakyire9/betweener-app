begin;

set local role postgres;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, pg_catalog;

select plan(20);

select has_table('public', 'live_session_audience_policies', 'Live audience policies exist');
select has_column('public', 'live_session_audience_policies', 'policy_mode', 'Audience policy mode is explicit');
select has_column('public', 'live_session_audience_policies', 'reach_scopes', 'Audience supports bounded multi-segment Reach');
select has_column('public', 'live_session_audience_policies', 'diaspora_origin_country_codes', 'Diaspora origin targeting exists');
select has_column('public', 'live_session_audience_policies', 'diaspora_destination_country_codes', 'Diaspora destination targeting exists');

select ok(
  to_regprocedure('public.live_circle_reach_matches_user_v1(uuid,uuid)') is not null,
  'Circle Live Reach matcher exists'
);
select ok(
  to_regprocedure('public.live_audience_policy_matches_user_v1(uuid,uuid,text)') is not null,
  'Live audience matcher exists'
);
select ok(
  to_regprocedure('public.rpc_set_live_session_audience_policy_v1(uuid,bigint,text[],text,text,text,text,text[],text[])') is not null,
  'Version-aware audience management RPC exists'
);
select ok(
  to_regprocedure('public.rpc_schedule_live_studio_session_v2(uuid,text,text,timestamptz,integer,text,boolean,uuid,integer,text[],text,text,text,text,text[],text[])') is not null,
  'Audience-aware Studio scheduling RPC exists'
);
select ok(
  to_regprocedure('public.rpc_schedule_live_studio_session_v1(uuid,text,text,timestamptz,integer,text,boolean,uuid,integer)') is not null,
  'Legacy Studio scheduling signature remains'
);
select ok(
  to_regprocedure('public.can_view_live_session(uuid,uuid)') is not null,
  'Legacy Live visibility signature remains'
);

select ok(
  not has_table_privilege('anon', 'public.live_session_audience_policies', 'SELECT'),
  'Anonymous callers cannot read audience policies directly'
);
select ok(
  not has_table_privilege('authenticated', 'public.live_session_audience_policies', 'SELECT'),
  'Members cannot bypass audience RPCs with direct reads'
);
select ok(
  not has_function_privilege('anon', 'public.rpc_set_live_session_audience_policy_v1(uuid,bigint,text[],text,text,text,text,text[],text[])', 'EXECUTE'),
  'Anonymous callers cannot change Live audience policy'
);
select ok(
  has_function_privilege('authenticated', 'public.rpc_set_live_session_audience_policy_v1(uuid,bigint,text[],text,text,text,text,text[],text[])', 'EXECUTE'),
  'Authenticated creators can use the guarded audience RPC'
);
select ok(
  not has_function_privilege('authenticated', 'public.live_audience_policy_matches_user_v1(uuid,uuid,text)', 'EXECUTE'),
  'The internal audience matcher is not a public member API'
);
select has_trigger(
  'public',
  'live_sessions',
  'live_sessions_ensure_audience_policy_v1',
  'Every new Live receives an audience policy'
);
select ok(
  position('live_audience_policy_matches_user_v1' in pg_get_functiondef('public.can_view_live_session(uuid,uuid)'::regprocedure)) > 0,
  'Live visibility uses the audience policy'
);
select ok(
  position($needle$'discovery'$needle$ in pg_get_functiondef('public.rpc_list_discoverable_circle_live_previews(integer)'::regprocedure)) > 0,
  'Circle Live preview discovery uses the Reach-aware path'
);
select ok(
  position('is_circle_member' in pg_get_functiondef('public.live_audience_policy_matches_user_v1(uuid,uuid,text)'::regprocedure)) > 0,
  'Full Circle Live admission remains membership gated'
);

select * from finish();
rollback;
