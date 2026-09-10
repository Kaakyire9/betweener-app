-- Betweener Live Phase 10G.1/10G.2: Studio rollout, source registry and
-- authoritative Program fields. Preview remains local to a Studio tab.

begin;

alter table public.live_odo_configuration
  add column if not exists studio_session_discovery_enabled boolean not null default false,
  add column if not exists studio_media_publishing_enabled boolean not null default false,
  add column if not exists studio_screen_audio_enabled boolean not null default false,
  add column if not exists studio_external_audio_enabled boolean not null default false,
  add column if not exists studio_closed_beta boolean not null default true,
  add column if not exists studio_controller_lease_seconds integer not null default 30,
  add column if not exists studio_controller_grace_seconds integer not null default 10;

alter table public.live_odo_configuration
  drop constraint if exists live_odo_phase10e_screen_share_disabled,
  drop constraint if exists live_odo_phase10g_studio_configuration_valid;

alter table public.live_odo_configuration
  add constraint live_odo_phase10g_studio_configuration_valid check (
    (not betweener_studio_control_enabled or betweener_studio_enabled)
    and (not studio_session_discovery_enabled or betweener_studio_enabled)
    and (not studio_media_publishing_enabled or betweener_studio_enabled)
    and (not screen_share_enabled or studio_media_publishing_enabled)
    and (not studio_screen_audio_enabled or screen_share_enabled)
    and (not studio_external_audio_enabled or studio_media_publishing_enabled)
    and studio_controller_lease_seconds between 15 and 120
    and studio_controller_grace_seconds between 5 and 60
  );

create table public.live_studio_access (
  user_id uuid primary key references auth.users(id) on delete cascade,
  allowed boolean not null default false,
  can_view boolean not null default true,
  can_control boolean not null default false,
  can_publish boolean not null default false,
  can_screen_share boolean not null default false,
  can_use_external_audio boolean not null default false,
  can_moderate boolean not null default false,
  note text check (note is null or char_length(note) <= 240),
  expires_at timestamptz,
  created_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint live_studio_access_capabilities_valid check (
    allowed or (
      not can_control and not can_publish and not can_screen_share
      and not can_use_external_audio and not can_moderate
    )
  ),
  constraint live_studio_access_dependencies_valid check (
    (not can_control or can_view)
    and (not can_publish or can_view)
    and (not can_screen_share or can_publish)
    and (not can_use_external_audio or can_publish)
    and (not can_moderate or can_view)
  )
);

alter table public.live_studio_access enable row level security;
revoke all on table public.live_studio_access from public, anon, authenticated, service_role;

create trigger live_studio_access_updated_at
before update on public.live_studio_access
for each row execute function public.set_updated_at();

alter table public.live_odo_show_sessions
  add column if not exists controller_instance_id uuid,
  add column if not exists controller_generation bigint not null default 1,
  add column if not exists controller_acquired_at timestamptz,
  add column if not exists program_version bigint not null default 1,
  add column if not exists target_canvas text not null default 'portrait_9_16',
  add column if not exists program_transition text not null default 'auto',
  add column if not exists source_assignments jsonb not null default '{}'::jsonb,
  add column if not exists fallback_scene text not null default 'host_focus',
  add column if not exists previous_program_state jsonb not null default '{}'::jsonb,
  add column if not exists last_program_command_id uuid;

-- Phase 10E exposed a reserved, unleased studio_host value. It cannot be
-- carried into the fenced Phase 10G controller contract.
update public.live_odo_show_sessions set
  control_source = 'odo', control_user_id = null,
  controller_instance_id = null, control_lease_expires_at = null,
  controller_acquired_at = null, program_source = 'mobile',
  paused_by_host = false, last_reason_code = 'phase10g_controller_fenced'
where control_source = 'studio_host';

update public.live_odo_show_sessions set
  control_user_id = null, controller_instance_id = null,
  control_lease_expires_at = null, controller_acquired_at = null
where control_source in ('odo','system');

