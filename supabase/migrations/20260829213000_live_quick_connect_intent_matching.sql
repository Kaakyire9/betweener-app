-- Quick Connect intention matching and automatic opposite-sex eligibility.
-- This is a forward correction for the already-deployed private gender-choice flow.

begin;

create or replace function public.normalize_live_quick_connect_intent(p_value text)
returns text
language sql
immutable
set search_path = public, pg_catalog
as $$
  select case
    when lower(btrim(coalesce(p_value, ''))) in ('marriage', 'marriage_minded')
      or lower(btrim(coalesce(p_value, ''))) ~ '(marriage|wife|husband)'
      then 'marriage'
    when lower(btrim(coalesce(p_value, ''))) in ('long_term', 'long-term')
      or lower(btrim(coalesce(p_value, ''))) ~ '(long.?term|life partner)'
      then 'long_term'
    when lower(btrim(coalesce(p_value, ''))) in ('serious', 'committed')
      or lower(btrim(coalesce(p_value, ''))) ~ '(serious|committed)'
      then 'serious'
    else 'open'
  end;
$$;

alter table public.live_quick_connect_preferences
  add column if not exists connection_intent text;

update public.live_quick_connect_preferences preference
set
  connection_intent = public.normalize_live_quick_connect_intent(coalesce(
    profile.relationship_compass ->> 'intention',
    profile.looking_for,
    'open'
  )),
  allowed_genders = case profile.gender
    when 'MALE'::public.gender then array['FEMALE'::public.gender]
    when 'FEMALE'::public.gender then array['MALE'::public.gender]
    else preference.allowed_genders
  end,
  updated_at = timezone('utc', now())
from public.profiles profile
where profile.user_id = preference.user_id;

update public.live_quick_connect_preferences
set connection_intent = 'open'
where connection_intent is null;

alter table public.live_quick_connect_preferences
  alter column connection_intent set default 'open',
  alter column connection_intent set not null;

alter table public.live_quick_connect_preferences
  drop constraint if exists live_quick_preferences_intent_valid;
alter table public.live_quick_connect_preferences
  add constraint live_quick_preferences_intent_valid
  check (connection_intent in ('serious', 'long_term', 'marriage', 'open'));

create or replace function public.live_quick_connect_intent_compatibility(
  p_user_a uuid,
  p_user_b uuid
) returns smallint
language sql
stable
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
  with intentions as (
    select
      coalesce(a.connection_intent, 'open') as intent_a,
      coalesce(b.connection_intent, 'open') as intent_b
    from (select 1) seed
    left join public.live_quick_connect_preferences a on a.user_id = p_user_a
    left join public.live_quick_connect_preferences b on b.user_id = p_user_b
  )
  select case
    when intent_a = intent_b then 4
    when intent_a in ('serious', 'long_term', 'marriage')
      and intent_b in ('serious', 'long_term', 'marriage') then 3
    when intent_a = 'open' or intent_b = 'open' then 2
    else 1
  end::smallint
  from intentions;
$$;

revoke all on function public.normalize_live_quick_connect_intent(text),
  public.live_quick_connect_intent_compatibility(uuid, uuid)
from public, anon, authenticated;

