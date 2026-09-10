-- Betweener Live Phase 10F: one opportunity -> one system-owned Live, Odo
-- controller initialization, deterministic draining and idempotent cleanup.

begin;

alter table public.live_odo_show_sessions
  drop constraint if exists live_odo_show_sessions_program_source_check;
alter table public.live_odo_show_sessions
  add constraint live_odo_show_sessions_program_source_check check (
    program_source in ('mobile','studio','system')
  );

create table public.live_odo_always_on_sessions (
  session_id uuid primary key references public.live_sessions(id) on delete cascade,
  opportunity_id uuid not null unique references public.live_quick_connect_opportunities(id) on delete restrict,
  lifecycle_state text not null default 'starting' check (lifecycle_state in (
    'starting','live','low_liquidity','draining','ending','ended','failed'
  )),
  stream_resource_ready_at timestamptz,
  stream_resource_ended_at timestamptz,
  stream_cleanup_attempts integer not null default 0 check (stream_cleanup_attempts between 0 and 12),
  low_liquidity_since timestamptz,
  empty_since timestamptz,
  maximum_runtime_ends_at timestamptz not null,
  end_reason_code text check (
    end_reason_code is null or end_reason_code in (
      'low_liquidity_timeout','empty_room_timeout','maximum_runtime_reached',
      'circuit_breaker_open','start_failed','completed'
    )
  ),
  lease_owner uuid,
  lease_expires_at timestamptz,
  version bigint not null default 1 check (version > 0),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint live_odo_always_on_session_lease_valid check (
    (lease_owner is null and lease_expires_at is null)
    or (lease_owner is not null and lease_expires_at is not null)
  )
);

create index live_odo_always_on_sessions_wake_idx
  on public.live_odo_always_on_sessions(lifecycle_state, maximum_runtime_ends_at, updated_at);

alter table public.live_odo_always_on_sessions enable row level security;
revoke all on table public.live_odo_always_on_sessions
from public, anon, authenticated, service_role;
create trigger live_odo_always_on_sessions_updated_at
before update on public.live_odo_always_on_sessions
for each row execute function public.set_updated_at();

