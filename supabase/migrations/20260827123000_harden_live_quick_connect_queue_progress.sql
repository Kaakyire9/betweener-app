begin;

-- Pairability must not depend on the hourly cleanup job. An expired Spark is
-- no longer active authority, even if its lifecycle row has not been swept yet.
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
      join public.live_participants a on a.session_id = session.id
      join public.live_participants b on b.session_id = session.id
      join public.live_quick_connect_participants qa
        on qa.session_id = session.id and qa.user_id = a.user_id
      join public.live_quick_connect_participants qb
        on qb.session_id = session.id and qb.user_id = b.user_id
      join public.profiles pa on pa.id = a.profile_id and pa.user_id = a.user_id
      join public.profiles pb on pb.id = b.profile_id and pb.user_id = b.user_id
      where session.id = p_session_id
        and session.format = 'quick_connect'
        and session.status in ('live', 'backstage')
        and a.user_id = p_user_a
        and b.user_id = p_user_b
        and a.state in ('audience', 'stage_requested', 'backstage', 'on_stage')
        and b.state in ('audience', 'stage_requested', 'backstage', 'on_stage')
        and qa.state = 'waiting'
        and qb.state = 'waiting'
        and qa.connection_state = 'connected'
        and qb.connection_state = 'connected'
        and pa.deleted_at is null
        and pb.deleted_at is null
        and pa.profile_completed
        and pb.profile_completed
        and coalesce(pa.is_active, true)
        and coalesce(pb.is_active, true)
        and (
          upper(btrim(coalesce(pa.gender::text, ''))) not in ('MALE', 'FEMALE')
          or upper(btrim(coalesce(pb.gender::text, ''))) not in ('MALE', 'FEMALE')
          or upper(btrim(pa.gender::text)) <> upper(btrim(pb.gender::text))
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
        and not exists (
          select 1
          from public.blocks blocked
          where (blocked.blocker_id = p_user_a and blocked.blocked_id = p_user_b)
             or (blocked.blocker_id = p_user_b and blocked.blocked_id = p_user_a)
        )
    )
    and not exists (
      select 1
      from public.live_private_sparks spark
      where (
          (spark.state = 'awaiting_consent' and (
            spark.consent_expires_at is null
            or spark.consent_expires_at > timezone('utc', now())
          ))
          or (spark.state = 'active' and (
            spark.active_expires_at is null
            or spark.active_expires_at > timezone('utc', now())
          ))
        )
        and (
          p_user_a in (spark.participant_a_user_id, spark.participant_b_user_id)
          or p_user_b in (spark.participant_a_user_id, spark.participant_b_user_id)
        )
    )
    and not exists (
      select 1
      from public.live_quick_connect_pairings pairing
      where pairing.session_id = p_session_id
        and least(pairing.participant_a_user_id, pairing.participant_b_user_id)
          = least(p_user_a, p_user_b)
        and greatest(pairing.participant_a_user_id, pairing.participant_b_user_id)
          = greatest(p_user_a, p_user_b)
    );
$$;

revoke all on function public.live_quick_connect_pair_is_eligible(uuid, uuid, uuid)
from public, anon, authenticated;

