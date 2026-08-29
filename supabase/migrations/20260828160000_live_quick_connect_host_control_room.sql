-- Betweener Live Quick Connect host control room.
-- Existing active rotations remain open. Newly-created Quick Connect sessions
-- start closed and cannot pair anyone until their creator opens the room.

begin;

create table public.live_quick_connect_controls (
  session_id uuid primary key references public.live_sessions(id) on delete cascade,
  state text not null default 'closed',
  creator_mode text not null default 'facilitator',
  round_seconds integer not null default 180,
  version bigint not null default 1,
  updated_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint live_quick_control_state_valid check (
    state in ('closed', 'open', 'paused', 'draining', 'ended')
  ),
  constraint live_quick_control_creator_mode_valid check (
    creator_mode in ('facilitator', 'participant')
  ),
  constraint live_quick_control_round_seconds_valid check (
    round_seconds in (120, 180, 300)
  ),
  constraint live_quick_control_version_valid check (version > 0)
);

alter table public.live_quick_connect_controls enable row level security;
revoke all on table public.live_quick_connect_controls from public, anon, authenticated;
grant all on table public.live_quick_connect_controls to service_role;

-- Preserve the behaviour of rotations which existed before host controls.
insert into public.live_quick_connect_controls (
  session_id,
  state,
  creator_mode,
  updated_by_user_id
)
select
  session.id,
  case
    when session.status in ('ended', 'cancelled') then 'ended'
    when session.status in ('live', 'backstage') then 'open'
    else 'closed'
  end,
  case when exists (
    select 1
    from public.live_quick_connect_participants participant
    where participant.session_id = session.id
      and participant.user_id = session.created_by_user_id
      and participant.state not in ('left', 'unavailable')
  ) then 'participant' else 'facilitator' end,
  session.created_by_user_id
from public.live_sessions session
where session.format = 'quick_connect'
on conflict (session_id) do nothing;

create or replace function public.prepare_live_quick_connect_control_update()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
begin
  new.updated_at := timezone('utc', now());
  new.version := greatest(old.version + 1, new.version);
  return new;
end;
$$;

revoke all on function public.prepare_live_quick_connect_control_update()
from public, anon, authenticated;

create trigger live_quick_control_prepare_update
before update on public.live_quick_connect_controls
for each row execute function public.prepare_live_quick_connect_control_update();

create or replace function public.create_live_quick_connect_control()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
begin
  if new.format = 'quick_connect' then
    insert into public.live_quick_connect_controls (
      session_id,
      state,
      creator_mode,
      round_seconds,
      updated_by_user_id
    ) values (
      new.id,
      'closed',
      'facilitator',
      case
        when (new.configuration ->> 'quick_connect_round_seconds') in ('120', '180', '300')
          then (new.configuration ->> 'quick_connect_round_seconds')::integer
        else 180
      end,
      new.created_by_user_id
    ) on conflict (session_id) do nothing;
  end if;
  return new;
end;
$$;

revoke all on function public.create_live_quick_connect_control()
from public, anon, authenticated;

create trigger live_session_create_quick_connect_control
after insert on public.live_sessions
for each row execute function public.create_live_quick_connect_control();

create or replace function public.bump_live_quick_connect_control_update()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
begin
  insert into public.live_quick_connect_updates(session_id, version)
  values(new.session_id, 1)
  on conflict(session_id) do update
  set version = public.live_quick_connect_updates.version + 1,
      updated_at = timezone('utc', now());
  return new;
end;
$$;

revoke all on function public.bump_live_quick_connect_control_update()
from public, anon, authenticated;

create trigger live_quick_control_bump
after insert or update on public.live_quick_connect_controls
for each row execute function public.bump_live_quick_connect_control_update();