alter table public.live_odo_show_sessions
  drop constraint if exists live_odo_show_sessions_current_scene_check,
  drop constraint if exists live_odo_show_sessions_fallback_scene_check,
  drop constraint if exists live_odo_show_target_canvas_check,
  drop constraint if exists live_odo_show_program_transition_check,
  drop constraint if exists live_odo_show_source_assignments_check,
  drop constraint if exists live_odo_show_previous_program_state_check,
  drop constraint if exists live_odo_show_program_versions_check,
  drop constraint if exists live_odo_show_control_lease_valid,
  drop constraint if exists live_odo_show_controller_shape_valid;

alter table public.live_odo_show_sessions
  add constraint live_odo_show_sessions_current_scene_check check (current_scene in (
    'host_focus','host_plus_pool','pool_focus','pair_forming',
    'quick_connect_active','audience_pulse','conversation_topic','odo_stage',
    'music_intermission','branded_intermission','session_closing',
    'screen_full','screen_plus_host','screen_plus_pair','screen_plus_panel',
    'screen_discussion','screen_plus_pool','screen_plus_audience_pulse',
    'screen_plus_odo','dj_plus_pool'
  )),
  add constraint live_odo_show_sessions_fallback_scene_check check (fallback_scene in (
    'host_focus','host_plus_pool','pool_focus','pair_forming',
    'quick_connect_active','audience_pulse','conversation_topic','odo_stage',
    'music_intermission','branded_intermission','session_closing'
  )),
  add constraint live_odo_show_target_canvas_check check (
    target_canvas in ('portrait_9_16','landscape_16_9','square_1_1')
  ),
  add constraint live_odo_show_program_transition_check check (
    program_transition in ('cut','auto','fade')
  ),
  add constraint live_odo_show_source_assignments_check check (
    jsonb_typeof(source_assignments) = 'object'
    and jsonb_array_length(jsonb_path_query_array(source_assignments, '$.*')) <= 13
    and octet_length(source_assignments::text) <= 2048
  ),
  add constraint live_odo_show_previous_program_state_check check (
    jsonb_typeof(previous_program_state) = 'object'
    and octet_length(previous_program_state::text) <= 4096
  ),
  add constraint live_odo_show_program_versions_check check (
    controller_generation > 0 and program_version > 0
  ),
  add constraint live_odo_show_controller_shape_valid check (
    (control_source in ('odo','system')
      and control_user_id is null and controller_instance_id is null
      and control_lease_expires_at is null)
    or (control_source = 'mobile_host'
      and control_user_id is not null and controller_instance_id is null)
    or (control_source = 'studio_host'
      and control_user_id is not null and controller_instance_id is not null
      and control_lease_expires_at is not null)
  );

create table public.live_program_sources (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.live_sessions(id) on delete cascade,
  source_key text not null check (source_key ~ '^[a-z][a-z0-9_.:-]{2,119}$'),
  source_type text not null check (source_type in (
    'host_camera','participant_camera','active_pair','quick_connect_pool',
    'odo_stage','audience_pulse','branded_visual','screen_share',
    'screen_share_audio','host_microphone','dj_audio','programme_music'
  )),
  source_role text not null check (source_role in (
    'visual','host_audio','screen_audio','atmosphere_audio'
  )),
  owner_user_id uuid references auth.users(id) on delete set null,
  provider_user_id text check (
    provider_user_id is null or char_length(provider_user_id) between 1 and 128
  ),
  has_video boolean not null default false,
  has_audio boolean not null default false,
  readiness text not null default 'unavailable' check (readiness in (
    'unavailable','permission_required','preparing','ready','live','ended','failed'
  )),
  health text not null default 'unknown' check (health in (
    'unknown','healthy','degraded','lost'
  )),
  muted boolean not null default false,
  failure_reason_code text check (
    failure_reason_code is null or failure_reason_code ~ '^[a-z][a-z0-9_]{0,119}$'
  ),
  generation bigint not null default 1 check (generation > 0),
  version bigint not null default 1 check (version > 0),
  last_seen_at timestamptz,
  safe_metadata jsonb not null default '{}'::jsonb check (
    jsonb_typeof(safe_metadata) = 'object'
    and octet_length(safe_metadata::text) <= 1024
  ),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (session_id, source_key),
  constraint live_program_source_media_shape check (
    has_video or has_audio
    or source_type in ('quick_connect_pool','active_pair','odo_stage',
      'audience_pulse','branded_visual','programme_music')
  )
);

