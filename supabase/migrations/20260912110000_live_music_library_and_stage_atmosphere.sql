-- Betweener Live Phase 10G: global Programme Music catalogue and
-- participant-synchronised Stage Atmosphere.

begin;

create table public.live_stage_atmospheres (
  session_id uuid primary key references public.live_sessions(id) on delete cascade,
  preset text not null default 'brand_teal' check (preset in (
    'brand_teal', 'deep_ocean', 'aurora', 'oat_noir', 'live_poster'
  )),
  version bigint not null default 1 check (version > 0),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.live_stage_atmosphere_events (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.live_sessions(id) on delete cascade,
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  preset text not null check (preset in (
    'brand_teal', 'deep_ocean', 'aurora', 'oat_noir', 'live_poster'
  )),
  state_version bigint not null check (state_version > 0),
  request_id uuid not null unique,
  created_at timestamptz not null default timezone('utc', now())
);

create index live_stage_atmosphere_events_session_idx
  on public.live_stage_atmosphere_events(session_id, created_at desc);

alter table public.live_stage_atmospheres enable row level security;
alter table public.live_stage_atmosphere_events enable row level security;

create policy live_stage_atmospheres_participant_select
on public.live_stage_atmospheres for select to authenticated
using (exists (
  select 1 from public.live_participants participant
  where participant.session_id = live_stage_atmospheres.session_id
    and participant.user_id = auth.uid()
    and participant.state not in ('left', 'removed', 'banned')
));

revoke all on table public.live_stage_atmospheres,
  public.live_stage_atmosphere_events from public, anon, authenticated;
grant select on table public.live_stage_atmospheres to authenticated;

alter table public.live_stage_atmospheres replica identity full;
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'live_stage_atmospheres'
  ) then
    alter publication supabase_realtime add table public.live_stage_atmospheres;
  end if;
end;
$$;