create or replace function public.live_quick_connect_pair_is_eligible(
  p_session_id uuid,
  p_user_a uuid,
  p_user_b uuid
) returns boolean
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
      from public.live_sessions session
      join public.live_participants a
        on a.session_id = session.id and a.user_id = p_user_a
      join public.live_participants b
        on b.session_id = session.id and b.user_id = p_user_b
      join public.live_quick_connect_participants qa
        on qa.session_id = session.id and qa.user_id = p_user_a
      join public.live_quick_connect_participants qb
        on qb.session_id = session.id and qb.user_id = p_user_b
      join public.profiles pa on pa.id = a.profile_id and pa.user_id = a.user_id
      join public.profiles pb on pb.id = b.profile_id and pb.user_id = b.user_id
      where session.id = p_session_id
        and session.format = 'quick_connect'
        and session.status = 'live'
        and a.state in ('audience', 'stage_requested', 'backstage', 'on_stage')
        and b.state in ('audience', 'stage_requested', 'backstage', 'on_stage')
        and qa.state = 'waiting'
        and qb.state = 'waiting'
        and qa.connection_state = 'connected'
        and qb.connection_state = 'connected'
        and qa.last_seen_at >= timezone('utc', now()) - interval '45 seconds'
        and qb.last_seen_at >= timezone('utc', now()) - interval '45 seconds'
        and pa.deleted_at is null and pb.deleted_at is null
        and pa.account_state = 'active' and pb.account_state = 'active'
        and pa.profile_completed and pb.profile_completed
        and coalesce(pa.is_active, true) and coalesce(pb.is_active, true)
        and coalesce(pa.verification_level, 0) >= 1
        and coalesce(pb.verification_level, 0) >= 1
        and (
          (pa.gender = 'MALE'::public.gender and pb.gender = 'FEMALE'::public.gender)
          or (pa.gender = 'FEMALE'::public.gender and pb.gender = 'MALE'::public.gender)
        )
        and (
          pa.age_preference_confirmed_at is null
          or pa.min_age_interest is null or pb.age is null
          or pb.age >= pa.min_age_interest
        )
        and (
          pa.age_preference_confirmed_at is null
          or pa.max_age_interest is null or pb.age is null
          or pb.age <= pa.max_age_interest
        )
        and (
          pb.age_preference_confirmed_at is null
          or pb.min_age_interest is null or pa.age is null
          or pa.age >= pb.min_age_interest
        )
        and (
          pb.age_preference_confirmed_at is null
          or pb.max_age_interest is null or pa.age is null
          or pa.age <= pb.max_age_interest
        )
        and not public.live_quick_connect_has_active_safety_hold(p_user_a)
        and not public.live_quick_connect_has_active_safety_hold(p_user_b)
        and not exists (
          select 1 from public.blocks blocked
          where (blocked.blocker_id = p_user_a and blocked.blocked_id = p_user_b)
             or (blocked.blocker_id = p_user_b and blocked.blocked_id = p_user_a)
        )
    )
    and not exists (
      select 1
      from public.live_private_sparks spark
      where (
        (spark.state = 'awaiting_consent' and (
          spark.consent_expires_at is null or spark.consent_expires_at > timezone('utc', now())
        ))
        or (spark.state = 'active' and (
          spark.active_expires_at is null or spark.active_expires_at > timezone('utc', now())
        ))
      )
      and (
        p_user_a in (spark.participant_a_user_id, spark.participant_b_user_id)
        or p_user_b in (spark.participant_a_user_id, spark.participant_b_user_id)
      )
    )
    and (
      select count(*)
      from public.live_quick_connect_pairings previous
      where previous.session_id = p_session_id
        and least(previous.participant_a_user_id, previous.participant_b_user_id)
          = least(p_user_a, p_user_b)
        and greatest(previous.participant_a_user_id, previous.participant_b_user_id)
          = greatest(p_user_a, p_user_b)
    ) < 2
    and not exists (
      select 1
      from public.live_quick_connect_pairings previous
      where previous.session_id = p_session_id
        and least(previous.participant_a_user_id, previous.participant_b_user_id)
          = least(p_user_a, p_user_b)
        and greatest(previous.participant_a_user_id, previous.participant_b_user_id)
          = greatest(p_user_a, p_user_b)
        and (
          previous.state <> 'round_incomplete'
          or previous.completion_reason not in ('reconnect_grace_expired', 'media_admission_failed')
          or exists (
            select 1 from public.live_quick_connect_safety_checks safety
            where safety.pairing_id = previous.id
              and (safety.status <> 'completed' or safety.experience <> 'respectful')
          )
        )
    );
$$;

revoke all on function public.live_quick_connect_pair_is_eligible(uuid, uuid, uuid)
from public, anon, authenticated;

