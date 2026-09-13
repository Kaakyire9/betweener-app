-- Betweener Live Phase 10G: one fenced programme-audio publisher per Live.
-- The publisher ingests the approved catalogue into Stream. Audience devices
-- are listeners only and never mix programme music into their local RTC audio.

begin;

alter table public.live_odo_configuration
  add column if not exists program_audio_publisher_enabled boolean not null default false,
  add column if not exists program_audio_publisher_lease_seconds integer not null default 30,
  add column if not exists program_audio_publisher_stale_seconds integer not null default 20;

alter table public.live_odo_configuration
  add constraint live_program_audio_publisher_lease_valid check (
    program_audio_publisher_lease_seconds between 15 and 120
  ),
  add constraint live_program_audio_publisher_stale_valid check (
    program_audio_publisher_stale_seconds between 10 and 90
    and program_audio_publisher_stale_seconds < program_audio_publisher_lease_seconds
  );

create table public.live_program_audio_publishers (
  session_id uuid primary key references public.live_sessions(id) on delete cascade,
  worker_instance_id uuid,
  lease_generation bigint not null default 1 check (lease_generation > 0),
  lease_expires_at timestamptz,
  status text not null default 'idle' check (status in (
    'idle','claiming','starting','live','degraded','stopping'
  )),
  provider_user_id text not null check (
    provider_user_id ~ '^studio-program-audio-[0-9a-f]{32}$'
  ),
  observed_music_version bigint check (observed_music_version is null or observed_music_version > 0),
  published_track_id uuid references public.live_music_tracks(id) on delete set null,
  published_volume numeric(4,3) not null default 0 check (
    published_volume between 0 and 0.5
  ),
  consecutive_failures integer not null default 0 check (consecutive_failures between 0 and 1000000),
  failure_reason_code text check (
    failure_reason_code is null or failure_reason_code ~ '^[a-z][a-z0-9_]{0,119}$'
  ),
  last_heartbeat_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint live_program_audio_publisher_lease_shape check (
    (worker_instance_id is null and lease_expires_at is null and status = 'idle')
    or (worker_instance_id is not null and lease_expires_at is not null and status <> 'idle')
  )
);

create index live_program_audio_publishers_lease_idx
  on public.live_program_audio_publishers(lease_expires_at, status);

create table public.live_program_audio_events (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.live_sessions(id) on delete cascade,
  worker_instance_id uuid,
  lease_generation bigint not null check (lease_generation > 0),
  event_type text not null check (event_type in (
    'claimed','started','heartbeat','degraded','completed','released','lease_expired'
  )),
  music_version bigint,
  track_id uuid references public.live_music_tracks(id) on delete set null,
  volume numeric(4,3),
  reason_code text not null check (reason_code ~ '^[a-z][a-z0-9_]{0,119}$'),
  created_at timestamptz not null default timezone('utc', now()),
  constraint live_program_audio_event_values_valid check (
    (music_version is null or music_version > 0)
    and (volume is null or volume between 0 and 0.5)
  )
);

create index live_program_audio_events_session_idx
  on public.live_program_audio_events(session_id, created_at desc);

alter table public.live_program_audio_publishers enable row level security;
alter table public.live_program_audio_events enable row level security;
revoke all on table public.live_program_audio_publishers,
  public.live_program_audio_events from public, anon, authenticated, service_role;

create trigger live_program_audio_publishers_updated_at
before update on public.live_program_audio_publishers
for each row execute function public.set_updated_at();

