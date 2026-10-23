-- Betweener Live Phase 10G: host-controlled Music Intermission presentation.
-- Audio remains the single central Stream publisher; this migration controls
-- only the audience-safe visual scene and its deterministic restoration.

begin;

alter table public.live_odo_show_sessions
  add column if not exists music_stage_return_state jsonb not null default '{}'::jsonb;

alter table public.live_odo_show_sessions
  add constraint live_music_stage_return_state_valid check (
    jsonb_typeof(music_stage_return_state) = 'object'
    and octet_length(music_stage_return_state::text) <= 4096
  );

alter table public.live_program_command_events
  drop constraint if exists live_program_command_events_command_type_check;
alter table public.live_program_command_events
  add constraint live_program_command_events_command_type_check check (command_type in (
    'TAKE_CONTROL','RENEW_CONTROL','RELEASE_CONTROL','RESUME_ODO',
    'TAKE','CUT','REGISTER_SOURCE','UPDATE_SOURCE','END_SOURCE','FALLBACK',
    'SHOW_MUSIC','RESTORE_STAGE'
  ));

create or replace function public.live_program_restore_music_stage_v1(
  p_session_id uuid,
  p_source text,
  p_actor_user_id uuid,
  p_reason text,
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
  v_show public.live_odo_show_sessions;
  v_return jsonb;
  v_scene text;
  v_target_canvas text;
  v_transition text;
  v_fallback text;
  v_assignments jsonb;
  v_show_state text;
  v_energy text;
  v_control_source text;
  v_control_user_id uuid;
  v_program_source text;
  v_paused boolean;
  v_priority integer;
  v_previous_generation bigint;
  v_previous_program_version bigint;
begin
  if p_session_id is null or p_command_id is null
    or p_source not in ('mobile_host','system')
    or p_reason is null or p_reason !~ '^[a-z][a-z0-9_]{0,119}$' then
    raise exception 'live_music_stage_restore_invalid' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(
    'live_music_stage:' || p_session_id::text, 0
  ));
  select * into v_show from public.live_odo_show_sessions
  where session_id = p_session_id for update;
  if v_show.session_id is null or v_show.current_scene <> 'music_intermission' then
    return jsonb_build_object(
      'changed', true, 'visible', false, 'reasonCode', 'music_stage_already_hidden'
    );
  end if;

  v_return := v_show.music_stage_return_state;
  v_previous_generation := v_show.controller_generation;
  v_previous_program_version := v_show.program_version;
  v_scene := v_return ->> 'scene';
  if v_scene is null or v_scene not in (
    'host_focus','host_plus_pool','pool_focus','pair_forming',
    'quick_connect_active','audience_pulse','conversation_topic','odo_stage',
    'branded_intermission','session_closing'
  ) then v_scene := 'host_focus'; end if;
  v_target_canvas := v_return ->> 'targetCanvas';
  if v_target_canvas is null
    or v_target_canvas not in ('portrait_9_16','landscape_16_9','square_1_1') then
    v_target_canvas := 'portrait_9_16';
  end if;
  v_transition := v_return ->> 'transition';
  if v_transition is null or v_transition not in ('cut','auto','fade') then
    v_transition := 'auto';
  end if;
  v_fallback := v_return ->> 'fallbackScene';
  if v_fallback is null or v_fallback not in (
    'host_focus','host_plus_pool','pool_focus','pair_forming',
    'quick_connect_active','audience_pulse','conversation_topic','odo_stage',
    'music_intermission','branded_intermission','session_closing'
  ) then v_fallback := 'host_focus'; end if;
  v_assignments := coalesce(v_return -> 'sourceAssignments', '{}'::jsonb);
  if jsonb_typeof(v_assignments) <> 'object'
    or octet_length(v_assignments::text) > 2048 then
    v_assignments := '{}'::jsonb;
  end if;
  v_show_state := v_return ->> 'showState';
  if v_show_state is null or v_show_state not in (
    'opening','host_focus','host_plus_pool','pool_focus','pair_forming',
    'pair_active','post_pair','audience_pulse','conversation_topic','odo_stage',
    'music_intermission','low_liquidity','draining','closing',
    'paused_by_host','paused_by_policy','recovering'
  ) then
    v_show_state := case v_scene
      when 'quick_connect_active' then 'pair_active'
      when 'branded_intermission' then 'music_intermission'
      when 'session_closing' then 'closing'
      else v_scene end;
  end if;
  v_energy := v_return ->> 'energyMode';
  if v_energy is null
    or v_energy not in ('calm','social','energize','reflective','closing') then
    v_energy := 'calm';
  end if;
  v_control_source := v_return ->> 'controlSource';
  if v_control_source is null or v_control_source not in ('odo','mobile_host','system') then
    v_control_source := 'mobile_host';
  end if;
  if v_control_source = 'mobile_host' then
    v_control_user_id := coalesce(
      nullif(v_return ->> 'controlUserId', '')::uuid,
      nullif(v_return ->> 'musicStageHostUserId', '')::uuid,
      p_actor_user_id
    );
    if v_control_user_id is null then v_control_source := 'system'; end if;
  end if;
  v_program_source := v_return ->> 'programSource';
  if v_program_source is null or v_program_source not in ('mobile','system') then
    v_program_source := 'mobile';
  end if;
  v_paused := coalesce((v_return ->> 'pausedByHost')::boolean, false);
  if v_control_source in ('odo','system') then
    v_control_user_id := null;
    v_paused := false;
  end if;
  v_priority := greatest(0, least(100,
    coalesce((v_return ->> 'currentPriority')::integer, 10)
  ));

  update public.live_odo_show_sessions set
    previous_program_state = jsonb_build_object(
      'scene', current_scene,
      'targetCanvas', target_canvas,
      'sourceAssignments', source_assignments,
      'transition', program_transition,
      'programVersion', program_version
    ),
    current_scene = v_scene,
    target_canvas = v_target_canvas,
    source_assignments = v_assignments,
    program_transition = v_transition,
    fallback_scene = v_fallback,
    show_state = v_show_state,
    energy_mode = v_energy,
    program_source = v_program_source,
    control_source = v_control_source,
    control_user_id = v_control_user_id,
    controller_instance_id = null,
    control_lease_expires_at = null,
    controller_acquired_at = null,
    paused_by_host = v_paused,
    host_suppression_ends_at = case when v_paused then null else v_now end,
    next_wake_at = case when v_paused then null else v_now end,
    current_priority = v_priority,
    scene_entered_at = v_now,
    last_reason_code = p_reason,
    music_stage_return_state = '{}'::jsonb,
    scene_history = case when jsonb_array_length(scene_history) >= 12
      then (scene_history - 0) || jsonb_build_array(jsonb_build_object(
        'scene', v_scene, 'source', p_source, 'reason', p_reason, 'at', v_now
      ))
      else scene_history || jsonb_build_array(jsonb_build_object(
        'scene', v_scene, 'source', p_source, 'reason', p_reason, 'at', v_now
      )) end,
    program_version = program_version + 1,
    version = version + 1
  where session_id = p_session_id returning * into v_show;

  update public.live_odo_session_state set
    current_scene = v_scene,
    state_version = state_version + 1
  where session_id = p_session_id;

  insert into public.live_program_command_events(
    session_id, command_id, command_type, source, actor_user_id,
    expected_controller_generation, resulting_controller_generation,
    expected_program_version, resulting_program_version, status, reason_code
  ) values (
    p_session_id, p_command_id, 'RESTORE_STAGE', p_source, p_actor_user_id,
    v_previous_generation, v_show.controller_generation,
    v_previous_program_version, v_show.program_version,
    'applied', p_reason
  ) on conflict (command_id) do nothing;

  return jsonb_build_object(
    'changed', true,
    'visible', false,
    'scene', v_show.current_scene,
    'stateVersion', v_show.version,
    'programVersion', v_show.program_version,
    'reasonCode', p_reason
  );
