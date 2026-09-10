-- Betweener Live Phase 10F: distinguish an active experience from a dormant
-- RSVP/backstage membership. A participant only conflicts with Always-on
-- Quick Connect after they have actually joined the room.

begin;

create or replace function public.live_odo_always_on_has_active_experience_v1(
  p_user_id uuid,
  p_excluded_session_id uuid default null
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
  select p_user_id is not null and (
    exists (
      select 1
      from public.live_participants participant
      join public.live_sessions session on session.id = participant.session_id
      where participant.user_id = p_user_id
        and participant.joined_at is not null
        and participant.state in (
          'backstage', 'audience', 'stage_requested', 'on_stage',
          'private_spark', 'temporarily_disconnected'
        )
        and session.status in ('backstage', 'live', 'ending')
        and (p_excluded_session_id is null
          or session.id <> p_excluded_session_id)
    )
    or exists (
      select 1
      from public.live_private_sparks spark
      where p_user_id in (
        spark.participant_a_user_id, spark.participant_b_user_id
      )
        and (
          (spark.state = 'awaiting_consent'
            and (spark.consent_expires_at is null
              or spark.consent_expires_at > timezone('utc', now())))
          or (spark.state = 'active'
            and (spark.active_expires_at is null
              or spark.active_expires_at > timezone('utc', now())))
        )
    )
  );
$$;

comment on function public.live_odo_always_on_has_active_experience_v1(uuid, uuid)
is 'True only for a joined active Live or a non-expired Private Spark. Dormant RSVP and scheduled backstage rows do not block Always-on Quick Connect.';

revoke all on function public.live_odo_always_on_has_active_experience_v1(uuid, uuid)
from public, anon, authenticated, service_role;

create or replace function public.live_odo_always_on_pair_is_eligible_v1(
  p_user_a uuid,
  p_user_b uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
  select p_user_a is not null
    and p_user_b is not null
    and p_user_a <> p_user_b
    and exists (
      select 1
      from public.profiles profile_a
      join public.profiles profile_b on profile_b.user_id = p_user_b
      where profile_a.user_id = p_user_a
        and profile_a.deleted_at is null and profile_b.deleted_at is null
        and profile_a.account_state = 'active' and profile_b.account_state = 'active'
        and profile_a.profile_completed and profile_b.profile_completed
        and coalesce(profile_a.is_active, true) and coalesce(profile_b.is_active, true)
        and (
          not coalesce((select verified_users_only
            from public.live_odo_always_on_configuration where id = true), true)
          or (
            coalesce(profile_a.verification_level, 0) >= 1
            and coalesce(profile_b.verification_level, 0) >= 1
          )
        )
        and (
          (profile_a.gender = 'MALE'::public.gender and profile_b.gender = 'FEMALE'::public.gender)
          or (profile_a.gender = 'FEMALE'::public.gender and profile_b.gender = 'MALE'::public.gender)
        )
        and (
          profile_a.age_preference_confirmed_at is null
          or profile_a.min_age_interest is null or profile_b.age is null
          or profile_b.age >= profile_a.min_age_interest
        )
        and (
          profile_a.age_preference_confirmed_at is null
          or profile_a.max_age_interest is null or profile_b.age is null
          or profile_b.age <= profile_a.max_age_interest
        )
        and (
          profile_b.age_preference_confirmed_at is null
          or profile_b.min_age_interest is null or profile_a.age is null
          or profile_a.age >= profile_b.min_age_interest
        )
        and (
          profile_b.age_preference_confirmed_at is null
          or profile_b.max_age_interest is null or profile_a.age is null
          or profile_a.age <= profile_b.max_age_interest
        )
    )
    and public.live_quick_connect_intent_compatibility(p_user_a, p_user_b) > 0
    and not public.live_quick_connect_has_active_safety_hold(p_user_a)
    and not public.live_quick_connect_has_active_safety_hold(p_user_b)
    and not public.live_odo_always_on_has_active_experience_v1(p_user_a)
    and not public.live_odo_always_on_has_active_experience_v1(p_user_b)
    and not exists (
      select 1 from public.blocks blocked
      where (blocked.blocker_id = p_user_a and blocked.blocked_id = p_user_b)
         or (blocked.blocker_id = p_user_b and blocked.blocked_id = p_user_a)
    )
    and not exists (
      select 1 from public.live_quick_connect_pairings previous
      where least(previous.participant_a_user_id, previous.participant_b_user_id)
          = least(p_user_a, p_user_b)
        and greatest(previous.participant_a_user_id, previous.participant_b_user_id)
          = greatest(p_user_a, p_user_b)
        and previous.created_at >= timezone('utc', now()) - interval '7 days'
        and previous.state in ('active','reconnect_grace','completed')
    );
$$;

revoke all on function public.live_odo_always_on_pair_is_eligible_v1(uuid, uuid)
from public, anon, authenticated, service_role;

create or replace function public.rpc_set_live_quick_connect_availability_v1(
  p_duration_minutes integer,
  p_source text default 'live_lobby'
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
  v_profile public.profiles;
  v_current public.live_quick_connect_availability;
  v_market text;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  if p_source not in ('live_lobby','notification','post_live','internal_test') then
    raise exception 'live_availability_source_invalid' using errcode = '22023';
  end if;
  select * into v_configuration from public.live_odo_always_on_configuration where id = true;
  select * into v_profile from public.profiles profile
  where profile.user_id = auth.uid() and profile.deleted_at is null
    and profile.account_state = 'active' and profile.profile_completed
    and coalesce(profile.is_active, true)
    and (
      not v_configuration.verified_users_only
      or coalesce(profile.verification_level, 0) >= 1
    )
  limit 1;
  if v_profile.id is null then
    raise exception 'live_availability_profile_ineligible' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('always-on-user:' || auth.uid()::text, 0));
  select * into v_current from public.live_quick_connect_availability
  where user_id = auth.uid() for update;

  if p_duration_minutes = 0 then
    if v_current.reserved_opportunity_id is not null then
      update public.live_quick_connect_opportunity_members set
        state = 'withdrawn', responded_at = v_now,
        response_reason_code = 'availability_stopped', version = version + 1
      where opportunity_id = v_current.reserved_opportunity_id
        and user_id = auth.uid() and state in ('invited','accepted');
      delete from public.live_quick_connect_opportunity_reservations
      where user_id = auth.uid();
    end if;
    update public.live_quick_connect_availability set
      status = 'withdrawn', reserved_opportunity_id = null,
      expires_at = greatest(expires_at, v_now + interval '1 second'),
      version = version + 1
    where user_id = auth.uid();
    perform public.live_odo_always_on_bump_user_v1(auth.uid());
    return jsonb_build_object('active', false, 'status', 'withdrawn', 'serverNow', v_now);
  end if;

  if not public.live_odo_always_on_user_allowed_v1(auth.uid()) then
    raise exception 'live_availability_unavailable' using errcode = '42501';
  end if;
  if p_duration_minutes is null
    or not (p_duration_minutes = any(v_configuration.availability_durations_minutes)) then
    raise exception 'live_availability_duration_invalid' using errcode = '22023';
  end if;
  if v_current.not_tonight_until > v_now then
    return jsonb_build_object('active', false, 'status', 'paused',
      'reasonCode', 'not_tonight_active', 'notTonightUntil', v_current.not_tonight_until);
  end if;
  if v_current.cooldown_until > v_now then
    return jsonb_build_object('active', false, 'status', 'paused',
      'reasonCode', 'invitation_cooldown_active', 'cooldownUntil', v_current.cooldown_until);
  end if;
  if public.live_odo_always_on_has_active_experience_v1(auth.uid()) then
    raise exception 'live_availability_active_live_conflict' using errcode = '55000';
  end if;
  v_market := public.live_odo_always_on_market_v1(auth.uid());
  insert into public.live_quick_connect_availability(
    user_id, profile_id, status, source, market_context,
    available_from, expires_at, reserved_opportunity_id, cooldown_until, version
  ) values (
    auth.uid(), v_profile.id, 'available', p_source, v_market,
    v_now, v_now + make_interval(mins => p_duration_minutes), null, null, 1
  ) on conflict(user_id) do update set
    profile_id = excluded.profile_id,
    status = 'available', source = excluded.source,
    market_context = excluded.market_context,
    available_from = excluded.available_from,
    expires_at = excluded.expires_at,
    reserved_opportunity_id = null,
    cooldown_until = null,
    version = public.live_quick_connect_availability.version + 1;
  perform public.live_odo_always_on_bump_user_v1(auth.uid());
  return jsonb_build_object('active', true, 'status', 'available',
    'expiresAt', v_now + make_interval(mins => p_duration_minutes), 'serverNow', v_now);
end;
$$;

revoke all on function public.rpc_set_live_quick_connect_availability_v1(integer, text)
from public, anon, service_role;
grant execute on function public.rpc_set_live_quick_connect_availability_v1(integer, text)
to authenticated;

create or replace function public.live_odo_prepare_always_on_session_base_10f_v1(
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
    and not public.live_odo_always_on_has_active_experience_v1(member.user_id);
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

revoke all on function public.live_odo_prepare_always_on_session_base_10f_v1(uuid, uuid)
from public, anon, authenticated, service_role;

create or replace function public.live_odo_finalize_always_on_session_base_10f_v1(
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
      and (
        public.live_quick_connect_has_active_safety_hold(member.user_id)
        or public.live_odo_always_on_has_active_experience_v1(
          member.user_id, v_session.id
        )
      )
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

revoke all on function public.live_odo_finalize_always_on_session_base_10f_v1(
  uuid, uuid, boolean, text
) from public, anon, authenticated, service_role;

create or replace function public.rpc_service_maintain_live_quick_connect_opportunities_v1()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  v_now timestamptz := timezone('utc', now());
  v_row record;
  v_invalidated integer := 0;
  v_base jsonb;
begin
  if not public.live_odo_is_service_role() then
    raise exception 'live_odo_service_role_required' using errcode = '42501';
  end if;
  for v_row in
    select availability.user_id, availability.reserved_opportunity_id
    from public.live_quick_connect_availability availability
    left join public.profiles profile
      on profile.id = availability.profile_id and profile.user_id = availability.user_id
    where availability.status in ('available','reserved')
      and availability.expires_at > v_now
      and (
        profile.id is null or profile.deleted_at is not null
        or profile.account_state <> 'active' or not coalesce(profile.is_active, true)
        or public.live_quick_connect_has_active_safety_hold(availability.user_id)
        or public.live_odo_always_on_has_active_experience_v1(
          availability.user_id,
          (
            select opportunity.live_session_id
            from public.live_quick_connect_opportunities opportunity
            where opportunity.id = availability.reserved_opportunity_id
          )
        )
      )
    order by availability.user_id
    for update of availability skip locked
  loop
    if v_row.reserved_opportunity_id is not null then
      update public.live_quick_connect_opportunity_members set
        state = 'invalidated', responded_at = v_now,
        response_reason_code = 'automatic_availability_invalidation',
        version = version + 1
      where opportunity_id = v_row.reserved_opportunity_id
        and user_id = v_row.user_id and state in ('invited','accepted');
      delete from public.live_quick_connect_opportunity_reservations
      where user_id = v_row.user_id
        and opportunity_id = v_row.reserved_opportunity_id;
    end if;
    update public.live_quick_connect_availability set
      status = 'invalidated', reserved_opportunity_id = null,
      version = version + 1
    where user_id = v_row.user_id;
    perform public.live_odo_always_on_bump_user_v1(v_row.user_id);
    v_invalidated := v_invalidated + 1;
  end loop;
  v_base := public.live_odo_maintain_opportunities_base_10f_v1();
  return v_base || jsonb_build_object('invalidatedAvailability', v_invalidated);
end;
$$;

revoke all on function public.rpc_service_maintain_live_quick_connect_opportunities_v1()
from public, anon, authenticated;
grant execute on function public.rpc_service_maintain_live_quick_connect_opportunities_v1()
to service_role;

commit;