create or replace function public.rpc_service_list_live_program_audio_work_v1(
  p_worker_instance_id uuid,
  p_limit integer default 25
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare v_result jsonb;
begin
  if not public.live_odo_is_service_role() then
    raise exception 'live_odo_service_role_required' using errcode = '42501';
  end if;
  if p_worker_instance_id is null or p_limit not between 1 and 100 then
    raise exception 'live_program_audio_work_invalid' using errcode = '22023';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'sessionId', work.session_id,
    'musicVersion', work.music_version,
    'desiredStatus', work.desired_status,
    'leaseOwned', work.worker_instance_id = p_worker_instance_id,
    'leaseExpiresAt', work.lease_expires_at
  ) order by work.updated_at), '[]'::jsonb) into v_result
  from (
    select session.id as session_id,
      music.version as music_version,
      case when configuration.program_audio_publisher_enabled
        and configuration.music_enabled
        and not configuration.circuit_breaker_open
        and session.status = 'live'
        and music.status in ('playing','ducked','fading')
        and music.track_id is not null then 'playing' else 'stopped' end as desired_status,
      publisher.worker_instance_id,
      publisher.lease_expires_at,
      coalesce(music.updated_at, publisher.updated_at, session.updated_at) as updated_at
    from public.live_sessions session
    left join public.live_music_session_state music on music.session_id = session.id
    left join public.live_program_audio_publishers publisher on publisher.session_id = session.id
    cross join public.live_odo_configuration configuration
    where configuration.id = true and (
        (configuration.program_audio_publisher_enabled
          and configuration.music_enabled
          and not configuration.circuit_breaker_open
          and session.status = 'live' and music.status in ('playing','ducked','fading')
          and music.track_id is not null)
        or publisher.worker_instance_id = p_worker_instance_id
      )
    order by coalesce(music.updated_at, publisher.updated_at, session.updated_at)
    limit p_limit
  ) work;
  return v_result;
end;
$$;

revoke all on function public.rpc_service_list_live_program_audio_work_v1(uuid, integer)
from public, anon, authenticated;
grant execute on function public.rpc_service_list_live_program_audio_work_v1(uuid, integer)
to service_role;

