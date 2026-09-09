-- Betweener Live Phase 10E: Show Director, approved music programme and Studio protocol.
--
-- Quick Connect remains authoritative for WHO is paired and WHEN private
-- rounds advance. This layer owns only public presentation state. Music is
-- logical/synchronised state backed by a private approved catalogue; this
-- migration seeds no tracks and accepts no arbitrary URL.

begin;

alter table public.live_odo_configuration
  add column if not exists show_director_enabled boolean not null default false,
  add column if not exists show_director_internal_only boolean not null default true,
  add column if not exists music_auto_enabled boolean not null default false,
  add column if not exists music_ducking_enabled boolean not null default false,
  add column if not exists show_intermission_enabled boolean not null default false,
  add column if not exists show_energy_mode_enabled boolean not null default false,
  add column if not exists odo_voice_enabled boolean not null default false,
  add column if not exists betweener_studio_enabled boolean not null default false,
  add column if not exists betweener_studio_control_enabled boolean not null default false,
  add column if not exists screen_share_enabled boolean not null default false,
  add column if not exists show_scene_minimum_dwell_seconds integer not null default 20,
  add column if not exists show_host_suppression_seconds integer not null default 45,
  add column if not exists show_intermission_every_rounds integer not null default 3,
  add column if not exists show_reconcile_seconds integer not null default 15,
  add column if not exists music_default_volume numeric(4,3) not null default 0.280,
  add column if not exists music_ducked_volume numeric(4,3) not null default 0.120;

alter table public.live_odo_configuration
  drop constraint if exists live_odo_phase10b_human_loop_invariant,
  drop constraint if exists live_odo_phase10e_authority_invariant;

alter table public.live_odo_configuration
  add constraint live_odo_phase10e_authority_invariant check (
    shadow_mode
    and not autopilot_enabled
    and (
      copilot_enabled
      or (
        not conversation_spark_enabled
        and not audience_pulse_enabled
        and not pair_narration_enabled
        and not scene_suggestions_enabled
        and not transition_copy_enabled
      )
    )
    and (not music_enabled or (odo_enabled and show_director_enabled))
    and (not music_auto_enabled or music_enabled)
    and (not music_ducking_enabled or music_enabled)
  );

alter table public.live_odo_configuration
  add constraint live_odo_phase10e_voice_disabled check (not odo_voice_enabled),
  add constraint live_odo_phase10e_screen_share_disabled check (not screen_share_enabled),
  add constraint live_odo_phase10e_scene_dwell_valid
    check (show_scene_minimum_dwell_seconds between 10 and 300),
  add constraint live_odo_phase10e_host_suppression_valid
    check (show_host_suppression_seconds between 10 and 900),
  add constraint live_odo_phase10e_intermission_rounds_valid
    check (show_intermission_every_rounds between 2 and 10),
  add constraint live_odo_phase10e_reconcile_valid
    check (show_reconcile_seconds between 5 and 60),
  add constraint live_odo_phase10e_music_volumes_valid check (
    music_default_volume between 0 and 0.5
    and music_ducked_volume between 0 and music_default_volume
  );

