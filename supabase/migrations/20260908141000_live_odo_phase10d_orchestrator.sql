-- Betweener Live Phase 10D deterministic Quick Connect Orchestrator.

begin;

alter table public.live_quick_connect_pairings
  add column if not exists odo_conversation_spark jsonb,
  add column if not exists odo_spark_published_at timestamptz;

alter table public.live_quick_connect_pairings
  add constraint live_quick_pairing_odo_spark_valid check (
    odo_conversation_spark is null or (
      jsonb_typeof(odo_conversation_spark) = 'object'
      and odo_conversation_spark ?& array['context','question','source','actionId','expiresAt']
      and jsonb_typeof(odo_conversation_spark -> 'context') = 'string'
      and jsonb_typeof(odo_conversation_spark -> 'question') = 'string'
      and char_length(odo_conversation_spark ->> 'context') between 1 and 200
      and char_length(odo_conversation_spark ->> 'question') between 1 and 300
      and odo_conversation_spark ->> 'source' = 'odo_full_quick_connect'
      and octet_length(odo_conversation_spark::text) <= 1024
    )
  );

-- Add a pair-scoped Odo Spark to the existing private participant projection.
-- The underlying function still performs every existing safety check.
alter function public.rpc_get_live_quick_connect(uuid)
rename to rpc_get_live_quick_connect_without_odo_10d;

revoke all on function public.rpc_get_live_quick_connect_without_odo_10d(uuid)
from public, anon, authenticated, service_role;

