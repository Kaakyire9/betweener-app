begin;

-- Restore the authoritative Phase 10E host-music implementation behind the
-- Phase 10F policy and Programme Audio wrappers. The preceding compatibility
-- repair referenced a development-only helper that is absent from production.
create or replace function public.live_odo_host_music_control_base_10f_v1(
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
begin
  if auth.uid() is null
    or not public.live_odo_show_host_allowed_v1(p_session_id, auth.uid()) then
    raise exception 'live_music_control_forbidden' using errcode = '42501';
  end if;
  if p_action not in (
    'play_track','play_playlist','pause','resume','next','fade_in','fade_out',
    'set_volume','set_mood','duck','unduck','stop'
  ) or p_idempotency_key is null
    or (p_volume is not null and p_volume not between 0 and 0.5)
    or (p_mood is not null and p_mood not in (
      'chill','afrobeats_light','soul','warm','upbeat','reflective',
      'instrumental','closing'
    )) then
    raise exception 'live_music_action_invalid' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.live_music_events
    where idempotency_key = p_idempotency_key
  ) then
    return jsonb_build_object('applied', true, 'reasonCode', 'idempotent_replay');
  end if;
  perform pg_advisory_xact_lock(hashtextextended('live_odo:' || p_session_id::text, 0));
  select * into v_config from public.live_odo_configuration where id = true;
  if not v_config.music_enabled then
    return jsonb_build_object('applied', false, 'reasonCode', 'music_disabled');
  elsif v_config.circuit_breaker_open and p_action <> 'stop' then
    return jsonb_build_object('applied', false, 'reasonCode', 'circuit_breaker_open');
  end if;
  insert into public.live_music_session_state(session_id)
  values (p_session_id) on conflict (session_id) do nothing;
  select * into v_music from public.live_music_session_state
  where session_id = p_session_id for update;

  if p_action not in ('play_track','play_playlist','set_volume','set_mood','stop')
    and v_music.track_id is null then
    return jsonb_build_object('applied', false, 'reasonCode', 'active_track_required');
  end if;

  if p_action in ('play_track','play_playlist','next') then
    if p_action = 'play_track' then
      select * into v_track from public.live_music_tracks track
      where track.id = p_track_id;
    elsif p_action = 'play_playlist' then
      select track.* into v_track
      from public.live_music_playlist_tracks item
      join public.live_music_playlists playlist on playlist.id = item.playlist_id
      join public.live_music_tracks track on track.id = item.track_id
      where item.playlist_id = p_playlist_id and playlist.enabled
      order by item.position limit 1;
    else
      select track.* into v_track
      from public.live_music_playlist_tracks current_item
      join public.live_music_playlist_tracks next_item
        on next_item.playlist_id = current_item.playlist_id
       and next_item.position > current_item.position
      join public.live_music_tracks track on track.id = next_item.track_id
      where current_item.playlist_id = v_music.playlist_id
        and current_item.track_id = v_music.track_id
      order by next_item.position limit 1;
    end if;
    if v_track.id is null or not v_track.enabled
      or v_track.license_status <> 'approved'
      or (v_track.license_expires_at is not null and v_track.license_expires_at <= v_now)
      or not (v_track.licensed_regions @> array['*']::text[]) then
      return jsonb_build_object('applied', false, 'reasonCode', 'approved_track_unavailable');
    end if;
  end if;

  update public.live_music_session_state set
    status = case p_action
      when 'pause' then 'paused'
      when 'stop' then 'stopped'
      when 'duck' then 'ducked'
      when 'fade_out' then 'fading'
      when 'play_track' then 'playing'
      when 'play_playlist' then 'playing'
      when 'next' then 'playing'
      when 'resume' then 'playing'
      when 'unduck' then 'playing'
      when 'fade_in' then 'playing'
      else status end,
    track_id = case when p_action in ('play_track','play_playlist','next')
      then v_track.id when p_action = 'stop' then null else track_id end,
    playlist_id = case when p_action = 'play_playlist' then p_playlist_id
      when p_action = 'play_track' or p_action = 'stop' then null else playlist_id end,
    mood = case when p_action = 'set_mood' then p_mood
      when p_action in ('play_track','play_playlist','next') then v_track.mood else mood end,
    requested_volume = coalesce(
      case when p_action = 'set_volume' then p_volume end,
      requested_volume
    ),
    effective_volume = case
      when p_action in ('pause','stop','fade_out') then 0
      when p_action = 'duck' then v_config.music_ducked_volume
      when p_action = 'set_volume' then p_volume
      when p_action in ('play_track','play_playlist','next','resume','unduck','fade_in')
        then requested_volume
      else effective_volume end,
    playback_offset_seconds = case
      when p_action = 'pause' and status in ('playing','ducked')
        and program_started_at is not null then greatest(
          0,
          extract(epoch from (v_now - program_started_at))
        )
      when p_action in ('play_track','play_playlist','next','stop') then 0
      else playback_offset_seconds end,
    program_started_at = case
      when p_action in ('play_track','play_playlist','next') then v_now
      when p_action = 'resume' then v_now - make_interval(
        secs => floor(playback_offset_seconds)::integer
      )
      when p_action = 'stop' then null
      else program_started_at end,
    control_source = 'mobile_host',
    last_action = p_action,
    last_reason_code = 'host_music_action',
    version = version + 1
  where session_id = p_session_id
  returning * into v_music;

  insert into public.live_music_events(
    session_id, idempotency_key, action, source, track_id, playlist_id,
    requested_volume, effective_volume, state_version, reason_code
  ) values (
    p_session_id, p_idempotency_key, p_action, 'mobile_host', v_music.track_id,
    v_music.playlist_id, p_volume, v_music.effective_volume, v_music.version,
    'host_music_action'
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
    'reasonCode', 'host_music_action',
    'stateVersion', v_music.version
  );
end;
$$;

revoke all on function public.live_odo_host_music_control_base_10f_v1(
  uuid, text, uuid, uuid, numeric, text, uuid
) from public, anon, authenticated, service_role;

comment on function public.live_odo_host_music_control_base_10f_v1(
  uuid, text, uuid, uuid, numeric, text, uuid
) is 'Private authoritative host-music implementation used by the Phase 10F and Programme Audio policy wrappers.';

commit;
