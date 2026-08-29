-- Make public-stage intake an explicit, host-controlled capability.
-- Existing pending requests remain resolvable/withdrawable when intake closes,
-- while new requests are rejected by the database until a host reopens it.

begin;

alter table public.live_sessions
  add column if not exists stage_requests_open boolean not null default false;

comment on column public.live_sessions.stage_requests_open is
  'Whether admitted audience members may create new stage seat requests. Hosts and moderators control this independently of direct invitations.';

create or replace function public.rpc_set_live_stage_requests_open(
  p_session_id uuid,
  p_open boolean
)
returns public.live_sessions
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  v_session public.live_sessions;
begin
  if auth.uid() is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  if p_open is null then
    raise exception 'live_stage_intake_state_required' using errcode = '22023';
  end if;

  if not public.has_live_capability(p_session_id, 'live.manage_stage') then
    raise exception 'live_stage_manage_forbidden' using errcode = '42501';
  end if;

  select *
  into v_session
  from public.live_sessions
  where id = p_session_id
  for update;

  if v_session.id is null then
    raise exception 'live_session_not_found' using errcode = 'P0002';
  end if;

  if v_session.status <> 'live' then
    raise exception 'live_stage_intake_unavailable' using errcode = '55000';
  end if;

  -- Idempotent retries return the canonical row without duplicating events.
  if v_session.stage_requests_open = p_open then
    return v_session;
  end if;

  update public.live_sessions
  set
    stage_requests_open = p_open,
    version = version + 1,
    updated_at = timezone('utc', now())
  where id = p_session_id
  returning * into v_session;

  insert into public.live_session_events (
    session_id,
    actor_user_id,
    event_type,
    metadata
  )
  values (
    p_session_id,
    auth.uid(),
    case when p_open then 'stage_requests_opened' else 'stage_requests_closed' end,
    jsonb_build_object('stageRequestsOpen', p_open)
  );

  return v_session;
end;
$$;

create or replace function public.rpc_request_live_seat(p_session_id uuid)
returns public.live_seat_requests
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  v_session public.live_sessions;
  v_participant public.live_participants;
  v_request public.live_seat_requests;
begin
  if auth.uid() is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  -- Serialize intake changes and new requests against the same session row.
  select *
  into v_session
  from public.live_sessions
  where id = p_session_id
  for update;

  if v_session.id is null then
    raise exception 'live_session_not_found' using errcode = 'P0002';
  end if;

  if v_session.status <> 'live' then
    raise exception 'live_seat_request_unavailable' using errcode = '55000';
  end if;

  select *
  into v_participant
  from public.live_participants
  where session_id = p_session_id
    and user_id = auth.uid()
  for update;

  if v_participant.id is null
     or v_participant.state not in ('audience', 'stage_requested')
     or not public.has_live_capability(p_session_id, 'live.request_seat') then
    raise exception 'live_seat_request_forbidden' using errcode = '42501';
  end if;

  -- Preserve idempotency even if intake closes while a client is retrying a
  -- request that the server already accepted.
  select *
  into v_request
  from public.live_seat_requests
  where session_id = p_session_id
    and user_id = auth.uid()
    and status = 'pending'
  limit 1
  for update;

  if v_request.id is not null then
    return v_request;
  end if;

  if not v_session.stage_requests_open then
    raise exception 'live_stage_requests_closed' using errcode = '42501';
  end if;

  insert into public.live_seat_requests (session_id, user_id, profile_id)
  values (p_session_id, auth.uid(), v_participant.profile_id)
  returning * into v_request;

  if v_participant.state = 'audience' then
    update public.live_participants
    set state = 'stage_requested'
    where id = v_participant.id;
  end if;

  insert into public.live_session_events (
    session_id,
    actor_user_id,
    event_type,
    to_state,
    metadata
  )
  values (
    p_session_id,
    auth.uid(),
    'seat_requested',
    'stage_requested',
    jsonb_build_object('intakeMode', 'host_opened')
  );

  return v_request;
end;
$$;

revoke all on function public.rpc_set_live_stage_requests_open(uuid, boolean) from public, anon;
grant execute on function public.rpc_set_live_stage_requests_open(uuid, boolean) to authenticated, service_role;

revoke all on function public.rpc_request_live_seat(uuid) from public, anon;
grant execute on function public.rpc_request_live_seat(uuid) to authenticated, service_role;

-- The client listens for this single low-frequency authority flag. Add the
-- table only when an earlier environment has not already published it.
do $$
begin
  if exists (
    select 1 from pg_publication where pubname = 'supabase_realtime'
  ) and not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'live_sessions'
  ) then
    alter publication supabase_realtime add table public.live_sessions;
  end if;
end;
$$;

commit;
