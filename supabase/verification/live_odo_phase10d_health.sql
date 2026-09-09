-- Betweener Live Phase 10D Odo Full Quick Connect production health check.
-- Strictly read-only. It never enables Odo, opens or closes Quick Connect,
-- creates a pair, reads private decisions, or returns pair-private Spark copy.

-- 1. Additive migration ledger.
with expected(version, purpose) as (values
  ('20260908140000', 'Odo Full Quick Connect control and state'),
  ('20260908141000', 'Odo Full Quick Connect lifecycle orchestrator')
)
select expected.version, expected.purpose,
  exists (select 1 from supabase_migrations.schema_migrations migration
    where migration.version = expected.version) as installed
from expected order by expected.version;

-- 2. Controlled rollout. An entirely disabled rollout is healthy. Phase 10D
-- remains separate from full-show Autopilot and has no music authority.
select
  configuration.odo_enabled,
  configuration.shadow_mode,
  configuration.guarded_autopilot_enabled,
  configuration.full_quick_connect_autopilot_enabled,
  configuration.full_quick_connect_internal_only,
  configuration.full_autopilot_enabled,
  configuration.music_enabled,
  configuration.circuit_breaker_open,
  configuration.full_quick_connect_low_liquidity_seconds,
  configuration.full_quick_connect_maximum_runtime_minutes,
  configuration.full_quick_connect_reconcile_seconds,
  not configuration.full_autopilot_enabled
    and not configuration.music_enabled
    and configuration.full_quick_connect_internal_only
    and (
      not configuration.full_quick_connect_autopilot_enabled
      or (
        configuration.odo_enabled
        and configuration.shadow_mode
        and configuration.guarded_autopilot_enabled
      )
    ) as phase10d_invariant_healthy
from public.live_odo_configuration configuration
where configuration.id = true;

-- 3. Narrow Host, participant, service and admin execution boundaries.
with expected(name, signature, authenticated_execute, service_execute) as (values
  ('Host state','public.rpc_get_live_odo_full_quick_connect_v1(uuid)',true,true),
  ('Host enable','public.rpc_enable_live_odo_full_quick_connect_v1(uuid,jsonb)',true,true),
  ('Host finish','public.rpc_finish_live_odo_quick_connect_v1(uuid)',true,true),
  ('Host resume','public.rpc_resume_live_odo_full_quick_connect_v1(uuid)',true,true),
  ('Host takeover','public.rpc_take_over_live_odo_v1(uuid)',true,true),
  ('participant state','public.rpc_get_live_odo_quick_connect_public_v1(uuid)',true,true),
  ('Quick Connect projection','public.rpc_get_live_quick_connect(uuid)',true,true),
  ('service reconcile',
    'public.rpc_service_reconcile_live_odo_full_quick_connect_v1(uuid,uuid,uuid)',false,true),
  ('Safety clearance',
    'public.rpc_service_clear_live_odo_policy_pause_v1(uuid,text)',false,true),
  ('admin configuration',
    'public.rpc_admin_update_live_odo_full_quick_connect_v1(jsonb)',true,true)
), resolved as (
  select expected.*, to_regprocedure(expected.signature) procedure_oid
  from expected
)
select name, procedure_oid is not null as installed,
  case when procedure_oid is null then false else
    has_function_privilege('authenticated',procedure_oid,'EXECUTE')
      = authenticated_execute end as authenticated_boundary_healthy,
  case when procedure_oid is null then false else
    has_function_privilege('service_role',procedure_oid,'EXECUTE')
      = service_execute end as service_boundary_healthy
from resolved order by name;

-- 4. Private storage and content-free Realtime boundary.
with expected(name, authenticated_select) as (values
  ('live_odo_full_quick_connect_settings',false),
  ('live_odo_full_quick_connect_actions',false),
  ('live_odo_full_quick_connect_updates',true)
)
select expected.name,
  coalesce(metadata.relrowsecurity,false) as rls_enabled,
  has_table_privilege(
    'authenticated',format('public.%I',expected.name),'SELECT'
  ) = expected.authenticated_select as authenticated_read_boundary_healthy,
  not has_table_privilege(
    'authenticated',format('public.%I',expected.name),'INSERT'
  ) and not has_table_privilege(
    'authenticated',format('public.%I',expected.name),'UPDATE'
  ) and not has_table_privilege(
    'authenticated',format('public.%I',expected.name),'DELETE'
  ) as authenticated_direct_writes_denied,
  not has_table_privilege(
    'service_role',format('public.%I',expected.name),'INSERT'
  ) and not has_table_privilege(
    'service_role',format('public.%I',expected.name),'UPDATE'
  ) and not has_table_privilege(
    'service_role',format('public.%I',expected.name),'DELETE'
  ) as service_direct_writes_denied
from expected
left join pg_class metadata
  on metadata.oid = to_regclass(format('public.%I',expected.name))
order by expected.name;