create or replace function public.rpc_service_claim_live_program_audio_v1(
  p_session_id uuid,
  p_worker_instance_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  v_now timestamptz := timezone('utc', now());
  v_configuration public.live_odo_configuration;
  v_session public.live_sessions;
  v_music public.live_music_session_state;
  v_track public.live_music_tracks;
  v_publisher public.live_program_audio_publishers;
  v_provider_user_id text;
  v_offset numeric;
begin
  if not public.live_odo_is_service_role() then
    raise exception 'live_odo_service_role_required' using errcode = '42501';
  end if;
  if p_session_id is null or p_worker_instance_id is null then
    raise exception 'live_program_audio_claim_invalid' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('live_program_audio:' || p_session_id::text, 0));
  select * into v_configuration from public.live_odo_configuration where id = true;
  select * into v_session from public.live_sessions where id = p_session_id;
  select * into v_music from public.live_music_session_state where session_id = p_session_id;
  select * into v_track from public.live_music_tracks where id = v_music.track_id;

  if not coalesce(v_configuration.program_audio_publisher_enabled, false) then
    return jsonb_build_object('claimed', false, 'reasonCode', 'program_audio_publisher_disabled');
  elsif not coalesce(v_configuration.music_enabled, false)
    or coalesce(v_configuration.circuit_breaker_open, true) then
    return jsonb_build_object('claimed', false, 'reasonCode', 'music_policy_blocked');
  elsif v_session.id is null or v_session.status <> 'live' or v_session.provider <> 'stream' then
    return jsonb_build_object('claimed', false, 'reasonCode', 'live_session_unavailable');
  elsif v_music.status not in ('playing','ducked','fading') or v_track.id is null then
    return jsonb_build_object('claimed', false, 'reasonCode', 'active_track_required');
  elsif not v_track.enabled or v_track.license_status <> 'approved'
    or (v_track.license_expires_at is not null and v_track.license_expires_at <= v_now)
    or not (v_track.licensed_regions @> array['*']::text[]) then
    return jsonb_build_object('claimed', false, 'reasonCode', 'approved_track_unavailable');
  end if;

  v_provider_user_id := 'studio-program-audio-' || replace(p_session_id::text, '-', '');
  select * into v_publisher from public.live_program_audio_publishers
  where session_id = p_session_id for update;
  if v_publisher.session_id is null then
    insert into public.live_program_audio_publishers(
      session_id, worker_instance_id, lease_expires_at, status, provider_user_id,
      observed_music_version, published_track_id, published_volume, last_heartbeat_at
    ) values (
      p_session_id, p_worker_instance_id,
      v_now + make_interval(secs => v_configuration.program_audio_publisher_lease_seconds),
      'claiming', v_provider_user_id, v_music.version, v_track.id,
      v_music.effective_volume, v_now
    ) returning * into v_publisher;
  elsif v_publisher.worker_instance_id is distinct from p_worker_instance_id
    and v_publisher.lease_expires_at > v_now then
    return jsonb_build_object(
      'claimed', false, 'reasonCode', 'program_audio_lease_busy',
      'retryAfter', v_publisher.lease_expires_at
    );
  else
    update public.live_program_audio_publishers set
      worker_instance_id = p_worker_instance_id,
      lease_generation = case
        when worker_instance_id is distinct from p_worker_instance_id then lease_generation + 1
        else lease_generation end,
      lease_expires_at = v_now + make_interval(
        secs => v_configuration.program_audio_publisher_lease_seconds
      ),
      status = 'claiming',
      provider_user_id = v_provider_user_id,
      observed_music_version = v_music.version,
      published_track_id = v_track.id,
      published_volume = v_music.effective_volume,
      failure_reason_code = null,
      last_heartbeat_at = v_now
    where session_id = p_session_id returning * into v_publisher;
  end if;

  insert into public.live_program_audio_events(
    session_id, worker_instance_id, lease_generation, event_type,
    music_version, track_id, volume, reason_code
  ) values (
    p_session_id, p_worker_instance_id, v_publisher.lease_generation, 'claimed',
    v_music.version, v_track.id, v_music.effective_volume, 'program_audio_claimed'
  );

  v_offset := greatest(0, coalesce(
    extract(epoch from (v_now - v_music.program_started_at)),
    v_music.playback_offset_seconds,
    0
  ));
  if v_music.repeat_mode = 'one' then
    v_offset := mod(v_offset, v_track.duration_seconds);
  else
    v_offset := least(v_offset, v_track.duration_seconds);
  end if;

  insert into public.live_program_sources(
    session_id, source_key, source_type, source_role, provider_user_id,
    has_video, has_audio, readiness, health, muted, last_seen_at, safe_metadata
  ) values (
    p_session_id, 'system:programme_audio', 'programme_music', 'atmosphere_audio',
    v_provider_user_id, false, true, 'preparing', 'unknown',
    v_music.effective_volume = 0, v_now,
    jsonb_build_object('transport', 'stream_rtmp', 'trackId', v_track.id)
  ) on conflict (session_id, source_key) do update set
    provider_user_id = excluded.provider_user_id,
    has_video = false,
    has_audio = true,
    readiness = 'preparing',
    health = 'unknown',
    muted = excluded.muted,
    failure_reason_code = null,
    generation = case
      when public.live_program_sources.provider_user_id is distinct from excluded.provider_user_id
        then public.live_program_sources.generation + 1
      else public.live_program_sources.generation end,
    version = public.live_program_sources.version + 1,
    last_seen_at = v_now,
    safe_metadata = excluded.safe_metadata;

  return jsonb_build_object(
    'claimed', true,
    'reasonCode', 'program_audio_claimed',
    'leaseGeneration', v_publisher.lease_generation,
    'leaseExpiresAt', v_publisher.lease_expires_at,
    'providerUserId', v_provider_user_id,
    'providerCallType', v_session.provider_call_type,
    'providerCallId', v_session.provider_call_id,
    'maximumParticipants', v_session.maximum_participants,
    'musicVersion', v_music.version,
    'musicStatus', v_music.status,
    'trackId', v_track.id,
    'trackUpdatedAt', v_track.updated_at,
    'storageBucket', v_track.storage_bucket,
    'storagePath', v_track.storage_path,
    'durationSeconds', v_track.duration_seconds,
    'offsetSeconds', v_offset,
    'volume', v_music.effective_volume,
    'repeatMode', v_music.repeat_mode
  );
end;
$$;

revoke all on function public.rpc_service_claim_live_program_audio_v1(uuid, uuid)
from public, anon, authenticated;
grant execute on function public.rpc_service_claim_live_program_audio_v1(uuid, uuid)
to service_role;