end;
$$;

revoke all on function public.live_program_restore_music_stage_v1(
  uuid, text, uuid, text, uuid
) from public, anon, authenticated, service_role;

create or replace function public.rpc_host_set_live_music_stage_v1(
  p_session_id uuid,
  p_visible boolean,
  p_expected_version bigint,
  p_request_id uuid default gen_random_uuid()
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
  v_music public.live_music_session_state;
  v_configuration public.live_odo_configuration;
  v_session public.live_sessions;
  v_previous_generation bigint;
  v_previous_program_version bigint;
begin
  if auth.uid() is null
    or not public.live_odo_show_host_allowed_v1(p_session_id, auth.uid()) then
    raise exception 'live_music_stage_forbidden' using errcode = '42501';
  end if;
  if p_session_id is null or p_visible is null or p_expected_version is null
    or p_expected_version < 1 or p_request_id is null then
    raise exception 'live_music_stage_invalid' using errcode = '22023';
  end if;
  if exists (select 1 from public.live_program_command_events
      where command_id = p_request_id) then
    return jsonb_build_object(
      'changed', true, 'visible', p_visible, 'reasonCode', 'idempotent_replay'
    );
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    'live_music_stage:' || p_session_id::text, 0
  ));
  select * into v_show from public.live_odo_show_sessions
  where session_id = p_session_id for update;
  select * into v_music from public.live_music_session_state
  where session_id = p_session_id;
  select * into v_configuration from public.live_odo_configuration where id = true;
  select * into v_session from public.live_sessions where id = p_session_id;

  if v_show.session_id is null or v_session.id is null then
    return jsonb_build_object(
      'changed', false, 'reasonCode', 'live_music_stage_session_not_found'
    );
  elsif v_show.version <> p_expected_version then
    return jsonb_build_object('changed', false, 'reasonCode', 'stale_show_version');
  elsif v_show.control_source = 'studio_host'
    and v_show.control_lease_expires_at > v_now then
    return jsonb_build_object('changed', false, 'reasonCode', 'studio_control_active');
  elsif not p_visible then
    return public.live_program_restore_music_stage_v1(
      p_session_id, 'mobile_host', auth.uid(), 'host_restored_stage', p_request_id
    );
  elsif v_session.status <> 'live' then
    return jsonb_build_object('changed', false, 'reasonCode', 'live_session_not_live');
  elsif not coalesce(v_configuration.music_enabled, false)
    or not coalesce(v_configuration.program_audio_publisher_enabled, false) then
    return jsonb_build_object('changed', false, 'reasonCode', 'music_disabled');
  elsif v_music.track_id is null
    or v_music.status not in ('playing','paused','ducked','fading') then
    return jsonb_build_object('changed', false, 'reasonCode', 'active_music_required');
  elsif v_show.current_scene = 'music_intermission' then
    return jsonb_build_object(
      'changed', true, 'visible', true, 'reasonCode', 'music_stage_already_visible'
    );
  end if;

  v_previous_generation := v_show.controller_generation;
  v_previous_program_version := v_show.program_version;

  update public.live_odo_show_sessions set
    music_stage_return_state = jsonb_build_object(
      'scene', current_scene,
      'targetCanvas', target_canvas,
      'sourceAssignments', source_assignments,
      'transition', program_transition,
      'fallbackScene', fallback_scene,
      'showState', show_state,
      'energyMode', energy_mode,
      'programSource', program_source,
      'controlSource', case when control_source = 'studio_host'
        then 'mobile_host' else control_source end,
      'controlUserId', case when control_source = 'mobile_host'
        then control_user_id else null end,
      'musicStageHostUserId', auth.uid(),
      'pausedByHost', paused_by_host,
      'currentPriority', current_priority
    ),
    previous_program_state = jsonb_build_object(
      'scene', current_scene,
      'targetCanvas', target_canvas,
      'sourceAssignments', source_assignments,
      'transition', program_transition,
      'programVersion', program_version
    ),
    current_scene = 'music_intermission',
    target_canvas = 'portrait_9_16',
    source_assignments = jsonb_build_object(
      'odo', 'server.odo',
      'audio_atmosphere', 'system:programme_audio'
    ),
    program_transition = 'fade',
    program_source = 'mobile',
    control_source = 'mobile_host',
    control_user_id = auth.uid(),
    controller_instance_id = null,
    control_lease_expires_at = null,
    controller_acquired_at = null,
    paused_by_host = true,
    show_state = 'paused_by_host',
    next_wake_at = null,
    host_suppression_ends_at = null,
    current_priority = 95,
    scene_entered_at = v_now,
    last_reason_code = 'host_showed_music_stage',
    scene_history = case when jsonb_array_length(scene_history) >= 12
      then (scene_history - 0) || jsonb_build_array(jsonb_build_object(
        'scene', 'music_intermission', 'source', 'mobile_host',
        'reason', 'host_showed_music_stage', 'at', v_now
      ))
      else scene_history || jsonb_build_array(jsonb_build_object(
        'scene', 'music_intermission', 'source', 'mobile_host',
        'reason', 'host_showed_music_stage', 'at', v_now
      )) end,
    program_version = program_version + 1,
    version = version + 1
  where session_id = p_session_id returning * into v_show;

  update public.live_odo_session_state set
    current_scene = 'music_intermission',
    state_version = state_version + 1
  where session_id = p_session_id;

  insert into public.live_program_command_events(
    session_id, command_id, command_type, source, actor_user_id,
    expected_controller_generation, resulting_controller_generation,
    expected_program_version, resulting_program_version, status, reason_code
  ) values (
    p_session_id, p_request_id, 'SHOW_MUSIC', 'mobile_host', auth.uid(),
    v_previous_generation, v_show.controller_generation,
    v_previous_program_version, v_show.program_version,
    'applied', 'host_showed_music_stage'
  );

  return jsonb_build_object(
    'changed', true,
    'visible', true,
    'scene', v_show.current_scene,
    'stateVersion', v_show.version,
    'programVersion', v_show.program_version,
    'reasonCode', 'host_showed_music_stage'
  );