-- Return a privacy-safe queue diagnosis. It explains progress without exposing
-- another member's gender, age preference, block state, or private decision.
create or replace function public.rpc_get_live_quick_connect(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  v_user_id uuid := auth.uid();
  v_participant public.live_quick_connect_participants;
  v_pairing public.live_quick_connect_pairings;
  v_other public.profiles;
  v_my_decision text;
  v_queue_status text := 'not_joined';
  v_waiting_count integer := 0;
  v_eligible_peer_count integer := 0;
  v_has_current_spark boolean := false;
  v_has_previous_waiting_peer boolean := false;
  v_now timestamptz := timezone('utc', now());
begin
  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  perform public.live_quick_connect_sync(p_session_id);

  select * into v_participant
  from public.live_quick_connect_participants participant
  where participant.session_id = p_session_id
    and participant.user_id = v_user_id;

  if v_participant.user_id is null then
    return jsonb_build_object(
      'session_id', p_session_id,
      'state', 'not_joined',
      'connection_state', 'left_session',
      'server_now', v_now,
      'queue_status', 'not_joined',
      'waiting_count', 0,
      'eligible_peer_count', 0,
      'pairing', null
    );
  end if;

  if v_participant.current_pairing_id is not null then
    select * into v_pairing
    from public.live_quick_connect_pairings pairing
    where pairing.id = v_participant.current_pairing_id;

    select profile.* into v_other
    from public.profiles profile
    where profile.id = case
      when v_user_id = v_pairing.participant_a_user_id
        then v_pairing.participant_b_profile_id
      else v_pairing.participant_a_profile_id
    end;

    select decision.decision into v_my_decision
    from public.live_quick_connect_decisions decision
    where decision.pairing_id = v_pairing.id
      and decision.user_id = v_user_id;
  end if;

  select exists (
    select 1
    from public.live_private_sparks spark
    where v_user_id in (spark.participant_a_user_id, spark.participant_b_user_id)
      and (
        (spark.state = 'awaiting_consent' and (
          spark.consent_expires_at is null or spark.consent_expires_at > v_now
        ))
        or (spark.state = 'active' and (
          spark.active_expires_at is null or spark.active_expires_at > v_now
        ))
      )
  ) into v_has_current_spark;

  select count(*)::integer into v_waiting_count
  from public.live_quick_connect_participants candidate
  where candidate.session_id = p_session_id
    and candidate.state = 'waiting'
    and candidate.connection_state = 'connected';

  select count(*)::integer into v_eligible_peer_count
  from public.live_quick_connect_participants candidate
  where candidate.session_id = p_session_id
    and candidate.user_id <> v_user_id
    and candidate.state = 'waiting'
    and candidate.connection_state = 'connected'
    and public.live_quick_connect_pair_is_eligible(
      p_session_id,
      v_user_id,
      candidate.user_id
    );

  select exists (
    select 1
    from public.live_quick_connect_participants candidate
    join public.live_quick_connect_pairings previous
      on previous.session_id = candidate.session_id
     and least(previous.participant_a_user_id, previous.participant_b_user_id)
       = least(v_user_id, candidate.user_id)
     and greatest(previous.participant_a_user_id, previous.participant_b_user_id)
       = greatest(v_user_id, candidate.user_id)
    where candidate.session_id = p_session_id
      and candidate.user_id <> v_user_id
      and candidate.state = 'waiting'
      and candidate.connection_state = 'connected'
  ) into v_has_previous_waiting_peer;

  v_queue_status := case
    when v_pairing.id is not null and v_participant.state = 'paired' then 'paired'
    when v_has_current_spark then 'current_private_conversation'
    when v_participant.connection_state <> 'connected' then 'reconnecting'
    when v_waiting_count <= 1 then 'waiting_for_partner'
    when v_eligible_peer_count > 0 then 'pairing_in_progress'
    when v_has_previous_waiting_peer then 'rotation_complete'
    else 'waiting_for_eligible_partner'
  end;

  return jsonb_build_object(
    'session_id', p_session_id,
    'state', v_participant.state,
    'connection_state', v_participant.connection_state,
    'server_now', v_now,
    'queue_status', v_queue_status,
    'waiting_count', v_waiting_count,
    'eligible_peer_count', v_eligible_peer_count,
    'pairing', case when v_pairing.id is null then null else jsonb_build_object(
      'id', v_pairing.id,
      'chemistry_first_enabled', v_pairing.chemistry_first_enabled,
      'state', v_pairing.state,
      'starts_at', v_pairing.starts_at,
      'ends_at', v_pairing.ends_at,
      'reconnect_deadline', v_pairing.reconnect_deadline,
      'my_decision', v_my_decision,
      'shared_outcome', v_pairing.shared_outcome,
      'other_person', jsonb_build_object(
        'user_id', v_other.user_id,
        'profile_id', v_other.id,
        'full_name', v_other.full_name,
        'avatar_url', v_other.avatar_url,
        'age', v_other.age,
        'city', v_other.city,
        'looking_for', coalesce(
          v_other.relationship_compass ->> 'intention',
          v_other.looking_for
        )
      ),
      'provider_call_type', v_pairing.provider_call_type,
      'provider_call_id', v_pairing.provider_call_id
    ) end
  );
end;
$$;

revoke all on function public.rpc_get_live_quick_connect(uuid)
from public, anon, authenticated;
grant execute on function public.rpc_get_live_quick_connect(uuid) to authenticated;

commit;
