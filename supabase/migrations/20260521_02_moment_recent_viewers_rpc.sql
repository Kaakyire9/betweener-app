create index if not exists idx_moment_views_moment_viewed_at
  on public.moment_views (moment_id, viewed_at desc);

create or replace function public.rpc_get_my_moment_recent_viewers(
  p_moment_id uuid,
  p_limit integer default 40
)
returns table (
  viewer_user_id uuid,
  viewed_at timestamptz,
  profile_id uuid,
  full_name text,
  avatar_url text
)
language sql
security definer
set search_path = public, pg_catalog
as $$
  select
    mv.viewer_user_id,
    mv.viewed_at,
    pr.id as profile_id,
    pr.full_name,
    pr.avatar_url
  from public.moment_views mv
  join public.moments m
    on m.id = mv.moment_id
  left join public.profiles pr
    on pr.user_id = mv.viewer_user_id
  where mv.moment_id = p_moment_id
    and m.user_id = auth.uid()
  order by mv.viewed_at desc
  limit greatest(1, least(coalesce(p_limit, 40), 100));
$$;

revoke all on function public.rpc_get_my_moment_recent_viewers(uuid, integer) from public;
grant execute on function public.rpc_get_my_moment_recent_viewers(uuid, integer) to authenticated;
