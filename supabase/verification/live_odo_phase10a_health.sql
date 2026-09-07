-- Betweener Live Phase 10A Odo production health check.
-- Strictly read-only. It never invokes Odo, changes configuration, acquires a
-- lease, emits a director event, or returns prompts/member content.

-- 1. Additive migration ledger.
with expected(version, purpose) as (
  values
    ('20260907100000', 'Odo shadow persistence and protocol'),
    ('20260907101000', 'Odo concurrent indexes'),
    ('20260907102000', 'Odo lease, budget and shadow policy'),
    ('20260907103000', 'Odo protocol visibility and task budget hardening')
)
select expected.version, expected.purpose,
  exists (select 1 from supabase_migrations.schema_migrations migration
    where migration.version = expected.version) as installed
from expected order by expected.version;

-- 2. Phase 10A flags. Every value shown here must preserve shadow-only mode.
select
  configuration.odo_enabled,
  configuration.shadow_mode,
  configuration.copilot_enabled,
  configuration.autopilot_enabled,
  configuration.conversation_spark_enabled,
  configuration.audience_pulse_enabled,
  configuration.music_enabled,
  configuration.circuit_breaker_open,
  configuration.pricing_version,
  configuration.task_call_limits_per_minute,
  configuration.updated_at,
  configuration.shadow_mode
    and not configuration.copilot_enabled
    and not configuration.autopilot_enabled
    and not configuration.conversation_spark_enabled
    and not configuration.audience_pulse_enabled
    and not configuration.music_enabled as phase10a_invariant_healthy
from public.live_odo_configuration configuration
where configuration.id = true;

-- 3. Narrow RPC execution boundaries.
with expected(name, signature, authenticated_execute, service_execute) as (
  values
    ('begin call', 'public.rpc_service_begin_live_odo_call_v1(uuid,uuid,uuid,uuid,text,text,text,text,text)', false, true),
    ('evaluate action', 'public.rpc_service_evaluate_live_odo_action_v1(uuid,uuid,jsonb,boolean,text,text,bigint,bigint,bigint,integer,boolean,text)', false, true),
    ('renew lease', 'public.rpc_service_renew_live_odo_lease_v1(uuid,uuid,bigint)', false, true),
    ('record failure', 'public.rpc_service_fail_live_odo_call_v1(uuid,uuid,text,boolean)', false, true),
    ('policy pause', 'public.rpc_service_pause_live_odo_policy_v1(uuid,text)', false, true),
    ('host takeover', 'public.rpc_take_over_live_odo_v1(uuid)', true, true),
    ('autopilot resume gate', 'public.rpc_resume_live_odo_autopilot_v1(uuid)', true, true),
    ('director snapshot', 'public.rpc_get_live_director_snapshot_v1(uuid,bigint,integer)', true, true),
    ('admin configuration', 'public.rpc_admin_update_live_odo_configuration_v1(jsonb)', true, true),
    ('admin trace', 'public.rpc_get_live_odo_admin_trace_v1(uuid,integer)', true, true)
), resolved as (
  select expected.*, to_regprocedure(expected.signature) procedure_oid from expected
)
select name, procedure_oid is not null as installed,
  case when procedure_oid is null then false else
    has_function_privilege('authenticated', procedure_oid, 'EXECUTE') = authenticated_execute
  end as authenticated_boundary_healthy,
  case when procedure_oid is null then false else
    has_function_privilege('service_role', procedure_oid, 'EXECUTE') = service_execute
  end as service_boundary_healthy
from resolved order by name;

-- 4. Table RLS/direct-write and ordered-event index contract.
with tables(name) as (values
  ('live_odo_configuration'), ('live_odo_session_state'),
  ('live_odo_ai_usage'), ('live_odo_action_attempts'),
  ('live_odo_budget_windows'), ('live_director_events'),
  ('live_director_updates'), ('live_odo_trace_events')
)
select tables.name,
  coalesce(metadata.relrowsecurity, false) as rls_enabled,
  not has_table_privilege('authenticated', format('public.%I', tables.name), 'INSERT')
    and not has_table_privilege('authenticated', format('public.%I', tables.name), 'UPDATE')
    and not has_table_privilege('authenticated', format('public.%I', tables.name), 'DELETE')
    as authenticated_direct_writes_denied
from tables
left join pg_class metadata on metadata.oid = to_regclass(format('public.%I', tables.name))
order by tables.name;

select
  exists (select 1 from pg_index where indexrelid =
    to_regclass('public.live_director_events_idempotency_unique')
    and indisunique and indisvalid and indisready) as event_idempotency_index_healthy,
  exists (select 1 from pg_index where indexrelid =
    to_regclass('public.live_odo_usage_open_idx')
    and indisvalid and indisready) as open_call_index_healthy,
  exists (select 1 from pg_index where indexrelid =
    to_regclass('public.live_odo_session_active_lease_idx')
    and indisvalid and indisready) as active_lease_index_healthy;

