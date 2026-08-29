-- Publish content-free Live session invalidations instead of raw session rows.
-- Guests receive a Realtime pulse, then retrieve the capability-filtered
-- canonical snapshot through RPC. This keeps stage intake immediate without
-- weakening the server-owned live_sessions boundary.

begin;

create table if not exists public.live_session_structure_updates (
  session_id uuid primary key references public.live_sessions(id) on delete cascade,
  version bigint not null default 1,
  reason text not null default 'session_structure',
  updated_at timestamptz not null default timezone('utc', now()),
  constraint live_session_structure_updates_version_positive check (version > 0),
  constraint live_session_structure_updates_reason_valid check (
    reason in ('session_structure', 'stage_intake')
  )
);

comment on table public.live_session_structure_updates is
  'Content-free Realtime invalidations for capability-filtered Live session snapshots.';

alter table public.live_session_structure_updates enable row level security;
alter table public.live_session_structure_updates force row level security;

drop policy if exists live_session_structure_updates_select_scoped
  on public.live_session_structure_updates;
create policy live_session_structure_updates_select_scoped
on public.live_session_structure_updates
for select
to authenticated
using (public.can_view_live_session(session_id, auth.uid()));

revoke all on table public.live_session_structure_updates
from public, anon, authenticated;
grant select on table public.live_session_structure_updates to authenticated;
grant all on table public.live_session_structure_updates to service_role;

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
     and new.stage_requests_open is distinct from old.stage_requests_open then
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

revoke all on function public.bump_live_session_structure_update()
from public, anon, authenticated;
grant execute on function public.bump_live_session_structure_update() to service_role;

drop trigger if exists live_sessions_insert_structure_update on public.live_sessions;
create trigger live_sessions_insert_structure_update
after insert on public.live_sessions
for each row
execute function public.bump_live_session_structure_update();

drop trigger if exists live_sessions_update_structure_update on public.live_sessions;
create trigger live_sessions_update_structure_update
after update of status, stage_requests_open, version on public.live_sessions
for each row
when (
  old.status is distinct from new.status
  or old.stage_requests_open is distinct from new.stage_requests_open
  or old.version is distinct from new.version
)
execute function public.bump_live_session_structure_update();

insert into public.live_session_structure_updates (
  session_id,
  version,
  reason,
  updated_at
)
select
  session.id,
  greatest(session.version, 1),
  'session_structure',
  timezone('utc', now())
from public.live_sessions session
on conflict (session_id) do nothing;

do $$
begin
  if exists (
    select 1 from pg_publication where pubname = 'supabase_realtime'
  ) and not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'live_session_structure_updates'
  ) then
    alter publication supabase_realtime
      add table public.live_session_structure_updates;
  end if;

  if exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'live_sessions'
  ) then
    alter publication supabase_realtime drop table public.live_sessions;
  end if;
end;
$$;

commit;
