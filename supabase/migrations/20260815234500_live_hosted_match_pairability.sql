-- Keep hosted introductions aligned with Betweener's current discovery pool
-- while exposing only privacy-safe pairability to the host.

begin;

create or replace function public.live_match_pair_is_eligible(
  p_session_id uuid,
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
      from public.live_participants a
      join public.live_participants b on b.session_id = a.session_id
      join public.profiles pa on pa.id = a.profile_id
      join public.profiles pb on pb.id = b.profile_id
      where a.session_id = p_session_id
        and a.user_id = p_user_a
        and b.user_id = p_user_b
        and a.open_to_introductions
        and b.open_to_introductions
        and a.role <> 'host'
        and b.role <> 'host'
        and a.state in ('audience', 'stage_requested', 'backstage', 'on_stage')
        and b.state in ('audience', 'stage_requested', 'backstage', 'on_stage')
        and pa.deleted_at is null
        and pb.deleted_at is null
        and pa.profile_completed
        and pb.profile_completed
        and coalesce(pa.is_active, true)
        and coalesce(pb.is_active, true)
        -- Match the existing discovery policy. When either identity is absent
        -- or outside the current binary pool, do not infer a preference.
        and (
          pa.gender is null
          or pb.gender is null
          or pa.gender::text not in ('MALE', 'FEMALE')
          or pb.gender::text not in ('MALE', 'FEMALE')
          or pa.gender <> pb.gender
        )
        and (pa.min_age_interest is null or pb.age is null or pb.age >= pa.min_age_interest)
        and (pa.max_age_interest is null or pb.age is null or pb.age <= pa.max_age_interest)
        and (pb.min_age_interest is null or pa.age is null or pa.age >= pb.min_age_interest)
        and (pb.max_age_interest is null or pa.age is null or pa.age <= pb.max_age_interest)
        and not exists (
          select 1
          from public.blocks blocked
          where (blocked.blocker_id = p_user_a and blocked.blocked_id = p_user_b)
             or (blocked.blocker_id = p_user_b and blocked.blocked_id = p_user_a)
        )
    );
$$;