create or replace function public.live_odo_always_on_service_witness_v1(
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
  select public.live_odo_is_service_role()
    and public.live_is_odo_always_on_session_v1(p_session_id)
    and p_user_id is not null
    and exists (
      select 1
      from public.live_odo_always_on_sessions always_on
      join public.live_quick_connect_opportunity_members member
        on member.opportunity_id = always_on.opportunity_id
      where always_on.session_id = p_session_id
        and member.user_id = p_user_id
        and member.state in ('accepted','consumed')
    );
$$;

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
  select (
    public.live_odo_always_on_service_witness_v1(p_session_id, p_user_id)
    or (
      p_user_id is not null
      and (
        public.has_live_capability(p_session_id, 'live.view_host_console', p_user_id)
        or public.is_admin_user(p_user_id)
      )
      and (
        not coalesce((select full_quick_connect_internal_only
          from public.live_odo_configuration where id = true), true)
        or public.live_odo_guarded_host_allowed_v1(p_user_id)
      )
    )
  );
$$;

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
  select (
    public.live_odo_always_on_service_witness_v1(p_session_id, p_user_id)
    or (
      p_user_id is not null
      and (
        public.has_live_capability(p_session_id, 'live.view_host_console', p_user_id)
        or public.is_admin_user(p_user_id)
      )
      and (
        not coalesce((select show_director_internal_only
          from public.live_odo_configuration where id = true), true)
        or public.live_odo_guarded_host_allowed_v1(p_user_id)
      )
    )
  );
$$;

revoke all on function public.live_odo_always_on_service_witness_v1(uuid, uuid),
  public.live_odo_full_quick_host_allowed_v1(uuid, uuid),
  public.live_odo_show_host_allowed_v1(uuid, uuid)
from public, anon, authenticated, service_role;

create or replace function public.rpc_service_prepare_live_quick_connect_opportunity_session_v1(
  p_opportunity_id uuid,
  p_worker_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  v_now timestamptz := timezone('utc', now());
  v_configuration public.live_odo_always_on_configuration;
  v_odo_configuration public.live_odo_configuration;
  v_opportunity public.live_quick_connect_opportunities;
  v_session public.live_sessions;
  v_session_id uuid := gen_random_uuid();
  v_accepted_ids uuid[] := array[]::uuid[];
  v_accepted_count integer := 0;
  v_edges integer := 0;
begin
  if not public.live_odo_is_service_role() then
    raise exception 'live_odo_service_role_required' using errcode = '42501';
  end if;
  if p_opportunity_id is null or p_worker_id is null then
    raise exception 'live_opportunity_start_invalid' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('always-on-opportunity:' || p_opportunity_id::text, 0));
  select * into v_configuration from public.live_odo_always_on_configuration
  where id = true for update;
  select * into v_odo_configuration from public.live_odo_configuration where id = true;
  select * into v_opportunity from public.live_quick_connect_opportunities
  where id = p_opportunity_id for update;
  if v_opportunity.id is null then
    raise exception 'live_opportunity_not_found' using errcode = 'P0002';
  end if;
  if v_opportunity.live_session_id is not null then
    if v_opportunity.state <> 'live' then
      update public.live_quick_connect_opportunities set
        state = 'starting', lease_owner = p_worker_id,
        lease_expires_at = v_now + make_interval(secs => v_configuration.worker_lease_seconds),
        lease_generation = lease_generation + 1,
        start_attempts = start_attempts + 1,
        last_reason_code = 'stream_resource_retrying'
      where id = v_opportunity.id returning * into v_opportunity;
      update public.live_odo_always_on_sessions set
        lifecycle_state = 'starting', lease_owner = p_worker_id,
        lease_expires_at = v_opportunity.lease_expires_at,
        version = version + 1
      where session_id = v_opportunity.live_session_id;
    end if;
    select * into v_session from public.live_sessions where id = v_opportunity.live_session_id;
    return jsonb_build_object(
      'prepared', true, 'idempotent', true,
      'opportunityId', v_opportunity.id,
      'sessionId', v_session.id,
      'providerCallType', v_session.provider_call_type,
      'providerCallId', v_session.provider_call_id,
      'maximumParticipants', v_session.maximum_participants,
      'acceptedUserIds', (select coalesce(jsonb_agg(member.user_id order by member.user_id), '[]'::jsonb)
        from public.live_quick_connect_opportunity_members member
        where member.opportunity_id = v_opportunity.id and member.state = 'accepted')
    );
  end if;
  if v_configuration.circuit_breaker_open
    or not v_configuration.system_session_creation_enabled
    or not v_configuration.odo_start_enabled
    or v_opportunity.shadow_only
    or v_opportunity.state <> 'quorum_reached'
    or v_opportunity.expires_at <= v_now
    or not v_odo_configuration.odo_enabled
    or not v_odo_configuration.guarded_autopilot_enabled
    or not v_odo_configuration.full_quick_connect_autopilot_enabled
    or not v_odo_configuration.show_director_enabled
    or v_odo_configuration.circuit_breaker_open then
    return jsonb_build_object('prepared', false, 'reasonCode', 'system_session_start_disabled');
  end if;

  select coalesce(array_agg(member.user_id order by member.user_id), array[]::uuid[])
  into v_accepted_ids
  from public.live_quick_connect_opportunity_members member
  join public.live_quick_connect_opportunity_reservations reservation
    on reservation.opportunity_id = member.opportunity_id
   and reservation.user_id = member.user_id
  join public.live_quick_connect_availability availability
    on availability.user_id = member.user_id
  where member.opportunity_id = p_opportunity_id
    and member.state = 'accepted'
    and reservation.expires_at > v_now
    and availability.status = 'reserved'
    and availability.reserved_opportunity_id = p_opportunity_id
    and availability.expires_at > v_now
    and public.live_odo_always_on_user_allowed_v1(member.user_id)
    and not public.live_quick_connect_has_active_safety_hold(member.user_id)
    and not exists (
      select 1 from public.live_participants active_participant
      join public.live_sessions active_session
        on active_session.id = active_participant.session_id
      where active_participant.user_id = member.user_id
        and active_participant.state not in ('left','removed','banned')
        and active_session.status in ('backstage','live','ending')
    );
  v_accepted_count := cardinality(v_accepted_ids);
  select count(*)::integer into v_edges
  from unnest(v_accepted_ids) with ordinality user_a(user_id, position)
  join unnest(v_accepted_ids) with ordinality user_b(user_id, position)
    on user_b.position > user_a.position
  where public.live_odo_always_on_pair_is_eligible_v1(user_a.user_id, user_b.user_id);
  if v_accepted_count < v_configuration.minimum_cohort_size or v_edges < 1 then
    update public.live_quick_connect_opportunities set
      state = 'awaiting_quorum', accepted_count = v_accepted_count,
      accepted_pair_edge_count = v_edges,
      last_reason_code = 'quorum_revalidation_failed'
    where id = p_opportunity_id;
    return jsonb_build_object('prepared', false, 'reasonCode', 'quorum_revalidation_failed');
  end if;

  update public.live_quick_connect_opportunities set
    state = 'creating_session', lease_owner = p_worker_id,
    lease_expires_at = v_now + make_interval(secs => v_configuration.worker_lease_seconds),
    lease_generation = lease_generation + 1,
    start_attempts = start_attempts + 1,
    accepted_count = v_accepted_count,
    accepted_pair_edge_count = v_edges,
    last_reason_code = 'system_session_creating'
  where id = p_opportunity_id returning * into v_opportunity;

  insert into public.live_sessions(
    id, title, description, format, status, context_type,
    created_by_user_id, created_by_profile_id, ownership_type, system_session_kind,
    provider, provider_call_type, provider_call_id,
    scheduled_start, scheduled_end, minimum_participants, maximum_participants,
    maximum_publishers, chemistry_first_enabled, recording_enabled,
    backstage_opened_at, configuration
  ) values (
    v_session_id, 'Quick Connect, now',
    'A temporary Quick Connect room formed from explicit availability.',
    'quick_connect', 'backstage', 'invite_only',
    null, null, 'system', 'odo_always_on_quick_connect',
    'stream', 'betweener_live',
    'always_on_' || replace(p_opportunity_id::text, '-', ''),
    v_now, v_now + make_interval(mins => v_configuration.maximum_session_runtime_minutes),
    v_configuration.minimum_cohort_size,
    greatest(v_configuration.maximum_cohort_size, v_accepted_count),
    least(4, greatest(2, v_accepted_count)), false, false, v_now,
    jsonb_build_object(
      'phase', '10f', 'opportunity_id', p_opportunity_id,
      'system_owned', true, 'pool_intent_requires_explicit_join', true,
      'market_context', v_opportunity.market_context
    )
  ) returning * into v_session;

  insert into public.live_participants(
    session_id, user_id, profile_id, origin_context_type, origin_context_id,
    role, state, rsvp_status, open_to_introductions
  )
  select v_session.id, member.user_id, member.profile_id,
    'invite_only', null, 'audience', 'confirmed', 'going', false
  from public.live_quick_connect_opportunity_members member
  where member.opportunity_id = p_opportunity_id and member.state = 'accepted';

  insert into public.live_odo_always_on_sessions(
    session_id, opportunity_id, lifecycle_state, maximum_runtime_ends_at,
    lease_owner, lease_expires_at
  ) values (
    v_session.id, p_opportunity_id, 'starting',
    v_now + make_interval(mins => v_configuration.maximum_session_runtime_minutes),
    p_worker_id, v_opportunity.lease_expires_at
  );
  update public.live_quick_connect_opportunities set
    live_session_id = v_session.id, state = 'starting',
    last_reason_code = 'stream_resource_pending'
  where id = p_opportunity_id;
  insert into public.live_session_events(session_id, event_type, to_state, metadata)
  values (v_session.id, 'system_session_created', 'backstage',
    jsonb_build_object('opportunity_id', p_opportunity_id, 'ownership_type', 'system'));
  insert into public.live_quick_connect_opportunity_events(
    opportunity_id, event_type, reason_code, accepted_count, pair_edge_count,
    metadata
  ) values (
    p_opportunity_id, 'system_session_created', 'stream_resource_pending',
    v_accepted_count, v_edges, jsonb_build_object('sessionId', v_session.id)
  );
  return jsonb_build_object(
    'prepared', true, 'idempotent', false,
    'opportunityId', p_opportunity_id,
    'sessionId', v_session.id,
    'providerCallType', v_session.provider_call_type,
    'providerCallId', v_session.provider_call_id,
    'maximumParticipants', v_session.maximum_participants,
    'acceptedUserIds', (select jsonb_agg(member.user_id order by member.user_id)
      from public.live_quick_connect_opportunity_members member
      where member.opportunity_id = p_opportunity_id and member.state = 'accepted')
  );
end;
$$;

create or replace function public.rpc_service_get_live_quick_connect_opportunity_work_v1(
  p_limit integer default 4
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
begin
  if not public.live_odo_is_service_role() then
    raise exception 'live_odo_service_role_required' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'opportunityId', work.id,
      'state', work.state,
      'attempts', work.start_attempts
    ) order by work.created_at)
    from (
      select opportunity.id, opportunity.state,
        opportunity.start_attempts, opportunity.created_at
      from public.live_quick_connect_opportunities opportunity
      where opportunity.state in ('quorum_reached','starting')
        and opportunity.expires_at > timezone('utc', now())
        and opportunity.start_attempts < 3
        and (opportunity.lease_expires_at is null
          or opportunity.lease_expires_at <= timezone('utc', now()))
      order by opportunity.created_at
      limit greatest(1, least(coalesce(p_limit, 4), 8))
    ) work
  ), '[]'::jsonb);
