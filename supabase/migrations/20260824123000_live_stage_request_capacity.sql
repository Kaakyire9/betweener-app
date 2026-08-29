-- Replace the stage-intake Boolean with an explicit, host-controlled guest
-- capacity. The legacy Boolean remains a synchronized compatibility projection
-- while deployed clients move to the capacity-aware contract.

begin;

alter table public.live_sessions
  add column if not exists stage_request_capacity smallint not null default 0;

update public.live_sessions
set stage_request_capacity = case
  when stage_requests_open then least(3, greatest(maximum_publishers - 1, 0))
  else 0
end;

update public.live_sessions
set stage_requests_open = stage_request_capacity > 0
where stage_requests_open is distinct from (stage_request_capacity > 0);

alter table public.live_sessions
  drop constraint if exists live_sessions_stage_request_capacity_valid;

alter table public.live_sessions
  add constraint live_sessions_stage_request_capacity_valid check (
    stage_request_capacity between 0 and least(3, greatest(maximum_publishers - 1, 0))
  );

comment on column public.live_sessions.stage_request_capacity is
  'Maximum non-host stage seats that may be filled through host-approved audience requests. Zero closes stage requests.';

create or replace function public.rpc_set_live_stage_request_capacity(
  p_session_id uuid,
  p_capacity integer
)
returns public.live_sessions
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  v_session public.live_sessions;
  v_previous_capacity integer;
  v_maximum_guest_seats integer;
  v_occupied_guest_seats integer;
begin
  if auth.uid() is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  if p_capacity is null then
    raise exception 'live_stage_request_capacity_required' using errcode = '22023';
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

  v_maximum_guest_seats := least(3, greatest(v_session.maximum_publishers - 1, 0));
  if p_capacity < 0 or p_capacity > v_maximum_guest_seats then
    raise exception 'live_stage_request_capacity_invalid' using errcode = '22023';
  end if;

  select count(distinct participant.user_id)::integer
  into v_occupied_guest_seats
  from public.live_participants participant
  where participant.session_id = p_session_id
    and participant.user_id <> v_session.created_by_user_id
    and participant.state in ('backstage', 'on_stage');

  if p_capacity < v_occupied_guest_seats then
    raise exception 'live_stage_capacity_below_occupied' using errcode = '55000';
  end if;

  -- Idempotent retries return the canonical row without duplicating events.
  if v_session.stage_request_capacity = p_capacity
     and v_session.stage_requests_open = (p_capacity > 0) then
    return v_session;
  end if;

  v_previous_capacity := v_session.stage_request_capacity;
  update public.live_sessions
  set
    stage_request_capacity = p_capacity,
    stage_requests_open = p_capacity > 0,
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
    case when p_capacity > 0 then 'stage_requests_opened' else 'stage_requests_closed' end,
    jsonb_build_object(
      'previousCapacity', v_previous_capacity,
      'stageRequestCapacity', p_capacity,
      'stageRequestsOpen', p_capacity > 0
    )
  );

  return v_session;
end;
$$;

-- Compatibility for any already-deployed client still using the Boolean RPC.
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
  v_capacity integer;
  v_result public.live_sessions;
begin
  if p_open is null then
    raise exception 'live_stage_intake_state_required' using errcode = '22023';
  end if;

  if p_open then
    select least(3, greatest(maximum_publishers - 1, 0))
    into v_capacity
    from public.live_sessions
    where id = p_session_id;

    if v_capacity is null then
      raise exception 'live_session_not_found' using errcode = 'P0002';
    end if;
  else
    v_capacity := 0;
  end if;

  select *
  into v_result
  from public.rpc_set_live_stage_request_capacity(p_session_id, v_capacity);

  return v_result;
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
  v_reserved_guest_seats integer;
begin
  if auth.uid() is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  -- Serialize capacity changes and requests against the same authority row.
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

  -- A lost response is safe to retry, even after capacity later changes.
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

  if v_session.stage_request_capacity <= 0 then
    raise exception 'live_stage_requests_closed' using errcode = '42501';
  end if;

  -- Approved backstage guests reserve a seat, as do guests already on stage.
  select count(distinct participant.user_id)
  into v_reserved_guest_seats
  from public.live_participants participant
  where participant.session_id = p_session_id
    and participant.role <> 'host'
    and participant.state in ('backstage', 'on_stage');

  if v_reserved_guest_seats >= v_session.stage_request_capacity then
    raise exception 'live_stage_capacity_full' using errcode = '55000';
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
    jsonb_build_object(
      'intakeMode', 'host_capacity',
      'stageRequestCapacity', v_session.stage_request_capacity
    )
  );

  return v_request;
end;
$$;

