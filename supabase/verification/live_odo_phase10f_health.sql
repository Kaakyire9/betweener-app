-- Betweener Live Phase 10F production health gate.
-- Read-only: never creates an opportunity, session, Stream call, or invitation.

-- 1. Additive migration ledger.
with expected(version, purpose) as (values
  ('20260909120000', 'System-owned session authority'),
  ('20260909121000', 'Private availability and opportunity storage'),
  ('20260909122000', 'Bounded pairability-aware opportunity engine'),
  ('20260909123000', 'System session and autonomous lifecycle orchestrator'),
  ('20260909124000', 'Safety, cleanup, rollout and Studio-safe contracts'),
  ('20260909125000', 'System-session music rollout enforcement'),
  ('20260910100000', 'Joined experience conflict semantics'),
  ('20260910101000', 'Always-on maintenance clock recovery')
)
select expected.version, expected.purpose,
  exists (select 1 from supabase_migrations.schema_migrations migration
    where migration.version = expected.version) installed
from expected order by expected.version;

-- 2. Rollout configuration. Defaults may remain disabled; the dependency
-- chain and closed-beta boundary must always be safe.
select
  configuration.availability_enabled,
  configuration.shadow_detection_enabled,
  configuration.invitations_enabled,
  configuration.system_session_creation_enabled,
  configuration.odo_start_enabled,
  configuration.music_enabled,
  configuration.automatic_ending_enabled,
  configuration.circuit_breaker_open,
  configuration.internal_only,
  configuration.safety_coverage_mode,
  configuration.verified_users_only,
  configuration.allowed_markets,
  configuration.candidate_scan_limit,
  configuration.edge_scan_limit,
  configuration.minimum_cohort_size,
  configuration.maximum_cohort_size,
  configuration.internal_only
    and configuration.safety_coverage_mode = 'selected_test_cohort'
    and configuration.verified_users_only
    and (not configuration.invitations_enabled or (
      configuration.availability_enabled and configuration.shadow_detection_enabled))
    and (not configuration.system_session_creation_enabled
      or configuration.invitations_enabled)
    and (not configuration.odo_start_enabled
      or configuration.system_session_creation_enabled)
    and (not configuration.odo_start_enabled
      or configuration.automatic_ending_enabled)
    and (not configuration.music_enabled or configuration.odo_start_enabled)
    and (not configuration.automatic_ending_enabled
      or configuration.system_session_creation_enabled)
    as rollout_invariant_healthy
from public.live_odo_always_on_configuration configuration
where configuration.id = true;

-- 3. Narrow RPC execution boundaries.
with expected(name, signature, authenticated_execute, service_execute) as (values
  ('availability read', 'public.rpc_get_live_quick_connect_availability_v1()', true, false),
  ('availability write', 'public.rpc_set_live_quick_connect_availability_v1(integer,text)', true, false),
  ('active experience classifier', 'public.live_odo_always_on_has_active_experience_v1(uuid,uuid)', false, false),
  ('opportunity response', 'public.rpc_respond_live_quick_connect_opportunity_v1(uuid,text,bigint)', true, false),
  ('detect opportunity', 'public.rpc_service_detect_live_quick_connect_opportunity_v1(text,uuid)', false, true),
  ('maintain opportunities', 'public.rpc_service_maintain_live_quick_connect_opportunities_v1()', false, true),
  ('prepare system session', 'public.rpc_service_prepare_live_quick_connect_opportunity_session_v1(uuid,uuid)', false, true),
  ('finalize system session', 'public.rpc_service_finalize_live_quick_connect_opportunity_session_v1(uuid,uuid,boolean,text)', false, true),
  ('maintain system sessions', 'public.rpc_service_maintain_live_odo_always_on_sessions_v1()', false, true),
  ('reconcile system show', 'public.rpc_service_reconcile_live_odo_show_v1(uuid,uuid,uuid)', false, true),
  ('system music playback', 'public.rpc_service_get_live_music_playback_v1(uuid,uuid)', false, true),
  ('get provider cleanup', 'public.rpc_service_get_live_odo_always_on_cleanup_work_v1(integer)', false, true),
  ('complete provider cleanup', 'public.rpc_service_complete_live_odo_always_on_cleanup_v1(uuid,boolean,text)', false, true),
  ('admin configuration', 'public.rpc_admin_update_live_odo_always_on_v1(jsonb)', true, true),
  ('admin access', 'public.rpc_admin_set_live_odo_always_on_access_v1(uuid,boolean,text,timestamptz)', true, true),
  ('Studio-safe snapshot', 'public.rpc_get_live_odo_system_program_snapshot_v1(uuid)', true, true)
), resolved as (
  select expected.*, to_regprocedure(expected.signature) procedure_oid from expected
)
select name, procedure_oid is not null installed,
  case when procedure_oid is null then false else
    has_function_privilege('authenticated', procedure_oid, 'EXECUTE') = authenticated_execute
  end authenticated_boundary_healthy,
  case when procedure_oid is null then false else
    has_function_privilege('service_role', procedure_oid, 'EXECUTE') = service_execute
  end service_boundary_healthy
