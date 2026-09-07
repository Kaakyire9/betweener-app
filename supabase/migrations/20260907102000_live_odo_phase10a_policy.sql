-- Betweener Live Phase 10A: short-transaction lease, budget and shadow policy.
-- No function in this migration performs network I/O. The Edge worker must
-- acquire/snapshot, release the transaction, call AI, then evaluate in a new
-- transaction that rebuilds and revalidates current authoritative state.

begin;

create or replace function public.live_odo_jsonb_has_exact_keys_v1(
  p_value jsonb,
  p_required text[],
  p_optional text[] default array[]::text[]
)
returns boolean
language sql
immutable
set search_path = public, pg_catalog
as $$
  select jsonb_typeof(p_value) = 'object'
    and p_value ?& p_required
    and not exists (
      select 1 from jsonb_object_keys(p_value) key_name
      where not (key_name = any(p_required || p_optional))
    );
$$;

create or replace function public.live_odo_validate_action_payload_v1(
  p_action_type text,
  p_payload jsonb
)
returns text
language plpgsql
immutable
set search_path = public, pg_catalog
as $$
declare
  v_uuid_pattern constant text := '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$';
begin
  if jsonb_typeof(p_payload) <> 'object' or octet_length(p_payload::text) > 8192 then
    return 'invalid_payload_object_or_size';
  end if;
  if p_payload::text ~* '(https?://|wss?://|rpc_[a-z0-9_]+|stream(://|_[a-z0-9_]+)|select[^"\n]{0,200}from|insert\s+into|update\s+[a-z_][a-z0-9_.]*\s+set|delete\s+from|(alter|drop|truncate)\s+(table|function|schema|role)|(grant|revoke)[^"\n]{0,200}\s+on|<script|"(sql|query|rpc|functionName|url|uri|streamCallId|componentName|route)"\s*:)' then
    return 'forbidden_control_data';
  end if;

  if p_action_type in ('NO_ACTION','OPEN_POOL') then
    if not public.live_odo_jsonb_has_exact_keys_v1(p_payload, array[]::text[]) then
      return 'invalid_empty_payload';
    end if;
  elsif p_action_type = 'WAIT' then
    if not public.live_odo_jsonb_has_exact_keys_v1(p_payload, array['waitMs'], array['untilEvent'])
       or jsonb_typeof(p_payload->'waitMs') <> 'number'
       or (p_payload->>'waitMs')::numeric <> trunc((p_payload->>'waitMs')::numeric)
       or (p_payload->>'waitMs')::numeric not between 1000 and 60000
       or (p_payload ? 'untilEvent' and p_payload->>'untilEvent' not in (
         'participant_joined','round_state_changed','session_state_changed',
         'host_resumed','decision_interval_elapsed'
       )) then
      return 'invalid_wait_payload';
    end if;
  elsif p_action_type in ('SESSION_WELCOME','SESSION_CLOSING') then
    if not public.live_odo_jsonb_has_exact_keys_v1(p_payload, array['copy','locale'])
       or jsonb_typeof(p_payload->'copy') <> 'string'
       or char_length(p_payload->>'copy') not between 1 and 500
       or jsonb_typeof(p_payload->'locale') <> 'string'
       or (p_payload->>'locale') !~ '^[a-z]{2}(-[A-Z]{2})?$' then
      return 'invalid_copy_payload';
    end if;
  elsif p_action_type in ('ANNOUNCE_PAIR','FOCUS_PAIRING','CLOSE_ROUND','RETURN_TO_POOL') then
    if not public.live_odo_jsonb_has_exact_keys_v1(p_payload, array['roundId'])
       or jsonb_typeof(p_payload->'roundId') <> 'string'
       or (p_payload->>'roundId') !~* v_uuid_pattern then
      return 'invalid_round_payload';
    end if;
  elsif p_action_type = 'REQUEST_SCENE' then
    if not public.live_odo_jsonb_has_exact_keys_v1(p_payload, array['scene'])
       or p_payload->>'scene' not in (
         'host_focus','host_plus_pool','pool_focus','pair_forming',
         'quick_connect_active','audience_pulse','conversation_topic',
         'music_intermission','screen_share','odo_stage','session_closing'
       ) then
      return 'invalid_scene_payload';
    end if;
  elsif p_action_type = 'SHOW_CONVERSATION_SPARK' then
    if not public.live_odo_jsonb_has_exact_keys_v1(
         p_payload, array['roundId','context','question','locale'])
       or (p_payload->>'roundId') !~* v_uuid_pattern
       or char_length(p_payload->>'context') not between 1 and 200
       or char_length(p_payload->>'question') not between 1 and 300
       or (p_payload->>'locale') !~ '^[a-z]{2}(-[A-Z]{2})?$' then
      return 'invalid_spark_payload';
    end if;
  elsif p_action_type = 'SHOW_AUDIENCE_PULSE' then
    if not public.live_odo_jsonb_has_exact_keys_v1(p_payload, array['templateKey','durationSeconds'])
       or (p_payload->>'templateKey') !~ '^[a-z][a-z0-9_]{0,63}$'
       or jsonb_typeof(p_payload->'durationSeconds') <> 'number'
       or (p_payload->>'durationSeconds')::numeric <> trunc((p_payload->>'durationSeconds')::numeric)
       or (p_payload->>'durationSeconds')::numeric not between 30 and 300 then
      return 'invalid_pulse_payload';
    end if;
  elsif p_action_type = 'SHOW_INTERMISSION' then
    if not public.live_odo_jsonb_has_exact_keys_v1(p_payload, array['durationSeconds','copy','locale'])
       or jsonb_typeof(p_payload->'durationSeconds') <> 'number'
       or (p_payload->>'durationSeconds')::numeric <> trunc((p_payload->>'durationSeconds')::numeric)
       or (p_payload->>'durationSeconds')::numeric not between 15 and 600
       or char_length(p_payload->>'copy') not between 1 and 500
       or (p_payload->>'locale') !~ '^[a-z]{2}(-[A-Z]{2})?$' then
      return 'invalid_intermission_payload';
    end if;
  elsif p_action_type = 'REQUEST_MUSIC_ACTION' then
    if not public.live_odo_jsonb_has_exact_keys_v1(
         p_payload, array['action'], array['trackId','playlistId','volume'])
       or p_payload->>'action' not in ('play','pause','resume','stop','set_volume')
       or (p_payload ? 'trackId' and (p_payload->>'trackId') !~* v_uuid_pattern)
       or (p_payload ? 'playlistId' and (p_payload->>'playlistId') !~* v_uuid_pattern)
       or (p_payload ? 'volume' and (
         jsonb_typeof(p_payload->'volume') <> 'number'
         or (p_payload->>'volume')::numeric not between 0 and 1
       )) then
      return 'invalid_music_payload';
    end if;
  elsif p_action_type = 'TIME_CUE' then
    if not public.live_odo_jsonb_has_exact_keys_v1(p_payload, array['roundId','cue'])
       or (p_payload->>'roundId') !~* v_uuid_pattern
       or p_payload->>'cue' not in ('one_minute','near_end','ended') then
      return 'invalid_time_cue_payload';
    end if;
  else
    return 'unknown_action_type';
  end if;
  return null;
