-- Adaptive Stage Engine 2.0 Milestone 1 follow-up.
-- Validate arbitrary source owners without invoking an auth.uid-bound helper.

begin;

create or replace function private.live_program_subject_is_studio_publisher_v1(
  p_session_id uuid,
  p_user_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = private, public, pg_catalog
set row_security = off
as $$
declare
  v_configuration public.live_odo_configuration;
  v_access public.live_studio_access;
  v_assignment_role text;
  v_delegated_host boolean := false;
  v_is_creator boolean := false;
begin
  if p_session_id is null or p_user_id is null then return false; end if;

  select * into v_configuration from public.live_odo_configuration where id = true;
  if not coalesce(v_configuration.betweener_studio_enabled, false)
    or not coalesce(v_configuration.studio_session_discovery_enabled, false)
    or not coalesce(v_configuration.studio_media_publishing_enabled, false) then
    return false;
  end if;

  v_assignment_role := public.live_studio_session_operator_role_v1(
    p_session_id, p_user_id
  );
  if v_assignment_role = 'producer' then return true; end if;

  v_delegated_host := public.live_session_has_active_delegated_host_v1(
    p_session_id, p_user_id
  );
  if v_delegated_host then return true; end if;

  select exists (
    select 1 from public.live_sessions session
    where session.id = p_session_id and session.created_by_user_id = p_user_id
  ) into v_is_creator;
  select * into v_access from public.live_studio_access access
  where access.user_id = p_user_id
    and access.allowed and access.can_publish
    and (access.expires_at is null or access.expires_at > timezone('utc', now()));

  return v_access.user_id is not null
    and (v_is_creator or public.is_admin_user(p_user_id));
end;
$$;

revoke all on function private.live_program_subject_is_studio_publisher_v1(uuid, uuid)
from public, anon, authenticated, service_role;

create or replace function private.live_program_assignment_error_v2(
  p_session_id uuid,
  p_scene text,
  p_target_canvas text,
  p_assignments jsonb,
  p_manifest_version text,
  p_expected_source_graph_version bigint default null
)
returns text
language plpgsql
security definer
set search_path = private, public, pg_catalog
set row_security = off
as $$
declare
  v_definition private.live_scene_manifest_v2;
  v_session public.live_sessions;
  v_configuration public.live_odo_configuration;
  v_source public.live_program_sources;
  v_graph_version bigint := 0;
  v_slot text;
  v_source_key text;
  v_rule jsonb;
  v_required text;
  v_human_count integer := 0;
  v_human_owners uuid[] := array[]::uuid[];
begin
  if p_manifest_version <> 'adaptive-stage-v2.0.0-m1' then
    return 'manifest_outdated';
  end if;
  select * into v_definition from private.live_scene_manifest_v2 definition
  where definition.manifest_version = p_manifest_version
    and definition.scene_id = p_scene;
  if v_definition.scene_id is null then return 'program_scene_unknown'; end if;
  if not (p_target_canvas = any(v_definition.supported_canvases)) then
    return 'program_canvas_unsupported';
  end if;
  if jsonb_typeof(p_assignments) <> 'object'
    or jsonb_array_length(jsonb_path_query_array(p_assignments, '$.*')) > 15
    or octet_length(p_assignments::text) > 3072 then
    return 'program_assignment_invalid';
  end if;

  select * into v_session from public.live_sessions session
  where session.id = p_session_id for share;
  if v_session.id is null then return 'live_session_not_found'; end if;
  select * into v_configuration from public.live_odo_configuration where id = true;
  select coalesce(update_row.version, 0) into v_graph_version
  from public.live_program_source_updates update_row
  where update_row.session_id = p_session_id for share;
  if p_expected_source_graph_version is not null
    and p_expected_source_graph_version <> v_graph_version then
    return 'source_graph_stale';
  end if;

  if exists (
    select 1 from jsonb_object_keys(p_assignments) assignment(slot_name)
    where not (v_definition.slot_rules ? assignment.slot_name)
  ) then return 'program_assignment_invalid'; end if;
  if exists (
    select 1 from jsonb_each_text(p_assignments) assignment
    group by assignment.value having count(*) > 1
  ) then return 'program_source_duplicated'; end if;
  foreach v_required in array v_definition.required_slots loop
    if not (p_assignments ? v_required) then return 'program_required_source_missing'; end if;
  end loop;

  for v_slot, v_source_key in select key, value from jsonb_each_text(p_assignments)
  loop
    if v_source_key !~ '^[a-z][a-z0-9_.:-]{2,119}$' then
      return 'program_assignment_invalid';
    end if;
    v_rule := v_definition.slot_rules -> v_slot;
    select * into v_source from public.live_program_sources source
    where source.session_id = p_session_id and source.source_key = v_source_key
    for share;
    if v_source.id is null then return 'program_source_not_found'; end if;
    if v_source.readiness not in ('ready','live') or v_source.health = 'lost' then
      return 'program_source_not_ready';
    end if;
    if not ((v_rule -> 'types') ? v_source.source_type) then
      return 'program_source_type_invalid';
    end if;
    if coalesce((v_rule ->> 'human')::boolean, false) then
      if v_source.owner_user_id is null or v_source.provider_user_id is null then
        return 'program_source_identity_missing';
      end if;
      if v_source.owner_user_id = any(v_human_owners) then
        return 'program_human_duplicated';
      end if;
      if not exists (
        select 1 from public.live_participants participant
        where participant.session_id = p_session_id
          and participant.user_id = v_source.owner_user_id
          and participant.state in ('backstage','on_stage')
      ) and not private.live_program_subject_is_studio_publisher_v1(
        p_session_id, v_source.owner_user_id
      ) then return 'program_human_not_admitted'; end if;
      v_human_owners := array_append(v_human_owners, v_source.owner_user_id);
      v_human_count := v_human_count + 1;
      if v_slot in ('guest_4','guest_5') and v_session.maximum_publishers < 6 then
        return 'program_capacity_exceeded';
      end if;
    end if;
    if v_source.source_type = 'active_pair' and (
      v_source.source_key <> 'server.pair' or not exists (
        select 1 from public.live_quick_connect_pairings pairing
        where pairing.session_id = p_session_id
          and pairing.state in ('active','reconnect_grace')
      )
    ) then return 'program_active_pair_not_authoritative'; end if;
    if v_source.source_type = 'quick_connect_pool'
      and v_source.source_key <> 'server.pool' then
      return 'program_pool_not_authoritative';
    end if;
  end loop;

  if v_human_count > least(v_session.maximum_publishers, v_definition.maximum_humans, 6) then
    return 'program_capacity_exceeded';
  end if;
  if v_session.format = 'quick_connect' and v_human_count > 2 then
    return 'program_quick_connect_capacity_exceeded';
  end if;
  if v_human_count > 4 and (
    v_session.maximum_publishers <> 6
    or not coalesce(v_configuration.large_panel_enabled, false)
  ) then return 'program_large_panel_unavailable'; end if;
  return null;
end;
$$;

revoke all on function private.live_program_assignment_error_v2(
  uuid, text, text, jsonb, text, bigint
) from public, anon, authenticated, service_role;

commit;