create or replace function public.rpc_service_heartbeat_live_program_audio_v1(
  p_session_id uuid,
  p_worker_instance_id uuid,
  p_lease_generation bigint,
  p_music_version bigint,
  p_track_id uuid,
  p_volume numeric,
  p_status text,
  p_failure_reason_code text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  v_now timestamptz := timezone('utc', now());
  v_configuration public.live_odo_configuration;
  v_publisher public.live_program_audio_publishers;
begin
  if not public.live_odo_is_service_role() then
    raise exception 'live_odo_service_role_required' using errcode = '42501';
  end if;
  if p_session_id is null or p_worker_instance_id is null
    or p_lease_generation is null or p_lease_generation < 1
    or p_music_version is null or p_music_version < 1
    or p_track_id is null or p_volume not between 0 and 0.5
    or p_status not in ('starting','live','degraded')
    or (p_failure_reason_code is not null
      and p_failure_reason_code !~ '^[a-z][a-z0-9_]{0,119}$') then
    raise exception 'live_program_audio_heartbeat_invalid' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('live_program_audio:' || p_session_id::text, 0));
  select * into v_configuration from public.live_odo_configuration where id = true;
  select * into v_publisher from public.live_program_audio_publishers
  where session_id = p_session_id for update;
  if v_publisher.worker_instance_id is distinct from p_worker_instance_id
    or v_publisher.lease_generation <> p_lease_generation
    or v_publisher.lease_expires_at <= v_now then
    return jsonb_build_object('renewed', false, 'reasonCode', 'program_audio_lease_lost');
  end if;

  update public.live_program_audio_publishers set
    lease_expires_at = v_now + make_interval(
      secs => v_configuration.program_audio_publisher_lease_seconds
    ),
    status = p_status,
    observed_music_version = p_music_version,
    published_track_id = p_track_id,
    published_volume = p_volume,
    consecutive_failures = case when p_status = 'degraded'
      then least(consecutive_failures + 1, 1000000) else 0 end,
    failure_reason_code = p_failure_reason_code,
    last_heartbeat_at = v_now
  where session_id = p_session_id returning * into v_publisher;

  update public.live_program_sources set
    readiness = case when p_status = 'live' then 'live'
      when p_status = 'starting' then 'preparing' else 'failed' end,
    health = case when p_status = 'live' then 'healthy'
      when p_status = 'starting' then 'unknown' else 'degraded' end,
    muted = p_volume = 0,
    failure_reason_code = p_failure_reason_code,
    version = version + 1,
    last_seen_at = v_now,
    safe_metadata = jsonb_build_object(
      'transport', 'stream_rtmp', 'trackId', p_track_id,
      'musicVersion', p_music_version
    )
  where session_id = p_session_id and source_key = 'system:programme_audio'
    and (
      readiness is distinct from case when p_status = 'live' then 'live'
        when p_status = 'starting' then 'preparing' else 'failed' end
      or health is distinct from case when p_status = 'live' then 'healthy'
        when p_status = 'starting' then 'unknown' else 'degraded' end
      or muted is distinct from (p_volume = 0)
      or failure_reason_code is distinct from p_failure_reason_code
      or safe_metadata ->> 'trackId' is distinct from p_track_id::text
      or safe_metadata ->> 'musicVersion' is distinct from p_music_version::text
      or last_seen_at is null or last_seen_at <= v_now - interval '30 seconds'
    );

  return jsonb_build_object(
    'renewed', true, 'reasonCode', 'program_audio_lease_renewed',
    'leaseExpiresAt', v_publisher.lease_expires_at
  );
end;
$$;

revoke all on function public.rpc_service_heartbeat_live_program_audio_v1(
  uuid, uuid, bigint, bigint, uuid, numeric, text, text
) from public, anon, authenticated;
grant execute on function public.rpc_service_heartbeat_live_program_audio_v1(
  uuid, uuid, bigint, bigint, uuid, numeric, text, text
) to service_role;