create table public.live_odo_show_sessions (
  session_id uuid primary key references public.live_sessions(id) on delete cascade,
  enabled boolean not null default false,
  enabled_by_user_id uuid references auth.users(id) on delete set null,
  show_state text not null default 'opening' check (show_state in (
    'opening','host_focus','host_plus_pool','pool_focus','pair_forming',
    'pair_active','post_pair','audience_pulse','conversation_topic','odo_stage',
    'music_intermission','low_liquidity','draining','closing',
    'paused_by_host','paused_by_policy','recovering'
  )),
  current_scene text not null default 'host_focus' check (current_scene in (
    'host_focus','host_plus_pool','pool_focus','pair_forming',
    'quick_connect_active','audience_pulse','conversation_topic','odo_stage',
    'music_intermission','branded_intermission','session_closing'
  )),
  energy_mode text not null default 'calm' check (
    energy_mode in ('calm','social','energize','reflective','closing')
  ),
  program_source text not null default 'mobile' check (program_source in ('mobile','studio')),
  control_source text not null default 'odo' check (
    control_source in ('odo','mobile_host','studio_host')
  ),
  control_user_id uuid references auth.users(id) on delete set null,
  control_lease_expires_at timestamptz,
  paused_by_host boolean not null default false,
  host_suppression_ends_at timestamptz,
  current_priority integer not null default 10 check (current_priority between 0 and 100),
  scene_entered_at timestamptz not null default timezone('utc', now()),
  last_reason_code text check (
    last_reason_code is null or last_reason_code ~ '^[a-z][a-z0-9_]{0,119}$'
  ),
  last_pairing_id uuid references public.live_quick_connect_pairings(id) on delete set null,
  completed_rounds_seen integer not null default 0 check (completed_rounds_seen >= 0),
  last_intermission_round integer not null default 0 check (last_intermission_round >= 0),
  scene_history jsonb not null default '[]'::jsonb check (
    jsonb_typeof(scene_history) = 'array'
    and jsonb_array_length(scene_history) <= 12
    and octet_length(scene_history::text) <= 4096
  ),
  next_wake_at timestamptz,
  version bigint not null default 1 check (version > 0),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint live_odo_show_control_lease_valid check (
    (control_source = 'odo' and control_user_id is null)
    or (control_source in ('mobile_host','studio_host') and control_user_id is not null)
  )
);

create table public.live_odo_show_actions (
  action_id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.live_sessions(id) on delete cascade,
  action_key text not null unique check (char_length(action_key) between 12 and 240),
  action_type text not null check (action_type in (
    'SET_SCENE','SET_ENERGY','BEGIN_INTERMISSION','END_INTERMISSION',
    'DUCK_MUSIC','UNDUCK_MUSIC','PAUSE','RESUME','RECOVER','WAIT'
  )),
  reason_code text not null check (reason_code ~ '^[a-z][a-z0-9_]{0,119}$'),
  priority integer not null check (priority between 0 and 100),
  status text not null default 'executed' check (
    status in ('executed','skipped','stale','failed')
  ),
  scene text check (scene is null or scene in (
    'host_focus','host_plus_pool','pool_focus','pair_forming',
    'quick_connect_active','audience_pulse','conversation_topic','odo_stage',
    'music_intermission','branded_intermission','session_closing'
  )),
  state_version bigint not null check (state_version > 0),
  lease_generation bigint not null check (lease_generation > 0),
  metadata jsonb not null default '{}'::jsonb check (
    jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 2048
  ),
  executed_at timestamptz not null default timezone('utc', now())
);

create index live_odo_show_actions_session_idx
  on public.live_odo_show_actions(session_id, executed_at desc);

create table public.live_music_tracks (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 120),
  artist text not null check (char_length(artist) between 1 and 120),
  storage_bucket text not null default 'live-program-music'
    check (storage_bucket = 'live-program-music'),
  storage_path text not null unique check (
    char_length(storage_path) between 3 and 500
    and storage_path !~ '(^|/)\.\.(/|$)'
    and storage_path !~* '^(https?|file):'
  ),
  mood text not null check (mood in (
    'chill','afrobeats_light','soul','warm','upbeat','reflective',
    'instrumental','closing'
  )),
  energy integer not null default 2 check (energy between 1 and 5),
  duration_seconds integer not null check (duration_seconds between 10 and 7200),
  contains_vocals boolean not null default false,
  license_status text not null default 'pending' check (
    license_status in ('pending','approved','suspended','expired')
  ),
  license_reference text not null check (char_length(license_reference) between 3 and 240),
  license_expires_at timestamptz,
  licensed_regions text[] not null default array['*']::text[] check (
    cardinality(licensed_regions) between 1 and 64
  ),
  enabled boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint live_music_track_enabled_license check (
    not enabled or (
      license_status = 'approved'
      and (license_expires_at is null or license_expires_at > created_at)
    )
  )
);

