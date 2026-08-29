-- Publish bounded, content-free participant arrival signals for Room Pulse.
-- Raw live_participants updates cannot reliably identify a rejoin because
-- Realtime UPDATE payloads do not guarantee the previous state is present.

begin;

create table if not exists public.live_participant_arrival_updates (
  session_id uuid not null references public.live_sessions(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  version bigint not null default 1,
  arrived_at timestamptz not null default timezone('utc', now()),
  primary key (session_id, profile_id),
  constraint live_participant_arrival_updates_version_positive check (version > 0)
);

comment on table public.live_participant_arrival_updates is
  'Bounded Realtime arrival signals used to announce members entering a Live room.';

alter table public.live_participant_arrival_updates enable row level security;
alter table public.live_participant_arrival_updates force row level security;

drop policy if exists live_participant_arrival_updates_select_scoped
  on public.live_participant_arrival_updates;
create policy live_participant_arrival_updates_select_scoped
on public.live_participant_arrival_updates
for select
to authenticated
using (public.can_view_live_session(session_id, auth.uid()));

revoke all on table public.live_participant_arrival_updates
from public, anon, authenticated;
grant select on table public.live_participant_arrival_updates to authenticated;
grant all on table public.live_participant_arrival_updates to service_role;

create or replace function public.bump_live_participant_arrival_update()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
begin
  if new.state not in ('audience', 'stage_requested', 'backstage', 'on_stage') then
    return new;
  end if;

  if tg_op = 'UPDATE'
     and old.state in ('audience', 'stage_requested', 'backstage', 'on_stage') then
    return new;
  end if;

  insert into public.live_participant_arrival_updates as current_update (
    session_id,
    profile_id,
    version,
    arrived_at
  ) values (
    new.session_id,
    new.profile_id,
    1,
    timezone('utc', now())
  )
  on conflict (session_id, profile_id) do update
  set
    version = current_update.version + 1,
    arrived_at = excluded.arrived_at;

  return new;
end;
$$;

revoke all on function public.bump_live_participant_arrival_update()
from public, anon, authenticated;
grant execute on function public.bump_live_participant_arrival_update() to service_role;

drop trigger if exists live_participants_insert_arrival_update
  on public.live_participants;
create trigger live_participants_insert_arrival_update
after insert on public.live_participants
for each row
execute function public.bump_live_participant_arrival_update();

drop trigger if exists live_participants_state_arrival_update
  on public.live_participants;
create trigger live_participants_state_arrival_update
after update of state on public.live_participants
for each row
when (old.state is distinct from new.state)
execute function public.bump_live_participant_arrival_update();

do $$
begin
  if exists (
    select 1 from pg_publication where pubname = 'supabase_realtime'
  ) and not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'live_participant_arrival_updates'
  ) then
    alter publication supabase_realtime
      add table public.live_participant_arrival_updates;
  end if;
end;
$$;

commit;