create or replace function public.live_stage_atmosphere_snapshot_v1(
  p_session_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
  select jsonb_build_object(
    'schemaVersion', 1,
    'sessionId', session.id,
    'preset', coalesce(atmosphere.preset, 'brand_teal'),
    'posterPath', session.configuration #>> '{event_media,poster_path}',
    'hasPoster', nullif(btrim(coalesce(
      session.configuration #>> '{event_media,poster_path}', ''
    )), '') is not null,
    'version', coalesce(atmosphere.version, 0),
    'updatedAt', atmosphere.updated_at
  )
  from public.live_sessions session
  left join public.live_stage_atmospheres atmosphere
    on atmosphere.session_id = session.id
  where session.id = p_session_id;
$$;

revoke all on function public.live_stage_atmosphere_snapshot_v1(uuid)
from public, anon, authenticated, service_role;

create or replace function public.rpc_get_live_stage_atmosphere_v1(
  p_session_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
begin
  if auth.uid() is null or not (
    exists (
      select 1 from public.live_participants participant
      where participant.session_id = p_session_id
        and participant.user_id = auth.uid()
        and participant.state not in ('left', 'removed', 'banned')
    )
    or public.live_studio_is_authorized_v1(p_session_id, auth.uid(), 'view')
  ) then
    raise exception 'live_stage_atmosphere_forbidden' using errcode = '42501';
  end if;
  return public.live_stage_atmosphere_snapshot_v1(p_session_id);
end;
$$;

revoke all on function public.rpc_get_live_stage_atmosphere_v1(uuid)
from public, anon;
grant execute on function public.rpc_get_live_stage_atmosphere_v1(uuid)
to authenticated, service_role;

create or replace function public.rpc_host_set_live_stage_atmosphere_v1(
  p_session_id uuid,
  p_preset text,
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
  v_session public.live_sessions;
  v_current public.live_stage_atmospheres;
  v_version bigint;
begin
  if auth.uid() is null or not (
    public.has_live_capability(p_session_id, 'live.manage_stage', auth.uid())
    or public.is_admin_user(auth.uid())
  ) then
    raise exception 'live_stage_atmosphere_host_required' using errcode = '42501';
  end if;
  if p_preset not in ('brand_teal', 'deep_ocean', 'aurora', 'oat_noir', 'live_poster')
    or p_expected_version is null or p_expected_version < 0
    or p_request_id is null then
    raise exception 'live_stage_atmosphere_invalid' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(
    'live_stage_atmosphere:' || p_session_id::text, 0
  ));
  if exists (select 1 from public.live_stage_atmosphere_events
      where request_id = p_request_id and session_id = p_session_id) then
    return public.live_stage_atmosphere_snapshot_v1(p_session_id);
  end if;
  if exists (select 1 from public.live_stage_atmosphere_events
      where request_id = p_request_id) then
    raise exception 'live_stage_atmosphere_request_invalid' using errcode = '22023';
  end if;
  select * into v_session from public.live_sessions where id = p_session_id;
  if v_session.id is null then
    raise exception 'live_session_not_found' using errcode = 'P0002';
  end if;
  if v_session.status in ('ended', 'cancelled', 'archived') then
    raise exception 'live_stage_atmosphere_session_closed' using errcode = '55000';
  end if;
  if p_preset = 'live_poster' and nullif(btrim(coalesce(
      v_session.configuration #>> '{event_media,poster_path}', ''
    )), '') is null then
    raise exception 'live_stage_atmosphere_poster_required' using errcode = '22023';
  end if;

  select * into v_current from public.live_stage_atmospheres
  where session_id = p_session_id for update;
  if coalesce(v_current.version, 0) <> p_expected_version then
    raise exception 'live_stage_atmosphere_version_conflict' using errcode = '40001';
  end if;

  if v_current.session_id is null then
    insert into public.live_stage_atmospheres(
      session_id, preset, version
    ) values (p_session_id, p_preset, 1)
    returning version into v_version;
  else
    update public.live_stage_atmospheres set
      preset = p_preset,
      version = version + 1,
      updated_at = timezone('utc', now())
    where session_id = p_session_id
    returning version into v_version;
  end if;

  insert into public.live_stage_atmosphere_events(
    session_id, actor_user_id, preset, state_version, request_id
  ) values (p_session_id, auth.uid(), p_preset, v_version, p_request_id);

  return public.live_stage_atmosphere_snapshot_v1(p_session_id);
end;
$$;

revoke all on function public.rpc_host_set_live_stage_atmosphere_v1(
  uuid, text, bigint, uuid
) from public, anon;
grant execute on function public.rpc_host_set_live_stage_atmosphere_v1(
  uuid, text, bigint, uuid
) to authenticated, service_role;

create or replace function public.rpc_get_live_music_catalogue_v1(
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
  v_now timestamptz := timezone('utc', now());
  v_tracks jsonb;
  v_playlists jsonb;
begin
  if auth.uid() is null or not (
    public.has_live_capability(p_session_id, 'live.view_host_console', auth.uid())
    or public.is_admin_user(auth.uid())
    or public.live_studio_is_authorized_v1(p_session_id, auth.uid(), 'view')
  ) then
    raise exception 'live_music_catalogue_forbidden' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', track.id,
    'title', track.title,
    'artist', track.artist,
    'mood', track.mood,
    'energy', track.energy,
    'durationSeconds', track.duration_seconds,
    'containsVocals', track.contains_vocals
  ) order by track.mood, track.title, track.id), '[]'::jsonb)
  into v_tracks
  from public.live_music_tracks track
  where track.enabled
    and track.license_status = 'approved'
    and (track.license_expires_at is null or track.license_expires_at > v_now)
    and track.licensed_regions @> array['*']::text[];

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', playlist.id,
    'name', playlist.name,
    'mood', playlist.mood,
    'trackIds', coalesce((
      select jsonb_agg(item.track_id order by item.position)
      from public.live_music_playlist_tracks item
      join public.live_music_tracks track on track.id = item.track_id
      where item.playlist_id = playlist.id
        and track.enabled
        and track.license_status = 'approved'
        and (track.license_expires_at is null or track.license_expires_at > v_now)
        and track.licensed_regions @> array['*']::text[]
    ), '[]'::jsonb)
  ) order by playlist.name, playlist.id), '[]'::jsonb)
  into v_playlists
  from public.live_music_playlists playlist
  where playlist.enabled
    and exists (
      select 1 from public.live_music_playlist_tracks item
      join public.live_music_tracks track on track.id = item.track_id
      where item.playlist_id = playlist.id
        and track.enabled
        and track.license_status = 'approved'
        and (track.license_expires_at is null or track.license_expires_at > v_now)
        and track.licensed_regions @> array['*']::text[]
    );

  return jsonb_build_object(
    'schemaVersion', 1,
    'canManageLibrary', public.is_admin_user(auth.uid()),
    'tracks', v_tracks,
    'playlists', v_playlists
  );
