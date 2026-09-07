-- Phase 10A protocol hardening: explicit event visibility, Studio wire names,
-- and task-scoped budget enforcement. Still additive and shadow-only.

begin;

alter table public.live_director_events
  add column if not exists visibility text not null default 'internal',
  add column if not exists action_id uuid,
  add column if not exists expires_at timestamptz;

alter table public.live_director_events
  drop constraint if exists live_director_events_source_check;
alter table public.live_director_events
  drop constraint if exists live_director_events_visibility_check;
alter table public.live_director_events
  drop constraint if exists live_director_events_expiry_check;
alter table public.live_director_events
  add constraint live_director_events_source_check
  check (source in ('odo','host','system','moderator'));
alter table public.live_director_events
  add constraint live_director_events_visibility_check
  check (visibility in ('participant','host','moderator','admin','internal'));
alter table public.live_director_events
  add constraint live_director_events_expiry_check
  check (expires_at is null or expires_at > occurred_at);

alter table public.live_odo_configuration
  add column if not exists task_call_limits_per_minute jsonb not null default
    '{"director_action":4,"conversation_spark":2,"audience_pulse":2,"intermission_copy":2}'::jsonb;
alter table public.live_odo_configuration
  drop constraint if exists live_odo_task_call_limits_shape;
alter table public.live_odo_configuration
  add constraint live_odo_task_call_limits_shape check (
    jsonb_typeof(task_call_limits_per_minute) = 'object'
    and task_call_limits_per_minute ?& array[
      'director_action','conversation_spark','audience_pulse','intermission_copy'
    ]
  );

create or replace function public.live_odo_enforce_task_budget_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  v_limit_text text;
  v_limit integer;
  v_calls integer;
begin
  select task_call_limits_per_minute->>new.task
  into v_limit_text
  from public.live_odo_configuration
  where id = true;

  if v_limit_text is null or v_limit_text !~ '^[1-9][0-9]?$' then
    raise exception 'live_odo_task_budget_configuration_invalid' using errcode = '22023';
  end if;
  v_limit := v_limit_text::integer;
  if v_limit not between 1 and 60 then
    raise exception 'live_odo_task_budget_configuration_invalid' using errcode = '22023';
  end if;

  select count(*)::integer into v_calls
  from public.live_odo_ai_usage usage_row
  where usage_row.session_id = new.session_id
    and usage_row.task = new.task
    and usage_row.started_at >= date_trunc('minute', new.started_at);
  if v_calls >= v_limit then
    raise exception 'live_odo_task_budget_exhausted' using errcode = '54000';
  end if;
  return new;
end;
$$;

drop trigger if exists live_odo_ai_usage_task_budget_guard
on public.live_odo_ai_usage;
create trigger live_odo_ai_usage_task_budget_guard
before insert on public.live_odo_ai_usage
for each row execute function public.live_odo_enforce_task_budget_v1();

