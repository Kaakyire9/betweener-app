create table if not exists public.user_presence (
  user_id uuid primary key references auth.users(id) on delete cascade,
  online boolean not null default false,
  last_active timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_user_presence_online_last_active
  on public.user_presence (online, last_active desc);

create index if not exists idx_user_presence_last_active
  on public.user_presence (last_active desc);

alter table public.user_presence enable row level security;

drop policy if exists "user_presence_select_authenticated" on public.user_presence;
create policy "user_presence_select_authenticated"
on public.user_presence
for select
to authenticated
using (true);

create or replace function public.sync_profiles_presence_from_user_presence()
returns trigger
language plpgsql
set search_path = public, pg_catalog
as $$
begin
  update public.profiles
  set online = new.online,
      last_active = new.last_active
  where user_id = new.user_id;

  return new;
end;
$$;

drop trigger if exists user_presence_sync_profiles_after_write on public.user_presence;

create trigger user_presence_sync_profiles_after_write
after insert or update on public.user_presence
for each row
execute function public.sync_profiles_presence_from_user_presence();

drop function if exists public.rpc_set_user_presence(boolean);

create or replace function public.rpc_set_user_presence(
  p_online boolean
)
returns integer
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_user_id uuid := auth.uid();
  v_now timestamptz := now();
begin
  if v_user_id is null then
    raise exception 'unauthenticated';
  end if;

  insert into public.user_presence (
    user_id,
    online,
    last_active,
    updated_at
  )
  values (
    v_user_id,
    coalesce(p_online, false),
    v_now,
    v_now
  )
  on conflict (user_id) do update
  set online = excluded.online,
      last_active = greatest(public.user_presence.last_active, excluded.last_active),
      updated_at = excluded.updated_at;

  return 1;
end;
$$;

grant execute on function public.rpc_set_user_presence(boolean) to authenticated;

alter table public.user_presence replica identity full;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      alter publication supabase_realtime add table public.user_presence;
    exception when duplicate_object then null;
    end;
  end if;
end;
$$;