from resolved order by name;

-- 4. Private storage and direct-write boundary.
with tables(name) as (values
  ('live_odo_always_on_configuration'), ('live_odo_always_on_access'),
  ('live_quick_connect_availability'), ('live_quick_connect_opportunities'),
  ('live_quick_connect_opportunity_members'),
  ('live_quick_connect_opportunity_reservations'),
  ('live_quick_connect_opportunity_events'), ('live_odo_always_on_sessions')
)
select tables.name,
  coalesce(metadata.relrowsecurity, false) rls_enabled,
  not has_table_privilege('authenticated', format('public.%I', tables.name), 'SELECT')
    and not has_table_privilege('authenticated', format('public.%I', tables.name), 'INSERT')
    and not has_table_privilege('authenticated', format('public.%I', tables.name), 'UPDATE')
    and not has_table_privilege('authenticated', format('public.%I', tables.name), 'DELETE')
    as authenticated_direct_access_denied
from tables
left join pg_class metadata on metadata.oid = to_regclass(format('public.%I', tables.name))
order by tables.name;

-- 5. Operational state and ownership invariants.
select
  count(*) filter (where availability.status in ('available','reserved')
    and availability.expires_at <= now()) stale_availability,
  count(*) filter (where availability.status = 'reserved'
    and availability.reserved_opportunity_id is null) orphaned_availability_reservations,
  count(*) filter (where availability.status <> 'reserved'
    and availability.reserved_opportunity_id is not null) leaked_availability_reservations
from public.live_quick_connect_availability availability;

select
  count(*) filter (where opportunity.lease_owner is not null
    and opportunity.lease_expires_at <= now()) stale_opportunity_leases,
  count(*) filter (where opportunity.live_session_id is not null
    and not exists (select 1 from public.live_odo_always_on_sessions always_on
      where always_on.session_id = opportunity.live_session_id
        and always_on.opportunity_id = opportunity.id)) orphaned_opportunity_sessions,
  count(*) filter (where opportunity.state = 'live'
    and not exists (select 1 from public.live_sessions session
      where session.id = opportunity.live_session_id and session.status = 'live')) invalid_live_opportunities
from public.live_quick_connect_opportunities opportunity;

select
  count(*) filter (where session.ownership_type = 'system' and not (
    session.created_by_user_id is null and session.created_by_profile_id is null
    and session.system_session_kind = 'odo_always_on_quick_connect'
    and session.format = 'quick_connect')) invalid_system_ownership,
  count(*) filter (where session.ownership_type = 'human' and (
    session.created_by_user_id is null or session.created_by_profile_id is null
    or session.system_session_kind is not null)) invalid_human_ownership
from public.live_sessions session;

select
  count(*) filter (where always_on.lease_owner is not null
    and always_on.lease_expires_at <= now()) stale_system_session_leases,
  count(*) filter (where always_on.lifecycle_state in ('ended','failed')
    and always_on.stream_resource_ended_at is null
    and (always_on.stream_cleanup_attempts >= 8
      or always_on.updated_at < now() - interval '10 minutes')) stale_stream_cleanup,
  count(*) filter (where always_on.lifecycle_state = 'live'
    and session.status <> 'live') system_lifecycle_mismatch
from public.live_odo_always_on_sessions always_on
join public.live_sessions session on session.id = always_on.session_id;