create table public.live_music_playlists (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (char_length(name) between 1 and 100),
  mood text check (mood is null or mood in (
    'chill','afrobeats_light','soul','warm','upbeat','reflective',
    'instrumental','closing'
  )),
  enabled boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.live_music_playlist_tracks (
  playlist_id uuid not null references public.live_music_playlists(id) on delete cascade,
  track_id uuid not null references public.live_music_tracks(id) on delete restrict,
  position integer not null check (position between 1 and 1000),
  primary key (playlist_id, track_id),
  unique (playlist_id, position)
);

create table public.live_music_session_state (
  session_id uuid primary key references public.live_sessions(id) on delete cascade,
  status text not null default 'stopped' check (
    status in ('stopped','playing','paused','ducked','fading')
  ),
  track_id uuid references public.live_music_tracks(id) on delete set null,
  playlist_id uuid references public.live_music_playlists(id) on delete set null,
  mood text check (mood is null or mood in (
    'chill','afrobeats_light','soul','warm','upbeat','reflective',
    'instrumental','closing'
  )),
  requested_volume numeric(4,3) not null default 0.280 check (
    requested_volume between 0 and 0.5
  ),
  effective_volume numeric(4,3) not null default 0 check (
    effective_volume between 0 and 0.5
  ),
  program_started_at timestamptz,
  playback_offset_seconds numeric(10,3) not null default 0 check (
    playback_offset_seconds >= 0
  ),
  control_source text not null default 'mobile_host' check (
    control_source in ('odo','mobile_host','studio_host')
  ),
  last_action text check (last_action is null or last_action in (
    'play_track','play_playlist','pause','resume','next','fade_in','fade_out',
    'set_volume','set_mood','duck','unduck','stop'
  )),
  last_reason_code text check (
    last_reason_code is null or last_reason_code ~ '^[a-z][a-z0-9_]{0,119}$'
  ),
  version bigint not null default 1 check (version > 0),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.live_music_events (
  event_id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.live_sessions(id) on delete cascade,
  idempotency_key uuid not null unique,
  action text not null check (action in (
    'play_track','play_playlist','pause','resume','next','fade_in','fade_out',
    'set_volume','set_mood','duck','unduck','stop'
  )),
  source text not null check (source in ('odo','mobile_host','studio_host','system')),
  track_id uuid references public.live_music_tracks(id) on delete set null,
  playlist_id uuid references public.live_music_playlists(id) on delete set null,
  requested_volume numeric(4,3),
  effective_volume numeric(4,3),
  state_version bigint not null check (state_version > 0),
  reason_code text not null check (reason_code ~ '^[a-z][a-z0-9_]{0,119}$'),
  status text not null default 'applied' check (status in ('applied','rejected','stale')),
  created_at timestamptz not null default timezone('utc', now()),
  constraint live_music_event_volume_valid check (
    (requested_volume is null or requested_volume between 0 and 0.5)
    and (effective_volume is null or effective_volume between 0 and 0.5)
  )
);

create index live_music_events_session_idx
  on public.live_music_events(session_id, created_at desc);

create table public.live_odo_show_updates (
  session_id uuid primary key references public.live_sessions(id) on delete cascade,
  version bigint not null default 1 check (version > 0),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.live_odo_show_sessions enable row level security;
alter table public.live_odo_show_actions enable row level security;
alter table public.live_music_tracks enable row level security;
alter table public.live_music_playlists enable row level security;
alter table public.live_music_playlist_tracks enable row level security;
alter table public.live_music_session_state enable row level security;
alter table public.live_music_events enable row level security;
alter table public.live_odo_show_updates enable row level security;

create policy live_odo_show_updates_participant_select
on public.live_odo_show_updates for select to authenticated
using (exists (
  select 1 from public.live_participants participant
  where participant.session_id = live_odo_show_updates.session_id
    and participant.user_id = auth.uid()
    and participant.state not in ('left','removed','banned')
));

revoke all on table
  public.live_odo_show_sessions,
  public.live_odo_show_actions,
  public.live_music_tracks,
  public.live_music_playlists,
  public.live_music_playlist_tracks,
  public.live_music_session_state,
  public.live_music_events
from public, anon, authenticated, service_role;
revoke insert, update, delete on table public.live_odo_show_updates
from public, anon, authenticated, service_role;
grant select on table public.live_odo_show_updates to authenticated;

create trigger live_odo_show_sessions_updated_at
before update on public.live_odo_show_sessions
for each row execute function public.set_updated_at();
create trigger live_music_tracks_updated_at
before update on public.live_music_tracks
for each row execute function public.set_updated_at();
create trigger live_music_playlists_updated_at
before update on public.live_music_playlists
for each row execute function public.set_updated_at();

create or replace function public.live_odo_show_bump_update_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare v_session_id uuid := coalesce(new.session_id, old.session_id);
begin
  insert into public.live_odo_show_updates(session_id, version)
  values (v_session_id, 1)
  on conflict (session_id) do update set
    version = public.live_odo_show_updates.version + 1,
    updated_at = timezone('utc', now());
  return coalesce(new, old);
end;
$$;

revoke all on function public.live_odo_show_bump_update_v1()
from public, anon, authenticated, service_role;

create trigger live_odo_show_sessions_bump
after insert or update on public.live_odo_show_sessions
for each row execute function public.live_odo_show_bump_update_v1();
create trigger live_music_session_state_bump
after insert or update on public.live_music_session_state
for each row execute function public.live_odo_show_bump_update_v1();

alter table public.live_odo_show_updates replica identity full;
alter publication supabase_realtime add table public.live_odo_show_updates;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'live-program-music', 'live-program-music', false, 52428800,
  array['audio/mpeg','audio/mp4','audio/aac','audio/ogg','audio/wav']
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.live_odo_show_host_allowed_v1(
  p_session_id uuid,
  p_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
  select p_user_id is not null
    and (
      public.has_live_capability(p_session_id, 'live.view_host_console', p_user_id)
      or public.is_admin_user(p_user_id)
    )
    and (
      not coalesce((select show_director_internal_only
        from public.live_odo_configuration where id = true), true)
      or public.live_odo_guarded_host_allowed_v1(p_user_id)
    );
$$;

revoke all on function public.live_odo_show_host_allowed_v1(uuid, uuid)
from public, anon, authenticated, service_role;

create or replace function public.live_odo_show_snapshot_v1(
  p_session_id uuid,
  p_actor_user_id uuid
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
  v_config public.live_odo_configuration;
  v_session public.live_sessions;
  v_show public.live_odo_show_sessions;
  v_odo public.live_odo_session_state;
  v_music public.live_music_session_state;
  v_track public.live_music_tracks;
  v_participants bigint := 0;
  v_audience bigint := 0;
  v_waiting bigint := 0;
  v_active bigint := 0;
  v_completed bigint := 0;
  v_available boolean := false;
  v_reason text;
begin
  select * into v_config from public.live_odo_configuration where id = true;
  select * into v_session from public.live_sessions where id = p_session_id;
  select * into v_show from public.live_odo_show_sessions where session_id = p_session_id;
  select * into v_odo from public.live_odo_session_state where session_id = p_session_id;
  select * into v_music from public.live_music_session_state where session_id = p_session_id;
  select * into v_track from public.live_music_tracks where id = v_music.track_id;

  select count(*) filter (where participant.state not in ('left','removed','banned')),
    count(*) filter (where participant.state = 'audience')
  into v_participants, v_audience
  from public.live_participants participant where participant.session_id = p_session_id;
  select count(*) filter (where participant.state = 'waiting'
      and participant.connection_state = 'connected')
  into v_waiting from public.live_quick_connect_participants participant
  where participant.session_id = p_session_id;
  select count(*) into v_active from public.live_quick_connect_pairings pairing
  where pairing.session_id = p_session_id
    and pairing.state in ('active','reconnect_grace');
  select count(*) into v_completed from public.live_quick_connect_rounds round_row
  where round_row.session_id = p_session_id and round_row.state = 'completed';

  v_available := coalesce(v_config.odo_enabled, false)
    and coalesce(v_config.show_director_enabled, false)
    and not coalesce(v_config.circuit_breaker_open, true)
    and v_session.status = 'live'
    and public.live_odo_show_host_allowed_v1(p_session_id, p_actor_user_id);
  v_reason := case
    when v_session.id is null then 'session_not_found'
    when v_session.status <> 'live' then 'session_not_live'
    when not coalesce(v_config.odo_enabled, false) then 'odo_disabled'
    when not coalesce(v_config.show_director_enabled, false) then 'show_director_disabled'
    when coalesce(v_config.circuit_breaker_open, true) then 'circuit_breaker_open'
    when not public.live_odo_show_host_allowed_v1(p_session_id, p_actor_user_id)
      then 'internal_rollout_only'
    else null end;

  return jsonb_build_object(
    'schemaVersion', 1,
    'available', v_available,
    'sessionId', p_session_id,
    'enabled', coalesce(v_show.enabled, false),
    'showState', coalesce(v_show.show_state, 'opening'),
    'currentScene', coalesce(v_show.current_scene, v_odo.current_scene, 'host_focus'),
    'energyMode', coalesce(v_show.energy_mode, 'calm'),
    'programSource', coalesce(v_show.program_source, 'mobile'),
    'controlSource', coalesce(v_show.control_source, 'mobile_host'),
    'pausedByHost', coalesce(v_show.paused_by_host, false),
    'stateVersion', coalesce(v_show.version, 0),
    'leaseGeneration', coalesce(v_odo.lease_generation, 0),
    'sceneEnteredAt', v_show.scene_entered_at,
    'hostSuppressionEndsAt', v_show.host_suppression_ends_at,
    'nextWakeAt', v_show.next_wake_at,
    'lastReasonCode', v_show.last_reason_code,
    'unavailableReasonCode', v_reason,
    'metrics', jsonb_build_object(
      'participants', v_participants,
      'audience', v_audience,
      'waitingPeople', v_waiting,
      'activePairs', v_active,
      'completedRounds', v_completed
    ),
    'music', jsonb_build_object(
      'enabled', coalesce(v_config.music_enabled, false),
      'status', coalesce(v_music.status, 'stopped'),
      'trackId', v_music.track_id,
      'playlistId', v_music.playlist_id,
      'title', v_track.title,
      'artist', v_track.artist,
      'mood', coalesce(v_music.mood, v_track.mood),
      'volume', coalesce(v_music.effective_volume, 0),
      'programStartedAt', v_music.program_started_at,
      'playbackOffsetSeconds', coalesce(v_music.playback_offset_seconds, 0),
      'stateVersion', coalesce(v_music.version, 0),
      'playbackAvailable', coalesce(v_track.enabled, false)
        and v_track.license_status = 'approved'
        and (v_track.license_expires_at is null or v_track.license_expires_at > v_now)
        and v_track.licensed_regions @> array['*']::text[]
    )
  );
end;
$$;

revoke all on function public.live_odo_show_snapshot_v1(uuid, uuid)
from public, anon, authenticated, service_role;

create or replace function public.rpc_get_live_odo_show_director_v1(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
begin
  if auth.uid() is null or (
    not public.has_live_capability(p_session_id, 'live.view_host_console', auth.uid())
    and not public.is_admin_user(auth.uid())
  ) then
    raise exception 'live_odo_show_host_required' using errcode = '42501';
  end if;
  return public.live_odo_show_snapshot_v1(p_session_id, auth.uid());
end;
$$;

revoke all on function public.rpc_get_live_odo_show_director_v1(uuid) from public, anon;
grant execute on function public.rpc_get_live_odo_show_director_v1(uuid)
to authenticated, service_role;

create or replace function public.rpc_get_live_program_snapshot_v1(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare v_snapshot jsonb;
begin
  if auth.uid() is null or not exists (
    select 1 from public.live_participants participant
    where participant.session_id = p_session_id
      and participant.user_id = auth.uid()
      and participant.state not in ('left','removed','banned')
  ) then
    raise exception 'live_participant_required' using errcode = '42501';
  end if;
  v_snapshot := public.live_odo_show_snapshot_v1(p_session_id, auth.uid());
  return jsonb_build_object(
    'schemaVersion', v_snapshot -> 'schemaVersion',
    'sessionId', v_snapshot -> 'sessionId',
    'enabled', v_snapshot -> 'enabled',
    'showState', v_snapshot -> 'showState',
    'currentScene', v_snapshot -> 'currentScene',
    'energyMode', v_snapshot -> 'energyMode',
    'programSource', v_snapshot -> 'programSource',
    'stateVersion', v_snapshot -> 'stateVersion',
    'nextWakeAt', v_snapshot -> 'nextWakeAt',
    'music', v_snapshot -> 'music'
  );
end;
$$;

revoke all on function public.rpc_get_live_program_snapshot_v1(uuid) from public, anon;
grant execute on function public.rpc_get_live_program_snapshot_v1(uuid) to authenticated;

create or replace function public.rpc_enable_live_odo_show_director_v1(p_session_id uuid)
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
begin
  if auth.uid() is null
    or not public.live_odo_show_host_allowed_v1(p_session_id, auth.uid()) then
    raise exception 'live_odo_show_enable_forbidden' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('live_odo:' || p_session_id::text, 0));
  select * into v_config from public.live_odo_configuration where id = true;
  select * into v_session from public.live_sessions where id = p_session_id for update;
  if v_session.id is null then
    raise exception 'live_session_not_found' using errcode = 'P0002';
  elsif v_session.status <> 'live' then
    return jsonb_build_object('enabled', false, 'reasonCode', 'session_not_live');
  elsif not v_config.odo_enabled or not v_config.show_director_enabled
    or v_config.circuit_breaker_open then
    return jsonb_build_object('enabled', false, 'reasonCode', 'show_director_unavailable');
  end if;
  insert into public.live_odo_session_state(session_id) values (p_session_id)
  on conflict (session_id) do nothing;
  insert into public.live_odo_show_sessions(
    session_id, enabled, enabled_by_user_id, show_state, current_scene,
    energy_mode, control_source, control_user_id, paused_by_host, next_wake_at,
    last_reason_code
  ) values (
    p_session_id, true, auth.uid(), 'opening', 'host_focus', 'calm',
    'odo', null, false, v_now, 'host_authorized_show_start'
  ) on conflict (session_id) do update set
    enabled = true,
    enabled_by_user_id = auth.uid(),
    show_state = 'opening',
    control_source = 'odo',
    control_user_id = null,
    control_lease_expires_at = null,
    paused_by_host = false,
    host_suppression_ends_at = null,
    next_wake_at = v_now,
    last_reason_code = 'host_authorized_show_start',
    version = public.live_odo_show_sessions.version + 1;
  insert into public.live_music_session_state(session_id)
  values (p_session_id) on conflict (session_id) do nothing;
  return jsonb_build_object('enabled', true, 'reasonCode', 'show_director_enabled');
end;
$$;

revoke all on function public.rpc_enable_live_odo_show_director_v1(uuid) from public, anon;
grant execute on function public.rpc_enable_live_odo_show_director_v1(uuid)
to authenticated, service_role;

create or replace function public.rpc_take_over_live_odo_show_v1(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
begin
  if auth.uid() is null
    or not public.live_odo_show_host_allowed_v1(p_session_id, auth.uid()) then
    raise exception 'live_odo_show_takeover_forbidden' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('live_odo:' || p_session_id::text, 0));
  update public.live_odo_show_sessions set
    paused_by_host = true,
    show_state = 'paused_by_host',
    control_source = 'mobile_host',
    control_user_id = auth.uid(),
    control_lease_expires_at = null,
    next_wake_at = null,
    last_reason_code = 'host_takeover',
    version = version + 1
  where session_id = p_session_id;
  update public.live_odo_session_state set
    lease_owner = null, lease_expires_at = null, lease_heartbeat_at = null
  where session_id = p_session_id;
  return jsonb_build_object('takenOver', found, 'reasonCode', 'host_takeover');
end;
$$;

revoke all on function public.rpc_take_over_live_odo_show_v1(uuid) from public, anon;
grant execute on function public.rpc_take_over_live_odo_show_v1(uuid)
to authenticated, service_role;

create or replace function public.rpc_resume_live_odo_show_v1(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare v_config public.live_odo_configuration;
begin
  if auth.uid() is null
    or not public.live_odo_show_host_allowed_v1(p_session_id, auth.uid()) then
    raise exception 'live_odo_show_resume_forbidden' using errcode = '42501';
  end if;
  select * into v_config from public.live_odo_configuration where id = true;
  if v_config.circuit_breaker_open then
    return jsonb_build_object('resumed', false, 'reasonCode', 'policy_clearance_required');
  end if;
  update public.live_odo_show_sessions set
    paused_by_host = false,
    show_state = 'recovering',
    control_source = 'odo',
    control_user_id = null,
    control_lease_expires_at = null,
    host_suppression_ends_at = null,
    next_wake_at = timezone('utc', now()),
    last_reason_code = 'host_resumed_show',
    version = version + 1
  where session_id = p_session_id and enabled;
  return jsonb_build_object('resumed', found, 'reasonCode', 'host_resumed_show');
end;
$$;

revoke all on function public.rpc_resume_live_odo_show_v1(uuid) from public, anon;
grant execute on function public.rpc_resume_live_odo_show_v1(uuid)
to authenticated, service_role;

create or replace function public.rpc_host_set_live_show_scene_v1(
  p_session_id uuid,
  p_scene text,
  p_expected_version bigint
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
  v_show public.live_odo_show_sessions;
begin
  if auth.uid() is null
    or not public.live_odo_show_host_allowed_v1(p_session_id, auth.uid()) then
    raise exception 'live_odo_show_scene_forbidden' using errcode = '42501';
  end if;
  if p_scene not in (
    'host_focus','host_plus_pool','pool_focus','pair_forming',
    'quick_connect_active','audience_pulse','conversation_topic','odo_stage',
    'music_intermission','branded_intermission','session_closing'
  ) or p_expected_version is null or p_expected_version < 1 then
    raise exception 'live_odo_show_scene_invalid' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('live_odo:' || p_session_id::text, 0));
  select * into v_config from public.live_odo_configuration where id = true;
  select * into v_show from public.live_odo_show_sessions
  where session_id = p_session_id for update;
  if v_show.version <> p_expected_version then
    return jsonb_build_object('changed', false, 'reasonCode', 'stale_show_version');
  end if;
  update public.live_odo_show_sessions set
    current_scene = p_scene,
    show_state = case p_scene
      when 'quick_connect_active' then 'pair_active'
      when 'music_intermission' then 'music_intermission'
      when 'branded_intermission' then 'music_intermission'
      when 'session_closing' then 'closing'
      else p_scene end,
    scene_entered_at = v_now,
    host_suppression_ends_at = v_now + make_interval(
      secs => v_config.show_host_suppression_seconds
    ),
    control_source = 'mobile_host',
    control_user_id = auth.uid(),
    current_priority = 95,
    last_reason_code = 'host_scene_override',
    scene_history = (
      select coalesce(jsonb_agg(entry), '[]'::jsonb)
      from (
        select entry from jsonb_array_elements(
          v_show.scene_history || jsonb_build_array(jsonb_build_object(
            'scene', p_scene, 'source', 'mobile_host', 'at', v_now
          ))
        ) with ordinality history(entry, ordinal)
        order by ordinal desc limit 12
      ) bounded
    ),
    version = version + 1
  where session_id = p_session_id returning * into v_show;
  update public.live_odo_session_state set
    current_scene = case when p_scene = 'branded_intermission'
      then 'music_intermission_visual_only' else p_scene end,
    state_version = state_version + 1
  where session_id = p_session_id;
  return jsonb_build_object(
    'changed', true, 'scene', v_show.current_scene,
    'stateVersion', v_show.version,
    'suppressedUntil', v_show.host_suppression_ends_at
  );
end;
$$;

revoke all on function public.rpc_host_set_live_show_scene_v1(uuid, text, bigint)
from public, anon;
grant execute on function public.rpc_host_set_live_show_scene_v1(uuid, text, bigint)
to authenticated, service_role;

create or replace function public.rpc_acquire_live_program_control_v1(
  p_session_id uuid,
  p_source text,
  p_expected_version bigint
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare v_show public.live_odo_show_sessions;
begin
  if auth.uid() is null
    or not public.live_odo_show_host_allowed_v1(p_session_id, auth.uid()) then
    raise exception 'live_program_control_forbidden' using errcode = '42501';
  end if;
  if p_source not in ('mobile_host','studio_host') or p_expected_version < 1 then
    raise exception 'live_program_control_invalid' using errcode = '22023';
  end if;
  select * into v_show from public.live_odo_show_sessions
  where session_id = p_session_id for update;
  if v_show.version <> p_expected_version then
    return jsonb_build_object('acquired', false, 'reasonCode', 'stale_show_version');
  end if;
  if p_source = 'studio_host' and not coalesce((select betweener_studio_control_enabled
      from public.live_odo_configuration where id = true), false) then
    return jsonb_build_object('acquired', false, 'reasonCode', 'studio_control_disabled');
  end if;
  update public.live_odo_show_sessions set
    program_source = case when p_source = 'studio_host' then 'studio' else 'mobile' end,
    control_source = p_source,
    control_user_id = auth.uid(),
    control_lease_expires_at = timezone('utc', now()) + interval '30 seconds',
    paused_by_host = true,
    show_state = 'paused_by_host',
    next_wake_at = timezone('utc', now()) + interval '30 seconds',
    last_reason_code = 'program_control_acquired',
    version = version + 1
  where session_id = p_session_id returning * into v_show;
  return jsonb_build_object(
    'acquired', true, 'source', v_show.control_source,
    'stateVersion', v_show.version,
    'leaseExpiresAt', v_show.control_lease_expires_at
  );
end;
$$;

revoke all on function public.rpc_acquire_live_program_control_v1(uuid, text, bigint)
from public, anon;
grant execute on function public.rpc_acquire_live_program_control_v1(uuid, text, bigint)
to authenticated, service_role;

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

revoke all on function public.rpc_host_control_live_music_v1(
  uuid, text, uuid, uuid, numeric, text, uuid
) from public, anon;
grant execute on function public.rpc_host_control_live_music_v1(
  uuid, text, uuid, uuid, numeric, text, uuid
) to authenticated, service_role;

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

revoke all on function public.rpc_service_get_live_music_playback_v1(uuid, uuid)
from public, anon, authenticated, service_role;
grant execute on function public.rpc_service_get_live_music_playback_v1(uuid, uuid)
to service_role;

create or replace function public.rpc_admin_upsert_live_music_track_v1(
  p_track_id uuid,
  p_title text,
  p_artist text,
  p_storage_path text,
  p_mood text,
  p_duration_seconds integer,
  p_license_reference text,
  p_license_expires_at timestamptz default null,
  p_enabled boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare v_track public.live_music_tracks;
begin
  if auth.uid() is null or not public.is_admin_user(auth.uid()) then
    raise exception 'live_music_admin_required' using errcode = '42501';
  end if;
  if p_track_id is null or p_title is null or p_artist is null
    or p_storage_path is null or p_license_reference is null then
    raise exception 'live_music_track_invalid' using errcode = '22023';
  end if;
  insert into public.live_music_tracks(
    id, title, artist, storage_path, mood, duration_seconds,
    license_status, license_reference, license_expires_at, licensed_regions, enabled
  ) values (
    p_track_id, p_title, p_artist, p_storage_path, p_mood, p_duration_seconds,
    case when p_enabled then 'approved' else 'pending' end,
    p_license_reference, p_license_expires_at, array['*']::text[], p_enabled
  ) on conflict (id) do update set
    title = excluded.title,
    artist = excluded.artist,
    storage_path = excluded.storage_path,
    mood = excluded.mood,
    duration_seconds = excluded.duration_seconds,
    license_status = excluded.license_status,
    license_reference = excluded.license_reference,
    license_expires_at = excluded.license_expires_at,
    enabled = excluded.enabled
  returning * into v_track;
  return jsonb_build_object('trackId', v_track.id, 'enabled', v_track.enabled);
end;
$$;

revoke all on function public.rpc_admin_upsert_live_music_track_v1(
  uuid, text, text, text, text, integer, text, timestamptz, boolean
) from public, anon;
grant execute on function public.rpc_admin_upsert_live_music_track_v1(
  uuid, text, text, text, text, integer, text, timestamptz, boolean
) to authenticated, service_role;

commit;