select
  exists (select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public'
      and tablename = 'live_odo_full_quick_connect_updates')
    as realtime_invalidation_healthy,
  exists (select 1 from pg_index where indexrelid =
    to_regclass('public.live_odo_full_quick_actions_session_idx')
      and indisvalid and indisready) as action_history_index_healthy,
  exists (select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'live_quick_connect_pairings'
      and column_name = 'odo_conversation_spark') as private_spark_storage_healthy;

-- 5. Content-free operational telemetry.
select settings.lifecycle_state, settings.orchestration_state,
  settings.energy_mode, settings.enabled, control.state as control_state,
  count(*)::integer as sessions,
  max(settings.last_reconciled_at) as last_reconciled_at,
  max(settings.next_wake_at) as next_wake_at
from public.live_odo_full_quick_connect_settings settings
join public.live_quick_connect_controls control
  on control.session_id = settings.session_id
group by settings.lifecycle_state, settings.orchestration_state,
  settings.energy_mode, settings.enabled, control.state
order by sessions desc, settings.lifecycle_state;

select action.action_type, action.reason_code, action.status,
  count(*) filter (where action.executed_at >= now() - interval '24 hours')::integer
    as actions_24h,
  max(action.executed_at) as last_action_at
from public.live_odo_full_quick_connect_actions action
where action.executed_at >= now() - interval '7 days'
group by action.action_type, action.reason_code, action.status
order by actions_24h desc, action.action_type;

