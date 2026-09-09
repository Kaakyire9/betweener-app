-- Betweener Live Phase 10C: Odo Guarded Autopilot.
-- Automatic authority is deliberately limited to presentation and bounded
-- engagement. This migration does not grant Odo matchmaking, consent, RTC,
-- moderation, pool, round-lifecycle, or session-lifecycle authority.

begin;

alter table public.live_odo_configuration
  add column if not exists guarded_autopilot_enabled boolean not null default false,
  add column if not exists full_autopilot_enabled boolean not null default false,
  add column if not exists auto_narration_enabled boolean not null default false,
  add column if not exists auto_scene_enabled boolean not null default false,
  add column if not exists auto_spark_enabled boolean not null default false,
  add column if not exists auto_audience_pulse_enabled boolean not null default false,
  add column if not exists auto_intermission_enabled boolean not null default false,
  add column if not exists guarded_autopilot_internal_only boolean not null default true,
  add column if not exists automatic_scene_minimum_dwell_seconds integer not null default 15,
  add column if not exists host_scene_suppression_seconds integer not null default 30,
  add column if not exists automatic_pulse_cooldown_seconds integer not null default 300,
  add column if not exists automatic_spark_delay_seconds integer not null default 45,
  add column if not exists automatic_narration_cooldown_seconds integer not null default 30,
  add column if not exists automatic_intermission_cooldown_seconds integer not null default 180,
  add column if not exists automatic_intervention_window_seconds integer not null default 60,
  add column if not exists maximum_automatic_interventions_per_window integer not null default 3,
  add column if not exists minimum_audience_for_automatic_pulse integer not null default 3;

alter table public.live_odo_configuration
  add constraint live_odo_phase10c_full_autopilot_disabled
    check (not full_autopilot_enabled),
  add constraint live_odo_phase10c_scene_dwell_valid
    check (automatic_scene_minimum_dwell_seconds between 5 and 300),
  add constraint live_odo_phase10c_host_suppression_valid
    check (host_scene_suppression_seconds between 5 and 600),
  add constraint live_odo_phase10c_pulse_cooldown_valid
    check (automatic_pulse_cooldown_seconds between 60 and 3600),
  add constraint live_odo_phase10c_spark_delay_valid
    check (automatic_spark_delay_seconds between 15 and 600),
  add constraint live_odo_phase10c_narration_cooldown_valid
    check (automatic_narration_cooldown_seconds between 10 and 600),
  add constraint live_odo_phase10c_intermission_cooldown_valid
    check (automatic_intermission_cooldown_seconds between 60 and 3600),
  add constraint live_odo_phase10c_intervention_window_valid
    check (automatic_intervention_window_seconds between 30 and 600),
  add constraint live_odo_phase10c_intervention_limit_valid
    check (maximum_automatic_interventions_per_window between 1 and 10),
  add constraint live_odo_phase10c_minimum_audience_valid
    check (minimum_audience_for_automatic_pulse between 2 and 10000);

alter table public.live_odo_session_state
  drop constraint if exists live_odo_session_state_current_scene_check;
alter table public.live_odo_session_state
  add constraint live_odo_session_state_current_scene_check check (current_scene in (
    'host_focus','host_plus_pool','pool_focus','pair_forming',
    'quick_connect_active','audience_pulse','conversation_topic',
    'music_intermission','music_intermission_visual_only','screen_share',
    'odo_stage','session_closing'
  ));

create table public.live_odo_guarded_autopilot_host_allowlist (
  user_id uuid primary key references auth.users(id) on delete cascade,
  added_by_user_id uuid references auth.users(id) on delete set null,
  note text check (note is null or char_length(note) <= 200),
  created_at timestamptz not null default timezone('utc', now())
);

create table public.live_odo_guarded_autopilot_settings (
  session_id uuid primary key references public.live_sessions(id) on delete cascade,
  enabled boolean not null default false,
  enabled_by_user_id uuid references auth.users(id) on delete set null,
  auto_narration_enabled boolean not null default true,
  auto_scene_enabled boolean not null default true,
  auto_spark_enabled boolean not null default true,
  auto_audience_pulse_enabled boolean not null default false,
  auto_intermission_enabled boolean not null default true,
  limited_mode boolean not null default false,
  last_action_at timestamptz,
  last_narration_at timestamptz,
  last_scene_changed_at timestamptz,
  last_automatic_scene text,
  previous_automatic_scene text,
  last_scene_reason_code text,
  automatic_scene_suppressed_until timestamptz,
  last_pulse_at timestamptz,
  last_intermission_at timestamptz,
  enabled_at timestamptz,
  taken_over_at timestamptz,
  version bigint not null default 1 check (version > 0),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint live_odo_guarded_scene_memory_valid check (
    (last_automatic_scene is null or last_automatic_scene in (
      'host_focus','host_plus_pool','pool_focus','pair_forming',
      'quick_connect_active','audience_pulse','conversation_topic',
      'music_intermission_visual_only','odo_stage','session_closing'
    )) and (previous_automatic_scene is null or previous_automatic_scene in (
      'host_focus','host_plus_pool','pool_focus','pair_forming',
      'quick_connect_active','audience_pulse','conversation_topic',
      'music_intermission_visual_only','odo_stage','session_closing'
    ))
  ),
  constraint live_odo_guarded_scene_reason_valid check (
    last_scene_reason_code is null or last_scene_reason_code ~ '^[a-z][a-z0-9_]{0,79}$'
  )
);

