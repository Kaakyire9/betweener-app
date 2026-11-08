-- Adaptive Stage Engine 2.0, Milestone 1.
-- Canonical server scene metadata, assignment validation and guarded V2/V3 TAKE fences.
-- Visible Program rendering remains on V1.

begin;

create table if not exists private.live_scene_manifest_v2 (
  manifest_version text not null,
  scene_id text not null,
  family text not null check (family in (
    'people', 'present', 'engage', 'brand_safety', 'audio_led'
  )),
  supported_canvases text[] not null,
  slot_rules jsonb not null check (jsonb_typeof(slot_rules) = 'object'),
  required_slots text[] not null,
  minimum_humans integer not null check (minimum_humans between 0 and 6),
  maximum_humans integer not null check (maximum_humans between minimum_humans and 6),
  fallback_chain text[] not null,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (manifest_version, scene_id)
);

alter table private.live_scene_manifest_v2 enable row level security;
revoke all on table private.live_scene_manifest_v2 from public, anon, authenticated;
grant select on table private.live_scene_manifest_v2 to service_role;

comment on table private.live_scene_manifest_v2 is
  'Restricted generated mirror of @betweener/live-program-domain SceneManifestV2. TAKE validation reads this table; parity tests prevent TypeScript/SQL drift.';

insert into private.live_scene_manifest_v2(
  manifest_version, scene_id, family, supported_canvases, slot_rules,
  required_slots, minimum_humans, maximum_humans, fallback_chain
)
values
  ('adaptive-stage-v2.0.0-m1','host_focus','people',array['portrait_9_16','landscape_16_9','square_1_1'],
    '{"host":{"types":["host_camera"],"required":true,"human":true}}',array['host'],1,1,array['branded_intermission']),
  ('adaptive-stage-v2.0.0-m1','panel_focus','people',array['portrait_9_16','landscape_16_9','square_1_1'],
    '{"host":{"types":["host_camera"],"required":true,"human":true},"guest_1":{"types":["participant_camera"],"required":false,"human":true},"guest_2":{"types":["participant_camera"],"required":false,"human":true},"guest_3":{"types":["participant_camera"],"required":false,"human":true},"guest_4":{"types":["participant_camera"],"required":false,"human":true},"guest_5":{"types":["participant_camera"],"required":false,"human":true}}',array['host'],1,6,array['host_focus','branded_intermission']),
  ('adaptive-stage-v2.0.0-m1','host_plus_pool','people',array['portrait_9_16','landscape_16_9','square_1_1'],
    '{"host":{"types":["host_camera"],"required":true,"human":true},"pool":{"types":["quick_connect_pool"],"required":true,"human":false}}',array['host','pool'],1,4,array['branded_intermission']),
  ('adaptive-stage-v2.0.0-m1','pool_focus','people',array['portrait_9_16','landscape_16_9','square_1_1'],
    '{"pool":{"types":["quick_connect_pool"],"required":true,"human":false}}',array['pool'],0,4,array['branded_intermission']),
  ('adaptive-stage-v2.0.0-m1','pair_forming','people',array['portrait_9_16','landscape_16_9','square_1_1'],
    '{"pool":{"types":["quick_connect_pool"],"required":true,"human":false}}',array['pool'],0,2,array['branded_intermission']),
  ('adaptive-stage-v2.0.0-m1','quick_connect_active','people',array['portrait_9_16','landscape_16_9','square_1_1'],
    '{"pair":{"types":["active_pair"],"required":true,"human":false}}',array['pair'],2,2,array['branded_intermission']),
  ('adaptive-stage-v2.0.0-m1','audience_pulse','engage',array['portrait_9_16','landscape_16_9','square_1_1'],
    '{"pulse":{"types":["audience_pulse"],"required":true,"human":false}}',array['pulse'],0,0,array['branded_intermission']),
  ('adaptive-stage-v2.0.0-m1','conversation_topic','engage',array['portrait_9_16','landscape_16_9','square_1_1'],
    '{"odo":{"types":["odo_stage","branded_visual"],"required":true,"human":false}}',array['odo'],0,0,array['branded_intermission']),
  ('adaptive-stage-v2.0.0-m1','odo_stage','engage',array['portrait_9_16','landscape_16_9','square_1_1'],
    '{"odo":{"types":["odo_stage","branded_visual"],"required":true,"human":false}}',array['odo'],0,0,array['branded_intermission']),
  ('adaptive-stage-v2.0.0-m1','music_intermission','audio_led',array['portrait_9_16','landscape_16_9','square_1_1'],
    '{"odo":{"types":["odo_stage","branded_visual"],"required":true,"human":false}}',array['odo'],0,0,array['branded_intermission']),
  ('adaptive-stage-v2.0.0-m1','branded_intermission','brand_safety',array['portrait_9_16','landscape_16_9','square_1_1'],
    '{"odo":{"types":["odo_stage","branded_visual"],"required":true,"human":false}}',array['odo'],0,0,array[]::text[]),
  ('adaptive-stage-v2.0.0-m1','session_closing','brand_safety',array['portrait_9_16','landscape_16_9','square_1_1'],
    '{"odo":{"types":["odo_stage","branded_visual"],"required":true,"human":false}}',array['odo'],0,0,array['branded_intermission']),
  ('adaptive-stage-v2.0.0-m1','screen_full','present',array['portrait_9_16','landscape_16_9','square_1_1'],
    '{"primary":{"types":["screen_share"],"required":true,"human":false}}',array['primary'],0,0,array['host_focus','branded_intermission']),
  ('adaptive-stage-v2.0.0-m1','screen_plus_host','present',array['portrait_9_16','landscape_16_9','square_1_1'],
    '{"primary":{"types":["screen_share"],"required":true,"human":false},"host":{"types":["host_camera"],"required":true,"human":true}}',array['primary','host'],1,1,array['host_focus','branded_intermission']),
  ('adaptive-stage-v2.0.0-m1','screen_plus_pair','present',array['portrait_9_16','landscape_16_9','square_1_1'],
    '{"primary":{"types":["screen_share"],"required":true,"human":false},"pair":{"types":["active_pair"],"required":true,"human":false}}',array['primary','pair'],2,2,array['host_focus','branded_intermission']),
  ('adaptive-stage-v2.0.0-m1','screen_plus_panel','present',array['portrait_9_16','landscape_16_9','square_1_1'],
    '{"primary":{"types":["screen_share"],"required":true,"human":false},"host":{"types":["host_camera"],"required":true,"human":true},"guest_1":{"types":["participant_camera"],"required":false,"human":true},"guest_2":{"types":["participant_camera"],"required":false,"human":true},"guest_3":{"types":["participant_camera"],"required":false,"human":true},"guest_4":{"types":["participant_camera"],"required":false,"human":true},"guest_5":{"types":["participant_camera"],"required":false,"human":true}}',array['primary','host'],1,6,array['host_focus','branded_intermission']),
  ('adaptive-stage-v2.0.0-m1','screen_discussion','present',array['portrait_9_16','landscape_16_9','square_1_1'],
    '{"primary":{"types":["screen_share"],"required":true,"human":false},"host":{"types":["host_camera"],"required":true,"human":true},"guest_1":{"types":["participant_camera"],"required":false,"human":true},"guest_2":{"types":["participant_camera"],"required":false,"human":true},"guest_3":{"types":["participant_camera"],"required":false,"human":true},"guest_4":{"types":["participant_camera"],"required":false,"human":true},"guest_5":{"types":["participant_camera"],"required":false,"human":true}}',array['primary','host'],1,6,array['host_focus','branded_intermission']),
  ('adaptive-stage-v2.0.0-m1','screen_plus_pool','present',array['portrait_9_16','landscape_16_9','square_1_1'],
    '{"primary":{"types":["screen_share"],"required":true,"human":false},"pool":{"types":["quick_connect_pool"],"required":true,"human":false}}',array['primary','pool'],0,4,array['host_focus','branded_intermission']),
  ('adaptive-stage-v2.0.0-m1','screen_plus_audience_pulse','present',array['portrait_9_16','landscape_16_9','square_1_1'],
    '{"primary":{"types":["screen_share"],"required":true,"human":false},"pulse":{"types":["audience_pulse"],"required":true,"human":false}}',array['primary','pulse'],0,0,array['host_focus','branded_intermission']),
  ('adaptive-stage-v2.0.0-m1','screen_plus_odo','present',array['portrait_9_16','landscape_16_9','square_1_1'],
    '{"primary":{"types":["screen_share"],"required":true,"human":false},"odo":{"types":["odo_stage","branded_visual"],"required":true,"human":false}}',array['primary','odo'],0,0,array['host_focus','branded_intermission']),
  ('adaptive-stage-v2.0.0-m1','dj_plus_pool','audio_led',array['portrait_9_16','landscape_16_9','square_1_1'],
    '{"host":{"types":["host_camera"],"required":false,"human":true},"pool":{"types":["quick_connect_pool"],"required":true,"human":false},"audio_atmosphere":{"types":["dj_audio","programme_music"],"required":true,"human":false}}',array['pool','audio_atmosphere'],0,4,array['pool_focus','branded_intermission'])
