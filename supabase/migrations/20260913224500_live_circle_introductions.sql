begin;

-- Circle Lives use the same explicit, revocable introduction consent as Hosted
-- Match Night. Quick Connect remains separate because it owns a distinct pool
-- and double-consent lifecycle.
create or replace function public.rpc_create_live_match_round(
  p_session_id uuid,
  p_participant_a_user_id uuid,
  p_participant_b_user_id uuid,
  p_client_proposal_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  v_existing public.live_match_rounds;
  v_a public.live_participants;
  v_b public.live_participants;
  v_session public.live_sessions;
  v_round_id uuid;
begin
  if auth.uid() is null or not public.has_live_capability(p_session_id,'live.create_match_round') then
    raise exception 'live_match_round_forbidden' using errcode='42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('live-match:'||p_session_id::text,0));
  update public.live_match_rounds
  set state='expired',consent_resolved_at=timezone('utc',now())
  where session_id=p_session_id and state='awaiting_consent'
    and expires_at <= timezone('utc',now());
  select * into v_existing from public.live_match_rounds
  where session_id=p_session_id and created_by_user_id=auth.uid() and client_proposal_id=p_client_proposal_id;
  if v_existing.id is not null then
    if least(v_existing.participant_a_user_id,v_existing.participant_b_user_id)
       <> least(p_participant_a_user_id,p_participant_b_user_id)
       or greatest(v_existing.participant_a_user_id,v_existing.participant_b_user_id)
       <> greatest(p_participant_a_user_id,p_participant_b_user_id) then
      raise exception 'live_match_proposal_id_conflict' using errcode='23505';
    end if;
    return public.live_hosted_matching_snapshot(p_session_id);
  end if;
  select * into v_session from public.live_sessions where id=p_session_id for update;
  if v_session.id is null then raise exception 'live_session_not_found' using errcode='P0002'; end if;
  if v_session.status <> 'live'
     or v_session.format not in ('hosted_match_night','circle_live') then
    raise exception 'live_match_round_session_invalid' using errcode='22023';
  end if;
  if not public.live_match_pair_is_eligible(p_session_id,p_participant_a_user_id,p_participant_b_user_id) then
    raise exception 'live_match_pair_ineligible' using errcode='42501';
  end if;
  select * into v_a from public.live_participants where session_id=p_session_id and user_id=p_participant_a_user_id;
  select * into v_b from public.live_participants where session_id=p_session_id and user_id=p_participant_b_user_id;
  insert into public.live_match_rounds(
    session_id,client_proposal_id,created_by_user_id,
    participant_a_user_id,participant_a_profile_id,participant_b_user_id,participant_b_profile_id,
    state,connection_signals,conversation_spark
  ) values (
    p_session_id,p_client_proposal_id,auth.uid(),
    v_a.user_id,v_a.profile_id,v_b.user_id,v_b.profile_id,
    'awaiting_consent',public.live_build_connection_signals(v_a.profile_id,v_b.profile_id),
    public.live_build_conversation_spark(v_a.profile_id,v_b.profile_id)
  ) returning id into v_round_id;
  insert into public.live_session_events(session_id,actor_user_id,event_type,to_state,metadata)
  values(p_session_id,auth.uid(),'match_round_invited','awaiting_consent',jsonb_build_object('matchRoundId',v_round_id));
  return public.live_hosted_matching_snapshot(p_session_id);
end;
$$;

revoke all on function public.rpc_create_live_match_round(uuid,uuid,uuid,uuid)
from public, anon, authenticated;
grant execute on function public.rpc_create_live_match_round(uuid,uuid,uuid,uuid)
to authenticated;

commit;