create index live_program_sources_session_health_idx
  on public.live_program_sources(session_id, readiness, health, updated_at desc);

create table public.live_program_command_events (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.live_sessions(id) on delete cascade,
  command_id uuid not null unique,
  command_type text not null check (command_type in (
    'TAKE_CONTROL','RENEW_CONTROL','RELEASE_CONTROL','RESUME_ODO',
    'TAKE','CUT','REGISTER_SOURCE','UPDATE_SOURCE','END_SOURCE','FALLBACK'
  )),
  source text not null check (source in ('odo','mobile_host','studio_host','system')),
  actor_user_id uuid references auth.users(id) on delete set null,
  controller_instance_id uuid,
  expected_controller_generation bigint,
  resulting_controller_generation bigint not null check (resulting_controller_generation > 0),
  expected_program_version bigint,
  resulting_program_version bigint not null check (resulting_program_version > 0),
  status text not null check (status in ('applied','idempotent','stale','rejected')),
  reason_code text not null check (reason_code ~ '^[a-z][a-z0-9_]{0,119}$'),
  created_at timestamptz not null default timezone('utc', now())
);

create index live_program_command_events_session_idx
  on public.live_program_command_events(session_id, created_at desc);

create table public.live_program_source_updates (
  session_id uuid primary key references public.live_sessions(id) on delete cascade,
  version bigint not null default 1 check (version > 0),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.live_program_sources enable row level security;
alter table public.live_program_command_events enable row level security;
alter table public.live_program_source_updates enable row level security;

revoke all on table public.live_program_sources, public.live_program_command_events
from public, anon, authenticated, service_role;
revoke insert, update, delete on table public.live_program_source_updates
from public, anon, authenticated, service_role;
grant select on table public.live_program_source_updates to authenticated;

create policy live_program_source_updates_participant_select
on public.live_program_source_updates for select to authenticated
using (exists (
  select 1 from public.live_participants participant
  where participant.session_id = live_program_source_updates.session_id
    and participant.user_id = auth.uid()
    and participant.state not in ('left','removed','banned')
) or public.is_admin_user(auth.uid()));

create trigger live_program_sources_updated_at
before update on public.live_program_sources
for each row execute function public.set_updated_at();

create or replace function public.live_program_bump_source_update_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare v_session_id uuid := coalesce(new.session_id, old.session_id);
begin
  insert into public.live_program_source_updates(session_id, version)
  values (v_session_id, 1)
  on conflict (session_id) do update set
    version = public.live_program_source_updates.version + 1,
    updated_at = timezone('utc', now());
  return coalesce(new, old);
end;
$$;

revoke all on function public.live_program_bump_source_update_v1()
from public, anon, authenticated, service_role;

create trigger live_program_sources_bump
after insert or update or delete on public.live_program_sources
for each row execute function public.live_program_bump_source_update_v1();

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
      when new.current_scene = 'host_focus' then 'host_camera'
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

drop trigger if exists live_odo_show_program_output_source_sync
on public.live_odo_show_sessions;
create trigger live_odo_show_program_output_source_sync
before insert or update of current_scene, target_canvas, program_transition,
  source_assignments, control_source, control_user_id, controller_instance_id
on public.live_odo_show_sessions
for each row execute function public.live_odo_sync_program_output_source_v1();

alter table public.live_program_source_updates replica identity full;
alter publication supabase_realtime add table public.live_program_source_updates;

commit;