end;
$$;

create or replace function public.rpc_service_finalize_live_quick_connect_opportunity_session_v1(
  p_opportunity_id uuid,
  p_worker_id uuid,
  p_stream_ready boolean,
  p_failure_reason_code text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  v_now timestamptz := timezone('utc', now());
  v_configuration public.live_odo_always_on_configuration;
  v_opportunity public.live_quick_connect_opportunities;
  v_session public.live_sessions;
  v_witness_user_id uuid;
begin
  if not public.live_odo_is_service_role() then
    raise exception 'live_odo_service_role_required' using errcode = '42501';
  end if;
  if p_opportunity_id is null or p_worker_id is null then
    raise exception 'live_opportunity_finalize_invalid' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('always-on-opportunity:' || p_opportunity_id::text, 0));
  select * into v_configuration from public.live_odo_always_on_configuration where id = true;
  select * into v_opportunity from public.live_quick_connect_opportunities
  where id = p_opportunity_id for update;
  select * into v_session from public.live_sessions where id = v_opportunity.live_session_id for update;
  if v_opportunity.id is null or v_session.id is null
    or not public.live_is_odo_always_on_session_v1(v_session.id) then
    raise exception 'live_opportunity_session_missing' using errcode = 'P0002';
  end if;
  if v_opportunity.state = 'live' and v_session.status = 'live' then
    return jsonb_build_object('started', true, 'idempotent', true, 'sessionId', v_session.id);
  end if;
  if v_opportunity.lease_owner <> p_worker_id
    or v_opportunity.state not in ('creating_session','starting') then
    return jsonb_build_object('started', false, 'reasonCode', 'opportunity_lease_lost');
  end if;
  if not coalesce(p_stream_ready, false) then
    update public.live_quick_connect_opportunities set
      state = case when start_attempts >= 3 then 'failed' else 'starting' end,
      lease_owner = null, lease_expires_at = null,
      last_reason_code = case when start_attempts >= 3
        then 'stream_start_failed' else 'stream_start_retryable' end
    where id = p_opportunity_id;
    update public.live_odo_always_on_sessions set
      lifecycle_state = case when v_opportunity.start_attempts >= 3 then 'failed' else 'starting' end,
      lease_owner = null, lease_expires_at = null,
      end_reason_code = case when v_opportunity.start_attempts >= 3 then 'start_failed' else null end,
      version = version + 1
    where session_id = v_session.id;
    insert into public.live_quick_connect_opportunity_events(
      opportunity_id, event_type, reason_code, metadata
    ) values (
      p_opportunity_id, 'stream_start_failed',
      case when v_opportunity.start_attempts >= 3 then 'stream_start_failed' else 'stream_start_retryable' end,
      jsonb_build_object('providerReasonCode', left(coalesce(p_failure_reason_code, 'unknown'), 120))
    );
    return jsonb_build_object('started', false,
      'reasonCode', case when v_opportunity.start_attempts >= 3
        then 'stream_start_failed' else 'stream_start_retryable' end);
  end if;
  if v_configuration.circuit_breaker_open
    or not v_configuration.system_session_creation_enabled
    or not v_configuration.odo_start_enabled then
    return jsonb_build_object('started', false, 'reasonCode', 'system_session_start_disabled');
  end if;
  if exists (
    select 1 from public.live_quick_connect_opportunity_members member
    where member.opportunity_id = p_opportunity_id and member.state = 'accepted'
      and public.live_quick_connect_has_active_safety_hold(member.user_id)
  ) or exists (
    select 1 from public.live_participants participant
    join public.live_sessions other_session on other_session.id = participant.session_id
    where participant.user_id in (select member.user_id
      from public.live_quick_connect_opportunity_members member
      where member.opportunity_id = p_opportunity_id and member.state = 'accepted')
      and participant.session_id <> v_session.id
      and participant.state not in ('left','removed','banned')
      and other_session.status in ('backstage','live','ending')
  ) then
    return jsonb_build_object('started', false, 'reasonCode', 'start_revalidation_failed');
  end if;
  select member.user_id into v_witness_user_id
  from public.live_quick_connect_opportunity_members member
  where member.opportunity_id = p_opportunity_id and member.state = 'accepted'
  order by member.user_id limit 1;
  if v_witness_user_id is null then
    return jsonb_build_object('started', false, 'reasonCode', 'accepted_members_missing');
  end if;

  update public.live_sessions set
    status = 'live', started_at = coalesce(started_at, v_now)
  where id = v_session.id and status = 'backstage'
  returning * into v_session;
  if v_session.status <> 'live' then
    raise exception 'live_system_session_transition_failed' using errcode = '55000';
  end if;
  update public.live_quick_connect_controls set
    state = 'open', creator_mode = 'facilitator', updated_by_user_id = null
  where session_id = v_session.id;
  insert into public.live_odo_session_state(session_id) values (v_session.id)
  on conflict(session_id) do nothing;
  insert into public.live_odo_guarded_autopilot_settings(session_id)
  values (v_session.id) on conflict(session_id) do nothing;
  insert into public.live_odo_full_quick_connect_settings(session_id)
  values (v_session.id) on conflict(session_id) do nothing;
  insert into public.live_odo_show_sessions(session_id)
  values (v_session.id) on conflict(session_id) do nothing;
  insert into public.live_music_session_state(session_id)
  values (v_session.id) on conflict(session_id) do nothing;

  update public.live_odo_session_state set
    direction_mode = 'autopilot', autopilot_state = 'active',
    current_scene = 'odo_stage', pause_reason_code = null,
    lease_owner = null, lease_expires_at = null, lease_heartbeat_at = null,
    lease_generation = lease_generation + 1,
    state_version = state_version + 1
  where session_id = v_session.id;
  update public.live_odo_guarded_autopilot_settings set
    enabled = true, enabled_by_user_id = v_witness_user_id,
    limited_mode = false, enabled_at = v_now, taken_over_at = null,
    version = version + 1
  where session_id = v_session.id;
  update public.live_odo_full_quick_connect_settings set
    enabled = true, enabled_by_user_id = v_witness_user_id,
    lifecycle_state = 'active', orchestration_state = 'pool_open',
    energy_mode = 'normal', started_at = v_now,
    maximum_runtime_ends_at = v_now
      + make_interval(mins => v_configuration.maximum_session_runtime_minutes),
    low_liquidity_since = null, last_reconciled_at = null,
    next_wake_at = v_now, last_action_type = 'OPEN_POOL',
    last_reason_code = 'always_on_system_started', version = version + 1
  where session_id = v_session.id;
  update public.live_odo_show_sessions set
    enabled = true, enabled_by_user_id = v_witness_user_id,
    show_state = 'odo_stage', current_scene = 'odo_stage', energy_mode = 'calm',
    program_source = 'system', control_source = 'odo', control_user_id = null,
    control_lease_expires_at = null, paused_by_host = false,
    scene_entered_at = v_now, next_wake_at = v_now,
    last_reason_code = 'always_on_system_started', version = version + 1
  where session_id = v_session.id;
  update public.live_music_session_state set
    status = 'stopped', track_id = null, playlist_id = null,
    effective_volume = 0, control_source = 'odo',
    last_action = 'stop', last_reason_code = 'always_on_system_started',
    version = version + 1
  where session_id = v_session.id;
  update public.live_odo_always_on_sessions set
    lifecycle_state = 'live', stream_resource_ready_at = v_now,
    lease_owner = null, lease_expires_at = null, version = version + 1
  where session_id = v_session.id;
  update public.live_quick_connect_opportunities set
    state = 'live', lease_owner = null, lease_expires_at = null,
    last_reason_code = 'system_session_live'
  where id = p_opportunity_id;
  update public.live_quick_connect_availability set
    status = 'consumed', version = version + 1
  where reserved_opportunity_id = p_opportunity_id;
  insert into public.live_session_events(session_id, event_type, from_state, to_state, metadata)
  values (v_session.id, 'system_session_started', 'backstage', 'live',
    jsonb_build_object('opportunity_id', p_opportunity_id, 'controller', 'odo'));
  perform public.live_odo_always_on_bump_user_v1(member.user_id)
  from public.live_quick_connect_opportunity_members member
  where member.opportunity_id = p_opportunity_id and member.state = 'accepted';
  perform private.send_push_webhook(jsonb_build_object(
    'user_id', member.user_id,
    'title', 'Your Quick Connect is ready',
    'body', 'Enter Live when you are ready. Camera and microphone stay off until you choose.',
    'data', jsonb_build_object(
      'type', 'live_quick_connect_ready',
      'session_id', v_session.id,
      'route', '/live/' || v_session.id::text
    )
  ))
  from public.live_quick_connect_opportunity_members member
  left join public.notification_prefs preferences on preferences.user_id = member.user_id
  where member.opportunity_id = p_opportunity_id and member.state = 'accepted'
    and coalesce(preferences.push_enabled, true);
  insert into public.live_quick_connect_opportunity_events(
    opportunity_id, event_type, reason_code, accepted_count, pair_edge_count,
    metadata
  ) values (
    p_opportunity_id, 'system_session_live', 'system_session_live',
    v_opportunity.accepted_count, v_opportunity.accepted_pair_edge_count,
    jsonb_build_object('sessionId', v_session.id, 'controlSource', 'odo')
  );
  return jsonb_build_object('started', true, 'idempotent', false,
    'sessionId', v_session.id, 'opportunityId', p_opportunity_id);
