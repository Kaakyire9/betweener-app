-- Betweener Live Phase 10A: Odo director shadow-mode persistence and protocol.
-- This migration is additive. It does not change the current Live Studio,
-- matcher, RTC, participant state, scene, conversation spark, or pulse paths.

begin;

create table public.live_odo_configuration (
  id boolean primary key default true check (id),
  odo_enabled boolean not null default false,
  shadow_mode boolean not null default true,
  copilot_enabled boolean not null default false,
  autopilot_enabled boolean not null default false,
  conversation_spark_enabled boolean not null default false,
  audience_pulse_enabled boolean not null default false,
  music_enabled boolean not null default false,
  minimum_call_interval_seconds integer not null default 10
    check (minimum_call_interval_seconds between 1 and 300),
  maximum_calls_per_minute integer not null default 4
    check (maximum_calls_per_minute between 1 and 60),
  maximum_calls_per_session integer not null default 120
    check (maximum_calls_per_session between 1 and 10000),
  maximum_input_tokens_per_session bigint not null default 60000
    check (maximum_input_tokens_per_session between 1 and 10000000),
  maximum_output_tokens_per_session bigint not null default 8000
    check (maximum_output_tokens_per_session between 1 and 1000000),
  maximum_terra_calls_per_session integer not null default 2
    check (maximum_terra_calls_per_session between 0 and 100),
  provider_timeout_ms integer not null default 4000
    check (provider_timeout_ms between 500 and 30000),
  lease_seconds integer not null default 30
    check (lease_seconds between 5 and 120),
  circuit_breaker_open boolean not null default false,
  pricing_version text not null default 'unconfigured'
    check (char_length(pricing_version) between 1 and 80),
  model_pricing jsonb not null default '{}'::jsonb
    check (jsonb_typeof(model_pricing) = 'object'),
  updated_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint live_odo_phase10a_shadow_invariant check (
    shadow_mode
    and not copilot_enabled
    and not autopilot_enabled
    and not conversation_spark_enabled
    and not audience_pulse_enabled
    and not music_enabled
  )
);

insert into public.live_odo_configuration(id) values (true)
on conflict (id) do nothing;

create table public.live_odo_session_state (
  session_id uuid primary key references public.live_sessions(id) on delete cascade,
  schema_version integer not null default 1 check (schema_version = 1),
  direction_mode text not null default 'manual'
    check (direction_mode in ('manual','hybrid','autopilot')),
  autopilot_state text not null default 'off'
    check (autopilot_state in (
      'off','starting','active','paused_by_host','paused_by_policy',
      'recovering','ending','ended'
    )),
  current_scene text not null default 'host_focus'
    check (current_scene in (
      'host_focus','host_plus_pool','pool_focus','pair_forming',
      'quick_connect_active','audience_pulse','conversation_topic',
      'music_intermission','screen_share','odo_stage','session_closing'
    )),
  state_version bigint not null default 1 check (state_version > 0),
  latest_sequence bigint not null default 0 check (latest_sequence >= 0),
  lease_owner uuid,
  lease_generation bigint not null default 0 check (lease_generation >= 0),
  lease_expires_at timestamptz,
  lease_heartbeat_at timestamptz,
  last_decision_at timestamptz,
  pause_reason_code text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint live_odo_session_pause_reason_length check (
    pause_reason_code is null or char_length(pause_reason_code) between 1 and 80
  ),
  constraint live_odo_session_lease_shape check (
    (lease_owner is null and lease_expires_at is null)
    or (lease_owner is not null and lease_expires_at is not null)
  ) not valid
);

