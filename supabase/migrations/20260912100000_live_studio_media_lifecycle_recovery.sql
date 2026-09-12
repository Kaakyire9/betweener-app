-- Phase 10G Studio lifecycle recovery.
-- Browser screen sharing backgrounds the Studio tab, so control and source
-- liveness must tolerate timer throttling without weakening deterministic
-- fallback or the Odo policy-pause fence.

begin;

update public.live_odo_configuration set
  studio_controller_lease_seconds = greatest(studio_controller_lease_seconds, 90),
  studio_controller_grace_seconds = greatest(studio_controller_grace_seconds, 30)
where id = true;

create or replace function public.live_program_safe_fallback_v1(
  p_session_id uuid,
  p_preferred_scene text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare v_source_key text;
begin
  if p_preferred_scene = 'host_focus' then
    select source.source_key into v_source_key
    from public.live_program_sources source
    where source.session_id = p_session_id
      and source.source_type = 'host_camera'
      and source.has_video
      and source.readiness in ('ready','live')
      and source.health <> 'lost'
    order by case when source.source_key = 'server.host' then 0 else 1 end,
      source.last_seen_at desc, source.source_key
    limit 1;
    if v_source_key is not null then
      return jsonb_build_object(
        'scene', 'host_focus',
        'sourceAssignments', jsonb_build_object('host', v_source_key)
      );
    end if;
  end if;

  if p_preferred_scene = 'pool_focus' and exists (
    select 1 from public.live_program_sources source
    where source.session_id = p_session_id
      and source.source_key = 'server.pool'
      and source.readiness in ('ready','live')
      and source.health <> 'lost'
  ) then
    return jsonb_build_object(
      'scene', 'pool_focus',
      'sourceAssignments', jsonb_build_object('pool', 'server.pool')
    );
  end if;

  return jsonb_build_object(
    'scene', 'branded_intermission',
    'sourceAssignments', jsonb_build_object('odo', 'server.brand')
  );
end;
$$;

revoke all on function public.live_program_safe_fallback_v1(uuid, text)
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

  -- Taking visual control is always allowed. A policy-paused Odo remains
  -- policy-paused until the service-side safety clearance explicitly lifts it.
  update public.live_odo_session_state set
    direction_mode = 'manual',
    autopilot_state = case when autopilot_state = 'paused_by_policy'
      then 'paused_by_policy' else 'paused_by_host' end,
    lease_owner = null, lease_expires_at = null, lease_heartbeat_at = null,
    pause_reason_code = case when autopilot_state = 'paused_by_policy'
      then pause_reason_code else 'studio_control_acquired' end,
    state_version = state_version + 1
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
  v_fallback jsonb;
  v_fallback_applied boolean := false;
  v_program_adjusted boolean := false;
begin
  if auth.uid() is null
    or not public.live_studio_is_authorized_v1(p_session_id, auth.uid(), 'publish') then
    raise exception 'live_studio_source_forbidden' using errcode = '42501';
  end if;
  if p_reason_code !~ '^[a-z][a-z0-9_]{0,119}$' then
    raise exception 'live_studio_source_invalid' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('live_program:' || p_session_id::text, 0));
  perform public.live_program_ensure_logical_sources_v1(p_session_id);
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
    if v_source.source_role <> 'visual' then
      update public.live_odo_show_sessions set
        previous_program_state = jsonb_build_object(
          'scene', current_scene, 'targetCanvas', target_canvas,
          'sourceAssignments', source_assignments, 'transition', program_transition,
          'programVersion', program_version
        ),
        source_assignments = (
          select coalesce(jsonb_object_agg(item.key, item.value), '{}'::jsonb)
          from jsonb_each_text(v_show.source_assignments) item
          where item.value <> p_source_key
        ),
        last_reason_code = p_reason_code,
        program_version = program_version + 1,
        version = version + 1
      where session_id = p_session_id returning * into v_show;
      v_program_adjusted := true;
    else
      v_fallback := public.live_program_safe_fallback_v1(
        p_session_id, v_show.fallback_scene
      );
      update public.live_odo_show_sessions set
        previous_program_state = jsonb_build_object(
          'scene', current_scene, 'targetCanvas', target_canvas,
          'sourceAssignments', source_assignments, 'transition', program_transition,
          'programVersion', program_version
        ),
        current_scene = v_fallback ->> 'scene',
        source_assignments = v_fallback -> 'sourceAssignments',
        program_transition = 'cut',
        last_reason_code = p_reason_code,
        program_version = program_version + 1,
        version = version + 1
      where session_id = p_session_id returning * into v_show;
      v_fallback_applied := true;
      v_program_adjusted := true;
    end if;
  end if;
  return jsonb_build_object(
    'ended', true, 'fallbackApplied', v_fallback_applied,
    'programAdjusted', v_program_adjusted,
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
  v_odo public.live_odo_session_state;
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
  select * into v_odo from public.live_odo_session_state
  where session_id = p_session_id for update;
  if coalesce(v_config.circuit_breaker_open, false)
    or v_odo.autopilot_state = 'paused_by_policy' then
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

create or replace function public.rpc_service_maintain_live_studio_program_v1(
  p_limit integer default 25
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
  v_show public.live_odo_show_sessions;
  v_source public.live_program_sources;
  v_fallback jsonb;
  v_odo_state text;
  v_odo_can_resume boolean;
  v_recovered integer := 0;
  v_sources_lost integer := 0;
  v_fallbacks integer := 0;
  v_command_id uuid;
begin
  if not public.live_odo_is_service_role() then
    raise exception 'live_odo_service_role_required' using errcode = '42501';
  end if;
  select * into v_config from public.live_odo_configuration where id = true;

  for v_source in
    select source.* from public.live_program_sources source
    join public.live_sessions session on session.id = source.session_id
    where source.source_key like 'studio:%'
      and source.readiness in ('preparing','ready','live')
      and source.last_seen_at < v_now - interval '120 seconds'
      and session.status in ('backstage','live','ending')
    order by source.last_seen_at
    for update of source skip locked
    limit greatest(1, least(coalesce(p_limit, 25), 100))
  loop
    update public.live_program_sources set
      readiness = 'failed', health = 'lost', muted = true,
      failure_reason_code = 'source_heartbeat_expired', version = version + 1
    where id = v_source.id;
    v_sources_lost := v_sources_lost + 1;
  end loop;

  for v_show in
    select show_session.* from public.live_odo_show_sessions show_session
    join public.live_sessions session on session.id = show_session.session_id
    where show_session.control_source = 'studio_host'
      and show_session.control_lease_expires_at
        <= v_now - make_interval(secs => v_config.studio_controller_grace_seconds)
      and session.status in ('backstage','live','ending')
    order by show_session.control_lease_expires_at
    for update of show_session skip locked
    limit greatest(1, least(coalesce(p_limit, 25), 100))
  loop
    select autopilot_state into v_odo_state
    from public.live_odo_session_state where session_id = v_show.session_id;
    v_odo_can_resume := coalesce(v_odo_state <> 'paused_by_policy', true)
      and v_show.enabled and v_config.odo_enabled and not v_config.circuit_breaker_open;
    v_command_id := gen_random_uuid();
    update public.live_odo_show_sessions set
      control_source = case when v_odo_can_resume then 'odo' else 'system' end,
      control_user_id = null,
      controller_instance_id = null,
      controller_generation = controller_generation + 1,
      control_lease_expires_at = null,
      controller_acquired_at = null,
      program_source = 'system',
      paused_by_host = false,
      show_state = case when v_odo_can_resume then 'recovering' else 'paused_by_policy' end,
      next_wake_at = case when v_odo_can_resume then v_now else null end,
      last_reason_code = 'studio_controller_expired',
      version = version + 1
    where session_id = v_show.session_id
    returning * into v_show;
    update public.live_odo_session_state set
      direction_mode = case when v_odo_can_resume then 'autopilot' else 'manual' end,
      autopilot_state = case when v_odo_can_resume then 'recovering' else 'paused_by_policy' end,
      lease_owner = null, lease_expires_at = null, lease_heartbeat_at = null,
      pause_reason_code = case when v_odo_can_resume then null
        when v_odo_state = 'paused_by_policy' then pause_reason_code
        else 'studio_controller_expired' end,
      state_version = state_version + 1
    where session_id = v_show.session_id;
    insert into public.live_program_command_events(
      session_id, command_id, command_type, source, actor_user_id,
      controller_instance_id, expected_controller_generation,
      resulting_controller_generation, expected_program_version,
      resulting_program_version, status, reason_code
    ) values (
      v_show.session_id, v_command_id, 'FALLBACK', 'system', null,
      null, v_show.controller_generation - 1, v_show.controller_generation,
      v_show.program_version, v_show.program_version, 'applied',
      'studio_controller_expired'
    );
    v_recovered := v_recovered + 1;
  end loop;

  for v_show in
    select show_session.* from public.live_odo_show_sessions show_session
    where exists (
      select 1 from jsonb_each_text(show_session.source_assignments) assignment
      join public.live_program_sources source
        on source.session_id = show_session.session_id
        and source.source_key = assignment.value
      where source.readiness in ('ended','failed') or source.health = 'lost'
    )
    for update of show_session skip locked
    limit greatest(1, least(coalesce(p_limit, 25), 100))
  loop
    v_command_id := gen_random_uuid();
    if exists (
      select 1 from jsonb_each_text(v_show.source_assignments) assignment
      join public.live_program_sources source
        on source.session_id = v_show.session_id
        and source.source_key = assignment.value
      where (source.readiness in ('ended','failed') or source.health = 'lost')
        and source.source_role = 'visual'
    ) then
      v_fallback := public.live_program_safe_fallback_v1(
        v_show.session_id, v_show.fallback_scene
      );
      update public.live_odo_show_sessions set
        previous_program_state = jsonb_build_object(
          'scene', current_scene, 'targetCanvas', target_canvas,
          'sourceAssignments', source_assignments, 'transition', program_transition,
          'programVersion', program_version
        ),
        current_scene = v_fallback ->> 'scene',
        source_assignments = v_fallback -> 'sourceAssignments',
        program_transition = 'cut',
        program_version = program_version + 1,
        last_reason_code = 'program_source_lost',
        version = version + 1
      where session_id = v_show.session_id
      returning * into v_show;
      v_fallbacks := v_fallbacks + 1;
    else
      update public.live_odo_show_sessions set
        previous_program_state = jsonb_build_object(
          'scene', current_scene, 'targetCanvas', target_canvas,
          'sourceAssignments', source_assignments, 'transition', program_transition,
          'programVersion', program_version
        ),
        source_assignments = (
          select coalesce(jsonb_object_agg(assignment.key, assignment.value), '{}'::jsonb)
          from jsonb_each_text(v_show.source_assignments) assignment
          left join public.live_program_sources source
            on source.session_id = v_show.session_id
            and source.source_key = assignment.value
          where source.id is null
            or (source.readiness not in ('ended','failed') and source.health <> 'lost')
        ),
        program_version = program_version + 1,
        last_reason_code = 'program_audio_source_lost',
        version = version + 1
      where session_id = v_show.session_id
      returning * into v_show;
    end if;
    insert into public.live_program_command_events(
      session_id, command_id, command_type, source, actor_user_id,
      controller_instance_id, resulting_controller_generation,
      expected_program_version, resulting_program_version, status, reason_code
    ) values (
      v_show.session_id, v_command_id, 'FALLBACK', 'system', null,
      null, v_show.controller_generation, v_show.program_version - 1,
      v_show.program_version, 'applied', v_show.last_reason_code
    );
  end loop;

  return jsonb_build_object(
    'maintained', true,
    'controllersRecovered', v_recovered,
    'sourcesMarkedLost', v_sources_lost,
    'fallbacksApplied', v_fallbacks,
    'serverNow', v_now
  );
end;
$$;

revoke all on function public.rpc_service_maintain_live_studio_program_v1(integer)
from public, anon, authenticated;
grant execute on function public.rpc_service_maintain_live_studio_program_v1(integer)
to service_role;

comment on function public.live_program_safe_fallback_v1(uuid, text) is
  'Selects a healthy Host source when possible, otherwise a deterministic pool or branded fallback.';
comment on function public.rpc_service_maintain_live_studio_program_v1(integer) is
  'Service-only Studio lease/source recovery tolerant of browser background throttling and policy pauses.';

commit;