end;
$$;

create or replace function public.rpc_service_maintain_live_odo_always_on_sessions_v1()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  v_now timestamptz := timezone('utc', now());
  v_configuration public.live_odo_always_on_configuration;
  v_runtime record;
  v_present integer;
  v_active_pairs integer;
  v_eligible_pairs integer;
  v_reason text;
  v_drained integer := 0;
  v_ended integer := 0;
begin
  if not public.live_odo_is_service_role() then
    raise exception 'live_odo_service_role_required' using errcode = '42501';
  end if;
  select * into v_configuration from public.live_odo_always_on_configuration where id = true;
  for v_runtime in
    select always_on.*, session.status
    from public.live_odo_always_on_sessions always_on
    join public.live_sessions session on session.id = always_on.session_id
    where always_on.lifecycle_state in ('live','low_liquidity','draining','ending')
    order by always_on.updated_at, always_on.session_id
    limit 20
    for update of always_on skip locked
  loop
    select count(*)::integer into v_present
    from public.live_presence_leases presence
    where presence.session_id = v_runtime.session_id and presence.expires_at > v_now;
    select count(*)::integer into v_active_pairs
    from public.live_quick_connect_pairings pairing
    where pairing.session_id = v_runtime.session_id
      and pairing.state in ('active','reconnect_grace');
    v_eligible_pairs := public.live_odo_full_quick_eligible_pairs_v1(v_runtime.session_id);

    update public.live_odo_always_on_sessions set
      empty_since = case when v_present = 0 then coalesce(empty_since, v_now) else null end,
      low_liquidity_since = case when v_eligible_pairs = 0 and v_active_pairs = 0
        then coalesce(low_liquidity_since, v_now) else null end,
      lifecycle_state = case when lifecycle_state = 'live'
        and v_eligible_pairs = 0 and v_active_pairs = 0 then 'low_liquidity'
        when lifecycle_state = 'low_liquidity' and v_eligible_pairs > 0 then 'live'
        else lifecycle_state end,
      version = version + 1
    where session_id = v_runtime.session_id;

    select case
      when v_configuration.circuit_breaker_open then 'circuit_breaker_open'
      when v_now >= v_runtime.maximum_runtime_ends_at then 'maximum_runtime_reached'
      when (select empty_since from public.live_odo_always_on_sessions
        where session_id = v_runtime.session_id) <= v_now
          - make_interval(secs => v_configuration.empty_room_seconds)
        then 'empty_room_timeout'
      when (select low_liquidity_since from public.live_odo_always_on_sessions
        where session_id = v_runtime.session_id) <= v_now
          - make_interval(secs => v_configuration.low_liquidity_seconds)
        then 'low_liquidity_timeout'
      else null end into v_reason;
    if v_reason is not null
      and v_configuration.automatic_ending_enabled
      and v_runtime.lifecycle_state not in ('draining','ending') then
      update public.live_odo_always_on_sessions set
        lifecycle_state = 'draining', end_reason_code = v_reason,
        version = version + 1
      where session_id = v_runtime.session_id;
      update public.live_quick_connect_controls set state = 'draining'
      where session_id = v_runtime.session_id and state in ('open','paused');
      update public.live_odo_full_quick_connect_settings set
        lifecycle_state = 'draining', orchestration_state = 'draining',
        energy_mode = 'closing', next_wake_at = v_now,
        last_action_type = 'BEGIN_DRAINING', last_reason_code = v_reason,
        version = version + 1
      where session_id = v_runtime.session_id;
      update public.live_odo_show_sessions set
        show_state = 'draining', current_scene = 'session_closing',
        energy_mode = 'closing', next_wake_at = v_now,
        last_reason_code = v_reason, version = version + 1
      where session_id = v_runtime.session_id;
      update public.live_music_session_state set
        status = 'stopped', track_id = null, playlist_id = null,
        effective_volume = 0, last_action = 'stop',
        last_reason_code = v_reason, version = version + 1
      where session_id = v_runtime.session_id;
      v_drained := v_drained + 1;
    end if;

    if (select lifecycle_state from public.live_odo_always_on_sessions
        where session_id = v_runtime.session_id) in ('draining','ending') then
      perform public.live_quick_connect_sync(v_runtime.session_id);
      select count(*)::integer into v_active_pairs
      from public.live_quick_connect_pairings pairing
      where pairing.session_id = v_runtime.session_id
        and pairing.state in ('active','reconnect_grace');
      if v_active_pairs = 0 then
        update public.live_sessions set status = 'ending'
        where id = v_runtime.session_id and status = 'live';
        update public.live_sessions set status = 'ended', ended_at = coalesce(ended_at, v_now)
        where id = v_runtime.session_id and status = 'ending';
        update public.live_quick_connect_controls set state = 'ended'
        where session_id = v_runtime.session_id;
        update public.live_odo_full_quick_connect_settings set
          enabled = false, lifecycle_state = 'ended',
          orchestration_state = 'quick_connect_closed', next_wake_at = null,
          last_action_type = 'CLOSE_QUICK_CONNECT',
          last_reason_code = coalesce(v_reason, 'completed'), version = version + 1
        where session_id = v_runtime.session_id;
        update public.live_odo_show_sessions set
          enabled = false, show_state = 'closing', current_scene = 'session_closing',
          next_wake_at = null, control_source = 'system', control_user_id = null,
          control_lease_expires_at = null, last_reason_code = coalesce(v_reason, 'completed'),
          version = version + 1
        where session_id = v_runtime.session_id;
        update public.live_odo_session_state set
          autopilot_state = 'off', lease_owner = null, lease_expires_at = null,
          lease_heartbeat_at = null, state_version = state_version + 1
        where session_id = v_runtime.session_id;
        update public.live_odo_always_on_sessions set
          lifecycle_state = 'ended', lease_owner = null, lease_expires_at = null,
          end_reason_code = coalesce(end_reason_code, 'completed'), version = version + 1
        where session_id = v_runtime.session_id;
        update public.live_quick_connect_opportunities set
          state = 'completed', lease_owner = null, lease_expires_at = null,
          ended_reason_code = coalesce(v_reason, 'completed'),
          last_reason_code = 'system_session_ended'
        where id = v_runtime.opportunity_id;
        update public.live_quick_connect_opportunity_members set
          state = 'consumed', version = version + 1
        where opportunity_id = v_runtime.opportunity_id and state = 'accepted';
        delete from public.live_quick_connect_opportunity_reservations
        where opportunity_id = v_runtime.opportunity_id;
        update public.live_quick_connect_availability set
          status = case when expires_at <= v_now then 'expired' else 'paused' end,
          reserved_opportunity_id = null,
          cooldown_until = v_now
            + make_interval(mins => v_configuration.post_session_cooldown_minutes),
          version = version + 1
        where reserved_opportunity_id = v_runtime.opportunity_id;
        perform public.live_odo_always_on_bump_user_v1(member.user_id)
        from public.live_quick_connect_opportunity_members member
        where member.opportunity_id = v_runtime.opportunity_id;
        insert into public.live_quick_connect_opportunity_events(
          opportunity_id, event_type, reason_code, metadata
        ) values (
          v_runtime.opportunity_id, 'system_session_ended',
          coalesce(v_reason, 'completed'), jsonb_build_object('sessionId', v_runtime.session_id)
        );
        v_ended := v_ended + 1;
      end if;
    end if;
  end loop;
  return jsonb_build_object('drainingStarted', v_drained, 'sessionsEnded', v_ended);
