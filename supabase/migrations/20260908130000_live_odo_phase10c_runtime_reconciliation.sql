-- Betweener Live Phase 10C: runtime scene reconciliation.
--
-- Guarded Autopilot is event driven, but an already-live room has no new
-- lifecycle event when the Host first enables Odo. Queue one server-derived
-- scene reconciliation on activation and whenever authoritative stage
-- composition changes. Odo still cannot add, remove, promote, pair, or
-- otherwise mutate participants.

begin;

create or replace function public.live_odo_guarded_project_scene_action_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  v_event public.live_odo_guarded_autopilot_events;
  v_session public.live_sessions;
  v_state public.live_odo_session_state;
  v_settings public.live_odo_guarded_autopilot_settings;
  v_configuration public.live_odo_configuration;
  v_on_stage_count bigint;
  v_target_scene text;
begin
  select * into v_event
  from public.live_odo_guarded_autopilot_events event_row
  where event_row.id = new.event_id;

  if v_event.trigger_type <> 'SCENE_CHANGED' or new.action_type <> 'WAIT' then
    return new;
  end if;

  select * into v_session from public.live_sessions
  where id = new.session_id;
  select * into v_state from public.live_odo_session_state
  where session_id = new.session_id;
  select * into v_settings from public.live_odo_guarded_autopilot_settings
  where session_id = new.session_id;
  select * into v_configuration from public.live_odo_configuration
  where id = true;

  if not coalesce(v_configuration.auto_scene_enabled, false)
    or not coalesce(v_configuration.scene_suggestions_enabled, false)
    or not coalesce(v_settings.auto_scene_enabled, false)
  then
    new.action_type := 'WAIT';
    new.risk_tier := 0;
    new.payload := jsonb_build_object('waitMs', 0);
    new.reason_code := 'automatic_feature_disabled';
    return new;
  end if;

  select count(*) into v_on_stage_count
  from public.live_participants participant
  where participant.session_id = new.session_id
    and participant.state = 'on_stage';

  if exists (
    select 1 from public.live_quick_connect_pairings pairing
    where pairing.session_id = new.session_id
      and pairing.state in ('active', 'reconnect_grace')
  ) then
    v_target_scene := 'quick_connect_active';
  elsif exists (
    select 1 from public.live_match_rounds round_row
    where round_row.session_id = new.session_id
      and round_row.state = 'public_introduction'
  ) then
    v_target_scene := 'pair_forming';
  elsif v_session.format = 'quick_connect' then
    v_target_scene := 'pool_focus';
  elsif v_on_stage_count <= 1 then
    v_target_scene := 'host_focus';
  elsif v_on_stage_count >= 3 then
    v_target_scene := 'pool_focus';
  else
    v_target_scene := 'host_plus_pool';
  end if;

  if v_target_scene = v_state.current_scene then
    new.action_type := 'NO_ACTION';
    new.risk_tier := 0;
    new.payload := '{}'::jsonb;
    new.reason_code := 'scene_already_suitable';
  else
    new.action_type := 'REQUEST_SCENE';
    new.risk_tier := 1;
    new.payload := jsonb_build_object('scene', v_target_scene);
    new.reason_code := 'authoritative_scene_reconciliation';
  end if;
  return new;
end;
$$;

drop trigger if exists live_odo_guarded_project_scene_action
  on public.live_odo_guarded_autopilot_actions;
create trigger live_odo_guarded_project_scene_action
before insert on public.live_odo_guarded_autopilot_actions
for each row execute function public.live_odo_guarded_project_scene_action_v1();

create or replace function public.live_odo_guarded_activation_scene_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare v_session_version bigint;
begin
  if new.trigger_type <> 'HOST_RESUMED_AUTOPILOT' then
    return new;
  end if;
  select version into v_session_version
  from public.live_sessions where id = new.session_id;
  if v_session_version is not null then
    perform public.live_odo_guarded_enqueue_event_v1(
      new.session_id,
      'SCENE_CHANGED',
      'activation-scene:' || new.id::text,
      'session',
      new.session_id,
      v_session_version,
      70::smallint,
      timezone('utc', now()),
      120
    );
  end if;
  return new;
end;
$$;

drop trigger if exists live_odo_guarded_activation_scene
  on public.live_odo_guarded_autopilot_events;
create trigger live_odo_guarded_activation_scene
after insert on public.live_odo_guarded_autopilot_events
for each row execute function public.live_odo_guarded_activation_scene_v1();