on conflict (manifest_version, scene_id) do update set
  family = excluded.family,
  supported_canvases = excluded.supported_canvases,
  slot_rules = excluded.slot_rules,
  required_slots = excluded.required_slots,
  minimum_humans = excluded.minimum_humans,
  maximum_humans = excluded.maximum_humans,
  fallback_chain = excluded.fallback_chain;

-- V1 already carries optional audio assignments across scene changes. Preserve
-- that behaviour while making each accepted audio slot and type explicit.
update private.live_scene_manifest_v2
set slot_rules = jsonb_build_object(
  'audio_host', jsonb_build_object(
    'types', jsonb_build_array('host_microphone'), 'required', false, 'human', false
  ),
  'audio_screen', jsonb_build_object(
    'types', jsonb_build_array('screen_share_audio'), 'required', false, 'human', false
  ),
  'audio_atmosphere', jsonb_build_object(
    'types', jsonb_build_array('dj_audio', 'programme_music'), 'required', false, 'human', false
  )
) || slot_rules
where manifest_version = 'adaptive-stage-v2.0.0-m1';

create table if not exists private.adaptive_stage_v2_flags (
  id boolean primary key default true check (id),
  shadow_enabled boolean not null default false,
  diagnostics_enabled boolean not null default false,
  studio_render_enabled boolean not null default false,
  native_render_enabled boolean not null default false,
  compositor_render_enabled boolean not null default false,
  updated_at timestamptz not null default timezone('utc', now())
);

