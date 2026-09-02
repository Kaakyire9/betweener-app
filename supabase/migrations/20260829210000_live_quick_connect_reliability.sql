-- Quick Connect reliability, fairness, explicit consent, host capacity and
-- cross-session safety enforcement.

begin;

alter table public.live_quick_connect_controls
  add column if not exists max_concurrent_pairs smallint not null default 4;

alter table public.live_quick_connect_controls
  drop constraint if exists live_quick_control_max_concurrent_pairs_valid;
alter table public.live_quick_connect_controls
  add constraint live_quick_control_max_concurrent_pairs_valid
  check (max_concurrent_pairs in (1, 2, 4, 8));

alter table public.live_quick_connect_participants
  add column if not exists waiting_since timestamptz not null default timezone('utc', now());

alter table public.live_quick_connect_pairings
  add column if not exists attempt_number smallint not null default 1,
  add column if not exists completion_reason text;

alter table public.live_quick_connect_pairings
  drop constraint if exists live_quick_pairing_attempt_valid;
alter table public.live_quick_connect_pairings
  add constraint live_quick_pairing_attempt_valid check (attempt_number in (1, 2));

alter table public.live_quick_connect_pairings
  drop constraint if exists live_quick_pairing_completion_reason_valid;
alter table public.live_quick_connect_pairings
  add constraint live_quick_pairing_completion_reason_valid check (
    completion_reason is null or completion_reason in (
      'round_timer_elapsed', 'both_decisions_submitted', 'participant_left_queue',
      'reconnect_grace_expired', 'media_admission_failed', 'safety_concern',
      'host_ended', 'host_closed'
    )
  );

update public.live_quick_connect_pairings pairing
set completion_reason = case
  when pairing.state = 'completed' then 'round_timer_elapsed'
  when pairing.state = 'round_incomplete' and exists (
    select 1 from public.live_quick_connect_events event
    where event.pairing_id = pairing.id
      and event.event_type = 'round_incomplete'
      and event.metadata ->> 'reason' = 'reconnect_grace_expired'
  ) then 'reconnect_grace_expired'
  when pairing.state = 'round_incomplete' then 'participant_left_queue'
  when pairing.state = 'cancelled' then 'host_ended'
  else pairing.completion_reason
end
where pairing.completion_reason is null
  and pairing.state in ('completed', 'round_incomplete', 'cancelled');

alter table public.live_quick_connect_pairings
  drop constraint if exists live_quick_pair_once_per_session;
drop index if exists public.live_quick_unordered_pair_once_idx;

create unique index if not exists live_quick_unordered_active_pair_idx
on public.live_quick_connect_pairings(
  session_id,
  least(participant_a_user_id, participant_b_user_id),
  greatest(participant_a_user_id, participant_b_user_id)
)
where state in ('active', 'reconnect_grace');

create table public.live_quick_connect_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  allowed_genders public.gender[] not null,
  confirmed_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint live_quick_preferences_not_empty check (cardinality(allowed_genders) between 1 and 4)
);

alter table public.live_quick_connect_preferences enable row level security;
alter table public.live_quick_connect_preferences force row level security;
revoke all on public.live_quick_connect_preferences from public, anon, authenticated;
grant all on public.live_quick_connect_preferences to service_role;

create table public.live_quick_connect_safety_holds (
  user_id uuid primary key references auth.users(id) on delete cascade,
  status text not null default 'active',
  distinct_verified_reporters integer not null,
  hold_until timestamptz not null,
  reason text not null default 'repeated_private_safety_reports',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  released_at timestamptz,
  released_by_user_id uuid references auth.users(id) on delete set null,
  constraint live_quick_safety_hold_status_valid check (status in ('active', 'released')),
  constraint live_quick_safety_hold_reporter_count_valid check (distinct_verified_reporters >= 2),
  constraint live_quick_safety_hold_release_valid check (
    (status = 'active' and released_at is null)
    or (status = 'released' and released_at is not null)
  )
);

create index live_quick_safety_hold_active_idx
on public.live_quick_connect_safety_holds(hold_until)
where status = 'active';

