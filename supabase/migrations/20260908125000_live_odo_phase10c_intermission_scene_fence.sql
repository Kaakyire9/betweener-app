-- Intermission is also a scene transition. Apply the same Host suppression,
-- dwell, and anti-thrash policy used by ordinary automatic scene requests.

create or replace function public.live_odo_guarded_manual_scene_fence_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  v_config public.live_odo_configuration;
  v_settings public.live_odo_guarded_autopilot_settings;
  v_now timestamptz := timezone('utc', now());
  v_is_guarded_executor boolean := coalesce(
    current_setting('app.live_odo_guarded_executor', true), ''
  ) = 'on';
begin
  if old.current_scene is not distinct from new.current_scene then
    return new;
  end if;
  select * into v_config from public.live_odo_configuration where id = true;
  select * into v_settings from public.live_odo_guarded_autopilot_settings
  where session_id = new.session_id;

  if v_is_guarded_executor then
    if v_settings.session_id is null or not v_settings.enabled then
      raise exception 'live_odo_guarded_scene_state_missing' using errcode = '23514';
    elsif v_settings.automatic_scene_suppressed_until > v_now then
      raise exception 'live_odo_host_scene_suppression_active' using errcode = '23514';
    elsif v_settings.last_scene_changed_at is not null
      and v_settings.last_scene_changed_at > v_now - make_interval(
        secs => v_config.automatic_scene_minimum_dwell_seconds
      ) then
      raise exception 'live_odo_scene_dwell_active' using errcode = '23514';
    elsif v_settings.previous_automatic_scene = new.current_scene
      and v_settings.last_automatic_scene is distinct from new.current_scene
      and v_settings.last_scene_changed_at > v_now - make_interval(
        secs => v_config.automatic_scene_minimum_dwell_seconds * 2
      ) then
      raise exception 'live_odo_scene_thrashing_prevented' using errcode = '23514';
    end if;

    if new.current_scene = 'music_intermission_visual_only' then
      update public.live_odo_guarded_autopilot_settings set
        previous_automatic_scene = last_automatic_scene,
        last_automatic_scene = new.current_scene,
        last_scene_changed_at = v_now,
        last_scene_reason_code = 'intermission_required',
        version = version + 1
      where session_id = new.session_id;
    end if;
  elsif v_settings.session_id is not null and v_settings.enabled then
    update public.live_odo_guarded_autopilot_settings set
      automatic_scene_suppressed_until = v_now + make_interval(
        secs => v_config.host_scene_suppression_seconds
      ),
      version = version + 1
    where session_id = new.session_id;
    insert into public.live_odo_trace_events(
      session_id, trace_type, reason_code, metadata
    ) values (
      new.session_id,
      'odo_host_scene_override',
      'host_scene_changed',
      jsonb_build_object('scene', new.current_scene)
    );
  end if;
  return new;
end;
$$;

revoke all on function public.live_odo_guarded_manual_scene_fence_v1()
  from public, anon, authenticated, service_role;
