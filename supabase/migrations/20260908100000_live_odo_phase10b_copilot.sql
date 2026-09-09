-- Betweener Live Phase 10B: Host-controlled Odo Copilot.
-- Suggestions are private to authorized Hosts and cannot change participant
-- state until a fresh, authenticated Host use request passes policy again.

begin;

alter table public.live_odo_configuration
  add column if not exists pair_narration_enabled boolean not null default false,
  add column if not exists scene_suggestions_enabled boolean not null default false,
  add column if not exists transition_copy_enabled boolean not null default false;

alter table public.live_odo_configuration
  drop constraint if exists live_odo_phase10a_shadow_invariant,
  drop constraint if exists live_odo_phase10b_human_loop_invariant;
alter table public.live_odo_configuration
  add constraint live_odo_phase10b_human_loop_invariant check (
    shadow_mode
    and not autopilot_enabled
    and not music_enabled
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
  );

update public.live_odo_configuration
set task_call_limits_per_minute = task_call_limits_per_minute || jsonb_build_object(
  'pair_narration', 2,
  'scene_suggestion', 2,
  'transition_copy', 2,
  'session_welcome', 1,
  'session_closing', 1
)
where id = true;

alter table public.live_odo_configuration
  drop constraint if exists live_odo_task_call_limits_shape;
alter table public.live_odo_configuration
  add constraint live_odo_task_call_limits_shape check (
    jsonb_typeof(task_call_limits_per_minute) = 'object'
    and task_call_limits_per_minute ?& array[
      'director_action','conversation_spark','audience_pulse','intermission_copy',
      'pair_narration','scene_suggestion','transition_copy',
      'session_welcome','session_closing'
    ]
  );

alter table public.live_odo_ai_usage
  drop constraint if exists live_odo_ai_usage_task_check;
alter table public.live_odo_ai_usage
  add constraint live_odo_ai_usage_task_check check (task in (
    'director_action','conversation_spark','audience_pulse','intermission_copy',
    'pair_narration','scene_suggestion','transition_copy',
    'session_welcome','session_closing'
  ));
alter table public.live_odo_ai_usage
  add column if not exists round_id uuid,
  add column if not exists round_version bigint;
alter table public.live_odo_ai_usage
  drop constraint if exists live_odo_ai_usage_round_version_check;
alter table public.live_odo_ai_usage
  add constraint live_odo_ai_usage_round_version_check
  check (round_version is null or round_version > 0);

alter table public.live_odo_budget_windows
  drop constraint if exists live_odo_budget_windows_task_check;
alter table public.live_odo_budget_windows
  add constraint live_odo_budget_windows_task_check check (task in (
    'director_action','conversation_spark','audience_pulse','intermission_copy',
    'pair_narration','scene_suggestion','transition_copy',
    'session_welcome','session_closing'
  ));

create table if not exists public.live_odo_copilot_suggestions (
  id uuid primary key default gen_random_uuid(),
  call_id uuid not null unique references public.live_odo_ai_usage(id) on delete cascade,
  action_id uuid not null unique,
  session_id uuid not null references public.live_sessions(id) on delete cascade,
  requested_by_user_id uuid not null references auth.users(id) on delete restrict,
  task text not null check (task in (
    'conversation_spark','audience_pulse','pair_narration','scene_suggestion',
    'transition_copy','session_welcome','session_closing'
  )),
  suggestion_type text not null check (suggestion_type in (
    'conversation_spark','audience_pulse','pair_introduction','scene_suggestion',
    'transition_copy','session_welcome','session_closing','no_action'
  )),
  status text not null default 'ready' check (status in (
    'ready','used','dismissed','superseded','expired'
  )),
  reason_code text not null check (reason_code ~ '^[a-z][a-z0-9_]{0,79}$'),
  title text not null check (char_length(title) between 1 and 80),
  rationale text not null check (char_length(rationale) between 1 and 240),
  payload jsonb not null default '{}'::jsonb check (
    jsonb_typeof(payload) = 'object' and octet_length(payload::text) <= 4096
  ),
  round_id uuid,
  snapshot_version bigint not null check (snapshot_version > 0),
  session_version bigint not null check (session_version > 0),
  state_version bigint not null check (state_version > 0),
  round_version bigint check (round_version is null or round_version > 0),
  fallback_used boolean not null default false,
  content_gate_reason_code text not null check (
    char_length(content_gate_reason_code) between 1 and 120
  ),
  created_at timestamptz not null default timezone('utc', now()),
  expires_at timestamptz not null,
  used_at timestamptz,
  dismissed_at timestamptz,
  superseded_at timestamptz,
  constraint live_odo_copilot_suggestion_expiry check (expires_at > created_at),
  constraint live_odo_copilot_suggestion_status_shape check (
    (status = 'ready' and used_at is null and dismissed_at is null and superseded_at is null)
    or (status = 'used' and used_at is not null)
    or (status = 'dismissed' and dismissed_at is not null)
    or (status = 'superseded' and superseded_at is not null)
    or status = 'expired'
  )
);

create index if not exists live_odo_copilot_session_ready_idx
  on public.live_odo_copilot_suggestions(session_id, created_at desc)
  where status = 'ready';
create index if not exists live_odo_copilot_round_ready_idx
  on public.live_odo_copilot_suggestions(round_id, created_at desc)
  where status = 'ready' and round_id is not null;

alter table public.live_odo_copilot_suggestions enable row level security;
revoke all on table public.live_odo_copilot_suggestions
  from public, anon, authenticated, service_role;

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
  -- Deterministic fallbacks do not consume an AI-call budget.
  if new.provider = 'deterministic' then return new; end if;
  select task_call_limits_per_minute->>new.task into v_limit_text
  from public.live_odo_configuration where id = true;
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
    and usage_row.provider <> 'deterministic'
    and usage_row.started_at >= date_trunc('minute', new.started_at);
  if v_calls >= v_limit then
    raise exception 'live_odo_task_budget_exhausted' using errcode = '54000';
  end if;
  return new;
end;
$$;