create or replace function public.rpc_service_release_live_program_audio_v1(
  p_session_id uuid,
  p_worker_instance_id uuid,
  p_lease_generation bigint,
  p_reason_code text default 'program_audio_released'
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  v_now timestamptz := timezone('utc', now());
  v_publisher public.live_program_audio_publishers;
begin
  if not public.live_odo_is_service_role() then
    raise exception 'live_odo_service_role_required' using errcode = '42501';
  end if;
  if p_reason_code !~ '^[a-z][a-z0-9_]{0,119}$' then
    raise exception 'live_program_audio_release_invalid' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('live_program_audio:' || p_session_id::text, 0));
  select * into v_publisher from public.live_program_audio_publishers
  where session_id = p_session_id for update;
  if v_publisher.worker_instance_id is distinct from p_worker_instance_id
    or v_publisher.lease_generation <> p_lease_generation then
    return jsonb_build_object('released', false, 'reasonCode', 'program_audio_lease_lost');
  end if;
  insert into public.live_program_audio_events(
    session_id, worker_instance_id, lease_generation, event_type,
    music_version, track_id, volume, reason_code
  ) values (
    p_session_id, p_worker_instance_id, p_lease_generation, 'released',
    v_publisher.observed_music_version, v_publisher.published_track_id,
    v_publisher.published_volume, p_reason_code
  );
  update public.live_program_audio_publishers set
    worker_instance_id = null,
    lease_expires_at = null,
    status = 'idle',
    observed_music_version = null,
    published_track_id = null,
    published_volume = 0,
    failure_reason_code = null,
    last_heartbeat_at = v_now
  where session_id = p_session_id;
  update public.live_program_sources set
    readiness = 'ended', health = 'unknown', muted = true,
    failure_reason_code = null, version = version + 1, last_seen_at = v_now
  where session_id = p_session_id and source_key = 'system:programme_audio';
  return jsonb_build_object('released', true, 'reasonCode', p_reason_code);
end;
$$;

revoke all on function public.rpc_service_release_live_program_audio_v1(
  uuid, uuid, bigint, text
) from public, anon, authenticated;
grant execute on function public.rpc_service_release_live_program_audio_v1(
  uuid, uuid, bigint, text
) to service_role;

create or replace function public.rpc_service_complete_live_program_audio_v1(
  p_session_id uuid,
  p_worker_instance_id uuid,
  p_lease_generation bigint,
  p_expected_music_version bigint
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  v_now timestamptz := timezone('utc', now());
  v_publisher public.live_program_audio_publishers;
  v_music public.live_music_session_state;
  v_track public.live_music_tracks;
  v_next_track public.live_music_tracks;
  v_action text := 'stop';
begin
  if not public.live_odo_is_service_role() then
    raise exception 'live_odo_service_role_required' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('live_program_audio:' || p_session_id::text, 0));
  select * into v_publisher from public.live_program_audio_publishers
  where session_id = p_session_id for update;
  if v_publisher.worker_instance_id is distinct from p_worker_instance_id
    or v_publisher.lease_generation <> p_lease_generation
    or v_publisher.lease_expires_at <= v_now then
    return jsonb_build_object('completed', false, 'reasonCode', 'program_audio_lease_lost');
  end if;
  select * into v_music from public.live_music_session_state
  where session_id = p_session_id for update;
  if v_music.version <> p_expected_music_version then
    return jsonb_build_object('completed', false, 'reasonCode', 'stale_music_state');
  end if;
  select * into v_track from public.live_music_tracks where id = v_music.track_id;
  if v_track.id is null or v_music.status not in ('playing','ducked','fading') then
    return jsonb_build_object('completed', false, 'reasonCode', 'active_track_required');
  end if;
  if v_music.program_started_at is null or v_music.program_started_at
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
      select track.* into v_next_track from public.live_music_tracks track
      where track.enabled and track.license_status = 'approved'
        and (track.license_expires_at is null or track.license_expires_at > v_now)
        and track.licensed_regions @> array['*']::text[]
        and (track.created_at, track.id) > (v_track.created_at, v_track.id)
      order by track.created_at, track.id limit 1;
      if v_next_track.id is null then
        select track.* into v_next_track from public.live_music_tracks track
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
      status = 'playing', track_id = v_next_track.id, mood = v_next_track.mood,
      effective_volume = requested_volume, program_started_at = v_now,
      playback_offset_seconds = 0, control_source = 'system', last_action = 'next',
      last_reason_code = 'program_audio_repeat_all_advanced', version = version + 1,
      updated_at = v_now
    where session_id = p_session_id returning * into v_music;
  else
    update public.live_music_session_state set
      status = 'stopped', track_id = null, playlist_id = null,
      effective_volume = 0, program_started_at = null, playback_offset_seconds = 0,
      control_source = 'system', last_action = 'stop',
      last_reason_code = 'program_audio_track_completed', version = version + 1,
      updated_at = v_now
    where session_id = p_session_id returning * into v_music;
  end if;
  insert into public.live_music_events(
    session_id, idempotency_key, action, source, track_id, playlist_id,
    requested_volume, effective_volume, state_version, reason_code
  ) values (
    p_session_id, gen_random_uuid(), v_action, 'system', v_music.track_id,
    v_music.playlist_id, null, v_music.effective_volume, v_music.version,
    case when v_action = 'next' then 'program_audio_repeat_all_advanced'
      else 'program_audio_track_completed' end
  );
  insert into public.live_program_audio_events(
    session_id, worker_instance_id, lease_generation, event_type,
    music_version, track_id, volume, reason_code
  ) values (
    p_session_id, p_worker_instance_id, p_lease_generation, 'completed',
    p_expected_music_version, v_track.id, v_publisher.published_volume,
    case when v_action = 'next' then 'program_audio_repeat_all_advanced'
      else 'program_audio_track_completed' end
  );
  return jsonb_build_object(
    'completed', true,
    'reasonCode', case when v_action = 'next' then 'program_audio_repeat_all_advanced'
      else 'program_audio_track_completed' end,
    'stateVersion', v_music.version
  );