create or replace function public.live_quick_connect_sync(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  v_now timestamptz := timezone('utc', now());
  v_session public.live_sessions;
  v_control public.live_quick_connect_controls;
  v_a public.live_quick_connect_participants;
  v_b public.live_quick_connect_participants;
  v_round_id uuid;
  v_round_number integer;
  v_pairing_id uuid;
  v_attempt_number smallint;
  v_active_pair_count integer := 0;
  v_round_interval interval;
  v_mutual_interest boolean := false;
  v_intent_compatibility smallint := 1;
begin
  perform pg_advisory_xact_lock(hashtextextended('quick:' || p_session_id::text, 0));

  select session.* into v_session
  from public.live_sessions session
  where session.id = p_session_id
  for update;

  if v_session.id is null or v_session.format <> 'quick_connect' then
    raise exception 'live_quick_connect_session_invalid' using errcode = '23514';
  end if;

  insert into public.live_quick_connect_controls(
    session_id, state, creator_mode, updated_by_user_id
  ) values (
    v_session.id,
    case when v_session.status in ('ended', 'cancelled') then 'ended' else 'closed' end,
    'facilitator', v_session.created_by_user_id
  ) on conflict(session_id) do nothing;

  select control.* into v_control
  from public.live_quick_connect_controls control
  where control.session_id = p_session_id
  for update;

  if v_control.session_id is null then
    raise exception 'live_quick_connect_control_missing' using errcode = 'P0002';
  end if;

  v_round_interval := make_interval(secs => v_control.round_seconds);

  update public.live_quick_connect_participants participant
  set connection_state = 'disconnected',
      state = case when participant.state = 'paired' then 'disconnected' else 'unavailable' end,
      reconnect_deadline = case
        when participant.state = 'paired' then v_now + interval '30 seconds'
        else null
      end
  where participant.session_id = p_session_id
    and participant.connection_state = 'connected'
    and participant.state in ('waiting', 'paired')
    and participant.last_seen_at < v_now - interval '45 seconds';

  update public.live_quick_connect_pairings pairing
  set state = 'reconnect_grace',
      reconnect_deadline = coalesce(pairing.reconnect_deadline, v_now + interval '30 seconds'),
      version = pairing.version + 1
  where pairing.session_id = p_session_id
    and pairing.state = 'active'
    and exists (
      select 1 from public.live_quick_connect_participants participant
      where participant.current_pairing_id = pairing.id
        and participant.connection_state = 'disconnected'
    );

  insert into public.live_quick_connect_events(session_id, pairing_id, event_type, metadata)
  select pairing.session_id, pairing.id, 'round_incomplete',
    jsonb_build_object('reason', 'reconnect_grace_expired')
  from public.live_quick_connect_pairings pairing
  where pairing.session_id = p_session_id
    and pairing.state = 'reconnect_grace'
    and pairing.reconnect_deadline <= v_now
  on conflict do nothing;

  update public.live_quick_connect_rounds round_row
  set state = 'cancelled', completed_at = v_now, version = round_row.version + 1
  where round_row.session_id = p_session_id
    and round_row.state in ('open', 'active')
    and exists (
      select 1 from public.live_quick_connect_pairings pairing
      where pairing.round_id = round_row.id
        and pairing.state = 'reconnect_grace'
        and pairing.reconnect_deadline <= v_now
    );

  update public.live_quick_connect_pairings pairing
  set state = 'round_incomplete', completed_at = v_now,
      completion_reason = 'reconnect_grace_expired', version = pairing.version + 1
  where pairing.session_id = p_session_id
    and pairing.state = 'reconnect_grace'
    and pairing.reconnect_deadline <= v_now;

  insert into public.live_quick_connect_events(session_id, pairing_id, event_type, metadata)
  select pairing.session_id, pairing.id, 'pair_completed',
    jsonb_build_object('reason', 'round_timer_elapsed')
  from public.live_quick_connect_pairings pairing
  where pairing.session_id = p_session_id
    and pairing.state = 'active' and pairing.ends_at <= v_now
  on conflict do nothing;

  update public.live_quick_connect_rounds round_row
  set state = 'completed', completed_at = v_now, version = round_row.version + 1
  where round_row.session_id = p_session_id
    and round_row.state in ('open', 'active')
    and exists (
      select 1 from public.live_quick_connect_pairings pairing
      where pairing.round_id = round_row.id
        and pairing.state = 'active' and pairing.ends_at <= v_now
    );

  update public.live_quick_connect_pairings pairing
  set state = 'completed', completed_at = v_now,
      shared_outcome = coalesce(pairing.shared_outcome, 'closed'),
      completion_reason = coalesce(pairing.completion_reason, 'round_timer_elapsed'),
      version = pairing.version + 1
  where pairing.session_id = p_session_id
    and pairing.state = 'active' and pairing.ends_at <= v_now;

  update public.live_quick_connect_participants participant
  set state = case when participant.connection_state = 'connected' then 'waiting' else 'unavailable' end,
      current_pairing_id = null,
      pairing_key = gen_random_uuid(),
      waiting_since = case
        when participant.connection_state = 'connected' then v_now
        else participant.waiting_since
      end
  where participant.session_id = p_session_id
    and participant.state in ('paired', 'disconnected')
    and not exists (
      select 1 from public.live_quick_connect_pairings pairing
      where pairing.id = participant.current_pairing_id
        and pairing.state in ('active', 'reconnect_grace')
    );

  update public.live_quick_connect_participants participant
  set state = 'unavailable', connection_state = 'disconnected', reconnect_deadline = null
  where participant.session_id = p_session_id
    and participant.state = 'waiting'
    and public.live_quick_connect_has_active_safety_hold(participant.user_id);

  select count(*)::integer into v_active_pair_count
  from public.live_quick_connect_pairings pairing
  where pairing.session_id = p_session_id
    and pairing.state in ('active', 'reconnect_grace');

  if v_control.state = 'draining' and v_active_pair_count = 0 then
    update public.live_quick_connect_controls control set state = 'ended'
    where control.session_id = p_session_id and control.state = 'draining';
    update public.live_quick_connect_participants participant
    set state = 'left', connection_state = 'left_session', reconnect_deadline = null,
        current_pairing_id = null
    where participant.session_id = p_session_id
      and participant.state not in ('left', 'unavailable');
    return;
  end if;

  if v_control.state <> 'open' or v_session.status <> 'live' then
    return;
  end if;

  while v_active_pair_count < v_control.max_concurrent_pairs loop
    v_a := null;
    v_b := null;

    select participant.* into v_a
    from public.live_quick_connect_participants participant
    where participant.session_id = p_session_id
      and participant.state = 'waiting'
      and participant.connection_state = 'connected'
      and participant.last_seen_at >= v_now - interval '45 seconds'
      and exists (
        select 1 from public.live_quick_connect_participants candidate
        where candidate.session_id = p_session_id
          and candidate.user_id <> participant.user_id
          and public.live_quick_connect_pair_is_eligible(
            p_session_id, participant.user_id, candidate.user_id
          )
      )
    order by
      exists (
        select 1
        from public.live_quick_connect_interests outbound
        join public.live_quick_connect_interests inbound
          on inbound.session_id = outbound.session_id
         and inbound.from_user_id = outbound.to_user_id
         and inbound.to_user_id = outbound.from_user_id
        where outbound.session_id = p_session_id
          and outbound.from_user_id = participant.user_id
          and public.live_quick_connect_pair_is_eligible(
            p_session_id, participant.user_id, outbound.to_user_id
          )
      ) desc,
      (
        select count(*)
        from public.live_quick_connect_participants candidate
        where candidate.session_id = p_session_id
          and candidate.user_id <> participant.user_id
          and public.live_quick_connect_pair_is_eligible(
            p_session_id, participant.user_id, candidate.user_id
          )
      ) asc,
      (
        select coalesce(max(public.live_quick_connect_intent_compatibility(
          participant.user_id, candidate.user_id
        )), 1)
        from public.live_quick_connect_participants candidate
        where candidate.session_id = p_session_id
          and candidate.user_id <> participant.user_id
          and public.live_quick_connect_pair_is_eligible(
            p_session_id, participant.user_id, candidate.user_id
          )
      ) desc,
      participant.waiting_since asc,
      participant.user_id asc
    limit 1
    for update skip locked;

    exit when v_a.user_id is null;

    select participant.* into v_b
    from public.live_quick_connect_participants participant
    where participant.session_id = p_session_id
      and participant.user_id <> v_a.user_id
      and public.live_quick_connect_pair_is_eligible(p_session_id, v_a.user_id, participant.user_id)
    order by
      (
        exists (
          select 1 from public.live_quick_connect_interests outbound
          where outbound.session_id = p_session_id
            and outbound.from_user_id = v_a.user_id
            and outbound.to_user_id = participant.user_id
        )
        and exists (
          select 1 from public.live_quick_connect_interests inbound
          where inbound.session_id = p_session_id
            and inbound.from_user_id = participant.user_id
            and inbound.to_user_id = v_a.user_id
        )
      ) desc,
      (
        select count(*)
        from public.live_quick_connect_participants candidate
        where candidate.session_id = p_session_id
          and candidate.user_id <> participant.user_id
          and public.live_quick_connect_pair_is_eligible(
            p_session_id, participant.user_id, candidate.user_id
          )
      ) asc,
      public.live_quick_connect_intent_compatibility(v_a.user_id, participant.user_id) desc,
      participant.waiting_since asc,
      participant.user_id asc
    limit 1
    for update skip locked;

    exit when v_b.user_id is null;

    select count(*)::smallint + 1 into v_attempt_number
    from public.live_quick_connect_pairings pairing
    where pairing.session_id = p_session_id
      and least(pairing.participant_a_user_id, pairing.participant_b_user_id)
        = least(v_a.user_id, v_b.user_id)
      and greatest(pairing.participant_a_user_id, pairing.participant_b_user_id)
        = greatest(v_a.user_id, v_b.user_id);

    select exists (
      select 1 from public.live_quick_connect_interests outbound
      where outbound.session_id = p_session_id
        and outbound.from_user_id = v_a.user_id and outbound.to_user_id = v_b.user_id
    ) and exists (
      select 1 from public.live_quick_connect_interests inbound
      where inbound.session_id = p_session_id
        and inbound.from_user_id = v_b.user_id and inbound.to_user_id = v_a.user_id
    ) into v_mutual_interest;

    v_intent_compatibility := public.live_quick_connect_intent_compatibility(
      v_a.user_id, v_b.user_id
    );

    select coalesce(max(round_row.round_number), 0) + 1 into v_round_number
    from public.live_quick_connect_rounds round_row
    where round_row.session_id = p_session_id;

    insert into public.live_quick_connect_rounds(
      session_id, round_number, state, ends_at
    ) values (
      p_session_id, v_round_number, 'active', v_now + v_round_interval
    ) returning id into v_round_id;

    insert into public.live_quick_connect_pairings(
      session_id, round_id,
      participant_a_user_id, participant_a_profile_id,
      participant_b_user_id, participant_b_profile_id,
      provider_call_id, ends_at, attempt_number
    ) values (
      p_session_id, v_round_id,
      v_a.user_id, v_a.profile_id,
      v_b.user_id, v_b.profile_id,
      'quick_' || replace(gen_random_uuid()::text, '-', ''),
      v_now + v_round_interval, v_attempt_number
    ) returning id into v_pairing_id;

    update public.live_quick_connect_participants participant
    set state = 'paired', current_pairing_id = v_pairing_id
    where participant.session_id = p_session_id
      and participant.user_id in (v_a.user_id, v_b.user_id);

    insert into public.live_quick_connect_events(
      session_id, pairing_id, event_type, metadata
    ) values (
      p_session_id, v_pairing_id, 'paired', jsonb_build_object(
        'algorithm', 'mutual_constrained_intent_fifo_v2',
        'mutualInterest', v_mutual_interest,
        'intentCompatibility', v_intent_compatibility,
        'attemptNumber', v_attempt_number,
        'activePairs', v_active_pair_count + 1,
        'maxConcurrentPairs', v_control.max_concurrent_pairs
      )
    );

    v_active_pair_count := v_active_pair_count + 1;
  end loop;
end;
$$;

revoke all on function public.live_quick_connect_sync(uuid)
from public, anon, authenticated;

create or replace function public.live_quick_connect_prepare_preference(
  p_user_id uuid,
  p_connection_intent text default null
) returns void
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  v_profile public.profiles;
  v_intent text;
  v_allowed public.gender[];
begin
  select profile.* into v_profile
  from public.profiles profile
  where profile.user_id = p_user_id
    and profile.deleted_at is null
    and profile.account_state = 'active';

  if v_profile.id is null then
    raise exception 'live_quick_connect_profile_required' using errcode = '42501';
  end if;

  v_allowed := case v_profile.gender
    when 'MALE'::public.gender then array['FEMALE'::public.gender]
    when 'FEMALE'::public.gender then array['MALE'::public.gender]
    else null
  end;
  if v_allowed is null then
    raise exception 'live_quick_connect_profile_sex_unsupported' using errcode = '22023';
  end if;

  if p_connection_intent is not null
     and lower(btrim(p_connection_intent)) not in ('serious', 'long_term', 'marriage', 'open') then
    raise exception 'live_quick_connect_intent_invalid' using errcode = '22023';
  end if;

  v_intent := case
    when p_connection_intent is not null then lower(btrim(p_connection_intent))
    else public.normalize_live_quick_connect_intent(coalesce(
      v_profile.relationship_compass ->> 'intention',
      v_profile.looking_for,
      'open'
    ))
  end;

  insert into public.live_quick_connect_preferences(
    user_id, allowed_genders, connection_intent
  ) values (
    p_user_id, v_allowed, v_intent
  )
  on conflict(user_id) do update set
    allowed_genders = excluded.allowed_genders,
    connection_intent = case
      when p_connection_intent is null
        then public.live_quick_connect_preferences.connection_intent
      else excluded.connection_intent
    end,
    confirmed_at = timezone('utc', now()),
    updated_at = timezone('utc', now());
end;
$$;

revoke all on function public.live_quick_connect_prepare_preference(uuid, text)
from public, anon, authenticated;

create or replace function public.rpc_join_live_quick_connect(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  v_user_id uuid := auth.uid();
  v_session public.live_sessions;
  v_control public.live_quick_connect_controls;
begin
  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  select session.* into v_session from public.live_sessions session where session.id = p_session_id;
  if v_session.id is null or v_session.format <> 'quick_connect'
     or v_session.status not in ('live', 'backstage') then
    raise exception 'live_quick_connect_session_invalid' using errcode = '23514';
  end if;
  if v_session.created_by_user_id = v_user_id then
    raise exception 'live_quick_connect_host_facilitator_required' using errcode = '42501';
  end if;
  if public.live_quick_connect_has_active_safety_hold(v_user_id) then
    raise exception 'live_quick_connect_safety_hold_active' using errcode = '42501';
  end if;

  perform public.live_quick_connect_prepare_preference(v_user_id, null);

  if exists (
    select 1 from public.live_quick_connect_safety_checks safety
    where safety.session_id = p_session_id and safety.reviewer_user_id = v_user_id
      and safety.status = 'pending'
  ) then
    return public.rpc_get_live_quick_connect(p_session_id);
  end if;
  select control.* into v_control from public.live_quick_connect_controls control
  where control.session_id = p_session_id;
  if v_control.session_id is null then
    raise exception 'live_quick_connect_control_missing' using errcode = 'P0002';
  end if;
  if v_control.state in ('draining', 'ended') then
    raise exception 'live_quick_connect_not_accepting_members' using errcode = '55000';
  end if;

  update public.live_quick_connect_participants participant
  set waiting_since = timezone('utc', now())
  where participant.session_id = p_session_id and participant.user_id = v_user_id
    and participant.state not in ('paired', 'disconnected');

  return public.rpc_join_live_quick_connect_uncontrolled(p_session_id);
end;
$$;

revoke all on function public.rpc_join_live_quick_connect(uuid) from public, anon;
grant execute on function public.rpc_join_live_quick_connect(uuid) to authenticated;

create or replace function public.rpc_join_live_quick_connect(
  p_session_id uuid,
  p_connection_intent text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if p_connection_intent is null then
    raise exception 'live_quick_connect_preferences_required' using errcode = '22023';
  end if;
  perform public.live_quick_connect_prepare_preference(v_user_id, p_connection_intent);
  return public.rpc_join_live_quick_connect(p_session_id);
end;
$$;

revoke all on function public.rpc_join_live_quick_connect(uuid, text) from public, anon;
grant execute on function public.rpc_join_live_quick_connect(uuid, text) to authenticated;

-- Compatibility for already-installed clients. Their former gender choice is
-- ignored; opposite-sex eligibility now comes from the verified profile.
create or replace function public.rpc_join_live_quick_connect(
  p_session_id uuid,
  p_gender_preferences text[]
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
begin
  return public.rpc_join_live_quick_connect(p_session_id);
end;
$$;

revoke all on function public.rpc_join_live_quick_connect(uuid, text[]) from public, anon;
grant execute on function public.rpc_join_live_quick_connect(uuid, text[]) to authenticated;

create or replace function public.rpc_get_live_quick_connect_pool(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  v_user_id uuid := auth.uid();
  v_session public.live_sessions;
  v_control public.live_quick_connect_controls;
  v_me public.live_quick_connect_participants;
  v_preference public.live_quick_connect_preferences;
  v_members jsonb := '[]'::jsonb;
  v_queue jsonb := null;
begin
  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  select session.* into v_session from public.live_sessions session where session.id = p_session_id;
  if v_session.id is null or v_session.format <> 'quick_connect' then
    raise exception 'live_quick_connect_session_invalid' using errcode = '23514';
  end if;
  if not exists (
    select 1 from public.live_participants participant
    where participant.session_id = p_session_id and participant.user_id = v_user_id
      and participant.state in ('audience', 'stage_requested', 'backstage', 'on_stage')
  ) then
    raise exception 'live_participant_required' using errcode = '42501';
  end if;

  select control.* into v_control from public.live_quick_connect_controls control
  where control.session_id = p_session_id;
  select participant.* into v_me from public.live_quick_connect_participants participant
  where participant.session_id = p_session_id and participant.user_id = v_user_id;
  select preference.* into v_preference from public.live_quick_connect_preferences preference
  where preference.user_id = v_user_id;

  if v_me.user_id is not null then
    perform public.live_quick_connect_sync(p_session_id);
    v_queue := public.rpc_get_live_quick_connect(p_session_id);
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'user_id', member.user_id,
    'profile_id', member.profile_id,
    'full_name', profile.full_name,
    'avatar_url', profile.avatar_url,
    'age', profile.age,
    'city', coalesce(profile.city, profile.location),
    'expressed_interest', exists (
      select 1 from public.live_quick_connect_interests interest
      where interest.session_id = p_session_id
        and interest.from_user_id = v_user_id and interest.to_user_id = member.user_id
    )
  ) order by member.waiting_since, member.user_id), '[]'::jsonb)
  into v_members
  from public.live_quick_connect_participants member
  join public.live_participants public_member
    on public_member.session_id = member.session_id and public_member.user_id = member.user_id
  join public.profiles profile
    on profile.id = member.profile_id and profile.user_id = member.user_id
  where member.session_id = p_session_id
    and member.state = 'waiting' and member.connection_state = 'connected'
    and member.last_seen_at >= timezone('utc', now()) - interval '45 seconds'
    and public_member.state in ('audience', 'stage_requested', 'backstage', 'on_stage')
    and not public.live_quick_connect_has_active_safety_hold(member.user_id);

  return jsonb_build_object(
    'session_id', p_session_id,
    'stage_layout', coalesce(v_control.stage_layout, 'stacked'),
    'control_state', coalesce(v_control.state, 'closed'),
    'creator_mode', 'facilitator',
    'server_now', timezone('utc', now()),
    'is_host', v_session.created_by_user_id = v_user_id,
    'is_opted_in', coalesce(v_me.state in ('waiting', 'paired', 'disconnected'), false),
    'my_state', coalesce(v_me.state, 'not_joined'),
    'can_opt_in', coalesce(
      v_session.created_by_user_id <> v_user_id
      and v_control.state in ('closed', 'open', 'paused')
      and not public.live_quick_connect_has_active_safety_hold(v_user_id), false
    ),
    'connection_intent', v_preference.connection_intent,
    'gender_preferences', coalesce(to_jsonb(v_preference.allowed_genders), '[]'::jsonb),
    'members', v_members,
    'queue', v_queue
  );
end;
$$;

revoke all on function public.rpc_get_live_quick_connect_pool(uuid) from public, anon;
grant execute on function public.rpc_get_live_quick_connect_pool(uuid) to authenticated;

comment on table public.live_quick_connect_preferences is
  'Private Quick Connect intention; legacy gender data is server-derived for rollout compatibility.';
comment on function public.live_quick_connect_pair_is_eligible(uuid, uuid, uuid) is
  'Opposite-sex, reciprocal-age, safety-aware and lease-aware Quick Connect eligibility.';
comment on function public.live_quick_connect_sync(uuid) is
  'Capacity-bounded matcher: mutual interest, constrained eligibility, intention compatibility, then FIFO.';

commit;