create or replace function public.live_quick_connect_host_snapshot(
  p_session_id uuid,
  p_requesting_user_id uuid
)
returns jsonb
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
  select session.* into v_session
  from public.live_sessions session
  where session.id = p_session_id;

  if v_session.id is null or v_session.format <> 'quick_connect' then
    raise exception 'live_quick_connect_session_invalid' using errcode = '23514';
  end if;
  if p_requesting_user_id is null
     or v_session.created_by_user_id <> p_requesting_user_id then
    raise exception 'live_quick_connect_control_forbidden' using errcode = '42501';
  end if;

  select control.* into v_control
  from public.live_quick_connect_controls control
  where control.session_id = p_session_id;

  if v_control.session_id is null then
    raise exception 'live_quick_connect_control_missing' using errcode = 'P0002';
  end if;

  select count(*)::integer into v_waiting_people
  from public.live_quick_connect_participants participant
  where participant.session_id = p_session_id
    and participant.state = 'waiting'
    and participant.connection_state = 'connected';

  select count(*)::integer into v_eligible_people
  from public.live_quick_connect_participants participant
  where participant.session_id = p_session_id
    and participant.state = 'waiting'
    and participant.connection_state = 'connected'
    and exists (
      select 1
      from public.live_quick_connect_participants candidate
      where candidate.session_id = participant.session_id
        and candidate.user_id <> participant.user_id
        and candidate.state = 'waiting'
        and candidate.connection_state = 'connected'
        and public.live_quick_connect_pair_is_eligible(
          p_session_id,
          participant.user_id,
          candidate.user_id
        )
    );

  select count(*)::integer into v_active_pairs
  from public.live_quick_connect_pairings pairing
  where pairing.session_id = p_session_id
    and pairing.state in ('active', 'reconnect_grace');

  select count(*)::integer into v_reconnecting_people
  from public.live_quick_connect_participants participant
  where participant.session_id = p_session_id
    and participant.connection_state = 'disconnected'
    and participant.state in ('paired', 'disconnected');

  select count(*)::integer into v_completed_rounds
  from public.live_quick_connect_rounds round_row
  where round_row.session_id = p_session_id
    and round_row.state = 'completed';

  return jsonb_build_object(
    'session_id', v_control.session_id,
    'state', v_control.state,
    'creator_mode', v_control.creator_mode,
    'round_seconds', v_control.round_seconds,
    'version', v_control.version,
    'server_now', timezone('utc', now()),
    'can_manage', true,
    'metrics', jsonb_build_object(
      'waiting_people', v_waiting_people,
      'eligible_people', v_eligible_people,
      'active_pairs', v_active_pairs,
      'reconnecting_people', v_reconnecting_people,
      'completed_rounds', v_completed_rounds
    )
  );
end;
$$;

revoke all on function public.live_quick_connect_host_snapshot(uuid, uuid)
from public, anon, authenticated;

