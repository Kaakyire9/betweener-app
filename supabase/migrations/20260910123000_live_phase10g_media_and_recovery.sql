-- Betweener Live Phase 10G.4-10G.11: scoped browser media admission and
-- deterministic recovery from a lost Studio controller or Program source.

begin;

create or replace function public.rpc_get_live_studio_media_admission_v1(
  p_session_id uuid,
  p_controller_instance_id uuid,
  p_source_kind text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  v_session public.live_sessions;
  v_config public.live_odo_configuration;
  v_provider_user_id text;
  v_can_screen_share boolean := false;
  v_can_screen_audio boolean := false;
begin
  if auth.uid() is null
    or not public.live_studio_is_authorized_v1(p_session_id, auth.uid(), 'publish') then
    raise exception 'live_studio_media_forbidden' using errcode = '42501';
  end if;
  if p_controller_instance_id is null
    or p_source_kind not in (
      'studio_host','host_camera','host_microphone','screen_share','dj_audio'
    ) then
    raise exception 'live_studio_media_invalid' using errcode = '22023';
  end if;
  if p_source_kind = 'screen_share'
    and not public.live_studio_is_authorized_v1(
      p_session_id, auth.uid(), 'screen_share'
    ) then
    raise exception 'live_studio_screen_share_forbidden' using errcode = '42501';
  end if;
  if p_source_kind = 'dj_audio'
    and not public.live_studio_is_authorized_v1(
      p_session_id, auth.uid(), 'external_audio'
    ) then
    raise exception 'live_studio_external_audio_forbidden' using errcode = '42501';
  end if;
  select * into v_session from public.live_sessions where id = p_session_id;
  select * into v_config from public.live_odo_configuration where id = true;
  if v_session.id is null or v_session.status not in ('backstage','live','ending')
    or v_session.provider <> 'stream' then
    raise exception 'live_studio_media_session_unavailable' using errcode = '42501';
  end if;
  v_provider_user_id := 'studio-' || replace(auth.uid()::text, '-', '')
    || '-' || left(replace(p_controller_instance_id::text, '-', ''), 8)
    || '-' || replace(p_source_kind, '_', '-');
  v_can_screen_share := p_source_kind in ('studio_host','screen_share')
    and v_config.screen_share_enabled
    and public.live_studio_is_authorized_v1(p_session_id, auth.uid(), 'screen_share');
  v_can_screen_audio := v_can_screen_share and v_config.studio_screen_audio_enabled;
  return jsonb_build_object(
    'schemaVersion', 1,
    'sessionId', v_session.id,
    'userId', auth.uid(),
    'providerUserId', v_provider_user_id,
    'provider', v_session.provider,
    'providerCallType', v_session.provider_call_type,
    'providerCallId', v_session.provider_call_id,
    'maximumParticipants', v_session.maximum_participants,
    'sourceKind', p_source_kind,
    'canSendAudio', p_source_kind in ('studio_host','host_microphone','dj_audio'),
    'canSendVideo', p_source_kind in ('studio_host','host_camera'),
    'canScreenShare', v_can_screen_share,
    'canScreenShareAudio', v_can_screen_audio
  );
end;
$$;

revoke all on function public.rpc_get_live_studio_media_admission_v1(uuid, uuid, text)
from public, anon;
grant execute on function public.rpc_get_live_studio_media_admission_v1(uuid, uuid, text)
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
      and source.last_seen_at < v_now - interval '45 seconds'
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
    v_command_id := gen_random_uuid();
    v_command_id := gen_random_uuid();
    update public.live_odo_show_sessions set
      control_source = case when enabled and v_config.odo_enabled
        and not v_config.circuit_breaker_open then 'odo' else 'system' end,
      control_user_id = null,
      controller_instance_id = null,
      controller_generation = controller_generation + 1,
      control_lease_expires_at = null,
      controller_acquired_at = null,
      program_source = 'system',
      paused_by_host = false,
      show_state = 'recovering',
      next_wake_at = case when enabled and v_config.odo_enabled
        and not v_config.circuit_breaker_open then v_now else null end,
      last_reason_code = 'studio_controller_expired',
      version = version + 1
    where session_id = v_show.session_id
    returning * into v_show;
    update public.live_odo_session_state set
      direction_mode = case when v_show.control_source = 'odo'
        then 'autopilot' else 'manual' end,
      autopilot_state = case when v_show.control_source = 'odo'
        then 'recovering' else 'paused_by_policy' end,
      lease_owner = null, lease_expires_at = null, lease_heartbeat_at = null,
      pause_reason_code = case when v_show.control_source = 'odo'
        then null else 'studio_controller_expired' end,
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
      last_reason_code = 'program_source_lost',
      version = version + 1
    where session_id = v_show.session_id
    returning * into v_show;
    insert into public.live_program_command_events(
      session_id, command_id, command_type, source, actor_user_id,
      controller_instance_id, resulting_controller_generation,
      expected_program_version, resulting_program_version, status, reason_code
    ) values (
      v_show.session_id, v_command_id, 'FALLBACK', 'system', null,
      null, v_show.controller_generation, v_show.program_version - 1,
      v_show.program_version, 'applied', 'program_source_lost'
    );
    v_fallbacks := v_fallbacks + 1;
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

commit;