create table public.live_odo_guarded_autopilot_updates (
  session_id uuid primary key references public.live_sessions(id) on delete cascade,
  version bigint not null default 1 check (version > 0),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.live_odo_guarded_autopilot_events (
  id bigint generated always as identity primary key,
  session_id uuid not null references public.live_sessions(id) on delete cascade,
  trigger_type text not null check (trigger_type in (
    'SESSION_STARTED','POOL_OPENED','ELIGIBLE_PAIR_CREATED',
    'PAIRING_READY_FOR_PRESENTATION','PAIR_ACTIVE','ROUND_MIDPOINT',
    'ROUND_NEAR_END','ROUND_COMPLETED','POOL_ACTIVITY_LOW','POOL_REBUILDING',
    'AUDIENCE_PULSE_ELIGIBLE','CONVERSATION_SPARK_ELIGIBLE',
    'AUDIENCE_PULSE_COMPLETED','INTERMISSION_REQUIRED','INTERMISSION_COMPLETED',
    'SCENE_CHANGED','HOST_RESUMED_AUTOPILOT','SESSION_NEARING_END'
  )),
  origin_key text not null unique check (char_length(origin_key) between 8 and 240),
  source_kind text not null check (source_kind in (
    'session','hosted_round','quick_round','quick_pairing','audience_poll','director'
  )),
  source_id uuid not null,
  source_version bigint not null check (source_version > 0),
  priority smallint not null check (priority between 0 and 100),
  status text not null default 'pending' check (status in (
    'pending','processing','executed','skipped','rejected','stale','failed','cancelled'
  )),
  not_before timestamptz not null default timezone('utc', now()),
  expires_at timestamptz not null,
  claimed_by uuid,
  claimed_at timestamptz,
  lease_generation bigint,
  state_version bigint,
  outcome_reason_code text,
  completed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  constraint live_odo_guarded_event_time_valid check (expires_at > not_before),
  constraint live_odo_guarded_event_outcome_valid check (
    outcome_reason_code is null or outcome_reason_code ~ '^[a-z][a-z0-9_]{0,119}$'
  )
);

create index live_odo_guarded_autopilot_events_claim_idx
  on public.live_odo_guarded_autopilot_events(session_id, priority desc, id)
  where status = 'pending';

create table public.live_odo_guarded_autopilot_actions (
  action_id uuid primary key,
  event_id bigint not null unique references public.live_odo_guarded_autopilot_events(id) on delete cascade,
  session_id uuid not null references public.live_sessions(id) on delete cascade,
  action_type text not null check (action_type in (
    'NO_ACTION','WAIT','SESSION_NARRATION','ANNOUNCE_EXISTING_PAIR',
    'REQUEST_SCENE','SHOW_CONVERSATION_SPARK','SHOW_AUDIENCE_PULSE',
    'SHOW_INTERMISSION','TIME_CUE','TRANSITION_COPY'
  )),
  risk_tier smallint not null check (risk_tier between 0 and 2),
  payload jsonb not null default '{}'::jsonb check (
    jsonb_typeof(payload) = 'object' and octet_length(payload::text) <= 4096
  ),
  reason_code text not null check (reason_code ~ '^[a-z][a-z0-9_]{0,79}$'),
  status text not null default 'proposed' check (status in (
    'proposed','approved','rejected','executed','stale','failed'
  )),
  snapshot_version bigint not null check (snapshot_version > 0),
  session_version bigint not null check (session_version > 0),
  source_version bigint not null check (source_version > 0),
  lease_owner uuid not null,
  lease_generation bigint not null check (lease_generation > 0),
  expires_at timestamptz not null,
  content_gate_reason_code text,
  fallback_used boolean not null default false,
  policy_reason_code text,
  director_event_id uuid references public.live_director_events(id) on delete set null,
  proposed_at timestamptz not null default timezone('utc', now()),
  evaluated_at timestamptz,
  executed_at timestamptz,
  constraint live_odo_guarded_action_time_valid check (expires_at > proposed_at),
  constraint live_odo_guarded_action_gate_reason_valid check (
    content_gate_reason_code is null or char_length(content_gate_reason_code) <= 120
  ),
  constraint live_odo_guarded_action_policy_reason_valid check (
    policy_reason_code is null or policy_reason_code ~ '^[a-z][a-z0-9_]{0,119}$'
  )
);

alter table public.live_odo_guarded_autopilot_host_allowlist enable row level security;
alter table public.live_odo_guarded_autopilot_settings enable row level security;
alter table public.live_odo_guarded_autopilot_updates enable row level security;
alter table public.live_odo_guarded_autopilot_events enable row level security;
alter table public.live_odo_guarded_autopilot_actions enable row level security;

create policy live_odo_guarded_autopilot_updates_host_select
on public.live_odo_guarded_autopilot_updates for select to authenticated
using (
  public.has_live_capability(session_id, 'live.view_host_console', auth.uid())
  or public.is_admin_user(auth.uid())
);

revoke all on table
  public.live_odo_guarded_autopilot_host_allowlist,
  public.live_odo_guarded_autopilot_settings,
  public.live_odo_guarded_autopilot_events,
  public.live_odo_guarded_autopilot_actions
from public, anon, authenticated, service_role;
revoke insert, update, delete on table public.live_odo_guarded_autopilot_updates
  from public, anon, authenticated, service_role;
grant select on table public.live_odo_guarded_autopilot_updates to authenticated;

create trigger live_odo_guarded_settings_set_updated_at
before update on public.live_odo_guarded_autopilot_settings
for each row execute function public.set_updated_at();

create or replace function public.live_odo_guarded_bump_update_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare v_session_id uuid;
begin
  v_session_id := coalesce(new.session_id, old.session_id);
  insert into public.live_odo_guarded_autopilot_updates(session_id, version, updated_at)
  values (v_session_id, 1, timezone('utc', now()))
  on conflict (session_id) do update set
    version = public.live_odo_guarded_autopilot_updates.version + 1,
    updated_at = excluded.updated_at;
  return coalesce(new, old);
end;
$$;

create trigger live_odo_guarded_settings_bump_update
after insert or update on public.live_odo_guarded_autopilot_settings
for each row execute function public.live_odo_guarded_bump_update_v1();
create trigger live_odo_guarded_events_bump_update
after insert or update on public.live_odo_guarded_autopilot_events
for each row execute function public.live_odo_guarded_bump_update_v1();

create or replace function public.live_odo_guarded_action_risk_tier_v1(p_action_type text)
returns smallint
language sql
immutable
set search_path = public, pg_catalog
as $$
  select case
    when p_action_type in ('NO_ACTION','WAIT') then 0::smallint
    when p_action_type in (
      'SESSION_NARRATION','ANNOUNCE_EXISTING_PAIR','REQUEST_SCENE',
      'TIME_CUE','TRANSITION_COPY'
    ) then 1::smallint
    when p_action_type in (
      'SHOW_CONVERSATION_SPARK','SHOW_AUDIENCE_PULSE','SHOW_INTERMISSION'
    ) then 2::smallint
    else null::smallint
  end;
$$;

create or replace function public.live_odo_guarded_action_allowed_v1(p_action_type text)
returns boolean
language sql
immutable
set search_path = public, pg_catalog
as $$
  select p_action_type in (
    'NO_ACTION','WAIT','SESSION_NARRATION','ANNOUNCE_EXISTING_PAIR',
    'REQUEST_SCENE','SHOW_CONVERSATION_SPARK','SHOW_AUDIENCE_PULSE',
    'SHOW_INTERMISSION','TIME_CUE','TRANSITION_COPY'
  );
$$;

create or replace function public.live_odo_guarded_host_allowed_v1(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
  select p_user_id is not null and (
    public.is_admin_user(p_user_id)
    or exists (
      select 1 from public.live_odo_guarded_autopilot_host_allowlist allowed
      where allowed.user_id = p_user_id
    )
    or not coalesce((
      select guarded_autopilot_internal_only
      from public.live_odo_configuration where id = true
    ), true)
  );
$$;

create or replace function public.live_odo_guarded_feature_allowed_v1(
  p_action_type text,
  p_configuration public.live_odo_configuration,
  p_settings public.live_odo_guarded_autopilot_settings
)
returns boolean
language sql
stable
set search_path = public, pg_catalog
as $$
  select public.live_odo_guarded_action_allowed_v1(p_action_type)
    and p_configuration.odo_enabled
    and p_configuration.guarded_autopilot_enabled
    and not p_configuration.full_autopilot_enabled
    and not p_configuration.music_enabled
    and p_settings.enabled
    and case
      when p_action_type in ('NO_ACTION','WAIT','TIME_CUE') then true
      when p_action_type in ('SESSION_NARRATION','ANNOUNCE_EXISTING_PAIR','TRANSITION_COPY')
        then p_configuration.auto_narration_enabled and p_settings.auto_narration_enabled
          and case when p_action_type = 'ANNOUNCE_EXISTING_PAIR'
            then p_configuration.pair_narration_enabled
            else p_configuration.transition_copy_enabled end
      when p_action_type = 'REQUEST_SCENE'
        then p_configuration.auto_scene_enabled and p_settings.auto_scene_enabled
          and p_configuration.scene_suggestions_enabled
      when p_action_type = 'SHOW_CONVERSATION_SPARK'
        then p_configuration.auto_spark_enabled and p_settings.auto_spark_enabled
          and p_configuration.conversation_spark_enabled
      when p_action_type = 'SHOW_AUDIENCE_PULSE'
        then p_configuration.auto_audience_pulse_enabled
          and p_settings.auto_audience_pulse_enabled
          and p_configuration.audience_pulse_enabled
      when p_action_type = 'SHOW_INTERMISSION'
        then p_configuration.auto_intermission_enabled and p_settings.auto_intermission_enabled
      else false
    end;
$$;

create or replace function public.live_odo_guarded_enqueue_event_v1(
  p_session_id uuid,
  p_trigger_type text,
  p_origin_key text,
  p_source_kind text,
  p_source_id uuid,
  p_source_version bigint,
  p_priority smallint,
  p_not_before timestamptz default timezone('utc', now()),
  p_ttl_seconds integer default 120
)
returns bigint
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare v_id bigint;
begin
  if p_trigger_type not in (
      'SESSION_STARTED','POOL_OPENED','ELIGIBLE_PAIR_CREATED',
      'PAIRING_READY_FOR_PRESENTATION','PAIR_ACTIVE','ROUND_MIDPOINT',
      'ROUND_NEAR_END','ROUND_COMPLETED','POOL_ACTIVITY_LOW','POOL_REBUILDING',
      'AUDIENCE_PULSE_ELIGIBLE','CONVERSATION_SPARK_ELIGIBLE',
      'AUDIENCE_PULSE_COMPLETED','INTERMISSION_REQUIRED','INTERMISSION_COMPLETED',
      'SCENE_CHANGED','HOST_RESUMED_AUTOPILOT','SESSION_NEARING_END'
    ) or p_source_kind not in (
      'session','hosted_round','quick_round','quick_pairing','audience_poll','director'
    ) or p_session_id is null or p_source_id is null or p_source_version < 1
    or p_priority not between 0 and 100 or p_ttl_seconds not between 15 and 900
    or p_origin_key is null or char_length(p_origin_key) not between 8 and 240 then
    raise exception 'live_odo_guarded_event_invalid' using errcode = '22023';
  end if;
  if not exists (
    select 1
    from public.live_odo_session_state state
    join public.live_odo_guarded_autopilot_settings settings using (session_id)
    join public.live_odo_configuration configuration on configuration.id = true
    where state.session_id = p_session_id
      and state.direction_mode = 'autopilot'
      and state.autopilot_state in ('starting','active')
      and settings.enabled
      and configuration.odo_enabled
      and configuration.guarded_autopilot_enabled
      and not configuration.circuit_breaker_open
  ) then return null; end if;

  insert into public.live_odo_guarded_autopilot_events(
    session_id, trigger_type, origin_key, source_kind, source_id,
    source_version, priority, not_before, expires_at
  ) values (
    p_session_id, p_trigger_type, p_origin_key, p_source_kind, p_source_id,
    p_source_version, p_priority, p_not_before,
    p_not_before + make_interval(secs => p_ttl_seconds)
  ) on conflict (origin_key) do nothing returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.live_odo_guarded_round_event_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare v_delay integer;
begin
  if (tg_op = 'INSERT' or old.state is distinct from new.state)
    and new.state = 'public_introduction' then
    perform public.live_odo_guarded_enqueue_event_v1(
      new.session_id,'PAIRING_READY_FOR_PRESENTATION',
      'hosted-pair-ready:' || new.id::text || ':' || new.version::text,
      'hosted_round',new.id,new.version,60,timezone('utc',now()),90
    );
    select automatic_spark_delay_seconds into v_delay
    from public.live_odo_configuration where id = true;
    perform public.live_odo_guarded_enqueue_event_v1(
      new.session_id,'CONVERSATION_SPARK_ELIGIBLE',
      'hosted-spark:' || new.id::text || ':' || new.version::text,
      'hosted_round',new.id,new.version,30,
      timezone('utc',now()) + make_interval(secs => coalesce(v_delay,45)),300
    );
  elsif (tg_op = 'INSERT' or old.state is distinct from new.state)
    and new.state = 'completed' then
    perform public.live_odo_guarded_enqueue_event_v1(
      new.session_id,'ROUND_COMPLETED',
      'hosted-round-complete:' || new.id::text || ':' || new.version::text,
      'hosted_round',new.id,new.version,80,timezone('utc',now()),120
    );
    perform public.live_odo_guarded_enqueue_event_v1(
      new.session_id,'AUDIENCE_PULSE_ELIGIBLE',
      'hosted-pulse:' || new.id::text || ':' || new.version::text,
      'hosted_round',new.id,new.version,40,timezone('utc',now()) + interval '3 seconds',120
    );
  end if;
  return new;
end;
$$;

create trigger live_odo_guarded_hosted_round_event
after insert or update of state on public.live_match_rounds
for each row execute function public.live_odo_guarded_round_event_v1();

create or replace function public.live_odo_guarded_quick_pair_event_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
begin
  if (tg_op = 'INSERT' or old.state is distinct from new.state) and new.state = 'active' then
    perform public.live_odo_guarded_enqueue_event_v1(
      new.session_id,'PAIRING_READY_FOR_PRESENTATION',
      'quick-pair-ready:' || new.id::text || ':' || new.version::text,
      'quick_pairing',new.id,new.version,60,timezone('utc',now()),90
    );
    perform public.live_odo_guarded_enqueue_event_v1(
      new.session_id,'PAIR_ACTIVE',
      'quick-pair-active:' || new.id::text || ':' || new.version::text,
      'quick_pairing',new.id,new.version,80,timezone('utc',now()),90
    );
  elsif (tg_op = 'UPDATE' and old.state is distinct from new.state)
    and new.state in ('completed','round_incomplete','cancelled') then
    perform public.live_odo_guarded_enqueue_event_v1(
      new.session_id,'ROUND_COMPLETED',
      'quick-pair-complete:' || new.id::text || ':' || new.version::text,
      'quick_pairing',new.id,new.version,80,timezone('utc',now()),120
    );
  end if;
  return new;
end;
$$;

create trigger live_odo_guarded_quick_pair_event
after insert or update of state on public.live_quick_connect_pairings
for each row execute function public.live_odo_guarded_quick_pair_event_v1();

create or replace function public.live_odo_guarded_quick_round_event_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
begin
  if (tg_op = 'INSERT' or old.state is distinct from new.state)
    and new.state in ('open','active') then
    perform public.live_odo_guarded_enqueue_event_v1(
      new.session_id,'POOL_OPENED',
      'quick-pool-open:' || new.id::text || ':' || new.version::text,
      'quick_round',new.id,new.version,80,timezone('utc',now()),120
    );
  elsif tg_op = 'UPDATE' and old.state is distinct from new.state
    and new.state = 'completed' then
    perform public.live_odo_guarded_enqueue_event_v1(
      new.session_id,'INTERMISSION_REQUIRED',
      'quick-intermission:' || new.id::text || ':' || new.version::text,
      'quick_round',new.id,new.version,20,timezone('utc',now()) + interval '5 seconds',180
    );
  end if;
  return new;
end;
$$;

create trigger live_odo_guarded_quick_round_event
after insert or update of state on public.live_quick_connect_rounds
for each row execute function public.live_odo_guarded_quick_round_event_v1();

create or replace function public.live_odo_guarded_poll_event_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
begin
  if tg_op = 'UPDATE' and old.state = 'open' and new.state <> 'open' then
    perform public.live_odo_guarded_enqueue_event_v1(
      new.session_id,'AUDIENCE_PULSE_COMPLETED',
      'pulse-complete:' || new.id::text || ':' || extract(epoch from new.closed_at)::bigint::text,
      'audience_poll',new.id,1,40,timezone('utc',now()),90
    );
  end if;
  return new;
end;
$$;

create trigger live_odo_guarded_poll_event
after update of state on public.live_audience_polls
for each row execute function public.live_odo_guarded_poll_event_v1();

create or replace function public.live_odo_guarded_manual_scene_fence_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare v_seconds integer;
begin
  if old.current_scene is distinct from new.current_scene
    and coalesce(current_setting('app.live_odo_guarded_executor', true), '') <> 'on'
    and exists (
      select 1 from public.live_odo_guarded_autopilot_settings settings
      where settings.session_id = new.session_id and settings.enabled
    ) then
    select host_scene_suppression_seconds into v_seconds
    from public.live_odo_configuration where id = true;
    update public.live_odo_guarded_autopilot_settings
    set automatic_scene_suppressed_until = timezone('utc',now())
        + make_interval(secs => coalesce(v_seconds,30)),
      version = version + 1
    where session_id = new.session_id;
    insert into public.live_odo_trace_events(session_id,trace_type,reason_code,metadata)
    values (new.session_id,'odo_host_scene_override','host_scene_changed',
      jsonb_build_object('scene',new.current_scene));
  end if;
  return new;
end;
$$;

create trigger live_odo_guarded_manual_scene_fence
after update of current_scene on public.live_odo_session_state
for each row execute function public.live_odo_guarded_manual_scene_fence_v1();

create or replace function public.rpc_get_live_odo_guarded_autopilot_v1(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  v_config public.live_odo_configuration;
  v_session public.live_sessions;
  v_state public.live_odo_session_state;
  v_settings public.live_odo_guarded_autopilot_settings;
  v_last public.live_odo_guarded_autopilot_actions;
  v_allowed boolean;
  v_next_cue timestamptz;
begin
  if auth.uid() is null or (
    not public.has_live_capability(p_session_id,'live.view_host_console',auth.uid())
    and not public.is_admin_user(auth.uid())
  ) then raise exception 'live_odo_guarded_host_required' using errcode = '42501'; end if;
  select * into v_config from public.live_odo_configuration where id = true;
  select * into v_session from public.live_sessions where id = p_session_id;
  if v_session.id is null then raise exception 'live_session_not_found' using errcode = 'P0002'; end if;
  insert into public.live_odo_session_state(session_id) values (p_session_id)
  on conflict (session_id) do nothing;
  select * into v_state from public.live_odo_session_state where session_id = p_session_id;
  insert into public.live_odo_guarded_autopilot_settings(
    session_id,auto_narration_enabled,auto_scene_enabled,auto_spark_enabled,
    auto_audience_pulse_enabled,auto_intermission_enabled
  ) values (
    p_session_id,v_config.auto_narration_enabled,v_config.auto_scene_enabled,
    v_config.auto_spark_enabled,v_config.auto_audience_pulse_enabled,
    v_config.auto_intermission_enabled
  ) on conflict (session_id) do nothing;
  select * into v_settings from public.live_odo_guarded_autopilot_settings
  where session_id = p_session_id;
  select * into v_last from public.live_odo_guarded_autopilot_actions
  where session_id = p_session_id and status = 'executed'
  order by executed_at desc nulls last limit 1;
  select rounds.ends_at - interval '60 seconds' into v_next_cue
  from public.live_quick_connect_rounds rounds
  where rounds.session_id = p_session_id and rounds.state = 'active'
    and rounds.ends_at > timezone('utc',now()) + interval '60 seconds'
  order by rounds.round_number desc limit 1;
  v_allowed := v_config.odo_enabled and v_config.guarded_autopilot_enabled
    and not v_config.full_autopilot_enabled and not v_config.circuit_breaker_open
    and public.live_odo_guarded_host_allowed_v1(auth.uid());
  return jsonb_build_object(
    'schemaVersion',1,'available',v_allowed,'sessionId',p_session_id,
    'enabled',v_settings.enabled,'directionMode',v_state.direction_mode,
    'autopilotState',v_state.autopilot_state,'currentScene',v_state.current_scene,
    'limitedMode',v_settings.limited_mode,'stateVersion',v_state.state_version,
    'leaseGeneration',v_state.lease_generation,
    'features',jsonb_build_object(
      'narration',v_settings.auto_narration_enabled and v_config.auto_narration_enabled,
      'scenes',v_settings.auto_scene_enabled and v_config.auto_scene_enabled,
      'conversationSparks',v_settings.auto_spark_enabled and v_config.auto_spark_enabled,
      'audiencePulse',v_settings.auto_audience_pulse_enabled and v_config.auto_audience_pulse_enabled,
      'intermissions',v_settings.auto_intermission_enabled and v_config.auto_intermission_enabled,
      'timeCues',true
    ),
    'lastAction',case when v_last.action_id is null then null else jsonb_build_object(
      'actionId',v_last.action_id,'type',v_last.action_type,
      'reasonCode',v_last.reason_code,'executedAt',v_last.executed_at
    ) end,
    'nextTimeCueAt',v_next_cue,
    'unavailableReasonCode',case
      when not v_config.guarded_autopilot_enabled then 'guarded_autopilot_disabled'
      when v_config.circuit_breaker_open then 'circuit_breaker_open'
      when not public.live_odo_guarded_host_allowed_v1(auth.uid()) then 'internal_rollout_only'
      when v_session.status <> 'live' then 'session_not_live'
      else null end
  );
end;
$$;

create or replace function public.rpc_enable_live_odo_guarded_autopilot_v1(
  p_session_id uuid,
  p_settings jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  v_now timestamptz := timezone('utc',now());
  v_config public.live_odo_configuration;
  v_session public.live_sessions;
  v_state public.live_odo_session_state;
begin
  if auth.uid() is null or (
    not public.has_live_capability(p_session_id,'live.view_host_console',auth.uid())
    and not public.is_admin_user(auth.uid())
  ) or not public.live_odo_guarded_host_allowed_v1(auth.uid()) then
    raise exception 'live_odo_guarded_enable_forbidden' using errcode = '42501';
  end if;
  if not public.live_odo_jsonb_has_exact_keys_v1(coalesce(p_settings,'{}'::jsonb),
      array[]::text[],array['narration','scenes','conversationSparks','audiencePulse','intermissions']) then
    raise exception 'live_odo_guarded_settings_invalid' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('live_odo:' || p_session_id::text,0));
  select * into v_config from public.live_odo_configuration where id = true for update;
  select * into v_session from public.live_sessions where id = p_session_id for update;
  if v_session.id is null then raise exception 'live_session_not_found' using errcode = 'P0002'; end if;
  if v_session.status <> 'live' then
    return jsonb_build_object('enabled',false,'reasonCode','session_not_live');
  elsif not v_config.odo_enabled or not v_config.guarded_autopilot_enabled
    or v_config.full_autopilot_enabled or v_config.circuit_breaker_open then
    return jsonb_build_object('enabled',false,'reasonCode','guarded_autopilot_unavailable');
  end if;
  insert into public.live_odo_session_state(session_id) values (p_session_id)
  on conflict (session_id) do nothing;
  insert into public.live_odo_guarded_autopilot_settings(session_id)
  values (p_session_id) on conflict (session_id) do nothing;
  update public.live_odo_guarded_autopilot_settings set
    enabled = true, enabled_by_user_id = auth.uid(), limited_mode = false,
    auto_narration_enabled = coalesce((p_settings->>'narration')::boolean,true),
    auto_scene_enabled = coalesce((p_settings->>'scenes')::boolean,true),
    auto_spark_enabled = coalesce((p_settings->>'conversationSparks')::boolean,true),
    auto_audience_pulse_enabled = coalesce((p_settings->>'audiencePulse')::boolean,false),
    auto_intermission_enabled = coalesce((p_settings->>'intermissions')::boolean,true),
    enabled_at = v_now, taken_over_at = null, version = version + 1
  where session_id = p_session_id;
  update public.live_odo_session_state set
    direction_mode = 'autopilot',autopilot_state = 'starting',pause_reason_code = null,
    lease_owner = null,lease_expires_at = null,lease_heartbeat_at = null,
    lease_generation = lease_generation + 1,state_version = state_version + 1
  where session_id = p_session_id returning * into v_state;
  update public.live_odo_guarded_autopilot_events set
    status = 'cancelled',outcome_reason_code = 'autopilot_restarted',completed_at = v_now
  where session_id = p_session_id and status in ('pending','processing');
  update public.live_odo_guarded_autopilot_actions set
    status = 'stale',policy_reason_code = 'autopilot_restarted',evaluated_at = v_now
  where session_id = p_session_id and status in ('proposed','approved');
  perform public.live_odo_guarded_enqueue_event_v1(
    p_session_id,'HOST_RESUMED_AUTOPILOT',
    'host-enable:' || p_session_id::text || ':' || v_state.state_version::text,
    'session',p_session_id,v_session.version,90,v_now,60
  );
  insert into public.live_odo_trace_events(session_id,trace_type,reason_code,metadata)
  values
    (p_session_id,'odo_guarded_autopilot_enabled','host_enabled',
      jsonb_build_object('stateVersion',v_state.state_version)),
    (p_session_id,'odo_autopilot_state_changed','starting',
      jsonb_build_object('state','starting','stateVersion',v_state.state_version));
  return jsonb_build_object('enabled',true,'autopilotState','starting',
    'stateVersion',v_state.state_version,'leaseGeneration',v_state.lease_generation);
exception when invalid_text_representation then
  raise exception 'live_odo_guarded_settings_invalid' using errcode = '22023';
end;
$$;

create or replace function public.rpc_take_over_live_odo_v1(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare v_state public.live_odo_session_state; v_now timestamptz := timezone('utc',now());
begin
  if auth.uid() is null or (
    not public.has_live_capability(p_session_id,'live.view_host_console',auth.uid())
    and not public.is_admin_user(auth.uid())
  ) then raise exception 'live_odo_takeover_forbidden' using errcode = '42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended('live_odo:' || p_session_id::text,0));
  insert into public.live_odo_session_state(session_id) values (p_session_id)
  on conflict (session_id) do nothing;
  update public.live_odo_session_state set
    direction_mode = 'manual',autopilot_state = 'paused_by_host',
    pause_reason_code = 'host_takeover',lease_owner = null,lease_expires_at = null,
    lease_heartbeat_at = null,lease_generation = lease_generation + 1,
    state_version = state_version + 1
  where session_id = p_session_id returning * into v_state;
  update public.live_odo_guarded_autopilot_settings
  set taken_over_at = v_now,version = version + 1 where session_id = p_session_id;
  update public.live_odo_guarded_autopilot_events set
    status = 'cancelled',outcome_reason_code = 'host_takeover',completed_at = v_now
  where session_id = p_session_id and status in ('pending','processing');
  update public.live_odo_guarded_autopilot_actions set
    status = 'stale',policy_reason_code = 'host_takeover',evaluated_at = v_now
  where session_id = p_session_id and status in ('proposed','approved');
  update public.live_odo_ai_usage set status = 'rejected',completed_at = v_now,
    failure_reason_code = 'host_takeover'
  where session_id = p_session_id and status = 'started';
  insert into public.live_odo_trace_events(session_id,trace_type,reason_code,metadata)
  values
    (p_session_id,'odo_host_takeover','host_takeover',
      jsonb_build_object('leaseGeneration',v_state.lease_generation)),
    (p_session_id,'odo_autopilot_state_changed','host_takeover',
      jsonb_build_object('state','paused_by_host','stateVersion',v_state.state_version));
  return jsonb_build_object('takenOver',true,'stateVersion',v_state.state_version,
    'leaseGeneration',v_state.lease_generation);
end;
$$;

create or replace function public.rpc_resume_live_odo_autopilot_v1(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare v_state public.live_odo_session_state;
begin
  if auth.uid() is null or (
    not public.has_live_capability(p_session_id,'live.view_host_console',auth.uid())
    and not public.is_admin_user(auth.uid())
  ) or not public.live_odo_guarded_host_allowed_v1(auth.uid()) then
    raise exception 'live_odo_resume_forbidden' using errcode = '42501';
  end if;
  select * into v_state from public.live_odo_session_state where session_id = p_session_id;
  if v_state.autopilot_state = 'paused_by_policy' then
    return jsonb_build_object('resumed',false,'reasonCode','policy_clearance_required');
  end if;
  return public.rpc_enable_live_odo_guarded_autopilot_v1(p_session_id,'{}'::jsonb)
    || jsonb_build_object('resumed',true);
end;
$$;

create or replace function public.rpc_signal_live_odo_autopilot_clock_v1(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare v_round public.live_quick_connect_rounds; v_id bigint;
begin
  if auth.uid() is null or (
    not public.has_live_capability(p_session_id,'live.view_host_console',auth.uid())
    and not public.is_admin_user(auth.uid())
  ) then raise exception 'live_odo_clock_forbidden' using errcode = '42501'; end if;
  select * into v_round from public.live_quick_connect_rounds
  where session_id = p_session_id and state = 'active'
    and ends_at > timezone('utc',now())
    and ends_at <= timezone('utc',now()) + interval '75 seconds'
  order by round_number desc limit 1;
  if v_round.id is null then return jsonb_build_object('queued',false,'reasonCode','no_due_time_cue'); end if;
  v_id := public.live_odo_guarded_enqueue_event_v1(
    p_session_id,'ROUND_NEAR_END',
    'quick-time-cue:' || v_round.id::text || ':' || v_round.version::text,
    'quick_round',v_round.id,v_round.version,80,timezone('utc',now()),75
  );
  return jsonb_build_object('queued',v_id is not null,'eventId',v_id);
end;
$$;

create or replace function public.live_odo_append_guarded_event_v1(
  p_session_id uuid,
  p_event_type text,
  p_action_id uuid,
  p_payload jsonb,
  p_expires_at timestamptz
)
returns public.live_director_events
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  v_state public.live_odo_session_state;
  v_event public.live_director_events;
begin
  if not public.live_odo_is_service_role() then
    raise exception 'live_odo_service_role_required' using errcode = '42501';
  end if;
  if p_event_type not in (
      'ODO_AUTOPILOT_ACTIVE','ODO_AUTOPILOT_PAUSED',
      'PAIR_INTRODUCTION_PUBLISHED','SCENE_CHANGED',
      'CONVERSATION_SPARK_PUBLISHED','AUDIENCE_PULSE_LAUNCHED',
      'ODO_INTERMISSION_STARTED','TIME_CUE_PUBLISHED',
      'TRANSITION_COPY_PUBLISHED','SESSION_NARRATION_PUBLISHED'
    ) or p_action_id is null or jsonb_typeof(p_payload) <> 'object'
    or octet_length(p_payload::text) > 4096
    or p_expires_at <= timezone('utc',now()) then
    raise exception 'live_odo_guarded_director_event_invalid' using errcode = '22023';
  end if;
  select * into v_event from public.live_director_events
  where session_id = p_session_id and idempotency_key = p_action_id;
  if v_event.id is not null then return v_event; end if;
  select * into v_state from public.live_odo_session_state
  where session_id = p_session_id for update;
  if v_state.session_id is null then
    raise exception 'live_odo_state_missing' using errcode = 'P0002';
  end if;
  update public.live_odo_session_state
  set latest_sequence = latest_sequence + 1,state_version = state_version + 1
  where session_id = p_session_id returning * into v_state;
  insert into public.live_director_events(
    session_id,schema_version,sequence,state_version,event_type,source,
    visibility,action_id,idempotency_key,payload,expires_at
  ) values (
    p_session_id,1,v_state.latest_sequence,v_state.state_version,p_event_type,'odo',
    'participant',p_action_id,p_action_id,p_payload,p_expires_at
  ) returning * into v_event;
  insert into public.live_director_updates(session_id,version,latest_sequence,updated_at)
  values (p_session_id,1,v_state.latest_sequence,timezone('utc',now()))
  on conflict (session_id) do update set
    version = public.live_director_updates.version + 1,
    latest_sequence = excluded.latest_sequence,
    updated_at = excluded.updated_at;
  return v_event;
end;
$$;

create or replace function public.rpc_service_claim_live_odo_guarded_event_v1(
  p_session_id uuid,
  p_requested_by_user_id uuid,
  p_lease_owner uuid,
  p_model text,
  p_routing_reason_code text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  v_now timestamptz := timezone('utc',now());
  v_config public.live_odo_configuration;
  v_session public.live_sessions;
  v_state public.live_odo_session_state;
  v_settings public.live_odo_guarded_autopilot_settings;
  v_event public.live_odo_guarded_autopilot_events;
  v_action public.live_odo_guarded_autopilot_actions;
  v_call public.live_odo_ai_usage;
  v_action_type text;
  v_reason text;
  v_payload jsonb := '{}'::jsonb;
  v_risk smallint;
  v_task text;
  v_context jsonb;
  v_provider text := 'openai';
  v_effective_model text;
  v_fallback_reason text;
  v_recent_calls bigint;
  v_task_calls bigint;
  v_session_calls bigint;
  v_input_tokens bigint;
  v_output_tokens bigint;
  v_task_limit integer;
  v_template public.live_audience_poll_templates;
begin
  if not public.live_odo_is_service_role() then
    raise exception 'live_odo_service_role_required' using errcode = '42501';
  end if;
  if p_session_id is null or p_requested_by_user_id is null or p_lease_owner is null
    or p_model is null or char_length(p_model) not between 1 and 120
    or p_routing_reason_code !~ '^[a-z][a-z0-9_]{0,79}$' then
    raise exception 'live_odo_guarded_claim_invalid' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('live_odo:' || p_session_id::text,0));
  select * into v_config from public.live_odo_configuration where id = true for update;
  select * into v_session from public.live_sessions where id = p_session_id for update;
  select * into v_state from public.live_odo_session_state
  where session_id = p_session_id for update;
  select * into v_settings from public.live_odo_guarded_autopilot_settings
  where session_id = p_session_id for update;
  if v_session.id is null or v_state.session_id is null or v_settings.session_id is null then
    return jsonb_build_object('allowed',false,'reasonCode','guarded_state_missing');
  elsif v_session.status <> 'live' then v_reason := 'session_not_live';
  elsif not public.has_live_capability(
      p_session_id,'live.view_host_console',p_requested_by_user_id
    ) and not public.is_admin_user(p_requested_by_user_id) then
    v_reason := 'requester_not_authorized';
  elsif not public.live_odo_guarded_host_allowed_v1(p_requested_by_user_id) then
    v_reason := 'requester_not_allowlisted';
  elsif not v_config.odo_enabled or not v_config.guarded_autopilot_enabled
    or v_config.full_autopilot_enabled then v_reason := 'guarded_autopilot_disabled';
  elsif v_config.circuit_breaker_open then v_reason := 'circuit_breaker_open';
  elsif not v_settings.enabled or v_state.direction_mode <> 'autopilot'
    or v_state.autopilot_state not in ('starting','active') then
    v_reason := 'guarded_autopilot_not_active';
  elsif v_state.lease_owner is not null and v_state.lease_expires_at > v_now then
    v_reason := 'lease_held';
  end if;
  if v_reason is not null then
    return jsonb_build_object('allowed',false,'reasonCode',v_reason);
  end if;

  update public.live_odo_guarded_autopilot_actions actions set
    status = 'stale',policy_reason_code = 'lease_expired_before_completion',evaluated_at = v_now
  where actions.session_id = p_session_id and actions.status in ('proposed','approved')
    and actions.expires_at <= v_now;
  update public.live_odo_guarded_autopilot_events events set
    status = 'stale',outcome_reason_code = 'event_expired',completed_at = v_now
  where events.session_id = p_session_id and events.status in ('pending','processing')
    and events.expires_at <= v_now;
  update public.live_odo_ai_usage usage_row set
    status = 'timeout',completed_at = v_now,
    failure_reason_code = 'lease_expired_before_completion'
  where usage_row.session_id = p_session_id and usage_row.status = 'started'
    and usage_row.lease_owner = v_state.lease_owner
    and v_state.lease_expires_at <= v_now;
  if v_state.lease_owner is not null and v_state.lease_expires_at <= v_now then
    update public.live_odo_session_state set
      lease_owner = null,lease_expires_at = null,lease_heartbeat_at = null
    where session_id = p_session_id;
  end if;

  select * into v_event from public.live_odo_guarded_autopilot_events events
  where events.session_id = p_session_id and events.status = 'pending'
    and events.not_before <= v_now and events.expires_at > v_now
  order by events.priority desc,events.id
  for update skip locked limit 1;
  if v_event.id is null then
    return jsonb_build_object('allowed',false,'reasonCode','no_pending_event');
  end if;

  v_action_type := case v_event.trigger_type
    when 'PAIRING_READY_FOR_PRESENTATION' then 'ANNOUNCE_EXISTING_PAIR'
    when 'PAIR_ACTIVE' then 'REQUEST_SCENE'
    when 'POOL_OPENED' then 'REQUEST_SCENE'
    when 'CONVERSATION_SPARK_ELIGIBLE' then 'SHOW_CONVERSATION_SPARK'
    when 'AUDIENCE_PULSE_ELIGIBLE' then 'SHOW_AUDIENCE_PULSE'
    when 'INTERMISSION_REQUIRED' then 'SHOW_INTERMISSION'
    when 'ROUND_NEAR_END' then 'TIME_CUE'
    when 'ROUND_COMPLETED' then 'TRANSITION_COPY'
    when 'SESSION_STARTED' then 'SESSION_NARRATION'
    when 'HOST_RESUMED_AUTOPILOT' then 'NO_ACTION'
    else 'WAIT' end;
  v_reason := lower(v_event.trigger_type);
  if not public.live_odo_guarded_feature_allowed_v1(v_action_type,v_config,v_settings) then
    v_action_type := 'WAIT'; v_reason := 'automatic_feature_disabled';
  end if;
  v_risk := public.live_odo_guarded_action_risk_tier_v1(v_action_type);
  if v_risk is null then
    v_action_type := 'NO_ACTION';v_risk := 0;v_reason := 'action_not_whitelisted';
  end if;

  if v_action_type = 'ANNOUNCE_EXISTING_PAIR' then
    v_payload := jsonb_build_object('roundId',v_event.source_id,
      'copy','Another connection is forming ✨','locale','en');
    if v_event.source_kind = 'hosted_round' then v_task := 'pair_narration'; end if;
  elsif v_action_type = 'REQUEST_SCENE' then
    v_payload := jsonb_build_object('scene',case
      when v_event.trigger_type = 'PAIR_ACTIVE' then 'quick_connect_active'
      else 'pool_focus' end);
  elsif v_action_type = 'SHOW_CONVERSATION_SPARK' then
    v_payload := jsonb_build_object('roundId',v_event.source_id,
      'context','A light conversation starter',
      'question','What is something you have enjoyed recently?','locale','en');
    if v_event.source_kind = 'hosted_round' then v_task := 'conversation_spark'; end if;
  elsif v_action_type = 'SHOW_AUDIENCE_PULSE' then
    select * into v_template from public.live_audience_poll_templates
    where enabled order by display_order,template_key limit 1;
    if v_template.template_key is null then
      v_action_type := 'NO_ACTION';v_risk := 0;v_reason := 'pulse_template_unavailable';
      v_payload := '{}'::jsonb;
    else
      v_payload := jsonb_build_object('templateKey',v_template.template_key,
        'durationSeconds',60);
    end if;
  elsif v_action_type = 'SHOW_INTERMISSION' then
    v_payload := jsonb_build_object('scene','music_intermission_visual_only',
      'durationSeconds',45,'copy','Your next connection is forming…','locale','en');
  elsif v_action_type = 'TIME_CUE' then
    v_payload := jsonb_build_object('roundId',v_event.source_id,'cue','one_minute',
      'copy','One minute remaining.','locale','en');
  elsif v_action_type = 'TRANSITION_COPY' then
    v_payload := jsonb_build_object('copy','The room is getting ready for what comes next.',
      'locale','en');
  elsif v_action_type = 'SESSION_NARRATION' then
    v_payload := jsonb_build_object('copy','Welcome. Settle in while the room gets ready.',
      'locale','en');
  elsif v_action_type = 'WAIT' then
    v_payload := jsonb_build_object('waitMs',0);
  else v_payload := '{}'::jsonb;
  end if;

  if v_state.autopilot_state = 'starting' then
    if v_event.trigger_type <> 'HOST_RESUMED_AUTOPILOT' then
      update public.live_odo_guarded_autopilot_events set
        status = 'skipped',outcome_reason_code = 'activation_event_required',completed_at = v_now
      where id = v_event.id;
      return jsonb_build_object('allowed',false,'reasonCode','activation_event_required');
    end if;
    update public.live_odo_session_state
    set autopilot_state = 'active',state_version = state_version + 1
    where session_id = p_session_id returning * into v_state;
  end if;
  update public.live_odo_session_state set
    lease_owner = p_lease_owner,lease_generation = lease_generation + 1,
    lease_expires_at = v_now + make_interval(secs => v_config.lease_seconds),
    lease_heartbeat_at = v_now,state_version = state_version + 1
  where session_id = p_session_id returning * into v_state;
  update public.live_odo_guarded_autopilot_events set
    status = 'processing',claimed_by = p_lease_owner,claimed_at = v_now,
    lease_generation = v_state.lease_generation,state_version = v_state.state_version
  where id = v_event.id returning * into v_event;
  insert into public.live_odo_guarded_autopilot_actions(
    action_id,event_id,session_id,action_type,risk_tier,payload,reason_code,
    snapshot_version,session_version,source_version,lease_owner,lease_generation,expires_at
  ) values (
    gen_random_uuid(),v_event.id,p_session_id,v_action_type,v_risk,v_payload,v_reason,
    v_state.state_version,v_session.version,v_event.source_version,p_lease_owner,
    v_state.lease_generation,least(v_event.expires_at,v_now + interval '20 seconds')
  ) returning * into v_action;

  if v_task is not null then
    begin
      v_context := public.live_odo_build_copilot_context_v1(
        p_session_id,v_task,v_event.source_id
      );
    exception when others then
      v_task := null;v_context := null;v_fallback_reason := 'safe_context_unavailable';
    end;
  end if;
  if v_task is not null then
    v_task_limit := coalesce((v_config.task_call_limits_per_minute->>v_task)::integer,1);
    select
      count(*) filter (where provider <> 'deterministic'
        and started_at >= date_trunc('minute',v_now)),
      count(*) filter (where provider <> 'deterministic' and task = v_task
        and started_at >= date_trunc('minute',v_now)),
      count(*) filter (where provider <> 'deterministic'),
      coalesce(sum(input_tokens) filter (where provider <> 'deterministic'),0),
      coalesce(sum(output_tokens) filter (where provider <> 'deterministic'),0)
    into v_recent_calls,v_task_calls,v_session_calls,v_input_tokens,v_output_tokens
    from public.live_odo_ai_usage where session_id = p_session_id;
    if v_recent_calls >= v_config.maximum_calls_per_minute then
      v_fallback_reason := 'minute_call_budget_exhausted';
    elsif v_task_calls >= v_task_limit then
      v_fallback_reason := 'task_call_budget_exhausted';
    elsif v_session_calls >= v_config.maximum_calls_per_session then
      v_fallback_reason := 'session_call_budget_exhausted';
    elsif v_input_tokens >= v_config.maximum_input_tokens_per_session then
      v_fallback_reason := 'session_input_budget_exhausted';
    elsif v_output_tokens >= v_config.maximum_output_tokens_per_session then
      v_fallback_reason := 'session_output_budget_exhausted';
    end if;
    if v_fallback_reason is not null then v_provider := 'deterministic'; end if;
    v_effective_model := case when v_provider = 'openai' then p_model else 'odo-deterministic-v1' end;
    if v_provider = 'openai' then
      insert into public.live_odo_budget_windows(session_id,window_started_at,task,call_count)
      values (p_session_id,date_trunc('minute',v_now),v_task,1)
      on conflict (session_id,window_started_at,task) do update set
        call_count = public.live_odo_budget_windows.call_count + 1,updated_at = v_now;
    else
      update public.live_odo_guarded_autopilot_settings
      set limited_mode = true,version = version + 1 where session_id = p_session_id;
    end if;
    insert into public.live_odo_ai_usage(
      action_id,session_id,requested_by_user_id,task,provider,model_class,model,
      routing_reason_code,status,snapshot_version,session_version,lease_owner,
      lease_generation,pricing_version,round_id,round_version,started_at
    ) values (
      v_action.action_id,p_session_id,p_requested_by_user_id,v_task,v_provider,'luna',
      v_effective_model,coalesce(v_fallback_reason,p_routing_reason_code),'started',
      v_state.state_version,v_session.version,p_lease_owner,v_state.lease_generation,
      v_config.pricing_version,v_event.source_id,v_event.source_version,v_now
    ) returning * into v_call;
  end if;
  insert into public.live_odo_trace_events(session_id,call_id,action_id,trace_type,reason_code,metadata)
  values
    (p_session_id,v_call.id,v_action.action_id,'odo_auto_action_proposed',v_reason,
      jsonb_build_object('actionType',v_action_type,'riskTier',v_risk,'eventType',v_event.trigger_type)),
    (p_session_id,v_call.id,v_action.action_id,'odo_guarded_lease_acquired','lease_acquired',
      jsonb_build_object('leaseGeneration',v_state.lease_generation));
  if v_fallback_reason is not null then
    insert into public.live_odo_trace_events(session_id,call_id,action_id,trace_type,reason_code,metadata)
    values (p_session_id,v_call.id,v_action.action_id,'odo_deterministic_mode_entered',
      v_fallback_reason,jsonb_build_object('task',v_task));
  end if;
  return jsonb_build_object(
    'allowed',true,'eventId',v_event.id,'eventType',v_event.trigger_type,
    'action',jsonb_build_object(
      'schemaVersion',1,'actionId',v_action.action_id,'sessionId',p_session_id,
      'type',v_action.action_type,'riskTier',v_action.risk_tier,
      'reasonCode',v_action.reason_code,'payload',v_action.payload,
      'snapshotVersion',v_action.snapshot_version,
      'leaseGeneration',v_action.lease_generation,'expiresAt',v_action.expires_at
    ),
    'callId',v_call.id,'generationTask',v_task,
    'providerAllowed',v_task is not null and v_provider = 'openai',
    'fallbackReasonCode',v_fallback_reason,'safeContext',v_context,
    'snapshot',public.live_odo_build_snapshot_v1(p_session_id),
    'leaseExpiresAt',v_state.lease_expires_at,
    'providerTimeoutMs',least(v_config.provider_timeout_ms,
      greatest(500,(extract(epoch from (v_state.lease_expires_at-v_now))*1000)::integer-250))
  );
end;
$$;

create or replace function public.rpc_service_complete_live_odo_guarded_action_v1(
  p_action_id uuid,
  p_lease_owner uuid,
  p_draft jsonb,
  p_content_gate_accepted boolean,
  p_content_gate_reason_code text,
  p_provider_request_id text,
  p_input_tokens bigint,
  p_cached_input_tokens bigint,
  p_output_tokens bigint,
  p_latency_ms integer,
  p_fallback_used boolean,
  p_provider_failure_reason_code text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  v_now timestamptz := timezone('utc',now());
  v_config public.live_odo_configuration;
  v_session public.live_sessions;
  v_state public.live_odo_session_state;
  v_settings public.live_odo_guarded_autopilot_settings;
  v_event public.live_odo_guarded_autopilot_events;
  v_action public.live_odo_guarded_autopilot_actions;
  v_call public.live_odo_ai_usage;
  v_director_event public.live_director_events;
  v_template public.live_audience_poll_templates;
  v_poll public.live_audience_polls;
  v_payload jsonb;
  v_action_type text;
  v_reason text;
  v_source_version bigint;
  v_source_state text;
  v_visible_count bigint;
  v_audience_count bigint;
  v_total_input bigint;
  v_total_output bigint;
  v_price jsonb;
  v_cost_micros bigint;
  v_stale boolean := false;
  v_event_type text;
begin
  if not public.live_odo_is_service_role() then
    raise exception 'live_odo_service_role_required' using errcode = '42501';
  end if;
  if p_action_id is null or p_lease_owner is null
    or least(p_input_tokens,p_cached_input_tokens,p_output_tokens,p_latency_ms) < 0
    or p_cached_input_tokens > p_input_tokens
    or p_content_gate_reason_code is null
    or char_length(p_content_gate_reason_code) not between 1 and 120 then
    raise exception 'live_odo_guarded_completion_invalid' using errcode = '22023';
  end if;
  select * into v_action from public.live_odo_guarded_autopilot_actions
  where action_id = p_action_id;
  if v_action.action_id is null then
    return jsonb_build_object('accepted',false,'reasonCode','action_missing');
  end if;
  perform pg_advisory_xact_lock(hashtextextended('live_odo:' || v_action.session_id::text,0));
  select * into v_action from public.live_odo_guarded_autopilot_actions
  where action_id = p_action_id for update;
  if v_action.status = 'executed' then
    return jsonb_build_object('accepted',true,'idempotent',true,
      'actionType',v_action.action_type);
  end if;
  select * into v_event from public.live_odo_guarded_autopilot_events
  where id = v_action.event_id for update;
  select * into v_config from public.live_odo_configuration where id = true for update;
  select * into v_session from public.live_sessions
  where id = v_action.session_id for update;
  select * into v_state from public.live_odo_session_state
  where session_id = v_action.session_id for update;
  select * into v_settings from public.live_odo_guarded_autopilot_settings
  where session_id = v_action.session_id for update;
  select * into v_call from public.live_odo_ai_usage
  where action_id = p_action_id for update;
  v_action_type := v_action.action_type;
  v_payload := v_action.payload;

  if v_action.status <> 'proposed' or v_event.status <> 'processing' then
    v_reason := 'action_not_active';v_stale := true;
  elsif v_action.expires_at <= v_now or v_event.expires_at <= v_now then
    v_reason := 'action_expired';v_stale := true;
  elsif v_session.status <> 'live' then v_reason := 'session_not_live';v_stale := true;
  elsif v_state.direction_mode <> 'autopilot' or v_state.autopilot_state <> 'active'
    or not v_settings.enabled then v_reason := 'guarded_autopilot_not_active';v_stale := true;
  elsif v_state.lease_owner <> p_lease_owner
    or v_action.lease_owner <> p_lease_owner
    or v_state.lease_generation <> v_action.lease_generation
    or v_event.lease_generation <> v_action.lease_generation
    or v_state.lease_expires_at <= v_now then
    v_reason := 'lease_generation_mismatch';v_stale := true;
  elsif v_state.state_version <> v_action.snapshot_version
    or v_session.version <> v_action.session_version then
    v_reason := 'authoritative_snapshot_changed';v_stale := true;
  elsif v_config.circuit_breaker_open then v_reason := 'circuit_breaker_open';
  elsif not public.live_odo_guarded_feature_allowed_v1(
      v_action_type,v_config,v_settings
    ) then v_reason := 'automatic_feature_disabled';
  elsif not public.live_odo_guarded_action_allowed_v1(v_action_type)
    or public.live_odo_guarded_action_risk_tier_v1(v_action_type) is distinct from v_action.risk_tier
    then v_reason := 'action_not_whitelisted';
  end if;

  if v_reason is null then
    if v_event.source_kind = 'hosted_round' then
      select version,state into v_source_version,v_source_state
      from public.live_match_rounds
      where id = v_event.source_id and session_id = v_action.session_id;
    elsif v_event.source_kind = 'quick_pairing' then
      select version,state into v_source_version,v_source_state
      from public.live_quick_connect_pairings
      where id = v_event.source_id and session_id = v_action.session_id;
    elsif v_event.source_kind = 'quick_round' then
      select version,state into v_source_version,v_source_state
      from public.live_quick_connect_rounds
      where id = v_event.source_id and session_id = v_action.session_id;
    elsif v_event.source_kind = 'session' then
      v_source_version := v_session.version;v_source_state := v_session.status;
    elsif v_event.source_kind = 'audience_poll' then
      select 1,state into v_source_version,v_source_state
      from public.live_audience_polls
      where id = v_event.source_id and session_id = v_action.session_id;
    else
      v_source_version := v_event.source_version;v_source_state := 'current';
    end if;
    if v_source_version is distinct from v_action.source_version then
      v_reason := 'source_version_changed';v_stale := true;
    end if;
  end if;

  if v_reason is null and v_call.id is not null then
    if v_call.status <> 'started' or v_call.lease_owner <> p_lease_owner
      or v_call.lease_generation <> v_action.lease_generation then
      v_reason := 'generation_call_not_active';v_stale := true;
    elsif not p_content_gate_accepted or p_content_gate_reason_code not in (
        'content_safe','content_not_present','content_replaced'
      ) then v_reason := 'content_gate_rejected';
    elsif p_draft is null or jsonb_typeof(p_draft) <> 'object'
      or octet_length(p_draft::text) > 4096
      or not public.live_odo_jsonb_has_exact_keys_v1(p_draft,array[
        'decision','reasonCode','context','question','copy','locale','templateKey',
        'durationSeconds','scene','signalCodesUsed'
      ],array[]::text[])
      or p_draft->>'decision' not in ('suggest','no_action')
      or p_draft->>'reasonCode' !~ '^[a-z][a-z0-9_]{0,63}$'
      or jsonb_typeof(p_draft->'signalCodesUsed') <> 'array'
      or p_draft::text ~* '(https?://|wss?://|rpc_[a-z0-9_]+|<script|service[_ -]?role|api[_ -]?key|access[_ -]?token)'
      then v_reason := 'invalid_generated_draft';
    end if;
    if v_reason is null and p_draft->>'decision' = 'no_action' then
      v_action_type := 'NO_ACTION';v_payload := '{}'::jsonb;
    elsif v_reason is null and v_action_type = 'ANNOUNCE_EXISTING_PAIR' then
      if jsonb_typeof(p_draft->'copy') <> 'string'
        or char_length(btrim(p_draft->>'copy')) not between 1 and 320
        or coalesce(p_draft->>'locale','') !~ '^[a-z]{2}(-[A-Z]{2})?$' then
        v_reason := 'invalid_narration_draft';
      else v_payload := v_payload || jsonb_build_object(
        'copy',btrim(p_draft->>'copy'),'locale',p_draft->>'locale'); end if;
    elsif v_reason is null and v_action_type = 'SHOW_CONVERSATION_SPARK' then
      if jsonb_typeof(p_draft->'context') <> 'string'
        or char_length(btrim(p_draft->>'context')) not between 1 and 200
        or jsonb_typeof(p_draft->'question') <> 'string'
        or char_length(btrim(p_draft->>'question')) not between 1 and 300
        or coalesce(p_draft->>'locale','') !~ '^[a-z]{2}(-[A-Z]{2})?$' then
        v_reason := 'invalid_spark_draft';
      else v_payload := jsonb_build_object(
        'roundId',v_event.source_id,'context',btrim(p_draft->>'context'),
        'question',btrim(p_draft->>'question'),'locale',p_draft->>'locale'); end if;
    end if;
    select coalesce(sum(input_tokens),0) + p_input_tokens,
      coalesce(sum(output_tokens),0) + p_output_tokens
    into v_total_input,v_total_output
    from public.live_odo_ai_usage
    where session_id = v_action.session_id and id <> v_call.id
      and provider <> 'deterministic';
    if v_reason is null and v_call.provider <> 'deterministic'
      and v_total_input > v_config.maximum_input_tokens_per_session then
      v_reason := 'session_input_budget_exhausted';
    elsif v_reason is null and v_call.provider <> 'deterministic'
      and v_total_output > v_config.maximum_output_tokens_per_session then
      v_reason := 'session_output_budget_exhausted';
    end if;
  elsif v_reason is null then
    -- Server-authored deterministic templates are reviewed code, not generated content.
    if p_draft is not null then v_reason := 'unexpected_generated_draft'; end if;
  end if;

  if v_reason is null and v_action_type not in ('NO_ACTION','WAIT') then
    select count(*) into v_visible_count
    from public.live_odo_guarded_autopilot_actions actions
    where actions.session_id = v_action.session_id and actions.status = 'executed'
      and actions.risk_tier > 0 and actions.executed_at >= v_now
        - make_interval(secs => v_config.automatic_intervention_window_seconds);
    if v_visible_count >= v_config.maximum_automatic_interventions_per_window then
      v_reason := 'automatic_action_density_exceeded';
    end if;
  end if;
  if v_reason is null and v_action_type in (
      'SESSION_NARRATION','ANNOUNCE_EXISTING_PAIR','TRANSITION_COPY'
    ) and v_settings.last_narration_at is not null
    and v_settings.last_narration_at > v_now
      - make_interval(secs => v_config.automatic_narration_cooldown_seconds) then
    v_reason := 'narration_cooldown_active';
  elsif v_reason is null and v_action_type = 'REQUEST_SCENE' then
    if v_payload->>'scene' not in (
        'host_focus','host_plus_pool','pool_focus','pair_forming',
        'quick_connect_active','audience_pulse','conversation_topic',
        'music_intermission_visual_only','odo_stage','session_closing'
      ) then v_reason := 'scene_not_allowed';
    elsif v_settings.automatic_scene_suppressed_until > v_now then
      v_reason := 'host_scene_suppression_active';
    elsif v_settings.last_scene_changed_at is not null
      and v_settings.last_scene_changed_at > v_now
        - make_interval(secs => v_config.automatic_scene_minimum_dwell_seconds) then
      v_reason := 'scene_dwell_active';
    elsif v_settings.previous_automatic_scene = v_payload->>'scene'
      and v_settings.last_automatic_scene is distinct from v_payload->>'scene'
      and v_settings.last_scene_changed_at > v_now
        - make_interval(secs => v_config.automatic_scene_minimum_dwell_seconds * 2) then
      v_reason := 'scene_thrashing_prevented';
    end if;
  elsif v_reason is null and v_action_type = 'SHOW_CONVERSATION_SPARK' then
    if v_event.source_kind <> 'hosted_round'
      or v_source_state not in ('both_accepted','public_introduction') then
      v_reason := 'spark_round_not_active';v_stale := true;
    elsif exists (
      select 1 from public.live_odo_guarded_autopilot_actions prior
      join public.live_odo_guarded_autopilot_events prior_event on prior_event.id = prior.event_id
      where prior.session_id = v_action.session_id
        and prior.action_type = 'SHOW_CONVERSATION_SPARK' and prior.status = 'executed'
        and prior_event.source_kind = 'hosted_round'
        and prior_event.source_id = v_event.source_id
    ) then v_reason := 'spark_round_limit_reached';
    end if;
  elsif v_reason is null and v_action_type = 'SHOW_AUDIENCE_PULSE' then
    select count(*) into v_audience_count from public.live_participants participant
    where participant.session_id = v_action.session_id and participant.state = 'audience';
    if v_audience_count < v_config.minimum_audience_for_automatic_pulse then
      v_reason := 'pulse_audience_too_small';
    elsif v_settings.last_pulse_at is not null and v_settings.last_pulse_at > v_now
      - make_interval(secs => v_config.automatic_pulse_cooldown_seconds) then
      v_reason := 'pulse_cooldown_active';
    elsif exists (select 1 from public.live_audience_polls poll
      where poll.session_id = v_action.session_id and poll.state = 'open'
        and poll.closes_at > v_now) then v_reason := 'pulse_already_active';
    elsif exists (select 1 from public.live_match_rounds round_row
      where round_row.session_id = v_action.session_id
        and round_row.state = 'public_introduction')
      or exists (select 1 from public.live_quick_connect_pairings pairing
      where pairing.session_id = v_action.session_id and pairing.state in ('active','reconnect_grace'))
      then v_reason := 'pair_transition_active';
    end if;
  elsif v_reason is null and v_action_type = 'SHOW_INTERMISSION' then
    if v_settings.last_intermission_at is not null
      and v_settings.last_intermission_at > v_now
        - make_interval(secs => v_config.automatic_intermission_cooldown_seconds) then
      v_reason := 'intermission_cooldown_active';
    elsif exists (select 1 from public.live_quick_connect_pairings pairing
      where pairing.session_id = v_action.session_id
        and pairing.state in ('active','reconnect_grace')) then
      v_reason := 'active_pair_blocks_intermission';
    end if;
  elsif v_reason is null and v_action_type = 'TIME_CUE' then
    if v_event.source_kind <> 'quick_round' or v_source_state <> 'active'
      or not exists (select 1 from public.live_quick_connect_rounds round_row
        where round_row.id = v_event.source_id and round_row.session_id = v_action.session_id
          and round_row.ends_at > v_now and round_row.ends_at <= v_now + interval '75 seconds') then
      v_reason := 'time_cue_not_due';v_stale := true;
    end if;
  elsif v_reason is null and v_action_type = 'ANNOUNCE_EXISTING_PAIR' then
    if (v_event.source_kind = 'hosted_round' and v_source_state <> 'public_introduction')
      or (v_event.source_kind = 'quick_pairing'
        and v_source_state not in ('active','reconnect_grace')) then
      v_reason := 'pair_no_longer_active';v_stale := true;
    end if;
  end if;

  if v_reason is not null then
    update public.live_odo_guarded_autopilot_actions set
      status = case when v_stale then 'stale' else 'rejected' end,
      policy_reason_code = v_reason,content_gate_reason_code = p_content_gate_reason_code,
      fallback_used = p_fallback_used,evaluated_at = v_now
    where action_id = p_action_id;
    update public.live_odo_guarded_autopilot_events set
      status = case when v_stale then 'stale' else 'rejected' end,
      outcome_reason_code = v_reason,completed_at = v_now
    where id = v_event.id;
    if v_call.id is not null then
      update public.live_odo_ai_usage set status = 'rejected',completed_at = v_now,
        input_tokens = p_input_tokens,cached_input_tokens = p_cached_input_tokens,
        output_tokens = p_output_tokens,latency_ms = p_latency_ms,
        provider_request_id = nullif(p_provider_request_id,''),fallback_used = p_fallback_used,
        failure_reason_code = coalesce(p_provider_failure_reason_code,v_reason)
      where id = v_call.id;
    end if;
    update public.live_odo_session_state set
      lease_owner = null,lease_expires_at = null,lease_heartbeat_at = null,
      last_decision_at = v_now
    where session_id = v_action.session_id and lease_owner = p_lease_owner
      and lease_generation = v_action.lease_generation;
    insert into public.live_odo_trace_events(session_id,call_id,action_id,trace_type,reason_code,metadata)
    values (v_action.session_id,v_call.id,p_action_id,
      case when v_stale then 'odo_auto_action_stale' else 'odo_auto_action_rejected' end,
      v_reason,jsonb_build_object('actionType',v_action.action_type,
        'eventType',v_event.trigger_type));
    return jsonb_build_object('accepted',false,'reasonCode',v_reason,'stale',v_stale);
  end if;

  update public.live_odo_guarded_autopilot_actions set
    status = 'approved',action_type = v_action_type,
    risk_tier = public.live_odo_guarded_action_risk_tier_v1(v_action_type),
    payload = v_payload,content_gate_reason_code = p_content_gate_reason_code,
    fallback_used = p_fallback_used,policy_reason_code = 'guarded_policy_approved',
    evaluated_at = v_now
  where action_id = p_action_id;
  insert into public.live_odo_trace_events(session_id,call_id,action_id,trace_type,reason_code,metadata)
  values (v_action.session_id,v_call.id,p_action_id,'odo_auto_action_approved',
    'guarded_policy_approved',jsonb_build_object('actionType',v_action_type,
      'riskTier',public.live_odo_guarded_action_risk_tier_v1(v_action_type)));

  if v_action_type in ('SESSION_NARRATION','ANNOUNCE_EXISTING_PAIR','TRANSITION_COPY') then
    v_event_type := case v_action_type
      when 'ANNOUNCE_EXISTING_PAIR' then 'PAIR_INTRODUCTION_PUBLISHED'
      when 'TRANSITION_COPY' then 'TRANSITION_COPY_PUBLISHED'
      else 'SESSION_NARRATION_PUBLISHED' end;
  elsif v_action_type = 'REQUEST_SCENE' then
    perform set_config('app.live_odo_guarded_executor','on',true);
    update public.live_odo_session_state set current_scene = v_payload->>'scene'
    where session_id = v_action.session_id;
    update public.live_odo_guarded_autopilot_settings set
      previous_automatic_scene = last_automatic_scene,
      last_automatic_scene = v_payload->>'scene',last_scene_changed_at = v_now,
      last_scene_reason_code = v_action.reason_code,version = version + 1
    where session_id = v_action.session_id;
    v_event_type := 'SCENE_CHANGED';
  elsif v_action_type = 'SHOW_CONVERSATION_SPARK' then
    update public.live_match_rounds set conversation_spark = jsonb_build_object(
      'context',v_payload->>'context','question',v_payload->>'question',
      'locale',v_payload->>'locale','source','odo_guarded_autopilot',
      'actionId',p_action_id,'expiresAt',v_now + interval '5 minutes'
    ) where id = v_event.source_id and session_id = v_action.session_id
      and state in ('both_accepted','public_introduction');
    v_payload := jsonb_build_object('roundId',v_event.source_id);
    v_event_type := 'CONVERSATION_SPARK_PUBLISHED';
  elsif v_action_type = 'SHOW_AUDIENCE_PULSE' then
    select * into v_template from public.live_audience_poll_templates
    where template_key = v_payload->>'templateKey' and enabled;
    if v_template.template_key is null then
      raise exception 'live_odo_guarded_pulse_template_stale' using errcode = '23514';
    end if;
    insert into public.live_audience_polls(
      session_id,template_key,poll_kind,prompt,opened_by_user_id,
      client_request_id,closes_at
    ) values (
      v_action.session_id,v_template.template_key,v_template.poll_kind,v_template.prompt,
      v_settings.enabled_by_user_id,p_action_id,
      v_now + make_interval(secs => (v_payload->>'durationSeconds')::integer)
    ) returning * into v_poll;
    insert into public.live_audience_poll_options(poll_id,option_index,label)
    select v_poll.id,(item.ordinality-1)::smallint,btrim(item.label)
    from jsonb_array_elements_text(v_template.options)
      with ordinality as item(label,ordinality);
    insert into public.live_session_events(session_id,actor_user_id,event_type,metadata)
    values (v_action.session_id,v_settings.enabled_by_user_id,'audience_poll_opened',
      jsonb_build_object('pollId',v_poll.id,'templateKey',v_template.template_key,
        'pollKind',v_template.poll_kind,'source','odo_guarded_autopilot'));
    v_payload := jsonb_build_object('pollId',v_poll.id,
      'templateKey',v_template.template_key);
    v_event_type := 'AUDIENCE_PULSE_LAUNCHED';
  elsif v_action_type = 'SHOW_INTERMISSION' then
    perform set_config('app.live_odo_guarded_executor','on',true);
    update public.live_odo_session_state set current_scene = v_payload->>'scene'
    where session_id = v_action.session_id;
    v_event_type := 'ODO_INTERMISSION_STARTED';
  elsif v_action_type = 'TIME_CUE' then v_event_type := 'TIME_CUE_PUBLISHED';
  end if;

  if v_event_type is not null then
    v_director_event := public.live_odo_append_guarded_event_v1(
      v_action.session_id,v_event_type,p_action_id,v_payload,
      v_now + case when v_action_type = 'TIME_CUE' then interval '90 seconds'
        else interval '15 minutes' end
    );
  end if;
  update public.live_odo_guarded_autopilot_actions set
    status = 'executed',director_event_id = v_director_event.id,executed_at = v_now
  where action_id = p_action_id;
  update public.live_odo_guarded_autopilot_events set
    status = 'executed',outcome_reason_code = case
      when v_action_type in ('NO_ACTION','WAIT') then 'no_visible_action'
      else 'guarded_action_executed' end,completed_at = v_now
  where id = v_event.id;
  update public.live_odo_guarded_autopilot_settings set
    last_action_at = v_now,
    last_narration_at = case when v_action_type in (
      'SESSION_NARRATION','ANNOUNCE_EXISTING_PAIR','TRANSITION_COPY'
    ) then v_now else last_narration_at end,
    last_pulse_at = case when v_action_type = 'SHOW_AUDIENCE_PULSE'
      then v_now else last_pulse_at end,
    last_intermission_at = case when v_action_type = 'SHOW_INTERMISSION'
      then v_now else last_intermission_at end,
    limited_mode = limited_mode or p_fallback_used,version = version + 1
  where session_id = v_action.session_id;

  if v_call.id is not null then
    v_price := v_config.model_pricing -> v_call.model;
    if v_call.provider <> 'deterministic' and jsonb_typeof(v_price) = 'object'
      and v_price ?& array[
        'inputMicrosPerMillion','cachedInputMicrosPerMillion','outputMicrosPerMillion'
      ] then
      begin
        v_cost_micros := ceil((
          greatest(0,p_input_tokens-p_cached_input_tokens)
            * (v_price->>'inputMicrosPerMillion')::numeric
          + p_cached_input_tokens * (v_price->>'cachedInputMicrosPerMillion')::numeric
          + p_output_tokens * (v_price->>'outputMicrosPerMillion')::numeric
        ) / 1000000)::bigint;
      exception when others then v_cost_micros := null; end;
    end if;
    update public.live_odo_ai_usage set
      status = case when p_fallback_used then 'fallback' else 'succeeded' end,
      input_tokens = p_input_tokens,cached_input_tokens = p_cached_input_tokens,
      output_tokens = p_output_tokens,estimated_cost_micros = v_cost_micros,
      provider_request_id = nullif(p_provider_request_id,''),latency_ms = p_latency_ms,
      fallback_used = p_fallback_used,
      failure_reason_code = p_provider_failure_reason_code,completed_at = v_now
    where id = v_call.id;
  end if;
  update public.live_odo_session_state set
    lease_owner = null,lease_expires_at = null,lease_heartbeat_at = null,
    last_decision_at = v_now
  where session_id = v_action.session_id and lease_owner = p_lease_owner
    and lease_generation = v_action.lease_generation;
  insert into public.live_odo_trace_events(session_id,call_id,action_id,trace_type,reason_code,metadata)
  values (v_action.session_id,v_call.id,p_action_id,'odo_auto_action_executed',
    case when v_action_type in ('NO_ACTION','WAIT') then 'no_visible_action'
      else 'guarded_action_executed' end,
    jsonb_build_object('actionType',v_action_type,'eventType',v_event_type,
      'fallbackUsed',p_fallback_used));
  if v_action_type = 'REQUEST_SCENE' then
    insert into public.live_odo_trace_events(session_id,action_id,trace_type,reason_code,metadata)
    values (v_action.session_id,p_action_id,'odo_auto_scene_changed',v_action.reason_code,
      jsonb_build_object('scene',v_payload->>'scene'));
  elsif v_action_type = 'SHOW_CONVERSATION_SPARK' then
    insert into public.live_odo_trace_events(session_id,action_id,trace_type,reason_code,metadata)
    values (v_action.session_id,p_action_id,'odo_auto_spark_shown','spark_shown',
      jsonb_build_object('roundId',v_event.source_id));
  elsif v_action_type = 'SHOW_AUDIENCE_PULSE' then
    insert into public.live_odo_trace_events(session_id,action_id,trace_type,reason_code,metadata)
    values (v_action.session_id,p_action_id,'odo_auto_pulse_launched','pulse_launched',
      jsonb_build_object('pollId',v_poll.id));
  elsif v_action_type = 'SHOW_INTERMISSION' then
    insert into public.live_odo_trace_events(session_id,action_id,trace_type,reason_code,metadata)
    values (v_action.session_id,p_action_id,'odo_auto_intermission_started',
      'intermission_started','{}'::jsonb);
  end if;
  if p_fallback_used then
    insert into public.live_odo_trace_events(session_id,call_id,action_id,trace_type,reason_code,metadata)
    values (v_action.session_id,v_call.id,p_action_id,'odo_deterministic_mode_entered',
      coalesce(p_provider_failure_reason_code,'deterministic_fallback'),
      jsonb_build_object('actionType',v_action_type));
  end if;
  return jsonb_build_object('accepted',true,'actionType',v_action_type,
    'eventType',v_event_type,'fallbackUsed',p_fallback_used);
exception when invalid_text_representation or numeric_value_out_of_range then
  raise exception 'live_odo_guarded_completion_invalid' using errcode = '22023';
end;
$$;

create or replace function public.rpc_service_fail_live_odo_guarded_action_v1(
  p_action_id uuid,
  p_lease_owner uuid,
  p_failure_reason_code text,
  p_timed_out boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  v_action public.live_odo_guarded_autopilot_actions;
  v_now timestamptz := timezone('utc',now());
begin
  if not public.live_odo_is_service_role() then
    raise exception 'live_odo_service_role_required' using errcode = '42501';
  end if;
  if p_failure_reason_code !~ '^[a-z][a-z0-9_]{0,119}$' then
    raise exception 'live_odo_guarded_failure_invalid' using errcode = '22023';
  end if;
  select * into v_action from public.live_odo_guarded_autopilot_actions
  where action_id = p_action_id;
  if v_action.action_id is null then
    return jsonb_build_object('recorded',false,'reasonCode','action_missing');
  end if;
  perform pg_advisory_xact_lock(hashtextextended('live_odo:' || v_action.session_id::text,0));
  select * into v_action from public.live_odo_guarded_autopilot_actions
  where action_id = p_action_id for update;
  if v_action.status in ('executed','failed','stale','rejected') then
    return jsonb_build_object('recorded',true,'idempotent',true);
  end if;
  update public.live_odo_guarded_autopilot_actions set
    status = 'failed',policy_reason_code = p_failure_reason_code,evaluated_at = v_now
  where action_id = p_action_id;
  update public.live_odo_guarded_autopilot_events set
    status = 'failed',outcome_reason_code = p_failure_reason_code,completed_at = v_now
  where id = v_action.event_id;
  update public.live_odo_ai_usage set
    status = case when p_timed_out then 'timeout' else 'failed' end,
    completed_at = v_now,failure_reason_code = p_failure_reason_code
  where action_id = p_action_id and status = 'started';
  update public.live_odo_session_state set
    lease_owner = null,lease_expires_at = null,lease_heartbeat_at = null,
    last_decision_at = v_now
  where session_id = v_action.session_id and lease_owner = p_lease_owner
    and lease_generation = v_action.lease_generation;
  update public.live_odo_guarded_autopilot_settings
  set limited_mode = true,version = version + 1 where session_id = v_action.session_id;
  insert into public.live_odo_trace_events(session_id,action_id,trace_type,reason_code,metadata)
  values (v_action.session_id,p_action_id,'odo_auto_action_rejected',
    p_failure_reason_code,jsonb_build_object('providerFailure',true,'timedOut',p_timed_out));
  return jsonb_build_object('recorded',true);
end;
$$;

create or replace function public.rpc_service_pause_live_odo_policy_v1(
  p_session_id uuid,
  p_reason_code text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare v_state public.live_odo_session_state; v_now timestamptz := timezone('utc',now());
begin
  if not public.live_odo_is_service_role() then
    raise exception 'live_odo_service_role_required' using errcode = '42501';
  end if;
  if p_reason_code !~ '^[a-z][a-z0-9_]{0,79}$' then
    raise exception 'live_odo_invalid_pause_reason' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('live_odo:' || p_session_id::text,0));
  insert into public.live_odo_session_state(session_id) values (p_session_id)
  on conflict (session_id) do nothing;
  update public.live_odo_session_state set
    direction_mode = 'manual',autopilot_state = 'paused_by_policy',
    pause_reason_code = p_reason_code,lease_owner = null,lease_expires_at = null,
    lease_heartbeat_at = null,lease_generation = lease_generation + 1,
    state_version = state_version + 1
  where session_id = p_session_id returning * into v_state;
  update public.live_odo_guarded_autopilot_events set
    status = 'cancelled',outcome_reason_code = p_reason_code,completed_at = v_now
  where session_id = p_session_id and status in ('pending','processing');
  update public.live_odo_guarded_autopilot_actions set
    status = 'stale',policy_reason_code = p_reason_code,evaluated_at = v_now
  where session_id = p_session_id and status in ('proposed','approved');
  update public.live_odo_ai_usage set status = 'rejected',completed_at = v_now,
    failure_reason_code = p_reason_code
  where session_id = p_session_id and status = 'started';
  update public.live_odo_guarded_autopilot_settings
  set taken_over_at = v_now,version = version + 1 where session_id = p_session_id;
  insert into public.live_odo_trace_events(session_id,trace_type,reason_code,metadata)
  values
    (p_session_id,'policy_paused',p_reason_code,
      jsonb_build_object('leaseGeneration',v_state.lease_generation)),
    (p_session_id,'odo_guarded_autopilot_disabled','policy_pause',
      jsonb_build_object('state','paused_by_policy')),
    (p_session_id,'odo_autopilot_state_changed',p_reason_code,
      jsonb_build_object('state','paused_by_policy','stateVersion',v_state.state_version));
  return jsonb_build_object('paused',true,'stateVersion',v_state.state_version,
    'leaseGeneration',v_state.lease_generation);
end;
$$;

create or replace function public.rpc_admin_update_live_odo_guarded_autopilot_v1(
  p_patch jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare v_config public.live_odo_configuration;
begin
  if auth.uid() is null or not public.is_admin_user(auth.uid()) then
    raise exception 'live_odo_admin_required' using errcode = '42501';
  end if;
  if not public.live_odo_jsonb_has_exact_keys_v1(p_patch,array[]::text[],array[
      'guardedAutopilotEnabled','autoNarrationEnabled','autoSceneEnabled',
      'autoSparkEnabled','autoAudiencePulseEnabled','autoIntermissionEnabled',
      'internalOnly','sceneMinimumDwellSeconds','hostSceneSuppressionSeconds',
      'pulseCooldownSeconds','sparkDelaySeconds','narrationCooldownSeconds',
      'intermissionCooldownSeconds','interventionWindowSeconds',
      'maximumInterventionsPerWindow','minimumAudienceForPulse'
    ]) then raise exception 'live_odo_guarded_configuration_patch_invalid' using errcode = '22023'; end if;
  update public.live_odo_configuration set
    guarded_autopilot_enabled = case when p_patch ? 'guardedAutopilotEnabled'
      then (p_patch->>'guardedAutopilotEnabled')::boolean else guarded_autopilot_enabled end,
    auto_narration_enabled = case when p_patch ? 'autoNarrationEnabled'
      then (p_patch->>'autoNarrationEnabled')::boolean else auto_narration_enabled end,
    auto_scene_enabled = case when p_patch ? 'autoSceneEnabled'
      then (p_patch->>'autoSceneEnabled')::boolean else auto_scene_enabled end,
    auto_spark_enabled = case when p_patch ? 'autoSparkEnabled'
      then (p_patch->>'autoSparkEnabled')::boolean else auto_spark_enabled end,
    auto_audience_pulse_enabled = case when p_patch ? 'autoAudiencePulseEnabled'
      then (p_patch->>'autoAudiencePulseEnabled')::boolean else auto_audience_pulse_enabled end,
    auto_intermission_enabled = case when p_patch ? 'autoIntermissionEnabled'
      then (p_patch->>'autoIntermissionEnabled')::boolean else auto_intermission_enabled end,
    guarded_autopilot_internal_only = case when p_patch ? 'internalOnly'
      then (p_patch->>'internalOnly')::boolean else guarded_autopilot_internal_only end,
    automatic_scene_minimum_dwell_seconds = case when p_patch ? 'sceneMinimumDwellSeconds'
      then (p_patch->>'sceneMinimumDwellSeconds')::integer else automatic_scene_minimum_dwell_seconds end,
    host_scene_suppression_seconds = case when p_patch ? 'hostSceneSuppressionSeconds'
      then (p_patch->>'hostSceneSuppressionSeconds')::integer else host_scene_suppression_seconds end,
    automatic_pulse_cooldown_seconds = case when p_patch ? 'pulseCooldownSeconds'
      then (p_patch->>'pulseCooldownSeconds')::integer else automatic_pulse_cooldown_seconds end,
    automatic_spark_delay_seconds = case when p_patch ? 'sparkDelaySeconds'
      then (p_patch->>'sparkDelaySeconds')::integer else automatic_spark_delay_seconds end,
    automatic_narration_cooldown_seconds = case when p_patch ? 'narrationCooldownSeconds'
      then (p_patch->>'narrationCooldownSeconds')::integer else automatic_narration_cooldown_seconds end,
    automatic_intermission_cooldown_seconds = case when p_patch ? 'intermissionCooldownSeconds'
      then (p_patch->>'intermissionCooldownSeconds')::integer else automatic_intermission_cooldown_seconds end,
    automatic_intervention_window_seconds = case when p_patch ? 'interventionWindowSeconds'
      then (p_patch->>'interventionWindowSeconds')::integer else automatic_intervention_window_seconds end,
    maximum_automatic_interventions_per_window = case when p_patch ? 'maximumInterventionsPerWindow'
      then (p_patch->>'maximumInterventionsPerWindow')::integer else maximum_automatic_interventions_per_window end,
    minimum_audience_for_automatic_pulse = case when p_patch ? 'minimumAudienceForPulse'
      then (p_patch->>'minimumAudienceForPulse')::integer else minimum_audience_for_automatic_pulse end,
    updated_by_user_id = auth.uid()
  where id = true returning * into v_config;
  insert into public.live_odo_trace_events(trace_type,reason_code,metadata)
  values ('configuration_updated','guarded_autopilot_configuration_update',
    jsonb_build_object('changedKeys',(select jsonb_agg(key_name order by key_name)
      from jsonb_object_keys(p_patch) key_name)));
  return jsonb_build_object(
    'guardedAutopilotEnabled',v_config.guarded_autopilot_enabled,
    'fullAutopilotEnabled',v_config.full_autopilot_enabled,
    'autoNarrationEnabled',v_config.auto_narration_enabled,
    'autoSceneEnabled',v_config.auto_scene_enabled,
    'autoSparkEnabled',v_config.auto_spark_enabled,
    'autoAudiencePulseEnabled',v_config.auto_audience_pulse_enabled,
    'autoIntermissionEnabled',v_config.auto_intermission_enabled,
    'internalOnly',v_config.guarded_autopilot_internal_only,
    'sceneMinimumDwellSeconds',v_config.automatic_scene_minimum_dwell_seconds,
    'hostSceneSuppressionSeconds',v_config.host_scene_suppression_seconds,
    'pulseCooldownSeconds',v_config.automatic_pulse_cooldown_seconds,
    'sparkDelaySeconds',v_config.automatic_spark_delay_seconds,
    'maximumInterventionsPerWindow',v_config.maximum_automatic_interventions_per_window,
    'minimumAudienceForPulse',v_config.minimum_audience_for_automatic_pulse
  );
exception when invalid_text_representation or numeric_value_out_of_range or check_violation then
  raise exception 'live_odo_guarded_configuration_patch_invalid' using errcode = '22023';
end;
$$;

create or replace function public.rpc_admin_set_live_odo_guarded_host_access_v1(
  p_user_id uuid,
  p_allowed boolean,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
begin
  if auth.uid() is null or not public.is_admin_user(auth.uid()) then
    raise exception 'live_odo_admin_required' using errcode = '42501';
  end if;
  if p_user_id is null or p_allowed is null or (p_note is not null and char_length(p_note) > 200) then
    raise exception 'live_odo_guarded_host_access_invalid' using errcode = '22023';
  end if;
  if p_allowed then
    insert into public.live_odo_guarded_autopilot_host_allowlist(
      user_id,added_by_user_id,note
    ) values (p_user_id,auth.uid(),nullif(btrim(p_note),''))
    on conflict (user_id) do update set
      added_by_user_id = excluded.added_by_user_id,note = excluded.note,
      created_at = timezone('utc',now());
  else
    delete from public.live_odo_guarded_autopilot_host_allowlist where user_id = p_user_id;
  end if;
  insert into public.live_odo_trace_events(trace_type,reason_code,metadata)
  values ('configuration_updated','guarded_autopilot_host_access_update',
    jsonb_build_object('userId',p_user_id,'allowed',p_allowed));
  return jsonb_build_object('userId',p_user_id,'allowed',p_allowed);
end;
$$;

revoke all on function public.live_odo_guarded_bump_update_v1()
  from public, anon, authenticated, service_role;
revoke all on function public.live_odo_guarded_action_risk_tier_v1(text)
  from public, anon, authenticated;
revoke all on function public.live_odo_guarded_action_allowed_v1(text)
  from public, anon, authenticated;
revoke all on function public.live_odo_guarded_host_allowed_v1(uuid)
  from public, anon, authenticated;
revoke all on function public.live_odo_guarded_feature_allowed_v1(
  text,public.live_odo_configuration,public.live_odo_guarded_autopilot_settings
) from public, anon, authenticated;
revoke all on function public.live_odo_guarded_enqueue_event_v1(
  uuid,text,text,text,uuid,bigint,smallint,timestamptz,integer
) from public, anon, authenticated, service_role;
revoke all on function public.live_odo_guarded_round_event_v1()
  from public, anon, authenticated, service_role;
revoke all on function public.live_odo_guarded_quick_pair_event_v1()
  from public, anon, authenticated, service_role;
revoke all on function public.live_odo_guarded_quick_round_event_v1()
  from public, anon, authenticated, service_role;
revoke all on function public.live_odo_guarded_poll_event_v1()
  from public, anon, authenticated, service_role;
revoke all on function public.live_odo_guarded_manual_scene_fence_v1()
  from public, anon, authenticated, service_role;
revoke all on function public.live_odo_append_guarded_event_v1(
  uuid,text,uuid,jsonb,timestamptz
) from public, anon, authenticated, service_role;

revoke all on function public.rpc_get_live_odo_guarded_autopilot_v1(uuid)
  from public, anon;
grant execute on function public.rpc_get_live_odo_guarded_autopilot_v1(uuid)
  to authenticated, service_role;
revoke all on function public.rpc_enable_live_odo_guarded_autopilot_v1(uuid,jsonb)
  from public, anon;
grant execute on function public.rpc_enable_live_odo_guarded_autopilot_v1(uuid,jsonb)
  to authenticated, service_role;
revoke all on function public.rpc_signal_live_odo_autopilot_clock_v1(uuid)
  from public, anon;
grant execute on function public.rpc_signal_live_odo_autopilot_clock_v1(uuid)
  to authenticated, service_role;
revoke all on function public.rpc_service_claim_live_odo_guarded_event_v1(
  uuid,uuid,uuid,text,text
) from public, anon, authenticated;
grant execute on function public.rpc_service_claim_live_odo_guarded_event_v1(
  uuid,uuid,uuid,text,text
) to service_role;
revoke all on function public.rpc_service_complete_live_odo_guarded_action_v1(
  uuid,uuid,jsonb,boolean,text,text,bigint,bigint,bigint,integer,boolean,text
) from public, anon, authenticated;
grant execute on function public.rpc_service_complete_live_odo_guarded_action_v1(
  uuid,uuid,jsonb,boolean,text,text,bigint,bigint,bigint,integer,boolean,text
) to service_role;
revoke all on function public.rpc_service_fail_live_odo_guarded_action_v1(
  uuid,uuid,text,boolean
) from public, anon, authenticated;
grant execute on function public.rpc_service_fail_live_odo_guarded_action_v1(
  uuid,uuid,text,boolean
) to service_role;
revoke all on function public.rpc_admin_update_live_odo_guarded_autopilot_v1(jsonb)
  from public, anon;
grant execute on function public.rpc_admin_update_live_odo_guarded_autopilot_v1(jsonb)
  to authenticated, service_role;
revoke all on function public.rpc_admin_set_live_odo_guarded_host_access_v1(uuid,boolean,text)
  from public, anon;
grant execute on function public.rpc_admin_set_live_odo_guarded_host_access_v1(uuid,boolean,text)
  to authenticated, service_role;
revoke all on function public.rpc_take_over_live_odo_v1(uuid) from public, anon;
grant execute on function public.rpc_take_over_live_odo_v1(uuid) to authenticated, service_role;
revoke all on function public.rpc_resume_live_odo_autopilot_v1(uuid) from public, anon;
grant execute on function public.rpc_resume_live_odo_autopilot_v1(uuid) to authenticated, service_role;
revoke all on function public.rpc_service_pause_live_odo_policy_v1(uuid,text)
  from public, anon, authenticated;
grant execute on function public.rpc_service_pause_live_odo_policy_v1(uuid,text)
  to service_role;

comment on function public.live_odo_guarded_action_allowed_v1(text) is
  'The dedicated Phase 10C automatic-action whitelist. Unknown and Tier 3 actions fail closed.';
comment on function public.rpc_service_complete_live_odo_guarded_action_v1(
  uuid,uuid,jsonb,boolean,text,text,bigint,bigint,bigint,integer,boolean,text
) is 'Fresh Phase 10C Policy Gate and the only guarded automatic presentation executor.';
comment on table public.live_odo_guarded_autopilot_updates is
  'Content-free Realtime wake signal; action/event payloads remain server-only.';

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'live_odo_guarded_autopilot_updates'
  ) then
    alter publication supabase_realtime
      add table public.live_odo_guarded_autopilot_updates;
  end if;
end;
$$;

commit;
