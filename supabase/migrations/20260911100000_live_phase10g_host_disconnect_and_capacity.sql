-- Betweener Live Phase 10G hardening: host-authoritative Studio disconnect
-- and an explicit five-input Program ceiling (four public people plus one
-- Studio screen source). Studio transports never consume public stage seats.

begin;

comment on column public.live_sessions.maximum_publishers is
  'Public human stage publishers only. Betweener Live caps this at four; Studio transport sources are separate.';

create or replace function public.live_program_assignment_error_v1(
  p_session_id uuid,
  p_scene text,
  p_assignments jsonb
)
returns text
language plpgsql
stable
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  v_slot text;
  v_source_key text;
  v_required text[] := array[]::text[];
begin
  if p_scene not in (
    'host_focus','host_plus_pool','pool_focus','pair_forming',
    'quick_connect_active','audience_pulse','conversation_topic','odo_stage',
    'music_intermission','branded_intermission','session_closing',
    'screen_full','screen_plus_host','screen_plus_pair','screen_plus_panel',
    'screen_discussion','screen_plus_pool','screen_plus_audience_pulse',
    'screen_plus_odo','dj_plus_pool'
  ) or jsonb_typeof(p_assignments) <> 'object'
    or jsonb_array_length(jsonb_path_query_array(p_assignments, '$.*')) > 13
    or octet_length(p_assignments::text) > 2048 then
    return 'program_assignment_invalid';
  end if;

  -- At most five visual inputs may reach Program: one Studio screen and the
  -- existing four-person public stage. Host plus guest_1..guest_3 remains the
  -- complete human panel; a screen never becomes guest_4.
  if (select count(*) from jsonb_object_keys(p_assignments) assignment(slot)
      where slot in (
        'primary','host','guest_1','guest_2','guest_3',
        'pair','pool','pulse','odo','pip'
      )) > 5
    or (select count(*) from jsonb_object_keys(p_assignments) assignment(slot)
      where slot in ('host','guest_1','guest_2','guest_3')) > 4 then
    return 'program_visual_capacity_exceeded';
  end if;

  for v_slot, v_source_key in select key, value from jsonb_each_text(p_assignments)
  loop
    if v_slot not in (
      'primary','host','guest_1','guest_2','guest_3','pair','pool','pulse',
      'odo','pip','audio_host','audio_screen','audio_atmosphere'
    ) or v_source_key !~ '^[a-z][a-z0-9_.:-]{2,119}$' then
      return 'program_assignment_invalid';
    end if;
    if not exists (
      select 1 from public.live_program_sources source
      where source.session_id = p_session_id
        and source.source_key = v_source_key
        and source.readiness in ('ready','live')
        and source.health <> 'lost'
    ) then
      return 'program_source_not_ready';
    end if;
  end loop;

  v_required := case p_scene
    when 'screen_full' then array['primary']
    when 'screen_plus_host' then array['primary','host']
    when 'screen_plus_pair' then array['primary','pair']
    when 'screen_plus_panel' then array['primary','host']
    when 'screen_discussion' then array['primary','host']
    when 'screen_plus_pool' then array['primary','pool']
    when 'screen_plus_audience_pulse' then array['primary','pulse']
    when 'screen_plus_odo' then array['primary','odo']
    when 'dj_plus_pool' then array['audio_atmosphere','pool']
    else array[]::text[] end;
  if exists (
    select 1 from unnest(v_required) required(slot)
    where not (p_assignments ? required.slot)
  ) then
    return 'program_required_source_missing';
  end if;
  if p_scene like 'screen_%' and not exists (
    select 1 from public.live_program_sources source
    where source.session_id = p_session_id
      and source.source_key = p_assignments ->> 'primary'
      and source.source_type = 'screen_share'
      and source.has_video
  ) then
    return 'program_screen_source_required';
  end if;
  if p_scene = 'dj_plus_pool' and not exists (
    select 1 from public.live_program_sources source
    where source.session_id = p_session_id
      and source.source_key = p_assignments ->> 'audio_atmosphere'
      and source.source_type = 'dj_audio' and source.has_audio
  ) then
    return 'program_dj_source_required';
  end if;
  return null;
end;
$$;

revoke all on function public.live_program_assignment_error_v1(uuid, text, jsonb)
from public, anon, authenticated, service_role;