create or replace function public.rpc_get_live_quick_connect(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  v_user_id uuid := auth.uid();
  v_snapshot jsonb;
  v_pairing_id uuid;
  v_spark jsonb;
begin
  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  v_snapshot := public.rpc_get_live_quick_connect_without_odo_10d(p_session_id);
  if jsonb_typeof(v_snapshot -> 'pairing') <> 'object' then
    return v_snapshot;
  end if;
  begin
    v_pairing_id := (v_snapshot #>> '{pairing,id}')::uuid;
  exception when invalid_text_representation then
    return v_snapshot;
  end;
  select pairing.odo_conversation_spark into v_spark
  from public.live_quick_connect_pairings pairing
  where pairing.id = v_pairing_id
    and pairing.session_id = p_session_id
    and v_user_id in (pairing.participant_a_user_id, pairing.participant_b_user_id)
    and pairing.state in ('active','reconnect_grace')
    and pairing.odo_spark_published_at is not null;
  return jsonb_set(
    v_snapshot,
    '{pairing,odo_conversation_spark}',
    coalesce(v_spark, 'null'::jsonb),
    true
  );
end;
$$;

revoke all on function public.rpc_get_live_quick_connect(uuid)
from public, anon;
grant execute on function public.rpc_get_live_quick_connect(uuid)
to authenticated;

create or replace function public.live_odo_full_quick_record_action_v1(
  p_session_id uuid,
  p_action_key text,
  p_action_type text,
  p_reason_code text,
  p_control_version bigint,
  p_pairing_id uuid default null,
  p_round_id uuid default null,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  v_action_id uuid;
  v_settings public.live_odo_full_quick_connect_settings;
  v_state public.live_odo_session_state;
begin
  if not public.live_odo_is_service_role() then
    raise exception 'live_odo_service_role_required' using errcode = '42501';
  end if;
  if p_action_key is null or char_length(p_action_key) not between 12 and 240
    or p_action_type not in (
      'OPEN_POOL','SYNC_MATCHER','PAIR_OBSERVED','ROUND_COMPLETED',
      'RETURN_TO_POOL','ENTER_LOW_LIQUIDITY','SHOW_PRIVATE_SPARK',
      'QUEUE_TIME_CUE','BEGIN_DRAINING','QUICK_CONNECT_CLOSING',
      'CLOSE_QUICK_CONNECT','RECOVER','WAIT'
    )
    or p_reason_code !~ '^[a-z][a-z0-9_]{0,119}$'
    or jsonb_typeof(coalesce(p_metadata, '{}'::jsonb)) <> 'object'
    or octet_length(coalesce(p_metadata, '{}'::jsonb)::text) > 2048 then
    raise exception 'live_odo_full_quick_action_invalid' using errcode = '22023';
  end if;
  select * into v_settings from public.live_odo_full_quick_connect_settings
  where session_id = p_session_id;
  select * into v_state from public.live_odo_session_state
  where session_id = p_session_id;
  insert into public.live_odo_full_quick_connect_actions(
    session_id, action_key, action_type, reason_code, control_version,
    orchestration_version, lease_generation, pairing_id, round_id, metadata
  ) values (
    p_session_id, p_action_key, p_action_type, p_reason_code, p_control_version,
    v_settings.version, v_state.lease_generation, p_pairing_id, p_round_id,
    coalesce(p_metadata, '{}'::jsonb)
  ) on conflict (action_key) do nothing
  returning action_id into v_action_id;
  if v_action_id is null then
    select action_id into v_action_id
    from public.live_odo_full_quick_connect_actions
    where action_key = p_action_key;
  else
    update public.live_odo_full_quick_connect_settings set
      last_action_type = p_action_type,
      last_reason_code = p_reason_code,
      last_pairing_id = coalesce(p_pairing_id, last_pairing_id),
      last_round_id = coalesce(p_round_id, last_round_id),
      version = version + 1
    where session_id = p_session_id;
    insert into public.live_odo_trace_events(
      session_id, action_id, trace_type, reason_code, metadata
    ) values (
      p_session_id, v_action_id, 'odo_full_quick_connect_action', p_reason_code,
      jsonb_build_object('actionType', p_action_type) || coalesce(p_metadata, '{}'::jsonb)
    );
  end if;
  return v_action_id;
end;
$$;

revoke all on function public.live_odo_full_quick_record_action_v1(
  uuid, text, text, text, bigint, uuid, uuid, jsonb
) from public, anon, authenticated, service_role;

create or replace function public.live_odo_append_full_quick_event_v1(
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
      'ODO_FULL_QUICK_CONNECT_ACTIVE','QUICK_CONNECT_POOL_OPENED',
      'QUICK_CONNECT_PAIR_FORMING','QUICK_CONNECT_ROUND_COMPLETED',
      'QUICK_CONNECT_LOW_LIQUIDITY',
      'QUICK_CONNECT_DRAINING','QUICK_CONNECT_CLOSING','QUICK_CONNECT_CLOSED'
    ) or p_action_id is null or jsonb_typeof(p_payload) <> 'object'
    or octet_length(p_payload::text) > 2048
    or p_expires_at <= timezone('utc', now()) then
    raise exception 'live_odo_full_quick_event_invalid' using errcode = '22023';
  end if;
  select * into v_event from public.live_director_events
  where session_id = p_session_id and idempotency_key = p_action_id;
  if v_event.id is not null then return v_event; end if;
  select * into v_state from public.live_odo_session_state
  where session_id = p_session_id for update;
  if v_state.session_id is null then
    raise exception 'live_odo_state_missing' using errcode = 'P0002';
  end if;
  update public.live_odo_session_state set
    latest_sequence = latest_sequence + 1,
    state_version = state_version + 1
  where session_id = p_session_id returning * into v_state;
  insert into public.live_director_events(
    session_id, schema_version, sequence, state_version, event_type, source,
    visibility, action_id, idempotency_key, payload, expires_at
  ) values (
    p_session_id, 1, v_state.latest_sequence, v_state.state_version,
    p_event_type, 'odo', 'participant', p_action_id, p_action_id,
    p_payload, p_expires_at
  ) returning * into v_event;
  insert into public.live_director_updates(session_id, version, latest_sequence, updated_at)
  values (p_session_id, 1, v_state.latest_sequence, timezone('utc', now()))
  on conflict (session_id) do update set
    version = public.live_director_updates.version + 1,
    latest_sequence = excluded.latest_sequence,
    updated_at = excluded.updated_at;
  return v_event;
end;
$$;

revoke all on function public.live_odo_append_full_quick_event_v1(
  uuid, text, uuid, jsonb, timestamptz
) from public, anon, authenticated, service_role;

create or replace function public.rpc_service_reconcile_live_odo_full_quick_connect_v1(
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
  v_control public.live_quick_connect_controls;
  v_settings public.live_odo_full_quick_connect_settings;
  v_state public.live_odo_session_state;
  v_pairing public.live_quick_connect_pairings;
  v_round public.live_quick_connect_rounds;
  v_before_active bigint := 0;
  v_after_active bigint := 0;
  v_before_completed bigint := 0;
  v_after_completed bigint := 0;
  v_waiting bigint := 0;
  v_eligible bigint := 0;
  v_action_id uuid;
  v_action_type text;
  v_reason text;
  v_action_key text;
  v_next_wake timestamptz;
  v_did_work boolean := false;
  v_event_type text;
  v_event_payload jsonb := '{}'::jsonb;
begin
  if not public.live_odo_is_service_role() then
    raise exception 'live_odo_service_role_required' using errcode = '42501';
  end if;
  if p_session_id is null or p_requested_by_user_id is null or p_lease_owner is null then
    raise exception 'live_odo_full_quick_reconcile_invalid' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('live_odo:' || p_session_id::text, 0));
  select * into v_config from public.live_odo_configuration where id = true for update;
  select * into v_session from public.live_sessions where id = p_session_id for update;
  select * into v_control from public.live_quick_connect_controls
  where session_id = p_session_id for update;
  select * into v_settings from public.live_odo_full_quick_connect_settings
  where session_id = p_session_id for update;
  select * into v_state from public.live_odo_session_state
  where session_id = p_session_id for update;

  if v_session.id is null or v_control.session_id is null
    or v_settings.session_id is null or v_state.session_id is null then
    return jsonb_build_object('allowed', false, 'reasonCode', 'full_quick_connect_state_missing');
  elsif not public.live_odo_full_quick_host_allowed_v1(
    p_session_id, p_requested_by_user_id
  ) then
    update public.live_odo_full_quick_connect_settings set
      enabled = false, lifecycle_state = 'paused_by_policy',
      orchestration_state = 'recovering', next_wake_at = null,
      last_reason_code = 'requester_not_authorized', version = version + 1
    where session_id = p_session_id;
    update public.live_odo_guarded_autopilot_settings set
      enabled = false, version = version + 1
    where session_id = p_session_id;
    update public.live_odo_session_state set
      direction_mode = 'manual', autopilot_state = 'paused_by_policy',
      pause_reason_code = 'requester_not_authorized', lease_owner = null,
      lease_expires_at = null, lease_heartbeat_at = null,
      lease_generation = lease_generation + 1, state_version = state_version + 1
    where session_id = p_session_id;
    return jsonb_build_object('allowed', false, 'reasonCode', 'requester_not_authorized');
  elsif not v_config.odo_enabled or not v_config.guarded_autopilot_enabled
    or not v_config.full_quick_connect_autopilot_enabled
    or v_config.full_autopilot_enabled then
    update public.live_odo_full_quick_connect_settings set
      enabled = false, lifecycle_state = 'paused_by_policy',
      orchestration_state = 'recovering', next_wake_at = null,
      last_reason_code = 'full_quick_connect_disabled', version = version + 1
    where session_id = p_session_id;
    update public.live_odo_guarded_autopilot_settings set
      enabled = false, version = version + 1
    where session_id = p_session_id;
    update public.live_odo_session_state set
      direction_mode = 'manual', autopilot_state = 'paused_by_policy',
      pause_reason_code = 'full_quick_connect_disabled', lease_owner = null,
      lease_expires_at = null, lease_heartbeat_at = null,
      lease_generation = lease_generation + 1, state_version = state_version + 1
    where session_id = p_session_id;
    return jsonb_build_object('allowed', false, 'reasonCode', 'full_quick_connect_disabled');
  elsif not v_settings.enabled then
    return jsonb_build_object('allowed', false, 'reasonCode', 'full_quick_connect_not_active');
  elsif v_config.circuit_breaker_open then
    update public.live_odo_full_quick_connect_settings set
      enabled = false, lifecycle_state = 'paused_by_policy',
      orchestration_state = 'recovering', next_wake_at = null,
      last_reason_code = 'circuit_breaker_open', version = version + 1
    where session_id = p_session_id;
    update public.live_odo_guarded_autopilot_settings set
      enabled = false, version = version + 1
    where session_id = p_session_id;
    update public.live_odo_session_state set
      direction_mode = 'manual', autopilot_state = 'paused_by_policy',
      pause_reason_code = 'circuit_breaker_open', lease_owner = null,
      lease_expires_at = null, lease_heartbeat_at = null,
      lease_generation = lease_generation + 1, state_version = state_version + 1
    where session_id = p_session_id;
    return jsonb_build_object('allowed', false, 'reasonCode', 'circuit_breaker_open');
  elsif v_session.status <> 'live' then
    update public.live_odo_full_quick_connect_settings set
      enabled = false, lifecycle_state = 'ended',
      orchestration_state = 'quick_connect_closed', next_wake_at = null,
      last_reason_code = 'session_not_live', version = version + 1
    where session_id = p_session_id;
    return jsonb_build_object('allowed', false, 'reasonCode', 'session_not_live');
  elsif v_session.format <> 'quick_connect' then
    return jsonb_build_object('allowed', false, 'reasonCode', 'quick_connect_required');
  elsif v_state.lease_owner is not null and v_state.lease_expires_at > v_now
    and v_state.lease_owner <> p_lease_owner then
    return jsonb_build_object('allowed', false, 'reasonCode', 'lease_held',
      'nextWakeAt', v_state.lease_expires_at);
  end if;

  if v_state.lease_owner is not null and v_state.lease_expires_at <= v_now then
    update public.live_odo_full_quick_connect_settings set
      lifecycle_state = case when lifecycle_state in ('draining','closing')
        then lifecycle_state else 'recovering' end,
      orchestration_state = case when lifecycle_state in ('draining','closing')
        then orchestration_state else 'recovering' end,
      last_reason_code = 'expired_lease_recovered', version = version + 1
    where session_id = p_session_id;
    v_did_work := true;
    select * into v_settings from public.live_odo_full_quick_connect_settings
    where session_id = p_session_id for update;
  end if;

  update public.live_odo_session_state set
    direction_mode = 'autopilot',
    autopilot_state = 'active',
    pause_reason_code = null,
    lease_owner = p_lease_owner,
    lease_generation = lease_generation + 1,
    lease_expires_at = v_now + make_interval(secs => v_config.lease_seconds),
    lease_heartbeat_at = v_now,
    state_version = state_version + 1
  where session_id = p_session_id returning * into v_state;

  select count(*) into v_before_active
  from public.live_quick_connect_pairings pairing
  where pairing.session_id = p_session_id
    and pairing.state in ('active','reconnect_grace');
  select count(*) into v_before_completed
  from public.live_quick_connect_pairings pairing
  where pairing.session_id = p_session_id
    and pairing.state in ('completed','round_incomplete','cancelled');

  if v_settings.lifecycle_state in ('preparing','starting','recovering') then
    if v_control.state in ('closed','paused') then
      v_action_key := 'full-open:' || p_session_id::text || ':' || v_control.version::text;
      update public.live_quick_connect_controls set
        state = 'open', updated_by_user_id = v_settings.enabled_by_user_id
      where session_id = p_session_id and state in ('closed','paused');
      perform public.live_quick_connect_sync(p_session_id);
      select * into v_control from public.live_quick_connect_controls
      where session_id = p_session_id;
      v_action_type := 'OPEN_POOL';
      v_reason := 'host_authorized_autopilot_open';
      v_event_type := 'QUICK_CONNECT_POOL_OPENED';
      v_event_payload := jsonb_build_object('state', 'open');
      v_did_work := true;
    elsif v_control.state = 'open' then
      perform public.live_quick_connect_sync(p_session_id);
      v_action_key := 'full-active:' || p_session_id::text || ':' || v_settings.version::text;
      v_action_type := 'SYNC_MATCHER';
      v_reason := 'authoritative_state_reconciled';
      v_event_type := 'ODO_FULL_QUICK_CONNECT_ACTIVE';
      v_event_payload := jsonb_build_object('state', 'active');
      v_did_work := true;
    elsif v_control.state = 'draining' then
      update public.live_odo_full_quick_connect_settings set
        lifecycle_state = 'draining', orchestration_state = 'draining',
        energy_mode = 'closing', version = version + 1
      where session_id = p_session_id;
      v_did_work := true;
    elsif v_control.state = 'ended' then
      update public.live_odo_full_quick_connect_settings set
        lifecycle_state = 'closing', orchestration_state = 'quick_connect_closed',
        energy_mode = 'closing', version = version + 1
      where session_id = p_session_id;
      v_did_work := true;
    end if;
    if v_control.state = 'open' then
      update public.live_odo_full_quick_connect_settings set
        lifecycle_state = 'active', orchestration_state = 'pool_open',
        energy_mode = 'normal', version = version + 1
      where session_id = p_session_id;
    end if;
  elsif v_settings.lifecycle_state = 'active' then
    if v_control.state = 'draining' then
      update public.live_odo_full_quick_connect_settings set
        lifecycle_state = 'draining', orchestration_state = 'draining',
        energy_mode = 'closing', version = version + 1
      where session_id = p_session_id;
      v_did_work := true;
    elsif v_control.state = 'ended' then
      update public.live_odo_full_quick_connect_settings set
        lifecycle_state = 'closing', orchestration_state = 'quick_connect_closed',
        energy_mode = 'closing', version = version + 1
      where session_id = p_session_id;
      v_did_work := true;
    elsif v_settings.maximum_runtime_ends_at <= v_now then
      v_action_key := 'full-drain:' || p_session_id::text || ':' || v_control.version::text;
      update public.live_quick_connect_controls set
        state = 'draining', updated_by_user_id = v_settings.enabled_by_user_id
      where session_id = p_session_id and state in ('open','paused');
      perform public.live_quick_connect_sync(p_session_id);
      update public.live_odo_full_quick_connect_settings set
        lifecycle_state = 'draining', orchestration_state = 'draining',
        energy_mode = 'closing', version = version + 1
      where session_id = p_session_id;
      v_action_type := 'BEGIN_DRAINING';
      v_reason := 'maximum_runtime_reached';
      v_event_type := 'QUICK_CONNECT_DRAINING';
      v_event_payload := jsonb_build_object('reason', 'maximum_runtime_reached');
      v_did_work := true;
    else
      perform public.live_quick_connect_sync(p_session_id);
    end if;
  elsif v_settings.lifecycle_state = 'draining' then
    if v_control.state in ('open','paused') then
      update public.live_quick_connect_controls set
        state = 'draining', updated_by_user_id = v_settings.enabled_by_user_id
      where session_id = p_session_id;
    end if;
    perform public.live_quick_connect_sync(p_session_id);
    select * into v_control from public.live_quick_connect_controls
    where session_id = p_session_id;
    if v_control.state = 'ended' then
      v_action_key := 'full-closing:' || p_session_id::text || ':' || v_control.version::text;
      v_action_type := 'QUICK_CONNECT_CLOSING';
      v_reason := 'active_rounds_finished';
      v_event_type := 'QUICK_CONNECT_CLOSING';
      v_event_payload := jsonb_build_object('copy',
        'Quick Connect is complete. Thank you for showing up with intention.');
      update public.live_odo_full_quick_connect_settings set
        lifecycle_state = 'closing', orchestration_state = 'quick_connect_closed',
        energy_mode = 'closing', version = version + 1
      where session_id = p_session_id;
      v_did_work := true;
    end if;
  elsif v_settings.lifecycle_state = 'closing' then
    v_action_key := 'full-closed:' || p_session_id::text || ':' || v_control.version::text;
    v_action_type := 'CLOSE_QUICK_CONNECT';
    v_reason := 'quick_connect_segment_closed';
    v_event_type := 'QUICK_CONNECT_CLOSED';
    v_event_payload := jsonb_build_object('state', 'closed');
    update public.live_odo_full_quick_connect_settings set
      enabled = false, lifecycle_state = 'ended',
      orchestration_state = 'quick_connect_closed', next_wake_at = null,
      version = version + 1
    where session_id = p_session_id;
    update public.live_odo_guarded_autopilot_settings set
      enabled = false, version = version + 1
    where session_id = p_session_id;
    update public.live_odo_session_state set
      direction_mode = 'manual', autopilot_state = 'ended',
      pause_reason_code = null
    where session_id = p_session_id;
    v_did_work := true;
  end if;

  select count(*) into v_after_active
  from public.live_quick_connect_pairings pairing
  where pairing.session_id = p_session_id
    and pairing.state in ('active','reconnect_grace');
  select count(*) into v_after_completed
  from public.live_quick_connect_pairings pairing
  where pairing.session_id = p_session_id
    and pairing.state in ('completed','round_incomplete','cancelled');
  select count(*) into v_waiting
  from public.live_quick_connect_participants participant
  where participant.session_id = p_session_id and participant.state = 'waiting'
    and participant.connection_state = 'connected';
  v_eligible := public.live_odo_full_quick_eligible_pairs_v1(p_session_id);
  select * into v_pairing from public.live_quick_connect_pairings pairing
  where pairing.session_id = p_session_id
    and pairing.state in ('active','reconnect_grace')
  order by pairing.starts_at desc, pairing.id limit 1;
  if v_pairing.id is not null then
    select * into v_round from public.live_quick_connect_rounds
    where id = v_pairing.round_id;
  end if;

  select * into v_settings from public.live_odo_full_quick_connect_settings
  where session_id = p_session_id;
  select * into v_control from public.live_quick_connect_controls
  where session_id = p_session_id;

  if v_settings.lifecycle_state = 'active' and v_action_type is null then
    if v_after_completed > v_before_completed then
      v_action_key := 'full-round-complete:' || p_session_id::text || ':'
        || v_after_completed::text;
      v_action_type := 'ROUND_COMPLETED';
      v_reason := 'authoritative_round_completed';
      v_event_type := 'QUICK_CONNECT_ROUND_COMPLETED';
      v_event_payload := jsonb_build_object('state', 'returning_participants');
      update public.live_odo_full_quick_connect_settings set
        orchestration_state = 'returning_participants', version = version + 1
      where session_id = p_session_id;
      v_did_work := true;
    elsif v_pairing.id is not null and (
      v_after_active > v_before_active or v_settings.last_pairing_id is distinct from v_pairing.id
    ) then
      v_action_key := 'full-pair:' || v_pairing.id::text || ':' || v_pairing.version::text;
      v_action_type := 'PAIR_OBSERVED';
      v_reason := 'automatcher_pair_observed';
      v_event_type := 'QUICK_CONNECT_PAIR_FORMING';
      v_event_payload := jsonb_build_object('roundNumber', v_round.round_number);
      update public.live_odo_full_quick_connect_settings set
        orchestration_state = 'pair_active', low_liquidity_since = null,
        last_pairing_id = v_pairing.id, last_round_id = v_pairing.round_id,
        version = version + 1
      where session_id = p_session_id;
      v_did_work := true;
    elsif v_pairing.id is not null
      and v_pairing.odo_spark_published_at is null
      and v_config.auto_spark_enabled
      and v_now >= v_pairing.starts_at
        + make_interval(secs => v_config.automatic_spark_delay_seconds)
      and v_pairing.ends_at > v_now + interval '45 seconds' then
      v_action_key := 'full-spark:' || v_pairing.id::text;
      v_action_id := public.live_odo_full_quick_record_action_v1(
        p_session_id, v_action_key, 'SHOW_PRIVATE_SPARK', 'active_round_spark_due',
        v_control.version, v_pairing.id, v_pairing.round_id,
        jsonb_build_object('roundNumber', v_round.round_number)
      );
      update public.live_quick_connect_pairings set
        odo_conversation_spark = jsonb_build_object(
          'context', 'A thoughtful question for this conversation',
          'question', 'What is something you would love to make more time for?',
          'source', 'odo_full_quick_connect',
          'actionId', v_action_id,
          'expiresAt', v_pairing.ends_at
        ),
        odo_spark_published_at = v_now,
        version = version + 1
      where id = v_pairing.id and odo_spark_published_at is null;
      update public.live_odo_full_quick_connect_settings set
        orchestration_state = 'pair_active',
        last_action_type = 'SHOW_PRIVATE_SPARK',
        last_reason_code = 'active_round_spark_due',
        version = version + 1
      where session_id = p_session_id;
      v_action_type := null;
      v_did_work := true;
    elsif v_round.id is not null and v_round.ends_at > v_now
      and v_round.ends_at <= v_now + interval '75 seconds'
      and not exists (
        select 1 from public.live_odo_full_quick_connect_actions action_row
        where action_row.action_key = 'full-cue:' || v_round.id::text
      ) then
      perform public.live_odo_guarded_enqueue_event_v1(
        p_session_id, 'ROUND_NEAR_END', 'full-cue:' || v_round.id::text,
        'quick_round', v_round.id, v_round.version, 80::smallint, v_now, 75
      );
      v_action_key := 'full-cue:' || v_round.id::text;
      v_action_type := 'QUEUE_TIME_CUE';
      v_reason := 'round_nearing_end';
      v_did_work := true;
    elsif v_pairing.id is not null then
      update public.live_odo_full_quick_connect_settings set
        orchestration_state = 'pair_active', low_liquidity_since = null,
        last_pairing_id = v_pairing.id, last_round_id = v_pairing.round_id,
        version = version + 1
      where session_id = p_session_id
        and (orchestration_state <> 'pair_active'
          or low_liquidity_since is not null
          or last_pairing_id is distinct from v_pairing.id);
    elsif v_eligible > 0 then
      update public.live_odo_full_quick_connect_settings set
        orchestration_state = 'waiting_for_pair', low_liquidity_since = null,
        version = version + 1
      where session_id = p_session_id
        and (orchestration_state <> 'waiting_for_pair' or low_liquidity_since is not null);
    else
      if v_settings.low_liquidity_since is null then
        update public.live_odo_full_quick_connect_settings set
          orchestration_state = 'waiting_for_candidates',
          low_liquidity_since = v_now, version = version + 1
        where session_id = p_session_id;
      elsif v_settings.low_liquidity_since <= v_now
        - make_interval(secs => v_config.full_quick_connect_low_liquidity_seconds)
        and v_settings.orchestration_state <> 'low_liquidity' then
        v_action_key := 'full-low:' || p_session_id::text || ':'
          || extract(epoch from v_settings.low_liquidity_since)::bigint::text;
        v_action_type := 'ENTER_LOW_LIQUIDITY';
        v_reason := 'no_eligible_pair';
        v_event_type := 'QUICK_CONNECT_LOW_LIQUIDITY';
        v_event_payload := jsonb_build_object('state', 'preparing_next_connection');
        update public.live_odo_full_quick_connect_settings set
          orchestration_state = 'low_liquidity', energy_mode = 'calm',
          version = version + 1
        where session_id = p_session_id;
        perform public.live_odo_guarded_enqueue_event_v1(
          p_session_id, 'INTERMISSION_REQUIRED',
          'full-low-intermission:' || extract(epoch from v_settings.low_liquidity_since)::bigint::text,
          'session', p_session_id, v_session.version, 30::smallint, v_now, 180
        );
        v_did_work := true;
      end if;
    end if;
  end if;

  if v_action_type is not null then
    v_action_id := public.live_odo_full_quick_record_action_v1(
      p_session_id, v_action_key, v_action_type, v_reason,
      v_control.version,
      case when v_action_type in ('PAIR_OBSERVED','SHOW_PRIVATE_SPARK')
        then v_pairing.id else null end,
      case when v_action_type in ('PAIR_OBSERVED','QUEUE_TIME_CUE')
        then v_round.id else null end,
      jsonb_build_object(
        'waitingPeople', v_waiting,
        'eligiblePairs', v_eligible,
        'activePairs', v_after_active
      )
    );
    if v_event_type is not null then
      perform public.live_odo_append_full_quick_event_v1(
        p_session_id, v_event_type, v_action_id, v_event_payload,
        v_now + interval '15 minutes'
      );
    end if;
  end if;

  v_next_wake := v_now + make_interval(secs => v_config.full_quick_connect_reconcile_seconds);
  if v_round.id is not null and v_round.state = 'active' then
    v_next_wake := least(
      v_next_wake,
      v_round.ends_at,
      greatest(v_now, v_round.ends_at - interval '60 seconds'),
      greatest(v_now, v_pairing.starts_at
        + make_interval(secs => v_config.automatic_spark_delay_seconds))
    );
  elsif v_settings.low_liquidity_since is not null
    and v_settings.orchestration_state <> 'low_liquidity' then
    v_next_wake := least(v_next_wake,
      v_settings.low_liquidity_since
        + make_interval(secs => v_config.full_quick_connect_low_liquidity_seconds));
  end if;

  update public.live_odo_full_quick_connect_settings set
    last_reconciled_at = v_now,
    next_wake_at = case when enabled then v_next_wake else null end,
    last_action_type = coalesce(v_action_type, last_action_type),
    last_reason_code = coalesce(v_reason, last_reason_code),
    version = version + 1
  where session_id = p_session_id;
  update public.live_odo_session_state set
    lease_owner = null, lease_expires_at = null, lease_heartbeat_at = null,
    last_decision_at = v_now
  where session_id = p_session_id and lease_owner = p_lease_owner
    and lease_generation = v_state.lease_generation;

  return jsonb_build_object(
    'allowed', true,
    'didWork', v_did_work,
    'actionType', coalesce(v_action_type, 'WAIT'),
    'reasonCode', coalesce(v_reason, 'authoritative_state_current'),
    'nextWakeAt', v_next_wake,
    'snapshot', public.live_odo_full_quick_snapshot_v1(
      p_session_id, p_requested_by_user_id
    )
  );
end;
$$;

revoke all on function public.rpc_service_reconcile_live_odo_full_quick_connect_v1(
  uuid, uuid, uuid
) from public, anon, authenticated;
grant execute on function public.rpc_service_reconcile_live_odo_full_quick_connect_v1(
  uuid, uuid, uuid
) to service_role;

-- Keep the existing single Live maintenance clock. The mobile one-shot wake
-- provides low-latency presentation, while this server-owned reconciliation
-- makes lifecycle progress recoverable when the Host app backgrounds or a
-- serverless worker restarts.
alter function public.run_live_maintenance()
rename to run_live_maintenance_without_full_quick_v1;

revoke all on function public.run_live_maintenance_without_full_quick_v1()
from public, anon, authenticated, service_role;

create or replace function public.run_live_maintenance()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  v_base jsonb;
  v_processed integer := 0;
  v_failures integer := 0;
  v_session record;
begin
  if current_user <> 'postgres' and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'live_maintenance_forbidden' using errcode = '42501';
  end if;
  v_base := public.run_live_maintenance_without_full_quick_v1();
  if v_base ->> 'status' = 'skipped_locked' then
    return v_base || jsonb_build_object(
      'fullQuickConnect', jsonb_build_object('status', 'skipped_locked')
    );
  end if;

  perform set_config('request.jwt.claim.role', 'service_role', true);
  for v_session in
    select settings.session_id, settings.enabled_by_user_id
    from public.live_odo_full_quick_connect_settings settings
    join public.live_sessions session_row on session_row.id = settings.session_id
    where settings.enabled
      and settings.lifecycle_state in (
        'preparing','starting','active','draining','closing','recovering'
      )
      and session_row.status = 'live'
      and (settings.next_wake_at is null
        or settings.next_wake_at <= timezone('utc', now()))
    order by settings.next_wake_at nulls first, settings.session_id
    limit 20
  loop
    begin
      perform public.rpc_service_reconcile_live_odo_full_quick_connect_v1(
        v_session.session_id, v_session.enabled_by_user_id, gen_random_uuid()
      );
      v_processed := v_processed + 1;
    exception when others then
      v_failures := v_failures + 1;
      insert into public.live_maintenance_failures(task_name, sqlstate, error_message)
      values ('odo_full_quick_connect', sqlstate, left(sqlerrm, 500));
    end;
  end loop;

  return v_base || jsonb_build_object(
    'fullQuickConnect', jsonb_build_object(
      'status', case when v_failures = 0 then 'ok' else 'partial' end,
      'processed', v_processed,
      'failures', v_failures
    )
  );
end;
$$;

revoke all on function public.run_live_maintenance()
from public, anon, authenticated;
grant execute on function public.run_live_maintenance() to service_role;

-- Extend the existing one-tap takeover without changing its public contract.
alter function public.rpc_take_over_live_odo_v1(uuid)
rename to rpc_take_over_live_odo_without_full_quick_v1;

revoke all on function public.rpc_take_over_live_odo_without_full_quick_v1(uuid)
from public, anon, authenticated, service_role;

create or replace function public.rpc_take_over_live_odo_v1(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  v_result jsonb;
  v_now timestamptz := timezone('utc', now());
begin
  v_result := public.rpc_take_over_live_odo_without_full_quick_v1(p_session_id);
  update public.live_odo_full_quick_connect_settings set
    enabled = false,
    lifecycle_state = 'paused_by_host',
    orchestration_state = case
      when orchestration_state = 'quick_connect_closed' then orchestration_state
      when orchestration_state = 'pair_active' then 'pair_active'
      else 'recovering' end,
    next_wake_at = null,
    last_reason_code = 'host_takeover',
    version = version + 1
  where session_id = p_session_id and lifecycle_state <> 'ended';
  insert into public.live_odo_trace_events(session_id, trace_type, reason_code, metadata)
  values (p_session_id, 'odo_full_quick_connect_paused', 'host_takeover',
    jsonb_build_object('activePairPreserved', exists (
      select 1 from public.live_quick_connect_pairings pairing
      where pairing.session_id = p_session_id
        and pairing.state in ('active','reconnect_grace')
    )));
  return v_result || jsonb_build_object('fullQuickConnectPaused', true, 'pausedAt', v_now);
end;
$$;

revoke all on function public.rpc_take_over_live_odo_v1(uuid)
from public, anon;
grant execute on function public.rpc_take_over_live_odo_v1(uuid)
to authenticated, service_role;

-- Safety clearance still requires an explicit Host resume. Extend the 10C
-- clearance transaction so the full Quick Connect state cannot remain stuck
-- behind a cleared policy fence.
alter function public.rpc_service_clear_live_odo_policy_pause_v1(uuid, text)
rename to rpc_service_clear_live_odo_policy_pause_without_full_quick_v1;

revoke all on function public.rpc_service_clear_live_odo_policy_pause_without_full_quick_v1(
  uuid, text
) from public, anon, authenticated, service_role;

create or replace function public.rpc_service_clear_live_odo_policy_pause_v1(
  p_session_id uuid,
  p_reason_code text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  v_result jsonb;
begin
  v_result := public.rpc_service_clear_live_odo_policy_pause_without_full_quick_v1(
    p_session_id, p_reason_code
  );
  if coalesce((v_result ->> 'cleared')::boolean, false) then
    update public.live_odo_full_quick_connect_settings set
      enabled = false,
      lifecycle_state = case when lifecycle_state = 'paused_by_policy'
        then 'paused_by_host' else lifecycle_state end,
      orchestration_state = case when lifecycle_state = 'paused_by_policy'
        then 'recovering' else orchestration_state end,
      next_wake_at = null,
      last_reason_code = case when lifecycle_state = 'paused_by_policy'
        then 'host_resume_required' else last_reason_code end,
      version = version + 1
    where session_id = p_session_id and lifecycle_state <> 'ended';
  end if;
  return v_result || jsonb_build_object('fullQuickConnectRequiresHostResume', true);
end;
$$;

revoke all on function public.rpc_service_clear_live_odo_policy_pause_v1(uuid, text)
from public, anon, authenticated;
grant execute on function public.rpc_service_clear_live_odo_policy_pause_v1(uuid, text)
to service_role;

create or replace function public.rpc_admin_update_live_odo_full_quick_connect_v1(
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
  if not public.live_odo_jsonb_has_exact_keys_v1(
    p_patch, array[]::text[], array[
      'fullQuickConnectAutopilotEnabled','internalOnly',
      'lowLiquiditySeconds','maximumRuntimeMinutes','reconcileSeconds'
    ]
  ) then
    raise exception 'live_odo_full_quick_configuration_patch_invalid' using errcode = '22023';
  end if;
  update public.live_odo_configuration set
    full_quick_connect_autopilot_enabled = case
      when p_patch ? 'fullQuickConnectAutopilotEnabled'
        then (p_patch ->> 'fullQuickConnectAutopilotEnabled')::boolean
      else full_quick_connect_autopilot_enabled end,
    full_quick_connect_internal_only = case when p_patch ? 'internalOnly'
      then (p_patch ->> 'internalOnly')::boolean
      else full_quick_connect_internal_only end,
    full_quick_connect_low_liquidity_seconds = case when p_patch ? 'lowLiquiditySeconds'
      then (p_patch ->> 'lowLiquiditySeconds')::integer
      else full_quick_connect_low_liquidity_seconds end,
    full_quick_connect_maximum_runtime_minutes = case when p_patch ? 'maximumRuntimeMinutes'
      then (p_patch ->> 'maximumRuntimeMinutes')::integer
      else full_quick_connect_maximum_runtime_minutes end,
    full_quick_connect_reconcile_seconds = case when p_patch ? 'reconcileSeconds'
      then (p_patch ->> 'reconcileSeconds')::integer
      else full_quick_connect_reconcile_seconds end,
    updated_by_user_id = auth.uid()
  where id = true returning * into v_config;
  insert into public.live_odo_trace_events(trace_type, reason_code, metadata)
  values ('configuration_updated', 'full_quick_connect_configuration_update',
    jsonb_build_object('changedKeys', (select jsonb_agg(key_name order by key_name)
      from jsonb_object_keys(p_patch) key_name)));
  return jsonb_build_object(
    'fullQuickConnectAutopilotEnabled', v_config.full_quick_connect_autopilot_enabled,
    'internalOnly', v_config.full_quick_connect_internal_only,
    'lowLiquiditySeconds', v_config.full_quick_connect_low_liquidity_seconds,
    'maximumRuntimeMinutes', v_config.full_quick_connect_maximum_runtime_minutes,
    'reconcileSeconds', v_config.full_quick_connect_reconcile_seconds,
    'fullAutopilotEnabled', v_config.full_autopilot_enabled,
    'musicEnabled', v_config.music_enabled
  );
exception when invalid_text_representation or numeric_value_out_of_range or check_violation then
  raise exception 'live_odo_full_quick_configuration_patch_invalid' using errcode = '22023';
end;
$$;

revoke all on function public.rpc_admin_update_live_odo_full_quick_connect_v1(jsonb)
from public, anon;
grant execute on function public.rpc_admin_update_live_odo_full_quick_connect_v1(jsonb)
to authenticated, service_role;

comment on function public.rpc_service_reconcile_live_odo_full_quick_connect_v1(
  uuid, uuid, uuid
) is 'Service-only deterministic Phase 10D lifecycle reconciler. It delegates WHO pairing to live_quick_connect_sync and never reads or writes private decisions.';

commit;
