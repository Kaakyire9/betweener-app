-- Make self-demotion reliable for established publishers and during brief
-- presence reconnect races. The capability table records assignment changes
-- in created_at; it intentionally has no updated_at column.

create or replace function public.rpc_leave_live_stage(p_session_id uuid)
returns public.live_participants
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  v_session public.live_sessions;
  v_participant public.live_participants;
  v_was_stage_participant boolean;
  v_previous_state text;
  v_previous_reconnect_state text;
begin
  if auth.uid() is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  select * into v_session
  from public.live_sessions session
  where session.id = p_session_id
  for update;

  if v_session.id is null then
    raise exception 'live_session_not_found' using errcode = 'P0002';
  end if;

  select * into v_participant
  from public.live_participants participant
  where participant.session_id = p_session_id
    and participant.user_id = auth.uid()
  for update;

  if v_participant.id is null then
    raise exception 'live_participant_not_found' using errcode = 'P0002';
  end if;
  if v_participant.role = 'host' or v_session.created_by_user_id = auth.uid() then
    raise exception 'live_host_cannot_leave_stage' using errcode = '42501';
  end if;

  -- A host demotion or a repeated client action may already have completed.
  if v_participant.state = 'audience' then
    return v_participant;
  end if;

  -- Presence cleanup temporarily changes state while retaining reconnect_state
  -- and stage_slot. Treat that as the same authoritative stage membership.
  v_was_stage_participant :=
    v_participant.state in ('on_stage', 'backstage')
    or (
      v_participant.state = 'temporarily_disconnected'
      and (
        v_participant.reconnect_state in ('on_stage', 'backstage')
        or v_participant.stage_slot is not null
      )
    );

  if not v_was_stage_participant then
    -- Terminal participant states already satisfy the safety outcome and must
    -- never be resurrected as audience members by a delayed tap.
    if v_participant.state in ('left', 'removed', 'banned') then
      return v_participant;
    end if;
    raise exception 'live_stage_departure_invalid' using errcode = '22023';
  end if;

  v_previous_state := v_participant.state;
  v_previous_reconnect_state := v_participant.reconnect_state;

  update public.live_participants participant
  set state = 'audience',
      reconnect_state = null,
      stage_slot = null,
      stage_left_at = timezone('utc'::text, now()),
      microphone_muted_by_moderator = false,
      last_seen_at = timezone('utc'::text, now()),
      updated_at = timezone('utc'::text, now())
  where participant.id = v_participant.id
  returning * into v_participant;

  insert into public.live_session_capability_assignments (
    session_id, user_id, capability, effect, assigned_by_user_id
  ) values (
    p_session_id, auth.uid(), 'live.publish', 'revoke', auth.uid()
  )
  on conflict (session_id, user_id, capability)
  do update set
    effect = excluded.effect,
    assigned_by_user_id = excluded.assigned_by_user_id,
    created_at = timezone('utc'::text, now());

  insert into public.live_session_events (
    session_id, actor_user_id, event_type, metadata
  ) values (
    p_session_id,
    auth.uid(),
    'participant_demoted',
    jsonb_build_object(
      'targetUserId', auth.uid(),
      'selfInitiated', true,
      'previousState', v_previous_state,
      'previousReconnectState', v_previous_reconnect_state
    )
  );

  return v_participant;
end;
$$;

revoke all on function public.rpc_leave_live_stage(uuid) from public, anon;
grant execute on function public.rpc_leave_live_stage(uuid) to authenticated, service_role;