create or replace function public.rpc_host_disconnect_live_studio_v1(
  p_session_id uuid,
  p_command_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  v_now timestamptz := timezone('utc', now());
  v_session public.live_sessions;
  v_show public.live_odo_show_sessions;
  v_config public.live_odo_configuration;
  v_previous_controller_instance_id uuid;
  v_previous_controller_generation bigint;
  v_previous_program_version bigint;
  v_next_control_source text;
  v_active_studio_sources integer := 0;
  v_provider_user_ids jsonb := '[]'::jsonb;
  v_idempotent boolean := false;
begin
  if auth.uid() is null
    or not public.live_odo_show_host_allowed_v1(p_session_id, auth.uid()) then
    raise exception 'live_studio_disconnect_forbidden' using errcode = '42501';
  end if;
  if p_session_id is null or p_command_id is null then
    raise exception 'live_studio_disconnect_invalid' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    'live_program:' || p_session_id::text, 0
  ));
  perform public.live_program_ensure_session_v1(p_session_id);
  select * into v_session from public.live_sessions
  where id = p_session_id for update;
  if v_session.id is null then
    raise exception 'live_session_not_found' using errcode = 'P0002';
  end if;
  if v_session.status not in ('backstage','live','ending') then
    raise exception 'live_studio_disconnect_session_unavailable' using errcode = '22023';
  end if;
  select * into v_show from public.live_odo_show_sessions
  where session_id = p_session_id for update;
  select * into v_config from public.live_odo_configuration where id = true;

  select coalesce(jsonb_agg(target.provider_user_id order by target.provider_user_id), '[]'::jsonb)
  into v_provider_user_ids
  from (
    select distinct source.provider_user_id
    from public.live_program_sources source
    where source.session_id = p_session_id
      and source.source_key like 'studio:%'
      and source.provider_user_id like 'studio-%'
  ) target;

  -- A Studio transport joins before its first camera/screen source is
  -- registered. Include both deterministic controller identities so the Host
  -- can disconnect an attached browser even during that preparation window.
  if v_show.control_user_id is not null
    and v_show.controller_instance_id is not null then
    select coalesce(jsonb_agg(identity.provider_user_id order by identity.provider_user_id), '[]'::jsonb)
    into v_provider_user_ids
    from (
      select distinct existing.provider_user_id
      from jsonb_array_elements_text(v_provider_user_ids) existing(provider_user_id)
      union
      select 'studio-' || replace(v_show.control_user_id::text, '-', '')
        || '-' || left(replace(v_show.controller_instance_id::text, '-', ''), 8)
        || '-' || source_kind.suffix
      from (values ('studio-host'), ('dj-audio')) source_kind(suffix)
    ) identity;
  end if;

  select count(*)::integer into v_active_studio_sources
  from public.live_program_sources source
  where source.session_id = p_session_id
    and source.source_key like 'studio:%'
    and source.readiness in ('preparing','ready','live');

  -- This cleanup also runs on an idempotent retry, closing the narrow race in
  -- which a final browser heartbeat overlaps the provider kick.
  update public.live_program_sources source set
    readiness = 'ended', health = 'lost', muted = true,
    failure_reason_code = 'studio_disconnected_by_host',
    last_seen_at = v_now, version = source.version + 1
  where source.session_id = p_session_id
    and source.source_key like 'studio:%'
    and source.readiness in ('preparing','ready','live');

  select exists (
    select 1 from public.live_program_command_events command
    where command.command_id = p_command_id
      and command.session_id = p_session_id
      and command.command_type = 'RELEASE_CONTROL'
  ) into v_idempotent;
  if v_idempotent then
    select * into v_show from public.live_odo_show_sessions
    where session_id = p_session_id;
    return jsonb_build_object(
      'schemaVersion', 1, 'disconnected', true, 'idempotent', true,
      'sessionId', p_session_id, 'provider', v_session.provider,
      'providerCallType', v_session.provider_call_type,
      'providerCallId', v_session.provider_call_id,
      'providerUserIds', v_provider_user_ids,
      'studioSourceCount', v_active_studio_sources,
      'controlSource', v_show.control_source,
      'programVersion', v_show.program_version,
      'reasonCode', 'command_already_applied'
    );
  end if;

  if v_show.control_source <> 'studio_host'
    and v_show.program_source <> 'studio'
    and v_active_studio_sources = 0 then
    return jsonb_build_object(
      'schemaVersion', 1, 'disconnected', false, 'idempotent', true,
      'sessionId', p_session_id, 'provider', v_session.provider,
      'providerCallType', v_session.provider_call_type,
      'providerCallId', v_session.provider_call_id,
      'providerUserIds', v_provider_user_ids,
      'studioSourceCount', 0,
      'controlSource', v_show.control_source,
      'programVersion', v_show.program_version,
      'reasonCode', 'studio_already_disconnected'
    );
  end if;

  v_previous_controller_instance_id := v_show.controller_instance_id;
  v_previous_controller_generation := v_show.controller_generation;
  v_previous_program_version := v_show.program_version;
  v_next_control_source := case
    when v_show.enabled and coalesce(v_config.odo_enabled, false)
      and not coalesce(v_config.circuit_breaker_open, false) then 'odo'
    else 'mobile_host'
  end;

  update public.live_odo_show_sessions set
    previous_program_state = jsonb_build_object(
      'scene', current_scene, 'targetCanvas', target_canvas,
      'sourceAssignments', source_assignments, 'transition', program_transition,
      'programVersion', program_version
    ),
    current_scene = fallback_scene,
    source_assignments = case fallback_scene
      when 'host_focus' then jsonb_build_object('host', 'server.host')
      when 'pool_focus' then jsonb_build_object('pool', 'server.pool')
      else jsonb_build_object('odo', 'server.brand') end,
    program_transition = 'cut',
    program_version = program_version + 1,
    program_source = 'mobile',
    control_source = v_next_control_source,
    control_user_id = case when v_next_control_source = 'mobile_host'
      then auth.uid() else null end,
    controller_instance_id = null,
    controller_generation = controller_generation + 1,
    control_lease_expires_at = null,
    controller_acquired_at = null,
    paused_by_host = v_next_control_source = 'mobile_host',
    show_state = case when v_next_control_source = 'odo'
      then 'recovering' else 'paused_by_host' end,
    host_suppression_ends_at = null,
    next_wake_at = case when v_next_control_source = 'odo' then v_now else null end,
    last_reason_code = 'studio_disconnected_by_host',
    last_program_command_id = p_command_id,
    version = version + 1
  where session_id = p_session_id returning * into v_show;

  update public.live_odo_session_state set
    direction_mode = case when v_next_control_source = 'odo'
      then 'autopilot' else 'manual' end,
    autopilot_state = case when v_next_control_source = 'odo'
      then 'recovering' else 'paused_by_host' end,
    lease_owner = null, lease_expires_at = null, lease_heartbeat_at = null,
    pause_reason_code = case when v_next_control_source = 'odo'
      then null else 'studio_disconnected_by_host' end,
    state_version = state_version + 1
  where session_id = p_session_id;

  insert into public.live_program_command_events(
    session_id, command_id, command_type, source, actor_user_id,
    controller_instance_id, expected_controller_generation,
    resulting_controller_generation, expected_program_version,
    resulting_program_version, status, reason_code
  ) values (
    p_session_id, p_command_id, 'RELEASE_CONTROL', 'mobile_host', auth.uid(),
    v_previous_controller_instance_id, v_previous_controller_generation,
    v_show.controller_generation, v_previous_program_version,
    v_show.program_version, 'applied', 'studio_disconnected_by_host'
  );

  return jsonb_build_object(
    'schemaVersion', 1, 'disconnected', true, 'idempotent', false,
    'sessionId', p_session_id, 'provider', v_session.provider,
    'providerCallType', v_session.provider_call_type,
    'providerCallId', v_session.provider_call_id,
    'providerUserIds', v_provider_user_ids,
    'studioSourceCount', v_active_studio_sources,
    'controlSource', v_show.control_source,
    'programVersion', v_show.program_version,
    'reasonCode', 'studio_disconnected_by_host'
  );
end;
$$;

revoke all on function public.rpc_host_disconnect_live_studio_v1(uuid, uuid)
from public, anon;
grant execute on function public.rpc_host_disconnect_live_studio_v1(uuid, uuid)
to authenticated, service_role;

comment on function public.rpc_host_disconnect_live_studio_v1(uuid, uuid) is
  'Host-only, idempotent Studio disconnect. Safely restores Program authority and returns provider identities for server-side eviction.';

commit;