create or replace function public.live_hosted_matching_snapshot(p_session_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  v_round public.live_match_rounds;
  v_can_manage boolean := public.has_live_capability(p_session_id, 'live.create_match_round');
  v_is_participant boolean;
  v_my_response text;
begin
  if auth.uid() is null or not public.can_view_live_session(p_session_id, auth.uid()) then
    raise exception 'live_hosted_matching_forbidden' using errcode = '42501';
  end if;

  select * into v_round
  from public.live_match_rounds r
  where r.session_id = p_session_id
    and r.state in ('proposed', 'awaiting_consent', 'both_accepted', 'public_introduction')
    and (r.state <> 'awaiting_consent' or r.expires_at > timezone('utc', now()))
    and (
      v_can_manage
      or r.participant_a_user_id = auth.uid()
      or r.participant_b_user_id = auth.uid()
      or r.state = 'public_introduction'
    )
  order by r.updated_at desc
  limit 1;

  v_is_participant := v_round.id is not null
    and auth.uid() in (v_round.participant_a_user_id, v_round.participant_b_user_id);

  if v_is_participant then
    select decision into v_my_response
    from public.live_match_round_responses
    where match_round_id = v_round.id
      and user_id = auth.uid();
  end if;

  return jsonb_build_object(
    'canManage', v_can_manage,
    'candidates', case when v_can_manage then coalesce((
      select jsonb_agg(jsonb_build_object(
        'user_id', p.user_id,
        'profile_id', p.profile_id,
        'full_name', pr.full_name,
        'avatar_url', public.live_profile_avatar(pr),
        'age', pr.age,
        'city', pr.city,
        'verified', coalesce(pr.verification_level, 0) > 0,
        'looking_for', pr.looking_for,
        'origin_context_type', p.origin_context_type,
        'paired_with_user_ids', coalesce((
          select jsonb_agg(
            case when history.participant_a_user_id = p.user_id
              then history.participant_b_user_id
              else history.participant_a_user_id
            end
            order by history.created_at
          )
          from public.live_match_rounds history
          where history.session_id = p_session_id
            and p.user_id in (
              history.participant_a_user_id,
              history.participant_b_user_id
            )
        ), '[]'::jsonb),
        -- This reveals only whether a pairing can be proposed. It deliberately
        -- does not reveal age, gender, block or any other rejection reason.
        'pairable_with_user_ids', coalesce((
          select jsonb_agg(peer.user_id order by peer.joined_at nulls last, peer.created_at)
          from public.live_participants peer
          where peer.session_id = p_session_id
            and peer.user_id <> p.user_id
            and public.live_match_pair_is_eligible(
              p_session_id,
              p.user_id,
              peer.user_id
            )
            and not exists (
              select 1
              from public.live_match_rounds history
              where history.session_id = p_session_id
                and least(
                  history.participant_a_user_id,
                  history.participant_b_user_id
                ) = least(p.user_id, peer.user_id)
                and greatest(
                  history.participant_a_user_id,
                  history.participant_b_user_id
                ) = greatest(p.user_id, peer.user_id)
            )
        ), '[]'::jsonb)
      ) order by p.joined_at nulls last, p.created_at)
      from public.live_participants p
      join public.profiles pr on pr.id = p.profile_id
      where p.session_id = p_session_id
        and p.open_to_introductions
        and p.role <> 'host'
        and p.state in ('audience', 'stage_requested', 'backstage', 'on_stage')
        and pr.deleted_at is null
        and pr.profile_completed
        and coalesce(pr.is_active, true)
        and not exists (
          select 1
          from public.live_match_rounds active
          where active.session_id = p_session_id
            and active.state in ('proposed', 'awaiting_consent', 'both_accepted', 'public_introduction')
            and (
              active.state <> 'awaiting_consent'
              or active.expires_at > timezone('utc', now())
            )
            and p.user_id in (
              active.participant_a_user_id,
              active.participant_b_user_id
            )
        )
    ), '[]'::jsonb) else '[]'::jsonb end,
    'activeRound', case when v_round.id is null then null else jsonb_build_object(
      'id', v_round.id,
      'session_id', v_round.session_id,
      'state', v_round.state,
      'participant_a', (
        select jsonb_build_object(
          'user_id', v_round.participant_a_user_id,
          'profile_id', pr.id,
          'full_name', pr.full_name,
          'avatar_url', public.live_profile_avatar(pr),
          'age', pr.age,
          'city', pr.city
        )
        from public.profiles pr
        where pr.id = v_round.participant_a_profile_id
      ),
      'participant_b', (
        select jsonb_build_object(
          'user_id', v_round.participant_b_user_id,
          'profile_id', pr.id,
          'full_name', pr.full_name,
          'avatar_url', public.live_profile_avatar(pr),
          'age', pr.age,
          'city', pr.city
        )
        from public.profiles pr
        where pr.id = v_round.participant_b_profile_id
      ),
      'connection_signals', case when v_can_manage or v_round.state = 'public_introduction'
        then v_round.connection_signals else '[]'::jsonb end,
      'conversation_spark', case when v_can_manage or v_round.state in ('both_accepted', 'public_introduction')
        then v_round.conversation_spark else '{}'::jsonb end,
      'my_response', v_my_response,
      'is_participant', v_is_participant,
      'expires_at', v_round.expires_at
    ) end
  );
end;
$$;

-- Preserve the Phase 3 privilege boundary after replacing the functions.
revoke all on function public.live_match_pair_is_eligible(uuid, uuid, uuid)
from public, anon, authenticated;

revoke all on function public.live_hosted_matching_snapshot(uuid)
from public, anon, authenticated;

grant execute on function public.live_hosted_matching_snapshot(uuid)
to authenticated;

commit;
