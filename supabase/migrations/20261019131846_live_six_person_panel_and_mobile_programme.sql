-- Six-person public panels and the native producer programme companion.
-- Four remains the default. Six is an explicit, AAL2-gated per-Live choice
-- behind a rollout flag; Quick Connect remains a two-person format.

begin;

alter table public.live_odo_configuration
  add column if not exists large_panel_enabled boolean not null default false;

alter table public.live_odo_show_sessions
  drop constraint if exists live_odo_show_sessions_current_scene_check,
  drop constraint if exists live_odo_show_source_assignments_check;

alter table public.live_odo_show_sessions
  add constraint live_odo_show_sessions_current_scene_check check (current_scene in (
    'host_focus','panel_focus','host_plus_pool','pool_focus','pair_forming',
    'quick_connect_active','audience_pulse','conversation_topic','odo_stage',
    'music_intermission','branded_intermission','session_closing',
    'screen_full','screen_plus_host','screen_plus_pair','screen_plus_panel',
    'screen_discussion','screen_plus_pool','screen_plus_audience_pulse',
    'screen_plus_odo','dj_plus_pool'
  )),
  add constraint live_odo_show_source_assignments_check check (
    jsonb_typeof(source_assignments) = 'object'
    and jsonb_array_length(jsonb_path_query_array(source_assignments, '$.*')) <= 15
    and octet_length(source_assignments::text) <= 3072
  );

create or replace function public.live_odo_sync_program_output_source_v1()
returns trigger
language plpgsql
set search_path = public, pg_catalog
as $$
begin
  if new.control_source in ('odo','system') then
    new.control_user_id := null;
    new.controller_instance_id := null;
    new.control_lease_expires_at := null;
    new.controller_acquired_at := null;
  elsif new.control_source = 'mobile_host' then
    new.controller_instance_id := null;
    new.controller_acquired_at := null;
  end if;
  if tg_op = 'INSERT' or new.current_scene is distinct from old.current_scene
    or new.program_output_source is null then
    new.program_output_source := case
      when new.current_scene like 'screen_%' then 'screen_share'
      when new.current_scene in ('host_focus','panel_focus') then 'host_camera'
      when new.current_scene in ('host_plus_pool','pool_focus','pair_forming','dj_plus_pool')
        then 'quick_connect_pool'
      when new.current_scene = 'quick_connect_active' then 'active_pair'
      when new.current_scene = 'audience_pulse' then 'audience_pulse'
      when new.current_scene = 'odo_stage' then 'odo_stage'
      else 'branded_visual'
    end;
  end if;
  if tg_op = 'UPDATE' and (
    new.current_scene is distinct from old.current_scene
    or new.target_canvas is distinct from old.target_canvas
    or new.program_transition is distinct from old.program_transition
    or new.source_assignments is distinct from old.source_assignments
  ) and new.program_version = old.program_version then
    new.program_version := old.program_version + 1;
  end if;
  if tg_op = 'UPDATE' and (
    new.control_source is distinct from old.control_source
    or new.control_user_id is distinct from old.control_user_id
    or new.controller_instance_id is distinct from old.controller_instance_id
  ) and new.controller_generation = old.controller_generation then
    new.controller_generation := old.controller_generation + 1;
  end if;
  return new;
end;
$$;

revoke all on function public.live_odo_sync_program_output_source_v1()
from public, anon, authenticated, service_role;

alter table public.live_sessions
  drop constraint if exists live_sessions_capacity_valid,
  drop constraint if exists live_sessions_stage_request_capacity_valid;

alter table public.live_sessions
  add constraint live_sessions_capacity_valid check (
    minimum_participants between 1 and 100
    and maximum_participants between minimum_participants and 100
    and maximum_publishers between 1 and 6
    and maximum_publishers <= maximum_participants
  ),
  add constraint live_sessions_stage_request_capacity_valid check (
    stage_request_capacity between 0 and least(5, greatest(maximum_publishers - 1, 0))
  );