end;
$$;

revoke all on function public.rpc_get_live_music_catalogue_v1(uuid)
from public, anon;
grant execute on function public.rpc_get_live_music_catalogue_v1(uuid)
to authenticated, service_role;

create or replace function public.rpc_admin_publish_live_music_track_v2(
  p_track_id uuid,
  p_title text,
  p_artist text,
  p_storage_path text,
  p_mood text,
  p_duration_seconds integer,
  p_contains_vocals boolean,
  p_license_reference text,
  p_license_expires_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, storage, pg_catalog
set row_security = off
as $$
declare
  v_mime text;
  v_track public.live_music_tracks;
begin
  if auth.uid() is null or not public.is_admin_user(auth.uid()) then
    raise exception 'live_music_admin_required' using errcode = '42501';
  end if;
  if p_track_id is null or nullif(btrim(coalesce(p_title, '')), '') is null
    or char_length(p_title) > 120
    or nullif(btrim(coalesce(p_artist, '')), '') is null
    or char_length(p_artist) > 120
    or p_storage_path is null
    or p_storage_path !~ '^programme/[0-9]{4}/admin/[0-9a-f-]{36}\.(mp3|m4a|aac|ogg|wav)$'
    or p_mood is null
    or p_mood not in ('chill','afrobeats_light','soul','warm','upbeat',
      'reflective','instrumental','closing')
    or p_duration_seconds is null or p_duration_seconds not between 10 and 7200
    or p_contains_vocals is null
    or nullif(btrim(coalesce(p_license_reference, '')), '') is null
    or char_length(p_license_reference) > 240
    or (p_license_expires_at is not null
      and p_license_expires_at <= timezone('utc', now())) then
    raise exception 'live_music_track_invalid' using errcode = '22023';
  end if;

  select lower(coalesce(object.metadata ->> 'mimetype', object.metadata ->> 'contentType', ''))
  into v_mime
  from storage.objects object
  where object.bucket_id = 'live-program-music' and object.name = p_storage_path;
  if v_mime not in ('audio/mpeg','audio/mp4','audio/aac','audio/ogg','audio/wav') then
    raise exception 'live_music_storage_object_invalid' using errcode = '22023';
  end if;

  insert into public.live_music_tracks(
    id, title, artist, storage_path, mood, duration_seconds, contains_vocals,
    license_status, license_reference, license_expires_at, licensed_regions, enabled
  ) values (
    p_track_id, btrim(p_title), btrim(p_artist), p_storage_path, p_mood,
    p_duration_seconds, p_contains_vocals, 'approved', btrim(p_license_reference),
    p_license_expires_at, array['*']::text[], true
  ) on conflict (id) do update set
    title = excluded.title,
    artist = excluded.artist,
    storage_path = excluded.storage_path,
    mood = excluded.mood,
    duration_seconds = excluded.duration_seconds,
    contains_vocals = excluded.contains_vocals,
    license_status = 'approved',
    license_reference = excluded.license_reference,
    license_expires_at = excluded.license_expires_at,
    licensed_regions = array['*']::text[],
    enabled = true
  returning * into v_track;
  return jsonb_build_object('trackId', v_track.id, 'enabled', v_track.enabled);
end;
$$;

revoke all on function public.rpc_admin_publish_live_music_track_v2(
  uuid, text, text, text, text, integer, boolean, text, timestamptz
) from public, anon;
grant execute on function public.rpc_admin_publish_live_music_track_v2(
  uuid, text, text, text, text, integer, boolean, text, timestamptz
) to authenticated, service_role;

-- Repeat state is also needed by the mobile Host console. Keep Studio access
-- while allowing the same narrow host-console capability used by the library.
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
  if auth.uid() is null or not (
    public.has_live_capability(p_session_id, 'live.view_host_console', auth.uid())
    or public.is_admin_user(auth.uid())
    or public.live_studio_is_authorized_v1(p_session_id, auth.uid(), 'view')
  ) then
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

commit;