create or replace function public.rpc_resolve_live_seat_request(
  p_request_id uuid,
  p_approve boolean
)
returns public.live_participants
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  v_request public.live_seat_requests;
  v_session public.live_sessions;
  v_participant public.live_participants;
  v_reserved_guest_seats integer;
begin
  if auth.uid() is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  -- Read the authority key first, then serialize all approvals on the session.
  select *
  into v_request
  from public.live_seat_requests
  where id = p_request_id;

  if v_request.id is null then
    raise exception 'live_seat_request_not_found' using errcode = 'P0002';
  end if;

  if not public.has_live_capability(v_request.session_id, 'live.approve_seat_request') then
    raise exception 'live_seat_resolution_forbidden' using errcode = '42501';
  end if;

  select *
  into v_session
  from public.live_sessions
  where id = v_request.session_id
  for update;

  select *
  into v_request
  from public.live_seat_requests
  where id = p_request_id
  for update;

  select *
  into v_participant
  from public.live_participants
  where session_id = v_request.session_id
    and user_id = v_request.user_id
  for update;

  if v_session.id is null or v_participant.id is null then
    raise exception 'live_seat_request_target_not_found' using errcode = 'P0002';
  end if;

  -- Duplicate resolution returns the already-authoritative participant state.
  if v_request.status <> 'pending' then
    return v_participant;
  end if;

  if p_approve then
    if v_session.status <> 'live' or v_session.stage_request_capacity <= 0 then
      raise exception 'live_stage_intake_unavailable' using errcode = '55000';
    end if;

    select count(distinct participant.user_id)
    into v_reserved_guest_seats
    from public.live_participants participant
    where participant.session_id = v_request.session_id
      and participant.user_id <> v_request.user_id
      and participant.role <> 'host'
      and participant.state in ('backstage', 'on_stage');

    if v_reserved_guest_seats >= v_session.stage_request_capacity then
      raise exception 'live_stage_capacity_full' using errcode = '55000';
    end if;
  end if;

  update public.live_seat_requests
  set
    status = case when p_approve then 'approved' else 'declined' end,
    resolved_at = timezone('utc', now()),
    resolved_by_user_id = auth.uid()
  where id = v_request.id;

  update public.live_participants
  set state = case when p_approve then 'backstage' else 'audience' end
  where id = v_participant.id
  returning * into v_participant;

  insert into public.live_session_events (
    session_id,
    actor_user_id,
    event_type,
    to_state,
    metadata
  )
  values (
    v_request.session_id,
    auth.uid(),
    'seat_request_resolved',
    v_participant.state,
    jsonb_build_object(
      'targetUserId', v_request.user_id,
      'approved', p_approve,
      'stageRequestCapacity', v_session.stage_request_capacity
    )
  );

  return v_participant;
end;
$$;

-- Include capacity changes in the existing content-free realtime pulse.
create or replace function public.bump_live_session_structure_update()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  v_reason text := 'session_structure';
begin
  if tg_op = 'UPDATE'
     and (
       new.stage_requests_open is distinct from old.stage_requests_open
       or new.stage_request_capacity is distinct from old.stage_request_capacity
     ) then
    v_reason := 'stage_intake';
  end if;

  insert into public.live_session_structure_updates as current_update (
    session_id,
    version,
    reason,
    updated_at
  ) values (
    new.id,
    1,
    v_reason,
    timezone('utc', now())
  )
  on conflict (session_id) do update
  set
    version = current_update.version + 1,
    reason = excluded.reason,
    updated_at = excluded.updated_at;

  return new;
end;
$$;

drop trigger if exists live_sessions_update_structure_update on public.live_sessions;
create trigger live_sessions_update_structure_update
after update of status, stage_requests_open, stage_request_capacity, version
on public.live_sessions
for each row
when (
  old.status is distinct from new.status
  or old.stage_requests_open is distinct from new.stage_requests_open
  or old.stage_request_capacity is distinct from new.stage_request_capacity
  or old.version is distinct from new.version
)
execute function public.bump_live_session_structure_update();

revoke all on function public.rpc_set_live_stage_request_capacity(uuid, integer)
from public, anon;
grant execute on function public.rpc_set_live_stage_request_capacity(uuid, integer)
to authenticated, service_role;

revoke all on function public.rpc_set_live_stage_requests_open(uuid, boolean)
from public, anon;
grant execute on function public.rpc_set_live_stage_requests_open(uuid, boolean)
to authenticated, service_role;

revoke all on function public.rpc_request_live_seat(uuid) from public, anon;
grant execute on function public.rpc_request_live_seat(uuid)
to authenticated, service_role;

revoke all on function public.rpc_resolve_live_seat_request(uuid, boolean)
from public, anon;
grant execute on function public.rpc_resolve_live_seat_request(uuid, boolean)
to authenticated, service_role;

commit;
