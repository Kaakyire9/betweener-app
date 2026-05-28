drop function if exists public.rpc_get_my_moment_recent_viewers(uuid, integer);

create or replace function public.rpc_get_my_moment_recent_viewers(
  p_moment_id uuid,
  p_limit integer default 40
)
returns table (
  viewer_user_id uuid,
  viewed_at timestamptz,
  profile_id uuid,
  full_name text,
  avatar_url text,
  current_country_code text,
  is_match boolean,
  viewed_moment_count integer,
  is_repeat_viewer boolean
)
language sql
security definer
set search_path = public, pg_catalog
as $$
  with owner_moments as (
    select id
    from public.moments
    where user_id = auth.uid()
  ),
  viewer_totals as (
    select
      mv.viewer_user_id,
      count(*)::integer as viewed_moment_count
    from public.moment_views mv
    join owner_moments om
      on om.id = mv.moment_id
    group by mv.viewer_user_id
  )
  select
    mv.viewer_user_id,
    mv.viewed_at,
    pr.id as profile_id,
    pr.full_name,
    pr.avatar_url,
    pr.current_country_code,
    public.is_match(auth.uid(), mv.viewer_user_id) as is_match,
    coalesce(vt.viewed_moment_count, 0) as viewed_moment_count,
    coalesce(vt.viewed_moment_count, 0) > 1 as is_repeat_viewer
  from public.moment_views mv
  join public.moments m
    on m.id = mv.moment_id
  left join public.profiles pr
    on pr.user_id = mv.viewer_user_id
  left join viewer_totals vt
    on vt.viewer_user_id = mv.viewer_user_id
  where mv.moment_id = p_moment_id
    and m.user_id = auth.uid()
  order by mv.viewed_at desc
  limit greatest(1, least(coalesce(p_limit, 40), 100));
$$;

revoke all on function public.rpc_get_my_moment_recent_viewers(uuid, integer) from public;
grant execute on function public.rpc_get_my_moment_recent_viewers(uuid, integer) to authenticated;

create or replace function public.rpc_get_my_moment_viewer_segments(
  p_days integer default 30
)
returns table (
  total_viewers integer,
  matched_viewers integer,
  non_match_viewers integer,
  ghana_viewers integer,
  abroad_viewers integer,
  repeat_viewers integer,
  first_time_viewers integer
)
language sql
security definer
set search_path = public, pg_catalog
as $$
  with owner_moments as (
    select id
    from public.moments
    where user_id = auth.uid()
  ),
  scoped as (
    select
      mv.viewer_user_id,
      max(mv.viewed_at) as last_viewed_at,
      count(*)::integer as viewed_moment_count
    from public.moment_views mv
    join owner_moments om
      on om.id = mv.moment_id
    where mv.viewed_at >= now() - (greatest(3, least(coalesce(p_days, 30), 120)) || ' days')::interval
    group by mv.viewer_user_id
  )
  select
    count(*)::integer as total_viewers,
    count(*) filter (where public.is_match(auth.uid(), scoped.viewer_user_id))::integer as matched_viewers,
    count(*) filter (where not public.is_match(auth.uid(), scoped.viewer_user_id))::integer as non_match_viewers,
    count(*) filter (where coalesce(pr.current_country_code, '') = 'GH')::integer as ghana_viewers,
    count(*) filter (where coalesce(pr.current_country_code, '') <> '' and coalesce(pr.current_country_code, '') <> 'GH')::integer as abroad_viewers,
    count(*) filter (where scoped.viewed_moment_count > 1)::integer as repeat_viewers,
    count(*) filter (where scoped.viewed_moment_count <= 1)::integer as first_time_viewers
  from scoped
  left join public.profiles pr
    on pr.user_id = scoped.viewer_user_id;
$$;

revoke all on function public.rpc_get_my_moment_viewer_segments(integer) from public;
grant execute on function public.rpc_get_my_moment_viewer_segments(integer) to authenticated;
