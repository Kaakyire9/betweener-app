-- Betweener Live Phase 10E Show Director production health check.
-- Strictly read-only. It never changes a scene, controls music, acquires a
-- lease, returns a signed playback URL, or exposes private participant data.

-- 1. Additive migration ledger.
with expected(version, purpose) as (values
  ('20260908213000', 'Show Director, approved music and Studio protocol'),
  ('20260908214000', 'Deterministic Show Director orchestrator'),
  ('20260908215000', 'Show Director runtime hardening'),
  ('20260908216000', 'Music policy and Host override hardening'),
  ('20260908217000', 'Phase 10E configuration authority'),
  ('20260908218000', 'Expiring programme-control recovery')
)
select expected.version, expected.purpose,
  exists (select 1 from supabase_migrations.schema_migrations migration
    where migration.version = expected.version) as installed
from expected order by expected.version;

-- 2. Conservative configuration. A disabled rollout is healthy.
select configuration.odo_enabled,
  configuration.show_director_enabled,
  configuration.show_director_internal_only,
  configuration.music_enabled,
  configuration.music_auto_enabled,
  configuration.music_ducking_enabled,
  configuration.show_intermission_enabled,
  configuration.show_energy_mode_enabled,
  configuration.odo_voice_enabled,
  configuration.betweener_studio_enabled,
  configuration.betweener_studio_control_enabled,
  configuration.screen_share_enabled,
  not configuration.odo_voice_enabled
    and not configuration.screen_share_enabled
    and configuration.show_director_internal_only
    and (not configuration.show_director_enabled or configuration.odo_enabled)
    and (not configuration.music_auto_enabled
      or (configuration.music_enabled and configuration.show_director_enabled))
    and (not configuration.betweener_studio_control_enabled
      or configuration.betweener_studio_enabled) as phase10e_invariant_healthy
from public.live_odo_configuration configuration where configuration.id = true;

-- 3. Narrow caller boundaries.
with expected(name, signature, authenticated_execute, service_execute) as (values
  ('Host state','public.rpc_get_live_odo_show_director_v1(uuid)',true,true),
  ('participant programme','public.rpc_get_live_program_snapshot_v1(uuid)',true,true),
  ('Host enable','public.rpc_enable_live_odo_show_director_v1(uuid)',true,true),
  ('Host takeover','public.rpc_take_over_live_odo_show_v1(uuid)',true,true),
  ('Host resume','public.rpc_resume_live_odo_show_v1(uuid)',true,true),
  ('Host scene','public.rpc_host_set_live_show_scene_v1(uuid,text,bigint)',true,true),
  ('programme control','public.rpc_acquire_live_program_control_v1(uuid,text,bigint)',true,true),
  ('Host music','public.rpc_host_control_live_music_v1(uuid,text,uuid,uuid,numeric,text,uuid)',true,true),
  ('service reconcile','public.rpc_service_reconcile_live_odo_show_v1(uuid,uuid,uuid)',false,true),
  ('service playback','public.rpc_service_get_live_music_playback_v1(uuid,uuid)',false,true),
  ('admin configuration','public.rpc_admin_update_live_odo_show_v1(jsonb)',true,true),
  ('admin catalogue','public.rpc_admin_upsert_live_music_track_v1(uuid,text,text,text,text,integer,text,timestamptz,boolean)',true,true)
), resolved as (
  select expected.*, to_regprocedure(expected.signature) procedure_oid from expected
)
select name, procedure_oid is not null as installed,
  case when procedure_oid is null then false else
    has_function_privilege('authenticated',procedure_oid,'EXECUTE')
      = authenticated_execute end as authenticated_boundary_healthy,
  case when procedure_oid is null then false else
    has_function_privilege('service_role',procedure_oid,'EXECUTE')
      = service_execute end as service_boundary_healthy
from resolved order by name;

-- 4. Private storage and content-free Realtime contract.
with expected(name, authenticated_select) as (values
  ('live_odo_show_sessions',false),('live_odo_show_actions',false),
  ('live_music_tracks',false),('live_music_playlists',false),
  ('live_music_playlist_tracks',false),('live_music_session_state',false),
  ('live_music_events',false),('live_odo_show_updates',true)
)
select expected.name,
  coalesce(metadata.relrowsecurity,false) as rls_enabled,
  has_table_privilege('authenticated',format('public.%I',expected.name),'SELECT')
    = expected.authenticated_select as authenticated_read_boundary_healthy,
  not has_table_privilege('authenticated',format('public.%I',expected.name),'INSERT')
    and not has_table_privilege('authenticated',format('public.%I',expected.name),'UPDATE')
    and not has_table_privilege('authenticated',format('public.%I',expected.name),'DELETE')
    as authenticated_direct_writes_denied,
  not has_table_privilege('service_role',format('public.%I',expected.name),'INSERT')
    and not has_table_privilege('service_role',format('public.%I',expected.name),'UPDATE')
    and not has_table_privilege('service_role',format('public.%I',expected.name),'DELETE')
    as service_direct_writes_denied