create or replace function public.rpc_get_live_odo_copilot_v1(
  p_session_id uuid,
  p_limit integer default 20
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  v_config public.live_odo_configuration;
  v_state public.live_odo_session_state;
  v_authorized boolean;
begin
  if auth.uid() is null or p_limit not between 1 and 50 then
    raise exception 'live_odo_copilot_request_invalid' using errcode = '22023';
  end if;
  v_authorized := public.is_admin_user(auth.uid()) or public.has_live_capability(
    p_session_id, 'live.view_host_console', auth.uid()
  );
  if not v_authorized then
    raise exception 'live_odo_copilot_host_required' using errcode = '42501';
  end if;
  with expired as (
    update public.live_odo_copilot_suggestions suggestion
    set status = 'expired'
    where suggestion.session_id = p_session_id
      and suggestion.status = 'ready'
      and suggestion.expires_at <= timezone('utc', now())
    returning suggestion.*
  )
  insert into public.live_odo_trace_events(
    session_id, call_id, action_id, trace_type, reason_code, metadata
  ) select session_id, call_id, action_id, 'odo_copilot_suggestion_expired',
    'suggestion_ttl_elapsed', jsonb_build_object('task',task,'suggestionId',id)
  from expired;
  select * into v_config from public.live_odo_configuration where id = true;
  select * into v_state from public.live_odo_session_state where session_id = p_session_id;
  if v_state.session_id is null then
    raise exception 'live_odo_state_missing' using errcode = 'P0002';
  end if;
  return jsonb_build_object(
    'schemaVersion', 1,
    'enabled', public.live_odo_copilot_task_enabled_v1(v_config, 'transition_copy')
      or public.live_odo_copilot_task_enabled_v1(v_config, 'conversation_spark')
      or public.live_odo_copilot_task_enabled_v1(v_config, 'audience_pulse')
      or public.live_odo_copilot_task_enabled_v1(v_config, 'pair_narration')
      or public.live_odo_copilot_task_enabled_v1(v_config, 'scene_suggestion'),
    'temporarilyUnavailable', v_config.circuit_breaker_open,
    'unavailableReason', case when v_config.circuit_breaker_open
      then 'circuit_breaker_open' else null end,
    'directionMode', v_state.direction_mode,
    'currentScene', v_state.current_scene,
    'features', jsonb_build_object(
      'conversationSpark', public.live_odo_copilot_task_enabled_v1(v_config, 'conversation_spark'),
      'audiencePulse', public.live_odo_copilot_task_enabled_v1(v_config, 'audience_pulse'),
      'pairNarration', public.live_odo_copilot_task_enabled_v1(v_config, 'pair_narration'),
      'sceneSuggestions', public.live_odo_copilot_task_enabled_v1(v_config, 'scene_suggestion'),
      'transitionCopy', public.live_odo_copilot_task_enabled_v1(v_config, 'transition_copy')
    ),
    'suggestions', coalesce((
      select jsonb_agg(public.live_odo_copilot_suggestion_json_v1(candidate)
        order by candidate.created_at desc)
      from (
        select * from public.live_odo_copilot_suggestions suggestion
        where suggestion.session_id = p_session_id
          and suggestion.status = 'ready'
          and suggestion.expires_at > timezone('utc', now())
          and suggestion.suggestion_type <> 'no_action'
        order by suggestion.created_at desc limit p_limit
      ) candidate
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.rpc_manage_live_odo_copilot_suggestion_v1(
  p_suggestion_id uuid,
  p_action text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  v_now timestamptz := timezone('utc', now());
  v_suggestion public.live_odo_copilot_suggestions;
begin
  if auth.uid() is null or p_action not in ('shown','dismiss','regenerate') then
    raise exception 'live_odo_copilot_feedback_invalid' using errcode = '22023';
  end if;
  select * into v_suggestion from public.live_odo_copilot_suggestions
  where id = p_suggestion_id for update;
  if v_suggestion.id is null then
    raise exception 'live_odo_copilot_suggestion_missing' using errcode = 'P0002';
  end if;
  if not public.is_admin_user(auth.uid()) and not public.has_live_capability(
    v_suggestion.session_id, 'live.view_host_console', auth.uid()
  ) then raise exception 'live_odo_copilot_host_required' using errcode = '42501'; end if;

  if p_action = 'dismiss' and v_suggestion.status = 'ready' then
    update public.live_odo_copilot_suggestions
    set status = 'dismissed', dismissed_at = v_now
    where id = v_suggestion.id returning * into v_suggestion;
  elsif p_action = 'regenerate' and v_suggestion.status = 'ready' then
    update public.live_odo_copilot_suggestions
    set status = 'superseded', superseded_at = v_now
    where id = v_suggestion.id returning * into v_suggestion;
  end if;
  insert into public.live_odo_trace_events(
    session_id, call_id, action_id, trace_type, reason_code, metadata
  ) values (
    v_suggestion.session_id, v_suggestion.call_id, v_suggestion.action_id,
    'odo_copilot_suggestion_' || case p_action
      when 'dismiss' then 'dismissed'
      when 'regenerate' then 'regenerated'
      else 'shown' end,
    'host_' || p_action,
    jsonb_build_object('suggestionId',v_suggestion.id,'task',v_suggestion.task)
  );
  return jsonb_build_object('ok', true, 'status', v_suggestion.status,
    'task', v_suggestion.task, 'roundId', v_suggestion.round_id);
end;
$$;

create or replace function public.live_odo_append_host_copilot_event_v1(
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
  if auth.uid() is null or not (
    public.is_admin_user(auth.uid()) or public.has_live_capability(
      p_session_id, 'live.view_host_console', auth.uid()
    )
  ) then raise exception 'live_odo_copilot_host_required' using errcode = '42501'; end if;
  if p_event_type not in (
      'CONVERSATION_SPARK_PUBLISHED','AUDIENCE_PULSE_LAUNCHED',
      'PAIR_INTRODUCTION_PUBLISHED','SCENE_CHANGED','TRANSITION_COPY_PUBLISHED',
      'SESSION_WELCOME_PUBLISHED','SESSION_CLOSING_PUBLISHED'
    ) or p_action_id is null or jsonb_typeof(p_payload) <> 'object'
    or octet_length(p_payload::text) > 4096
    or p_payload::text ~* '(https?://|wss?://|rpc_[a-z0-9_]+|<script|service[_ -]?role|api[_ -]?key|access[_ -]?token)'
    or p_expires_at <= timezone('utc', now()) then
    raise exception 'live_odo_copilot_event_invalid' using errcode = '22023';
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
  set latest_sequence = latest_sequence + 1, state_version = state_version + 1
  where session_id = p_session_id returning * into v_state;
  insert into public.live_director_events(
    session_id, schema_version, sequence, state_version, event_type, source,
    visibility, action_id, idempotency_key, payload, expires_at
  ) values (
    p_session_id, 1, v_state.latest_sequence, v_state.state_version,
    p_event_type, 'host', 'participant', p_action_id, p_action_id,
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

create or replace function public.rpc_use_live_odo_copilot_suggestion_v1(
  p_suggestion_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  v_now timestamptz := timezone('utc', now());
  v_suggestion public.live_odo_copilot_suggestions;
  v_config public.live_odo_configuration;
  v_session public.live_sessions;
  v_state public.live_odo_session_state;
  v_round_version bigint;
  v_round_state text;
  v_round_kind text;
  v_event_type text;
  v_event_payload jsonb;
  v_result jsonb;
begin
  if auth.uid() is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  select * into v_suggestion from public.live_odo_copilot_suggestions
  where id = p_suggestion_id;
  if v_suggestion.id is null then
    raise exception 'live_odo_copilot_suggestion_missing' using errcode = 'P0002';
  end if;
  if not public.is_admin_user(auth.uid()) and not public.has_live_capability(
    v_suggestion.session_id, 'live.view_host_console', auth.uid()
  ) then raise exception 'live_odo_copilot_host_required' using errcode = '42501'; end if;

  perform pg_advisory_xact_lock(hashtextextended(
    'live_odo:' || v_suggestion.session_id::text, 0
  ));
  select * into v_suggestion from public.live_odo_copilot_suggestions
    where id = p_suggestion_id for update;
  if v_suggestion.status = 'used' then
    return jsonb_build_object('ok', true, 'idempotent', true,
      'suggestion', public.live_odo_copilot_suggestion_json_v1(v_suggestion));
  end if;
  select * into v_config from public.live_odo_configuration where id = true for update;
  select * into v_session from public.live_sessions
    where id = v_suggestion.session_id for update;
  select * into v_state from public.live_odo_session_state
    where session_id = v_suggestion.session_id for update;

  if v_suggestion.status <> 'ready' then
    raise exception 'live_odo_copilot_suggestion_not_ready' using errcode = '23514';
  elsif v_suggestion.expires_at <= v_now then
    update public.live_odo_copilot_suggestions set status = 'expired'
    where id = v_suggestion.id returning * into v_suggestion;
    insert into public.live_odo_trace_events(
      session_id, call_id, action_id, trace_type, reason_code, metadata
    ) values (v_suggestion.session_id,v_suggestion.call_id,v_suggestion.action_id,
      'odo_copilot_suggestion_expired','suggestion_ttl_elapsed',
      jsonb_build_object('task',v_suggestion.task,'suggestionId',v_suggestion.id));
    return jsonb_build_object('ok',false,'reasonCode','suggestion_expired');
  elsif v_session.status <> 'live' then
    raise exception 'live_odo_copilot_session_not_live' using errcode = '23514';
  elsif v_config.circuit_breaker_open
    or not public.live_odo_copilot_task_enabled_v1(v_config, v_suggestion.task) then
    raise exception 'live_odo_copilot_disabled' using errcode = '23514';
  elsif v_session.version <> v_suggestion.session_version
    or v_state.state_version <> v_suggestion.state_version then
    update public.live_odo_copilot_suggestions
    set status = 'superseded', superseded_at = v_now
    where id = v_suggestion.id returning * into v_suggestion;
    insert into public.live_odo_trace_events(
      session_id, call_id, action_id, trace_type, reason_code, metadata
    ) values (v_suggestion.session_id,v_suggestion.call_id,v_suggestion.action_id,
      'odo_copilot_suggestion_superseded','authoritative_state_changed',
      jsonb_build_object('task',v_suggestion.task,'suggestionId',v_suggestion.id));
    return jsonb_build_object('ok',false,'reasonCode','suggestion_stale');
  elsif v_suggestion.content_gate_reason_code not in (
      'content_safe','content_not_present','content_replaced'
    ) or v_suggestion.payload::text ~*
      '(https?://|wss?://|rpc_[a-z0-9_]+|<script|service[_ -]?role|api[_ -]?key|access[_ -]?token)' then
    raise exception 'live_odo_copilot_content_rejected' using errcode = '23514';
  end if;

  if v_suggestion.round_id is not null then
    select r.version, r.state, 'hosted' into v_round_version, v_round_state, v_round_kind
    from public.live_match_rounds r
    where r.id = v_suggestion.round_id and r.session_id = v_suggestion.session_id;
    if v_round_version is distinct from v_suggestion.round_version
      or v_round_kind <> 'hosted'
      or (v_suggestion.task = 'pair_narration'
        and v_round_state <> 'public_introduction')
      or (v_suggestion.task = 'conversation_spark'
        and v_round_state not in ('both_accepted','public_introduction')) then
      update public.live_odo_copilot_suggestions
      set status = 'superseded', superseded_at = v_now
      where id = v_suggestion.id returning * into v_suggestion;
      insert into public.live_odo_trace_events(
        session_id, call_id, action_id, trace_type, reason_code, metadata
      ) values (v_suggestion.session_id,v_suggestion.call_id,v_suggestion.action_id,
        'odo_copilot_suggestion_superseded','authoritative_round_changed',
        jsonb_build_object('task',v_suggestion.task,'suggestionId',v_suggestion.id));
      return jsonb_build_object('ok',false,'reasonCode','round_stale');
    end if;
  end if;

  if v_suggestion.suggestion_type = 'conversation_spark' then
    update public.live_match_rounds set conversation_spark = v_suggestion.payload
    where id = v_suggestion.round_id and session_id = v_suggestion.session_id;
    -- The existing round projection is pair-scoped. Do not duplicate its
    -- payload into the room-wide Director stream.
    v_event_type := null;
  elsif v_suggestion.suggestion_type = 'audience_pulse' then
    v_result := public.rpc_open_live_audience_poll(
      v_suggestion.session_id,
      v_suggestion.payload->>'templateKey',
      v_suggestion.action_id,
      (v_suggestion.payload->>'durationSeconds')::integer
    );
    -- Audience Pulse owns its bounded aggregate projection and Realtime
    -- invalidation. A second Director event would be duplicate state.
    v_event_type := null;
  elsif v_suggestion.suggestion_type = 'pair_introduction' then
    v_event_type := 'PAIR_INTRODUCTION_PUBLISHED';
    v_event_payload := v_suggestion.payload || jsonb_build_object('roundId',v_suggestion.round_id);
  elsif v_suggestion.suggestion_type = 'scene_suggestion' then
    update public.live_odo_session_state
    set current_scene = v_suggestion.payload->>'scene'
    where session_id = v_suggestion.session_id;
    v_event_type := 'SCENE_CHANGED'; v_event_payload := v_suggestion.payload;
  elsif v_suggestion.suggestion_type = 'transition_copy' then
    v_event_type := 'TRANSITION_COPY_PUBLISHED'; v_event_payload := v_suggestion.payload;
  elsif v_suggestion.suggestion_type = 'session_welcome' then
    v_event_type := 'SESSION_WELCOME_PUBLISHED'; v_event_payload := v_suggestion.payload;
  elsif v_suggestion.suggestion_type = 'session_closing' then
    v_event_type := 'SESSION_CLOSING_PUBLISHED'; v_event_payload := v_suggestion.payload;
  else
    raise exception 'live_odo_copilot_suggestion_not_actionable' using errcode = '23514';
  end if;

  if v_event_type is not null then
    perform public.live_odo_append_host_copilot_event_v1(
      v_suggestion.session_id, v_event_type, v_suggestion.action_id,
      v_event_payload, v_now + interval '15 minutes'
    );
  end if;
  update public.live_odo_copilot_suggestions
  set status = 'used', used_at = v_now
  where id = v_suggestion.id returning * into v_suggestion;
  insert into public.live_odo_trace_events(
    session_id, call_id, action_id, trace_type, reason_code, metadata
  ) values (
    v_suggestion.session_id, v_suggestion.call_id, v_suggestion.action_id,
    'odo_copilot_suggestion_accepted', 'host_approved',
    jsonb_build_object('suggestionId',v_suggestion.id,'task',v_suggestion.task,
      'type',v_suggestion.suggestion_type,'eventType',v_event_type)
  );
  return jsonb_build_object('ok', true, 'eventType', v_event_type,
    'suggestion', public.live_odo_copilot_suggestion_json_v1(v_suggestion),
    'result', v_result);
end;
$$;

create or replace function public.live_odo_copilot_suggestion_json_v1(
  p_suggestion public.live_odo_copilot_suggestions
)
returns jsonb
language sql
stable
set search_path = public, pg_catalog
as $$
  select jsonb_build_object(
    'schemaVersion', 1,
    'id', p_suggestion.id,
    'sessionId', p_suggestion.session_id,
    'task', p_suggestion.task,
    'type', p_suggestion.suggestion_type,
    'status', case when p_suggestion.status = 'ready'
      and p_suggestion.expires_at <= timezone('utc', now()) then 'expired'
      else p_suggestion.status end,
    'reasonCode', p_suggestion.reason_code,
    'title', p_suggestion.title,
    'rationale', p_suggestion.rationale,
    'payload', p_suggestion.payload,
    'roundId', p_suggestion.round_id,
    'snapshotVersion', p_suggestion.snapshot_version,
    'sessionVersion', p_suggestion.session_version,
    'stateVersion', p_suggestion.state_version,
    'roundVersion', p_suggestion.round_version,
    'fallbackUsed', p_suggestion.fallback_used,
    'createdAt', p_suggestion.created_at,
    'expiresAt', p_suggestion.expires_at,
    'usedAt', p_suggestion.used_at
  );
$$;

create or replace function public.rpc_service_begin_live_odo_copilot_call_v1(
  p_session_id uuid,
  p_requested_by_user_id uuid,
  p_lease_owner uuid,
  p_action_id uuid,
  p_task text,
  p_round_id uuid,
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
  v_context jsonb;
  v_recent_calls bigint;
  v_task_calls bigint;
  v_session_calls bigint;
  v_input_tokens bigint;
  v_output_tokens bigint;
  v_task_limit integer;
  v_effective_provider text;
  v_effective_model text;
  v_effective_reason text;
  v_fallback_reason text;
  v_reason text;
begin
  if not public.live_odo_is_service_role() then
    raise exception 'live_odo_service_role_required' using errcode = '42501';
  end if;
  if p_requested_by_user_id is null or p_lease_owner is null or p_action_id is null
     or p_task not in (
       'conversation_spark','audience_pulse','pair_narration','scene_suggestion',
       'transition_copy','session_welcome','session_closing'
     )
     or (p_task in ('conversation_spark','pair_narration') and p_round_id is null)
     or p_provider not in ('openai','deterministic')
     or p_model_class <> 'luna'
     or p_model is null or char_length(p_model) not between 1 and 120
     or p_routing_reason_code !~ '^[a-z][a-z0-9_]{0,79}$' then
    raise exception 'live_odo_copilot_begin_invalid' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('live_odo:' || p_session_id::text, 0));
  select * into v_config from public.live_odo_configuration where id = true for update;
  select * into v_session from public.live_sessions where id = p_session_id for update;
  if v_session.id is null then
    return jsonb_build_object('allowed', false, 'reasonCode', 'session_missing');
  end if;
  insert into public.live_odo_session_state(session_id) values (p_session_id)
  on conflict (session_id) do nothing;
  select * into v_state from public.live_odo_session_state
  where session_id = p_session_id for update;

  update public.live_odo_ai_usage usage_row
  set status = 'timeout', completed_at = v_now,
      failure_reason_code = 'lease_expired_before_completion'
  where usage_row.session_id = p_session_id
    and usage_row.status = 'started'
    and v_state.lease_expires_at <= v_now;
  if v_state.lease_owner is not null and v_state.lease_expires_at <= v_now then
    update public.live_odo_session_state
    set lease_owner = null, lease_expires_at = null, lease_heartbeat_at = null
    where session_id = p_session_id;
    select * into v_state from public.live_odo_session_state
    where session_id = p_session_id for update;
  end if;

  if not public.live_odo_copilot_task_enabled_v1(v_config, p_task) then
    v_reason := 'copilot_or_task_disabled';
  elsif v_config.circuit_breaker_open then v_reason := 'circuit_breaker_open';
  elsif v_session.status <> 'live' then v_reason := 'session_not_live';
  elsif not public.has_live_capability(
      p_session_id, 'live.view_host_console', p_requested_by_user_id
    ) and not public.is_admin_user(p_requested_by_user_id) then
    v_reason := 'requester_not_authorized';
  elsif v_state.lease_owner is not null and v_state.lease_expires_at > v_now then
    v_reason := 'lease_held';
  end if;
  if v_reason is not null then
    insert into public.live_odo_trace_events(session_id, action_id, trace_type, reason_code, metadata)
    values (p_session_id, p_action_id, 'copilot_call_not_started', v_reason,
      jsonb_build_object('task', p_task));
    return jsonb_build_object('allowed', false, 'reasonCode', v_reason);
  end if;

  v_context := public.live_odo_build_copilot_context_v1(p_session_id, p_task, p_round_id);
  v_task_limit := (v_config.task_call_limits_per_minute->>p_task)::integer;
  select
    count(*) filter (where provider <> 'deterministic'
      and started_at >= date_trunc('minute', v_now)),
    count(*) filter (where provider <> 'deterministic' and task = p_task
      and started_at >= date_trunc('minute', v_now)),
    count(*) filter (where provider <> 'deterministic'),
    coalesce(sum(input_tokens) filter (where provider <> 'deterministic'), 0),
    coalesce(sum(output_tokens) filter (where provider <> 'deterministic'), 0)
  into v_recent_calls, v_task_calls, v_session_calls, v_input_tokens, v_output_tokens
  from public.live_odo_ai_usage where session_id = p_session_id;

  if p_provider = 'deterministic' then v_fallback_reason := 'deterministic_requested';
  elsif v_recent_calls >= v_config.maximum_calls_per_minute
    then v_fallback_reason := 'minute_call_budget_exhausted';
  elsif v_task_calls >= v_task_limit
    then v_fallback_reason := 'task_call_budget_exhausted';
  elsif v_session_calls >= v_config.maximum_calls_per_session
    then v_fallback_reason := 'session_call_budget_exhausted';
  elsif v_input_tokens >= v_config.maximum_input_tokens_per_session
    then v_fallback_reason := 'session_input_budget_exhausted';
  elsif v_output_tokens >= v_config.maximum_output_tokens_per_session
    then v_fallback_reason := 'session_output_budget_exhausted';
  end if;

  v_effective_provider := case when v_fallback_reason is null then 'openai' else 'deterministic' end;
  v_effective_model := case when v_fallback_reason is null then p_model else 'odo-deterministic-v1' end;
  v_effective_reason := coalesce(v_fallback_reason, p_routing_reason_code);

  update public.live_odo_session_state
  set lease_owner = p_lease_owner,
      lease_generation = lease_generation + 1,
      lease_expires_at = v_now + make_interval(secs => v_config.lease_seconds),
      lease_heartbeat_at = v_now,
      state_version = state_version + 1
  where session_id = p_session_id returning * into v_state;

  if v_effective_provider = 'openai' then
    insert into public.live_odo_budget_windows(session_id, window_started_at, task, call_count)
    values (p_session_id, date_trunc('minute', v_now), p_task, 1)
    on conflict (session_id, window_started_at, task) do update
    set call_count = public.live_odo_budget_windows.call_count + 1, updated_at = v_now;
  end if;

  insert into public.live_odo_ai_usage(
    action_id, session_id, requested_by_user_id, task, provider, model_class,
    model, routing_reason_code, status, snapshot_version, session_version,
    lease_owner, lease_generation, pricing_version, round_id, round_version, started_at
  ) values (
    p_action_id, p_session_id, p_requested_by_user_id, p_task, v_effective_provider,
    'luna', v_effective_model, v_effective_reason, 'started', v_state.state_version,
    v_session.version, p_lease_owner, v_state.lease_generation,
    v_config.pricing_version, p_round_id, (v_context->>'roundVersion')::bigint, v_now
  ) returning * into v_call;

  insert into public.live_odo_trace_events(
    session_id, call_id, action_id, trace_type, reason_code, metadata
  ) values
    (p_session_id, v_call.id, p_action_id, 'copilot_lease_acquired', 'lease_acquired',
      jsonb_build_object('leaseGeneration', v_state.lease_generation)),
    (p_session_id, v_call.id, p_action_id, 'copilot_model_routed', v_effective_reason,
      jsonb_build_object('task', p_task, 'provider', v_effective_provider,
        'modelClass', 'luna', 'model', v_effective_model)),
    (p_session_id, v_call.id, p_action_id, 'odo_copilot_suggestion_requested',
      case when v_fallback_reason is null then 'provider_call_started' else 'fallback_started' end,
      jsonb_build_object('task', p_task));

  return jsonb_build_object(
    'allowed', true,
    'providerAllowed', v_effective_provider = 'openai',
    'fallbackReasonCode', v_fallback_reason,
    'callId', v_call.id,
    'actionId', p_action_id,
    'leaseOwner', p_lease_owner,
    'leaseGeneration', v_state.lease_generation,
    'leaseExpiresAt', v_state.lease_expires_at,
    'providerTimeoutMs', least(v_config.provider_timeout_ms,
      greatest(500, (extract(epoch from (v_state.lease_expires_at - v_now)) * 1000)::integer - 250)),
    'snapshot', public.live_odo_build_snapshot_v1(p_session_id),
    'safeContext', v_context
  );
end;
$$;

create or replace function public.rpc_service_complete_live_odo_copilot_call_v1(
  p_call_id uuid,
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
  v_now timestamptz := timezone('utc', now());
  v_call public.live_odo_ai_usage;
  v_state public.live_odo_session_state;
  v_session public.live_sessions;
  v_config public.live_odo_configuration;
  v_existing public.live_odo_copilot_suggestions;
  v_suggestion public.live_odo_copilot_suggestions;
  v_context jsonb;
  v_reason text;
  v_type text;
  v_title text;
  v_rationale text;
  v_payload jsonb := '{}'::jsonb;
  v_price jsonb;
  v_cost_micros bigint;
  v_total_input bigint;
  v_total_output bigint;
  v_template public.live_audience_poll_templates;
begin
  if not public.live_odo_is_service_role() then
    raise exception 'live_odo_service_role_required' using errcode = '42501';
  end if;
  if least(p_input_tokens, p_cached_input_tokens, p_output_tokens, p_latency_ms) < 0
     or p_cached_input_tokens > p_input_tokens
     or p_content_gate_reason_code is null
     or char_length(p_content_gate_reason_code) not between 1 and 120 then
    raise exception 'live_odo_copilot_completion_invalid' using errcode = '22023';
  end if;
  select * into v_call from public.live_odo_ai_usage where id = p_call_id;
  if v_call.id is null then
    return jsonb_build_object('accepted', false, 'reasonCode', 'call_missing');
  end if;
  perform pg_advisory_xact_lock(hashtextextended('live_odo:' || v_call.session_id::text, 0));
  select * into v_config from public.live_odo_configuration where id = true for update;
  select * into v_session from public.live_sessions where id = v_call.session_id for update;
  select * into v_state from public.live_odo_session_state
    where session_id = v_call.session_id for update;
  select * into v_call from public.live_odo_ai_usage where id = p_call_id for update;
  select * into v_existing from public.live_odo_copilot_suggestions where call_id = p_call_id;
  if v_existing.id is not null then
    return jsonb_build_object('accepted', true, 'idempotent', true,
      'suggestion', public.live_odo_copilot_suggestion_json_v1(v_existing));
  end if;

  if v_call.task not in (
      'conversation_spark','audience_pulse','pair_narration','scene_suggestion',
      'transition_copy','session_welcome','session_closing'
    ) then v_reason := 'invalid_copilot_task';
  elsif v_call.status <> 'started' or v_call.lease_owner <> p_lease_owner
    then v_reason := 'call_not_active';
  elsif v_state.lease_owner <> p_lease_owner
    or v_state.lease_generation <> v_call.lease_generation
    or v_state.lease_expires_at <= v_now then v_reason := 'stale_or_expired_lease';
  elsif v_state.state_version <> v_call.snapshot_version
    or v_session.version <> v_call.session_version then v_reason := 'snapshot_stale';
  elsif v_session.status <> 'live' then v_reason := 'session_not_live';
  elsif v_config.circuit_breaker_open then v_reason := 'circuit_breaker_open';
  elsif not public.live_odo_copilot_task_enabled_v1(v_config, v_call.task)
    then v_reason := 'copilot_or_task_disabled';
  elsif not p_content_gate_accepted then
    v_reason := coalesce(nullif(p_content_gate_reason_code, ''), 'content_gate_rejected');
  end if;

  if v_reason is null then
    v_context := public.live_odo_build_copilot_context_v1(
      v_call.session_id, v_call.task, v_call.round_id
    );
    if (v_context->>'roundVersion')::bigint is distinct from v_call.round_version then
      v_reason := 'round_stale';
    end if;
  end if;

  if v_reason is null and (
      p_draft is null or jsonb_typeof(p_draft) <> 'object'
      or octet_length(p_draft::text) > 4096
      or not public.live_odo_jsonb_has_exact_keys_v1(p_draft, array[
        'decision','reasonCode','context','question','copy','locale','templateKey',
        'durationSeconds','scene','signalCodesUsed'
      ])
      or p_draft->>'decision' not in ('suggest','no_action')
      or p_draft->>'reasonCode' !~ '^[a-z][a-z0-9_]{0,63}$'
      or jsonb_typeof(p_draft->'signalCodesUsed') <> 'array'
      or jsonb_array_length(p_draft->'signalCodesUsed') > 8
      or p_draft::text ~* '(https?://|wss?://|rpc_[a-z0-9_]+|<script|service[_ -]?role|api[_ -]?key|access[_ -]?token|select[^"\n]{0,160}from|insert\s+into|delete\s+from)'
    ) then v_reason := 'invalid_copilot_draft';
  end if;

  if v_reason is null and exists (
    select 1 from jsonb_array_elements_text(p_draft->'signalCodesUsed') used(code)
    where code !~ '^[a-z][a-z0-9_]{0,63}$'
      or not (v_context->'allowedSignalCodes') ? code
  ) then v_reason := 'invalid_signal_reference';
  end if;

  if v_reason is null and p_draft->>'decision' = 'suggest' then
    if v_call.task = 'conversation_spark' then
      if jsonb_typeof(p_draft->'context') <> 'string'
        or char_length(p_draft->>'context') not between 1 and 200
        or jsonb_typeof(p_draft->'question') <> 'string'
        or char_length(p_draft->>'question') not between 1 and 300
        or coalesce(p_draft->>'locale','') !~ '^[a-z]{2}(-[A-Z]{2})?$' then
        v_reason := 'invalid_spark_draft';
      else
        v_type := 'conversation_spark'; v_title := 'Conversation spark';
        v_rationale := 'A fresh prompt for the current pair.';
        v_payload := jsonb_build_object('context',p_draft->>'context',
          'question',p_draft->>'question','locale',p_draft->>'locale');
      end if;
    elsif v_call.task = 'audience_pulse' then
      select * into v_template from public.live_audience_poll_templates
      where template_key = p_draft->>'templateKey' and enabled;
      if v_template.template_key is null
        or coalesce(p_draft->>'durationSeconds','') !~ '^[0-9]+$'
        or (p_draft->>'durationSeconds')::integer not between 30 and 300 then
        v_reason := 'invalid_pulse_draft';
      else
        v_type := 'audience_pulse'; v_title := 'Audience pulse';
        v_rationale := 'Invite the room to respond to a prepared pulse.';
        v_payload := jsonb_build_object('templateKey',v_template.template_key,
          'prompt',v_template.prompt,'options',v_template.options,
          'durationSeconds',(p_draft->>'durationSeconds')::integer);
      end if;
    elsif v_call.task = 'scene_suggestion' then
      if p_draft->>'scene' not in (
        'HOST_FOCUS','PAIR_FOCUS','COMMUNITY_WIDE','INTERMISSION','CLOSING'
      ) then v_reason := 'invalid_scene_draft';
      else
        v_type := 'scene_suggestion'; v_title := 'Scene suggestion';
        v_rationale := 'A Host-controlled scene change for the current moment.';
        v_payload := jsonb_build_object('scene', case p_draft->>'scene'
          when 'HOST_FOCUS' then 'host_focus'
          when 'PAIR_FOCUS' then 'quick_connect_active'
          when 'COMMUNITY_WIDE' then 'pool_focus'
          when 'INTERMISSION' then 'host_plus_pool'
          else 'session_closing' end);
      end if;
    else
      if jsonb_typeof(p_draft->'copy') <> 'string'
        or char_length(p_draft->>'copy') < 1
        or char_length(p_draft->>'copy') >
          (case when v_call.task = 'pair_narration' then 320 else 240 end)
        or coalesce(p_draft->>'locale','') !~ '^[a-z]{2}(-[A-Z]{2})?$' then
        v_reason := 'invalid_copy_draft';
      else
        v_type := case v_call.task when 'pair_narration' then 'pair_introduction'
          else v_call.task end;
        v_title := case v_call.task
          when 'pair_narration' then 'Pair introduction'
          when 'transition_copy' then 'Transition'
          when 'session_welcome' then 'Welcome'
          else 'Closing' end;
        v_rationale := case v_call.task
          when 'pair_narration' then 'Optional Host copy for introducing the current pair.'
          when 'transition_copy' then 'Optional Host copy for the next transition.'
          when 'session_welcome' then 'Optional opening copy for the room.'
          else 'Optional closing copy for the room.' end;
        v_payload := jsonb_build_object('copy',p_draft->>'copy','locale',p_draft->>'locale');
      end if;
    end if;
  elsif v_reason is null then
    v_type := 'no_action'; v_title := 'No suggestion';
    v_rationale := 'Odo found no safe, useful suggestion for this moment.';
    v_payload := '{}'::jsonb;
  end if;

  select coalesce(sum(input_tokens), 0) + p_input_tokens,
    coalesce(sum(output_tokens), 0) + p_output_tokens
  into v_total_input, v_total_output
  from public.live_odo_ai_usage
  where session_id = v_call.session_id and id <> v_call.id
    and provider <> 'deterministic';
  if v_reason is null and v_call.provider <> 'deterministic'
    and v_total_input > v_config.maximum_input_tokens_per_session then
    v_reason := 'session_input_budget_exhausted';
  elsif v_reason is null and v_call.provider <> 'deterministic'
    and v_total_output > v_config.maximum_output_tokens_per_session then
    v_reason := 'session_output_budget_exhausted';
  end if;

  v_price := v_config.model_pricing -> v_call.model;
  if v_call.provider <> 'deterministic' and jsonb_typeof(v_price) = 'object'
    and v_price ?& array[
      'inputMicrosPerMillion','cachedInputMicrosPerMillion','outputMicrosPerMillion'
    ] then
    begin
      v_cost_micros := ceil((
        greatest(0, p_input_tokens - p_cached_input_tokens)
          * (v_price->>'inputMicrosPerMillion')::numeric
        + p_cached_input_tokens * (v_price->>'cachedInputMicrosPerMillion')::numeric
        + p_output_tokens * (v_price->>'outputMicrosPerMillion')::numeric
      ) / 1000000)::bigint;
    exception when others then v_cost_micros := null; end;
  end if;

  if v_reason is null then
    update public.live_odo_copilot_suggestions
    set status = 'superseded', superseded_at = v_now
    where session_id = v_call.session_id and task = v_call.task
      and round_id is not distinct from v_call.round_id
      and status = 'ready';
    insert into public.live_odo_copilot_suggestions(
      call_id, action_id, session_id, requested_by_user_id, task,
      suggestion_type, reason_code, title, rationale, payload, round_id,
      snapshot_version, session_version, state_version, round_version,
      fallback_used, content_gate_reason_code, expires_at
    ) values (
      v_call.id, v_call.action_id, v_call.session_id, v_call.requested_by_user_id,
      v_call.task, v_type, p_draft->>'reasonCode', v_title, v_rationale, v_payload,
      v_call.round_id, v_call.snapshot_version, v_call.session_version,
      v_call.snapshot_version, v_call.round_version, p_fallback_used,
      p_content_gate_reason_code,
      v_now + make_interval(secs => public.live_odo_copilot_ttl_seconds_v1(v_call.task))
    ) returning * into v_suggestion;
  end if;

  update public.live_odo_ai_usage set
    status = case when v_reason is not null then 'rejected'
      when p_fallback_used then 'fallback' else 'succeeded' end,
    input_tokens = p_input_tokens,
    cached_input_tokens = p_cached_input_tokens,
    output_tokens = p_output_tokens,
    estimated_cost_micros = v_cost_micros,
    provider_request_id = nullif(p_provider_request_id, ''),
    latency_ms = p_latency_ms,
    fallback_used = p_fallback_used,
    failure_reason_code = coalesce(p_provider_failure_reason_code, v_reason),
    completed_at = v_now
  where id = v_call.id;
  update public.live_odo_session_state set
    lease_owner = null, lease_expires_at = null, lease_heartbeat_at = null,
    last_decision_at = v_now
  where session_id = v_call.session_id and lease_owner = p_lease_owner
    and lease_generation = v_call.lease_generation;
  insert into public.live_odo_trace_events(
    session_id, call_id, action_id, trace_type, reason_code, metadata
  ) values (
    v_call.session_id, v_call.id, v_call.action_id,
    case when v_reason is null then 'odo_copilot_suggestion_created'
      else 'odo_copilot_suggestion_rejected' end,
    coalesce(v_reason, p_content_gate_reason_code),
    jsonb_build_object('task',v_call.task,'type',coalesce(v_type,'no_action'),
      'fallbackUsed',p_fallback_used)
  );
  if v_reason is null and p_fallback_used then
    insert into public.live_odo_trace_events(
      session_id, call_id, action_id, trace_type, reason_code, metadata
    ) values (
      v_call.session_id,v_call.id,v_call.action_id,
      'odo_copilot_fallback_used',
      coalesce(p_provider_failure_reason_code,'deterministic_fallback'),
      jsonb_build_object('task',v_call.task,'suggestionType',v_type)
    );
  end if;
  if v_reason is not null then
    return jsonb_build_object('accepted', false, 'reasonCode', v_reason);
  end if;
  return jsonb_build_object('accepted', true,
    'suggestion', public.live_odo_copilot_suggestion_json_v1(v_suggestion));
exception when invalid_text_representation or numeric_value_out_of_range then
  raise exception 'live_odo_copilot_completion_invalid' using errcode = '22023';
end;
$$;

create or replace function public.live_odo_copilot_task_enabled_v1(
  p_configuration public.live_odo_configuration,
  p_task text
)
returns boolean
language sql
immutable
set search_path = public, pg_catalog
as $$
  select p_configuration.odo_enabled
    and p_configuration.shadow_mode
    and p_configuration.copilot_enabled
    and not p_configuration.autopilot_enabled
    and not p_configuration.music_enabled
    and case
      when p_task = 'conversation_spark' then p_configuration.conversation_spark_enabled
      when p_task = 'audience_pulse' then p_configuration.audience_pulse_enabled
      when p_task = 'pair_narration' then p_configuration.pair_narration_enabled
      when p_task = 'scene_suggestion' then p_configuration.scene_suggestions_enabled
      when p_task in ('transition_copy','session_welcome','session_closing')
        then p_configuration.transition_copy_enabled
      else false
    end;
$$;

create or replace function public.live_odo_copilot_ttl_seconds_v1(p_task text)
returns integer
language sql
immutable
set search_path = public, pg_catalog
as $$
  select case p_task
    when 'conversation_spark' then 180
    when 'audience_pulse' then 120
    when 'pair_narration' then 90
    when 'scene_suggestion' then 60
    when 'transition_copy' then 60
    when 'session_welcome' then 120
    when 'session_closing' then 120
    else 60
  end;
$$;

create or replace function public.live_odo_build_copilot_context_v1(
  p_session_id uuid,
  p_task text,
  p_round_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  v_session public.live_sessions;
  v_state public.live_odo_session_state;
  v_profile_a uuid;
  v_profile_b uuid;
  v_round_version bigint;
  v_round_state text;
  v_round_kind text;
  v_signals jsonb := '[]'::jsonb;
  v_profiles jsonb := '[]'::jsonb;
  v_spark jsonb;
  v_templates jsonb := '[]'::jsonb;
  v_fallback jsonb;
begin
  if not public.live_odo_is_service_role() then
    raise exception 'live_odo_service_role_required' using errcode = '42501';
  end if;
  if p_task not in (
    'conversation_spark','audience_pulse','pair_narration','scene_suggestion',
    'transition_copy','session_welcome','session_closing'
  ) then raise exception 'live_odo_copilot_task_invalid' using errcode = '22023'; end if;

  select * into v_session from public.live_sessions where id = p_session_id;
  select * into v_state from public.live_odo_session_state where session_id = p_session_id;
  if v_session.id is null or v_state.session_id is null then
    raise exception 'live_odo_state_missing' using errcode = 'P0002';
  end if;

  if p_round_id is not null then
    select r.participant_a_profile_id, r.participant_b_profile_id, r.version,
      r.state, 'hosted',
      coalesce((select jsonb_agg(signal->>'code' order by signal->>'code')
        from jsonb_array_elements(r.connection_signals) signal
        where signal->>'code' ~ '^[a-z][a-z0-9_]{0,63}$'), '[]'::jsonb),
      r.conversation_spark
    into v_profile_a, v_profile_b, v_round_version, v_round_state,
      v_round_kind, v_signals, v_spark
    from public.live_match_rounds r
    where r.id = p_round_id and r.session_id = p_session_id
      and r.state in ('both_accepted','public_introduction');

  end if;

  if p_task in ('conversation_spark','pair_narration') and v_profile_a is null then
    raise exception 'live_odo_copilot_round_unavailable' using errcode = '23514';
  end if;
  if p_task = 'pair_narration' and v_round_state <> 'public_introduction' then
    raise exception 'live_odo_copilot_round_unavailable' using errcode = '23514';
  end if;

  if v_profile_a is not null then
    select jsonb_agg(jsonb_build_object(
      'profileId', p.id,
      'displayName', left(coalesce(nullif(btrim(p.full_name), ''), 'Member'), 80),
      'ageBand', null,
      'languages', coalesce((select jsonb_agg(language order by language)
        from (select left(btrim(language), 40) language
          from unnest(coalesce(p.languages_spoken, array[]::text[])) language
          where btrim(language) <> '' order by language limit 8) safe_languages), '[]'::jsonb),
      'conversationInterests', coalesce((select jsonb_agg(name order by name)
        from (select left(i.name, 60) name
          from public.profile_interests pi join public.interests i on i.id = pi.interest_id
          where pi.profile_id = p.id order by i.name limit 12) safe_interests), '[]'::jsonb),
      'culturalAffinityTags', '[]'::jsonb,
      'liveIntent', null
    ) order by p.id)
    into v_profiles
    from public.profiles p where p.id in (v_profile_a, v_profile_b);
  end if;

  if p_task = 'audience_pulse' then
    select coalesce(jsonb_agg(jsonb_build_object(
      'templateKey', t.template_key, 'prompt', t.prompt, 'options', t.options
    ) order by t.display_order, t.template_key), '[]'::jsonb)
    into v_templates
    from public.live_audience_poll_templates t where t.enabled;
  end if;

  v_fallback := case p_task
    when 'conversation_spark' then jsonb_build_object(
      'decision','suggest','reasonCode','deterministic_fallback',
      'context',coalesce(v_spark->>'context','A light conversation starter'),
      'question',coalesce(v_spark->>'question','What is something you have enjoyed recently?'),
      'copy',null,'locale','en','templateKey',null,'durationSeconds',null,
      'scene',null,'signalCodesUsed',v_signals)
    when 'audience_pulse' then jsonb_build_object(
      'decision',case when jsonb_array_length(v_templates) > 0 then 'suggest' else 'no_action' end,
      'reasonCode','deterministic_fallback','context',null,'question',null,'copy',null,
      'locale','en','templateKey',v_templates->0->>'templateKey','durationSeconds',60,
      'scene',null,'signalCodesUsed','[]'::jsonb)
    when 'pair_narration' then jsonb_build_object(
      'decision','suggest','reasonCode','deterministic_fallback','context',null,'question',null,
      'copy','Let us welcome our next pair to the conversation.','locale','en',
      'templateKey',null,'durationSeconds',null,'scene',null,'signalCodesUsed',v_signals)
    when 'scene_suggestion' then jsonb_build_object(
      'decision','suggest','reasonCode','deterministic_fallback','context',null,'question',null,
      'copy',null,'locale','en','templateKey',null,'durationSeconds',null,
      'scene','HOST_FOCUS','signalCodesUsed','[]'::jsonb)
    when 'session_welcome' then jsonb_build_object(
      'decision','suggest','reasonCode','deterministic_fallback','context',null,'question',null,
      'copy','Welcome, everyone. Settle in and enjoy meeting the room.','locale','en',
      'templateKey',null,'durationSeconds',null,'scene',null,'signalCodesUsed','[]'::jsonb)
    when 'session_closing' then jsonb_build_object(
      'decision','suggest','reasonCode','deterministic_fallback','context',null,'question',null,
      'copy','Thank you for joining. Take care and enjoy the rest of your evening.','locale','en',
      'templateKey',null,'durationSeconds',null,'scene',null,'signalCodesUsed','[]'::jsonb)
    else jsonb_build_object(
      'decision','suggest','reasonCode','deterministic_fallback','context',null,'question',null,
      'copy','We will move into the next part of the session shortly.','locale','en',
      'templateKey',null,'durationSeconds',null,'scene',null,'signalCodesUsed','[]'::jsonb)
  end;

  return jsonb_build_object(
    'profiles', coalesce(v_profiles, '[]'::jsonb),
    'allowedSignalCodes', coalesce(v_signals, '[]'::jsonb),
    'roundVersion', v_round_version,
    'deterministicFallback', v_fallback,
    'taskContext', jsonb_build_object(
      'sessionStatus', v_session.status,
      'currentScene', v_state.current_scene,
      'directionMode', v_state.direction_mode,
      'participantCount', (select count(*) from public.live_participants lp
        where lp.session_id = p_session_id and lp.state not in ('left','removed','banned')),
      'audienceCount', (select count(*) from public.live_participants lp
        where lp.session_id = p_session_id and lp.state = 'audience'),
      'roundId', p_round_id,
      'roundKind', v_round_kind,
      'roundState', v_round_state,
      'allowedSignalCodes', coalesce(v_signals, '[]'::jsonb),
      'pulseTemplates', v_templates,
      'allowedScenes', jsonb_build_array(
        'HOST_FOCUS','PAIR_FOCUS','COMMUNITY_WIDE','INTERMISSION','CLOSING'
      )
    )
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
      'odoEnabled','copilotEnabled','conversationSparkEnabled','audiencePulseEnabled',
      'pairNarrationEnabled','sceneSuggestionsEnabled','transitionCopyEnabled',
      'circuitBreakerOpen','minimumCallIntervalSeconds','maximumCallsPerMinute',
      'maximumCallsPerSession','maximumInputTokensPerSession',
      'maximumOutputTokensPerSession','maximumTerraCallsPerSession',
      'providerTimeoutMs','leaseSeconds','pricingVersion','modelPricing',
      'taskCallLimitsPerMinute'
    ]) then
    raise exception 'live_odo_configuration_patch_invalid' using errcode = '22023';
  end if;
  if p_patch ? 'taskCallLimitsPerMinute' then
    if jsonb_typeof(p_patch->'taskCallLimitsPerMinute') <> 'object'
      or not (p_patch->'taskCallLimitsPerMinute') ?& array[
        'director_action','conversation_spark','audience_pulse','intermission_copy',
        'pair_narration','scene_suggestion','transition_copy',
        'session_welcome','session_closing'
      ] then raise exception 'live_odo_configuration_patch_invalid' using errcode = '22023'; end if;
    for v_task, v_task_limit in
      select key, value #>> '{}' from jsonb_each(p_patch->'taskCallLimitsPerMinute')
    loop
      if v_task not in (
          'director_action','conversation_spark','audience_pulse','intermission_copy',
          'pair_narration','scene_suggestion','transition_copy',
          'session_welcome','session_closing'
        ) or v_task_limit !~ '^[1-9][0-9]?$'
        or v_task_limit::integer not between 1 and 60 then
        raise exception 'live_odo_configuration_patch_invalid' using errcode = '22023';
      end if;
    end loop;
  end if;

  update public.live_odo_configuration set
    odo_enabled = case when p_patch ? 'odoEnabled'
      then (p_patch->>'odoEnabled')::boolean else odo_enabled end,
    copilot_enabled = case when p_patch ? 'copilotEnabled'
      then (p_patch->>'copilotEnabled')::boolean else copilot_enabled end,
    conversation_spark_enabled = case when p_patch ? 'conversationSparkEnabled'
      then (p_patch->>'conversationSparkEnabled')::boolean else conversation_spark_enabled end,
    audience_pulse_enabled = case when p_patch ? 'audiencePulseEnabled'
      then (p_patch->>'audiencePulseEnabled')::boolean else audience_pulse_enabled end,
    pair_narration_enabled = case when p_patch ? 'pairNarrationEnabled'
      then (p_patch->>'pairNarrationEnabled')::boolean else pair_narration_enabled end,
    scene_suggestions_enabled = case when p_patch ? 'sceneSuggestionsEnabled'
      then (p_patch->>'sceneSuggestionsEnabled')::boolean else scene_suggestions_enabled end,
    transition_copy_enabled = case when p_patch ? 'transitionCopyEnabled'
      then (p_patch->>'transitionCopyEnabled')::boolean else transition_copy_enabled end,
    circuit_breaker_open = case when p_patch ? 'circuitBreakerOpen'
      then (p_patch->>'circuitBreakerOpen')::boolean else circuit_breaker_open end,
    minimum_call_interval_seconds = case when p_patch ? 'minimumCallIntervalSeconds'
      then (p_patch->>'minimumCallIntervalSeconds')::integer else minimum_call_interval_seconds end,
    maximum_calls_per_minute = case when p_patch ? 'maximumCallsPerMinute'
      then (p_patch->>'maximumCallsPerMinute')::integer else maximum_calls_per_minute end,
    maximum_calls_per_session = case when p_patch ? 'maximumCallsPerSession'
      then (p_patch->>'maximumCallsPerSession')::integer else maximum_calls_per_session end,
    maximum_input_tokens_per_session = case when p_patch ? 'maximumInputTokensPerSession'
      then (p_patch->>'maximumInputTokensPerSession')::bigint else maximum_input_tokens_per_session end,
    maximum_output_tokens_per_session = case when p_patch ? 'maximumOutputTokensPerSession'
      then (p_patch->>'maximumOutputTokensPerSession')::bigint else maximum_output_tokens_per_session end,
    maximum_terra_calls_per_session = case when p_patch ? 'maximumTerraCallsPerSession'
      then (p_patch->>'maximumTerraCallsPerSession')::integer else maximum_terra_calls_per_session end,
    provider_timeout_ms = case when p_patch ? 'providerTimeoutMs'
      then (p_patch->>'providerTimeoutMs')::integer else provider_timeout_ms end,
    lease_seconds = case when p_patch ? 'leaseSeconds'
      then (p_patch->>'leaseSeconds')::integer else lease_seconds end,
    pricing_version = case when p_patch ? 'pricingVersion'
      then p_patch->>'pricingVersion' else pricing_version end,
    model_pricing = case when p_patch ? 'modelPricing'
      then p_patch->'modelPricing' else model_pricing end,
    task_call_limits_per_minute = case when p_patch ? 'taskCallLimitsPerMinute'
      then p_patch->'taskCallLimitsPerMinute' else task_call_limits_per_minute end,
    updated_by_user_id = auth.uid()
  where id = true returning * into v_configuration;

  insert into public.live_odo_trace_events(trace_type, reason_code, metadata)
  values ('configuration_updated','admin_configuration_update',
    jsonb_build_object('changedKeys',(select jsonb_agg(key_name order by key_name)
      from jsonb_object_keys(p_patch) key_name)));
  return jsonb_build_object(
    'odoEnabled',v_configuration.odo_enabled,
    'shadowMode',v_configuration.shadow_mode,
    'copilotEnabled',v_configuration.copilot_enabled,
    'autopilotEnabled',v_configuration.autopilot_enabled,
    'conversationSparkEnabled',v_configuration.conversation_spark_enabled,
    'audiencePulseEnabled',v_configuration.audience_pulse_enabled,
    'pairNarrationEnabled',v_configuration.pair_narration_enabled,
    'sceneSuggestionsEnabled',v_configuration.scene_suggestions_enabled,
    'transitionCopyEnabled',v_configuration.transition_copy_enabled,
    'circuitBreakerOpen',v_configuration.circuit_breaker_open,
    'pricingVersion',v_configuration.pricing_version,
    'taskCallLimitsPerMinute',v_configuration.task_call_limits_per_minute
  );
exception when invalid_text_representation or numeric_value_out_of_range or check_violation then
  raise exception 'live_odo_configuration_patch_invalid' using errcode = '22023';
end;
$$;

revoke all on function public.live_odo_copilot_task_enabled_v1(
  public.live_odo_configuration,text
) from public, anon, authenticated;
revoke all on function public.live_odo_copilot_ttl_seconds_v1(text)
  from public, anon, authenticated;
revoke all on function public.live_odo_build_copilot_context_v1(uuid,text,uuid)
  from public, anon, authenticated;
revoke all on function public.live_odo_copilot_suggestion_json_v1(
  public.live_odo_copilot_suggestions
) from public, anon, authenticated;
revoke all on function public.live_odo_append_host_copilot_event_v1(
  uuid,text,uuid,jsonb,timestamptz
) from public, anon, authenticated, service_role;
revoke all on function public.rpc_service_begin_live_odo_copilot_call_v1(
  uuid,uuid,uuid,uuid,text,uuid,text,text,text,text
) from public, anon, authenticated;
grant execute on function public.rpc_service_begin_live_odo_copilot_call_v1(
  uuid,uuid,uuid,uuid,text,uuid,text,text,text,text
) to service_role;
revoke all on function public.rpc_service_complete_live_odo_copilot_call_v1(
  uuid,uuid,jsonb,boolean,text,text,bigint,bigint,bigint,integer,boolean,text
) from public, anon, authenticated;
grant execute on function public.rpc_service_complete_live_odo_copilot_call_v1(
  uuid,uuid,jsonb,boolean,text,text,bigint,bigint,bigint,integer,boolean,text
) to service_role;
revoke all on function public.rpc_get_live_odo_copilot_v1(uuid,integer)
  from public, anon;
grant execute on function public.rpc_get_live_odo_copilot_v1(uuid,integer)
  to authenticated, service_role;
revoke all on function public.rpc_manage_live_odo_copilot_suggestion_v1(uuid,text)
  from public, anon;
grant execute on function public.rpc_manage_live_odo_copilot_suggestion_v1(uuid,text)
  to authenticated, service_role;
revoke all on function public.rpc_use_live_odo_copilot_suggestion_v1(uuid)
  from public, anon;
grant execute on function public.rpc_use_live_odo_copilot_suggestion_v1(uuid)
  to authenticated, service_role;
revoke all on function public.rpc_admin_update_live_odo_configuration_v1(jsonb)
  from public, anon;
grant execute on function public.rpc_admin_update_live_odo_configuration_v1(jsonb)
  to authenticated, service_role;

comment on table public.live_odo_copilot_suggestions is
  'Host-private, expiring Phase 10B suggestions. Rows never authorize participant-visible action.';
comment on function public.rpc_use_live_odo_copilot_suggestion_v1(uuid) is
  'Fresh Host-authorized policy gate and the only Phase 10B suggestion execution boundary.';

commit;