-- 6. Final release gate.
with migration_blockers as (
  select count(*)::bigint affected from (values
    ('20260909120000'), ('20260909121000'), ('20260909122000'),
    ('20260909123000'), ('20260909124000'), ('20260909125000'),
    ('20260910100000'), ('20260910101000')
  ) expected(version)
  where not exists (select 1 from supabase_migrations.schema_migrations migration
    where migration.version = expected.version)
), configuration_blockers as (
  select case when exists (
    select 1 from public.live_odo_always_on_configuration configuration
    where configuration.id = true and configuration.internal_only
      and configuration.safety_coverage_mode = 'selected_test_cohort'
      and configuration.verified_users_only
      and (not configuration.invitations_enabled or (
        configuration.availability_enabled and configuration.shadow_detection_enabled))
      and (not configuration.system_session_creation_enabled or configuration.invitations_enabled)
      and (not configuration.odo_start_enabled or configuration.system_session_creation_enabled)
      and (not configuration.odo_start_enabled or configuration.automatic_ending_enabled)
      and (not configuration.music_enabled or configuration.odo_start_enabled)
      and (not configuration.automatic_ending_enabled or configuration.system_session_creation_enabled)
  ) then 0::bigint else 1::bigint end affected
), boundary_blockers as (
  select count(*)::bigint affected from (values
    ('public.rpc_get_live_quick_connect_availability_v1()', true, false),
    ('public.rpc_set_live_quick_connect_availability_v1(integer,text)', true, false),
    ('public.live_odo_always_on_has_active_experience_v1(uuid,uuid)', false, false),
    ('public.rpc_respond_live_quick_connect_opportunity_v1(uuid,text,bigint)', true, false),
    ('public.rpc_service_detect_live_quick_connect_opportunity_v1(text,uuid)', false, true),
    ('public.rpc_service_maintain_live_quick_connect_opportunities_v1()', false, true),
    ('public.rpc_service_prepare_live_quick_connect_opportunity_session_v1(uuid,uuid)', false, true),
    ('public.rpc_service_finalize_live_quick_connect_opportunity_session_v1(uuid,uuid,boolean,text)', false, true),
    ('public.rpc_service_maintain_live_odo_always_on_sessions_v1()', false, true),
    ('public.rpc_service_reconcile_live_odo_show_v1(uuid,uuid,uuid)', false, true),
    ('public.rpc_service_get_live_music_playback_v1(uuid,uuid)', false, true),
    ('public.rpc_service_get_live_odo_always_on_cleanup_work_v1(integer)', false, true),
    ('public.rpc_service_complete_live_odo_always_on_cleanup_v1(uuid,boolean,text)', false, true),
    ('public.rpc_admin_update_live_odo_always_on_v1(jsonb)', true, true),
    ('public.rpc_admin_set_live_odo_always_on_access_v1(uuid,boolean,text,timestamptz)', true, true),
    ('public.rpc_get_live_odo_system_program_snapshot_v1(uuid)', true, true)
  ) expected(signature, authenticated_execute, service_execute)
  where to_regprocedure(expected.signature) is null
    or has_function_privilege(
      'authenticated', to_regprocedure(expected.signature), 'EXECUTE'
    ) <> expected.authenticated_execute
    or has_function_privilege(
      'service_role', to_regprocedure(expected.signature), 'EXECUTE'
    ) <> expected.service_execute
), storage_blockers as (
  select count(*)::bigint affected from (values
    ('live_odo_always_on_configuration'), ('live_odo_always_on_access'),
    ('live_quick_connect_availability'), ('live_quick_connect_opportunities'),
    ('live_quick_connect_opportunity_members'),
    ('live_quick_connect_opportunity_reservations'),
    ('live_quick_connect_opportunity_events'), ('live_odo_always_on_sessions')
  ) expected(name)
  left join pg_class metadata
    on metadata.oid = to_regclass(format('public.%I', expected.name))
  where metadata.oid is null or not metadata.relrowsecurity
    or has_table_privilege('authenticated', format('public.%I', expected.name), 'SELECT')
    or has_table_privilege('authenticated', format('public.%I', expected.name), 'INSERT')
    or has_table_privilege('authenticated', format('public.%I', expected.name), 'UPDATE')
    or has_table_privilege('authenticated', format('public.%I', expected.name), 'DELETE')
), ownership_blockers as (
  select count(*)::bigint affected from public.live_sessions session
  where (session.ownership_type = 'system' and not (
      session.created_by_user_id is null and session.created_by_profile_id is null
      and session.system_session_kind = 'odo_always_on_quick_connect'
      and session.format = 'quick_connect'))
    or (session.ownership_type = 'human' and (
      session.created_by_user_id is null or session.created_by_profile_id is null
      or session.system_session_kind is not null))
), state_blockers as (
  select (
    (select count(*) from public.live_quick_connect_availability availability
      where availability.status in ('available','reserved') and availability.expires_at <= now())
    + (select count(*) from public.live_quick_connect_opportunities opportunity
      where opportunity.lease_owner is not null and opportunity.lease_expires_at <= now())
    + (select count(*) from public.live_odo_always_on_sessions always_on
      where always_on.lease_owner is not null and always_on.lease_expires_at <= now())
  )::bigint affected
), cleanup_blockers as (
  select count(*)::bigint affected
  from public.live_odo_always_on_sessions always_on
  where always_on.lifecycle_state in ('ended','failed')
    and always_on.stream_resource_ended_at is null
    and (always_on.stream_cleanup_attempts >= 8
      or always_on.updated_at < now() - interval '10 minutes')
), active_experience_contract_blockers as (
  select case when exists (
    select 1
    from pg_proc procedure
    where procedure.oid = to_regprocedure(
      'public.live_odo_always_on_has_active_experience_v1(uuid,uuid)'
    )
      and lower(pg_get_functiondef(procedure.oid)) like '%participant.joined_at is not null%'
      and lower(pg_get_functiondef(procedure.oid)) like '%spark.consent_expires_at%'
      and lower(pg_get_functiondef(procedure.oid)) like '%spark.active_expires_at%'
  ) then 0::bigint else 1::bigint end affected
), scheduler_blockers as (
  select case when exists (
    select 1
    from cron.job job
    where job.jobname = 'live-maintenance'
      and job.active
      and job.schedule = '* * * * *'
      and lower(trim(job.command)) = 'select public.run_live_maintenance();'
  ) then 0::bigint else 1::bigint end affected
), authority_blockers as (
  select count(*)::bigint affected from public.live_odo_always_on_sessions always_on
  join public.live_sessions session on session.id = always_on.session_id
  left join public.live_odo_show_sessions show on show.session_id = session.id
  where always_on.lifecycle_state = 'live' and (
    session.status <> 'live' or show.control_source not in ('odo','mobile_host','studio_host','system')
  )
), private_content_blockers as (
  select count(*)::bigint affected from public.live_quick_connect_opportunity_events event
  where event.metadata ?| array[
    'prompt','transcript','message','memberIds','candidateIds','compatibilityGraph'
  ]
), totals as (
  select migration_blockers.affected migration_release_blockers,
    configuration_blockers.affected configuration_release_blockers,
    boundary_blockers.affected boundary_release_blockers,
    storage_blockers.affected storage_release_blockers,
    ownership_blockers.affected ownership_release_blockers,
    state_blockers.affected state_release_blockers,
    cleanup_blockers.affected cleanup_release_blockers,
    active_experience_contract_blockers.affected active_experience_contract_release_blockers,
    scheduler_blockers.affected scheduler_release_blockers,
    authority_blockers.affected action_authority_release_blockers,
    private_content_blockers.affected private_content_release_blockers
  from migration_blockers, configuration_blockers, boundary_blockers,
    storage_blockers, ownership_blockers, state_blockers, cleanup_blockers,
    active_experience_contract_blockers, scheduler_blockers, authority_blockers,
    private_content_blockers
)
select *,
  migration_release_blockers + configuration_release_blockers
    + boundary_release_blockers + storage_release_blockers
    + ownership_release_blockers + state_release_blockers
    + cleanup_release_blockers + active_experience_contract_release_blockers
    + scheduler_release_blockers + action_authority_release_blockers
    + private_content_release_blockers as release_blockers,
  migration_release_blockers + configuration_release_blockers
    + boundary_release_blockers + storage_release_blockers
    + ownership_release_blockers + state_release_blockers
    + cleanup_release_blockers + active_experience_contract_release_blockers
    + scheduler_release_blockers + action_authority_release_blockers
    + private_content_release_blockers = 0 as healthy
from totals;
