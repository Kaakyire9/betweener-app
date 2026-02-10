-- Circles v1 schema + RLS + RPCs

create table if not exists public.circles (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text null,
  visibility text not null default 'public' check (visibility in ('public','private')),
  category text null,
  created_by_profile_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists circles_visibility_idx on public.circles (visibility);
create index if not exists circles_created_by_idx on public.circles (created_by_profile_id);

create table if not exists public.circle_members (
  id uuid primary key default gen_random_uuid(),
  circle_id uuid not null references public.circles(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('leader','matchmaker','member')),
  status text not null default 'active' check (status in ('active','pending','invited')),
  is_visible boolean not null default true,
  created_at timestamptz not null default now(),
  constraint circle_members_unique unique (circle_id, profile_id)
);

create index if not exists circle_members_circle_id_idx on public.circle_members (circle_id);
create index if not exists circle_members_profile_id_idx on public.circle_members (profile_id);
create index if not exists circle_members_status_idx on public.circle_members (status);

-- updated_at trigger for circles
create or replace function public.set_circles_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists circles_set_updated_at on public.circles;
create trigger circles_set_updated_at
before update on public.circles
for each row execute function public.set_circles_updated_at();

-- RLS
alter table public.circles enable row level security;
alter table public.circle_members enable row level security;

-- Circles select: public circles or member
drop policy if exists "circles_select_public_or_member" on public.circles;
create policy "circles_select_public_or_member"
on public.circles
for select
to authenticated
using (
  visibility = 'public'
  or exists (
    select 1
    from public.circle_members cm
    join public.profiles p on p.id = cm.profile_id
    where cm.circle_id = circles.id
      and cm.status = 'active'
      and p.user_id = auth.uid()
  )
);

-- Circles insert/update/delete: owner (via profile ownership)
drop policy if exists "circles_insert_owner" on public.circles;
create policy "circles_insert_owner"
on public.circles
for insert
to authenticated
with check (
  exists (
    select 1 from public.profiles p
    where p.id = circles.created_by_profile_id
      and p.user_id = auth.uid()
  )
);

drop policy if exists "circles_update_owner" on public.circles;
create policy "circles_update_owner"
on public.circles
for update
to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = circles.created_by_profile_id
      and p.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.profiles p
    where p.id = circles.created_by_profile_id
      and p.user_id = auth.uid()
  )
);

drop policy if exists "circles_delete_owner" on public.circles;
create policy "circles_delete_owner"
on public.circles
for delete
to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = circles.created_by_profile_id
      and p.user_id = auth.uid()
  )
);

-- Circle members select: active members only
drop policy if exists "circle_members_select_member" on public.circle_members;
create policy "circle_members_select_member"
on public.circle_members
for select
to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = circle_members.profile_id
      and p.user_id = auth.uid()
  )
  or exists (
    select 1
    from public.circle_members cm
    join public.profiles p on p.id = cm.profile_id
    where cm.circle_id = circle_members.circle_id
      and cm.status = 'active'
      and p.user_id = auth.uid()
  )
);

-- Circle members insert/update/delete: via RPCs (owner checks)
drop policy if exists "circle_members_insert_owner" on public.circle_members;
create policy "circle_members_insert_owner"
on public.circle_members
for insert
to authenticated
with check (
  exists (
    select 1 from public.profiles p
    where p.id = circle_members.profile_id
      and p.user_id = auth.uid()
  )
);

drop policy if exists "circle_members_update_owner" on public.circle_members;
create policy "circle_members_update_owner"
on public.circle_members
for update
to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = circle_members.profile_id
      and p.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.profiles p
    where p.id = circle_members.profile_id
      and p.user_id = auth.uid()
  )
);

drop policy if exists "circle_members_delete_owner" on public.circle_members;
create policy "circle_members_delete_owner"
on public.circle_members
for delete
to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = circle_members.profile_id
      and p.user_id = auth.uid()
  )
);

-- RPCs
create or replace function public.rpc_create_circle(
  p_profile_id uuid,
  p_name text,
  p_description text,
  p_visibility text default 'public',
  p_category text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_circle_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select user_id into v_owner
  from public.profiles
  where id = p_profile_id
  limit 1;

  if v_owner is null or v_owner <> auth.uid() then
    raise exception 'Not authorized';
  end if;

  insert into public.circles (name, description, visibility, category, created_by_profile_id)
  values (p_name, p_description, coalesce(p_visibility, 'public'), p_category, p_profile_id)
  returning id into v_circle_id;

  insert into public.circle_members (circle_id, profile_id, role, status, is_visible)
  values (v_circle_id, p_profile_id, 'leader', 'active', true)
  on conflict (circle_id, profile_id) do nothing;

  return v_circle_id;
end;
$$;

create or replace function public.rpc_join_circle(
  p_circle_id uuid,
  p_profile_id uuid
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_visibility text;
  v_status text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select user_id into v_owner
  from public.profiles
  where id = p_profile_id
  limit 1;

  if v_owner is null or v_owner <> auth.uid() then
    raise exception 'Not authorized';
  end if;

  select visibility into v_visibility
  from public.circles
  where id = p_circle_id
  limit 1;

  if v_visibility is null then
    raise exception 'Circle not found';
  end if;

  v_status := case when v_visibility = 'public' then 'active' else 'pending' end;

  insert into public.circle_members (circle_id, profile_id, role, status, is_visible)
  values (p_circle_id, p_profile_id, 'member', v_status, true)
  on conflict (circle_id, profile_id) do update
    set status = excluded.status;

  return v_status;
end;
$$;

create or replace function public.rpc_leave_circle(
  p_circle_id uuid,
  p_profile_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_role text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select user_id into v_owner
  from public.profiles
  where id = p_profile_id
  limit 1;

  if v_owner is null or v_owner <> auth.uid() then
    raise exception 'Not authorized';
  end if;

  select role into v_role
  from public.circle_members
  where circle_id = p_circle_id and profile_id = p_profile_id
  limit 1;

  if v_role = 'leader' then
    raise exception 'Leader cannot leave circle';
  end if;

  delete from public.circle_members
  where circle_id = p_circle_id and profile_id = p_profile_id;

  return true;
end;
$$;

create or replace function public.rpc_approve_circle_member(
  p_circle_id uuid,
  p_member_id uuid,
  p_profile_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_is_leader boolean;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select user_id into v_owner
  from public.profiles
  where id = p_profile_id
  limit 1;

  if v_owner is null or v_owner <> auth.uid() then
    raise exception 'Not authorized';
  end if;

  select exists (
    select 1 from public.circle_members
    where circle_id = p_circle_id
      and profile_id = p_profile_id
      and role = 'leader'
      and status = 'active'
  ) into v_is_leader;

  if not v_is_leader then
    raise exception 'Only leader can approve';
  end if;

  update public.circle_members
  set status = 'active'
  where circle_id = p_circle_id
    and profile_id = p_member_id
    and status = 'pending';

  return true;
end;
$$;

grant execute on function public.rpc_create_circle(uuid, text, text, text, text) to authenticated;
grant execute on function public.rpc_join_circle(uuid, uuid) to authenticated;
grant execute on function public.rpc_leave_circle(uuid, uuid) to authenticated;
grant execute on function public.rpc_approve_circle_member(uuid, uuid, uuid) to authenticated;