end;
$$;

revoke all on function public.rpc_service_prepare_live_quick_connect_opportunity_session_v1(uuid, uuid),
  public.rpc_service_get_live_quick_connect_opportunity_work_v1(integer),
  public.rpc_service_finalize_live_quick_connect_opportunity_session_v1(uuid, uuid, boolean, text),
  public.rpc_service_maintain_live_odo_always_on_sessions_v1()
from public, anon, authenticated;
grant execute on function public.rpc_service_prepare_live_quick_connect_opportunity_session_v1(uuid, uuid),
  public.rpc_service_get_live_quick_connect_opportunity_work_v1(integer),
  public.rpc_service_finalize_live_quick_connect_opportunity_session_v1(uuid, uuid, boolean, text),
  public.rpc_service_maintain_live_odo_always_on_sessions_v1()
to service_role;

-- Extend the single existing maintenance clock. External Stream creation is
-- deliberately left to the Edge worker; SQL advances only transactional state.
alter function public.run_live_maintenance()
rename to run_live_maintenance_without_always_on_10f_v1;
revoke all on function public.run_live_maintenance_without_always_on_10f_v1()
from public, anon, authenticated;

create or replace function public.run_live_maintenance()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  v_base jsonb;
  v_opportunities jsonb;
  v_sessions jsonb;
  v_market record;
  v_detected integer := 0;
  v_failures integer := 0;