create or replace function public.live_odo_guarded_round_event_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare v_delay integer;
begin
  if (tg_op = 'INSERT' or old.state is distinct from new.state)
    and new.state = 'public_introduction' then
    perform public.live_odo_guarded_enqueue_event_v1(
      new.session_id,'PAIRING_READY_FOR_PRESENTATION',
      'hosted-pair-ready:' || new.id::text || ':' || new.version::text,
      'hosted_round',new.id,new.version,60::smallint,timezone('utc',now()),90
    );
    perform public.live_odo_guarded_enqueue_event_v1(
      new.session_id,'SCENE_CHANGED',
      'hosted-pair-scene:' || new.id::text || ':' || new.version::text,
      'hosted_round',new.id,new.version,80::smallint,timezone('utc',now()),90
    );
    select automatic_spark_delay_seconds into v_delay
    from public.live_odo_configuration where id = true;
    perform public.live_odo_guarded_enqueue_event_v1(
      new.session_id,'CONVERSATION_SPARK_ELIGIBLE',
      'hosted-spark:' || new.id::text || ':' || new.version::text,
      'hosted_round',new.id,new.version,30::smallint,
      timezone('utc',now()) + make_interval(secs => coalesce(v_delay,45)),300
    );
  elsif (tg_op = 'INSERT' or old.state is distinct from new.state)
    and new.state = 'completed' then
    perform public.live_odo_guarded_enqueue_event_v1(
      new.session_id,'ROUND_COMPLETED',
      'hosted-round-complete:' || new.id::text || ':' || new.version::text,
      'hosted_round',new.id,new.version,80::smallint,timezone('utc',now()),120
    );
    perform public.live_odo_guarded_enqueue_event_v1(
      new.session_id,'AUDIENCE_PULSE_ELIGIBLE',
      'hosted-pulse:' || new.id::text || ':' || new.version::text,
      'hosted_round',new.id,new.version,40::smallint,
      timezone('utc',now()) + interval '3 seconds',120
    );
  end if;
  return new;
end;
$$;

create or replace function public.live_odo_fence_stage_composition_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  v_session_id uuid := coalesce(new.session_id, old.session_id);
  v_changed boolean := tg_op in ('INSERT','DELETE');
  v_state_version bigint;
  v_session_version bigint;
begin
  if tg_op = 'UPDATE' then
    v_changed := old.session_id is distinct from new.session_id
      or old.state is distinct from new.state
      or old.role is distinct from new.role
      or old.stage_slot is distinct from new.stage_slot;
  end if;
  if not v_changed then return coalesce(new, old); end if;

  with superseded as (
    update public.live_odo_copilot_suggestions suggestion
    set status = 'superseded', superseded_at = timezone('utc', now())
    where suggestion.session_id = v_session_id
      and suggestion.task = 'scene_suggestion'
      and suggestion.status = 'ready'
    returning suggestion.*
  )
  insert into public.live_odo_trace_events(
    session_id, call_id, action_id, trace_type, reason_code, metadata
  )
  select session_id, call_id, action_id,
    'odo_copilot_suggestion_superseded', 'stage_composition_changed',
    jsonb_build_object('task', task, 'suggestionId', id)
  from superseded;

  update public.live_odo_session_state
  set state_version = state_version + 1
  where session_id = v_session_id
  returning state_version into v_state_version;

  if v_state_version is not null then
    select version into v_session_version
    from public.live_sessions where id = v_session_id;
    perform public.live_odo_guarded_enqueue_event_v1(
      v_session_id,
      'SCENE_CHANGED',
      'stage-composition:' || v_session_id::text || ':' || v_state_version::text,
      'session',
      v_session_id,
      v_session_version,
      70::smallint,
      timezone('utc', now()),
      120
    );
  end if;
  return coalesce(new, old);
end;
$$;

revoke all on function public.live_odo_guarded_project_scene_action_v1()
  from public, anon, authenticated, service_role;
revoke all on function public.live_odo_guarded_activation_scene_v1()
  from public, anon, authenticated, service_role;
revoke all on function public.live_odo_guarded_round_event_v1()
  from public, anon, authenticated, service_role;
revoke all on function public.live_odo_fence_stage_composition_v1()
  from public, anon, authenticated, service_role;

-- Existing active internal rooms receive one content-free wake. The normal
-- claim and completion gates still recheck every flag, lease, version,
-- cooldown, and scene policy before anything becomes participant-visible.
do $$
declare active_room record;
begin
  for active_room in
    select settings.session_id, session_row.version, state.state_version
    from public.live_odo_guarded_autopilot_settings settings
    join public.live_odo_session_state state using (session_id)
    join public.live_sessions session_row on session_row.id = settings.session_id
    where settings.enabled
      and state.direction_mode = 'autopilot'
      and state.autopilot_state in ('starting','active')
      and session_row.status = 'live'
  loop
    perform public.live_odo_guarded_enqueue_event_v1(
      active_room.session_id,
      'SCENE_CHANGED',
      'migration-scene:' || active_room.session_id::text || ':'
        || active_room.state_version::text,
      'session',
      active_room.session_id,
      active_room.version,
      70::smallint,
      timezone('utc', now()),
      300
    );
  end loop;
end;
$$;

commit;
