-- Betweener Live Phase 10D: Odo Full Quick Connect Autopilot.
--
-- Odo receives bounded authority to advance the existing Quick Connect
-- lifecycle. AutoMatcher remains the sole pairing authority, participants
-- opt in explicitly, private decisions remain private, and the Live session
-- itself is never ended by this subsystem.

begin;

alter table public.live_odo_configuration
  add column if not exists full_quick_connect_autopilot_enabled boolean not null default false,
  add column if not exists full_quick_connect_internal_only boolean not null default true,
  add column if not exists full_quick_connect_low_liquidity_seconds integer not null default 45,
  add column if not exists full_quick_connect_maximum_runtime_minutes integer not null default 90,
  add column if not exists full_quick_connect_reconcile_seconds integer not null default 15;

alter table public.live_odo_configuration
  add constraint live_odo_phase10d_low_liquidity_valid check (
    full_quick_connect_low_liquidity_seconds between 15 and 600
  ),
  add constraint live_odo_phase10d_runtime_valid check (
    full_quick_connect_maximum_runtime_minutes between 10 and 180
  ),
  add constraint live_odo_phase10d_reconcile_valid check (
    full_quick_connect_reconcile_seconds between 5 and 60
  );

create table public.live_odo_full_quick_connect_settings (
  session_id uuid primary key references public.live_sessions(id) on delete cascade,
  enabled boolean not null default false,
  enabled_by_user_id uuid references auth.users(id) on delete set null,
  lifecycle_state text not null default 'off' check (lifecycle_state in (
    'off','preparing','starting','active','draining','closing','ended',
    'paused_by_host','paused_by_policy','recovering'
  )),
  orchestration_state text not null default 'waiting_for_pool_open' check (
    orchestration_state in (
      'waiting_for_pool_open','pool_open','waiting_for_candidates',
      'waiting_for_pair','pair_created','pair_presenting','pair_connecting',
      'pair_active','pair_finishing','outcome_processing',
      'returning_participants','intermission','audience_pulse',
      'low_liquidity','recovering','draining','quick_connect_closed'
    )
  ),
  energy_mode text not null default 'normal' check (
    energy_mode in ('calm','normal','energize','closing')
  ),
  started_at timestamptz,
  maximum_runtime_ends_at timestamptz,
  low_liquidity_since timestamptz,
  last_reconciled_at timestamptz,
  next_wake_at timestamptz,
  last_action_type text,
  last_reason_code text,
  last_pairing_id uuid references public.live_quick_connect_pairings(id) on delete set null,
  last_round_id uuid references public.live_quick_connect_rounds(id) on delete set null,
  version bigint not null default 1 check (version > 0),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint live_odo_full_quick_action_valid check (
    last_action_type is null or last_action_type in (
      'OPEN_POOL','SYNC_MATCHER','PAIR_OBSERVED','ROUND_COMPLETED',
      'RETURN_TO_POOL','ENTER_LOW_LIQUIDITY','SHOW_PRIVATE_SPARK',
      'QUEUE_TIME_CUE','BEGIN_DRAINING','QUICK_CONNECT_CLOSING',
      'CLOSE_QUICK_CONNECT','RECOVER','WAIT'
    )
  ),
  constraint live_odo_full_quick_reason_valid check (
    last_reason_code is null or last_reason_code ~ '^[a-z][a-z0-9_]{0,119}$'
  )
);

