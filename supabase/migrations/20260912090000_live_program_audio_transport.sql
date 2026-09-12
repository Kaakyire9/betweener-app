-- Betweener Live Phase 10G additive audio transport hardening.
-- Keeps browser screen audio alive and adds authoritative music repeat state.

begin;

alter table public.live_music_session_state
  add column if not exists repeat_mode text not null default 'off';

alter table public.live_music_session_state
  drop constraint if exists live_music_session_state_repeat_mode_check;
alter table public.live_music_session_state
  add constraint live_music_session_state_repeat_mode_check
  check (repeat_mode in ('off', 'one', 'all'));

alter table public.live_music_session_state
  drop constraint if exists live_music_session_state_last_action_check;
alter table public.live_music_session_state
  add constraint live_music_session_state_last_action_check
  check (last_action is null or last_action in (
    'play_track','play_playlist','pause','resume','next','fade_in','fade_out',
    'set_volume','set_mood','duck','unduck','repeat_off','repeat_one',
    'repeat_all','stop'
  ));

alter table public.live_music_events
  drop constraint if exists live_music_events_action_check;
alter table public.live_music_events
  add constraint live_music_events_action_check
  check (action in (
    'play_track','play_playlist','pause','resume','next','fade_in','fade_out',
    'set_volume','set_mood','duck','unduck','repeat_off','repeat_one',
    'repeat_all','stop'
  ));