create or replace function public.live_odo_build_snapshot_v1(p_session_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
  with session_row as (
    select s.id, s.status, s.version
    from public.live_sessions s
    where s.id = p_session_id
  ), state_row as (
    select os.* from public.live_odo_session_state os
    where os.session_id = p_session_id
  ), active_round as (
    select mr.id
    from public.live_match_rounds mr
    where mr.session_id = p_session_id
      and mr.state in ('both_accepted','public_introduction')
    order by mr.updated_at desc, mr.id
    limit 1
  ), counts as (
    select
      count(*) filter (where lp.state not in ('left','removed','banned'))::integer as participants,
      count(*) filter (where lp.state = 'audience')::integer as audience
    from public.live_participants lp
    where lp.session_id = p_session_id
  ), configuration as (
    select c.* from public.live_odo_configuration c where c.id = true
  )
  select jsonb_build_object(
    'schemaVersion', 1,
    'sessionId', session_row.id,
    'sessionVersion', session_row.version,
    'currentStateVersion', state_row.state_version,
    'latestSequenceNumber', state_row.latest_sequence,
    'currentScene', state_row.current_scene,
    'directionMode', state_row.direction_mode,
    'autopilotState', state_row.autopilot_state,
    'sessionStatus', session_row.status,
    'activeRoundId', (select id from active_round),
    'participantCount', coalesce(counts.participants, 0),
    'audienceCount', coalesce(counts.audience, 0),
    'policyFlags', jsonb_build_object(
      'odoEnabled', configuration.odo_enabled,
      'shadowMode', configuration.shadow_mode,
      'copilotEnabled', configuration.copilot_enabled,
      'autopilotEnabled', configuration.autopilot_enabled,
      'conversationSparkEnabled', configuration.conversation_spark_enabled,
      'audiencePulseEnabled', configuration.audience_pulse_enabled,
      'musicEnabled', configuration.music_enabled,
      'circuitBreakerOpen', configuration.circuit_breaker_open
    )
  )
  from session_row
  join state_row on true
  cross join counts
  cross join configuration;
$$;

drop function if exists public.live_odo_append_director_event_v1(
  uuid,integer,text,text,uuid,jsonb
);
create or replace function public.live_odo_append_director_event_v1(
  p_session_id uuid,
  p_schema_version integer,
  p_event_type text,
  p_source text,
  p_visibility text,
  p_action_id uuid,
  p_idempotency_key uuid,
  p_payload jsonb,
  p_expires_at timestamptz default null
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
  if p_source = 'odo' then
    raise exception 'live_odo_phase10a_shadow_only' using errcode = '55000';
  end if;
  if p_schema_version < 1 or p_event_type is null
     or char_length(p_event_type) not between 1 and 80
     or p_source not in ('host','system','moderator')
     or p_visibility not in ('participant','host','moderator','admin','internal')
     or jsonb_typeof(coalesce(p_payload, '{}'::jsonb)) <> 'object'
     or octet_length(coalesce(p_payload, '{}'::jsonb)::text) > 8192
     or (p_expires_at is not null and p_expires_at <= timezone('utc', now())) then
    raise exception 'live_odo_invalid_director_event' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('live_odo:' || p_session_id::text, 0));
  select * into v_state from public.live_odo_session_state
  where session_id = p_session_id for update;
  if not found then raise exception 'live_odo_state_missing' using errcode = 'P0002'; end if;

  if p_idempotency_key is not null then
    select * into v_event from public.live_director_events
    where session_id = p_session_id and idempotency_key = p_idempotency_key;
    if found then return v_event; end if;
  end if;

  update public.live_odo_session_state
  set latest_sequence = latest_sequence + 1,
      state_version = state_version + 1
  where session_id = p_session_id
  returning * into v_state;

  insert into public.live_director_events(
    session_id, schema_version, sequence, state_version, event_type, source,
    visibility, action_id, idempotency_key, payload, expires_at
  ) values (
    p_session_id, p_schema_version, v_state.latest_sequence,
    v_state.state_version, p_event_type, p_source, p_visibility, p_action_id,
    p_idempotency_key, coalesce(p_payload, '{}'::jsonb), p_expires_at
  ) returning * into v_event;

  insert into public.live_director_updates(session_id, version, latest_sequence, updated_at)
  values (p_session_id, 1, v_state.latest_sequence, timezone('utc', now()))
  on conflict (session_id) do update
  set version = public.live_director_updates.version + 1,
      latest_sequence = excluded.latest_sequence,
      updated_at = excluded.updated_at;
  return v_event;
end;
$$;

create or replace function public.rpc_get_live_director_snapshot_v1(
  p_session_id uuid,
  p_after_sequence bigint default 0,
  p_limit integer default 100
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  v_snapshot jsonb;
  v_is_admin boolean;
  v_is_host boolean;
  v_is_moderator boolean;
begin
  if auth.uid() is null or not public.can_view_live_session(p_session_id, auth.uid()) then
    raise exception 'live_director_snapshot_forbidden' using errcode = '42501';
  end if;
  if p_after_sequence < 0 or p_limit not between 1 and 200 then
    raise exception 'live_director_snapshot_invalid_request' using errcode = '22023';
  end if;
  v_is_admin := public.is_admin_user(auth.uid());
  v_is_host := v_is_admin
    or public.has_live_capability(p_session_id, 'live.view_host_console', auth.uid());
  v_is_moderator := v_is_admin
    or public.has_live_capability(p_session_id, 'live.mute_public_participant', auth.uid());

  select public.live_odo_build_snapshot_v1(p_session_id) into v_snapshot;
  if v_snapshot is null then raise exception 'live_odo_state_missing' using errcode = 'P0002'; end if;
  return jsonb_build_object(
    'snapshot', v_snapshot,
    'events', coalesce((
      select jsonb_agg(jsonb_build_object(
        'schemaVersion', e.schema_version,
        'sequenceNumber', e.sequence,
        'eventId', e.id,
        'sessionId', e.session_id,
        'eventType', e.event_type,
        'source', e.source,
        'visibility', e.visibility,
        'actionId', e.action_id,
        'stateVersion', e.state_version,
        'occurredAt', e.occurred_at,
        'createdAt', e.created_at,
        'expiresAt', e.expires_at,
        'payload', e.payload
      ) order by e.sequence)
      from (
        select * from public.live_director_events candidate
        where candidate.session_id = p_session_id
          and candidate.sequence > p_after_sequence
          and (candidate.expires_at is null
            or candidate.expires_at > timezone('utc', now()))
          and (
            candidate.visibility = 'participant'
            or (candidate.visibility = 'host' and v_is_host)
            or (candidate.visibility = 'moderator' and v_is_moderator)
            or (candidate.visibility = 'admin' and v_is_admin)
          )
        order by candidate.sequence
        limit p_limit
      ) e
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.rpc_admin_update_live_odo_configuration_v1(p_patch jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  v_configuration public.live_odo_configuration;
  v_task text;
  v_task_limit text;
begin
  if auth.uid() is null or not public.is_admin_user(auth.uid()) then
    raise exception 'live_odo_admin_required' using errcode = '42501';
  end if;
  if not public.live_odo_jsonb_has_exact_keys_v1(p_patch, array[]::text[], array[
      'odoEnabled','circuitBreakerOpen','minimumCallIntervalSeconds',
      'maximumCallsPerMinute','maximumCallsPerSession',
      'maximumInputTokensPerSession','maximumOutputTokensPerSession',
      'maximumTerraCallsPerSession','providerTimeoutMs','leaseSeconds',
      'pricingVersion','modelPricing','taskCallLimitsPerMinute'
    ]) then
    raise exception 'live_odo_configuration_patch_invalid' using errcode = '22023';
  end if;
  if p_patch ? 'taskCallLimitsPerMinute' then
    if jsonb_typeof(p_patch->'taskCallLimitsPerMinute') <> 'object'
       or not (p_patch->'taskCallLimitsPerMinute') ?& array[
         'director_action','conversation_spark','audience_pulse','intermission_copy'
       ] then
      raise exception 'live_odo_configuration_patch_invalid' using errcode = '22023';
    end if;
    for v_task, v_task_limit in
      select key, value #>> '{}' from jsonb_each(p_patch->'taskCallLimitsPerMinute')
    loop
      if v_task not in ('director_action','conversation_spark','audience_pulse','intermission_copy')
         or v_task_limit !~ '^[1-9][0-9]?$'
         or v_task_limit::integer not between 1 and 60 then
        raise exception 'live_odo_configuration_patch_invalid' using errcode = '22023';
      end if;
    end loop;
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
      task_call_limits_per_minute = case when p_patch ? 'taskCallLimitsPerMinute'
        then p_patch->'taskCallLimitsPerMinute' else task_call_limits_per_minute end,
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
    'pricingVersion', v_configuration.pricing_version,
    'taskCallLimitsPerMinute', v_configuration.task_call_limits_per_minute
  );
exception when invalid_text_representation or numeric_value_out_of_range or check_violation then
  raise exception 'live_odo_configuration_patch_invalid' using errcode = '22023';
end;
$$;

revoke all on function public.live_odo_enforce_task_budget_v1()
  from public, anon, authenticated, service_role;
revoke all on function public.live_odo_append_director_event_v1(
  uuid,integer,text,text,text,uuid,uuid,jsonb,timestamptz
) from public, anon, authenticated, service_role;

comment on column public.live_director_events.visibility is
  'Capability-filtered Director protocol visibility; internal events are never returned to clients.';
comment on function public.live_odo_append_director_event_v1(
  uuid,integer,text,text,text,uuid,uuid,jsonb,timestamptz
) is 'Private ordered-event primitive. Odo source remains hard-disabled during Phase 10A.';

commit;