from expected left join pg_class metadata
  on metadata.oid = to_regclass(format('public.%I',expected.name))
order by expected.name;

select exists (select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public'
      and tablename = 'live_odo_show_updates') as realtime_invalidation_healthy,
  exists (select 1 from storage.buckets
    where id = 'live-program-music' and not public) as private_music_bucket_healthy,
  exists (select 1 from pg_index where indexrelid =
    to_regclass('public.live_odo_show_actions_session_idx')
    and indisvalid and indisready) as show_action_index_healthy,
  exists (select 1 from pg_index where indexrelid =
    to_regclass('public.live_music_events_session_idx')
    and indisvalid and indisready) as music_event_index_healthy;

-- 5. Content-free operational telemetry.
select show_session.show_state, show_session.current_scene,
  show_session.energy_mode, show_session.control_source, show_session.enabled,
  count(*)::integer as sessions, max(show_session.updated_at) as last_updated_at,
  max(show_session.next_wake_at) as next_wake_at
from public.live_odo_show_sessions show_session
group by show_session.show_state, show_session.current_scene,
  show_session.energy_mode, show_session.control_source, show_session.enabled
order by sessions desc, show_session.show_state;

select music.status, music.control_source, count(*)::integer as sessions,
  max(music.updated_at) as last_updated_at
from public.live_music_session_state music
group by music.status, music.control_source order by sessions desc, music.status;