-- Pairing is now gated by the server-owned control row. Lifecycle cleanup is
-- always performed, including while entry is paused, closed or draining.
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
  v_active_pair_count integer := 0;
  v_round_interval interval;
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
    session_id,
    state,
    creator_mode,
    updated_by_user_id
  ) values (
    v_session.id,
    case
      when v_session.status in ('ended', 'cancelled') then 'ended'
      else 'closed'
    end,
    'facilitator',
    v_session.created_by_user_id
  ) on conflict(session_id) do nothing;

  select control.* into v_control
  from public.live_quick_connect_controls control
  where control.session_id = p_session_id
  for update;

  if v_control.session_id is null then
    raise exception 'live_quick_connect_control_missing' using errcode = 'P0002';
  end if;

  v_round_interval := make_interval(secs => v_control.round_seconds);

  insert into public.live_quick_connect_events(session_id, pairing_id, event_type, metadata)
  select pairing.session_id, pairing.id, 'round_incomplete',
    jsonb_build_object('reason', 'reconnect_grace_expired')
  from public.live_quick_connect_pairings pairing
  where pairing.session_id = p_session_id
    and pairing.state = 'reconnect_grace'
    and pairing.reconnect_deadline <= v_now
  on conflict do nothing;

  update public.live_quick_connect_rounds round_row
  set state = 'cancelled',
      completed_at = v_now,
      version = round_row.version + 1
  where round_row.session_id = p_session_id
    and round_row.state in ('open', 'active')
    and exists (
      select 1
      from public.live_quick_connect_pairings pairing
      where pairing.round_id = round_row.id
        and pairing.state = 'reconnect_grace'
        and pairing.reconnect_deadline <= v_now
    );

  update public.live_quick_connect_pairings pairing
  set state = 'round_incomplete',
      completed_at = v_now,
      version = pairing.version + 1
  where pairing.session_id = p_session_id
    and pairing.state = 'reconnect_grace'
    and pairing.reconnect_deadline <= v_now;

  insert into public.live_quick_connect_events(session_id, pairing_id, event_type, metadata)
  select pairing.session_id, pairing.id, 'pair_completed',
    jsonb_build_object('reason', 'round_timer_elapsed')
  from public.live_quick_connect_pairings pairing
  where pairing.session_id = p_session_id
    and pairing.state = 'active'
    and pairing.ends_at <= v_now
  on conflict do nothing;

  update public.live_quick_connect_rounds round_row
  set state = 'completed',
      completed_at = v_now,
      version = round_row.version + 1
  where round_row.session_id = p_session_id
    and round_row.state in ('open', 'active')
    and exists (
      select 1
      from public.live_quick_connect_pairings pairing
      where pairing.round_id = round_row.id
        and pairing.state = 'active'
        and pairing.ends_at <= v_now
    );

  update public.live_quick_connect_pairings pairing
  set state = 'completed',
      completed_at = v_now,
      shared_outcome = coalesce(pairing.shared_outcome, 'closed'),
      version = pairing.version + 1
  where pairing.session_id = p_session_id
    and pairing.state = 'active'
    and pairing.ends_at <= v_now;

  update public.live_quick_connect_participants participant
  set state = case
        when participant.connection_state = 'connected' then 'waiting'
        else 'unavailable'
      end,
      current_pairing_id = null,
      pairing_key = gen_random_uuid()
  where participant.session_id = p_session_id
    and participant.state in ('paired', 'disconnected')
    and not exists (
      select 1
      from public.live_quick_connect_pairings pairing
      where pairing.id = participant.current_pairing_id
        and pairing.state in ('active', 'reconnect_grace')
    );

  select count(*)::integer into v_active_pair_count
  from public.live_quick_connect_pairings pairing
  where pairing.session_id = p_session_id
    and pairing.state in ('active', 'reconnect_grace');

  if v_control.state = 'draining' and v_active_pair_count = 0 then
    update public.live_quick_connect_controls control
    set state = 'ended'
    where control.session_id = p_session_id
      and control.state = 'draining';

    update public.live_quick_connect_participants participant
    set state = 'left',
        connection_state = 'left_session',
        reconnect_deadline = null,
        current_pairing_id = null
    where participant.session_id = p_session_id
      and participant.state not in ('left', 'unavailable');
    return;
  end if;

  if v_control.state <> 'open' then
    return;
  end if;

  loop
    v_a := null;
    v_b := null;

    select participant.* into v_a
    from public.live_quick_connect_participants participant
    where participant.session_id = p_session_id
      and participant.state = 'waiting'
      and participant.connection_state = 'connected'
      and exists (
        select 1
        from public.live_quick_connect_participants candidate
        where candidate.session_id = p_session_id
          and candidate.state = 'waiting'
          and candidate.connection_state = 'connected'
          and candidate.user_id <> participant.user_id
          and public.live_quick_connect_pair_is_eligible(
            p_session_id,
            participant.user_id,
            candidate.user_id
          )
      )
    order by participant.pairing_key, participant.user_id
    limit 1
    for update skip locked;

    exit when v_a.user_id is null;

    select participant.* into v_b
    from public.live_quick_connect_participants participant
    where participant.session_id = p_session_id
      and participant.state = 'waiting'
      and participant.connection_state = 'connected'
      and participant.user_id <> v_a.user_id
      and public.live_quick_connect_pair_is_eligible(
        p_session_id,
        v_a.user_id,
        participant.user_id
      )
    order by participant.pairing_key, participant.user_id
    limit 1
    for update skip locked;

    exit when v_b.user_id is null;

    select coalesce(max(round_row.round_number), 0) + 1 into v_round_number
    from public.live_quick_connect_rounds round_row
    where round_row.session_id = p_session_id;

    insert into public.live_quick_connect_rounds(
      session_id,
      round_number,
      state,
      ends_at
    ) values (
      p_session_id,
      v_round_number,
      'active',
      v_now + v_round_interval
    ) returning id into v_round_id;

    insert into public.live_quick_connect_pairings(
      session_id,
      round_id,
      participant_a_user_id,
      participant_a_profile_id,
      participant_b_user_id,
      participant_b_profile_id,
      provider_call_id,
      ends_at
    ) values (
      p_session_id,
      v_round_id,
      v_a.user_id,
      v_a.profile_id,
      v_b.user_id,
      v_b.profile_id,
      'quick_' || replace(gen_random_uuid()::text, '-', ''),
      v_now + v_round_interval
    ) returning id into v_pairing_id;

    update public.live_quick_connect_participants participant
    set state = 'paired',
        current_pairing_id = v_pairing_id
    where participant.session_id = p_session_id
      and participant.user_id in (v_a.user_id, v_b.user_id);

    insert into public.live_quick_connect_events(session_id, pairing_id, event_type)
    values(p_session_id, v_pairing_id, 'paired');
  end loop;