create table public.live_odo_full_quick_connect_actions (
  action_id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.live_sessions(id) on delete cascade,
  action_key text not null unique check (char_length(action_key) between 12 and 240),
  action_type text not null check (action_type in (
    'OPEN_POOL','SYNC_MATCHER','PAIR_OBSERVED','ROUND_COMPLETED',
    'RETURN_TO_POOL','ENTER_LOW_LIQUIDITY','SHOW_PRIVATE_SPARK',
    'QUEUE_TIME_CUE','BEGIN_DRAINING','QUICK_CONNECT_CLOSING',
    'CLOSE_QUICK_CONNECT','RECOVER','WAIT'
  )),
  reason_code text not null check (reason_code ~ '^[a-z][a-z0-9_]{0,119}$'),
  status text not null default 'executed' check (status in (
    'executed','skipped','stale','failed'
  )),
  control_version bigint not null check (control_version > 0),
  orchestration_version bigint not null check (orchestration_version > 0),
  lease_generation bigint not null check (lease_generation > 0),
  pairing_id uuid references public.live_quick_connect_pairings(id) on delete set null,
  round_id uuid references public.live_quick_connect_rounds(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb check (
    jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 2048
  ),
  executed_at timestamptz not null default timezone('utc', now())
);

create index live_odo_full_quick_actions_session_idx
  on public.live_odo_full_quick_connect_actions(session_id, executed_at desc);

create table public.live_odo_full_quick_connect_updates (
  session_id uuid primary key references public.live_sessions(id) on delete cascade,
  version bigint not null default 1 check (version > 0),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.live_odo_full_quick_connect_settings enable row level security;
alter table public.live_odo_full_quick_connect_actions enable row level security;
alter table public.live_odo_full_quick_connect_updates enable row level security;

create policy live_odo_full_quick_updates_host_select
on public.live_odo_full_quick_connect_updates for select to authenticated
using (
  public.has_live_capability(session_id, 'live.view_host_console', auth.uid())
  or public.is_admin_user(auth.uid())
);

revoke all on table
  public.live_odo_full_quick_connect_settings,
  public.live_odo_full_quick_connect_actions
from public, anon, authenticated, service_role;
revoke insert, update, delete on table public.live_odo_full_quick_connect_updates
from public, anon, authenticated, service_role;
grant select on table public.live_odo_full_quick_connect_updates to authenticated;

create trigger live_odo_full_quick_settings_updated_at
before update on public.live_odo_full_quick_connect_settings
for each row execute function public.set_updated_at();

create or replace function public.live_odo_full_quick_bump_update_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare v_session_id uuid := coalesce(new.session_id, old.session_id);
begin
  insert into public.live_odo_full_quick_connect_updates(session_id, version)
  values (v_session_id, 1)
  on conflict (session_id) do update set
    version = public.live_odo_full_quick_connect_updates.version + 1,
    updated_at = timezone('utc', now());
  return coalesce(new, old);
end;
$$;

revoke all on function public.live_odo_full_quick_bump_update_v1()
from public, anon, authenticated, service_role;

create trigger live_odo_full_quick_settings_bump
after insert or update on public.live_odo_full_quick_connect_settings
for each row execute function public.live_odo_full_quick_bump_update_v1();

create trigger live_odo_full_quick_actions_bump
after insert or update on public.live_odo_full_quick_connect_actions
for each row execute function public.live_odo_full_quick_bump_update_v1();

alter table public.live_odo_full_quick_connect_updates replica identity full;
alter publication supabase_realtime add table public.live_odo_full_quick_connect_updates;

create or replace function public.live_odo_full_quick_host_allowed_v1(
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
      not coalesce((select full_quick_connect_internal_only
        from public.live_odo_configuration where id = true), true)
      or public.live_odo_guarded_host_allowed_v1(p_user_id)
    );
$$;

revoke all on function public.live_odo_full_quick_host_allowed_v1(uuid, uuid)
from public, anon, authenticated, service_role;

create or replace function public.live_odo_full_quick_eligible_pairs_v1(p_session_id uuid)
returns bigint
language sql
stable
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
  select count(*)::bigint
  from public.live_quick_connect_participants participant_a
  join public.live_quick_connect_participants participant_b
    on participant_b.session_id = participant_a.session_id
   and participant_b.user_id > participant_a.user_id
  where participant_a.session_id = p_session_id
    and public.live_quick_connect_pair_is_eligible(
      p_session_id, participant_a.user_id, participant_b.user_id
    );
$$;

revoke all on function public.live_odo_full_quick_eligible_pairs_v1(uuid)
from public, anon, authenticated, service_role;

create or replace function public.live_odo_full_quick_snapshot_v1(
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
  v_control public.live_quick_connect_controls;
  v_settings public.live_odo_full_quick_connect_settings;
  v_state public.live_odo_session_state;
  v_waiting bigint := 0;
  v_active bigint := 0;
  v_completed bigint := 0;
  v_eligible bigint := 0;
  v_next_round_end timestamptz;
  v_available boolean := false;
  v_reason text;
begin
  select * into v_config from public.live_odo_configuration where id = true;
  select * into v_session from public.live_sessions where id = p_session_id;
  select * into v_control from public.live_quick_connect_controls
  where session_id = p_session_id;
  select * into v_settings from public.live_odo_full_quick_connect_settings
  where session_id = p_session_id;
  select * into v_state from public.live_odo_session_state
  where session_id = p_session_id;

  select count(*) filter (where participant.state = 'waiting'
      and participant.connection_state = 'connected'),
    count(*) filter (where participant.state in ('paired','disconnected'))
  into v_waiting, v_active
  from public.live_quick_connect_participants participant
  where participant.session_id = p_session_id;
  select count(*) into v_completed
  from public.live_quick_connect_rounds round_row
  where round_row.session_id = p_session_id and round_row.state = 'completed';
  select min(round_row.ends_at) into v_next_round_end
  from public.live_quick_connect_rounds round_row
  where round_row.session_id = p_session_id and round_row.state = 'active';
  select count(*) into v_active from public.live_quick_connect_pairings pairing
  where pairing.session_id = p_session_id
    and pairing.state in ('active','reconnect_grace');
  v_eligible := public.live_odo_full_quick_eligible_pairs_v1(p_session_id);

  v_available := coalesce(v_config.odo_enabled, false)
    and coalesce(v_config.guarded_autopilot_enabled, false)
    and coalesce(v_config.full_quick_connect_autopilot_enabled, false)
    and not coalesce(v_config.full_autopilot_enabled, false)
    and not coalesce(v_config.circuit_breaker_open, true)
    and v_session.status = 'live'
    and v_session.format = 'quick_connect'
    and v_control.session_id is not null
    and v_control.state <> 'ended'
    and coalesce(v_state.autopilot_state, 'off') <> 'paused_by_policy'
    and to_regprocedure('public.live_quick_connect_sync(uuid)') is not null
    and public.live_odo_full_quick_host_allowed_v1(p_session_id, p_actor_user_id);

  v_reason := case
    when v_session.id is null then 'session_not_found'
    when v_session.format <> 'quick_connect' then 'quick_connect_required'
    when v_session.status <> 'live' then 'session_not_live'
    when not coalesce(v_config.odo_enabled, false) then 'odo_disabled'
    when not coalesce(v_config.guarded_autopilot_enabled, false) then 'guarded_autopilot_disabled'
    when not coalesce(v_config.full_quick_connect_autopilot_enabled, false)
      then 'full_quick_connect_disabled'
    when coalesce(v_config.full_autopilot_enabled, false) then 'full_show_autopilot_conflict'
    when coalesce(v_config.circuit_breaker_open, true) then 'circuit_breaker_open'
    when coalesce(v_state.autopilot_state, 'off') = 'paused_by_policy'
      then 'policy_clearance_required'
    when not public.live_odo_full_quick_host_allowed_v1(p_session_id, p_actor_user_id)
      then 'internal_rollout_only'
    when v_control.session_id is null then 'quick_connect_control_missing'
    when v_control.state = 'ended' then 'quick_connect_already_ended'
    when to_regprocedure('public.live_quick_connect_sync(uuid)') is null
      then 'automatcher_unavailable'
    else null end;

  return jsonb_build_object(
    'schemaVersion', 1,
    'available', v_available,
    'sessionId', p_session_id,
    'enabled', coalesce(v_settings.enabled, false),
    'lifecycleState', coalesce(v_settings.lifecycle_state, 'off'),
    'orchestrationState', coalesce(v_settings.orchestration_state, 'waiting_for_pool_open'),
    'energyMode', coalesce(v_settings.energy_mode, 'normal'),
    'controlState', coalesce(v_control.state, 'closed'),
    'limitedMode', coalesce((select limited_mode
      from public.live_odo_guarded_autopilot_settings where session_id = p_session_id), false),
    'healthState', case
      when v_settings.lifecycle_state = 'paused_by_policy' then 'paused_policy'
      when v_settings.lifecycle_state = 'paused_by_host' then 'paused_host'
      when v_settings.lifecycle_state = 'recovering' then 'recovering'
      when coalesce((select limited_mode
        from public.live_odo_guarded_autopilot_settings where session_id = p_session_id), false)
        then 'degraded_ai'
      else 'healthy' end,
    'stateVersion', coalesce(v_state.state_version, 1),
    'leaseGeneration', coalesce(v_state.lease_generation, 1),
    'metrics', jsonb_build_object(
      'waitingPeople', v_waiting,
      'eligiblePairs', v_eligible,
      'activePairs', v_active,
      'completedRounds', v_completed
    ),
    'lastActionType', v_settings.last_action_type,
    'lastReasonCode', v_settings.last_reason_code,
    'startedAt', v_settings.started_at,
    'maximumRuntimeEndsAt', v_settings.maximum_runtime_ends_at,
    'nextWakeAt', coalesce(v_settings.next_wake_at, v_next_round_end, v_now),
    'unavailableReasonCode', v_reason
  );
end;
$$;

revoke all on function public.live_odo_full_quick_snapshot_v1(uuid, uuid)
from public, anon, authenticated, service_role;

create or replace function public.rpc_get_live_odo_full_quick_connect_v1(p_session_id uuid)
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
    raise exception 'live_odo_full_quick_host_required' using errcode = '42501';
  end if;
  return public.live_odo_full_quick_snapshot_v1(p_session_id, auth.uid());
end;
$$;

revoke all on function public.rpc_get_live_odo_full_quick_connect_v1(uuid)
from public, anon;
grant execute on function public.rpc_get_live_odo_full_quick_connect_v1(uuid)
to authenticated, service_role;

create or replace function public.rpc_get_live_odo_quick_connect_public_v1(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  v_settings public.live_odo_full_quick_connect_settings;
  v_session public.live_sessions;
begin
  if auth.uid() is null or not exists (
    select 1 from public.live_participants participant
    where participant.session_id = p_session_id
      and participant.user_id = auth.uid()
      and participant.state not in ('left','removed','banned')
  ) then
    raise exception 'live_participant_required' using errcode = '42501';
  end if;
  select * into v_session from public.live_sessions where id = p_session_id;
  select * into v_settings from public.live_odo_full_quick_connect_settings
  where session_id = p_session_id;
  return jsonb_build_object(
    'schemaVersion', 1,
    'sessionId', p_session_id,
    'active', coalesce(v_settings.enabled, false) and v_session.status = 'live',
    'state', case
      when v_settings.lifecycle_state in ('draining','closing') then 'wrapping_up'
      when v_settings.orchestration_state = 'low_liquidity' then 'preparing_next_connection'
      when v_settings.orchestration_state in ('pair_created','pair_presenting','pair_connecting')
        then 'connection_forming'
      when v_settings.orchestration_state = 'pair_active' then 'connections_active'
      else 'preparing_next_connection' end,
    'label', 'Powered by Odo'
  );
end;
$$;

revoke all on function public.rpc_get_live_odo_quick_connect_public_v1(uuid)
from public, anon;
grant execute on function public.rpc_get_live_odo_quick_connect_public_v1(uuid)
to authenticated;

create or replace function public.rpc_enable_live_odo_full_quick_connect_v1(
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
  v_now timestamptz := timezone('utc', now());
  v_config public.live_odo_configuration;
  v_session public.live_sessions;
  v_control public.live_quick_connect_controls;
  v_state public.live_odo_session_state;
  v_runtime_minutes integer;
begin
  if auth.uid() is null
    or not public.live_odo_full_quick_host_allowed_v1(p_session_id, auth.uid()) then
    raise exception 'live_odo_full_quick_enable_forbidden' using errcode = '42501';
  end if;
  if not public.live_odo_jsonb_has_exact_keys_v1(
    coalesce(p_settings, '{}'::jsonb), array[]::text[], array['maximumRuntimeMinutes']
  ) then
    raise exception 'live_odo_full_quick_settings_invalid' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('live_odo:' || p_session_id::text, 0));
  select * into v_config from public.live_odo_configuration where id = true for update;
  select * into v_session from public.live_sessions where id = p_session_id for update;
  select * into v_control from public.live_quick_connect_controls
  where session_id = p_session_id for update;

  if v_session.id is null then
    raise exception 'live_session_not_found' using errcode = 'P0002';
  elsif v_session.format <> 'quick_connect' then
    return jsonb_build_object('enabled', false, 'reasonCode', 'quick_connect_required');
  elsif v_session.status <> 'live' then
    return jsonb_build_object('enabled', false, 'reasonCode', 'session_not_live');
  elsif v_control.session_id is null then
    return jsonb_build_object('enabled', false, 'reasonCode', 'quick_connect_control_missing');
  elsif v_control.state = 'ended' then
    return jsonb_build_object('enabled', false, 'reasonCode', 'quick_connect_already_ended');
  elsif not v_config.odo_enabled or not v_config.guarded_autopilot_enabled
    or not v_config.full_quick_connect_autopilot_enabled
    or v_config.full_autopilot_enabled or v_config.circuit_breaker_open then
    return jsonb_build_object('enabled', false, 'reasonCode', 'full_quick_connect_unavailable');
  end if;

  v_runtime_minutes := coalesce(
    (p_settings ->> 'maximumRuntimeMinutes')::integer,
    v_config.full_quick_connect_maximum_runtime_minutes
  );
  if v_runtime_minutes not between 10 and 180 then
    raise exception 'live_odo_full_quick_settings_invalid' using errcode = '22023';
  end if;

  insert into public.live_odo_session_state(session_id) values (p_session_id)
  on conflict (session_id) do nothing;
  insert into public.live_odo_guarded_autopilot_settings(session_id)
  values (p_session_id) on conflict (session_id) do nothing;
  insert into public.live_odo_full_quick_connect_settings(session_id)
  values (p_session_id) on conflict (session_id) do nothing;

  update public.live_odo_full_quick_connect_settings set
    enabled = true,
    enabled_by_user_id = auth.uid(),
    lifecycle_state = 'preparing',
    orchestration_state = case when v_control.state = 'open'
      then 'pool_open' else 'waiting_for_pool_open' end,
    energy_mode = 'normal',
    started_at = v_now,
    maximum_runtime_ends_at = v_now + make_interval(mins => v_runtime_minutes),
    low_liquidity_since = null,
    last_reconciled_at = null,
    next_wake_at = v_now,
    last_action_type = null,
    last_reason_code = 'host_enabled',
    version = version + 1
  where session_id = p_session_id;

  update public.live_odo_guarded_autopilot_settings set
    enabled = true,
    enabled_by_user_id = auth.uid(),
    limited_mode = false,
    auto_narration_enabled = v_config.auto_narration_enabled,
    auto_scene_enabled = v_config.auto_scene_enabled,
    auto_spark_enabled = v_config.auto_spark_enabled,
    auto_audience_pulse_enabled = v_config.auto_audience_pulse_enabled,
    auto_intermission_enabled = v_config.auto_intermission_enabled,
    enabled_at = v_now,
    taken_over_at = null,
    version = version + 1
  where session_id = p_session_id;

  update public.live_odo_session_state set
    direction_mode = 'autopilot',
    autopilot_state = 'starting',
    pause_reason_code = null,
    lease_owner = null,
    lease_expires_at = null,
    lease_heartbeat_at = null,
    lease_generation = lease_generation + 1,
    state_version = state_version + 1
  where session_id = p_session_id returning * into v_state;

  update public.live_odo_guarded_autopilot_events set
    status = 'cancelled', outcome_reason_code = 'full_quick_connect_restarted',
    completed_at = v_now
  where session_id = p_session_id and status in ('pending','processing');
  update public.live_odo_guarded_autopilot_actions set
    status = 'stale', policy_reason_code = 'full_quick_connect_restarted',
    evaluated_at = v_now
  where session_id = p_session_id and status in ('proposed','approved');
  perform public.live_odo_guarded_enqueue_event_v1(
    p_session_id, 'HOST_RESUMED_AUTOPILOT',
    'full-quick-enable:' || p_session_id::text || ':' || v_state.state_version::text,
    'session', p_session_id, v_session.version, 95::smallint, v_now, 60
  );

  insert into public.live_odo_trace_events(session_id, trace_type, reason_code, metadata)
  values (
    p_session_id, 'odo_full_quick_connect_enabled', 'host_enabled',
    jsonb_build_object('maximumRuntimeMinutes', v_runtime_minutes,
      'leaseGeneration', v_state.lease_generation)
  );
  return jsonb_build_object(
    'enabled', true,
    'lifecycleState', 'preparing',
    'stateVersion', v_state.state_version,
    'leaseGeneration', v_state.lease_generation
  );
exception when invalid_text_representation or numeric_value_out_of_range then
  raise exception 'live_odo_full_quick_settings_invalid' using errcode = '22023';
end;
$$;

revoke all on function public.rpc_enable_live_odo_full_quick_connect_v1(uuid, jsonb)
from public, anon;
grant execute on function public.rpc_enable_live_odo_full_quick_connect_v1(uuid, jsonb)
to authenticated;

create or replace function public.rpc_finish_live_odo_quick_connect_v1(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  v_now timestamptz := timezone('utc', now());
begin
  if auth.uid() is null
    or not public.live_odo_full_quick_host_allowed_v1(p_session_id, auth.uid()) then
    raise exception 'live_odo_full_quick_finish_forbidden' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('live_odo:' || p_session_id::text, 0));
  perform pg_advisory_xact_lock(hashtextextended('quick:' || p_session_id::text, 0));
  if not exists (select 1 from public.live_odo_full_quick_connect_settings
    where session_id = p_session_id and enabled) then
    return jsonb_build_object('draining', false, 'reasonCode', 'full_quick_connect_not_active');
  end if;
  update public.live_odo_full_quick_connect_settings set
    lifecycle_state = 'draining', orchestration_state = 'draining',
    energy_mode = 'closing', next_wake_at = v_now,
    last_action_type = 'BEGIN_DRAINING', last_reason_code = 'host_finish_current',
    version = version + 1
  where session_id = p_session_id;
  update public.live_quick_connect_controls set
    state = 'draining', updated_by_user_id = auth.uid()
  where session_id = p_session_id and state in ('open','paused','draining');
  perform public.live_quick_connect_sync(p_session_id);
  insert into public.live_odo_trace_events(session_id, trace_type, reason_code, metadata)
  values (p_session_id, 'odo_full_quick_connect_draining', 'host_finish_current', '{}'::jsonb);
  return jsonb_build_object('draining', true);
end;
$$;

revoke all on function public.rpc_finish_live_odo_quick_connect_v1(uuid)
from public, anon;
grant execute on function public.rpc_finish_live_odo_quick_connect_v1(uuid)
to authenticated;

create or replace function public.rpc_resume_live_odo_full_quick_connect_v1(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare v_settings public.live_odo_full_quick_connect_settings;
begin
  if auth.uid() is null
    or not public.live_odo_full_quick_host_allowed_v1(p_session_id, auth.uid()) then
    raise exception 'live_odo_full_quick_resume_forbidden' using errcode = '42501';
  end if;
  select * into v_settings from public.live_odo_full_quick_connect_settings
  where session_id = p_session_id;
  if v_settings.lifecycle_state = 'paused_by_policy' then
    return jsonb_build_object('resumed', false, 'reasonCode', 'policy_clearance_required');
  elsif v_settings.lifecycle_state not in ('paused_by_host','recovering') then
    return jsonb_build_object('resumed', false, 'reasonCode', 'full_quick_connect_not_paused');
  end if;
  perform public.rpc_enable_live_odo_full_quick_connect_v1(
    p_session_id,
    jsonb_build_object('maximumRuntimeMinutes', greatest(10,
      ceil(extract(epoch from (coalesce(v_settings.maximum_runtime_ends_at,
        timezone('utc', now()) + interval '90 minutes') - timezone('utc', now()))) / 60)::integer
    ))
  );
  update public.live_odo_full_quick_connect_settings set
    last_reason_code = 'host_resumed', version = version + 1
  where session_id = p_session_id;
  return jsonb_build_object('resumed', true);
end;
$$;

revoke all on function public.rpc_resume_live_odo_full_quick_connect_v1(uuid)
from public, anon;
grant execute on function public.rpc_resume_live_odo_full_quick_connect_v1(uuid)
to authenticated;

commit;
