-- Betweener Live Phase 10E additive music policy hardening.
-- Rechecks kill switches at playback time and gives Host overrides a
-- deterministic suppression window.

begin;

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
  if exists (select 1 from public.live_music_events
      where idempotency_key = p_idempotency_key) then
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
    requested_volume = coalesce(case when p_action = 'set_volume' then p_volume end,
      requested_volume),
    effective_volume = case
      when p_action in ('pause','stop','fade_out') then 0
      when p_action = 'duck' then v_config.music_ducked_volume
      when p_action = 'set_volume' then p_volume
      when p_action in ('play_track','play_playlist','next','resume','unduck','fade_in')
        then requested_volume
      else effective_volume end,
    playback_offset_seconds = case
      when p_action = 'pause' and status in ('playing','ducked')
        and program_started_at is not null then greatest(0,
          extract(epoch from (v_now - program_started_at)))
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
  where session_id = p_session_id returning * into v_music;

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
    'applied', true, 'reasonCode', 'host_music_action',
    'stateVersion', v_music.version
  );
end;
$$;
create or replace function public.rpc_service_get_live_music_playback_v1(
  p_session_id uuid,
  p_user_id uuid
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
  if not public.live_odo_is_service_role() then
    raise exception 'live_odo_service_role_required' using errcode = '42501';
  end if;
  select * into v_config from public.live_odo_configuration where id = true;
  if not coalesce(v_config.music_enabled, false) then
    return jsonb_build_object('allowed', false, 'reasonCode', 'music_disabled');
  elsif coalesce(v_config.circuit_breaker_open, true) then
    return jsonb_build_object('allowed', false, 'reasonCode', 'circuit_breaker_open');
  end if;
  if not exists (
    select 1 from public.live_participants participant
    where participant.session_id = p_session_id and participant.user_id = p_user_id
      and participant.state not in ('left','removed','banned')
  ) then
    return jsonb_build_object('allowed', false, 'reasonCode', 'live_participant_required');
  end if;
  if public.has_live_capability(p_session_id, 'live.publish', p_user_id) then
    return jsonb_build_object('allowed', false, 'reasonCode', 'publisher_device_mix_unsupported');
  end if;
  if exists (
    select 1 from public.live_quick_connect_pairings pairing
    where pairing.session_id = p_session_id
      and p_user_id in (pairing.participant_a_user_id, pairing.participant_b_user_id)
      and pairing.state in ('active','reconnect_grace')
  ) or exists (
    select 1 from public.live_private_sparks spark
    where spark.session_id = p_session_id
      and p_user_id in (spark.participant_a_user_id, spark.participant_b_user_id)
      and spark.state = 'active'
  ) then
    return jsonb_build_object('allowed', false, 'reasonCode', 'private_experience_music_forbidden');
  end if;
  select * into v_music from public.live_music_session_state
  where session_id = p_session_id;
  select * into v_track from public.live_music_tracks where id = v_music.track_id;
  if v_music.status not in ('playing','ducked','fading') or v_track.id is null
    or not v_track.enabled or v_track.license_status <> 'approved'
    or (v_track.license_expires_at is not null and v_track.license_expires_at <= v_now)
    or not (v_track.licensed_regions @> array['*']::text[]) then
    return jsonb_build_object('allowed', false, 'reasonCode', 'approved_track_unavailable');
  end if;
  return jsonb_build_object(
    'allowed', true,
    'bucket', v_track.storage_bucket,
    'path', v_track.storage_path,
    'trackId', v_track.id,
    'durationSeconds', v_track.duration_seconds,
    'programStartedAt', v_music.program_started_at,
    'playbackOffsetSeconds', v_music.playback_offset_seconds,
    'volume', v_music.effective_volume,
    'stateVersion', v_music.version
  );
end;
$$;
create or replace function public.rpc_service_reconcile_live_odo_show_v1(
  p_session_id uuid,
  p_requested_by_user_id uuid,
  p_lease_owner uuid
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
  v_state public.live_odo_session_state;
  v_full public.live_odo_full_quick_connect_settings;
  v_control public.live_quick_connect_controls;
  v_music public.live_music_session_state;
  v_track public.live_music_tracks;
  v_participants bigint := 0;
  v_audience bigint := 0;
  v_active bigint := 0;
  v_eligible bigint := 0;
  v_completed bigint := 0;
  v_target_state text := 'host_focus';
  v_target_scene text := 'host_focus';
  v_target_energy text := 'calm';
  v_priority integer := 10;
  v_reason text := 'host_focus_baseline';
  v_action_type text := 'WAIT';
  v_event_type text := 'SHOW_SCENE_CHANGED';
  v_action_key text;
  v_action_id uuid;
  v_next_wake timestamptz;
  v_scene_changed boolean := false;
  v_intermission_due boolean := false;
begin
  if not public.live_odo_is_service_role() then
    raise exception 'live_odo_service_role_required' using errcode = '42501';
  end if;
  if p_session_id is null or p_requested_by_user_id is null or p_lease_owner is null then
    raise exception 'live_odo_show_reconcile_invalid' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('live_odo:' || p_session_id::text, 0));
  select * into v_config from public.live_odo_configuration where id = true for update;
  select * into v_session from public.live_sessions where id = p_session_id for update;
  select * into v_show from public.live_odo_show_sessions
  where session_id = p_session_id for update;
  select * into v_state from public.live_odo_session_state
  where session_id = p_session_id for update;
  select * into v_full from public.live_odo_full_quick_connect_settings
  where session_id = p_session_id;
  select * into v_control from public.live_quick_connect_controls
  where session_id = p_session_id;
  select * into v_music from public.live_music_session_state
  where session_id = p_session_id for update;

  if v_session.id is null or v_show.session_id is null or v_state.session_id is null then
    return jsonb_build_object('allowed', false, 'reasonCode', 'show_state_missing');
  elsif not public.live_odo_show_host_allowed_v1(p_session_id, p_requested_by_user_id) then
    update public.live_odo_show_sessions set
      enabled = false, paused_by_host = false, show_state = 'paused_by_policy',
      control_source = 'odo', control_user_id = null, next_wake_at = null,
      last_reason_code = 'requester_not_authorized', version = version + 1
    where session_id = p_session_id;
    return jsonb_build_object('allowed', false, 'reasonCode', 'requester_not_authorized');
  elsif not v_config.odo_enabled or not v_config.show_director_enabled then
    update public.live_odo_show_sessions set
      enabled = false, show_state = 'paused_by_policy', next_wake_at = null,
      last_reason_code = 'show_director_disabled', version = version + 1
    where session_id = p_session_id;
    return jsonb_build_object('allowed', false, 'reasonCode', 'show_director_disabled');
  elsif not v_show.enabled then
    return jsonb_build_object('allowed', false, 'reasonCode', 'show_director_not_active');
  elsif v_config.circuit_breaker_open then
    update public.live_odo_show_sessions set
      show_state = 'paused_by_policy', control_source = 'odo',
      control_user_id = null, paused_by_host = false, next_wake_at = null,
      last_reason_code = 'circuit_breaker_open', version = version + 1
    where session_id = p_session_id;
    update public.live_music_session_state set
      status = 'stopped', track_id = null, playlist_id = null,
      effective_volume = 0, program_started_at = null,
      playback_offset_seconds = 0, last_action = 'stop',
      last_reason_code = 'circuit_breaker_open', version = version + 1
    where session_id = p_session_id;
    return jsonb_build_object('allowed', false, 'reasonCode', 'circuit_breaker_open');
  elsif v_show.paused_by_host then
    return jsonb_build_object('allowed', false, 'reasonCode', 'host_control_active');
  elsif v_show.control_source in ('mobile_host','studio_host')
    and v_show.control_lease_expires_at > v_now then
    return jsonb_build_object('allowed', false, 'reasonCode', 'host_control_active',
      'nextWakeAt', v_show.control_lease_expires_at);
  elsif v_show.host_suppression_ends_at > v_now then
    return jsonb_build_object('allowed', true, 'didWork', false,
      'actionType', 'WAIT', 'reasonCode', 'host_scene_suppression_active',
      'nextWakeAt', v_show.host_suppression_ends_at);
  elsif v_state.lease_owner is not null and v_state.lease_expires_at > v_now
    and v_state.lease_owner <> p_lease_owner then
    return jsonb_build_object('allowed', false, 'reasonCode', 'lease_held',
      'nextWakeAt', v_state.lease_expires_at);
  end if;

  update public.live_odo_session_state set
    lease_owner = p_lease_owner,
    lease_generation = lease_generation + 1,
    lease_expires_at = v_now + make_interval(secs => v_config.lease_seconds),
    lease_heartbeat_at = v_now,
    state_version = state_version + 1
  where session_id = p_session_id returning * into v_state;

  select count(*) filter (where participant.state not in ('left','removed','banned')),
    count(*) filter (where participant.state = 'audience')
  into v_participants, v_audience from public.live_participants participant
  where participant.session_id = p_session_id;
  select count(*) into v_active from public.live_quick_connect_pairings pairing
  where pairing.session_id = p_session_id
    and pairing.state in ('active','reconnect_grace');
  v_eligible := public.live_odo_full_quick_eligible_pairs_v1(p_session_id);
  select count(*) into v_completed from public.live_quick_connect_rounds round_row
  where round_row.session_id = p_session_id and round_row.state = 'completed';
  v_intermission_due := v_config.show_intermission_enabled
    and v_completed > 0
    and v_completed >= v_show.last_intermission_round
      + v_config.show_intermission_every_rounds;

  if v_session.status <> 'live' then
    v_target_state := 'closing'; v_target_scene := 'session_closing';
    v_target_energy := 'closing'; v_priority := 90; v_reason := 'session_not_live';
    v_event_type := 'SHOW_CLOSING';
  elsif v_full.lifecycle_state in ('draining','closing')
    or v_control.state = 'draining' then
    v_target_state := 'draining';
    v_target_scene := case when v_active > 0 then 'quick_connect_active'
      else 'session_closing' end;
    v_target_energy := 'closing'; v_priority := 60;
    v_reason := case when v_active > 0 then 'active_pairs_draining'
      else 'rotation_drained' end;
  elsif v_active > 0 then
    v_target_state := 'pair_active'; v_target_scene := 'quick_connect_active';
    v_target_energy := 'social'; v_priority := 75;
    v_reason := 'private_conversation_active';
  elsif v_eligible > 0 then
    v_target_state := 'pair_forming'; v_target_scene := 'pair_forming';
    v_target_energy := 'social'; v_priority := 80;
    v_reason := 'eligible_pair_forming';
  elsif v_intermission_due then
    v_target_state := 'music_intermission'; v_target_scene := 'music_intermission';
    v_target_energy := case when mod(v_completed, 4) = 0 then 'reflective'
      else 'energize' end;
    v_priority := 30; v_reason := 'bounded_intermission_due';
    v_event_type := 'SHOW_INTERMISSION_STARTED';
  elsif v_control.state = 'open' and v_eligible = 0 then
    v_target_state := 'low_liquidity'; v_target_scene := 'odo_stage';
    v_target_energy := 'social'; v_priority := 20;
    v_reason := 'low_liquidity_program_moment';
  elsif v_audience > 0 and v_participants > 1 then
    v_target_state := 'host_plus_pool'; v_target_scene := 'host_plus_pool';
    v_target_energy := 'social'; v_priority := 10;
    v_reason := 'room_social_baseline';
  end if;

  if v_target_scene <> v_show.current_scene
    and v_priority <= v_show.current_priority
    and v_show.scene_entered_at > v_now
      - make_interval(secs => v_config.show_scene_minimum_dwell_seconds) then
    v_target_scene := v_show.current_scene;
    v_target_state := v_show.show_state;
    v_target_energy := v_show.energy_mode;
    v_priority := v_show.current_priority;
    v_reason := 'scene_minimum_dwell_active';
  end if;

  v_scene_changed := v_target_scene <> v_show.current_scene;
  if v_scene_changed then
    v_event_type := case
      when v_target_scene = 'music_intermission' then 'SHOW_INTERMISSION_STARTED'
      when v_show.current_scene = 'music_intermission' then 'SHOW_INTERMISSION_ENDED'
      else v_event_type end;
    v_action_type := case
      when v_target_scene = 'music_intermission' then 'BEGIN_INTERMISSION'
      when v_show.current_scene = 'music_intermission' then 'END_INTERMISSION'
      else 'SET_SCENE' end;
    v_action_key := 'show:' || p_session_id::text || ':' || v_show.version::text
      || ':' || v_target_scene;
    insert into public.live_odo_show_actions(
      session_id, action_key, action_type, reason_code, priority, scene,
      state_version, lease_generation, metadata
    ) values (
      p_session_id, v_action_key, v_action_type, v_reason, v_priority,
      v_target_scene, v_show.version, v_state.lease_generation,
      jsonb_build_object(
        'participants', v_participants, 'audience', v_audience,
        'eligiblePairs', v_eligible, 'activePairs', v_active,
        'completedRounds', v_completed
      )
    ) on conflict (action_key) do nothing returning action_id into v_action_id;
    if v_action_id is null then
      select action_id into v_action_id from public.live_odo_show_actions
      where action_key = v_action_key;
    end if;
    update public.live_odo_show_sessions set
      show_state = v_target_state,
      current_scene = v_target_scene,
      energy_mode = v_target_energy,
      control_source = 'odo',
      control_user_id = null,
      control_lease_expires_at = null,
      current_priority = v_priority,
      scene_entered_at = v_now,
      last_reason_code = v_reason,
      completed_rounds_seen = v_completed,
      last_intermission_round = case when v_target_scene = 'music_intermission'
        then v_completed else last_intermission_round end,
      scene_history = (
        select coalesce(jsonb_agg(entry order by ordinal), '[]'::jsonb)
        from (
          select entry, ordinal from jsonb_array_elements(
            v_show.scene_history || jsonb_build_array(jsonb_build_object(
              'scene', v_target_scene, 'source', 'odo', 'reason', v_reason, 'at', v_now
            ))
          ) with ordinality history(entry, ordinal)
          order by ordinal desc limit 12
        ) bounded
      ),
      version = version + 1
    where session_id = p_session_id returning * into v_show;
    update public.live_odo_session_state set
      current_scene = v_target_scene,
      state_version = state_version + 1
    where session_id = p_session_id;
    perform public.live_odo_append_show_event_v1(
      p_session_id, v_event_type, v_action_id,
      jsonb_build_object(
        'scene', v_target_scene, 'energyMode', v_target_energy,
        'reasonCode', v_reason
      ), v_now + interval '15 minutes'
    );
  else
    update public.live_odo_show_sessions set
      show_state = v_target_state,
      energy_mode = v_target_energy,
      control_source = 'odo',
      control_user_id = null,
      control_lease_expires_at = null,
      current_priority = v_priority,
      last_reason_code = v_reason,
      completed_rounds_seen = v_completed,
      version = version + 1
    where session_id = p_session_id returning * into v_show;
  end if;

  -- Conversation always wins. Music begins only during an approved automatic
  -- intermission and only from an explicitly licensed wildcard-region track.
  if v_config.music_enabled and v_config.music_auto_enabled then
    if v_active > 0 and v_music.status in ('playing','fading') then
      if v_config.music_ducking_enabled then
        update public.live_music_session_state set
          status = 'ducked', effective_volume = v_config.music_ducked_volume,
          control_source = 'odo', last_action = 'duck',
          last_reason_code = 'conversation_priority_duck', version = version + 1
        where session_id = p_session_id returning * into v_music;
        insert into public.live_music_events(
          session_id, idempotency_key, action, source, track_id, playlist_id,
          requested_volume, effective_volume, state_version, reason_code
        ) values (
          p_session_id, gen_random_uuid(), 'duck', 'odo', v_music.track_id,
          v_music.playlist_id, v_music.requested_volume, v_music.effective_volume,
          v_music.version, 'conversation_priority_duck'
        );
      else
        update public.live_music_session_state set
          status = 'stopped', track_id = null, playlist_id = null,
          effective_volume = 0, program_started_at = null,
          playback_offset_seconds = 0, control_source = 'odo',
          last_action = 'stop', last_reason_code = 'conversation_music_suppressed',
          version = version + 1
        where session_id = p_session_id returning * into v_music;
        insert into public.live_music_events(
          session_id, idempotency_key, action, source, track_id, playlist_id,
          requested_volume, effective_volume, state_version, reason_code
        ) values (
          p_session_id, gen_random_uuid(), 'stop', 'odo', null, null,
          v_music.requested_volume, 0, v_music.version,
          'conversation_music_suppressed'
        );
      end if;
    elsif v_target_scene = 'music_intermission'
      and v_music.status not in ('playing','ducked') then
      select * into v_track from public.live_music_tracks track
      where track.enabled and track.license_status = 'approved'
        and (track.license_expires_at is null or track.license_expires_at > v_now)
        and track.licensed_regions @> array['*']::text[]
        and track.mood in (v_target_energy, 'instrumental', 'warm')
      order by track.energy, track.id limit 1;
      if v_track.id is not null then
        update public.live_music_session_state set
          status = 'playing', track_id = v_track.id, playlist_id = null,
          mood = v_track.mood, requested_volume = v_config.music_default_volume,
          effective_volume = v_config.music_default_volume,
          program_started_at = v_now, playback_offset_seconds = 0,
          control_source = 'odo', last_action = 'play_track',
          last_reason_code = 'approved_intermission_track', version = version + 1
        where session_id = p_session_id returning * into v_music;
        insert into public.live_music_events(
          session_id, idempotency_key, action, source, track_id, playlist_id,
          requested_volume, effective_volume, state_version, reason_code
        ) values (
          p_session_id, gen_random_uuid(), 'play_track', 'odo', v_music.track_id,
          v_music.playlist_id, v_music.requested_volume, v_music.effective_volume,
          v_music.version, 'approved_intermission_track'
        );
      end if;
    elsif v_target_scene <> 'music_intermission'
      and v_music.status in ('playing','ducked','fading')
      and v_music.control_source = 'odo' then
      update public.live_music_session_state set
        status = 'stopped', track_id = null, playlist_id = null,
        effective_volume = 0, program_started_at = null,
        playback_offset_seconds = 0, last_action = 'stop',
        last_reason_code = 'automatic_intermission_ended', version = version + 1
      where session_id = p_session_id returning * into v_music;
      insert into public.live_music_events(
        session_id, idempotency_key, action, source, track_id, playlist_id,
        requested_volume, effective_volume, state_version, reason_code
      ) values (
        p_session_id, gen_random_uuid(), 'stop', 'odo', null, null,
        v_music.requested_volume, 0, v_music.version,
        'automatic_intermission_ended'
      );
    end if;
  elsif v_music.status in ('playing','ducked','fading')
    and v_music.control_source = 'odo' then
    update public.live_music_session_state set
      status = 'stopped', track_id = null, playlist_id = null,
      effective_volume = 0, program_started_at = null,
      playback_offset_seconds = 0, last_action = 'stop',
      last_reason_code = 'automatic_music_disabled', version = version + 1
    where session_id = p_session_id returning * into v_music;
    insert into public.live_music_events(
      session_id, idempotency_key, action, source, track_id, playlist_id,
      requested_volume, effective_volume, state_version, reason_code
    ) values (
      p_session_id, gen_random_uuid(), 'stop', 'odo', null, null,
      v_music.requested_volume, 0, v_music.version, 'automatic_music_disabled'
    );
  end if;

  v_next_wake := case when v_session.status = 'live'
    then v_now + make_interval(secs => v_config.show_reconcile_seconds)
    else null end;
  update public.live_odo_show_sessions set
    enabled = case when v_session.status = 'live' then enabled else false end,
    next_wake_at = case when enabled and v_session.status = 'live' then v_next_wake
      else null end,
    version = version + 1
  where session_id = p_session_id;
  update public.live_odo_session_state set
    lease_owner = null, lease_expires_at = null, lease_heartbeat_at = null,
    last_decision_at = v_now
  where session_id = p_session_id and lease_owner = p_lease_owner
    and lease_generation = v_state.lease_generation;

  return jsonb_build_object(
    'allowed', true,
    'didWork', v_scene_changed,
    'actionType', v_action_type,
    'reasonCode', v_reason,
    'nextWakeAt', v_next_wake,
    'snapshot', public.live_odo_show_snapshot_v1(p_session_id, p_requested_by_user_id)
  );
end;
$$;

commit;