end;
$$;

revoke all on function public.live_quick_connect_sync(uuid)
from public, anon, authenticated;

create or replace function public.rpc_get_live_quick_connect_host_control(
  p_session_id uuid
)
returns jsonb
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
  perform public.live_quick_connect_sync(p_session_id);
  return public.live_quick_connect_host_snapshot(p_session_id, v_user_id);
end;
$$;

revoke all on function public.rpc_get_live_quick_connect_host_control(uuid)
from public, anon;
grant execute on function public.rpc_get_live_quick_connect_host_control(uuid)
to authenticated;

create or replace function public.rpc_configure_live_quick_connect(
  p_session_id uuid,
  p_round_seconds integer,
  p_creator_mode text
)
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
  v_active_pairs integer := 0;
begin
  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if p_round_seconds not in (120, 180, 300) then
    raise exception 'live_quick_connect_round_seconds_invalid' using errcode = '22023';
  end if;
  if p_creator_mode not in ('facilitator', 'participant') then
    raise exception 'live_quick_connect_creator_mode_invalid' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('quick:' || p_session_id::text, 0));

  select session.* into v_session
  from public.live_sessions session
  where session.id = p_session_id
  for update;

  if v_session.id is null or v_session.format <> 'quick_connect' then
    raise exception 'live_quick_connect_session_invalid' using errcode = '23514';
  end if;
  if v_session.created_by_user_id <> v_user_id then
    raise exception 'live_quick_connect_control_forbidden' using errcode = '42501';
  end if;

  select control.* into v_control
  from public.live_quick_connect_controls control
  where control.session_id = p_session_id
  for update;

  if v_control.session_id is null then
    raise exception 'live_quick_connect_control_missing' using errcode = 'P0002';
  end if;

  select count(*)::integer into v_active_pairs
  from public.live_quick_connect_pairings pairing
  where pairing.session_id = p_session_id
    and pairing.state in ('active', 'reconnect_grace');

  if v_control.state not in ('closed', 'paused') or v_active_pairs > 0 then
    raise exception 'live_quick_connect_configuration_locked' using errcode = '55000';
  end if;

  update public.live_quick_connect_controls control
  set round_seconds = p_round_seconds,
      creator_mode = p_creator_mode,
      updated_by_user_id = v_user_id
  where control.session_id = p_session_id;

  if p_creator_mode = 'facilitator' then
    update public.live_quick_connect_participants participant
    set state = 'left',
        connection_state = 'left_session',
        reconnect_deadline = null,
        current_pairing_id = null
    where participant.session_id = p_session_id
      and participant.user_id = v_user_id
      and participant.state not in ('paired', 'disconnected');
  end if;

  return public.live_quick_connect_host_snapshot(p_session_id, v_user_id);
end;
$$;

revoke all on function public.rpc_configure_live_quick_connect(uuid, integer, text)
from public, anon;
grant execute on function public.rpc_configure_live_quick_connect(uuid, integer, text)
to authenticated;

create or replace function public.rpc_control_live_quick_connect(
  p_session_id uuid,
  p_action text
)
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
  v_next_state text;
  v_now timestamptz := timezone('utc', now());