-- 6. Final Phase 10E gate. Every blocker must be zero.
with migration_blockers as (
  select count(*)::bigint affected from (values
    ('20260908213000'),('20260908214000'),('20260908215000'),
    ('20260908216000'),('20260908217000'),('20260908218000')
  ) expected(version) where not exists (
    select 1 from supabase_migrations.schema_migrations migration
    where migration.version = expected.version
  )
), configuration_blockers as (
  select case when exists (
    select 1 from public.live_odo_configuration configuration
    where configuration.id = true
      and not configuration.odo_voice_enabled
      and not configuration.screen_share_enabled
      and configuration.show_director_internal_only
      and (not configuration.show_director_enabled or configuration.odo_enabled)
      and (not configuration.music_auto_enabled
        or (configuration.music_enabled and configuration.show_director_enabled))
      and (not configuration.betweener_studio_control_enabled
        or configuration.betweener_studio_enabled)
  ) then 0::bigint else 1::bigint end affected
), boundary_blockers as (
  select count(*)::bigint affected from (values
    ('public.rpc_get_live_odo_show_director_v1(uuid)',true,true),
    ('public.rpc_get_live_program_snapshot_v1(uuid)',true,true),
    ('public.rpc_enable_live_odo_show_director_v1(uuid)',true,true),
    ('public.rpc_take_over_live_odo_show_v1(uuid)',true,true),
    ('public.rpc_resume_live_odo_show_v1(uuid)',true,true),
    ('public.rpc_host_set_live_show_scene_v1(uuid,text,bigint)',true,true),
    ('public.rpc_acquire_live_program_control_v1(uuid,text,bigint)',true,true),
    ('public.rpc_host_control_live_music_v1(uuid,text,uuid,uuid,numeric,text,uuid)',true,true),
    ('public.rpc_service_reconcile_live_odo_show_v1(uuid,uuid,uuid)',false,true),
    ('public.rpc_service_get_live_music_playback_v1(uuid,uuid)',false,true),
    ('public.rpc_admin_update_live_odo_show_v1(jsonb)',true,true),
    ('public.rpc_admin_upsert_live_music_track_v1(uuid,text,text,text,text,integer,text,timestamptz,boolean)',true,true)
  ) expected(signature,authenticated_execute,service_execute)
  where to_regprocedure(expected.signature) is null
    or has_function_privilege('authenticated',to_regprocedure(expected.signature),'EXECUTE')
      <> expected.authenticated_execute
    or has_function_privilege('service_role',to_regprocedure(expected.signature),'EXECUTE')
      <> expected.service_execute
), storage_blockers as (
  select count(*)::bigint affected from (values
    ('live_odo_show_sessions',false),('live_odo_show_actions',false),
    ('live_music_tracks',false),('live_music_playlists',false),
    ('live_music_playlist_tracks',false),('live_music_session_state',false),
    ('live_music_events',false),('live_odo_show_updates',true)
  ) expected(name,authenticated_select)
  where not exists (select 1 from pg_class metadata
      where metadata.oid = to_regclass(format('public.%I',expected.name))
        and metadata.relrowsecurity)
    or has_table_privilege('authenticated',format('public.%I',expected.name),'SELECT')
      <> expected.authenticated_select
    or has_table_privilege('authenticated',format('public.%I',expected.name),'INSERT')
    or has_table_privilege('authenticated',format('public.%I',expected.name),'UPDATE')
    or has_table_privilege('authenticated',format('public.%I',expected.name),'DELETE')
    or has_table_privilege('service_role',format('public.%I',expected.name),'INSERT')
    or has_table_privilege('service_role',format('public.%I',expected.name),'UPDATE')
    or has_table_privilege('service_role',format('public.%I',expected.name),'DELETE')
), protocol_blockers as (
  select case when exists (select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public'
        and tablename = 'live_odo_show_updates')
    and exists (select 1 from storage.buckets
      where id = 'live-program-music' and not public)
    and position('rpc_service_reconcile_live_odo_show_v1'
      in pg_get_functiondef('public.run_live_maintenance()'::regprocedure)) > 0
    then 0::bigint else 1::bigint end affected
), catalogue_blockers as (
  select count(*)::bigint affected from public.live_music_tracks track
  where track.enabled and (
    track.license_status <> 'approved'
    or (track.license_expires_at is not null and track.license_expires_at <= now())
    or not (track.licensed_regions @> array['*']::text[])
    or track.storage_path ~* '^(https?|file):'
  )
), allowlist_blockers as (
  select count(*)::bigint affected from public.live_odo_show_sessions show_session
  cross join public.live_odo_configuration configuration
  where configuration.id = true and configuration.show_director_internal_only
    and show_session.enabled and not exists (
      select 1 from public.live_odo_guarded_autopilot_host_allowlist access
      where access.user_id = show_session.enabled_by_user_id
    )
), state_blockers as (
  select count(*)::bigint affected from public.live_odo_show_sessions show_session
  join public.live_sessions session_row on session_row.id = show_session.session_id
  where (show_session.enabled and session_row.status <> 'live')
    or (show_session.paused_by_host and show_session.show_state <> 'paused_by_host')
    or (show_session.control_source = 'odo' and show_session.control_user_id is not null)
    or (show_session.control_source in ('mobile_host','studio_host')
      and show_session.control_user_id is null)
), stale_wake_blockers as (
  select count(*)::bigint affected from public.live_odo_show_sessions show_session
  where show_session.enabled
    and show_session.show_state not in ('paused_by_host','paused_by_policy')
    and show_session.next_wake_at < now() - interval '2 minutes'
), stale_lease_blockers as (
  select count(*)::bigint affected from public.live_odo_show_sessions show_session
  where show_session.control_lease_expires_at is not null
    and show_session.control_lease_expires_at <= now()
    and show_session.control_source <> 'odo'
), authority_blockers as (
  select count(*)::bigint affected from public.live_odo_show_actions action
  where action.metadata ?| array[
    'participantId','participantIds','userId','userIds','profile','profiles',
    'privateDecision','conversationSpark','transcript','audio','video','url'
  ]
), private_content_blockers as (
  select count(*)::bigint affected from public.live_director_events event
  where event.event_type like 'SHOW_%' and event.payload ?| array[
    'participantId','participantIds','userId','userIds','profile','profiles',
    'privateDecision','conversationSpark','transcript','audio','video','url'
  ]
), orphaned_state_blockers as (
  select count(*)::bigint affected from public.live_odo_show_sessions show_session
  left join public.live_odo_session_state odo_state
    on odo_state.session_id = show_session.session_id
  left join public.live_music_session_state music
    on music.session_id = show_session.session_id
  where show_session.enabled
    and (odo_state.session_id is null or music.session_id is null)
), totals as (
  select migration_blockers.affected migration_release_blockers,
    configuration_blockers.affected configuration_release_blockers,
    boundary_blockers.affected boundary_release_blockers,
    storage_blockers.affected storage_release_blockers,
    protocol_blockers.affected protocol_release_blockers,
    catalogue_blockers.affected catalogue_release_blockers,
    allowlist_blockers.affected allowlist_release_blockers,
    state_blockers.affected state_release_blockers,
    stale_wake_blockers.affected stale_wake_release_blockers,
    stale_lease_blockers.affected stale_control_lease_release_blockers,
    authority_blockers.affected action_authority_release_blockers,
    private_content_blockers.affected private_content_release_blockers,
    orphaned_state_blockers.affected orphaned_state_release_blockers
  from migration_blockers, configuration_blockers, boundary_blockers,
    storage_blockers, protocol_blockers, catalogue_blockers,
    allowlist_blockers, state_blockers, stale_wake_blockers,
    stale_lease_blockers, authority_blockers, private_content_blockers,
    orphaned_state_blockers
)
select *,
  migration_release_blockers + configuration_release_blockers
    + boundary_release_blockers + storage_release_blockers
    + protocol_release_blockers + catalogue_release_blockers
    + allowlist_release_blockers + state_release_blockers
    + stale_wake_release_blockers + stale_control_lease_release_blockers
    + action_authority_release_blockers + private_content_release_blockers
    + orphaned_state_release_blockers as release_blockers,
  migration_release_blockers + configuration_release_blockers
    + boundary_release_blockers + storage_release_blockers
    + protocol_release_blockers + catalogue_release_blockers
    + allowlist_release_blockers + state_release_blockers
    + stale_wake_release_blockers + stale_control_lease_release_blockers
    + action_authority_release_blockers + private_content_release_blockers
    + orphaned_state_release_blockers = 0 as healthy
from totals;
