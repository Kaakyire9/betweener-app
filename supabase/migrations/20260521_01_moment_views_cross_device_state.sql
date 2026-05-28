create table if not exists public.moment_views (
  id uuid primary key default gen_random_uuid(),
  moment_id uuid not null references public.moments(id) on delete cascade,
  viewer_user_id uuid not null references auth.users(id) on delete cascade,
  viewed_at timestamptz not null default now(),
  constraint moment_views_unique unique (moment_id, viewer_user_id)
);

create index if not exists idx_moment_views_moment_id
  on public.moment_views (moment_id);

create index if not exists idx_moment_views_viewer_user_id
  on public.moment_views (viewer_user_id);

alter table public.moment_views enable row level security;

drop policy if exists "Moment views viewer select own" on public.moment_views;
create policy "Moment views viewer select own" on public.moment_views
for select using (viewer_user_id = auth.uid());

create or replace function public.rpc_mark_moment_view(
  p_moment_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_viewer_id uuid := auth.uid();
  v_owner_id uuid;
  v_now timestamptz := now();
begin
  if v_viewer_id is null or p_moment_id is null then
    return false;
  end if;

  select m.user_id
  into v_owner_id
  from public.moments m
  where m.id = p_moment_id
    and m.is_deleted = false
    and m.expires_at > now()
  limit 1;

  if v_owner_id is null or v_owner_id = v_viewer_id then
    return false;
  end if;

  if not public.can_view_moment(p_moment_id) then
    return false;
  end if;

  insert into public.moment_views (moment_id, viewer_user_id, viewed_at)
  values (p_moment_id, v_viewer_id, v_now)
  on conflict (moment_id, viewer_user_id)
  do update
    set viewed_at = greatest(public.moment_views.viewed_at, excluded.viewed_at);

  return true;
end;
$$;

revoke all on function public.rpc_mark_moment_view(uuid) from public;
grant execute on function public.rpc_mark_moment_view(uuid) to authenticated;

create or replace function public.rpc_get_viewed_moment_ids(
  p_moment_ids uuid[]
)
returns table (
  moment_id uuid
)
language sql
security definer
set search_path = public, pg_catalog
as $$
  select mv.moment_id
  from public.moment_views mv
  where mv.viewer_user_id = auth.uid()
    and (
      p_moment_ids is null
      or cardinality(p_moment_ids) = 0
      or mv.moment_id = any(p_moment_ids)
    );
$$;

revoke all on function public.rpc_get_viewed_moment_ids(uuid[]) from public;
grant execute on function public.rpc_get_viewed_moment_ids(uuid[]) to authenticated;

create or replace function public.rpc_get_my_moment_view_stats(
  p_moment_ids uuid[] default null
)
returns table (
  moment_id uuid,
  unique_viewers integer
)
language sql
security definer
set search_path = public, pg_catalog
as $$
  select
    m.id as moment_id,
    count(mv.viewer_user_id)::integer as unique_viewers
  from public.moments m
  left join public.moment_views mv
    on mv.moment_id = m.id
  where m.user_id = auth.uid()
    and (
      p_moment_ids is null
      or cardinality(p_moment_ids) = 0
      or m.id = any(p_moment_ids)
    )
  group by m.id;
$$;

revoke all on function public.rpc_get_my_moment_view_stats(uuid[]) from public;
grant execute on function public.rpc_get_my_moment_view_stats(uuid[]) to authenticated;
