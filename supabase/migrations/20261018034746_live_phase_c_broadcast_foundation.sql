-- Betweener Live Phase C: broadcast expansion control-plane foundation.
--
-- Supabase remains the business authority. A persistent compositor worker owns
-- media composition and Stream remains the RTC/HLS transport. This migration
-- deliberately ships closed: no HLS, recording, captions, translation, clips,
-- or highlights start until their individual flags are enabled.

begin;

alter table public.live_odo_configuration
  add column if not exists broadcast_compositor_enabled boolean not null default false,
  add column if not exists broadcast_hls_enabled boolean not null default false,
  add column if not exists broadcast_recording_enabled boolean not null default false,
  add column if not exists broadcast_captions_enabled boolean not null default false,
  add column if not exists broadcast_translation_enabled boolean not null default false,
  add column if not exists broadcast_clips_enabled boolean not null default false,
  add column if not exists broadcast_highlights_enabled boolean not null default false,
  add column if not exists broadcast_compositor_lease_seconds integer not null default 30,
  add column if not exists broadcast_compositor_stale_seconds integer not null default 20;

alter table public.live_odo_configuration
  add constraint live_broadcast_compositor_lease_valid check (
    broadcast_compositor_lease_seconds between 15 and 120
  ),
  add constraint live_broadcast_compositor_stale_valid check (
    broadcast_compositor_stale_seconds between 10 and 90
    and broadcast_compositor_stale_seconds < broadcast_compositor_lease_seconds
  ),
  add constraint live_broadcast_feature_dependencies_valid check (
    (not broadcast_hls_enabled or broadcast_compositor_enabled)
    and (not broadcast_recording_enabled or broadcast_compositor_enabled)
    and (not broadcast_captions_enabled or broadcast_compositor_enabled)
    and (not broadcast_translation_enabled or broadcast_captions_enabled)
    and (not broadcast_clips_enabled or broadcast_recording_enabled)
    and (not broadcast_highlights_enabled or broadcast_clips_enabled)
  );

alter table public.live_sessions
  add column if not exists broadcast_delivery_mode text not null default 'rtc_only',
  add column if not exists caption_source_language text,
  add column if not exists caption_translation_languages text[] not null default '{}'::text[];

alter table public.live_sessions
  add constraint live_sessions_broadcast_delivery_mode_valid check (
    broadcast_delivery_mode in ('rtc_only', 'hybrid_hls')
  ),
  add constraint live_sessions_caption_source_language_valid check (
    caption_source_language is null
    or caption_source_language ~ '^[a-z]{2,3}(-[A-Z]{2})?$'
  ),
  add constraint live_sessions_caption_translation_languages_valid check (
    cardinality(caption_translation_languages) <= 5
    and array_position(caption_translation_languages, null) is null
  );

create table public.live_broadcast_runtimes (
  session_id uuid primary key references public.live_sessions(id) on delete cascade,
  worker_instance_id uuid,
  lease_generation bigint not null default 1 check (lease_generation > 0),
  lease_expires_at timestamptz,
  compositor_status text not null default 'idle' check (compositor_status in (
    'idle', 'claiming', 'starting', 'ready', 'live', 'degraded', 'stopping', 'ended', 'failed'
  )),
  observed_program_version bigint check (observed_program_version is null or observed_program_version > 0),
  output_provider_user_id text not null check (
    output_provider_user_id ~ '^studio-program-[0-9a-f]{32}$'
  ),
  hls_status text not null default 'disabled' check (hls_status in (
    'disabled', 'starting', 'live', 'stopping', 'failed'
  )),
  hls_playlist_url text check (
    hls_playlist_url is null
    or (hls_playlist_url ~ '^https://[^[:space:]]+$' and char_length(hls_playlist_url) <= 2048)
  ),
  recording_status text not null default 'disabled' check (recording_status in (
    'disabled', 'pending_consent', 'starting', 'recording', 'processing', 'ready', 'failed'
  )),
  captions_status text not null default 'disabled' check (captions_status in (
    'disabled', 'starting', 'live', 'stopping', 'failed'
  )),
  failure_reason_code text check (
    failure_reason_code is null or failure_reason_code ~ '^[a-z][a-z0-9_]{0,119}$'
  ),
  last_heartbeat_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint live_broadcast_runtime_lease_shape check (
    (worker_instance_id is null and lease_expires_at is null and compositor_status in ('idle', 'ended'))
    or (worker_instance_id is not null and lease_expires_at is not null
      and compositor_status not in ('idle', 'ended'))
  ),
  constraint live_broadcast_runtime_hls_shape check (
    (hls_status = 'live' and hls_playlist_url is not null)
    or (hls_status <> 'live' and hls_playlist_url is null)
  )
);

