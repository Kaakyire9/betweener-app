-- Betweener Live Phase 10G.3/10G.9: one fenced Studio controller, source
-- registration, Preview -> TAKE/CUT -> Program and deterministic fallback.

begin;

create or replace function public.live_program_ensure_session_v1(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
begin
  if not exists (select 1 from public.live_sessions where id = p_session_id) then
    raise exception 'live_session_not_found' using errcode = 'P0002';
  end if;
  insert into public.live_odo_show_sessions(session_id, program_source, control_source)
  select session.id,
    case when session.ownership_type = 'system' then 'system' else 'mobile' end,
    case when session.ownership_type = 'system' then 'system' else 'odo' end
  from public.live_sessions session where session.id = p_session_id
  on conflict (session_id) do nothing;
end;
$$;

revoke all on function public.live_program_ensure_session_v1(uuid)
from public, anon, authenticated, service_role;

create or replace function public.live_program_ensure_logical_sources_v1(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  v_host_user_id uuid;
  v_host_ready boolean := false;
  v_pool_ready boolean := false;
  v_pair_ready boolean := false;
  v_music_ready boolean := false;
begin
  select session.created_by_user_id into v_host_user_id
  from public.live_sessions session where session.id = p_session_id;
  select exists (
    select 1 from public.live_participants participant
    where participant.session_id = p_session_id
      and participant.user_id = v_host_user_id
      and participant.state in ('backstage','on_stage')
  ) into v_host_ready;
  select exists (
    select 1 from public.live_quick_connect_participants participant
    where participant.session_id = p_session_id and participant.state = 'waiting'
      and participant.connection_state = 'connected'
      and participant.last_seen_at >= timezone('utc', now()) - interval '45 seconds'
  ) into v_pool_ready;
  select exists (
    select 1 from public.live_quick_connect_pairings pairing
    where pairing.session_id = p_session_id and pairing.state in ('active','reconnect_grace')
  ) into v_pair_ready;
  select exists (
    select 1 from public.live_music_session_state music
    where music.session_id = p_session_id and music.status <> 'stopped'
  ) into v_music_ready;

  insert into public.live_program_sources(
    session_id, source_key, source_type, source_role, owner_user_id,
    provider_user_id, has_video, has_audio, readiness, health, last_seen_at
  ) values
    (p_session_id, 'server.host', 'host_camera', 'visual', v_host_user_id,
      v_host_user_id::text, true, false,
      case when v_host_ready then 'live' else 'unavailable' end,
      case when v_host_ready then 'healthy' else 'unknown' end, timezone('utc', now())),
    (p_session_id, 'server.pool', 'quick_connect_pool', 'visual', null,
      null, false, false, case when v_pool_ready then 'live' else 'ready' end,
      'healthy', timezone('utc', now())),
    (p_session_id, 'server.pair', 'active_pair', 'visual', null,
      null, false, false, case when v_pair_ready then 'live' else 'ready' end,
      'healthy', timezone('utc', now())),
    (p_session_id, 'server.odo', 'odo_stage', 'visual', null,
      null, false, false, 'ready', 'healthy', timezone('utc', now())),
    (p_session_id, 'server.pulse', 'audience_pulse', 'visual', null,
      null, false, false, 'ready', 'healthy', timezone('utc', now())),
    (p_session_id, 'server.brand', 'branded_visual', 'visual', null,
      null, false, false, 'ready', 'healthy', timezone('utc', now())),
    (p_session_id, 'server.music', 'programme_music', 'atmosphere_audio', null,
      null, false, true, case when v_music_ready then 'live' else 'ready' end,
      'healthy', timezone('utc', now()))
  on conflict (session_id, source_key) do update set
    owner_user_id = excluded.owner_user_id,
    provider_user_id = excluded.provider_user_id,
    readiness = excluded.readiness,
    health = excluded.health,
    last_seen_at = excluded.last_seen_at,
    version = public.live_program_sources.version + 1;

  insert into public.live_program_sources(
    session_id, source_key, source_type, source_role, owner_user_id,
    provider_user_id, has_video, has_audio, readiness, health, last_seen_at
  )
  select p_session_id,
    'participant.' || replace(participant.user_id::text, '-', ''),
    'participant_camera', 'visual', participant.user_id,
    participant.user_id::text, true, true, 'live', 'healthy',
    timezone('utc', now())
  from public.live_participants participant
  where participant.session_id = p_session_id
    and participant.state = 'on_stage'
  on conflict (session_id, source_key) do update set
    provider_user_id = excluded.provider_user_id,
    readiness = 'live', health = 'healthy', last_seen_at = excluded.last_seen_at,
    version = public.live_program_sources.version + 1;

  update public.live_program_sources source set
    readiness = 'unavailable', health = 'unknown', version = source.version + 1
  where source.session_id = p_session_id
    and source.source_type = 'participant_camera'
    and not exists (
      select 1 from public.live_participants participant
      where participant.session_id = p_session_id
        and participant.user_id = source.owner_user_id
        and participant.state = 'on_stage'
    );
end;
$$;

revoke all on function public.live_program_ensure_logical_sources_v1(uuid)
from public, anon, authenticated, service_role;

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

create or replace function public.live_program_command_result_v1(
  p_applied boolean,
  p_reason_code text,
  p_session_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
  select jsonb_build_object(
    'applied', p_applied,
    'reasonCode', p_reason_code,
    'snapshot', public.rpc_get_live_studio_snapshot_v1(p_session_id)
  );
$$;

revoke all on function public.live_program_command_result_v1(boolean, text, uuid)
from public, anon, authenticated, service_role;

create or replace function public.rpc_studio_take_live_program_control_v1(
  p_session_id uuid,
  p_controller_instance_id uuid,
  p_expected_controller_generation bigint,
  p_expected_program_version bigint,
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
  v_config public.live_odo_configuration;
  v_session public.live_sessions;
  v_show public.live_odo_show_sessions;
begin
  if auth.uid() is null
    or not public.live_studio_is_authorized_v1(p_session_id, auth.uid(), 'control') then
    raise exception 'live_studio_control_forbidden' using errcode = '42501';
  end if;
  if p_controller_instance_id is null or p_command_id is null
    or p_expected_controller_generation is null or p_expected_controller_generation < 1
    or p_expected_program_version is null or p_expected_program_version < 1 then
    raise exception 'live_studio_control_invalid' using errcode = '22023';
  end if;
  if exists (select 1 from public.live_program_command_events where command_id = p_command_id) then
    return public.live_program_command_result_v1(true, 'command_already_applied', p_session_id);
  end if;
  perform pg_advisory_xact_lock(hashtextextended('live_program:' || p_session_id::text, 0));
  perform public.live_program_ensure_session_v1(p_session_id);
  perform public.live_program_ensure_logical_sources_v1(p_session_id);
  select * into v_config from public.live_odo_configuration where id = true;
  select * into v_session from public.live_sessions where id = p_session_id;
  select * into v_show from public.live_odo_show_sessions
  where session_id = p_session_id for update;
  if v_session.status not in ('backstage','live','ending') then
    return public.live_program_command_result_v1(false, 'session_not_controllable', p_session_id);
  end if;
  if v_show.controller_generation <> p_expected_controller_generation
    or v_show.program_version <> p_expected_program_version then
    return public.live_program_command_result_v1(false, 'stale_program_state', p_session_id);
  end if;
  if v_show.control_source = 'studio_host'
    and v_show.control_lease_expires_at > v_now
    and (v_show.controller_instance_id <> p_controller_instance_id
      or v_show.control_user_id <> auth.uid()) then
    return public.live_program_command_result_v1(false, 'studio_controller_active', p_session_id);
  end if;
  if v_show.control_source = 'mobile_host'
    and v_show.control_user_id <> auth.uid()
    and not public.is_admin_user(auth.uid()) then
    return public.live_program_command_result_v1(false, 'mobile_controller_active', p_session_id);
  end if;

  update public.live_odo_show_sessions set
    program_source = 'studio', control_source = 'studio_host',
    control_user_id = auth.uid(), controller_instance_id = p_controller_instance_id,
    controller_generation = controller_generation + 1,
    controller_acquired_at = v_now,
    control_lease_expires_at = v_now + make_interval(
      secs => v_config.studio_controller_lease_seconds
    ),
    paused_by_host = true, show_state = 'paused_by_host', next_wake_at = null,
    last_reason_code = 'studio_control_acquired', version = version + 1
  where session_id = p_session_id returning * into v_show;
  update public.live_odo_session_state set
    direction_mode = 'manual', autopilot_state = 'paused_by_host',
    lease_owner = null, lease_expires_at = null, lease_heartbeat_at = null,
    pause_reason_code = 'studio_control_acquired', state_version = state_version + 1
  where session_id = p_session_id;
  insert into public.live_program_command_events(
    session_id, command_id, command_type, source, actor_user_id,
    controller_instance_id, expected_controller_generation,
    resulting_controller_generation, expected_program_version,
    resulting_program_version, status, reason_code
  ) values (
    p_session_id, p_command_id, 'TAKE_CONTROL', 'studio_host', auth.uid(),
    p_controller_instance_id, p_expected_controller_generation,
    v_show.controller_generation, p_expected_program_version,
    v_show.program_version, 'applied', 'studio_control_acquired'
  );
  return public.live_program_command_result_v1(true, 'studio_control_acquired', p_session_id);
end;
$$;

revoke all on function public.rpc_studio_take_live_program_control_v1(
  uuid, uuid, bigint, bigint, uuid
) from public, anon;
grant execute on function public.rpc_studio_take_live_program_control_v1(
  uuid, uuid, bigint, bigint, uuid
) to authenticated, service_role;

create or replace function public.rpc_studio_renew_live_program_control_v1(
  p_session_id uuid,
  p_controller_instance_id uuid,
  p_expected_controller_generation bigint
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  v_config public.live_odo_configuration;
  v_show public.live_odo_show_sessions;
begin
  if auth.uid() is null
    or not public.live_studio_is_authorized_v1(p_session_id, auth.uid(), 'control') then
    raise exception 'live_studio_control_forbidden' using errcode = '42501';
  end if;
  select * into v_config from public.live_odo_configuration where id = true;
  update public.live_odo_show_sessions set
    control_lease_expires_at = timezone('utc', now()) + make_interval(
      secs => v_config.studio_controller_lease_seconds
    ),
    next_wake_at = null,
    last_reason_code = 'studio_control_renewed'
  where session_id = p_session_id
    and control_source = 'studio_host'
    and control_user_id = auth.uid()
    and controller_instance_id = p_controller_instance_id
    and controller_generation = p_expected_controller_generation
    and control_lease_expires_at > timezone('utc', now())
  returning * into v_show;
  if v_show.session_id is null then
    return jsonb_build_object('renewed', false, 'reasonCode', 'studio_lease_stale');
  end if;
  return jsonb_build_object(
    'renewed', true, 'reasonCode', 'studio_control_renewed',
    'controllerGeneration', v_show.controller_generation,
    'leaseExpiresAt', v_show.control_lease_expires_at
  );
end;
$$;

revoke all on function public.rpc_studio_renew_live_program_control_v1(uuid, uuid, bigint)
from public, anon;
grant execute on function public.rpc_studio_renew_live_program_control_v1(uuid, uuid, bigint)
to authenticated, service_role;

create or replace function public.rpc_studio_take_live_program_v1(
  p_session_id uuid,
  p_controller_instance_id uuid,
  p_expected_controller_generation bigint,
  p_expected_program_version bigint,
  p_command_id uuid,
  p_scene text,
  p_target_canvas text,
  p_source_assignments jsonb,
  p_transition text default 'auto'
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  v_now timestamptz := timezone('utc', now());
  v_show public.live_odo_show_sessions;
  v_error text;
begin
  if auth.uid() is null
    or not public.live_studio_is_authorized_v1(p_session_id, auth.uid(), 'control') then
    raise exception 'live_studio_program_forbidden' using errcode = '42501';
  end if;
  if p_controller_instance_id is null or p_command_id is null
    or p_expected_controller_generation is null or p_expected_controller_generation < 1
    or p_expected_program_version is null or p_expected_program_version < 1
    or p_target_canvas not in ('portrait_9_16','landscape_16_9','square_1_1')
    or p_transition not in ('cut','auto','fade') then
    raise exception 'live_studio_program_invalid' using errcode = '22023';
  end if;
  if exists (select 1 from public.live_program_command_events where command_id = p_command_id) then
    return public.live_program_command_result_v1(true, 'command_already_applied', p_session_id);
  end if;
  perform pg_advisory_xact_lock(hashtextextended('live_program:' || p_session_id::text, 0));
  perform public.live_program_ensure_logical_sources_v1(p_session_id);
  select * into v_show from public.live_odo_show_sessions
  where session_id = p_session_id for update;
  if v_show.control_source <> 'studio_host'
    or v_show.control_user_id <> auth.uid()
    or v_show.controller_instance_id <> p_controller_instance_id
    or v_show.control_lease_expires_at <= v_now then
    return public.live_program_command_result_v1(false, 'studio_control_required', p_session_id);
  end if;
  if v_show.controller_generation <> p_expected_controller_generation
    or v_show.program_version <> p_expected_program_version then
    return public.live_program_command_result_v1(false, 'stale_program_state', p_session_id);
  end if;
  v_error := public.live_program_assignment_error_v1(
    p_session_id, p_scene, coalesce(p_source_assignments, '{}'::jsonb)
  );
  if v_error is not null then
    return public.live_program_command_result_v1(false, v_error, p_session_id);
  end if;
  update public.live_odo_show_sessions set
    previous_program_state = jsonb_build_object(
      'scene', current_scene, 'targetCanvas', target_canvas,
      'sourceAssignments', source_assignments, 'transition', program_transition,
      'programVersion', program_version
    ),
    current_scene = p_scene,
    target_canvas = p_target_canvas,
    source_assignments = coalesce(p_source_assignments, '{}'::jsonb),
    program_transition = p_transition,
    fallback_scene = case
      when p_scene like 'screen_%' then 'host_focus'
      when p_scene = 'dj_plus_pool' then 'pool_focus'
      else fallback_scene end,
    scene_entered_at = v_now,
    host_suppression_ends_at = null,
    current_priority = 95,
    last_reason_code = case when p_transition = 'cut'
      then 'studio_program_cut' else 'studio_program_take' end,
    last_program_command_id = p_command_id,
    program_version = program_version + 1,
    version = version + 1
  where session_id = p_session_id returning * into v_show;
  insert into public.live_program_command_events(
    session_id, command_id, command_type, source, actor_user_id,
    controller_instance_id, expected_controller_generation,
    resulting_controller_generation, expected_program_version,
    resulting_program_version, status, reason_code
  ) values (
    p_session_id, p_command_id,
    case when p_transition = 'cut' then 'CUT' else 'TAKE' end,
    'studio_host', auth.uid(), p_controller_instance_id,
    p_expected_controller_generation, v_show.controller_generation,
    p_expected_program_version, v_show.program_version, 'applied',
    case when p_transition = 'cut' then 'studio_program_cut' else 'studio_program_take' end
  );
  return public.live_program_command_result_v1(true,
    case when p_transition = 'cut' then 'studio_program_cut' else 'studio_program_take' end,
    p_session_id);
end;
$$;

revoke all on function public.rpc_studio_take_live_program_v1(
  uuid, uuid, bigint, bigint, uuid, text, text, jsonb, text
) from public, anon;
grant execute on function public.rpc_studio_take_live_program_v1(
  uuid, uuid, bigint, bigint, uuid, text, text, jsonb, text
) to authenticated, service_role;

create or replace function public.rpc_studio_upsert_live_program_source_v1(
  p_session_id uuid,
  p_source_key text,
  p_source_type text,
  p_source_role text,
  p_provider_user_id text,
  p_has_video boolean,
  p_has_audio boolean,
  p_readiness text,
  p_health text,
  p_muted boolean default false,
  p_failure_reason_code text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare v_source public.live_program_sources;
begin
  if auth.uid() is null
    or not public.live_studio_is_authorized_v1(p_session_id, auth.uid(), 'publish') then
    raise exception 'live_studio_source_forbidden' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.live_sessions session
    where session.id = p_session_id
      and session.status in ('backstage','live','ending')
  ) then
    raise exception 'live_studio_session_inactive' using errcode = '55000';
  end if;
  if p_source_key !~ '^studio:[a-z0-9_.:-]{3,112}$'
    or p_source_type not in (
      'host_camera','screen_share','screen_share_audio','host_microphone','dj_audio'
    )
    or p_source_role not in ('visual','host_audio','screen_audio','atmosphere_audio')
    or p_readiness not in (
      'unavailable','permission_required','preparing','ready','live','ended','failed'
    )
    or p_health not in ('unknown','healthy','degraded','lost')
    or p_provider_user_id is null or char_length(p_provider_user_id) not between 1 and 128
    or p_provider_user_id not like (
      'studio-' || replace(auth.uid()::text, '-', '') || '-%'
    )
    or (p_failure_reason_code is not null
      and p_failure_reason_code !~ '^[a-z][a-z0-9_]{0,119}$')
    or (p_source_type in ('host_camera','screen_share') and not p_has_video)
    or (p_source_type in ('host_microphone','screen_share_audio','dj_audio') and not p_has_audio)
    or (p_source_type = 'host_camera' and p_source_role <> 'visual')
    or (p_source_type = 'screen_share' and p_source_role <> 'visual')
    or (p_source_type = 'host_microphone' and p_source_role <> 'host_audio')
    or (p_source_type = 'screen_share_audio' and p_source_role <> 'screen_audio')
    or (p_source_type = 'dj_audio' and p_source_role <> 'atmosphere_audio') then
    raise exception 'live_studio_source_invalid' using errcode = '22023';
  end if;
  if p_source_type in ('screen_share','screen_share_audio')
    and not public.live_studio_is_authorized_v1(p_session_id, auth.uid(), 'screen_share') then
    raise exception 'live_studio_screen_share_forbidden' using errcode = '42501';
  end if;
  if p_source_type = 'screen_share_audio'
    and not coalesce((select studio_screen_audio_enabled
      from public.live_odo_configuration where id = true), false) then
    raise exception 'live_studio_screen_audio_disabled' using errcode = '42501';
  end if;
  if p_source_type = 'dj_audio'
    and not public.live_studio_is_authorized_v1(p_session_id, auth.uid(), 'external_audio') then
    raise exception 'live_studio_external_audio_forbidden' using errcode = '42501';
  end if;
  insert into public.live_program_sources(
    session_id, source_key, source_type, source_role, owner_user_id,
    provider_user_id, has_video, has_audio, readiness, health, muted,
    failure_reason_code, last_seen_at
  ) values (
    p_session_id, p_source_key, p_source_type, p_source_role, auth.uid(),
    p_provider_user_id, p_has_video, p_has_audio, p_readiness, p_health,
    p_muted, p_failure_reason_code, timezone('utc', now())
  ) on conflict (session_id, source_key) do update set
    source_type = excluded.source_type,
    source_role = excluded.source_role,
    provider_user_id = excluded.provider_user_id,
    has_video = excluded.has_video,
    has_audio = excluded.has_audio,
    readiness = excluded.readiness,
    health = excluded.health,
    muted = excluded.muted,
    failure_reason_code = excluded.failure_reason_code,
    last_seen_at = excluded.last_seen_at,
    generation = case
      when public.live_program_sources.provider_user_id is distinct from excluded.provider_user_id
        then public.live_program_sources.generation + 1
      else public.live_program_sources.generation end,
    version = public.live_program_sources.version + 1
  where public.live_program_sources.owner_user_id = auth.uid()
  returning * into v_source;
  if v_source.id is null then
    raise exception 'live_studio_source_owner_conflict' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'id', v_source.id, 'key', v_source.source_key,
    'readiness', v_source.readiness, 'health', v_source.health,
    'generation', v_source.generation, 'version', v_source.version
  );
end;
$$;

revoke all on function public.rpc_studio_upsert_live_program_source_v1(
  uuid, text, text, text, text, boolean, boolean, text, text, boolean, text
) from public, anon;
grant execute on function public.rpc_studio_upsert_live_program_source_v1(
  uuid, text, text, text, text, boolean, boolean, text, text, boolean, text
) to authenticated, service_role;

create or replace function public.rpc_studio_end_live_program_source_v1(
  p_session_id uuid,
  p_source_key text,
  p_reason_code text default 'source_ended'
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  v_show public.live_odo_show_sessions;
  v_source public.live_program_sources;
  v_fallback_applied boolean := false;
begin
  if auth.uid() is null
    or not public.live_studio_is_authorized_v1(p_session_id, auth.uid(), 'publish') then
    raise exception 'live_studio_source_forbidden' using errcode = '42501';
  end if;
  if p_reason_code !~ '^[a-z][a-z0-9_]{0,119}$' then
    raise exception 'live_studio_source_invalid' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('live_program:' || p_session_id::text, 0));
  update public.live_program_sources set
    readiness = 'ended', health = 'lost', muted = true,
    failure_reason_code = p_reason_code, last_seen_at = timezone('utc', now()),
    version = version + 1
  where session_id = p_session_id and source_key = p_source_key
    and owner_user_id = auth.uid()
  returning * into v_source;
  if v_source.id is null then
    raise exception 'live_studio_source_not_found' using errcode = 'P0002';
  end if;
  select * into v_show from public.live_odo_show_sessions
  where session_id = p_session_id for update;
  if exists (select 1 from jsonb_each_text(v_show.source_assignments) item
      where item.value = p_source_key) then
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
      last_reason_code = p_reason_code,
      program_version = program_version + 1,
      version = version + 1
    where session_id = p_session_id returning * into v_show;
    v_fallback_applied := true;
  end if;
  return jsonb_build_object(
    'ended', true, 'fallbackApplied', v_fallback_applied,
    'programVersion', v_show.program_version, 'reasonCode', p_reason_code
  );
end;
$$;

revoke all on function public.rpc_studio_end_live_program_source_v1(uuid, text, text)
from public, anon;
grant execute on function public.rpc_studio_end_live_program_source_v1(uuid, text, text)
to authenticated, service_role;

create or replace function public.rpc_studio_resume_live_odo_v1(
  p_session_id uuid,
  p_controller_instance_id uuid,
  p_expected_controller_generation bigint,
  p_command_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  v_show public.live_odo_show_sessions;
  v_config public.live_odo_configuration;
begin
  if auth.uid() is null
    or not public.live_studio_is_authorized_v1(p_session_id, auth.uid(), 'control') then
    raise exception 'live_studio_control_forbidden' using errcode = '42501';
  end if;
  if p_command_id is null or p_controller_instance_id is null then
    raise exception 'live_studio_control_invalid' using errcode = '22023';
  end if;
  if exists (select 1 from public.live_program_command_events where command_id = p_command_id) then
    return public.live_program_command_result_v1(true, 'command_already_applied', p_session_id);
  end if;
  perform pg_advisory_xact_lock(hashtextextended('live_program:' || p_session_id::text, 0));
  select * into v_config from public.live_odo_configuration where id = true;
  select * into v_show from public.live_odo_show_sessions
  where session_id = p_session_id for update;
  if coalesce(v_config.circuit_breaker_open, false) then
    return public.live_program_command_result_v1(false, 'policy_clearance_required', p_session_id);
  end if;
  if v_show.control_source <> 'studio_host'
    or v_show.control_user_id <> auth.uid()
    or v_show.controller_instance_id <> p_controller_instance_id
    or v_show.controller_generation <> p_expected_controller_generation
    or v_show.control_lease_expires_at <= timezone('utc', now()) then
    return public.live_program_command_result_v1(false, 'studio_lease_stale', p_session_id);
  end if;
  update public.live_odo_show_sessions set
    control_source = 'odo', control_user_id = null, controller_instance_id = null,
    controller_generation = controller_generation + 1,
    control_lease_expires_at = null, controller_acquired_at = null,
    program_source = case when exists (
      select 1 from public.live_sessions session where session.id = p_session_id
        and session.ownership_type = 'system'
    ) then 'system' else 'mobile' end,
    paused_by_host = false, show_state = 'recovering',
    host_suppression_ends_at = null, next_wake_at = timezone('utc', now()),
    last_reason_code = 'studio_resumed_odo', version = version + 1
  where session_id = p_session_id returning * into v_show;
  update public.live_odo_session_state set
    direction_mode = 'autopilot', autopilot_state = 'recovering',
    lease_owner = null, lease_expires_at = null, lease_heartbeat_at = null,
    pause_reason_code = null, state_version = state_version + 1
  where session_id = p_session_id;
  insert into public.live_program_command_events(
    session_id, command_id, command_type, source, actor_user_id,
    controller_instance_id, expected_controller_generation,
    resulting_controller_generation, expected_program_version,
    resulting_program_version, status, reason_code
  ) values (
    p_session_id, p_command_id, 'RESUME_ODO', 'studio_host', auth.uid(),
    p_controller_instance_id, p_expected_controller_generation,
    v_show.controller_generation, v_show.program_version,
    v_show.program_version, 'applied', 'studio_resumed_odo'
  );
  return public.live_program_command_result_v1(true, 'studio_resumed_odo', p_session_id);
end;
$$;

revoke all on function public.rpc_studio_resume_live_odo_v1(uuid, uuid, bigint, uuid)
from public, anon;
grant execute on function public.rpc_studio_resume_live_odo_v1(uuid, uuid, bigint, uuid)
to authenticated, service_role;

-- Keep the Phase 10E mobile takeover API compatible, but permanently fence
-- its former unversioned studio_host branch behind the Phase 10G command API.
create or replace function public.rpc_acquire_live_program_control_v1(
  p_session_id uuid,
  p_source text,
  p_expected_version bigint
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare v_show public.live_odo_show_sessions;
begin
  if auth.uid() is null
    or not public.live_odo_show_host_allowed_v1(p_session_id, auth.uid()) then
    raise exception 'live_program_control_forbidden' using errcode = '42501';
  end if;
  if p_source = 'studio_host' then
    return jsonb_build_object(
      'acquired', false,
      'reasonCode', 'studio_versioned_control_required'
    );
  end if;
  if p_source <> 'mobile_host' or p_expected_version is null or p_expected_version < 1 then
    raise exception 'live_program_control_invalid' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('live_program:' || p_session_id::text, 0));
  select * into v_show from public.live_odo_show_sessions
  where session_id = p_session_id for update;
  if v_show.version <> p_expected_version then
    return jsonb_build_object('acquired', false, 'reasonCode', 'stale_show_version');
  end if;
  if v_show.control_source = 'studio_host'
    and v_show.control_lease_expires_at > timezone('utc', now())
    and v_show.control_user_id <> auth.uid() then
    return jsonb_build_object('acquired', false, 'reasonCode', 'studio_controller_active');
  end if;
  update public.live_odo_show_sessions set
    program_source = 'mobile', control_source = 'mobile_host',
    control_user_id = auth.uid(), controller_instance_id = null,
    controller_generation = controller_generation + 1,
    control_lease_expires_at = timezone('utc', now()) + interval '30 seconds',
    paused_by_host = true, show_state = 'paused_by_host',
    next_wake_at = timezone('utc', now()) + interval '30 seconds',
    last_reason_code = 'program_control_acquired', version = version + 1
  where session_id = p_session_id returning * into v_show;
  return jsonb_build_object(
    'acquired', true, 'source', v_show.control_source,
    'stateVersion', v_show.version,
    'leaseExpiresAt', v_show.control_lease_expires_at
  );
end;
$$;

revoke all on function public.rpc_acquire_live_program_control_v1(uuid, text, bigint)
from public, anon;
grant execute on function public.rpc_acquire_live_program_control_v1(uuid, text, bigint)
to authenticated, service_role;

do $$
declare v_session_id uuid;
begin
  for v_session_id in
    select session.id from public.live_sessions session
    where session.status in ('scheduled','waiting_for_quorum','confirmed','backstage','live','ending')
  loop
    perform public.live_program_ensure_session_v1(v_session_id);
    perform public.live_program_ensure_logical_sources_v1(v_session_id);
  end loop;
end;
$$;

commit;