create table public.live_odo_ai_usage (
  id uuid primary key default gen_random_uuid(),
  action_id uuid not null unique,
  session_id uuid not null references public.live_sessions(id) on delete cascade,
  requested_by_user_id uuid not null references auth.users(id) on delete restrict,
  task text not null check (task in (
    'director_action','conversation_spark','audience_pulse','intermission_copy'
  )),
  provider text not null check (provider in ('openai','deterministic','fake')),
  model_class text not null check (model_class in ('luna','terra','sol')),
  model text not null check (char_length(model) between 1 and 120),
  routing_reason_code text not null check (char_length(routing_reason_code) between 1 and 80),
  status text not null default 'started'
    check (status in ('started','succeeded','failed','timeout','fallback','rejected')),
  snapshot_version bigint not null check (snapshot_version > 0),
  session_version bigint not null check (session_version > 0),
  lease_owner uuid not null,
  lease_generation bigint not null check (lease_generation > 0),
  input_tokens bigint not null default 0 check (input_tokens >= 0),
  cached_input_tokens bigint not null default 0 check (cached_input_tokens >= 0),
  output_tokens bigint not null default 0 check (output_tokens >= 0),
  estimated_cost_micros bigint check (estimated_cost_micros is null or estimated_cost_micros >= 0),
  pricing_version text not null,
  provider_request_id text,
  latency_ms integer check (latency_ms is null or latency_ms >= 0),
  fallback_used boolean not null default false,
  failure_reason_code text,
  started_at timestamptz not null default timezone('utc', now()),
  completed_at timestamptz,
  constraint live_odo_usage_request_id_length check (
    provider_request_id is null or char_length(provider_request_id) <= 200
  ),
  constraint live_odo_usage_failure_length check (
    failure_reason_code is null or char_length(failure_reason_code) <= 120
  ),
  constraint live_odo_usage_completion_shape check (
    (status = 'started' and completed_at is null)
    or (status <> 'started' and completed_at is not null)
  ) not valid
);

create table public.live_odo_action_attempts (
  action_id uuid primary key,
  call_id uuid not null unique references public.live_odo_ai_usage(id) on delete cascade,
  session_id uuid not null references public.live_sessions(id) on delete cascade,
  schema_version integer not null check (schema_version = 1),
  action_type text not null check (action_type in (
    'NO_ACTION','WAIT','SESSION_WELCOME','OPEN_POOL','ANNOUNCE_PAIR',
    'FOCUS_PAIRING','REQUEST_SCENE','SHOW_CONVERSATION_SPARK',
    'SHOW_AUDIENCE_PULSE','SHOW_INTERMISSION','REQUEST_MUSIC_ACTION',
    'TIME_CUE','CLOSE_ROUND','RETURN_TO_POOL','SESSION_CLOSING'
  )),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  reason_code text not null check (char_length(reason_code) between 1 and 80),
  snapshot_version bigint not null check (snapshot_version > 0),
  lease_generation bigint not null check (lease_generation > 0),
  expires_at timestamptz not null,
  policy_outcome text not null
    check (policy_outcome in ('shadow_approved','rejected')),
  policy_reason_code text not null check (char_length(policy_reason_code) between 1 and 120),
  fallback_used boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  evaluated_at timestamptz not null default timezone('utc', now()),
  constraint live_odo_action_payload_size check (octet_length(payload::text) <= 8192),
  constraint live_odo_action_shadow_only check (policy_outcome <> 'shadow_approved' or evaluated_at is not null) not valid
);

create table public.live_odo_budget_windows (
  session_id uuid not null references public.live_sessions(id) on delete cascade,
  window_started_at timestamptz not null,
  task text not null check (task in (
    'director_action','conversation_spark','audience_pulse','intermission_copy'
  )),
  call_count integer not null default 0 check (call_count >= 0),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (session_id, window_started_at, task)
);

create table public.live_director_events (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.live_sessions(id) on delete cascade,
  schema_version integer not null default 1 check (schema_version > 0),
  sequence bigint not null check (sequence > 0),
  state_version bigint not null check (state_version > 0),
  event_type text not null check (char_length(event_type) between 1 and 80),
  source text not null check (source in ('host','policy','odo','system')),
  idempotency_key uuid,
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  occurred_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now()),
  constraint live_director_event_sequence_unique unique (session_id, sequence),
  constraint live_director_event_payload_size check (octet_length(payload::text) <= 8192)
);