create index live_broadcast_runtimes_lease_idx
  on public.live_broadcast_runtimes(lease_expires_at, compositor_status);

create table public.live_public_media_consents (
  session_id uuid not null references public.live_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  purpose text not null check (purpose in ('recording', 'clip')),
  granted boolean not null,
  policy_version text not null check (
    policy_version ~ '^[a-z0-9][a-z0-9._-]{0,39}$'
  ),
  decided_at timestamptz not null default timezone('utc', now()),
  revoked_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (session_id, user_id, purpose),
  constraint live_public_media_consent_state_valid check (
    (granted and revoked_at is null) or (not granted and revoked_at is not null)
  )
);

create index live_public_media_consents_user_idx
  on public.live_public_media_consents(user_id, session_id);

create or replace function public.live_broadcast_artifact_metadata_safe_v1(
  p_metadata jsonb
)
returns boolean
language plpgsql
immutable
set search_path = public, pg_catalog
as $$
declare
  v_key text;
  v_value jsonb;
begin
  if jsonb_typeof(coalesce(p_metadata, '{}'::jsonb)) <> 'object' then
    return false;
  end if;
  for v_key, v_value in
    select metadata.key, metadata.value
    from jsonb_each(coalesce(p_metadata, '{}'::jsonb)) metadata
  loop
    if v_key in ('programVersion', 'width', 'height') then
      if jsonb_typeof(v_value) <> 'number'
        or (v_value #>> '{}') !~ '^[1-9][0-9]*$' then
        return false;
      end if;
    elsif v_key = 'translationLanguages' then
      if jsonb_typeof(v_value) <> 'array'
        or jsonb_array_length(v_value) > 5
        or exists (
          select 1 from jsonb_array_elements(v_value) item
          where jsonb_typeof(item) <> 'string'
            or char_length(item #>> '{}') not between 1 and 256
        ) then
        return false;
      end if;
    elsif v_key in (
      'scene', 'canvas', 'language', 'aspectRatio', 'codec', 'container',
      'providerAssetId', 'consentVersion', 'startedAt', 'endedAt'
    ) then
      if jsonb_typeof(v_value) <> 'string'
        or char_length(v_value #>> '{}') not between 1 and 256 then
        return false;
      end if;
    else
      return false;
    end if;
  end loop;
  return true;
end;
$$;

create table public.live_broadcast_artifacts (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.live_sessions(id) on delete cascade,
  kind text not null check (kind in (
    'recording', 'replay', 'clip', 'caption', 'transcript', 'vertical_highlight'
  )),
  status text not null default 'pending' check (status in (
    'pending', 'processing', 'ready', 'rejected', 'expired', 'deleted', 'failed'
  )),
  source_artifact_id uuid references public.live_broadcast_artifacts(id) on delete restrict,
  storage_provider text not null check (storage_provider in ('stream', 'supabase')),
  object_key text not null check (
    char_length(object_key) between 1 and 1024 and object_key !~ '[[:cntrl:]]'
  ),
  visibility text not null default 'private' check (visibility in ('private', 'unlisted', 'public')),
  duration_milliseconds integer check (duration_milliseconds is null or duration_milliseconds > 0),
  consent_snapshot_hash text not null check (
    consent_snapshot_hash ~ '^[a-f0-9]{64}$'
  ),
  safe_metadata jsonb not null default '{}'::jsonb,
  available_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint live_broadcast_artifact_metadata_safe check (
    public.live_broadcast_artifact_metadata_safe_v1(safe_metadata)
  ),
  constraint live_broadcast_artifact_source_valid check (
    (kind in ('recording', 'caption', 'transcript') and source_artifact_id is null)
    or (kind in ('replay', 'clip', 'vertical_highlight') and source_artifact_id is not null)
  ),
  constraint live_broadcast_artifact_availability_valid check (
    (status = 'ready' and available_at is not null) or status <> 'ready'
  ),
  constraint live_broadcast_artifact_expiry_valid check (
    expires_at is null or expires_at > created_at
  )
);

create index live_broadcast_artifacts_session_idx
  on public.live_broadcast_artifacts(session_id, kind, created_at desc);

create table public.live_broadcast_runtime_events (
  id bigint generated always as identity primary key,
  session_id uuid not null references public.live_sessions(id) on delete cascade,
  worker_instance_id uuid,
  lease_generation bigint not null check (lease_generation > 0),
  event_type text not null check (event_type in (
    'claimed', 'starting', 'ready', 'live', 'heartbeat', 'degraded',
    'stopping', 'ended', 'failed', 'released', 'lease_expired'
  )),
  program_version bigint check (program_version is null or program_version > 0),
  reason_code text not null check (reason_code ~ '^[a-z][a-z0-9_]{0,119}$'),
  created_at timestamptz not null default timezone('utc', now())
);

create index live_broadcast_runtime_events_session_idx
  on public.live_broadcast_runtime_events(session_id, created_at desc);

alter table public.live_broadcast_runtimes enable row level security;
alter table public.live_broadcast_runtimes force row level security;
alter table public.live_public_media_consents enable row level security;
alter table public.live_public_media_consents force row level security;
alter table public.live_broadcast_artifacts enable row level security;
alter table public.live_broadcast_artifacts force row level security;
alter table public.live_broadcast_runtime_events enable row level security;
alter table public.live_broadcast_runtime_events force row level security;

revoke all on table public.live_broadcast_runtimes,
  public.live_public_media_consents,
  public.live_broadcast_artifacts,
  public.live_broadcast_runtime_events
from public, anon, authenticated;

grant all on table public.live_broadcast_runtimes,
  public.live_public_media_consents,
  public.live_broadcast_artifacts,
  public.live_broadcast_runtime_events
to service_role;

create trigger live_broadcast_runtimes_set_updated_at
before update on public.live_broadcast_runtimes
for each row execute function public.set_updated_at();

create trigger live_public_media_consents_set_updated_at
before update on public.live_public_media_consents
for each row execute function public.set_updated_at();

create trigger live_broadcast_artifacts_set_updated_at
before update on public.live_broadcast_artifacts
for each row execute function public.set_updated_at();

create or replace function public.rpc_set_live_public_media_consent_v1(
  p_session_id uuid,
  p_purpose text,
  p_granted boolean,
  p_policy_version text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  v_user_id uuid := auth.uid();
  v_session public.live_sessions;
begin
  if v_user_id is null then
    raise exception 'live_authentication_required' using errcode = '42501';
  end if;
  if p_purpose not in ('recording', 'clip')
    or p_policy_version !~ '^[a-z0-9][a-z0-9._-]{0,39}$' then
    raise exception 'live_public_media_consent_invalid' using errcode = '22023';
  end if;

  select * into v_session from public.live_sessions where id = p_session_id;
  if v_session.id is null or v_session.status in ('ended', 'cancelled') then
    raise exception 'live_session_unavailable' using errcode = 'P0002';
  end if;
  if v_session.created_by_user_id <> v_user_id and not exists (
    select 1 from public.live_participants participant
    where participant.session_id = p_session_id
      and participant.user_id = v_user_id
      and participant.state not in ('left', 'removed', 'banned')
  ) then
    raise exception 'live_participant_required' using errcode = '42501';
  end if;

  insert into public.live_public_media_consents(
    session_id, user_id, purpose, granted, policy_version, decided_at, revoked_at
  ) values (
    p_session_id, v_user_id, p_purpose, p_granted, p_policy_version,
    timezone('utc', now()),
    case when p_granted then null else timezone('utc', now()) end
  )
  on conflict (session_id, user_id, purpose) do update set
    granted = excluded.granted,
    policy_version = excluded.policy_version,
    decided_at = excluded.decided_at,
    revoked_at = excluded.revoked_at;

  return jsonb_build_object(
    'updated', true,
    'purpose', p_purpose,
    'granted', p_granted,
    'reasonCode', case when p_granted
      then 'live_public_media_consent_granted'
      else 'live_public_media_consent_revoked'
    end
  );
end;
$$;

create or replace function public.live_public_media_consent_ready_v1(
  p_session_id uuid,
  p_purpose text
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
  with required_users as (
    select session.created_by_user_id as user_id
    from public.live_sessions session
    where session.id = p_session_id
    union
    select participant.user_id
    from public.live_participants participant
    where participant.session_id = p_session_id
      and participant.state in ('backstage', 'on_stage')
      and participant.role in ('participant', 'host')
  )
  select p_purpose in ('recording', 'clip')
    and exists (select 1 from required_users)
    and not exists (
      select 1 from required_users required
      left join public.live_public_media_consents consent
        on consent.session_id = p_session_id
       and consent.user_id = required.user_id
       and consent.purpose = p_purpose
       and consent.granted
       and consent.revoked_at is null
      where consent.user_id is null
    );
$$;

create or replace function public.rpc_service_list_live_broadcast_work_v1(
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
    raise exception 'live_broadcast_work_invalid' using errcode = '22023';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'sessionId', work.session_id,
    'sessionStatus', work.session_status,
    'deliveryMode', work.broadcast_delivery_mode,
    'programVersion', work.program_version,
    'leaseOwned', work.worker_instance_id = p_worker_instance_id,
    'leaseExpiresAt', work.lease_expires_at
  ) order by work.updated_at), '[]'::jsonb)
  into v_result
  from (
    select session.id as session_id,
      session.status as session_status,
      session.broadcast_delivery_mode,
      program.program_version,
      runtime.worker_instance_id,
      runtime.lease_expires_at,
      greatest(session.updated_at, program.updated_at, coalesce(runtime.updated_at, session.updated_at)) as updated_at
    from public.live_sessions session
    join public.live_odo_show_sessions program on program.session_id = session.id
    left join public.live_broadcast_runtimes runtime on runtime.session_id = session.id
    cross join public.live_odo_configuration configuration
    where configuration.id = true
      and configuration.broadcast_compositor_enabled
      and not configuration.circuit_breaker_open
      and session.provider = 'stream'
      and (
        session.status in ('backstage', 'live', 'ending')
        or runtime.worker_instance_id = p_worker_instance_id
      )
    order by greatest(session.updated_at, program.updated_at, coalesce(runtime.updated_at, session.updated_at))
    limit p_limit
  ) work;
  return v_result;
end;
$$;

create or replace function public.rpc_service_claim_live_broadcast_v1(
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
  v_program public.live_odo_show_sessions;
  v_runtime public.live_broadcast_runtimes;
  v_provider_user_id text;
begin
  if not public.live_odo_is_service_role() then
    raise exception 'live_odo_service_role_required' using errcode = '42501';
  end if;
  if p_session_id is null or p_worker_instance_id is null then
    raise exception 'live_broadcast_claim_invalid' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('live_broadcast:' || p_session_id::text, 0));
  select * into v_configuration from public.live_odo_configuration where id = true;
  select * into v_session from public.live_sessions where id = p_session_id;
  select * into v_program from public.live_odo_show_sessions where session_id = p_session_id;

  if not coalesce(v_configuration.broadcast_compositor_enabled, false) then
    return jsonb_build_object('claimed', false, 'reasonCode', 'broadcast_compositor_disabled');
  elsif coalesce(v_configuration.circuit_breaker_open, true) then
    return jsonb_build_object('claimed', false, 'reasonCode', 'broadcast_circuit_breaker_open');
  elsif v_session.id is null or v_session.provider <> 'stream'
    or v_session.status not in ('backstage', 'live', 'ending') then
    return jsonb_build_object('claimed', false, 'reasonCode', 'live_session_unavailable');
  elsif v_program.session_id is null then
    return jsonb_build_object('claimed', false, 'reasonCode', 'live_program_unavailable');
  end if;

  v_provider_user_id := 'studio-program-' || replace(p_session_id::text, '-', '');
  select * into v_runtime from public.live_broadcast_runtimes
  where session_id = p_session_id for update;

  if v_runtime.session_id is null then
    insert into public.live_broadcast_runtimes(
      session_id, worker_instance_id, lease_expires_at, compositor_status,
      observed_program_version, output_provider_user_id, hls_status,
      recording_status, captions_status, last_heartbeat_at
    ) values (
      p_session_id, p_worker_instance_id,
      v_now + make_interval(secs => v_configuration.broadcast_compositor_lease_seconds),
      'claiming', v_program.program_version, v_provider_user_id,
      case when v_configuration.broadcast_hls_enabled
        and v_session.broadcast_delivery_mode = 'hybrid_hls' then 'starting' else 'disabled' end,
      case when v_configuration.broadcast_recording_enabled and v_session.recording_enabled
        then 'pending_consent' else 'disabled' end,
      case when v_configuration.broadcast_captions_enabled and v_session.captions_enabled
        then 'starting' else 'disabled' end,
      v_now
    ) returning * into v_runtime;
  elsif v_runtime.worker_instance_id is distinct from p_worker_instance_id
    and v_runtime.lease_expires_at > v_now then
    return jsonb_build_object(
      'claimed', false,
      'reasonCode', 'broadcast_lease_busy',
      'retryAfter', v_runtime.lease_expires_at
    );
  else
    update public.live_broadcast_runtimes set
      worker_instance_id = p_worker_instance_id,
      lease_generation = case
        when worker_instance_id is distinct from p_worker_instance_id then lease_generation + 1
        else lease_generation
      end,
      lease_expires_at = v_now + make_interval(
        secs => v_configuration.broadcast_compositor_lease_seconds
      ),
      compositor_status = 'claiming',
      observed_program_version = v_program.program_version,
      hls_status = case when v_configuration.broadcast_hls_enabled
        and v_session.broadcast_delivery_mode = 'hybrid_hls' then 'starting' else 'disabled' end,
      hls_playlist_url = null,
      recording_status = case when v_configuration.broadcast_recording_enabled
        and v_session.recording_enabled then 'pending_consent' else 'disabled' end,
      captions_status = case when v_configuration.broadcast_captions_enabled
        and v_session.captions_enabled then 'starting' else 'disabled' end,
      failure_reason_code = null,
      last_heartbeat_at = v_now
    where session_id = p_session_id
    returning * into v_runtime;
  end if;

  insert into public.live_broadcast_runtime_events(
    session_id, worker_instance_id, lease_generation, event_type,
    program_version, reason_code
  ) values (
    p_session_id, p_worker_instance_id, v_runtime.lease_generation,
    'claimed', v_program.program_version, 'broadcast_lease_claimed'
  );

  return jsonb_build_object(
    'claimed', true,
    'reasonCode', 'broadcast_lease_claimed',
    'sessionId', p_session_id,
    'sessionStatus', v_session.status,
    'deliveryMode', v_session.broadcast_delivery_mode,
    'leaseGeneration', v_runtime.lease_generation,
    'leaseExpiresAt', v_runtime.lease_expires_at,
    'providerCallType', v_session.provider_call_type,
    'providerCallId', v_session.provider_call_id,
    'providerUserId', v_runtime.output_provider_user_id,
    'program', jsonb_build_object(
      'version', v_program.program_version,
      'scene', v_program.current_scene,
      'canvas', v_program.target_canvas,
      'sourceAssignments', v_program.source_assignments
    ),
    'outputs', jsonb_build_object(
      'hls', v_runtime.hls_status <> 'disabled',
      'recording', v_runtime.recording_status <> 'disabled',
      'captions', v_runtime.captions_status <> 'disabled',
      'translationLanguages', case
        when v_configuration.broadcast_translation_enabled
          then to_jsonb(v_session.caption_translation_languages)
        else '[]'::jsonb
      end
    )
  );
end;
$$;

create or replace function public.rpc_service_heartbeat_live_broadcast_v1(
  p_session_id uuid,
  p_worker_instance_id uuid,
  p_lease_generation bigint,
  p_program_version bigint,
  p_compositor_status text,
  p_hls_status text,
  p_hls_playlist_url text,
  p_recording_status text,
  p_captions_status text,
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
  v_runtime public.live_broadcast_runtimes;
begin
  if not public.live_odo_is_service_role() then
    raise exception 'live_odo_service_role_required' using errcode = '42501';
  end if;
  if p_session_id is null or p_worker_instance_id is null
    or p_lease_generation < 1 or p_program_version < 1
    or p_compositor_status not in ('starting', 'ready', 'live', 'degraded', 'stopping', 'failed')
    or p_hls_status not in ('disabled', 'starting', 'live', 'stopping', 'failed')
    or p_recording_status not in ('disabled', 'pending_consent', 'starting', 'recording', 'processing', 'ready', 'failed')
    or p_captions_status not in ('disabled', 'starting', 'live', 'stopping', 'failed')
    or (p_hls_status = 'live' and (
      p_hls_playlist_url is null or p_hls_playlist_url !~ '^https://[^[:space:]]+$'
      or char_length(p_hls_playlist_url) > 2048
    ))
    or (p_hls_status <> 'live' and p_hls_playlist_url is not null)
    or (p_failure_reason_code is not null
      and p_failure_reason_code !~ '^[a-z][a-z0-9_]{0,119}$') then
    raise exception 'live_broadcast_heartbeat_invalid' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('live_broadcast:' || p_session_id::text, 0));
  select * into v_configuration from public.live_odo_configuration where id = true;
  select * into v_runtime from public.live_broadcast_runtimes
  where session_id = p_session_id for update;
  if v_runtime.worker_instance_id is distinct from p_worker_instance_id
    or v_runtime.lease_generation <> p_lease_generation
    or v_runtime.lease_expires_at <= v_now then
    return jsonb_build_object('renewed', false, 'reasonCode', 'broadcast_lease_lost');
  end if;

  update public.live_broadcast_runtimes set
    lease_expires_at = v_now + make_interval(
      secs => v_configuration.broadcast_compositor_lease_seconds
    ),
    compositor_status = p_compositor_status,
    observed_program_version = p_program_version,
    hls_status = p_hls_status,
    hls_playlist_url = p_hls_playlist_url,
    recording_status = p_recording_status,
    captions_status = p_captions_status,
    failure_reason_code = p_failure_reason_code,
    last_heartbeat_at = v_now
  where session_id = p_session_id
  returning * into v_runtime;

  insert into public.live_broadcast_runtime_events(
    session_id, worker_instance_id, lease_generation, event_type,
    program_version, reason_code
  ) values (
    p_session_id, p_worker_instance_id, p_lease_generation,
    case p_compositor_status
      when 'degraded' then 'degraded'
      when 'failed' then 'failed'
      else 'heartbeat'
    end,
    p_program_version,
    coalesce(p_failure_reason_code, 'broadcast_lease_renewed')
  );

  return jsonb_build_object(
    'renewed', true,
    'reasonCode', 'broadcast_lease_renewed',
    'leaseExpiresAt', v_runtime.lease_expires_at
  );
end;
$$;

create or replace function public.rpc_service_release_live_broadcast_v1(
  p_session_id uuid,
  p_worker_instance_id uuid,
  p_lease_generation bigint,
  p_reason_code text default 'broadcast_released'
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  v_runtime public.live_broadcast_runtimes;
begin
  if not public.live_odo_is_service_role() then
    raise exception 'live_odo_service_role_required' using errcode = '42501';
  end if;
  if p_reason_code !~ '^[a-z][a-z0-9_]{0,119}$' then
    raise exception 'live_broadcast_release_invalid' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('live_broadcast:' || p_session_id::text, 0));
  select * into v_runtime from public.live_broadcast_runtimes
  where session_id = p_session_id for update;
  if v_runtime.worker_instance_id is distinct from p_worker_instance_id
    or v_runtime.lease_generation <> p_lease_generation then
    return jsonb_build_object('released', false, 'reasonCode', 'broadcast_lease_lost');
  end if;

  insert into public.live_broadcast_runtime_events(
    session_id, worker_instance_id, lease_generation, event_type,
    program_version, reason_code
  ) values (
    p_session_id, p_worker_instance_id, p_lease_generation, 'released',
    v_runtime.observed_program_version, p_reason_code
  );

  update public.live_broadcast_runtimes set
    worker_instance_id = null,
    lease_expires_at = null,
    compositor_status = 'ended',
    hls_status = 'disabled',
    hls_playlist_url = null,
    recording_status = case when recording_status in ('recording', 'processing')
      then 'processing' else recording_status end,
    captions_status = 'disabled',
    failure_reason_code = null,
    last_heartbeat_at = timezone('utc', now())
  where session_id = p_session_id;

  return jsonb_build_object('released', true, 'reasonCode', p_reason_code);
end;
$$;

create or replace function public.rpc_service_maintain_live_broadcast_v1(
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
begin
  if not public.live_odo_is_service_role() then
    raise exception 'live_odo_service_role_required' using errcode = '42501';
  end if;
  if p_limit not between 1 and 1000 then
    raise exception 'live_broadcast_maintenance_invalid' using errcode = '22023';
  end if;

  with expired as (
    select runtime.session_id
    from public.live_broadcast_runtimes runtime
    where runtime.worker_instance_id is not null
      and runtime.lease_expires_at <= v_now
    order by runtime.lease_expires_at
    limit p_limit
    for update skip locked
  ), updated as (
    update public.live_broadcast_runtimes runtime set
      worker_instance_id = null,
      lease_expires_at = null,
      compositor_status = 'ended',
      hls_status = 'disabled',
      hls_playlist_url = null,
      recording_status = case when runtime.recording_status in ('recording', 'processing')
        then 'processing' else runtime.recording_status end,
      captions_status = 'disabled',
      failure_reason_code = 'broadcast_lease_expired',
      last_heartbeat_at = v_now
    from expired
    where runtime.session_id = expired.session_id
    returning runtime.*
  ), logged as (
    insert into public.live_broadcast_runtime_events(
      session_id, worker_instance_id, lease_generation, event_type,
      program_version, reason_code
    )
    select session_id, null, lease_generation, 'lease_expired',
      observed_program_version, 'broadcast_lease_expired'
    from updated
    returning session_id
  )
  select count(*)::integer into v_expired from logged;

  return jsonb_build_object(
    'maintained', true,
    'expiredLeases', v_expired,
    'reasonCode', 'broadcast_maintenance_complete'
  );
end;
$$;

create or replace function public.rpc_get_live_audience_delivery_v1(
  p_session_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  v_user_id uuid := auth.uid();
  v_session public.live_sessions;
  v_runtime public.live_broadcast_runtimes;
  v_participant public.live_participants;
  v_interactive boolean := false;
  v_hls_ready boolean := false;
begin
  if v_user_id is null then
    raise exception 'live_authentication_required' using errcode = '42501';
  end if;
  select * into v_session from public.live_sessions where id = p_session_id;
  if v_session.id is null then
    raise exception 'live_session_not_found' using errcode = 'P0002';
  end if;
  select * into v_participant from public.live_participants
  where session_id = p_session_id and user_id = v_user_id;
  if v_session.created_by_user_id <> v_user_id
    and (v_participant.id is null or v_participant.state in ('left', 'removed', 'banned')) then
    raise exception 'live_participant_required' using errcode = '42501';
  end if;

  select * into v_runtime from public.live_broadcast_runtimes
  where session_id = p_session_id;
  v_interactive := v_session.created_by_user_id = v_user_id
    or v_participant.state in ('backstage', 'on_stage', 'stage_requested')
    or v_participant.role in ('host', 'moderator', 'internal_admin')
    or 'live.publish' = any(public.resolve_live_capabilities(p_session_id, v_user_id))
    or 'live.manage_stage' = any(public.resolve_live_capabilities(p_session_id, v_user_id));
  v_hls_ready := v_session.status = 'live'
    and v_session.broadcast_delivery_mode = 'hybrid_hls'
    and v_runtime.compositor_status = 'live'
    and v_runtime.hls_status = 'live'
    and v_runtime.hls_playlist_url is not null;

  return jsonb_build_object(
    'schemaVersion', 1,
    'sessionId', p_session_id,
    'transport', case
      when v_interactive then 'rtc_interactive'
      when v_hls_ready then 'hls_passive'
      else 'rtc_fallback'
    end,
    'interactive', v_interactive,
    'hls', case when not v_interactive and v_hls_ready then jsonb_build_object(
      'playlistUrl', v_runtime.hls_playlist_url,
      'latencyClass', 'standard'
    ) else null end,
    'engagementTransport', 'supabase_realtime',
    'reasonCode', case
      when v_interactive then 'live_interactive_rtc_required'
      when v_hls_ready then 'live_passive_hls_ready'
      else 'live_hls_fallback_to_rtc'
    end
  );
end;
$$;

revoke all on function public.rpc_set_live_public_media_consent_v1(
  uuid, text, boolean, text
) from public, anon;
grant execute on function public.rpc_set_live_public_media_consent_v1(
  uuid, text, boolean, text
) to authenticated;

revoke all on function public.live_public_media_consent_ready_v1(
  uuid, text
) from public, anon, authenticated;
grant execute on function public.live_public_media_consent_ready_v1(
  uuid, text
) to service_role;

revoke all on function public.rpc_service_list_live_broadcast_work_v1(
  uuid, integer
) from public, anon, authenticated;
grant execute on function public.rpc_service_list_live_broadcast_work_v1(
  uuid, integer
) to service_role;

revoke all on function public.rpc_service_claim_live_broadcast_v1(
  uuid, uuid
) from public, anon, authenticated;
grant execute on function public.rpc_service_claim_live_broadcast_v1(
  uuid, uuid
) to service_role;

revoke all on function public.rpc_service_heartbeat_live_broadcast_v1(
  uuid, uuid, bigint, bigint, text, text, text, text, text, text
) from public, anon, authenticated;
grant execute on function public.rpc_service_heartbeat_live_broadcast_v1(
  uuid, uuid, bigint, bigint, text, text, text, text, text, text
) to service_role;

revoke all on function public.rpc_service_release_live_broadcast_v1(
  uuid, uuid, bigint, text
) from public, anon, authenticated;
grant execute on function public.rpc_service_release_live_broadcast_v1(
  uuid, uuid, bigint, text
) to service_role;

revoke all on function public.rpc_service_maintain_live_broadcast_v1(integer)
from public, anon, authenticated;
grant execute on function public.rpc_service_maintain_live_broadcast_v1(integer)
to service_role;

revoke all on function public.rpc_get_live_audience_delivery_v1(uuid)
from public, anon;
grant execute on function public.rpc_get_live_audience_delivery_v1(uuid)
to authenticated;

alter function public.run_live_maintenance()
rename to run_live_maintenance_without_broadcast_phase_c_v1;

revoke all on function public.run_live_maintenance_without_broadcast_phase_c_v1()
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
  v_broadcast jsonb;
  v_failures integer := 0;
begin
  if current_user <> 'postgres' and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'live_maintenance_forbidden' using errcode = '42501';
  end if;
  v_base := public.run_live_maintenance_without_broadcast_phase_c_v1();
  if v_base ->> 'status' = 'skipped_locked' then return v_base; end if;
  perform set_config('request.jwt.claim.role', 'service_role', true);
  begin
    v_broadcast := public.rpc_service_maintain_live_broadcast_v1(100);
  exception when others then
    v_failures := 1;
    v_broadcast := jsonb_build_object(
      'maintained', false,
      'reasonCode', 'broadcast_maintenance_failed'
    );
    insert into public.live_maintenance_failures(task_name, sqlstate, error_message)
    values ('broadcast', sqlstate, left(sqlerrm, 500));
  end;
  return v_base || jsonb_build_object(
    'broadcast', v_broadcast,
    'broadcastFailures', v_failures
  );
end;
$$;

revoke all on function public.run_live_maintenance()
from public, anon, authenticated;
grant execute on function public.run_live_maintenance() to service_role;

comment on table public.live_broadcast_runtimes is
  'Fenced ownership and safe status for the single server-side Program compositor per public Live.';
comment on table public.live_public_media_consents is
  'Explicit public-stage recording and clip consent. Private Spark media is never represented here.';
comment on table public.live_broadcast_artifacts is
  'Server-owned public Program artifacts. Object locations and consent evidence are never directly client-readable.';
comment on function public.rpc_get_live_audience_delivery_v1(uuid) is
  'Routes interactive operators and speakers through RTC, passive audiences through ready HLS, and safely falls back to RTC.';
comment on function public.live_broadcast_artifact_metadata_safe_v1(jsonb) is
  'Allowlist that keeps reactions, messages, private decisions, sparks, ballots, and other engagement data out of artifact metadata.';

commit;