begin
  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if p_action not in ('open', 'close', 'pause', 'resume', 'drain', 'end') then
    raise exception 'live_quick_connect_control_action_invalid' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('quick:' || p_session_id::text, 0));

  select session.* into v_session
  from public.live_sessions session
  where session.id = p_session_id
  for update;

  if v_session.id is null or v_session.format <> 'quick_connect' then
    raise exception 'live_quick_connect_session_invalid' using errcode = '23514';
  end if;
  if v_session.created_by_user_id <> v_user_id then
    raise exception 'live_quick_connect_control_forbidden' using errcode = '42501';
  end if;

  select control.* into v_control
  from public.live_quick_connect_controls control
  where control.session_id = p_session_id
  for update;

  if v_control.session_id is null then
    raise exception 'live_quick_connect_control_missing' using errcode = 'P0002';
  end if;

  v_next_state := case p_action
    when 'open' then case when v_control.state in ('closed', 'open', 'paused') then 'open' end
    when 'close' then case when v_control.state <> 'ended' then 'closed' end
    when 'pause' then case when v_control.state in ('open', 'paused') then 'paused' end
    when 'resume' then case when v_control.state in ('paused', 'open') then 'open' end
    when 'drain' then case when v_control.state in ('open', 'paused', 'draining') then 'draining' end
    when 'end' then 'ended'
    else null
  end;

  if v_next_state is null then
    raise exception 'live_quick_connect_control_transition_invalid' using errcode = '23514';
  end if;

  update public.live_quick_connect_controls control
  set state = v_next_state,
      updated_by_user_id = v_user_id
  where control.session_id = p_session_id;

  if p_action = 'end' then
    update public.live_quick_connect_pairings pairing
    set state = 'cancelled',
        completed_at = v_now,
        shared_outcome = coalesce(pairing.shared_outcome, 'closed'),
        version = pairing.version + 1
    where pairing.session_id = p_session_id
      and pairing.state in ('active', 'reconnect_grace');

    update public.live_quick_connect_rounds round_row
    set state = 'cancelled',
        completed_at = v_now,
        version = round_row.version + 1
    where round_row.session_id = p_session_id
      and round_row.state in ('open', 'active');

    update public.live_quick_connect_participants participant
    set state = 'left',
        connection_state = 'left_session',
        reconnect_deadline = null,
        current_pairing_id = null
    where participant.session_id = p_session_id
      and participant.state not in ('left', 'unavailable');
  else
    perform public.live_quick_connect_sync(p_session_id);
  end if;

  return public.live_quick_connect_host_snapshot(p_session_id, v_user_id);
end;
$$;

revoke all on function public.rpc_control_live_quick_connect(uuid, text)
from public, anon;
grant execute on function public.rpc_control_live_quick_connect(uuid, text)
to authenticated;

-- Keep the mature admission implementation as a private implementation detail
-- and place host-control policy in a small public wrapper.
alter function public.rpc_join_live_quick_connect(uuid)
rename to rpc_join_live_quick_connect_uncontrolled;

revoke all on function public.rpc_join_live_quick_connect_uncontrolled(uuid)
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
  v_existing public.live_quick_connect_participants;
begin
  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  select session.* into v_session
  from public.live_sessions session
  where session.id = p_session_id;

  if v_session.id is null or v_session.format <> 'quick_connect' then
    raise exception 'live_quick_connect_session_invalid' using errcode = '23514';
  end if;

  select control.* into v_control
  from public.live_quick_connect_controls control
  where control.session_id = p_session_id;

  if v_control.session_id is null then
    raise exception 'live_quick_connect_control_missing' using errcode = 'P0002';
  end if;

  if v_session.created_by_user_id = v_user_id
     and v_control.creator_mode = 'facilitator' then
    raise exception 'live_quick_connect_host_facilitator' using errcode = '42501';
  end if;

  select participant.* into v_existing
  from public.live_quick_connect_participants participant
  where participant.session_id = p_session_id
    and participant.user_id = v_user_id;

  if v_control.state <> 'open'
     and coalesce(v_existing.state, 'left') not in ('waiting', 'paired', 'disconnected') then
    raise exception 'live_quick_connect_not_open' using errcode = '55000';
  end if;

  return public.rpc_join_live_quick_connect_uncontrolled(p_session_id);
end;
$$;

revoke all on function public.rpc_join_live_quick_connect(uuid)
from public, anon;
grant execute on function public.rpc_join_live_quick_connect(uuid)
to authenticated;

comment on table public.live_quick_connect_controls is
  'Server-authoritative Quick Connect host policy and rotation configuration.';
comment on function public.rpc_control_live_quick_connect(uuid, text) is
  'Owner-only state transitions for opening, pausing, draining, closing or ending Quick Connect.';

commit;