insert into private.adaptive_stage_v2_flags(id) values (true) on conflict (id) do nothing;
alter table private.adaptive_stage_v2_flags enable row level security;
revoke all on table private.adaptive_stage_v2_flags from public, anon, authenticated;
grant select, update on table private.adaptive_stage_v2_flags to service_role;

create table if not exists private.adaptive_stage_v2_diagnostics (
  id bigint generated always as identity primary key,
  session_id uuid references public.live_sessions(id) on delete cascade,
  event_name text not null check (event_name in (
    'adaptive_stage_v2_shadow_plan_generated',
    'adaptive_stage_v2_shadow_match',
    'adaptive_stage_v2_shadow_divergence',
    'adaptive_stage_v2_invalid_assignment_rejected',
    'adaptive_stage_v2_manifest_mismatch',
    'adaptive_stage_v2_source_identity_missing',
    'adaptive_stage_v2_arbitrary_fallback_prevented',
    'adaptive_stage_v2_plan_generation_error'
  )),
  safe_details jsonb not null default '{}'::jsonb check (
    jsonb_typeof(safe_details) = 'object' and octet_length(safe_details::text) <= 4096
  ),
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists adaptive_stage_v2_diagnostics_session_idx
  on private.adaptive_stage_v2_diagnostics(session_id, created_at desc);
alter table private.adaptive_stage_v2_diagnostics enable row level security;
revoke all on table private.adaptive_stage_v2_diagnostics from public, anon, authenticated;
grant select on table private.adaptive_stage_v2_diagnostics to service_role;

alter table public.live_program_command_events
  add column if not exists manifest_version text,
  add column if not exists source_graph_version bigint,
  add column if not exists shadow_plan_hash text;

alter table public.live_program_command_events
  drop constraint if exists live_program_command_manifest_version_valid,
  drop constraint if exists live_program_command_source_graph_version_valid,
  drop constraint if exists live_program_command_shadow_plan_hash_valid;

alter table public.live_program_command_events
  add constraint live_program_command_manifest_version_valid check (
    manifest_version is null or manifest_version ~ '^[a-z0-9][a-z0-9._-]{2,79}$'
  ),
  add constraint live_program_command_source_graph_version_valid check (
    source_graph_version is null or source_graph_version >= 0
  ),
  add constraint live_program_command_shadow_plan_hash_valid check (
    shadow_plan_hash is null or shadow_plan_hash ~ '^[0-9a-f]{8}$'
  );

-- Stop no-op logical-source refreshes from invalidating the source graph.
create or replace function public.live_program_ensure_logical_sources_v1(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  v_host_user_id uuid;
  v_host_ready boolean := false;
  v_pool_ready boolean := false;
  v_pair_ready boolean := false;
  v_music_ready boolean := false;
begin
  select session.created_by_user_id into v_host_user_id
  from public.live_sessions session where session.id = p_session_id;
  select exists (
    select 1 from public.live_participants participant
    where participant.session_id = p_session_id and participant.user_id = v_host_user_id
      and participant.state in ('backstage','on_stage')
  ) into v_host_ready;
  select exists (
    select 1 from public.live_quick_connect_participants participant
    where participant.session_id = p_session_id and participant.state = 'waiting'
      and participant.connection_state = 'connected'
      and participant.last_seen_at >= timezone('utc', now()) - interval '45 seconds'
  ) into v_pool_ready;
  select exists (
    select 1 from public.live_quick_connect_pairings pairing
    where pairing.session_id = p_session_id and pairing.state in ('active','reconnect_grace')
  ) into v_pair_ready;
  select exists (
    select 1 from public.live_music_session_state music
    where music.session_id = p_session_id and music.status <> 'stopped'
  ) into v_music_ready;

  insert into public.live_program_sources(
    session_id, source_key, source_type, source_role, owner_user_id,
    provider_user_id, has_video, has_audio, readiness, health, last_seen_at
  ) values
    (p_session_id, 'server.host', 'host_camera', 'visual', v_host_user_id,
      v_host_user_id::text, true, false,
      case when v_host_ready then 'live' else 'unavailable' end,
      case when v_host_ready then 'healthy' else 'unknown' end, timezone('utc', now())),
    (p_session_id, 'server.pool', 'quick_connect_pool', 'visual', null,
      null, false, false, case when v_pool_ready then 'live' else 'ready' end,
      'healthy', timezone('utc', now())),
    (p_session_id, 'server.pair', 'active_pair', 'visual', null,
      null, false, false, case when v_pair_ready then 'live' else 'ready' end,
      'healthy', timezone('utc', now())),
    (p_session_id, 'server.odo', 'odo_stage', 'visual', null,
      null, false, false, 'ready', 'healthy', timezone('utc', now())),
    (p_session_id, 'server.pulse', 'audience_pulse', 'visual', null,
      null, false, false, 'ready', 'healthy', timezone('utc', now())),
    (p_session_id, 'server.brand', 'branded_visual', 'visual', null,
      null, false, false, 'ready', 'healthy', timezone('utc', now())),
    (p_session_id, 'server.music', 'programme_music', 'atmosphere_audio', null,
      null, false, true, case when v_music_ready then 'live' else 'ready' end,
      'healthy', timezone('utc', now()))
  on conflict (session_id, source_key) do update set
    owner_user_id = excluded.owner_user_id,
    provider_user_id = excluded.provider_user_id,
    readiness = excluded.readiness,
    health = excluded.health,
    last_seen_at = excluded.last_seen_at,
    version = public.live_program_sources.version + 1
  where (public.live_program_sources.owner_user_id,
    public.live_program_sources.provider_user_id,
    public.live_program_sources.readiness,
    public.live_program_sources.health)
    is distinct from (excluded.owner_user_id, excluded.provider_user_id,
      excluded.readiness, excluded.health);

  insert into public.live_program_sources(
    session_id, source_key, source_type, source_role, owner_user_id,
    provider_user_id, has_video, has_audio, readiness, health, last_seen_at
  )
  select p_session_id,
    'participant.' || replace(participant.user_id::text, '-', ''),
    'participant_camera', 'visual', participant.user_id,
    participant.user_id::text, true, true, 'live', 'healthy', timezone('utc', now())
  from public.live_participants participant
  where participant.session_id = p_session_id and participant.state = 'on_stage'
  on conflict (session_id, source_key) do update set
    provider_user_id = excluded.provider_user_id,
    readiness = 'live', health = 'healthy', last_seen_at = excluded.last_seen_at,
    version = public.live_program_sources.version + 1
  where (public.live_program_sources.provider_user_id,
    public.live_program_sources.readiness, public.live_program_sources.health)
    is distinct from (excluded.provider_user_id, 'live'::text, 'healthy'::text);

  update public.live_program_sources source set
    readiness = 'unavailable', health = 'unknown', version = source.version + 1
  where source.session_id = p_session_id
    and source.source_type = 'participant_camera'
    and source.readiness <> 'unavailable'
    and not exists (
      select 1 from public.live_participants participant
      where participant.session_id = p_session_id
        and participant.user_id = source.owner_user_id
        and participant.state = 'on_stage'
    );
end;
$$;

revoke all on function public.live_program_ensure_logical_sources_v1(uuid)
from public, anon, authenticated, service_role;

create or replace function private.live_program_assignment_error_v2(
  p_session_id uuid,
  p_scene text,
  p_target_canvas text,
  p_assignments jsonb,
  p_manifest_version text,
  p_expected_source_graph_version bigint default null
)
returns text
language plpgsql
security definer
set search_path = private, public, pg_catalog
set row_security = off
as $$
declare
  v_definition private.live_scene_manifest_v2;
  v_session public.live_sessions;
  v_configuration public.live_odo_configuration;
  v_source public.live_program_sources;
  v_graph_version bigint := 0;
  v_slot text;
  v_source_key text;
  v_rule jsonb;
  v_required text;
  v_human_count integer := 0;
  v_human_owners uuid[] := array[]::uuid[];
begin
  if p_manifest_version <> 'adaptive-stage-v2.0.0-m1' then
    return 'manifest_outdated';
  end if;
  select * into v_definition from private.live_scene_manifest_v2 definition
  where definition.manifest_version = p_manifest_version
    and definition.scene_id = p_scene;
  if v_definition.scene_id is null then return 'program_scene_unknown'; end if;
  if not (p_target_canvas = any(v_definition.supported_canvases)) then
    return 'program_canvas_unsupported';
  end if;
  if jsonb_typeof(p_assignments) <> 'object'
    or jsonb_array_length(jsonb_path_query_array(p_assignments, '$.*')) > 15
    or octet_length(p_assignments::text) > 3072 then
    return 'program_assignment_invalid';
  end if;

  select * into v_session from public.live_sessions session
  where session.id = p_session_id for share;
  if v_session.id is null then return 'live_session_not_found'; end if;
  select * into v_configuration from public.live_odo_configuration where id = true;
  select coalesce(update_row.version, 0) into v_graph_version
  from public.live_program_source_updates update_row
  where update_row.session_id = p_session_id for share;
  if p_expected_source_graph_version is not null
    and p_expected_source_graph_version <> v_graph_version then
    return 'source_graph_stale';
  end if;

  if exists (
    select 1 from jsonb_object_keys(p_assignments) assignment(slot_name)
    where not (v_definition.slot_rules ? assignment.slot_name)
  ) then return 'program_assignment_invalid'; end if;
  if exists (
    select 1 from jsonb_each_text(p_assignments) assignment
    group by assignment.value having count(*) > 1
  ) then return 'program_source_duplicated'; end if;
  foreach v_required in array v_definition.required_slots loop
    if not (p_assignments ? v_required) then return 'program_required_source_missing'; end if;
  end loop;

  for v_slot, v_source_key in select key, value from jsonb_each_text(p_assignments)
  loop
    if v_source_key !~ '^[a-z][a-z0-9_.:-]{2,119}$' then
      return 'program_assignment_invalid';
    end if;
    v_rule := v_definition.slot_rules -> v_slot;
    select * into v_source from public.live_program_sources source
    where source.session_id = p_session_id and source.source_key = v_source_key
    for share;
    if v_source.id is null then return 'program_source_not_found'; end if;
    if v_source.readiness not in ('ready','live') or v_source.health = 'lost' then
      return 'program_source_not_ready';
    end if;
    if not ((v_rule -> 'types') ? v_source.source_type) then
      return 'program_source_type_invalid';
    end if;
    if coalesce((v_rule ->> 'human')::boolean, false) then
      if v_source.owner_user_id is null or v_source.provider_user_id is null then
        return 'program_source_identity_missing';
      end if;
      if v_source.owner_user_id = any(v_human_owners) then
        return 'program_human_duplicated';
      end if;
      if not exists (
        select 1 from public.live_participants participant
        where participant.session_id = p_session_id
          and participant.user_id = v_source.owner_user_id
          and participant.state in ('backstage','on_stage')
      ) and not public.live_studio_is_authorized_v1(
        p_session_id, v_source.owner_user_id, 'publish'
      ) then return 'program_human_not_admitted'; end if;
      v_human_owners := array_append(v_human_owners, v_source.owner_user_id);
      v_human_count := v_human_count + 1;
      if v_slot in ('guest_4','guest_5') and v_session.maximum_publishers < 6 then
        return 'program_capacity_exceeded';
      end if;
    end if;
    if v_source.source_type = 'active_pair' and (
      v_source.source_key <> 'server.pair' or not exists (
        select 1 from public.live_quick_connect_pairings pairing
        where pairing.session_id = p_session_id
          and pairing.state in ('active','reconnect_grace')
      )
    ) then return 'program_active_pair_not_authoritative'; end if;
    if v_source.source_type = 'quick_connect_pool'
      and v_source.source_key <> 'server.pool' then
      return 'program_pool_not_authoritative';
    end if;
  end loop;

  if v_human_count > least(v_session.maximum_publishers, v_definition.maximum_humans, 6) then
    return 'program_capacity_exceeded';
  end if;
  if v_session.format = 'quick_connect' and v_human_count > 2 then
    return 'program_quick_connect_capacity_exceeded';
  end if;
  if v_human_count > 4 and (
    v_session.maximum_publishers <> 6
    or not coalesce(v_configuration.large_panel_enabled, false)
  ) then return 'program_large_panel_unavailable'; end if;
  return null;
end;
$$;

revoke all on function private.live_program_assignment_error_v2(
  uuid, text, text, jsonb, text, bigint
) from public, anon, authenticated, service_role;

create or replace function public.live_program_assignment_error_v1(
  p_session_id uuid,
  p_scene text,
  p_assignments jsonb
)
returns text
language plpgsql
security definer
set search_path = public, private, pg_catalog
set row_security = off
as $$
begin
  return private.live_program_assignment_error_v2(
    p_session_id,
    p_scene,
    'portrait_9_16',
    coalesce(p_assignments, '{}'::jsonb),
    'adaptive-stage-v2.0.0-m1',
    null
  );
end;
$$;

revoke all on function public.live_program_assignment_error_v1(uuid, text, jsonb)
from public, anon, authenticated, service_role;

create or replace function public.rpc_get_live_program_source_graph_version_v1(
  p_session_id uuid
)
returns bigint
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare v_version bigint;
begin
  if auth.uid() is null or not (
    public.can_view_live_session(p_session_id, auth.uid())
    or public.live_studio_is_authorized_v1(p_session_id, auth.uid(), 'view')
  ) then
    raise exception 'live_program_source_graph_forbidden' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('live_program:' || p_session_id::text, 0));
  perform public.live_program_ensure_logical_sources_v1(p_session_id);
  select coalesce(update_row.version, 0) into v_version
  from public.live_program_source_updates update_row
  where update_row.session_id = p_session_id;
  return coalesce(v_version, 0);
end;
$$;

revoke all on function public.rpc_get_live_program_source_graph_version_v1(uuid)
from public, anon;
grant execute on function public.rpc_get_live_program_source_graph_version_v1(uuid)
to authenticated, service_role;

create or replace function public.rpc_record_adaptive_stage_v2_diagnostic_v1(
  p_session_id uuid,
  p_event_name text,
  p_safe_details jsonb default '{}'::jsonb
)
returns boolean
language plpgsql
security definer
set search_path = public, private, pg_catalog
set row_security = off
as $$
begin
  if auth.uid() is null or not (
    public.can_view_live_session(p_session_id, auth.uid())
    or public.live_studio_is_authorized_v1(p_session_id, auth.uid(), 'view')
  ) then raise exception 'adaptive_stage_diagnostic_forbidden' using errcode = '42501'; end if;
  if p_event_name not in (
    'adaptive_stage_v2_shadow_plan_generated',
    'adaptive_stage_v2_shadow_match',
    'adaptive_stage_v2_shadow_divergence',
    'adaptive_stage_v2_source_identity_missing',
    'adaptive_stage_v2_arbitrary_fallback_prevented',
    'adaptive_stage_v2_plan_generation_error'
  ) or jsonb_typeof(p_safe_details) <> 'object'
    or octet_length(p_safe_details::text) > 4096 then
    raise exception 'adaptive_stage_diagnostic_invalid' using errcode = '22023';
  end if;
  insert into private.adaptive_stage_v2_diagnostics(session_id, event_name, safe_details)
  values (p_session_id, p_event_name, p_safe_details);
  return true;
end;
$$;

revoke all on function public.rpc_record_adaptive_stage_v2_diagnostic_v1(
  uuid, text, jsonb
) from public, anon;
grant execute on function public.rpc_record_adaptive_stage_v2_diagnostic_v1(
  uuid, text, jsonb
) to authenticated, service_role;

create or replace function public.rpc_studio_take_live_program_v3(
  p_session_id uuid,
  p_controller_instance_id uuid,
  p_expected_controller_generation bigint,
  p_expected_program_version bigint,
  p_expected_source_graph_version bigint,
  p_manifest_version text,
  p_command_id uuid,
  p_scene text,
  p_target_canvas text,
  p_source_assignments jsonb,
  p_transition text default 'auto',
  p_shadow_plan_hash text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_catalog
set row_security = off
as $$
declare v_error text; v_result jsonb;
begin
  if not public.live_studio_has_aal2_v1() then
    raise exception 'live_studio_step_up_required' using errcode = '42501';
  end if;
  if p_shadow_plan_hash is not null and p_shadow_plan_hash !~ '^[0-9a-f]{8}$' then
    raise exception 'live_studio_program_invalid' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('live_program:' || p_session_id::text, 0));
  perform public.live_program_ensure_logical_sources_v1(p_session_id);
  v_error := private.live_program_assignment_error_v2(
    p_session_id, p_scene, p_target_canvas, coalesce(p_source_assignments, '{}'::jsonb),
    p_manifest_version, p_expected_source_graph_version
  );
  if v_error is not null then
    insert into private.adaptive_stage_v2_diagnostics(session_id, event_name, safe_details)
    values (p_session_id,
      case when v_error = 'manifest_outdated'
        then 'adaptive_stage_v2_manifest_mismatch'
        when v_error = 'program_source_identity_missing'
        then 'adaptive_stage_v2_source_identity_missing'
        else 'adaptive_stage_v2_invalid_assignment_rejected' end,
      jsonb_build_object('reasonCode', v_error, 'scene', p_scene, 'canvas', p_target_canvas));
    return public.live_program_command_result_v1(false, v_error, p_session_id);
  end if;
  v_result := public.rpc_studio_take_live_program_v2(
    p_session_id, p_controller_instance_id, p_expected_controller_generation,
    p_expected_program_version, p_command_id, p_scene, p_target_canvas,
    p_source_assignments, p_transition
  );
  if coalesce((v_result ->> 'applied')::boolean, false) then
    update public.live_program_command_events set
      manifest_version = p_manifest_version,
      source_graph_version = p_expected_source_graph_version,
      shadow_plan_hash = p_shadow_plan_hash
    where command_id = p_command_id;
  end if;
  return v_result;
end;
$$;

revoke all on function public.rpc_studio_take_live_program_v3(
  uuid, uuid, bigint, bigint, bigint, text, uuid, text, text, jsonb, text, text
) from public, anon;
grant execute on function public.rpc_studio_take_live_program_v3(
  uuid, uuid, bigint, bigint, bigint, text, uuid, text, text, jsonb, text, text
) to authenticated, service_role;

create or replace function public.rpc_mobile_take_live_program_v2(
  p_session_id uuid,
  p_expected_program_version bigint,
  p_expected_source_graph_version bigint,
  p_manifest_version text,
  p_command_id uuid,
  p_scene text,
  p_target_canvas text,
  p_source_assignments jsonb,
  p_transition text default 'auto',
  p_shadow_plan_hash text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_catalog
set row_security = off
as $$
declare v_error text; v_result jsonb;
begin
  if p_shadow_plan_hash is not null and p_shadow_plan_hash !~ '^[0-9a-f]{8}$' then
    raise exception 'live_studio_program_invalid' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('live_program:' || p_session_id::text, 0));
  perform public.live_program_ensure_logical_sources_v1(p_session_id);
  v_error := private.live_program_assignment_error_v2(
    p_session_id, p_scene, p_target_canvas, coalesce(p_source_assignments, '{}'::jsonb),
    p_manifest_version, p_expected_source_graph_version
  );
  if v_error is not null then
    insert into private.adaptive_stage_v2_diagnostics(session_id, event_name, safe_details)
    values (p_session_id,
      case when v_error = 'manifest_outdated'
        then 'adaptive_stage_v2_manifest_mismatch'
        when v_error = 'program_source_identity_missing'
        then 'adaptive_stage_v2_source_identity_missing'
        else 'adaptive_stage_v2_invalid_assignment_rejected' end,
      jsonb_build_object('reasonCode', v_error, 'scene', p_scene, 'canvas', p_target_canvas));
    return public.live_program_command_result_v1(false, v_error, p_session_id);
  end if;
  v_result := public.rpc_mobile_take_live_program_v1(
    p_session_id, p_expected_program_version, p_command_id, p_scene,
    p_target_canvas, p_source_assignments, p_transition
  );
  if coalesce((v_result ->> 'applied')::boolean, false) then
    update public.live_program_command_events set
      manifest_version = p_manifest_version,
      source_graph_version = p_expected_source_graph_version,
      shadow_plan_hash = p_shadow_plan_hash
    where command_id = p_command_id;
  end if;
  return v_result;
end;
$$;

revoke all on function public.rpc_mobile_take_live_program_v2(
  uuid, bigint, bigint, text, uuid, text, text, jsonb, text, text
) from public, anon;
grant execute on function public.rpc_mobile_take_live_program_v2(
  uuid, bigint, bigint, text, uuid, text, text, jsonb, text, text
) to authenticated, service_role;

commit;
