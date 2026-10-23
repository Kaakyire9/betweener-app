-- Keep the primary Host participant coherent when legacy Session Host
-- delegation changes ownership after the room has already entered backstage.

begin;

create or replace function public.live_reconcile_primary_host_participant_v1(
  p_session_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  v_session public.live_sessions;
  v_host public.live_participants;
  v_replacement_slot integer;
begin
  select * into v_session
  from public.live_sessions session
  where session.id = p_session_id;

  if v_session.id is null
    or v_session.status not in ('backstage', 'live', 'ending') then
    return;
  end if;

  select * into v_host
  from public.live_participants participant
  where participant.session_id = p_session_id
    and participant.user_id = v_session.created_by_user_id
    and participant.role = 'host'
  for update;

  if v_host.id is null or v_host.state in ('removed', 'banned') then
    return;
  end if;

  if exists (
    select 1
    from public.live_participants participant
    where participant.session_id = p_session_id
      and participant.user_id <> v_host.user_id
      and participant.stage_slot = 1
  ) then
    select slot into v_replacement_slot
    from generate_series(2, v_session.maximum_publishers) as slots(slot)
    where not exists (
      select 1
      from public.live_participants occupied
      where occupied.session_id = p_session_id
        and occupied.stage_slot = slots.slot
    )
    order by slot
    limit 1;

    if v_replacement_slot is null then
      update public.live_participants
      set state = 'audience',
          stage_slot = null,
          stage_left_at = timezone('utc', now())
      where session_id = p_session_id
        and user_id <> v_host.user_id
        and stage_slot = 1
        and state not in ('removed', 'banned');
    else
      update public.live_participants
      set stage_slot = v_replacement_slot
      where session_id = p_session_id
        and user_id <> v_host.user_id
        and stage_slot = 1;
    end if;
  end if;

  -- Follow only transitions accepted by enforce_live_participant_transition().
  update public.live_participants
  set state = 'confirmed'
  where id = v_host.id and state = 'left';

  if v_session.status = 'backstage' then
    update public.live_participants
    set state = 'audience'
    where id = v_host.id and state = 'private_spark';

    update public.live_participants
    set state = 'stage_requested'
    where id = v_host.id and state = 'audience';

    update public.live_participants
    set state = 'backstage',
        stage_slot = 1,
        stage_left_at = null,
        left_at = null,
        last_seen_at = timezone('utc', now())
    where id = v_host.id
      and state in (
        'invited', 'confirmed', 'waitlisted', 'stage_requested',
        'on_stage', 'temporarily_disconnected'
      );
  else
    update public.live_participants
    set state = 'backstage'
    where id = v_host.id
      and state in ('invited', 'confirmed', 'waitlisted');

    update public.live_participants
    set state = 'on_stage',
        stage_slot = 1,
        stage_joined_at = coalesce(stage_joined_at, timezone('utc', now())),
        stage_left_at = null,
        left_at = null,
        last_seen_at = timezone('utc', now())
    where id = v_host.id
      and state in (
        'backstage', 'audience', 'stage_requested', 'private_spark',
        'temporarily_disconnected'
      );
  end if;
end;
$$;

revoke all on function public.live_reconcile_primary_host_participant_v1(uuid)
from public, anon, authenticated, service_role;

create or replace function public.sync_live_host_participant_state()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
begin
  if new.status is distinct from old.status
    and new.status in ('backstage', 'live', 'ending') then
    perform public.live_reconcile_primary_host_participant_v1(new.id);
  end if;
  return new;
end;
$$;

create or replace function public.reconcile_live_host_role_change_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  v_status text;
begin
  if new.role is not distinct from old.role then
    return new;
  end if;

  select session.status into v_status
  from public.live_sessions session
  where session.id = new.session_id;

  if old.role = 'host'
    and new.role <> 'host'
    and v_status in ('backstage', 'live', 'ending')
    and new.state not in ('removed', 'banned') then
    update public.live_participants
    set state = 'audience',
        stage_slot = null,
        stage_left_at = case
          when new.state = 'on_stage' then timezone('utc', now())
          else stage_left_at
        end
    where id = new.id;
  end if;

  perform public.live_reconcile_primary_host_participant_v1(new.session_id);
  return new;
end;
$$;

revoke all on function public.reconcile_live_host_role_change_v1()
from public, anon, authenticated, service_role;

drop trigger if exists live_participants_reconcile_host_role on public.live_participants;
create trigger live_participants_reconcile_host_role
after update of role on public.live_participants
for each row execute function public.reconcile_live_host_role_change_v1();

-- Repair any room stranded by delegation or revocation before this trigger
-- existed, including a confirmed Host in an already-open backstage.
do $$
declare
  v_session_id uuid;
begin
  for v_session_id in
    select session.id
    from public.live_sessions session
    where session.status in ('backstage', 'live', 'ending')
  loop
    perform public.live_reconcile_primary_host_participant_v1(v_session_id);
  end loop;
end;
$$;

comment on function public.live_reconcile_primary_host_participant_v1(uuid) is
  'Internal transition-safe reconciliation for the current primary Host participant.';

commit;