begin
  if current_user <> 'postgres' and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'live_maintenance_forbidden' using errcode = '42501';
  end if;
  v_base := public.run_live_maintenance_without_always_on_10f_v1();
  if v_base ->> 'status' = 'skipped_locked' then return v_base; end if;
  perform set_config('request.jwt.claim.role', 'service_role', true);
  begin
    v_opportunities := public.rpc_service_maintain_live_quick_connect_opportunities_v1();
  exception when others then
    v_failures := v_failures + 1;
    v_opportunities := jsonb_build_object('status', 'failed');
    insert into public.live_maintenance_failures(task_name, sqlstate, error_message)
    values ('always_on_opportunities', sqlstate, left(sqlerrm, 500));
  end;
  for v_market in
    select distinct availability.market_context
    from public.live_quick_connect_availability availability
    where availability.status = 'available'
      and availability.expires_at > timezone('utc', now())
    order by availability.market_context limit 16
  loop
    begin
      if (public.rpc_service_detect_live_quick_connect_opportunity_v1(
        v_market.market_context, gen_random_uuid()
      ) ->> 'detected')::boolean then v_detected := v_detected + 1; end if;
    exception when others then
      v_failures := v_failures + 1;
      insert into public.live_maintenance_failures(task_name, sqlstate, error_message)
      values ('always_on_detection', sqlstate, left(sqlerrm, 500));
    end;
  end loop;
  begin
    v_sessions := public.rpc_service_maintain_live_odo_always_on_sessions_v1();
  exception when others then
    v_failures := v_failures + 1;
    v_sessions := jsonb_build_object('status', 'failed');
    insert into public.live_maintenance_failures(task_name, sqlstate, error_message)
    values ('always_on_sessions', sqlstate, left(sqlerrm, 500));
  end;
  return v_base || jsonb_build_object('alwaysOnQuickConnect', jsonb_build_object(
    'opportunities', v_opportunities,
    'detected', v_detected,
    'sessions', v_sessions,
    'failures', v_failures
  ));
end;
$$;

revoke all on function public.run_live_maintenance() from public, anon, authenticated;
grant execute on function public.run_live_maintenance() to service_role;

commit;
