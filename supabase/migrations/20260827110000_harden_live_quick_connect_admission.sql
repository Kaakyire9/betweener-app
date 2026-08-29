-- Quick Connect has a dedicated route, so entering it must also establish the
-- caller's parent Live admission. Requiring a pre-existing roster row made
-- direct entry dependent on which screen the caller visited first.

create or replace function public.rpc_join_live_quick_connect(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  v_user_id uuid := auth.uid();
  v_profile public.profiles;
  v_session public.live_sessions;
  v_participant public.live_participants;
begin
  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  select session.* into v_session
  from public.live_sessions session
  where session.id = p_session_id;

  if v_session.id is null
     or v_session.format <> 'quick_connect'
     or v_session.status not in ('live', 'backstage') then
    raise exception 'live_quick_connect_unavailable' using errcode = '23514';
  end if;

  if not public.can_view_live_session(p_session_id, v_user_id) then
    raise exception 'live_quick_connect_forbidden' using errcode = '42501';
  end if;

  -- Apply the same completed-profile and verification policy as normal Live
  -- admission. The returned profile is also the canonical Quick Connect
  -- identity; client-provided identity is never accepted.
  v_profile := public.live_active_profile(v_user_id);

  select participant.* into v_participant
  from public.live_participants participant
  where participant.session_id = p_session_id
    and participant.user_id = v_user_id;

  if v_participant.state in ('removed', 'banned') then
    raise exception 'live_quick_connect_forbidden' using errcode = '42501';
  end if;

  if v_participant.id is null
     or v_participant.state in ('invited', 'confirmed', 'waitlisted', 'left') then
    -- Normal admission owns capacity, re-entry and structural arrival events.
    -- Audience members cannot enter a backstage session before it goes Live.
    if v_session.status <> 'live' then
      raise exception 'live_quick_connect_not_started' using errcode = '42501';
    end if;
    perform public.rpc_join_live_session(p_session_id);
  else
    -- Refresh an existing active admission without producing a duplicate
    -- participant_joined event. This also restores temporarily disconnected
    -- callers and renews the coalesced presence lease.
    perform public.rpc_heartbeat_live_session(p_session_id);
  end if;

  select participant.* into v_participant
  from public.live_participants participant
  where participant.session_id = p_session_id
    and participant.user_id = v_user_id;

  if v_participant.id is null
     or v_participant.state in ('left', 'removed', 'banned') then
    raise exception 'live_quick_connect_admission_failed' using errcode = '42501';
  end if;

  -- Entering Quick Connect is explicit, session-scoped consent. It does not
  -- mutate the member's hosted-introduction preference.
  insert into public.live_quick_connect_participants(
    session_id,
    user_id,
    profile_id
  ) values (
    p_session_id,
    v_user_id,
    v_profile.id
  )
  on conflict(session_id, user_id) do update
  set state = case
        when public.live_quick_connect_participants.state = 'paired' then 'paired'
        else 'waiting'
      end,
      connection_state = 'connected',
      reconnect_deadline = null,
      last_seen_at = timezone('utc', now()),
      pairing_key = case
        when public.live_quick_connect_participants.state = 'paired'
          then public.live_quick_connect_participants.pairing_key
        else gen_random_uuid()
      end;

  insert into public.live_quick_connect_events(
    session_id,
    actor_user_id,
    event_type
  ) values (
    p_session_id,
    v_user_id,
    'queue_joined'
  );

  perform public.live_quick_connect_sync(p_session_id);
  return public.rpc_get_live_quick_connect(p_session_id);
end;
$$;

revoke all on function public.rpc_join_live_quick_connect(uuid) from public, anon;
grant execute on function public.rpc_join_live_quick_connect(uuid) to authenticated;