end;
$$;

revoke all on function public.rpc_service_complete_live_program_audio_v1(
  uuid, uuid, bigint, bigint
) from public, anon, authenticated;
grant execute on function public.rpc_service_complete_live_program_audio_v1(
  uuid, uuid, bigint, bigint
) to service_role;

create or replace function public.rpc_service_maintain_live_program_audio_v1(
  p_limit integer default 100
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  v_now timestamptz := timezone('utc', now());
  v_expired integer := 0;
  v_degraded integer := 0;
begin
  if not public.live_odo_is_service_role() then
    raise exception 'live_odo_service_role_required' using errcode = '42501';
  end if;
  if p_limit not between 1 and 1000 then
    raise exception 'live_program_audio_maintenance_invalid' using errcode = '22023';
  end if;
  with expired as (
    select publisher.session_id
    from public.live_program_audio_publishers publisher
    where publisher.worker_instance_id is not null
      and publisher.lease_expires_at <= v_now
    order by publisher.lease_expires_at
    limit p_limit
    for update skip locked
  ), updated as (
    update public.live_program_audio_publishers publisher set
      worker_instance_id = null, lease_expires_at = null, status = 'idle',
      failure_reason_code = null
    from expired where publisher.session_id = expired.session_id
      and publisher.worker_instance_id is not null
      and publisher.lease_expires_at <= v_now
    returning publisher.*
  ), logged as (
    insert into public.live_program_audio_events(
      session_id, worker_instance_id, lease_generation, event_type,
      music_version, track_id, volume, reason_code
    ) select session_id, null, lease_generation, 'lease_expired',
      observed_music_version, published_track_id, published_volume,
      'program_audio_lease_expired' from updated
    returning session_id
  ), sources_updated as (
    update public.live_program_sources source set
      readiness = 'failed', health = 'lost', muted = true,
      failure_reason_code = 'program_audio_lease_expired',
      version = source.version + 1, last_seen_at = v_now
    where source.source_key = 'system:programme_audio'
      and exists (select 1 from updated where updated.session_id = source.session_id)
    returning source.session_id
  ) select count(*)::integer into v_expired from logged;

  with degraded as (
    update public.live_program_audio_publishers publisher set
      status = 'degraded', failure_reason_code = 'program_audio_heartbeat_stale'
    from public.live_odo_configuration configuration
    where configuration.id = true
      and publisher.worker_instance_id is not null
      and publisher.lease_expires_at > v_now
      and publisher.last_heartbeat_at <= v_now - make_interval(
        secs => configuration.program_audio_publisher_stale_seconds
      )
      and publisher.status <> 'degraded'
    returning publisher.*
  ), logged as (
    insert into public.live_program_audio_events(
      session_id, worker_instance_id, lease_generation, event_type,
      music_version, track_id, volume, reason_code
    ) select session_id, worker_instance_id, lease_generation, 'degraded',
      observed_music_version, published_track_id, published_volume,
      'program_audio_heartbeat_stale' from degraded
    returning session_id
  ), sources_updated as (
    update public.live_program_sources source set
      readiness = 'failed', health = 'degraded', muted = true,
      failure_reason_code = 'program_audio_heartbeat_stale',
      version = source.version + 1, last_seen_at = v_now
    where source.source_key = 'system:programme_audio'
      and exists (select 1 from degraded where degraded.session_id = source.session_id)
    returning source.session_id
  ) select count(*)::integer into v_degraded from logged;
  return jsonb_build_object(
    'maintained', true, 'expiredLeases', v_expired,
    'degradedPublishers', v_degraded,
    'reasonCode', 'program_audio_maintenance_complete'
  );
end;
$$;

revoke all on function public.rpc_service_maintain_live_program_audio_v1(integer)
from public, anon, authenticated;
grant execute on function public.rpc_service_maintain_live_program_audio_v1(integer)
to service_role;

-- Once the central publisher is enabled, legacy audience clients must not
-- create a second local programme mix.
alter function public.rpc_service_get_live_music_playback_v1(uuid, uuid)
rename to live_get_music_playback_without_program_audio_v1;

revoke all on function public.live_get_music_playback_without_program_audio_v1(uuid, uuid)
from public, anon, authenticated, service_role;

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
begin
  if not public.live_odo_is_service_role() then
    raise exception 'live_odo_service_role_required' using errcode = '42501';
  end if;
  if coalesce((select program_audio_publisher_enabled
      from public.live_odo_configuration where id = true), false) then
    return jsonb_build_object(
      'allowed', false, 'reasonCode', 'central_program_audio_required'
    );
  end if;
  return public.live_get_music_playback_without_program_audio_v1(
    p_session_id, p_user_id
  );
end;
$$;

revoke all on function public.rpc_service_get_live_music_playback_v1(uuid, uuid)
from public, anon, authenticated;
grant execute on function public.rpc_service_get_live_music_playback_v1(uuid, uuid)
to service_role;

alter function public.run_live_maintenance()
rename to run_live_maintenance_without_program_audio_v1;

revoke all on function public.run_live_maintenance_without_program_audio_v1()
from public, anon, authenticated;

create or replace function public.run_live_maintenance()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  v_base jsonb;
  v_audio jsonb;
  v_failures integer := 0;
begin
  if current_user <> 'postgres' and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'live_maintenance_forbidden' using errcode = '42501';
  end if;
  v_base := public.run_live_maintenance_without_program_audio_v1();
  if v_base ->> 'status' = 'skipped_locked' then return v_base; end if;
  perform set_config('request.jwt.claim.role', 'service_role', true);
  begin
    v_audio := public.rpc_service_maintain_live_program_audio_v1(100);
  exception when others then
    v_failures := 1;
    v_audio := jsonb_build_object(
      'maintained', false, 'reasonCode', 'program_audio_maintenance_failed'
    );
    insert into public.live_maintenance_failures(task_name, sqlstate, error_message)
    values ('program_audio', sqlstate, left(sqlerrm, 500));
  end;
  return v_base || jsonb_build_object(
    'programAudio', v_audio,
    'programAudioFailures', v_failures
  );
end;
$$;

revoke all on function public.run_live_maintenance() from public, anon, authenticated;
grant execute on function public.run_live_maintenance() to service_role;

comment on table public.live_program_audio_publishers is
  'Fenced, failover-safe leases for the single Stream programme-audio ingress per Live.';
comment on function public.rpc_service_claim_live_program_audio_v1(uuid, uuid) is
  'Claims one Live audio publisher lease and returns only approved authoritative track metadata.';

commit;
