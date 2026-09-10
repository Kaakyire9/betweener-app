-- Betweener Live Phase 10G production health check.
-- Strictly read-only: no Studio command, source mutation, lease or media token
-- is created by this file.

-- 1. Additive migration ledger.
with expected(version, purpose) as (values
  ('20260910120000', 'Program and Studio foundation'),
  ('20260910121000', 'Studio access and operational snapshot'),
  ('20260910122000', 'Fenced Program control and sources'),
  ('20260910123000', 'Browser media admission and recovery'),
  ('20260910124000', 'Audience-safe Program snapshot'),
  ('20260910125000', 'Studio maintenance clock'),
  ('20260910130000', 'Phase 10F maintenance-chain repair')
)
select expected.version, expected.purpose,
  exists (select 1 from supabase_migrations.schema_migrations migration
    where migration.version = expected.version) installed
from expected order by expected.version;

-- 2. Closed-beta rollout. Screen audio may remain off until its separate
-- physical/browser validation is signed off.
select
  configuration.betweener_studio_enabled,
  configuration.betweener_studio_control_enabled,
  configuration.studio_session_discovery_enabled,
  configuration.studio_media_publishing_enabled,
  configuration.screen_share_enabled,
  configuration.studio_screen_audio_enabled,
  configuration.studio_external_audio_enabled,
  configuration.studio_closed_beta,
  configuration.studio_controller_lease_seconds,
  configuration.studio_controller_grace_seconds,
  configuration.betweener_studio_enabled
    and configuration.betweener_studio_control_enabled
    and configuration.studio_session_discovery_enabled
    and configuration.studio_media_publishing_enabled
    and configuration.screen_share_enabled
    and configuration.studio_external_audio_enabled
    and configuration.studio_closed_beta
    and configuration.studio_controller_lease_seconds between 15 and 120
    and configuration.studio_controller_grace_seconds between 5 and 60
    as phase10g_rollout_healthy
from public.live_odo_configuration configuration where configuration.id = true;

-- 3. Narrow execution boundaries.
with expected(name, signature, authenticated_execute, service_execute) as (values
  ('admin access', 'public.rpc_admin_set_live_studio_access_v1(uuid,boolean,jsonb,text,timestamptz)', true, true),
  ('admin config', 'public.rpc_admin_update_live_studio_configuration_v1(jsonb)', true, true),
  ('session list', 'public.rpc_list_live_studio_control_sessions_v1(integer)', true, true),
  ('studio snapshot', 'public.rpc_get_live_studio_snapshot_v1(uuid)', true, true),
  ('take control', 'public.rpc_studio_take_live_program_control_v1(uuid,uuid,bigint,bigint,uuid)', true, true),
  ('renew control', 'public.rpc_studio_renew_live_program_control_v1(uuid,uuid,bigint)', true, true),
  ('take program', 'public.rpc_studio_take_live_program_v1(uuid,uuid,bigint,bigint,uuid,text,text,jsonb,text)', true, true),
  ('upsert source', 'public.rpc_studio_upsert_live_program_source_v1(uuid,text,text,text,text,boolean,boolean,text,text,boolean,text)', true, true),
  ('end source', 'public.rpc_studio_end_live_program_source_v1(uuid,text,text)', true, true),
  ('resume Odo', 'public.rpc_studio_resume_live_odo_v1(uuid,uuid,bigint,uuid)', true, true),
  ('media admission', 'public.rpc_get_live_studio_media_admission_v1(uuid,uuid,text)', true, true),
  ('audience program', 'public.rpc_get_live_program_snapshot_v2(uuid)', true, true),
  ('maintenance', 'public.rpc_service_maintain_live_studio_program_v1(integer)', false, true)
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

-- 4. Storage, direct-write and Realtime projection boundaries.
with tables(name) as (values
  ('live_studio_access'), ('live_program_sources'),
  ('live_program_command_events'), ('live_program_source_updates')
)
select tables.name, coalesce(metadata.relrowsecurity, false) rls_enabled,
  not has_table_privilege('authenticated', format('public.%I', tables.name), 'INSERT')
    and not has_table_privilege('authenticated', format('public.%I', tables.name), 'UPDATE')
    and not has_table_privilege('authenticated', format('public.%I', tables.name), 'DELETE')
    as authenticated_direct_writes_denied
from tables
left join pg_class metadata on metadata.oid = to_regclass(format('public.%I', tables.name))
order by tables.name;

select
  exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime'
    and schemaname = 'public' and tablename = 'live_program_source_updates')
    as source_updates_realtime_healthy,
  exists (select 1 from cron.job where jobname = 'live-maintenance' and active)
    as maintenance_clock_healthy;