exception when invalid_text_representation or numeric_value_out_of_range then
  return 'invalid_payload_scalar';
end;
$$;

create or replace function public.rpc_service_begin_live_odo_call_v1(
  p_session_id uuid,
  p_requested_by_user_id uuid,
  p_lease_owner uuid,
  p_action_id uuid,
  p_task text,
  p_provider text,
  p_model_class text,
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
  v_now timestamptz := timezone('utc', now());
  v_config public.live_odo_configuration;
  v_session public.live_sessions;
  v_state public.live_odo_session_state;
  v_call public.live_odo_ai_usage;
  v_recent_calls bigint;
  v_session_calls bigint;
  v_input_tokens bigint;
  v_output_tokens bigint;
  v_terra_calls bigint;
  v_reason text;
begin
  if not public.live_odo_is_service_role() then
    raise exception 'live_odo_service_role_required' using errcode = '42501';
  end if;
  if p_requested_by_user_id is null or p_lease_owner is null or p_action_id is null
     or p_task not in ('director_action','conversation_spark','audience_pulse','intermission_copy')
     or p_provider not in ('openai','deterministic','fake')
     or p_model_class not in ('luna','terra','sol')
     or p_model is null or char_length(p_model) not between 1 and 120
     or p_routing_reason_code !~ '^[a-z][a-z0-9_]{0,79}$' then
    raise exception 'live_odo_invalid_begin_request' using errcode = '22023';
  end if;
  if p_model_class = 'sol' then
    return jsonb_build_object('allowed', false, 'reasonCode', 'sol_offline_only');
  end if;

  perform pg_advisory_xact_lock(hashtextextended('live_odo:' || p_session_id::text, 0));
  select * into v_config from public.live_odo_configuration where id = true for update;
  select * into v_session from public.live_sessions where id = p_session_id for update;
  if not found then return jsonb_build_object('allowed', false, 'reasonCode', 'session_missing'); end if;

  insert into public.live_odo_session_state(session_id)
  values (p_session_id)
  on conflict (session_id) do nothing;
  select * into v_state from public.live_odo_session_state
  where session_id = p_session_id for update;

  -- Expired work is fenced and recorded before a new lease is considered.
  update public.live_odo_ai_usage usage_row
  set status = 'timeout', completed_at = v_now,
      failure_reason_code = 'lease_expired_before_completion'
  where usage_row.session_id = p_session_id
    and usage_row.status = 'started'
    and usage_row.lease_generation = v_state.lease_generation
    and v_state.lease_expires_at <= v_now;

  if not v_config.odo_enabled then v_reason := 'odo_disabled';
  elsif not v_config.shadow_mode or v_config.copilot_enabled or v_config.autopilot_enabled
     or v_config.conversation_spark_enabled or v_config.audience_pulse_enabled
     or v_config.music_enabled then v_reason := 'phase10a_shadow_invariant_failed';
  elsif v_config.circuit_breaker_open then v_reason := 'circuit_breaker_open';
  elsif v_session.status <> 'live' then v_reason := 'session_not_live';
  elsif not public.has_live_capability(p_session_id, 'live.view_host_console', p_requested_by_user_id)
     and not public.is_admin_user(p_requested_by_user_id) then v_reason := 'requester_not_authorized';
  elsif v_state.lease_owner is not null
     and v_state.lease_expires_at > v_now then v_reason := 'lease_held';
  elsif v_state.last_decision_at is not null
     and v_state.last_decision_at + make_interval(secs => v_config.minimum_call_interval_seconds) > v_now
     then v_reason := 'minimum_interval';
  end if;

  select
    count(*) filter (where started_at >= date_trunc('minute', v_now)),
    count(*),
    coalesce(sum(input_tokens), 0),
    coalesce(sum(output_tokens), 0),
    count(*) filter (where model_class = 'terra')
  into v_recent_calls, v_session_calls, v_input_tokens, v_output_tokens, v_terra_calls
  from public.live_odo_ai_usage
  where session_id = p_session_id;

  if v_reason is null and v_recent_calls >= v_config.maximum_calls_per_minute then
    v_reason := 'minute_call_budget_exhausted';
  elsif v_reason is null and v_session_calls >= v_config.maximum_calls_per_session then
    v_reason := 'session_call_budget_exhausted';
  elsif v_reason is null and v_input_tokens >= v_config.maximum_input_tokens_per_session then
    v_reason := 'session_input_budget_exhausted';
  elsif v_reason is null and v_output_tokens >= v_config.maximum_output_tokens_per_session then
    v_reason := 'session_output_budget_exhausted';
  elsif v_reason is null and p_model_class = 'terra'
     and v_terra_calls >= v_config.maximum_terra_calls_per_session then
    v_reason := 'terra_budget_exhausted';
  end if;

  if v_reason is not null then
    insert into public.live_odo_trace_events(session_id, action_id, trace_type, reason_code, metadata)
    values (p_session_id, p_action_id, 'call_not_started', v_reason,
      jsonb_build_object('task', p_task, 'modelClass', p_model_class));
    return jsonb_build_object('allowed', false, 'reasonCode', v_reason);
  end if;

  update public.live_odo_session_state
  set lease_owner = p_lease_owner,
      lease_generation = lease_generation + 1,
      lease_expires_at = v_now + make_interval(secs => v_config.lease_seconds),
      lease_heartbeat_at = v_now,
      state_version = state_version + 1
  where session_id = p_session_id
  returning * into v_state;

  insert into public.live_odo_budget_windows(session_id, window_started_at, task, call_count)
  values (p_session_id, date_trunc('minute', v_now), p_task, 1)
  on conflict (session_id, window_started_at, task) do update
  set call_count = public.live_odo_budget_windows.call_count + 1,
      updated_at = v_now;

  insert into public.live_odo_ai_usage(
    action_id, session_id, requested_by_user_id, task, provider,
    model_class, model, routing_reason_code, status,
    snapshot_version, session_version, lease_owner, lease_generation,
    pricing_version, started_at
  ) values (
    p_action_id, p_session_id, p_requested_by_user_id, p_task, p_provider,
    p_model_class, p_model, p_routing_reason_code, 'started',
    v_state.state_version, v_session.version, p_lease_owner, v_state.lease_generation,
    v_config.pricing_version, v_now
  ) returning * into v_call;

  insert into public.live_odo_trace_events(session_id, call_id, action_id, trace_type, reason_code, metadata)
  values
    (p_session_id, v_call.id, p_action_id, 'lease_acquired', 'lease_acquired',
      jsonb_build_object('leaseGeneration', v_state.lease_generation)),
    (p_session_id, v_call.id, p_action_id, 'odo_model_routed', p_routing_reason_code,
      jsonb_build_object('task', p_task, 'provider', p_provider, 'modelClass', p_model_class, 'model', p_model)),
    (p_session_id, v_call.id, p_action_id, 'odo_director_call_started', 'provider_call_started', '{}'::jsonb);

  if p_model_class = 'terra' then
    insert into public.live_odo_trace_events(
      session_id, call_id, action_id, trace_type, reason_code, metadata
    ) values (
      p_session_id, v_call.id, p_action_id, 'odo_model_escalated',
      p_routing_reason_code, jsonb_build_object('task', p_task, 'model', p_model)
    );
  end if;

  return jsonb_build_object(
    'allowed', true,
    'callId', v_call.id,
    'actionId', p_action_id,
    'leaseOwner', p_lease_owner,
    'leaseGeneration', v_state.lease_generation,
    'leaseExpiresAt', v_state.lease_expires_at,
    'providerTimeoutMs', least(v_config.provider_timeout_ms,
      greatest(500, (extract(epoch from (v_state.lease_expires_at - v_now)) * 1000)::integer - 250)),
    'snapshot', public.live_odo_build_snapshot_v1(p_session_id)
  );
end;
$$;

create or replace function public.rpc_service_renew_live_odo_lease_v1(
  p_call_id uuid,
  p_lease_owner uuid,
  p_lease_generation bigint
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  v_now timestamptz := timezone('utc', now());
  v_call public.live_odo_ai_usage;
  v_config public.live_odo_configuration;
  v_state public.live_odo_session_state;
begin
  if not public.live_odo_is_service_role() then
    raise exception 'live_odo_service_role_required' using errcode = '42501';
  end if;
  select * into v_call from public.live_odo_ai_usage where id = p_call_id;
  if not found or v_call.status <> 'started' then
    return jsonb_build_object('renewed', false, 'reasonCode', 'call_not_active');
  end if;
  perform pg_advisory_xact_lock(hashtextextended('live_odo:' || v_call.session_id::text, 0));
  select * into v_config from public.live_odo_configuration where id = true;
  select * into v_state from public.live_odo_session_state
  where session_id = v_call.session_id for update;
  select * into v_call from public.live_odo_ai_usage where id = p_call_id for update;
  if not found or v_call.status <> 'started' then
    return jsonb_build_object('renewed', false, 'reasonCode', 'call_not_active');
  end if;
  if v_state.lease_owner <> p_lease_owner
     or v_state.lease_generation <> p_lease_generation
     or v_state.lease_expires_at <= v_now then
    return jsonb_build_object('renewed', false, 'reasonCode', 'stale_lease');
  end if;
  update public.live_odo_session_state
  set lease_expires_at = v_now + make_interval(secs => v_config.lease_seconds),
      lease_heartbeat_at = v_now
  where session_id = v_call.session_id
  returning * into v_state;
  return jsonb_build_object('renewed', true, 'leaseExpiresAt', v_state.lease_expires_at);
end;
$$;

create or replace function public.rpc_service_fail_live_odo_call_v1(
  p_call_id uuid,
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
  v_call public.live_odo_ai_usage;
  v_state public.live_odo_session_state;
  v_changed boolean := false;
begin
  if not public.live_odo_is_service_role() then
    raise exception 'live_odo_service_role_required' using errcode = '42501';
  end if;
  if p_failure_reason_code !~ '^[a-z][a-z0-9_]{0,119}$' then
    raise exception 'live_odo_invalid_failure_reason' using errcode = '22023';
  end if;
  select * into v_call from public.live_odo_ai_usage where id = p_call_id;
  if not found then return jsonb_build_object('recorded', false, 'reasonCode', 'call_missing'); end if;
  perform pg_advisory_xact_lock(hashtextextended('live_odo:' || v_call.session_id::text, 0));
  select * into v_state from public.live_odo_session_state
  where session_id = v_call.session_id for update;
  select * into v_call from public.live_odo_ai_usage where id = p_call_id for update;
  if not found then return jsonb_build_object('recorded', false, 'reasonCode', 'call_missing'); end if;
  if v_call.status = 'started' and v_call.lease_owner = p_lease_owner then
    update public.live_odo_ai_usage
    set status = case when p_timed_out then 'timeout' else 'failed' end,
        failure_reason_code = p_failure_reason_code,
        completed_at = timezone('utc', now())
    where id = p_call_id;
    update public.live_odo_session_state
    set lease_owner = null, lease_expires_at = null, lease_heartbeat_at = null
    where session_id = v_call.session_id
      and lease_owner = p_lease_owner
      and lease_generation = v_call.lease_generation;
    v_changed := true;
    insert into public.live_odo_trace_events(session_id, call_id, action_id, trace_type, reason_code, metadata)
    values (v_call.session_id, v_call.id, v_call.action_id,
      case when p_timed_out then 'odo_director_timeout' else 'odo_director_call_failed' end,
      p_failure_reason_code, '{}'::jsonb);
  end if;
  return jsonb_build_object('recorded', v_changed);
end;
$$;

create or replace function public.rpc_service_evaluate_live_odo_action_v1(
  p_call_id uuid,
  p_lease_owner uuid,
  p_action jsonb,
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
  v_now timestamptz := timezone('utc', now());
  v_uuid_pattern constant text := '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$';
  v_call public.live_odo_ai_usage;
  v_state public.live_odo_session_state;
  v_session public.live_sessions;
  v_config public.live_odo_configuration;
  v_existing public.live_odo_action_attempts;
  v_reason text;
  v_payload_reason text;
  v_action_id uuid;
  v_action_type text;
  v_expires_at timestamptz;
  v_active_round_id uuid;
  v_total_input bigint;
  v_total_output bigint;
  v_price jsonb;
  v_cost_micros bigint;
  v_outcome text;
begin
  if not public.live_odo_is_service_role() then
    raise exception 'live_odo_service_role_required' using errcode = '42501';
  end if;
  if p_input_tokens < 0 or p_cached_input_tokens < 0 or p_output_tokens < 0
     or p_cached_input_tokens > p_input_tokens or p_latency_ms < 0
     or char_length(coalesce(p_provider_request_id, '')) > 200
     or char_length(coalesce(p_content_gate_reason_code, '')) > 120
     or char_length(coalesce(p_provider_failure_reason_code, '')) > 120 then
    raise exception 'live_odo_invalid_provider_metadata' using errcode = '22023';
  end if;

  select * into v_call from public.live_odo_ai_usage where id = p_call_id;
  if not found then return jsonb_build_object('policyOutcome', 'rejected', 'reasonCode', 'call_missing'); end if;
  perform pg_advisory_xact_lock(hashtextextended('live_odo:' || v_call.session_id::text, 0));
  select * into v_config from public.live_odo_configuration where id = true for update;
  select * into v_session from public.live_sessions where id = v_call.session_id for update;
  select * into v_state from public.live_odo_session_state
  where session_id = v_call.session_id for update;
  select * into v_call from public.live_odo_ai_usage where id = p_call_id for update;
  if not found then return jsonb_build_object('policyOutcome', 'rejected', 'reasonCode', 'call_missing'); end if;

  select * into v_existing from public.live_odo_action_attempts where call_id = p_call_id;
  if found then
    return jsonb_build_object(
      'policyOutcome', v_existing.policy_outcome,
      'reasonCode', v_existing.policy_reason_code,
      'idempotent', true,
      'shadow', true
    );
  end if;

  if p_action is null or jsonb_typeof(p_action) <> 'object'
     or octet_length(coalesce(p_action, '{}'::jsonb)::text) > 8192
     or not public.live_odo_jsonb_has_exact_keys_v1(p_action, array[
       'schemaVersion','actionId','sessionId','snapshotVersion','leaseGeneration',
       'type','reasonCode','expiresAt','payload'
     ]) then
    v_reason := 'invalid_action_envelope';
  elsif p_action->>'actionId' !~* v_uuid_pattern
     or p_action->>'sessionId' !~* v_uuid_pattern
     or p_action->>'snapshotVersion' !~ '^[1-9][0-9]*$'
     or p_action->>'leaseGeneration' !~ '^[1-9][0-9]*$'
     or p_action->>'schemaVersion' <> '1'
     or p_action->>'reasonCode' !~ '^[a-z][a-z0-9_]{0,63}$'
     or p_action->>'expiresAt' !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$' then
    v_reason := 'invalid_action_scalar';
  else
    begin
      v_action_id := (p_action->>'actionId')::uuid;
      v_expires_at := (p_action->>'expiresAt')::timestamptz;
    exception when others then
      v_reason := 'invalid_action_scalar';
    end;
  end if;

  v_action_id := coalesce(v_action_id, v_call.action_id);
  v_action_type := coalesce(p_action->>'type', 'NO_ACTION');
  if v_reason is null then
    v_payload_reason := public.live_odo_validate_action_payload_v1(v_action_type, p_action->'payload');
    if v_payload_reason is not null then v_reason := v_payload_reason; end if;
  end if;

  if v_reason is null and (v_call.status <> 'started' or v_call.lease_owner <> p_lease_owner) then
    v_reason := 'call_not_active';
  elsif v_reason is null and (
    v_action_id <> v_call.action_id
    or (p_action->>'sessionId')::uuid <> v_call.session_id
    or (p_action->>'snapshotVersion')::bigint <> v_call.snapshot_version
    or (p_action->>'leaseGeneration')::bigint <> v_call.lease_generation
  ) then v_reason := 'action_fence_mismatch';
  elsif v_reason is null and (
    v_state.lease_owner <> p_lease_owner
    or v_state.lease_generation <> v_call.lease_generation
    or v_state.lease_expires_at <= v_now
  ) then v_reason := 'stale_or_expired_lease';
  elsif v_reason is null and (
    v_state.state_version <> v_call.snapshot_version
    or v_session.version <> v_call.session_version
  ) then v_reason := 'snapshot_stale';
  elsif v_reason is null and v_expires_at <= v_now then v_reason := 'action_expired';
  elsif v_reason is null and v_expires_at > v_state.lease_expires_at then
    v_reason := 'action_ttl_exceeds_lease';
  elsif v_reason is null and (
    not v_config.odo_enabled or not v_config.shadow_mode
    or v_config.copilot_enabled or v_config.autopilot_enabled
  ) then v_reason := 'phase10a_shadow_invariant_failed';
  elsif v_reason is null and v_config.circuit_breaker_open then v_reason := 'circuit_breaker_open';
  elsif v_reason is null and v_session.status <> 'live' then v_reason := 'session_not_live';
  elsif v_reason is null and v_state.autopilot_state in ('paused_by_host','paused_by_policy','ending','ended')
    then v_reason := 'director_paused';
  elsif v_reason is null and not p_content_gate_accepted then
    v_reason := coalesce(nullif(p_content_gate_reason_code, ''), 'content_gate_rejected');
  end if;

  select mr.id into v_active_round_id
  from public.live_match_rounds mr
  where mr.session_id = v_call.session_id
    and mr.state in ('both_accepted','public_introduction')
  order by mr.updated_at desc, mr.id
  limit 1;

  if v_reason is null and v_action_type in (
      'ANNOUNCE_PAIR','FOCUS_PAIRING','SHOW_CONVERSATION_SPARK',
      'TIME_CUE','CLOSE_ROUND','RETURN_TO_POOL'
    ) and (v_active_round_id is null
      or (p_action->'payload'->>'roundId')::uuid <> v_active_round_id) then
    v_reason := 'active_round_mismatch';
  elsif v_reason is null and v_action_type in (
      'FOCUS_PAIRING','SHOW_CONVERSATION_SPARK','TIME_CUE',
      'CLOSE_ROUND','RETURN_TO_POOL'
    ) and not exists (
      select 1 from public.live_match_rounds consented_round
      where consented_round.id = v_active_round_id
        and consented_round.session_id = v_call.session_id
        and consented_round.state = 'public_introduction'
    ) then v_reason := 'public_introduction_not_active';
  elsif v_reason is null and v_action_type = 'SHOW_CONVERSATION_SPARK'
      and not v_config.conversation_spark_enabled then v_reason := 'conversation_spark_disabled';
  elsif v_reason is null and v_action_type = 'SHOW_AUDIENCE_PULSE'
      and not v_config.audience_pulse_enabled then v_reason := 'audience_pulse_disabled';
  elsif v_reason is null and v_action_type = 'REQUEST_MUSIC_ACTION' then
    v_reason := 'music_disabled';
  elsif v_reason is null and v_action_type in (
      'SESSION_WELCOME','SHOW_INTERMISSION','SESSION_CLOSING'
    ) then v_reason := 'participant_copy_disabled';
  end if;

  select coalesce(sum(input_tokens), 0) + p_input_tokens,
         coalesce(sum(output_tokens), 0) + p_output_tokens
  into v_total_input, v_total_output
  from public.live_odo_ai_usage
  where session_id = v_call.session_id and id <> v_call.id;
  if v_reason is null and v_total_input > v_config.maximum_input_tokens_per_session then
    v_reason := 'session_input_budget_exhausted';
  elsif v_reason is null and v_total_output > v_config.maximum_output_tokens_per_session then
    v_reason := 'session_output_budget_exhausted';
  end if;

  v_outcome := case when v_reason is null then 'shadow_approved' else 'rejected' end;
  v_reason := coalesce(v_reason, 'shadow_policy_approved');

  v_price := v_config.model_pricing -> v_call.model;
  if jsonb_typeof(v_price) = 'object'
     and v_price ?& array['inputMicrosPerMillion','cachedInputMicrosPerMillion','outputMicrosPerMillion'] then
    begin
      v_cost_micros := ceil((
        greatest(0, p_input_tokens - p_cached_input_tokens)
          * (v_price->>'inputMicrosPerMillion')::numeric
        + p_cached_input_tokens * (v_price->>'cachedInputMicrosPerMillion')::numeric
        + p_output_tokens * (v_price->>'outputMicrosPerMillion')::numeric
      ) / 1000000)::bigint;
    exception when others then
      v_cost_micros := null;
    end;
  end if;

  insert into public.live_odo_action_attempts(
    action_id, call_id, session_id, schema_version, action_type, payload,
    reason_code, snapshot_version, lease_generation, expires_at,
    policy_outcome, policy_reason_code, fallback_used, evaluated_at
  ) values (
    v_action_id, v_call.id, v_call.session_id, 1, v_action_type,
    case when jsonb_typeof(p_action->'payload') = 'object' then p_action->'payload' else '{}'::jsonb end,
    case when p_action->>'reasonCode' ~ '^[a-z][a-z0-9_]{0,63}$'
      then p_action->>'reasonCode' else 'invalid_action' end,
    v_call.snapshot_version, v_call.lease_generation,
    coalesce(v_expires_at, v_now), v_outcome, v_reason, p_fallback_used, v_now
  );

  update public.live_odo_ai_usage
  set status = case
        when v_outcome = 'rejected' then 'rejected'
        when p_fallback_used then 'fallback'
        else 'succeeded'
      end,
      input_tokens = p_input_tokens,
      cached_input_tokens = p_cached_input_tokens,
      output_tokens = p_output_tokens,
      estimated_cost_micros = v_cost_micros,
      provider_request_id = nullif(p_provider_request_id, ''),
      latency_ms = p_latency_ms,
      fallback_used = p_fallback_used,
      failure_reason_code = coalesce(p_provider_failure_reason_code,
        case when v_outcome = 'rejected' then v_reason end),
      completed_at = v_now
  where id = v_call.id;

  update public.live_odo_session_state
  set lease_owner = null,
      lease_expires_at = null,
      lease_heartbeat_at = null,
      last_decision_at = v_now
  where session_id = v_call.session_id
    and lease_owner = p_lease_owner
    and lease_generation = v_call.lease_generation;

  insert into public.live_odo_trace_events(session_id, call_id, action_id, trace_type, reason_code, metadata)
  values
    (v_call.session_id, v_call.id, v_action_id,
      case
        when p_provider_failure_reason_code = 'provider_timeout' then 'odo_director_timeout'
        when p_provider_failure_reason_code is not null then 'odo_director_call_failed'
        else 'odo_director_call_succeeded'
      end,
      coalesce(p_provider_failure_reason_code, 'provider_call_completed'),
      jsonb_build_object('latencyMs', p_latency_ms, 'fallbackUsed', p_fallback_used)),
    (v_call.session_id, v_call.id, v_action_id, 'odo_action_proposed',
      coalesce(p_action->>'reasonCode', 'invalid_action'),
      jsonb_build_object('actionType', v_action_type, 'schemaVersion', 1)),
    (v_call.session_id, v_call.id, v_action_id,
      case when v_outcome = 'shadow_approved'
        then 'odo_action_shadow_approved'
        else 'odo_action_rejected_by_policy'
      end,
      v_reason, jsonb_build_object('actionType', v_action_type, 'shadow', true));

  if p_fallback_used then
    insert into public.live_odo_trace_events(
      session_id, call_id, action_id, trace_type, reason_code, metadata
    ) values (
      v_call.session_id, v_call.id, v_action_id, 'odo_fallback_used',
      coalesce(p_provider_failure_reason_code, p_content_gate_reason_code, 'fallback_used'),
      jsonb_build_object('actionType', v_action_type)
    );
  end if;

  -- Phase 10A intentionally does not append live_director_events or call any
  -- existing session, scene, matcher, pulse, music, Stream or RTC mutation RPC.
  return jsonb_build_object(
    'policyOutcome', v_outcome,
    'reasonCode', v_reason,
    'idempotent', false,
    'shadow', true,
    'actionType', v_action_type,
    'estimatedCostMicros', v_cost_micros,
    'pricingVersion', v_config.pricing_version
  );
exception when unique_violation then
  select * into v_existing from public.live_odo_action_attempts
  where action_id = v_action_id or call_id = p_call_id
  limit 1;
  return jsonb_build_object(
    'policyOutcome', coalesce(v_existing.policy_outcome, 'rejected'),
    'reasonCode', coalesce(v_existing.policy_reason_code, 'duplicate_action'),
    'idempotent', true,
    'shadow', true
  );
end;
$$;

create or replace function public.rpc_take_over_live_odo_v1(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare v_state public.live_odo_session_state;
begin
  if auth.uid() is null
     or (not public.has_live_capability(p_session_id, 'live.view_host_console', auth.uid())
       and not public.is_admin_user(auth.uid())) then
    raise exception 'live_odo_takeover_forbidden' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('live_odo:' || p_session_id::text, 0));
  insert into public.live_odo_session_state(session_id) values (p_session_id)
  on conflict (session_id) do nothing;
  update public.live_odo_session_state
  set direction_mode = 'manual', autopilot_state = 'paused_by_host',
      pause_reason_code = 'host_takeover', lease_owner = null,
      lease_expires_at = null, lease_heartbeat_at = null,
      lease_generation = lease_generation + 1, state_version = state_version + 1
  where session_id = p_session_id returning * into v_state;
  update public.live_odo_ai_usage
  set status = 'rejected', completed_at = timezone('utc', now()),
      failure_reason_code = 'host_takeover'
  where session_id = p_session_id and status = 'started';
  insert into public.live_odo_trace_events(session_id, trace_type, reason_code, metadata)
  values
    (p_session_id, 'host_takeover', 'host_takeover',
      jsonb_build_object('leaseGeneration', v_state.lease_generation)),
    (p_session_id, 'odo_autopilot_state_changed', 'host_takeover',
      jsonb_build_object('state', 'paused_by_host', 'stateVersion', v_state.state_version));
  return jsonb_build_object('takenOver', true, 'stateVersion', v_state.state_version,
    'leaseGeneration', v_state.lease_generation);
end;
$$;

create or replace function public.rpc_resume_live_odo_autopilot_v1(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare v_enabled boolean;
begin
  if auth.uid() is null
     or (not public.has_live_capability(p_session_id, 'live.view_host_console', auth.uid())
       and not public.is_admin_user(auth.uid())) then
    raise exception 'live_odo_resume_forbidden' using errcode = '42501';
  end if;
  select odo_enabled and autopilot_enabled into v_enabled
  from public.live_odo_configuration where id = true;
  if not coalesce(v_enabled, false) then
    return jsonb_build_object('resumed', false, 'reasonCode', 'autopilot_disabled_phase10a');
  end if;
  -- A later Phase 10B migration owns the actual resume transition.
  return jsonb_build_object('resumed', false, 'reasonCode', 'phase10b_required');
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
declare v_state public.live_odo_session_state;
begin
  if not public.live_odo_is_service_role() then
    raise exception 'live_odo_service_role_required' using errcode = '42501';
  end if;
  if p_reason_code !~ '^[a-z][a-z0-9_]{0,79}$' then
    raise exception 'live_odo_invalid_pause_reason' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('live_odo:' || p_session_id::text, 0));
  insert into public.live_odo_session_state(session_id) values (p_session_id)
  on conflict (session_id) do nothing;
  update public.live_odo_session_state
  set direction_mode = 'manual', autopilot_state = 'paused_by_policy',
      pause_reason_code = p_reason_code, lease_owner = null,
      lease_expires_at = null, lease_heartbeat_at = null,
      lease_generation = lease_generation + 1, state_version = state_version + 1
  where session_id = p_session_id returning * into v_state;
  update public.live_odo_ai_usage
  set status = 'rejected', completed_at = timezone('utc', now()),
      failure_reason_code = p_reason_code
  where session_id = p_session_id and status = 'started';
  insert into public.live_odo_trace_events(session_id, trace_type, reason_code, metadata)
  values
    (p_session_id, 'policy_paused', p_reason_code,
      jsonb_build_object('leaseGeneration', v_state.lease_generation)),
    (p_session_id, 'odo_autopilot_state_changed', p_reason_code,
      jsonb_build_object('state', 'paused_by_policy', 'stateVersion', v_state.state_version));
  return jsonb_build_object('paused', true, 'stateVersion', v_state.state_version,
    'leaseGeneration', v_state.lease_generation);
end;
$$;

create or replace function public.rpc_admin_update_live_odo_configuration_v1(p_patch jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare v_configuration public.live_odo_configuration;
begin
  if auth.uid() is null or not public.is_admin_user(auth.uid()) then
    raise exception 'live_odo_admin_required' using errcode = '42501';
  end if;
  if not public.live_odo_jsonb_has_exact_keys_v1(p_patch, array[]::text[], array[
      'odoEnabled','circuitBreakerOpen','minimumCallIntervalSeconds',
      'maximumCallsPerMinute','maximumCallsPerSession',
      'maximumInputTokensPerSession','maximumOutputTokensPerSession',
      'maximumTerraCallsPerSession','providerTimeoutMs','leaseSeconds',
      'pricingVersion','modelPricing'
    ]) then
    raise exception 'live_odo_configuration_patch_invalid' using errcode = '22023';
  end if;
  update public.live_odo_configuration
  set odo_enabled = case when p_patch ? 'odoEnabled' then (p_patch->>'odoEnabled')::boolean else odo_enabled end,
      circuit_breaker_open = case when p_patch ? 'circuitBreakerOpen' then (p_patch->>'circuitBreakerOpen')::boolean else circuit_breaker_open end,
      minimum_call_interval_seconds = case when p_patch ? 'minimumCallIntervalSeconds' then (p_patch->>'minimumCallIntervalSeconds')::integer else minimum_call_interval_seconds end,
      maximum_calls_per_minute = case when p_patch ? 'maximumCallsPerMinute' then (p_patch->>'maximumCallsPerMinute')::integer else maximum_calls_per_minute end,
      maximum_calls_per_session = case when p_patch ? 'maximumCallsPerSession' then (p_patch->>'maximumCallsPerSession')::integer else maximum_calls_per_session end,
      maximum_input_tokens_per_session = case when p_patch ? 'maximumInputTokensPerSession' then (p_patch->>'maximumInputTokensPerSession')::bigint else maximum_input_tokens_per_session end,
      maximum_output_tokens_per_session = case when p_patch ? 'maximumOutputTokensPerSession' then (p_patch->>'maximumOutputTokensPerSession')::bigint else maximum_output_tokens_per_session end,
      maximum_terra_calls_per_session = case when p_patch ? 'maximumTerraCallsPerSession' then (p_patch->>'maximumTerraCallsPerSession')::integer else maximum_terra_calls_per_session end,
      provider_timeout_ms = case when p_patch ? 'providerTimeoutMs' then (p_patch->>'providerTimeoutMs')::integer else provider_timeout_ms end,
      lease_seconds = case when p_patch ? 'leaseSeconds' then (p_patch->>'leaseSeconds')::integer else lease_seconds end,
      pricing_version = case when p_patch ? 'pricingVersion' then p_patch->>'pricingVersion' else pricing_version end,
      model_pricing = case when p_patch ? 'modelPricing' then p_patch->'modelPricing' else model_pricing end,
      updated_by_user_id = auth.uid()
  where id = true returning * into v_configuration;
  insert into public.live_odo_trace_events(trace_type, reason_code, metadata)
  values ('configuration_updated', 'admin_configuration_update',
    jsonb_build_object('changedKeys', (select jsonb_agg(key_name order by key_name)
      from jsonb_object_keys(p_patch) key_name)));
  return jsonb_build_object(
    'odoEnabled', v_configuration.odo_enabled,
    'shadowMode', v_configuration.shadow_mode,
    'autopilotEnabled', v_configuration.autopilot_enabled,
    'circuitBreakerOpen', v_configuration.circuit_breaker_open,
    'pricingVersion', v_configuration.pricing_version
  );
exception when invalid_text_representation or numeric_value_out_of_range or check_violation then
  raise exception 'live_odo_configuration_patch_invalid' using errcode = '22023';
end;
$$;

alter table public.live_odo_session_state validate constraint live_odo_session_lease_shape;
alter table public.live_odo_ai_usage validate constraint live_odo_usage_completion_shape;
alter table public.live_odo_action_attempts validate constraint live_odo_action_shadow_only;

revoke all on function public.live_odo_jsonb_has_exact_keys_v1(jsonb,text[],text[])
  from public, anon, authenticated;
revoke all on function public.live_odo_validate_action_payload_v1(text,jsonb)
  from public, anon, authenticated;
revoke all on function public.rpc_service_begin_live_odo_call_v1(uuid,uuid,uuid,uuid,text,text,text,text,text)
  from public, anon, authenticated;
revoke all on function public.rpc_service_renew_live_odo_lease_v1(uuid,uuid,bigint)
  from public, anon, authenticated;
revoke all on function public.rpc_service_fail_live_odo_call_v1(uuid,uuid,text,boolean)
  from public, anon, authenticated;
revoke all on function public.rpc_service_evaluate_live_odo_action_v1(uuid,uuid,jsonb,boolean,text,text,bigint,bigint,bigint,integer,boolean,text)
  from public, anon, authenticated;
revoke all on function public.rpc_service_pause_live_odo_policy_v1(uuid,text)
  from public, anon, authenticated;

grant execute on function public.live_odo_jsonb_has_exact_keys_v1(jsonb,text[],text[]) to service_role;
grant execute on function public.live_odo_validate_action_payload_v1(text,jsonb) to service_role;
grant execute on function public.rpc_service_begin_live_odo_call_v1(uuid,uuid,uuid,uuid,text,text,text,text,text)
  to service_role;
grant execute on function public.rpc_service_renew_live_odo_lease_v1(uuid,uuid,bigint)
  to service_role;
grant execute on function public.rpc_service_fail_live_odo_call_v1(uuid,uuid,text,boolean)
  to service_role;
grant execute on function public.rpc_service_evaluate_live_odo_action_v1(uuid,uuid,jsonb,boolean,text,text,bigint,bigint,bigint,integer,boolean,text)
  to service_role;
grant execute on function public.rpc_service_pause_live_odo_policy_v1(uuid,text)
  to service_role;

revoke all on function public.rpc_take_over_live_odo_v1(uuid),
  public.rpc_resume_live_odo_autopilot_v1(uuid),
  public.rpc_admin_update_live_odo_configuration_v1(jsonb),
  public.rpc_get_live_director_snapshot_v1(uuid,bigint,integer),
  public.rpc_get_live_odo_admin_trace_v1(uuid,integer)
from public, anon;
grant execute on function public.rpc_take_over_live_odo_v1(uuid),
  public.rpc_resume_live_odo_autopilot_v1(uuid),
  public.rpc_admin_update_live_odo_configuration_v1(jsonb),
  public.rpc_get_live_director_snapshot_v1(uuid,bigint,integer),
  public.rpc_get_live_odo_admin_trace_v1(uuid,integer)
to authenticated, service_role;

comment on function public.rpc_service_begin_live_odo_call_v1(uuid,uuid,uuid,uuid,text,text,text,text,text) is
  'Short transaction: authorize, budget, acquire fenced lease and return a content-minimized snapshot.';
comment on function public.rpc_service_evaluate_live_odo_action_v1(uuid,uuid,jsonb,boolean,text,text,bigint,bigint,bigint,integer,boolean,text) is
  'New short transaction: rebuild and revalidate current state, then persist a shadow-only policy outcome.';

commit;