alter table public.live_quick_connect_safety_holds enable row level security;
alter table public.live_quick_connect_safety_holds force row level security;
revoke all on public.live_quick_connect_safety_holds from public, anon, authenticated;
grant all on public.live_quick_connect_safety_holds to service_role;

create or replace function public.live_quick_connect_has_active_safety_hold(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
  select exists (
    select 1
    from public.live_quick_connect_safety_holds hold_row
    where hold_row.user_id = p_user_id
      and hold_row.status = 'active'
      and hold_row.hold_until > timezone('utc', now())
  );
$$;

revoke all on function public.live_quick_connect_has_active_safety_hold(uuid)
from public, anon, authenticated;

create or replace function public.live_quick_connect_refresh_safety_hold(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  v_reporters integer := 0;
  v_hold_until timestamptz;
  v_now timestamptz := timezone('utc', now());
begin
  if p_user_id is null then
    return;
  end if;

  select count(distinct safety.reviewer_user_id)::integer into v_reporters
  from public.live_quick_connect_safety_checks safety
  join public.profiles reporter
    on reporter.user_id = safety.reviewer_user_id
   and reporter.deleted_at is null
   and reporter.account_state = 'active'
   and reporter.profile_completed
   and coalesce(reporter.verification_level, 0) >= 1
  where safety.reviewed_user_id = p_user_id
    and safety.status = 'completed'
    and safety.experience = 'safety_concern'
    and safety.reason in (
      'requested_nudity', 'sexual_pressure', 'harassment_disrespect',
      'hate_threats', 'impersonation_deception'
    )
    and safety.completed_at >= v_now - interval '30 days';

  if v_reporters < 2 then
    return;
  end if;

  v_hold_until := v_now + case when v_reporters >= 3 then interval '7 days' else interval '24 hours' end;

  insert into public.live_quick_connect_safety_holds(
    user_id, status, distinct_verified_reporters, hold_until
  ) values (
    p_user_id, 'active', v_reporters, v_hold_until
  )
  on conflict(user_id) do update set
    status = 'active',
    distinct_verified_reporters = greatest(
      public.live_quick_connect_safety_holds.distinct_verified_reporters,
      excluded.distinct_verified_reporters
    ),
    hold_until = greatest(public.live_quick_connect_safety_holds.hold_until, excluded.hold_until),
    updated_at = v_now,
    released_at = null,
    released_by_user_id = null;

  update public.live_quick_connect_participants participant
  set state = 'unavailable',
      connection_state = 'disconnected',
      reconnect_deadline = null,
      current_pairing_id = null,
      last_seen_at = v_now
  where participant.user_id = p_user_id
    and participant.state = 'waiting';
end;
$$;

revoke all on function public.live_quick_connect_refresh_safety_hold(uuid)
from public, anon, authenticated;

create or replace function public.live_quick_connect_apply_safety_hold()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
begin
  if new.status = 'completed'
     and new.experience = 'safety_concern'
     and old.status is distinct from new.status then
    perform public.live_quick_connect_refresh_safety_hold(new.reviewed_user_id);
  end if;
  return new;
end;
$$;

revoke all on function public.live_quick_connect_apply_safety_hold()
from public, anon, authenticated;

drop trigger if exists live_quick_safety_check_apply_hold
on public.live_quick_connect_safety_checks;
create trigger live_quick_safety_check_apply_hold
after update of status on public.live_quick_connect_safety_checks
for each row execute function public.live_quick_connect_apply_safety_hold();

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
      join public.live_quick_connect_preferences preference_a on preference_a.user_id = p_user_a
      join public.live_quick_connect_preferences preference_b on preference_b.user_id = p_user_b
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
        and pb.gender = any(preference_a.allowed_genders)
        and pa.gender = any(preference_b.allowed_genders)
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
      select 1 from public.live_private_sparks spark
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

  -- A heartbeat is a server lease. Missing it removes a waiting ghost from
  -- selection and starts reconnect protection for an active conversation.
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
        'algorithm', 'mutual_constrained_fifo_v1',
        'mutualInterest', v_mutual_interest,
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

create or replace function public.live_quick_connect_host_snapshot(
  p_session_id uuid,
  p_requesting_user_id uuid
) returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  v_session public.live_sessions;
  v_control public.live_quick_connect_controls;
  v_waiting_people integer := 0;
  v_eligible_people integer := 0;
  v_active_pairs integer := 0;
  v_reconnecting_people integer := 0;
  v_completed_rounds integer := 0;
begin
  select session.* into v_session from public.live_sessions session where session.id = p_session_id;
  if v_session.id is null or v_session.format <> 'quick_connect' then
    raise exception 'live_quick_connect_session_invalid' using errcode = '23514';
  end if;
  if p_requesting_user_id is null or v_session.created_by_user_id <> p_requesting_user_id then
    raise exception 'live_quick_connect_control_forbidden' using errcode = '42501';
  end if;
  select control.* into v_control from public.live_quick_connect_controls control
  where control.session_id = p_session_id;
  if v_control.session_id is null then
    raise exception 'live_quick_connect_control_missing' using errcode = 'P0002';
  end if;

  select count(*)::integer into v_waiting_people
  from public.live_quick_connect_participants participant
  where participant.session_id = p_session_id and participant.state = 'waiting'
    and participant.connection_state = 'connected'
    and participant.last_seen_at >= timezone('utc', now()) - interval '45 seconds';

  select count(*)::integer into v_eligible_people
  from public.live_quick_connect_participants participant
  where participant.session_id = p_session_id and participant.state = 'waiting'
    and participant.connection_state = 'connected'
    and participant.last_seen_at >= timezone('utc', now()) - interval '45 seconds'
    and exists (
      select 1 from public.live_quick_connect_participants candidate
      where candidate.session_id = participant.session_id
        and candidate.user_id <> participant.user_id
        and public.live_quick_connect_pair_is_eligible(
          p_session_id, participant.user_id, candidate.user_id
        )
    );

  select count(*)::integer into v_active_pairs from public.live_quick_connect_pairings pairing
  where pairing.session_id = p_session_id and pairing.state in ('active', 'reconnect_grace');
  select count(*)::integer into v_reconnecting_people
  from public.live_quick_connect_participants participant
  where participant.session_id = p_session_id and participant.connection_state = 'disconnected'
    and participant.state in ('paired', 'disconnected');
  select count(*)::integer into v_completed_rounds from public.live_quick_connect_rounds round_row
  where round_row.session_id = p_session_id and round_row.state = 'completed';

  return jsonb_build_object(
    'session_id', v_control.session_id,
    'state', v_control.state,
    'creator_mode', 'facilitator',
    'round_seconds', v_control.round_seconds,
    'max_concurrent_pairs', v_control.max_concurrent_pairs,
    'version', v_control.version,
    'server_now', timezone('utc', now()),
    'can_manage', true,
    'metrics', jsonb_build_object(
      'waiting_people', v_waiting_people,
      'eligible_people', v_eligible_people,
      'active_pairs', v_active_pairs,
      'available_pair_slots', greatest(v_control.max_concurrent_pairs - v_active_pairs, 0),
      'reconnecting_people', v_reconnecting_people,
      'completed_rounds', v_completed_rounds
    )
  );
end;
$$;

revoke all on function public.live_quick_connect_host_snapshot(uuid, uuid)
from public, anon, authenticated;

create or replace function public.rpc_configure_live_quick_connect(
  p_session_id uuid,
  p_round_seconds integer,
  p_max_concurrent_pairs integer
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  v_user_id uuid := auth.uid();
  v_session public.live_sessions;
  v_control public.live_quick_connect_controls;
  v_active_pairs integer := 0;
begin
  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if p_round_seconds not in (120, 180, 300) then
    raise exception 'live_quick_connect_round_seconds_invalid' using errcode = '22023';
  end if;
  if p_max_concurrent_pairs not in (1, 2, 4, 8) then
    raise exception 'live_quick_connect_concurrency_invalid' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('quick:' || p_session_id::text, 0));
  select session.* into v_session from public.live_sessions session
  where session.id = p_session_id for update;
  if v_session.id is null or v_session.format <> 'quick_connect' then
    raise exception 'live_quick_connect_session_invalid' using errcode = '23514';
  end if;
  if v_session.created_by_user_id <> v_user_id then
    raise exception 'live_quick_connect_control_forbidden' using errcode = '42501';
  end if;

  select control.* into v_control from public.live_quick_connect_controls control
  where control.session_id = p_session_id for update;
  select count(*)::integer into v_active_pairs from public.live_quick_connect_pairings pairing
  where pairing.session_id = p_session_id and pairing.state in ('active', 'reconnect_grace');

  if v_control.state not in ('closed', 'paused') or v_active_pairs > 0 then
    raise exception 'live_quick_connect_configuration_locked' using errcode = '55000';
  end if;

  update public.live_quick_connect_controls control
  set round_seconds = p_round_seconds,
      max_concurrent_pairs = p_max_concurrent_pairs,
      creator_mode = 'facilitator',
      updated_by_user_id = v_user_id
  where control.session_id = p_session_id;

  return public.live_quick_connect_host_snapshot(p_session_id, v_user_id);
end;
$$;

revoke all on function public.rpc_configure_live_quick_connect(uuid, integer, integer)
from public, anon;
grant execute on function public.rpc_configure_live_quick_connect(uuid, integer, integer)
to authenticated;

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
  if not exists (
    select 1 from public.live_quick_connect_preferences preference
    where preference.user_id = v_user_id and cardinality(preference.allowed_genders) > 0
  ) then
    raise exception 'live_quick_connect_preferences_required' using errcode = '22023';
  end if;
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
  p_gender_preferences text[]
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  v_user_id uuid := auth.uid();
  v_item text;
  v_allowed public.gender[] := '{}'::public.gender[];
begin
  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if p_gender_preferences is null or cardinality(p_gender_preferences) = 0 then
    raise exception 'live_quick_connect_preferences_required' using errcode = '22023';
  end if;

  foreach v_item in array p_gender_preferences loop
    v_item := upper(btrim(v_item));
    if v_item not in ('MALE', 'FEMALE', 'NON_BINARY', 'OTHER') then
      raise exception 'live_quick_connect_preferences_invalid' using errcode = '22023';
    end if;
    if not (v_item::public.gender = any(v_allowed)) then
      v_allowed := array_append(v_allowed, v_item::public.gender);
    end if;
  end loop;

  insert into public.live_quick_connect_preferences(user_id, allowed_genders)
  values(v_user_id, v_allowed)
  on conflict(user_id) do update set
    allowed_genders = excluded.allowed_genders,
    confirmed_at = timezone('utc', now()),
    updated_at = timezone('utc', now());

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
    'gender_preferences', coalesce(to_jsonb(v_preference.allowed_genders), '[]'::jsonb),
    'members', v_members,
    'queue', v_queue
  );
end;
$$;

revoke all on function public.rpc_get_live_quick_connect_pool(uuid) from public, anon;
grant execute on function public.rpc_get_live_quick_connect_pool(uuid) to authenticated;

create or replace function public.rpc_release_live_quick_connect_safety_hold(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
begin
  if auth.uid() is null or not public.is_admin_user(auth.uid()) then
    raise exception 'live_safety_console_forbidden' using errcode = '42501';
  end if;
  update public.live_quick_connect_safety_holds hold_row
  set status = 'released', released_at = timezone('utc', now()),
      released_by_user_id = auth.uid(), updated_at = timezone('utc', now())
  where hold_row.user_id = p_user_id and hold_row.status = 'active';
end;
$$;

revoke all on function public.rpc_release_live_quick_connect_safety_hold(uuid)
from public, anon;
grant execute on function public.rpc_release_live_quick_connect_safety_hold(uuid)
to authenticated;

comment on table public.live_quick_connect_preferences is
  'Private reciprocal Quick Connect gender consent. Never projected to other participants.';
comment on table public.live_quick_connect_safety_holds is
  'Temporary, abuse-resistant Quick Connect holds based on distinct verified serious reporters.';
comment on function public.live_quick_connect_sync(uuid) is
  'Lease-aware, capacity-bounded, mutual-interest-first and constrained-first Quick Connect matcher.';

commit;