-- Realtime carries only a content-free invalidation row. Clients retrieve a
-- capability-filtered, versioned snapshot and ordered events through an RPC.
create table public.live_director_updates (
  session_id uuid primary key references public.live_sessions(id) on delete cascade,
  version bigint not null default 1 check (version > 0),
  latest_sequence bigint not null default 0 check (latest_sequence >= 0),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.live_odo_trace_events (
  id bigint generated always as identity primary key,
  session_id uuid references public.live_sessions(id) on delete cascade,
  call_id uuid references public.live_odo_ai_usage(id) on delete cascade,
  action_id uuid,
  trace_type text not null check (char_length(trace_type) between 1 and 80),
  reason_code text check (reason_code is null or char_length(reason_code) <= 120),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default timezone('utc', now()),
  constraint live_odo_trace_metadata_size check (octet_length(metadata::text) <= 4096)
);

create trigger live_odo_configuration_set_updated_at
before update on public.live_odo_configuration
for each row execute function public.set_updated_at();

create trigger live_odo_session_state_set_updated_at
before update on public.live_odo_session_state
for each row execute function public.set_updated_at();

create trigger live_odo_budget_windows_set_updated_at
before update on public.live_odo_budget_windows
for each row execute function public.set_updated_at();

create or replace function public.live_odo_is_service_role()
returns boolean
language sql
stable
set search_path = public, pg_catalog
as $$
  select coalesce(auth.role(), '') = 'service_role';
$$;

create or replace function public.live_odo_append_trace_v1(
  p_session_id uuid,
  p_call_id uuid,
  p_action_id uuid,
  p_trace_type text,
  p_reason_code text,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
begin
  if not public.live_odo_is_service_role() then
    raise exception 'live_odo_service_role_required' using errcode = '42501';
  end if;
  if p_trace_type is null or char_length(p_trace_type) not between 1 and 80
     or jsonb_typeof(coalesce(p_metadata, '{}'::jsonb)) <> 'object'
     or octet_length(coalesce(p_metadata, '{}'::jsonb)::text) > 4096 then
    raise exception 'live_odo_invalid_trace' using errcode = '22023';
  end if;
  insert into public.live_odo_trace_events(
    session_id, call_id, action_id, trace_type, reason_code, metadata
  ) values (
    p_session_id, p_call_id, p_action_id, p_trace_type,
    left(p_reason_code, 120), coalesce(p_metadata, '{}'::jsonb)
  );
end;
$$;

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
      and mr.state in ('proposed','awaiting_consent','both_accepted','public_introduction')
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
    'latestSequence', state_row.latest_sequence,
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

create or replace function public.live_odo_append_director_event_v1(
  p_session_id uuid,
  p_schema_version integer,
  p_event_type text,
  p_source text,
  p_idempotency_key uuid,
  p_payload jsonb
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
     or p_source not in ('host','policy','system')
     or jsonb_typeof(coalesce(p_payload, '{}'::jsonb)) <> 'object'
     or octet_length(coalesce(p_payload, '{}'::jsonb)::text) > 8192 then
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
    session_id, schema_version, sequence, state_version,
    event_type, source, idempotency_key, payload
  ) values (
    p_session_id, p_schema_version, v_state.latest_sequence, v_state.state_version,
    p_event_type, p_source, p_idempotency_key, coalesce(p_payload, '{}'::jsonb)
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
declare v_snapshot jsonb;
begin
  if auth.uid() is null or not public.can_view_live_session(p_session_id, auth.uid()) then
    raise exception 'live_director_snapshot_forbidden' using errcode = '42501';
  end if;
  if p_after_sequence < 0 or p_limit not between 1 and 200 then
    raise exception 'live_director_snapshot_invalid_request' using errcode = '22023';
  end if;
  select public.live_odo_build_snapshot_v1(p_session_id) into v_snapshot;
  if v_snapshot is null then raise exception 'live_odo_state_missing' using errcode = 'P0002'; end if;
  return jsonb_build_object(
    'snapshot', v_snapshot,
    'events', coalesce((
      select jsonb_agg(jsonb_build_object(
        'schemaVersion', e.schema_version,
        'sequence', e.sequence,
        'eventId', e.id,
        'sessionId', e.session_id,
        'eventType', e.event_type,
        'stateVersion', e.state_version,
        'occurredAt', e.occurred_at,
        'payload', e.payload
      ) order by e.sequence)
      from (
        select * from public.live_director_events candidate
        where candidate.session_id = p_session_id
          and candidate.sequence > p_after_sequence
        order by candidate.sequence
        limit p_limit
      ) e
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.rpc_get_live_odo_admin_trace_v1(
  p_session_id uuid,
  p_limit integer default 100
)
returns table (
  trace_id bigint,
  call_id uuid,
  action_id uuid,
  trace_type text,
  reason_code text,
  metadata jsonb,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
begin
  if auth.uid() is null or not public.is_admin_user(auth.uid()) then
    raise exception 'live_odo_admin_required' using errcode = '42501';
  end if;
  if p_limit not between 1 and 500 then
    raise exception 'live_odo_trace_limit_invalid' using errcode = '22023';
  end if;
  return query
  select t.id, t.call_id, t.action_id, t.trace_type, t.reason_code, t.metadata, t.created_at
  from public.live_odo_trace_events t
  where t.session_id = p_session_id
  order by t.id desc
  limit p_limit;
end;
$$;

alter table public.live_odo_configuration enable row level security;
alter table public.live_odo_session_state enable row level security;
alter table public.live_odo_ai_usage enable row level security;
alter table public.live_odo_action_attempts enable row level security;
alter table public.live_odo_budget_windows enable row level security;
alter table public.live_director_events enable row level security;
alter table public.live_director_updates enable row level security;
alter table public.live_odo_trace_events enable row level security;

create policy live_odo_configuration_admin_select
on public.live_odo_configuration for select to authenticated
using (public.is_admin_user(auth.uid()));

create policy live_director_updates_viewer_select
on public.live_director_updates for select to authenticated
using (public.can_view_live_session(session_id, auth.uid()));

create policy live_odo_trace_admin_select
on public.live_odo_trace_events for select to authenticated
using (public.is_admin_user(auth.uid()));

revoke all on public.live_odo_configuration, public.live_odo_session_state,
  public.live_odo_ai_usage, public.live_odo_action_attempts,
  public.live_odo_budget_windows, public.live_director_events,
  public.live_director_updates, public.live_odo_trace_events
from anon, authenticated, service_role;

grant select on public.live_odo_configuration, public.live_director_updates,
  public.live_odo_trace_events to authenticated;

revoke all on function public.live_odo_is_service_role() from public, anon, authenticated;
revoke all on function public.live_odo_append_trace_v1(uuid,uuid,uuid,text,text,jsonb)
  from public, anon, authenticated;
revoke all on function public.live_odo_build_snapshot_v1(uuid)
  from public, anon, authenticated;
revoke all on function public.live_odo_append_director_event_v1(uuid,integer,text,text,uuid,jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.live_odo_is_service_role() to service_role;
grant execute on function public.live_odo_append_trace_v1(uuid,uuid,uuid,text,text,jsonb)
  to service_role;
grant execute on function public.live_odo_build_snapshot_v1(uuid) to service_role;
grant execute on function public.rpc_get_live_director_snapshot_v1(uuid,bigint,integer)
  to authenticated, service_role;
grant execute on function public.rpc_get_live_odo_admin_trace_v1(uuid,integer)
  to authenticated, service_role;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'live_director_updates'
  ) then
    alter publication supabase_realtime add table public.live_director_updates;
  end if;
end;
$$;

comment on table public.live_odo_ai_usage is
  'Server-only Odo provider usage and cost ledger. Never contains prompts or member content.';
comment on table public.live_odo_trace_events is
  'Admin-only operational trace. Metadata must remain content-free and identifier-minimized.';
comment on function public.live_odo_append_director_event_v1(uuid,integer,text,text,uuid,jsonb) is
  'Private ordered-event primitive. Odo source is hard-disabled during Phase 10A shadow mode.';

commit;