create or replace function public.rpc_get_live_music_repeat_mode_v1(
  p_session_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare v_repeat_mode text;
begin
  if auth.uid() is null
    or not public.live_studio_is_authorized_v1(p_session_id, auth.uid(), 'view') then
    raise exception 'live_music_repeat_forbidden' using errcode = '42501';
  end if;
  select repeat_mode into v_repeat_mode
  from public.live_music_session_state where session_id = p_session_id;
  return jsonb_build_object('repeatMode', coalesce(v_repeat_mode, 'off'));
end;
$$;

revoke all on function public.rpc_get_live_music_repeat_mode_v1(uuid)
from public, anon;
grant execute on function public.rpc_get_live_music_repeat_mode_v1(uuid)
to authenticated, service_role;

create or replace function public.rpc_service_get_live_music_repeat_mode_v1(
  p_session_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare v_repeat_mode text;
begin
  if not public.live_odo_is_service_role() then
    raise exception 'live_odo_service_role_required' using errcode = '42501';
  end if;
  select repeat_mode into v_repeat_mode
  from public.live_music_session_state where session_id = p_session_id;
  return jsonb_build_object('repeatMode', coalesce(v_repeat_mode, 'off'));
end;
$$;

revoke all on function public.rpc_service_get_live_music_repeat_mode_v1(uuid)
from public, anon, authenticated;
grant execute on function public.rpc_service_get_live_music_repeat_mode_v1(uuid)
to service_role;

create or replace function public.rpc_host_control_live_music_v1(
  p_session_id uuid,
  p_action text,
  p_track_id uuid default null,
  p_playlist_id uuid default null,
  p_volume numeric default null,
  p_mood text default null,
  p_idempotency_key uuid default gen_random_uuid()
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
  v_music public.live_music_session_state;
  v_track public.live_music_tracks;
  v_repeat_mode text;
  v_source text := 'mobile_host';
  v_cycle_offset numeric;
begin
  if auth.uid() is null
    or not public.live_odo_show_host_allowed_v1(p_session_id, auth.uid()) then
    raise exception 'live_music_control_forbidden' using errcode = '42501';
  end if;
  if p_action <> 'stop'
    and not public.live_odo_always_on_music_allowed_v1(p_session_id) then
    return jsonb_build_object('applied', false,
      'reasonCode', 'always_on_music_disabled');
  end if;
  if p_action not in ('repeat_off', 'repeat_one', 'repeat_all') then
    return public.live_odo_host_music_control_base_10f_v1(
      p_session_id, p_action, p_track_id, p_playlist_id, p_volume, p_mood,
      p_idempotency_key
    );
  end if;
  if p_idempotency_key is null or p_track_id is not null or p_playlist_id is not null
    or p_volume is not null or p_mood is not null then
    raise exception 'live_music_action_invalid' using errcode = '22023';
  end if;
  if exists (select 1 from public.live_music_events
      where idempotency_key = p_idempotency_key) then
    return jsonb_build_object('applied', true, 'reasonCode', 'idempotent_replay');
  end if;

  perform pg_advisory_xact_lock(hashtextextended('live_odo:' || p_session_id::text, 0));
  select * into v_config from public.live_odo_configuration where id = true;
  if not coalesce(v_config.music_enabled, false) then
    return jsonb_build_object('applied', false, 'reasonCode', 'music_disabled');
  elsif coalesce(v_config.circuit_breaker_open, true) then
    return jsonb_build_object('applied', false, 'reasonCode', 'circuit_breaker_open');
  end if;

  insert into public.live_music_session_state(session_id)
  values (p_session_id) on conflict (session_id) do nothing;
  select * into v_music from public.live_music_session_state
  where session_id = p_session_id for update;
  select * into v_track from public.live_music_tracks where id = v_music.track_id;
  if v_music.repeat_mode = 'one' and p_action <> 'repeat_one'
    and v_music.program_started_at is not null and v_track.id is not null then
    v_cycle_offset := mod(
      greatest(extract(epoch from (v_now - v_music.program_started_at)), 0),
      v_track.duration_seconds
    );
  end if;
  select case when show_session.control_source = 'studio_host'
      and show_session.control_user_id = auth.uid()
    then 'studio_host' else 'mobile_host' end
  into v_source
  from public.live_odo_show_sessions show_session
  where show_session.session_id = p_session_id;
  v_source := coalesce(v_source, 'mobile_host');
  v_repeat_mode := case p_action
    when 'repeat_one' then 'one'
    when 'repeat_all' then 'all'
    else 'off' end;

  update public.live_music_session_state set
    repeat_mode = v_repeat_mode,
    program_started_at = case when v_cycle_offset is not null
      then v_now - make_interval(secs => floor(v_cycle_offset)::integer)
      else program_started_at end,
    playback_offset_seconds = coalesce(v_cycle_offset, playback_offset_seconds),
    control_source = v_source,
    last_action = p_action,
    last_reason_code = 'host_music_repeat_changed',
    version = version + 1,
    updated_at = v_now
  where session_id = p_session_id returning * into v_music;

  insert into public.live_music_events(
    session_id, idempotency_key, action, source, track_id, playlist_id,
    requested_volume, effective_volume, state_version, reason_code
  ) values (
    p_session_id, p_idempotency_key, p_action, v_source, v_music.track_id,
    v_music.playlist_id, null, v_music.effective_volume, v_music.version,
    'host_music_repeat_changed'
  );
  update public.live_odo_show_sessions set
    host_suppression_ends_at = greatest(
      coalesce(host_suppression_ends_at, v_now),
      v_now + make_interval(secs => v_config.show_host_suppression_seconds)
    ),
    last_reason_code = 'host_music_override',
    version = version + 1
  where session_id = p_session_id;

  return jsonb_build_object(
    'applied', true,
    'reasonCode', 'host_music_repeat_changed',
    'repeatMode', v_music.repeat_mode,
    'stateVersion', v_music.version
  );
end;
$$;

revoke all on function public.rpc_host_control_live_music_v1(
  uuid, text, uuid, uuid, numeric, text, uuid
) from public, anon;
grant execute on function public.rpc_host_control_live_music_v1(
  uuid, text, uuid, uuid, numeric, text, uuid
) to authenticated, service_role;

create or replace function public.rpc_service_complete_live_music_playback_v1(
  p_session_id uuid,
  p_user_id uuid,
  p_expected_state_version bigint
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  v_now timestamptz := timezone('utc', now());
  v_descriptor jsonb;
  v_music public.live_music_session_state;
  v_track public.live_music_tracks;
  v_next_track public.live_music_tracks;
  v_action text := 'stop';
begin
  if not public.live_odo_is_service_role() then
    raise exception 'live_odo_service_role_required' using errcode = '42501';
  end if;
  if p_expected_state_version is null or p_expected_state_version < 1 then
    raise exception 'live_music_completion_invalid' using errcode = '22023';
  end if;
  v_descriptor := public.rpc_service_get_live_music_playback_v1(
    p_session_id, p_user_id
  );
  if coalesce((v_descriptor ->> 'allowed')::boolean, false) is false then
    return jsonb_build_object(
      'completed', false,
      'reasonCode', coalesce(v_descriptor ->> 'reasonCode', 'music_playback_unavailable')
    );
  end if;

  perform pg_advisory_xact_lock(hashtextextended('live_odo:' || p_session_id::text, 0));
  select * into v_music from public.live_music_session_state
  where session_id = p_session_id for update;
  if v_music.version <> p_expected_state_version then
    return jsonb_build_object('completed', false, 'reasonCode', 'stale_music_state');
  end if;
  select * into v_track from public.live_music_tracks where id = v_music.track_id;
  if v_track.id is null or v_music.status not in ('playing', 'ducked', 'fading')
    or v_music.program_started_at is null then
    return jsonb_build_object('completed', false, 'reasonCode', 'active_track_required');
  end if;
  if v_music.program_started_at
      + make_interval(secs => greatest(v_track.duration_seconds - 2, 1)) > v_now then
    return jsonb_build_object('completed', false, 'reasonCode', 'track_still_playing');
  end if;

  if v_music.repeat_mode = 'all' then
    if v_music.playlist_id is not null then
      select track.* into v_next_track
      from public.live_music_playlist_tracks current_item
      join public.live_music_playlist_tracks next_item
        on next_item.playlist_id = current_item.playlist_id
       and next_item.position > current_item.position
      join public.live_music_tracks track on track.id = next_item.track_id
      where current_item.playlist_id = v_music.playlist_id
        and current_item.track_id = v_music.track_id
        and track.enabled and track.license_status = 'approved'
        and (track.license_expires_at is null or track.license_expires_at > v_now)
        and track.licensed_regions @> array['*']::text[]
      order by next_item.position limit 1;
      if v_next_track.id is null then
        select track.* into v_next_track
        from public.live_music_playlist_tracks item
        join public.live_music_tracks track on track.id = item.track_id
        where item.playlist_id = v_music.playlist_id
          and track.enabled and track.license_status = 'approved'
          and (track.license_expires_at is null or track.license_expires_at > v_now)
          and track.licensed_regions @> array['*']::text[]
        order by item.position limit 1;
      end if;
    else
      select track.* into v_next_track
      from public.live_music_tracks track
      where track.enabled and track.license_status = 'approved'
        and (track.license_expires_at is null or track.license_expires_at > v_now)
        and track.licensed_regions @> array['*']::text[]
        and (track.created_at, track.id) > (v_track.created_at, v_track.id)
      order by track.created_at, track.id limit 1;
      if v_next_track.id is null then
        select track.* into v_next_track
        from public.live_music_tracks track
        where track.enabled and track.license_status = 'approved'
          and (track.license_expires_at is null or track.license_expires_at > v_now)
          and track.licensed_regions @> array['*']::text[]
        order by track.created_at, track.id limit 1;
      end if;
    end if;
  end if;

  if v_music.repeat_mode = 'all' and v_next_track.id is not null then
    v_action := 'next';
    update public.live_music_session_state set
      status = 'playing',
      track_id = v_next_track.id,
      mood = v_next_track.mood,
      effective_volume = requested_volume,
      program_started_at = v_now,
      playback_offset_seconds = 0,
      control_source = 'system',
      last_action = 'next',
      last_reason_code = 'music_repeat_all_advanced',
      version = version + 1,
      updated_at = v_now
    where session_id = p_session_id returning * into v_music;
  else
    update public.live_music_session_state set
      status = 'stopped',
      track_id = null,
      playlist_id = null,
      effective_volume = 0,
      program_started_at = null,
      playback_offset_seconds = 0,
      control_source = 'system',
      last_action = 'stop',
      last_reason_code = 'music_track_completed',
      version = version + 1,
      updated_at = v_now
    where session_id = p_session_id returning * into v_music;
  end if;

  insert into public.live_music_events(
    session_id, idempotency_key, action, source, track_id, playlist_id,
    requested_volume, effective_volume, state_version, reason_code
  ) values (
    p_session_id, gen_random_uuid(), v_action, 'system', v_music.track_id,
    v_music.playlist_id, null, v_music.effective_volume, v_music.version,
    case when v_action = 'next' then 'music_repeat_all_advanced'
      else 'music_track_completed' end
  );
  return jsonb_build_object(
    'completed', true,
    'reasonCode', case when v_action = 'next' then 'music_repeat_all_advanced'
      else 'music_track_completed' end,
    'stateVersion', v_music.version
  );
end;
$$;

revoke all on function public.rpc_service_complete_live_music_playback_v1(
  uuid, uuid, bigint
) from public, anon, authenticated;
grant execute on function public.rpc_service_complete_live_music_playback_v1(
  uuid, uuid, bigint
) to service_role;

comment on column public.live_music_session_state.repeat_mode is
  'Authoritative programme transport repeat mode: off, one track, or full playlist.';
comment on function public.rpc_service_complete_live_music_playback_v1(uuid, uuid, bigint) is
  'Fenced audience completion signal; advances only the current approved programme track.';

commit;