-- 5. Operational state. Stale leases/calls and all Odo director events are blockers.
select
  count(*) filter (where lease_owner is not null and lease_expires_at <= now())::integer
    as stale_leases,
  count(*) filter (where lease_owner is not null and lease_expires_at > now())::integer
    as active_leases,
  max(lease_heartbeat_at) as last_lease_heartbeat_at,
  max(last_decision_at) as last_shadow_decision_at
from public.live_odo_session_state;

select
  status,
  model_class,
  model,
  count(*) filter (where started_at >= now() - interval '24 hours')::integer as calls_24h,
  coalesce(sum(input_tokens) filter (where started_at >= now() - interval '24 hours'), 0)::bigint as input_tokens_24h,
  coalesce(sum(output_tokens) filter (where started_at >= now() - interval '24 hours'), 0)::bigint as output_tokens_24h,
  coalesce(sum(estimated_cost_micros) filter (where started_at >= now() - interval '24 hours'), 0)::bigint as estimated_cost_micros_24h,
  max(started_at) as last_call_at
from public.live_odo_ai_usage
group by status, model_class, model
order by calls_24h desc, status, model;

-- 6. Final Phase 10A gate. healthy must be true and release_blockers zero.
with migration_blockers as (
  select count(*)::bigint affected from (values
    ('20260907100000'), ('20260907101000'), ('20260907102000'),
    ('20260907103000')
  ) expected(version)
  where not exists (select 1 from supabase_migrations.schema_migrations migration
    where migration.version = expected.version)
), configuration_blockers as (
  select case when exists (
    select 1 from public.live_odo_configuration configuration
    where configuration.id = true
      and configuration.shadow_mode
      and not configuration.copilot_enabled
      and not configuration.autopilot_enabled
      and not configuration.conversation_spark_enabled
      and not configuration.audience_pulse_enabled
      and not configuration.music_enabled
      and (not configuration.odo_enabled
        or configuration.pricing_version <> 'unconfigured')
  ) then 0::bigint else 1::bigint end affected
), lease_blockers as (
  select count(*)::bigint affected from public.live_odo_session_state
  where lease_owner is not null and lease_expires_at <= now()
), call_blockers as (
  select count(*)::bigint affected from public.live_odo_ai_usage
  where status = 'started' and started_at < now() - interval '2 minutes'
), visible_event_blockers as (
  select count(*)::bigint affected from public.live_director_events
  where source = 'odo'
), protocol_blockers as (
  select case when
    exists (select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'live_director_events'
        and column_name = 'visibility' and is_nullable = 'NO')
    and exists (select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'live_director_events'
        and column_name = 'action_id')
    and exists (select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'live_director_events'
        and column_name = 'expires_at')
    and to_regprocedure(
      'public.live_odo_append_director_event_v1(uuid,integer,text,text,text,uuid,uuid,jsonb,timestamptz)'
    ) is not null
    then 0::bigint else 1::bigint end affected
), boundary_blockers as (
  select count(*)::bigint affected from (values
    ('public.rpc_service_begin_live_odo_call_v1(uuid,uuid,uuid,uuid,text,text,text,text,text)'),
    ('public.rpc_service_evaluate_live_odo_action_v1(uuid,uuid,jsonb,boolean,text,text,bigint,bigint,bigint,integer,boolean,text)'),
    ('public.rpc_service_renew_live_odo_lease_v1(uuid,uuid,bigint)'),
    ('public.rpc_service_fail_live_odo_call_v1(uuid,uuid,text,boolean)'),
    ('public.rpc_service_pause_live_odo_policy_v1(uuid,text)')
  ) expected(signature)
  where to_regprocedure(expected.signature) is null
    or has_function_privilege('authenticated', to_regprocedure(expected.signature), 'EXECUTE')
    or not has_function_privilege('service_role', to_regprocedure(expected.signature), 'EXECUTE')
), totals as (
  select migration_blockers.affected migration_release_blockers,
    configuration_blockers.affected configuration_release_blockers,
    lease_blockers.affected stale_lease_release_blockers,
    call_blockers.affected stale_call_release_blockers,
    visible_event_blockers.affected visible_event_release_blockers,
    protocol_blockers.affected protocol_release_blockers,
    boundary_blockers.affected boundary_release_blockers
  from migration_blockers, configuration_blockers, lease_blockers,
    call_blockers, visible_event_blockers, protocol_blockers, boundary_blockers
)
select *,
  migration_release_blockers + configuration_release_blockers
    + stale_lease_release_blockers + stale_call_release_blockers
    + visible_event_release_blockers + protocol_release_blockers
    + boundary_release_blockers as release_blockers,
  migration_release_blockers + configuration_release_blockers
    + stale_lease_release_blockers + stale_call_release_blockers
    + visible_event_release_blockers + protocol_release_blockers
    + boundary_release_blockers = 0 as healthy
from totals;