-- 6. Final Phase 10D gate. Every blocker count must be zero.
with migration_blockers as (
  select count(*)::bigint affected from (values
    ('20260908140000'),('20260908141000')
  ) expected(version)
  where not exists (
    select 1 from supabase_migrations.schema_migrations migration
    where migration.version = expected.version
  )
), configuration_blockers as (
  select case when exists (
    select 1 from public.live_odo_configuration configuration
    where configuration.id = true
      and not configuration.full_autopilot_enabled
      and not configuration.music_enabled
      and configuration.full_quick_connect_internal_only
      and (
        not configuration.full_quick_connect_autopilot_enabled
        or (
          configuration.odo_enabled
          and configuration.shadow_mode
          and configuration.guarded_autopilot_enabled
        )
      )
  ) then 0::bigint else 1::bigint end affected
), boundary_blockers as (
  select count(*)::bigint affected from (values
    ('public.rpc_get_live_odo_full_quick_connect_v1(uuid)',true,true),
    ('public.rpc_enable_live_odo_full_quick_connect_v1(uuid,jsonb)',true,true),
    ('public.rpc_finish_live_odo_quick_connect_v1(uuid)',true,true),
    ('public.rpc_resume_live_odo_full_quick_connect_v1(uuid)',true,true),
    ('public.rpc_take_over_live_odo_v1(uuid)',true,true),
    ('public.rpc_get_live_odo_quick_connect_public_v1(uuid)',true,true),
    ('public.rpc_get_live_quick_connect(uuid)',true,true),
    ('public.rpc_service_reconcile_live_odo_full_quick_connect_v1(uuid,uuid,uuid)',false,true),
    ('public.rpc_service_clear_live_odo_policy_pause_v1(uuid,text)',false,true),
    ('public.rpc_admin_update_live_odo_full_quick_connect_v1(jsonb)',true,true)
  ) expected(signature,authenticated_execute,service_execute)
  where to_regprocedure(expected.signature) is null
    or has_function_privilege(
      'authenticated',to_regprocedure(expected.signature),'EXECUTE'
    ) <> expected.authenticated_execute
    or has_function_privilege(
      'service_role',to_regprocedure(expected.signature),'EXECUTE'
    ) <> expected.service_execute
), storage_blockers as (
  select count(*)::bigint affected from (values
    ('live_odo_full_quick_connect_settings',false),
    ('live_odo_full_quick_connect_actions',false),
    ('live_odo_full_quick_connect_updates',true)
  ) expected(name,authenticated_select)
  where not exists (
      select 1 from pg_class metadata
      where metadata.oid = to_regclass(format('public.%I',expected.name))
        and metadata.relrowsecurity
    )
    or has_table_privilege(
      'authenticated',format('public.%I',expected.name),'SELECT'
    ) <> expected.authenticated_select
    or has_table_privilege(
      'authenticated',format('public.%I',expected.name),'INSERT'
    ) or has_table_privilege(
      'authenticated',format('public.%I',expected.name),'UPDATE'
    ) or has_table_privilege(
      'authenticated',format('public.%I',expected.name),'DELETE'
    ) or has_table_privilege(
      'service_role',format('public.%I',expected.name),'INSERT'
    ) or has_table_privilege(
      'service_role',format('public.%I',expected.name),'UPDATE'
    ) or has_table_privilege(
      'service_role',format('public.%I',expected.name),'DELETE'
    )
), protocol_blockers as (
  select case when
    exists (select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public'
        and tablename = 'live_odo_full_quick_connect_updates')
    and exists (select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'live_quick_connect_pairings'
        and column_name = 'odo_conversation_spark')
    and exists (select 1 from pg_index where indexrelid =
      to_regclass('public.live_odo_full_quick_actions_session_idx')
        and indisvalid and indisready)
    and to_regprocedure('public.run_live_maintenance()') is not null
    and position(
      'rpc_service_reconcile_live_odo_full_quick_connect_v1'
      in pg_get_functiondef(to_regprocedure('public.run_live_maintenance()'))
    ) > 0
    then 0::bigint else 1::bigint end affected
), allowlist_blockers as (
  select count(*)::bigint affected
  from public.live_odo_full_quick_connect_settings settings
  cross join public.live_odo_configuration configuration
  where configuration.id = true
    and configuration.full_quick_connect_internal_only
    and settings.enabled
    and not exists (
      select 1 from public.live_odo_guarded_autopilot_host_allowlist access
      where access.user_id = settings.enabled_by_user_id
    )
), state_blockers as (
  select count(*)::bigint affected
  from public.live_odo_full_quick_connect_settings settings
  join public.live_odo_session_state state on state.session_id = settings.session_id
  join public.live_sessions session_row on session_row.id = settings.session_id
  left join public.live_quick_connect_controls control
    on control.session_id = settings.session_id
  where
    (settings.enabled and (
      session_row.status <> 'live'
      or session_row.format <> 'quick_connect'
      or control.session_id is null
      or state.direction_mode <> 'autopilot'
      or state.autopilot_state not in ('starting','active','recovering')
      or settings.lifecycle_state not in (
        'preparing','starting','active','draining','closing','recovering'
      )
    ))
    or (settings.lifecycle_state in ('paused_by_host','paused_by_policy','ended')
      and settings.enabled)
    or (settings.lifecycle_state = 'active' and control.state <> 'open')
    or (settings.lifecycle_state in ('draining','closing')
      and control.state not in ('draining','ended'))
), stale_wake_blockers as (
  select count(*)::bigint affected
  from public.live_odo_full_quick_connect_settings settings
  join public.live_sessions session_row on session_row.id = settings.session_id
  where settings.enabled and session_row.status = 'live'
    and settings.next_wake_at < now() - interval '2 minutes'
), stale_lease_blockers as (
  select count(*)::bigint affected
  from public.live_odo_full_quick_connect_settings settings
  join public.live_odo_session_state state on state.session_id = settings.session_id
  where settings.enabled and state.lease_owner is not null
    and state.lease_expires_at <= now()
), action_authority_blockers as (
  select count(*)::bigint affected
  from public.live_odo_full_quick_connect_actions action
  where action.action_type not in (
    'OPEN_POOL','SYNC_MATCHER','PAIR_OBSERVED','ROUND_COMPLETED',
    'RETURN_TO_POOL','ENTER_LOW_LIQUIDITY','SHOW_PRIVATE_SPARK',
    'QUEUE_TIME_CUE','BEGIN_DRAINING','QUICK_CONNECT_CLOSING',
    'CLOSE_QUICK_CONNECT','RECOVER','WAIT'
  ) or action.status not in ('executed','skipped','stale','failed')
), private_content_blockers as (
  select count(*)::bigint affected
  from public.live_director_events event
  where event.payload ? 'question'
    and (
      event.payload ->> 'source' = 'odo_full_quick_connect'
      or event.event_type like 'QUICK_CONNECT%'
    )
), totals as (
  select
    migration_blockers.affected migration_release_blockers,
    configuration_blockers.affected configuration_release_blockers,
    boundary_blockers.affected boundary_release_blockers,
    storage_blockers.affected storage_release_blockers,
    protocol_blockers.affected protocol_release_blockers,
    allowlist_blockers.affected allowlist_release_blockers,
    state_blockers.affected state_release_blockers,
    stale_wake_blockers.affected stale_wake_release_blockers,
    stale_lease_blockers.affected stale_lease_release_blockers,
    action_authority_blockers.affected action_authority_release_blockers,
    private_content_blockers.affected private_content_release_blockers
  from migration_blockers,configuration_blockers,boundary_blockers,
    storage_blockers,protocol_blockers,allowlist_blockers,state_blockers,
    stale_wake_blockers,stale_lease_blockers,action_authority_blockers,
    private_content_blockers
)
select *,
  migration_release_blockers + configuration_release_blockers
    + boundary_release_blockers + storage_release_blockers
    + protocol_release_blockers + allowlist_release_blockers
    + state_release_blockers + stale_wake_release_blockers
    + stale_lease_release_blockers + action_authority_release_blockers
    + private_content_release_blockers as release_blockers,
  migration_release_blockers + configuration_release_blockers
    + boundary_release_blockers + storage_release_blockers
    + protocol_release_blockers + allowlist_release_blockers
    + state_release_blockers + stale_wake_release_blockers
    + stale_lease_release_blockers + action_authority_release_blockers
    + private_content_release_blockers = 0 as healthy
from totals;
