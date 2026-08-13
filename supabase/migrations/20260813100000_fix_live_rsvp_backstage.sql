-- Keep invitations RSVP-able while the host is preparing backstage.

create or replace function public.rpc_rsvp_live_session(
  p_session_id uuid,
  p_attending boolean,
  p_open_to_introductions boolean default false
)
returns public.live_participants
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  v_profile public.profiles;
  v_session public.live_sessions;
  v_participant public.live_participants;
begin
  v_profile := public.live_active_profile(auth.uid());
  select * into v_session from public.live_sessions where id=p_session_id for update;
  if v_session.id is null
     or v_session.status not in ('scheduled','waiting_for_quorum','confirmed','backstage')
     or not public.can_view_live_session(p_session_id,auth.uid()) then
    raise exception 'live_rsvp_unavailable' using errcode='42501';
  end if;

  select * into v_participant from public.live_participants
    where session_id=p_session_id and user_id=auth.uid() for update;
  if v_participant.state in ('removed','banned') then
    raise exception 'live_rsvp_forbidden' using errcode='42501';
  end if;

  if v_participant.id is null then
    insert into public.live_participants(
      session_id,user_id,profile_id,origin_context_type,origin_context_id,
      role,state,rsvp_status,open_to_introductions
    )
    values(
      p_session_id,auth.uid(),v_profile.id,v_session.context_type,v_session.context_id,
      'audience','confirmed',case when p_attending then 'going' else 'declined' end,
      p_open_to_introductions
    )
    returning * into v_participant;

    insert into public.live_participant_roles(session_id,user_id,role,assigned_by_user_id)
    values(p_session_id,auth.uid(),'audience',auth.uid()) on conflict do nothing;
  else
    update public.live_participants set
      rsvp_status=case when p_attending then 'going' else 'declined' end,
      state=case when p_attending and state in ('invited','left') then 'confirmed' else state end,
      open_to_introductions=p_open_to_introductions
    where id=v_participant.id returning * into v_participant;
  end if;

  insert into public.live_session_events(session_id,actor_user_id,event_type,metadata)
  values(p_session_id,auth.uid(),'rsvp_updated',jsonb_build_object('attending',p_attending));
  return v_participant;
end;
$$;

revoke all on function public.rpc_rsvp_live_session(uuid,boolean,boolean) from public,anon;
grant execute on function public.rpc_rsvp_live_session(uuid,boolean,boolean) to authenticated;