end;
$$;

revoke all on function public.rpc_host_set_live_music_stage_v1(
  uuid, boolean, bigint, uuid
) from public, anon;
grant execute on function public.rpc_host_set_live_music_stage_v1(
  uuid, boolean, bigint, uuid
) to authenticated, service_role;

create or replace function public.live_program_restore_music_stage_on_stop_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
begin
  if new.status = 'stopped' and new.track_id is null
    and (old.status is distinct from new.status or old.track_id is distinct from new.track_id)
    and exists (
      select 1 from public.live_odo_show_sessions show_session
      where show_session.session_id = new.session_id
        and show_session.current_scene = 'music_intermission'
        and show_session.music_stage_return_state <> '{}'::jsonb
    ) then
    perform public.live_program_restore_music_stage_v1(
      new.session_id,
      'system',
      null,
      'music_stage_audio_stopped',
      gen_random_uuid()
    );
  end if;
  return new;
end;
$$;

revoke all on function public.live_program_restore_music_stage_on_stop_v1()
from public, anon, authenticated, service_role;

drop trigger if exists live_music_restore_stage_on_stop
on public.live_music_session_state;
create trigger live_music_restore_stage_on_stop
after update of status, track_id on public.live_music_session_state
for each row execute function public.live_program_restore_music_stage_on_stop_v1();

commit;