-- 5. Operational state. These rows should clear through the maintenance clock.
select
  (select count(*)::integer from public.live_odo_show_sessions show_session
    where show_session.control_source = 'studio_host'
      and show_session.control_lease_expires_at
        <= now() - make_interval(secs => configuration.studio_controller_grace_seconds))
    as stale_studio_controllers,
  (select count(*)::integer from public.live_odo_show_sessions show_session
    where show_session.control_source = 'studio_host'
      and show_session.control_lease_expires_at > now())
    as active_studio_controllers,
  (select count(*)::integer from public.live_program_sources source
    where source.source_key like 'studio:%'
      and source.readiness in ('preparing','ready','live')
      and source.last_seen_at < now() - interval '45 seconds')
    as stale_studio_sources,
  (select count(*)::integer from public.live_program_sources source
    where source.health = 'lost'
      and exists (select 1 from public.live_odo_show_sessions assigned
        where assigned.session_id = source.session_id
          and exists (select 1 from jsonb_each_text(assigned.source_assignments) item
            where item.value = source.source_key)))
    as lost_sources_still_on_program
from public.live_odo_configuration configuration where configuration.id = true;

-- 6. Final Phase 10G gate. One fully capable, non-expired internal producer is
-- required for the combined 10F + 10G device test.
with migration_blockers as (
  select count(*)::bigint affected from (values
    ('20260910120000'), ('20260910121000'), ('20260910122000'),
    ('20260910123000'), ('20260910124000'), ('20260910125000'),
    ('20260910130000')
  ) expected(version)
  where not exists (select 1 from supabase_migrations.schema_migrations migration
    where migration.version = expected.version)
), configuration_blockers as (
  select case when exists (
    select 1 from public.live_odo_configuration configuration where configuration.id = true
      and configuration.betweener_studio_enabled
      and configuration.betweener_studio_control_enabled
      and configuration.studio_session_discovery_enabled
      and configuration.studio_media_publishing_enabled
      and configuration.screen_share_enabled
      and configuration.studio_external_audio_enabled
      and configuration.studio_closed_beta
  ) then 0::bigint else 1::bigint end affected
), allowlist_blockers as (
  select case when exists (
    select 1 from public.live_studio_access access
    where access.allowed and access.can_view and access.can_control
      and access.can_publish and access.can_screen_share
      and access.can_use_external_audio
      and (access.expires_at is null or access.expires_at > now())
  ) then 0::bigint else 1::bigint end affected
), boundary_blockers as (
  select count(*)::bigint affected from (values
    ('public.rpc_studio_take_live_program_control_v1(uuid,uuid,bigint,bigint,uuid)', true, true),
    ('public.rpc_studio_renew_live_program_control_v1(uuid,uuid,bigint)', true, true),
    ('public.rpc_studio_take_live_program_v1(uuid,uuid,bigint,bigint,uuid,text,text,jsonb,text)', true, true),
    ('public.rpc_studio_upsert_live_program_source_v1(uuid,text,text,text,text,boolean,boolean,text,text,boolean,text)', true, true),
    ('public.rpc_studio_end_live_program_source_v1(uuid,text,text)', true, true),
    ('public.rpc_studio_resume_live_odo_v1(uuid,uuid,bigint,uuid)', true, true),
    ('public.rpc_get_live_studio_media_admission_v1(uuid,uuid,text)', true, true),
    ('public.rpc_get_live_program_snapshot_v2(uuid)', true, true),
    ('public.rpc_service_maintain_live_studio_program_v1(integer)', false, true)
  ) expected(signature, authenticated_execute, service_execute)
  where to_regprocedure(expected.signature) is null
    or has_function_privilege('authenticated', to_regprocedure(expected.signature), 'EXECUTE')
      <> expected.authenticated_execute
    or has_function_privilege('service_role', to_regprocedure(expected.signature), 'EXECUTE')
      <> expected.service_execute
), storage_blockers as (
  select count(*)::bigint affected from (values
    ('live_studio_access'), ('live_program_sources'),
    ('live_program_command_events'), ('live_program_source_updates')
  ) expected(name)
  where not coalesce((select relrowsecurity from pg_class
      where oid = to_regclass(format('public.%I', expected.name))), false)
    or has_table_privilege('authenticated', format('public.%I', expected.name), 'INSERT')
    or has_table_privilege('authenticated', format('public.%I', expected.name), 'UPDATE')
    or has_table_privilege('authenticated', format('public.%I', expected.name), 'DELETE')
), protocol_blockers as (
  select case when
    exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime'
      and schemaname = 'public' and tablename = 'live_program_source_updates')
    and exists (select 1 from cron.job where jobname = 'live-maintenance' and active)
    then 0::bigint else 1::bigint end affected
), stale_controller_blockers as (
  select count(*)::bigint affected
  from public.live_odo_show_sessions show_session
  cross join public.live_odo_configuration configuration
  where configuration.id = true and show_session.control_source = 'studio_host'
    and show_session.control_lease_expires_at
      <= now() - make_interval(secs => configuration.studio_controller_grace_seconds)
), stale_source_blockers as (
  select count(*)::bigint affected from public.live_program_sources source
  where source.source_key like 'studio:%'
    and source.readiness in ('preparing','ready','live')
    and source.last_seen_at < now() - interval '45 seconds'
), unsafe_program_blockers as (
  select count(*)::bigint affected from public.live_odo_show_sessions show_session
  where exists (
    select 1 from jsonb_each_text(show_session.source_assignments) assignment
    left join public.live_program_sources source
      on source.session_id = show_session.session_id
      and source.source_key = assignment.value
    where source.id is null or source.readiness in ('ended','failed') or source.health = 'lost'
  )
), totals as (
  select migration_blockers.affected migration_release_blockers,
    configuration_blockers.affected configuration_release_blockers,
    allowlist_blockers.affected allowlist_release_blockers,
    boundary_blockers.affected boundary_release_blockers,
    storage_blockers.affected storage_release_blockers,
    protocol_blockers.affected protocol_release_blockers,
    stale_controller_blockers.affected stale_controller_release_blockers,
    stale_source_blockers.affected stale_source_release_blockers,
    unsafe_program_blockers.affected unsafe_program_release_blockers
  from migration_blockers, configuration_blockers, allowlist_blockers,
    boundary_blockers, storage_blockers, protocol_blockers,
    stale_controller_blockers, stale_source_blockers, unsafe_program_blockers
)
select *,
  migration_release_blockers + configuration_release_blockers
    + allowlist_release_blockers + boundary_release_blockers
    + storage_release_blockers + protocol_release_blockers
    + stale_controller_release_blockers + stale_source_release_blockers
    + unsafe_program_release_blockers as release_blockers,
  migration_release_blockers + configuration_release_blockers
    + allowlist_release_blockers + boundary_release_blockers
    + storage_release_blockers + protocol_release_blockers
    + stale_controller_release_blockers + stale_source_release_blockers
    + unsafe_program_release_blockers = 0 as healthy
from totals;