comment on column public.live_sessions.maximum_publishers is
  'Public human stage publishers only. Standard Lives use four; explicitly enabled large panels use six. Studio visual transports and Odo do not consume these seats.';

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
    'host_focus','panel_focus','host_plus_pool','pool_focus','pair_forming',
    'quick_connect_active','audience_pulse','conversation_topic','odo_stage',
    'music_intermission','branded_intermission','session_closing',
    'screen_full','screen_plus_host','screen_plus_pair','screen_plus_panel',
    'screen_discussion','screen_plus_pool','screen_plus_audience_pulse',
    'screen_plus_odo','dj_plus_pool'
  ) or jsonb_typeof(p_assignments) <> 'object'
    or jsonb_array_length(jsonb_path_query_array(p_assignments, '$.*')) > 15
    or octet_length(p_assignments::text) > 3072 then
    return 'program_assignment_invalid';
  end if;

  if (select count(*) from jsonb_object_keys(p_assignments) assignment(slot)
      where slot in (
        'primary','host','guest_1','guest_2','guest_3','guest_4','guest_5',
        'pair','pool','pulse','odo','pip'
      )) > 7
    or (select count(*) from jsonb_object_keys(p_assignments) assignment(slot)
      where slot in ('host','guest_1','guest_2','guest_3','guest_4','guest_5')) > 6 then
    return 'program_visual_capacity_exceeded';
  end if;

  for v_slot, v_source_key in select key, value from jsonb_each_text(p_assignments)
  loop
    if v_slot not in (
      'primary','host','guest_1','guest_2','guest_3','guest_4','guest_5',
      'pair','pool','pulse','odo','pip','audio_host','audio_screen','audio_atmosphere'
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
    when 'host_focus' then array['host']
    when 'panel_focus' then array['host']
    when 'host_plus_pool' then array['host','pool']
    when 'pool_focus' then array['pool']
    when 'pair_forming' then array['pool']
    when 'quick_connect_active' then array['pair']
    when 'audience_pulse' then array['pulse']
    when 'conversation_topic' then array['odo']
    when 'odo_stage' then array['odo']
    when 'music_intermission' then array['odo']
    when 'branded_intermission' then array['odo']
    when 'session_closing' then array['odo']
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
  return null;
end;
$$;

revoke all on function public.live_program_assignment_error_v1(uuid, text, jsonb)
from public, anon, authenticated, service_role;

create or replace function public.rpc_get_live_mobile_programme_access_v1(p_session_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
  select jsonb_build_object(
    'canControl', auth.uid() is not null and public.live_studio_is_authorized_v1(
      p_session_id, auth.uid(), 'control'
    ),
    'canConfigureLargePanel', session.format <> 'quick_connect'
      and auth.uid() is not null and (
      public.is_admin_user(auth.uid())
      or public.has_live_capability(p_session_id, 'live.manage_stage', auth.uid())
    ),
    'largePanelEnabled', coalesce(configuration.large_panel_enabled, false),
    'maximumPublishers', session.maximum_publishers
  )
  from public.live_sessions session
  cross join public.live_odo_configuration configuration
  where session.id = p_session_id and configuration.id = true
    and public.can_view_live_session(p_session_id, auth.uid());
$$;

revoke all on function public.rpc_get_live_mobile_programme_access_v1(uuid)
from public, anon;
grant execute on function public.rpc_get_live_mobile_programme_access_v1(uuid)
to authenticated, service_role;

create or replace function public.rpc_set_live_panel_capacity_v1(
  p_session_id uuid,
  p_maximum_publishers integer
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  v_session public.live_sessions;
  v_configuration public.live_odo_configuration;
  v_occupied integer;
begin
  if auth.uid() is null or not public.live_studio_has_aal2_v1() then
    raise exception 'live_studio_step_up_required' using errcode = '42501';
  end if;
  if not (public.is_admin_user(auth.uid())
    or public.has_live_capability(p_session_id, 'live.manage_stage')) then
    raise exception 'live_stage_manage_forbidden' using errcode = '42501';
  end if;
  if p_maximum_publishers not in (4, 6) then
    raise exception 'live_panel_capacity_invalid' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('live_stage:' || p_session_id::text, 0));
  select * into v_session from public.live_sessions where id = p_session_id for update;
  select * into v_configuration from public.live_odo_configuration where id = true;
  if v_session.id is null then
    raise exception 'live_session_not_found' using errcode = 'P0002';
  end if;
  if v_session.status in ('ended','cancelled') then
    raise exception 'live_panel_capacity_closed' using errcode = '55000';
  end if;
  if v_session.format = 'quick_connect' then
    raise exception 'live_large_panel_unavailable' using errcode = '42501';
  end if;
  if p_maximum_publishers = 6
    and not coalesce(v_configuration.large_panel_enabled, false) then
    raise exception 'live_large_panel_unavailable' using errcode = '42501';
  end if;
  select count(distinct participant.user_id)::integer into v_occupied
  from public.live_participants participant
  where participant.session_id = p_session_id
    and participant.state in ('backstage','on_stage')
    and participant.role <> 'audience';
  if v_occupied > p_maximum_publishers then
    raise exception 'live_panel_capacity_below_occupied' using errcode = '55000';
  end if;
  if v_session.maximum_publishers <> p_maximum_publishers then
    update public.live_sessions set
      maximum_publishers = p_maximum_publishers,
      stage_request_capacity = least(stage_request_capacity, p_maximum_publishers - 1),
      version = version + 1,
      updated_at = timezone('utc', now())
    where id = p_session_id returning * into v_session;
    insert into public.live_session_events(session_id, actor_user_id, event_type, metadata)
    values (p_session_id, auth.uid(), 'stage_capacity_changed', jsonb_build_object(
      'maximumPublishers', p_maximum_publishers,
      'largePanel', p_maximum_publishers = 6
    ));
    insert into public.live_session_structure_updates as current_update(
      session_id, version, reason, updated_at
    ) values (p_session_id, 1, 'stage_capacity', timezone('utc', now()))
    on conflict (session_id) do update set
      version = current_update.version + 1,
      reason = excluded.reason,
      updated_at = excluded.updated_at;
  end if;
  return jsonb_build_object(
    'maximumPublishers', v_session.maximum_publishers,
    'largePanelEnabled', coalesce(v_configuration.large_panel_enabled, false)
  );
end;
$$;

revoke all on function public.rpc_set_live_panel_capacity_v1(uuid, integer)
from public, anon;
grant execute on function public.rpc_set_live_panel_capacity_v1(uuid, integer)
to authenticated, service_role;

create or replace function public.rpc_mobile_take_live_program_v1(
  p_session_id uuid,
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
  if auth.uid() is null or not public.live_studio_has_aal2_v1() then
    raise exception 'live_studio_step_up_required' using errcode = '42501';
  end if;
  if not public.live_studio_is_authorized_v1(p_session_id, auth.uid(), 'control') then
    raise exception 'live_studio_program_forbidden' using errcode = '42501';
  end if;
  if p_command_id is null or p_expected_program_version is null
    or p_expected_program_version < 1
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
  if v_show.control_source = 'studio_host'
    and v_show.control_lease_expires_at > v_now
    and v_show.control_user_id <> auth.uid() then
    return public.live_program_command_result_v1(false, 'studio_controller_active', p_session_id);
  end if;
  if v_show.program_version <> p_expected_program_version then
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
    program_source = 'mobile',
    control_source = 'mobile_host',
    control_user_id = auth.uid(),
    controller_instance_id = null,
    control_lease_expires_at = v_now + interval '30 seconds',
    paused_by_host = true,
    show_state = 'paused_by_host',
    scene_entered_at = v_now,
    host_suppression_ends_at = null,
    current_priority = 95,
    last_reason_code = case when p_transition = 'cut'
      then 'mobile_program_cut' else 'mobile_program_take' end,
    last_program_command_id = p_command_id,
    program_version = program_version + 1,
    version = version + 1
  where session_id = p_session_id returning * into v_show;
  insert into public.live_program_command_events(
    session_id, command_id, command_type, source, actor_user_id,
    expected_controller_generation, resulting_controller_generation,
    expected_program_version, resulting_program_version, status, reason_code
  ) values (
    p_session_id, p_command_id,
    case when p_transition = 'cut' then 'CUT' else 'TAKE' end,
    'mobile_host', auth.uid(), v_show.controller_generation,
    v_show.controller_generation, p_expected_program_version,
    v_show.program_version, 'applied',
    case when p_transition = 'cut' then 'mobile_program_cut' else 'mobile_program_take' end
  );
  return public.live_program_command_result_v1(true,
    case when p_transition = 'cut' then 'mobile_program_cut' else 'mobile_program_take' end,
    p_session_id);
end;
$$;

revoke all on function public.rpc_mobile_take_live_program_v1(
  uuid, bigint, uuid, text, text, jsonb, text
) from public, anon;
grant execute on function public.rpc_mobile_take_live_program_v1(
  uuid, bigint, uuid, text, text, jsonb, text
) to authenticated, service_role;

create or replace function public.rpc_set_live_stage_participant(
  p_session_id uuid,
  p_target_user_id uuid,
  p_on_stage boolean
)
returns public.live_participants
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  v_session public.live_sessions;
  v_participant public.live_participants;
  v_slot integer;
  v_publishers integer;
begin
  if not public.has_live_capability(p_session_id, 'live.manage_stage') then
    raise exception 'live_stage_manage_forbidden' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('live_stage:' || p_session_id::text, 0));
  select * into v_session from public.live_sessions where id = p_session_id for update;
  select * into v_participant from public.live_participants
  where session_id = p_session_id and user_id = p_target_user_id for update;
  if v_session.id is null or v_participant.id is null then
    raise exception 'live_stage_target_not_found' using errcode = 'P0002';
  end if;
  if p_target_user_id = v_session.created_by_user_id and not p_on_stage then
    raise exception 'live_host_cannot_be_demoted' using errcode = '22023';
  end if;
  if p_on_stage then
    if v_session.status not in ('backstage','live')
      or v_participant.state not in (
        'backstage','audience','stage_requested','temporarily_disconnected','on_stage'
      ) then
      raise exception 'live_stage_promotion_invalid' using errcode = '22023';
    end if;
    if v_participant.state = 'on_stage' then return v_participant; end if;
    select count(distinct participant.user_id)::integer into v_publishers
    from public.live_participants participant
    where participant.session_id = p_session_id
      and (participant.state = 'on_stage' or participant.role = 'host')
      and participant.state not in ('left','removed','banned');
    if v_publishers >= least(v_session.maximum_publishers, 6) then
      raise exception 'live_stage_capacity_reached' using errcode = '23514';
    end if;
    select slots.slot into v_slot
    from generate_series(1, least(v_session.maximum_publishers, 6)) slots(slot)
    where not exists (
      select 1 from public.live_participants occupied
      where occupied.session_id = p_session_id and occupied.stage_slot = slots.slot
    ) order by slots.slot limit 1;
    if v_slot is null then
      raise exception 'live_stage_capacity_reached' using errcode = '23514';
    end if;
    update public.live_participants set
      state = 'on_stage', stage_slot = v_slot,
      stage_joined_at = timezone('utc', now()), stage_left_at = null,
      microphone_muted_by_moderator = false
    where id = v_participant.id returning * into v_participant;
    insert into public.live_session_capability_assignments(
      session_id, user_id, capability, effect, assigned_by_user_id
    ) values (p_session_id, p_target_user_id, 'live.publish', 'grant', auth.uid())
    on conflict(session_id, user_id, capability) do update set
      effect = 'grant', assigned_by_user_id = excluded.assigned_by_user_id,
      created_at = timezone('utc', now());
  else
    if v_participant.state <> 'on_stage' then return v_participant; end if;
    update public.live_participants set
      state = 'audience', stage_slot = null,
      stage_left_at = timezone('utc', now()), microphone_muted_by_moderator = false
    where id = v_participant.id returning * into v_participant;
    insert into public.live_session_capability_assignments(
      session_id, user_id, capability, effect, assigned_by_user_id
    ) values (p_session_id, p_target_user_id, 'live.publish', 'revoke', auth.uid())
    on conflict(session_id, user_id, capability) do update set
      effect = 'revoke', assigned_by_user_id = excluded.assigned_by_user_id,
      created_at = timezone('utc', now());
  end if;
  insert into public.live_session_events(session_id, actor_user_id, event_type, to_state, metadata)
  values (p_session_id, auth.uid(),
    case when p_on_stage then 'participant_promoted' else 'participant_demoted' end,
    v_participant.state,
    jsonb_build_object('targetUserId', p_target_user_id, 'stageSlot', v_participant.stage_slot));
  return v_participant;
end;
$$;

revoke all on function public.rpc_set_live_stage_participant(uuid, uuid, boolean)
from public, anon;
grant execute on function public.rpc_set_live_stage_participant(uuid, uuid, boolean)
to authenticated, service_role;

create or replace function public.rpc_set_live_stage_request_capacity(
  p_session_id uuid,
  p_capacity integer
)
returns public.live_sessions
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  v_session public.live_sessions;
  v_previous_capacity integer;
  v_occupied_guest_seats integer;
begin
  if auth.uid() is null or not public.has_live_capability(p_session_id, 'live.manage_stage') then
    raise exception 'live_stage_manage_forbidden' using errcode = '42501';
  end if;
  if p_capacity is null then
    raise exception 'live_stage_request_capacity_required' using errcode = '22023';
  end if;
  select * into v_session from public.live_sessions where id = p_session_id for update;
  if v_session.id is null then
    raise exception 'live_session_not_found' using errcode = 'P0002';
  end if;
  if v_session.status <> 'live' then
    raise exception 'live_stage_intake_unavailable' using errcode = '55000';
  end if;
  if p_capacity < 0 or p_capacity > least(5, greatest(v_session.maximum_publishers - 1, 0)) then
    raise exception 'live_stage_request_capacity_invalid' using errcode = '22023';
  end if;
  select count(distinct participant.user_id)::integer into v_occupied_guest_seats
  from public.live_participants participant
  where participant.session_id = p_session_id
    and participant.user_id <> v_session.created_by_user_id
    and participant.state in ('backstage','on_stage');
  if p_capacity < v_occupied_guest_seats then
    raise exception 'live_stage_capacity_below_occupied' using errcode = '55000';
  end if;
  if v_session.stage_request_capacity = p_capacity
    and v_session.stage_requests_open = (p_capacity > 0) then return v_session; end if;
  v_previous_capacity := v_session.stage_request_capacity;
  update public.live_sessions set
    stage_request_capacity = p_capacity,
    stage_requests_open = p_capacity > 0,
    version = version + 1,
    updated_at = timezone('utc', now())
  where id = p_session_id returning * into v_session;
  insert into public.live_session_events(session_id, actor_user_id, event_type, metadata)
  values (p_session_id, auth.uid(),
    case when p_capacity > 0 then 'stage_requests_opened' else 'stage_requests_closed' end,
    jsonb_build_object('previousCapacity', v_previous_capacity,
      'stageRequestCapacity', p_capacity, 'stageRequestsOpen', p_capacity > 0));
  return v_session;
end;
$$;

create or replace function public.rpc_set_live_stage_requests_open(
  p_session_id uuid,
  p_open boolean
)
returns public.live_sessions
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare v_capacity integer; v_result public.live_sessions;
begin
  if p_open is null then
    raise exception 'live_stage_intake_state_required' using errcode = '22023';
  end if;
  if p_open then
    select least(5, greatest(maximum_publishers - 1, 0)) into v_capacity
    from public.live_sessions where id = p_session_id;
    if v_capacity is null then
      raise exception 'live_session_not_found' using errcode = 'P0002';
    end if;
  else v_capacity := 0;
  end if;
  select * into v_result from public.rpc_set_live_stage_request_capacity(p_session_id, v_capacity);
  return v_result;
end;
$$;

revoke all on function public.rpc_set_live_stage_request_capacity(uuid, integer),
  public.rpc_set_live_stage_requests_open(uuid, boolean) from public, anon;
grant execute on function public.rpc_set_live_stage_request_capacity(uuid, integer),
  public.rpc_set_live_stage_requests_open(uuid, boolean) to authenticated, service_role;

create or replace function public.rpc_invite_live_stage_member_v1(
  p_session_id uuid,
  p_target_user_id uuid,
  p_invitation_id uuid
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
  v_participant public.live_participants;
  v_invitation public.live_stage_invitations;
  v_reserved integer;
begin
  if auth.uid() is null or not public.has_live_capability(p_session_id, 'live.manage_stage') then
    raise exception 'live_stage_invitation_forbidden' using errcode = '42501';
  end if;
  if p_invitation_id is null or p_target_user_id is null then
    raise exception 'live_stage_invitation_target_required' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('live_stage:' || p_session_id::text, 0));
  select * into v_session from public.live_sessions where id = p_session_id for update;
  if v_session.id is null then raise exception 'live_session_not_found' using errcode = 'P0002'; end if;
  if v_session.status <> 'live' then
    raise exception 'live_stage_invitation_unavailable' using errcode = '55000';
  end if;
  select * into v_participant from public.live_participants
  where session_id = p_session_id and user_id = p_target_user_id for update;
  if v_participant.id is null or v_participant.role = 'host'
    or v_participant.state <> 'audience' then
    raise exception 'live_stage_invitation_target_unavailable' using errcode = '55000';
  end if;
  update public.live_stage_invitations set status = 'expired', responded_at = v_now
  where session_id = p_session_id and status = 'pending' and expires_at <= v_now;
  select * into v_invitation from public.live_stage_invitations where id = p_invitation_id;
  if v_invitation.id is not null then
    if v_invitation.session_id <> p_session_id
      or v_invitation.user_id <> p_target_user_id
      or v_invitation.invited_by_user_id <> auth.uid() then
      raise exception 'live_stage_invitation_idempotency_conflict' using errcode = '23505';
    end if;
    return to_jsonb(v_invitation);
  end if;
  select * into v_invitation from public.live_stage_invitations
  where session_id = p_session_id and user_id = p_target_user_id and status = 'pending'
  limit 1 for update;
  if v_invitation.id is not null then return to_jsonb(v_invitation); end if;
  select count(*)::integer into v_reserved from (
    select participant.user_id from public.live_participants participant
    where participant.session_id = p_session_id and participant.role <> 'host'
      and participant.state in ('backstage','on_stage')
    union
    select invitation.user_id from public.live_stage_invitations invitation
    where invitation.session_id = p_session_id and invitation.status = 'pending'
      and invitation.expires_at > v_now
  ) reserved;
  if v_reserved >= greatest(least(v_session.maximum_publishers, 6) - 1, 0) then
    raise exception 'live_stage_capacity_reached' using errcode = '55000';
  end if;
  insert into public.live_stage_invitations(
    id, session_id, user_id, profile_id, invited_by_user_id,
    status, invited_at, expires_at
  ) values (
    p_invitation_id, p_session_id, p_target_user_id, v_participant.profile_id,
    auth.uid(), 'pending', v_now, v_now + interval '90 seconds'
  ) returning * into v_invitation;
  insert into public.live_session_events(session_id, actor_user_id, event_type, to_state, metadata)
  values (p_session_id, auth.uid(), 'stage_invitation_sent', 'pending',
    jsonb_build_object('targetUserId', p_target_user_id, 'expiresAt', v_invitation.expires_at));
  insert into public.live_session_structure_updates as current_update(
    session_id, version, reason, updated_at
  ) values (p_session_id, 1, 'session_structure', v_now)
  on conflict (session_id) do update set
    version = current_update.version + 1,
    reason = excluded.reason,
    updated_at = excluded.updated_at;
  return to_jsonb(v_invitation);
end;
$$;

create or replace function public.rpc_respond_live_stage_invitation_v1(
  p_invitation_id uuid,
  p_accept boolean
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
  v_participant public.live_participants;
  v_invitation public.live_stage_invitations;
  v_reserved integer;
  v_slot integer;
begin
  if auth.uid() is null then raise exception 'authentication_required' using errcode = '42501'; end if;
  if p_accept is null then
    raise exception 'live_stage_invitation_response_required' using errcode = '22023';
  end if;
  select * into v_invitation from public.live_stage_invitations where id = p_invitation_id;
  if v_invitation.id is null or v_invitation.user_id <> auth.uid() then
    raise exception 'live_stage_invitation_not_found' using errcode = 'P0002';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('live_stage:' || v_invitation.session_id::text, 0));
  select * into v_session from public.live_sessions
  where id = v_invitation.session_id for update;
  select * into v_invitation from public.live_stage_invitations
  where id = p_invitation_id for update;
  if v_invitation.status <> 'pending' then return to_jsonb(v_invitation); end if;
  if v_invitation.expires_at <= v_now then
    update public.live_stage_invitations set status = 'expired', responded_at = v_now
    where id = p_invitation_id returning * into v_invitation;
  elsif not p_accept then
    update public.live_stage_invitations set status = 'declined', responded_at = v_now
    where id = p_invitation_id returning * into v_invitation;
  else
    if v_session.id is null or v_session.status <> 'live' then
      raise exception 'live_stage_invitation_unavailable' using errcode = '55000';
    end if;
    select * into v_participant from public.live_participants
    where session_id = v_invitation.session_id and user_id = auth.uid() for update;
    if v_participant.id is null or v_participant.role = 'host'
      or v_participant.state not in ('audience','stage_requested') then
      raise exception 'live_stage_invitation_target_unavailable' using errcode = '55000';
    end if;
    select count(distinct participant.user_id)::integer into v_reserved
    from public.live_participants participant
    where participant.session_id = v_invitation.session_id
      and participant.user_id <> auth.uid() and participant.role <> 'host'
      and participant.state in ('backstage','on_stage');
    if v_reserved >= greatest(least(v_session.maximum_publishers, 6) - 1, 0) then
      raise exception 'live_stage_capacity_reached' using errcode = '55000';
    end if;
    select slots.slot into v_slot
    from generate_series(1, least(v_session.maximum_publishers, 6)) slots(slot)
    where not exists (
      select 1 from public.live_participants occupied
      where occupied.session_id = v_invitation.session_id and occupied.stage_slot = slots.slot
    ) order by slots.slot limit 1;
    if v_slot is null then raise exception 'live_stage_capacity_reached' using errcode = '55000'; end if;
    update public.live_participants set
      state = 'on_stage', reconnect_state = null, stage_slot = v_slot,
      stage_joined_at = v_now, stage_left_at = null,
      microphone_muted_by_moderator = false, last_seen_at = v_now, updated_at = v_now
    where id = v_participant.id;
    insert into public.live_session_capability_assignments(
      session_id, user_id, capability, effect, assigned_by_user_id
    ) values (
      v_invitation.session_id, auth.uid(), 'live.publish', 'grant',
      v_invitation.invited_by_user_id
    ) on conflict(session_id, user_id, capability) do update set
      effect = excluded.effect,
      assigned_by_user_id = excluded.assigned_by_user_id,
      created_at = v_now;
    update public.live_seat_requests set
      status = 'withdrawn', resolved_at = v_now, resolved_by_user_id = null
    where session_id = v_invitation.session_id and user_id = auth.uid() and status = 'pending';
    update public.live_stage_invitations set status = 'accepted', responded_at = v_now
    where id = p_invitation_id returning * into v_invitation;
  end if;
  insert into public.live_session_events(session_id, actor_user_id, event_type, to_state, metadata)
  values (v_invitation.session_id, auth.uid(), 'stage_invitation_responded',
    v_invitation.status, jsonb_build_object(
      'accepted', v_invitation.status = 'accepted',
      'invitedByUserId', v_invitation.invited_by_user_id
    ));
  insert into public.live_session_structure_updates as current_update(
    session_id, version, reason, updated_at
  ) values (v_invitation.session_id, 1, 'session_structure', v_now)
  on conflict (session_id) do update set
    version = current_update.version + 1,
    reason = excluded.reason,
    updated_at = excluded.updated_at;
  return to_jsonb(v_invitation);
end;
$$;

revoke all on function public.rpc_invite_live_stage_member_v1(uuid, uuid, uuid),
  public.rpc_respond_live_stage_invitation_v1(uuid, boolean) from public, anon;
grant execute on function public.rpc_invite_live_stage_member_v1(uuid, uuid, uuid),
  public.rpc_respond_live_stage_invitation_v1(uuid, boolean) to authenticated, service_role;

commit;
