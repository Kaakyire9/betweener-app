-- Betweener Live Phase 10F: deterministic, bounded opportunity engine and
-- narrow client/service RPC boundaries. No model is used in detection.
-- Presence never grants availability; it only filters an explicit window.

begin;

create or replace function public.live_odo_always_on_market_v1(p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
  select case
    when coalesce((select internal_only from public.live_odo_always_on_configuration
      where id = true), true) then 'internal'
    else coalesce(
      'country:' || public.normalize_location_key(profile.current_country_code),
      'country:' || public.normalize_location_key(profile.current_country),
      'region:' || public.normalize_location_key(profile.region),
      'global'
    )
  end
  from public.profiles profile
  where profile.user_id = p_user_id
    and profile.deleted_at is null
    and profile.account_state = 'active'
  limit 1;
$$;

create or replace function public.live_odo_always_on_user_allowed_v1(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
  select p_user_id is not null
    and coalesce(configuration.availability_enabled, false)
    and not coalesce(configuration.circuit_breaker_open, true)
    and (
      not configuration.internal_only
      or exists (
        select 1 from public.live_odo_always_on_access access
        where access.user_id = p_user_id
          and access.allowed
          and (access.expires_at is null or access.expires_at > timezone('utc', now()))
      )
    )
    and public.live_odo_always_on_market_v1(p_user_id) = any(configuration.allowed_markets)
  from public.live_odo_always_on_configuration configuration
  where configuration.id = true;
$$;

create or replace function public.live_odo_always_on_bump_user_v1(p_user_id uuid)
returns void
language sql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
  insert into public.live_quick_connect_opportunity_updates(user_id, version)
  values (p_user_id, 1)
  on conflict(user_id) do update set
    version = public.live_quick_connect_opportunity_updates.version + 1,
    updated_at = timezone('utc', now());
$$;

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
    and not exists (
      select 1 from public.blocks blocked
      where (blocked.blocker_id = p_user_a and blocked.blocked_id = p_user_b)
         or (blocked.blocker_id = p_user_b and blocked.blocked_id = p_user_a)
    )
    and not exists (
      select 1 from public.live_private_sparks spark
      where (
        (spark.state = 'awaiting_consent'
          and (spark.consent_expires_at is null or spark.consent_expires_at > timezone('utc', now())))
        or (spark.state = 'active'
          and (spark.active_expires_at is null or spark.active_expires_at > timezone('utc', now())))
      )
      and (
        p_user_a in (spark.participant_a_user_id, spark.participant_b_user_id)
        or p_user_b in (spark.participant_a_user_id, spark.participant_b_user_id)
      )
    )
    and not exists (
      select 1 from public.live_participants participant
      join public.live_sessions session on session.id = participant.session_id
      where participant.user_id in (p_user_a, p_user_b)
        and participant.state not in ('left','removed','banned')
        and session.status in ('backstage','live','ending')
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

revoke all on function public.live_odo_always_on_market_v1(uuid),
  public.live_odo_always_on_user_allowed_v1(uuid),
  public.live_odo_always_on_bump_user_v1(uuid),
  public.live_odo_always_on_pair_is_eligible_v1(uuid, uuid)
from public, anon, authenticated, service_role;

create or replace function public.rpc_get_live_quick_connect_availability_v1()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  v_now timestamptz := timezone('utc', now());
  v_configuration public.live_odo_always_on_configuration;
  v_availability public.live_quick_connect_availability;
  v_member public.live_quick_connect_opportunity_members;
  v_opportunity public.live_quick_connect_opportunities;
  v_allowed boolean;
begin
  if auth.uid() is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;
  select * into v_configuration from public.live_odo_always_on_configuration where id = true;
  select * into v_availability from public.live_quick_connect_availability
  where user_id = auth.uid();
  select member.* into v_member
  from public.live_quick_connect_opportunity_members member
  join public.live_quick_connect_opportunities opportunity
    on opportunity.id = member.opportunity_id
  where member.user_id = auth.uid()
    and member.state in ('invited','accepted')
    and opportunity.state in ('inviting','awaiting_quorum','quorum_reached','creating_session','starting','live')
  order by opportunity.created_at desc limit 1;
  if v_member.opportunity_id is not null then
    select * into v_opportunity from public.live_quick_connect_opportunities
    where id = v_member.opportunity_id;
  end if;
  v_allowed := public.live_odo_always_on_user_allowed_v1(auth.uid());
  return jsonb_build_object(
    'schemaVersion', 1,
    'serverNow', v_now,
    'available', v_allowed,
    'unavailableReasonCode', case
      when v_configuration.id is null or not v_configuration.availability_enabled
        then 'availability_disabled'
      when v_configuration.circuit_breaker_open then 'circuit_breaker_open'
      when not v_allowed then 'internal_rollout_only'
      else null end,
    'durationOptionsMinutes', coalesce(v_configuration.availability_durations_minutes, array[15,30,60]),
    'availability', case when v_availability.user_id is null then null else jsonb_build_object(
      'status', case when v_availability.status in ('available','reserved')
          and v_availability.expires_at <= v_now then 'expired' else v_availability.status end,
      'expiresAt', v_availability.expires_at,
      'marketContext', v_availability.market_context,
      'cooldownUntil', v_availability.cooldown_until,
      'notTonightUntil', v_availability.not_tonight_until,
      'version', v_availability.version
    ) end,
    'opportunity', case when v_opportunity.id is null then null else jsonb_build_object(
      'id', v_opportunity.id,
      'state', v_opportunity.state,
      'myState', v_member.state,
      'expiresAt', least(v_opportunity.expires_at, coalesce(v_member.invitation_expires_at, v_opportunity.expires_at)),
      'acceptedCount', v_opportunity.accepted_count,
      'minimumCount', v_configuration.minimum_cohort_size,
      'sessionId', case when v_member.state = 'accepted' then v_opportunity.live_session_id else null end,
      'reasonCode', v_opportunity.last_reason_code
    ) end
  );
end;
$$;

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
  if exists (
    select 1 from public.live_participants participant
    join public.live_sessions session on session.id = participant.session_id
    where participant.user_id = auth.uid()
      and participant.state not in ('left','removed','banned')
      and session.status in ('backstage','live','ending')
  ) or exists (
    select 1 from public.live_private_sparks spark
    where auth.uid() in (spark.participant_a_user_id, spark.participant_b_user_id)
      and spark.state in ('awaiting_consent','active')
  ) then
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

create or replace function public.rpc_respond_live_quick_connect_opportunity_v1(
  p_opportunity_id uuid,
  p_response text,
  p_expected_version bigint default null
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
  v_member public.live_quick_connect_opportunity_members;
  v_availability public.live_quick_connect_availability;
  v_accepted_ids uuid[];
  v_accepted_count integer := 0;
  v_edges integer := 0;
  v_next_state text;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  if p_response not in ('accept','not_now','not_tonight','withdraw') then
    raise exception 'live_opportunity_response_invalid' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('always-on-opportunity:' || p_opportunity_id::text, 0));
  select * into v_configuration from public.live_odo_always_on_configuration where id = true;
  select * into v_opportunity from public.live_quick_connect_opportunities
  where id = p_opportunity_id for update;
  select * into v_member from public.live_quick_connect_opportunity_members
  where opportunity_id = p_opportunity_id and user_id = auth.uid() for update;
  select * into v_availability from public.live_quick_connect_availability
  where user_id = auth.uid() for update;
  if v_opportunity.id is null or v_member.user_id is null then
    raise exception 'live_opportunity_not_found' using errcode = 'P0002';
  end if;
  if p_expected_version is not null and v_member.version <> p_expected_version then
    raise exception 'live_opportunity_version_conflict' using errcode = '40001';
  end if;
  if v_opportunity.state not in ('inviting','awaiting_quorum','quorum_reached','creating_session','starting')
    or v_opportunity.expires_at <= v_now then
    raise exception 'live_opportunity_unavailable' using errcode = '55000';
  end if;

  if p_response = 'accept' then
    if v_member.state = 'accepted' then
      return public.rpc_get_live_quick_connect_availability_v1();
    end if;
    if v_member.state <> 'invited' or v_member.invitation_expires_at <= v_now
      or v_availability.status <> 'reserved'
      or v_availability.reserved_opportunity_id <> p_opportunity_id
      or v_availability.expires_at <= v_now
      or not public.live_odo_always_on_user_allowed_v1(auth.uid())
      or not exists (select 1 from public.user_presence presence
        where presence.user_id = auth.uid() and presence.online
          and presence.last_active >= v_now
            - make_interval(secs => v_configuration.presence_freshness_seconds))
      or public.live_quick_connect_has_active_safety_hold(auth.uid()) then
      raise exception 'live_opportunity_acceptance_ineligible' using errcode = '42501';
    end if;
    update public.live_quick_connect_opportunity_members set
      state = 'accepted', responded_at = v_now,
      response_reason_code = 'accepted', version = version + 1
    where opportunity_id = p_opportunity_id and user_id = auth.uid();
  else
    update public.live_quick_connect_opportunity_members set
      state = case p_response when 'not_now' then 'not_now'
        when 'not_tonight' then 'not_tonight' else 'withdrawn' end,
      responded_at = v_now,
      response_reason_code = case p_response when 'not_now' then 'user_not_now'
        when 'not_tonight' then 'user_not_tonight' else 'user_withdrew' end,
      version = version + 1
    where opportunity_id = p_opportunity_id and user_id = auth.uid();
    delete from public.live_quick_connect_opportunity_reservations
    where user_id = auth.uid() and opportunity_id = p_opportunity_id;
    update public.live_quick_connect_availability set
      status = case when p_response = 'withdraw' then 'withdrawn' else 'paused' end,
      reserved_opportunity_id = null,
      cooldown_until = case when p_response = 'not_now'
        then v_now + make_interval(mins => v_configuration.invitation_cooldown_minutes)
        else cooldown_until end,
      not_tonight_until = case when p_response = 'not_tonight'
        then v_now + make_interval(hours => v_configuration.not_tonight_hours)
        else not_tonight_until end,
      version = version + 1
    where user_id = auth.uid();
  end if;

  select coalesce(array_agg(member.user_id order by member.user_id), array[]::uuid[])
  into v_accepted_ids
  from public.live_quick_connect_opportunity_members member
  where member.opportunity_id = p_opportunity_id and member.state = 'accepted';
  v_accepted_count := cardinality(v_accepted_ids);
  select count(*)::integer into v_edges
  from unnest(v_accepted_ids) with ordinality user_a(user_id, position)
  join unnest(v_accepted_ids) with ordinality user_b(user_id, position)
    on user_b.position > user_a.position
  where public.live_odo_always_on_pair_is_eligible_v1(user_a.user_id, user_b.user_id);
  v_next_state := case
    when v_accepted_count >= v_configuration.minimum_cohort_size and v_edges > 0
      then 'quorum_reached'
    else 'awaiting_quorum' end;
  update public.live_quick_connect_opportunities set
    accepted_count = v_accepted_count,
    accepted_pair_edge_count = v_edges,
    state = case when state in ('inviting','awaiting_quorum','quorum_reached')
      then v_next_state else state end,
    last_reason_code = case when v_next_state = 'quorum_reached'
      then 'pairability_quorum_reached' else 'awaiting_pairability_quorum' end
  where id = p_opportunity_id;
  perform public.live_odo_always_on_bump_user_v1(auth.uid());
  perform public.live_odo_always_on_bump_user_v1(member.user_id)
  from public.live_quick_connect_opportunity_members member
  where member.opportunity_id = p_opportunity_id and member.user_id <> auth.uid();
  insert into public.live_quick_connect_opportunity_events(
    opportunity_id, event_type, reason_code, accepted_count, pair_edge_count
  ) values (
    p_opportunity_id, 'member_response',
    case p_response when 'accept' then 'accepted' when 'not_now' then 'user_not_now'
      when 'not_tonight' then 'user_not_tonight' else 'user_withdrew' end,
    v_accepted_count, v_edges
  );
  return public.rpc_get_live_quick_connect_availability_v1();
end;
$$;

revoke all on function public.rpc_get_live_quick_connect_availability_v1(),
  public.rpc_set_live_quick_connect_availability_v1(integer, text),
  public.rpc_respond_live_quick_connect_opportunity_v1(uuid, text, bigint)
from public, anon, service_role;
grant execute on function public.rpc_get_live_quick_connect_availability_v1(),
  public.rpc_set_live_quick_connect_availability_v1(integer, text),
  public.rpc_respond_live_quick_connect_opportunity_v1(uuid, text, bigint)
to authenticated;

create or replace function public.rpc_service_detect_live_quick_connect_opportunity_v1(
  p_market_context text,
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
  v_started timestamptz := clock_timestamp();
  v_configuration public.live_odo_always_on_configuration;
  v_candidate_ids uuid[] := array[]::uuid[];
  v_cohort_ids uuid[] := array[]::uuid[];
  v_candidate_count integer := 0;
  v_edge_count integer := 0;
  v_opportunity public.live_quick_connect_opportunities;
  v_bucket timestamptz := date_trunc('minute', timezone('utc', now()));
  v_user_id uuid;
begin
  if not public.live_odo_is_service_role() then
    raise exception 'live_odo_service_role_required' using errcode = '42501';
  end if;
  if p_worker_id is null or p_market_context is null
    or p_market_context !~ '^[a-z0-9][a-z0-9:_-]{0,79}$' then
    raise exception 'live_opportunity_detection_invalid' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('always-on-market:' || p_market_context, 0));
  select * into v_configuration from public.live_odo_always_on_configuration
  where id = true for update;
  if v_configuration.id is null or v_configuration.circuit_breaker_open
    or not v_configuration.shadow_detection_enabled
    or not (p_market_context = any(v_configuration.allowed_markets)) then
    return jsonb_build_object('detected', false, 'reasonCode', 'opportunity_detection_disabled');
  end if;
  if exists (
    select 1 from public.live_quick_connect_opportunities opportunity
    where opportunity.market_context = p_market_context
      and opportunity.state in (
        'detected','forming','inviting','awaiting_quorum','quorum_reached',
        'creating_session','starting','live'
      )
  ) then
    return jsonb_build_object('detected', false, 'reasonCode', 'active_market_opportunity_exists');
  end if;

  with bounded as (
    select availability.user_id
    from public.live_quick_connect_availability availability
    join public.profiles profile on profile.id = availability.profile_id
      and profile.user_id = availability.user_id
    join public.user_presence presence on presence.user_id = availability.user_id
    left join public.notification_prefs preferences on preferences.user_id = availability.user_id
    where availability.market_context = p_market_context
      and availability.status = 'available'
      and availability.available_from <= v_now
      and availability.expires_at > v_now
      and coalesce(availability.cooldown_until, '-infinity'::timestamptz) <= v_now
      and coalesce(availability.not_tonight_until, '-infinity'::timestamptz) <= v_now
      and profile.deleted_at is null and profile.account_state = 'active'
      and profile.profile_completed and coalesce(profile.is_active, true)
      and (
        not v_configuration.verified_users_only
        or coalesce(profile.verification_level, 0) >= 1
      )
      and presence.online
      and presence.last_active >= v_now
        - make_interval(secs => v_configuration.presence_freshness_seconds)
      and coalesce(preferences.live_always_on_invitations, true)
      and not public.is_quiet_hours(availability.user_id)
      and not public.live_quick_connect_has_active_safety_hold(availability.user_id)
      and not exists (select 1 from public.live_quick_connect_opportunity_reservations reservation
        where reservation.user_id = availability.user_id and reservation.expires_at > v_now)
      and (select count(*) from public.live_quick_connect_opportunity_members recent
        where recent.user_id = availability.user_id
          and recent.invitation_sent_at >= date_trunc('day', v_now))
        < v_configuration.maximum_invitations_per_day
    order by availability.available_from, availability.user_id
    limit v_configuration.candidate_scan_limit
  )
  select coalesce(array_agg(user_id order by user_id), array[]::uuid[])
  into v_candidate_ids from bounded;
  v_candidate_count := cardinality(v_candidate_ids);
  if v_candidate_count < 2 then
    insert into public.live_quick_connect_opportunity_events(
      event_type, reason_code, candidate_count, pair_edge_count, duration_ms,
      metadata
    ) values (
      'detection_skipped', 'insufficient_available_candidates', v_candidate_count, 0,
      extract(milliseconds from clock_timestamp() - v_started)::integer,
      jsonb_build_object('marketContext', p_market_context, 'shadowOnly', true)
    );
    return jsonb_build_object('detected', false,
      'reasonCode', 'insufficient_available_candidates', 'candidateCount', v_candidate_count);
  end if;

  with edges as (
    select user_a.user_id user_a, user_b.user_id user_b
    from unnest(v_candidate_ids) with ordinality user_a(user_id, position)
    join unnest(v_candidate_ids) with ordinality user_b(user_id, position)
      on user_b.position > user_a.position
    where public.live_odo_always_on_pair_is_eligible_v1(user_a.user_id, user_b.user_id)
    order by user_a.position, user_b.position
    limit v_configuration.edge_scan_limit
  ), nodes as (
    select user_id, min(position) position from (
      select user_a user_id, row_number() over () position from edges
      union all
      select user_b user_id, row_number() over () position from edges
    ) values_with_position
    group by user_id
  )
  select
    (select count(*)::integer from edges),
    coalesce((select array_agg(user_id order by position, user_id)
      from (select * from nodes order by position, user_id
        limit v_configuration.maximum_cohort_size) bounded_nodes), array[]::uuid[])
  into v_edge_count, v_cohort_ids;

  if v_edge_count = 0 or cardinality(v_cohort_ids) < v_configuration.minimum_cohort_size then
    insert into public.live_quick_connect_opportunity_events(
      event_type, reason_code, candidate_count, pair_edge_count, duration_ms,
      metadata
    ) values (
      'detection_skipped', 'insufficient_pairability_graph', v_candidate_count, v_edge_count,
      extract(milliseconds from clock_timestamp() - v_started)::integer,
      jsonb_build_object('marketContext', p_market_context, 'shadowOnly', true)
    );
    return jsonb_build_object('detected', false,
      'reasonCode', 'insufficient_pairability_graph',
      'candidateCount', v_candidate_count, 'pairEdgeCount', v_edge_count);
  end if;

  insert into public.live_quick_connect_opportunities(
    market_context, formation_bucket, state, shadow_only,
    candidate_count, pair_edge_count, isolated_count, expires_at,
    lease_owner, lease_expires_at, last_reason_code
  ) values (
    p_market_context, v_bucket,
    case when v_configuration.invitations_enabled then 'inviting' else 'completed' end,
    not v_configuration.invitations_enabled,
    v_candidate_count, v_edge_count,
    greatest(v_candidate_count - cardinality(v_cohort_ids), 0),
    v_now + make_interval(secs => v_configuration.opportunity_ttl_seconds),
    case when v_configuration.invitations_enabled then p_worker_id else null end,
    case when v_configuration.invitations_enabled
      then v_now + make_interval(secs => v_configuration.worker_lease_seconds) else null end,
    case when v_configuration.invitations_enabled
      then 'candidate_cohort_reserved' else 'shadow_opportunity_recorded' end
  ) returning * into v_opportunity;

  if not v_configuration.invitations_enabled then
    insert into public.live_quick_connect_opportunity_events(
      opportunity_id, event_type, reason_code, candidate_count, pair_edge_count,
      duration_ms, metadata
    ) values (
      v_opportunity.id, 'shadow_detected', 'shadow_opportunity_recorded',
      v_candidate_count, v_edge_count,
      extract(milliseconds from clock_timestamp() - v_started)::integer,
      jsonb_build_object('marketContext', p_market_context, 'shadowOnly', true)
    );
    return jsonb_build_object('detected', true, 'shadowOnly', true,
      'opportunityId', v_opportunity.id, 'candidateCount', v_candidate_count,
      'pairEdgeCount', v_edge_count);
  end if;

  foreach v_user_id in array v_cohort_ids loop
    insert into public.live_quick_connect_opportunity_reservations(
      user_id, opportunity_id, availability_version, expires_at
    )
    select availability.user_id, v_opportunity.id, availability.version,
      least(availability.expires_at, v_opportunity.expires_at)
    from public.live_quick_connect_availability availability
    where availability.user_id = v_user_id and availability.status = 'available'
      and availability.expires_at > v_now
    on conflict(user_id) do nothing;
  end loop;
  insert into public.live_quick_connect_opportunity_members(
    opportunity_id, user_id, profile_id, state,
    invitation_sent_at, invitation_expires_at
  )
  select v_opportunity.id, reservation.user_id, availability.profile_id, 'invited',
    v_now, least(v_opportunity.expires_at,
      v_now + make_interval(secs => v_configuration.invitation_ttl_seconds))
  from public.live_quick_connect_opportunity_reservations reservation
  join public.live_quick_connect_availability availability
    on availability.user_id = reservation.user_id
  where reservation.opportunity_id = v_opportunity.id;
  update public.live_quick_connect_availability availability set
    status = 'reserved', reserved_opportunity_id = v_opportunity.id,
    last_invited_at = v_now, version = availability.version + 1
  where availability.user_id in (
    select member.user_id from public.live_quick_connect_opportunity_members member
    where member.opportunity_id = v_opportunity.id
  );
  if (select count(*) from public.live_quick_connect_opportunity_members member
      where member.opportunity_id = v_opportunity.id) < v_configuration.minimum_cohort_size then
    update public.live_quick_connect_opportunities set
      state = 'cancelled', lease_owner = null, lease_expires_at = null,
      last_reason_code = 'reservation_race_lost'
    where id = v_opportunity.id;
    delete from public.live_quick_connect_opportunity_reservations
    where opportunity_id = v_opportunity.id;
    update public.live_quick_connect_availability set
      status = 'available', reserved_opportunity_id = null, version = version + 1
    where reserved_opportunity_id = v_opportunity.id;
    return jsonb_build_object('detected', false, 'reasonCode', 'reservation_race_lost');
  end if;
  update public.live_quick_connect_opportunities set
    state = 'awaiting_quorum', lease_owner = null, lease_expires_at = null,
    last_reason_code = 'invitations_sent'
  where id = v_opportunity.id;
  perform public.live_odo_always_on_bump_user_v1(member.user_id)
  from public.live_quick_connect_opportunity_members member
  where member.opportunity_id = v_opportunity.id;
  perform private.send_push_webhook(jsonb_build_object(
    'user_id', member.user_id,
    'title', 'A Quick Connect is forming',
    'body', 'You are available now. Join this private formation if the moment still works.',
    'data', jsonb_build_object(
      'type', 'live_quick_connect_opportunity',
      'opportunity_id', v_opportunity.id,
      'route', '/live/opportunity/' || v_opportunity.id::text
    )
  ))
  from public.live_quick_connect_opportunity_members member
  left join public.notification_prefs preferences on preferences.user_id = member.user_id
  where member.opportunity_id = v_opportunity.id
    and coalesce(preferences.push_enabled, true);
  insert into public.live_quick_connect_opportunity_events(
    opportunity_id, event_type, reason_code, candidate_count, pair_edge_count,
    duration_ms, metadata
  ) values (
    v_opportunity.id, 'invitations_sent', 'pairable_cohort_invited',
    v_candidate_count, v_edge_count,
    extract(milliseconds from clock_timestamp() - v_started)::integer,
    jsonb_build_object('marketContext', p_market_context,
      'invitedCount', (select count(*) from public.live_quick_connect_opportunity_members
        where opportunity_id = v_opportunity.id))
  );
  return jsonb_build_object('detected', true, 'shadowOnly', false,
    'opportunityId', v_opportunity.id, 'candidateCount', v_candidate_count,
    'pairEdgeCount', v_edge_count);
end;
$$;

create or replace function public.rpc_service_maintain_live_quick_connect_opportunities_v1()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  v_now timestamptz := timezone('utc', now());
  v_expired_availability integer := 0;
  v_expired_invitations integer := 0;
  v_expired_opportunities integer := 0;
begin
  if not public.live_odo_is_service_role() then
    raise exception 'live_odo_service_role_required' using errcode = '42501';
  end if;
  update public.live_quick_connect_availability set
    status = 'expired', reserved_opportunity_id = null, version = version + 1
  where status in ('available','reserved') and expires_at <= v_now;
  get diagnostics v_expired_availability = row_count;
  update public.live_quick_connect_opportunity_members member set
    state = 'expired', responded_at = v_now,
    response_reason_code = 'invitation_expired', version = member.version + 1
  where member.state = 'invited' and member.invitation_expires_at <= v_now;
  get diagnostics v_expired_invitations = row_count;
  update public.live_quick_connect_opportunities opportunity set
    state = 'expired', lease_owner = null, lease_expires_at = null,
    last_reason_code = 'formation_timeout'
  where opportunity.state in ('detected','forming','inviting','awaiting_quorum','quorum_reached')
    and opportunity.expires_at <= v_now;
  get diagnostics v_expired_opportunities = row_count;
  delete from public.live_quick_connect_opportunity_reservations reservation
  where reservation.expires_at <= v_now
    or exists (select 1 from public.live_quick_connect_opportunities opportunity
      where opportunity.id = reservation.opportunity_id
        and opportunity.state in ('expired','failed','cancelled','completed'));
  update public.live_quick_connect_availability availability set
    status = case when availability.expires_at <= v_now then 'expired' else 'available' end,
    reserved_opportunity_id = null,
    cooldown_until = case when availability.expires_at > v_now
      then greatest(coalesce(availability.cooldown_until, v_now), v_now + interval '5 minutes')
      else availability.cooldown_until end,
    version = availability.version + 1
  where availability.status = 'reserved'
    and not exists (select 1 from public.live_quick_connect_opportunity_reservations reservation
      where reservation.user_id = availability.user_id);
  perform public.live_odo_always_on_bump_user_v1(member.user_id)
  from public.live_quick_connect_opportunity_members member
  where member.responded_at = v_now or member.updated_at = v_now;
  return jsonb_build_object(
    'expiredAvailability', v_expired_availability,
    'expiredInvitations', v_expired_invitations,
    'expiredOpportunities', v_expired_opportunities
  );
end;
$$;

revoke all on function public.rpc_service_detect_live_quick_connect_opportunity_v1(text, uuid),
  public.rpc_service_maintain_live_quick_connect_opportunities_v1()
from public, anon, authenticated;
grant execute on function public.rpc_service_detect_live_quick_connect_opportunity_v1(text, uuid),
  public.rpc_service_maintain_live_quick_connect_opportunities_v1()
to service_role;

commit;
