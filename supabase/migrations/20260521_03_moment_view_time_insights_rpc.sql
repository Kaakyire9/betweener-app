create or replace function public.rpc_get_my_moment_view_time_insights(
  p_days integer default 21,
  p_utc_offset_minutes integer default 0
)
returns table (
  local_hour integer,
  weekday_bucket integer,
  view_count integer
)
language sql
security definer
set search_path = public, pg_catalog
as $$
  with scoped_views as (
    select
      mv.viewed_at
      + make_interval(mins => greatest(-720, least(coalesce(p_utc_offset_minutes, 0), 840))) as local_viewed_at
    from public.moment_views mv
    join public.moments m
      on m.id = mv.moment_id
    where m.user_id = auth.uid()
      and mv.viewed_at >= now() - (greatest(3, least(coalesce(p_days, 21), 90)) || ' days')::interval
  )
  select
    extract(hour from local_viewed_at)::integer as local_hour,
    extract(dow from local_viewed_at)::integer as weekday_bucket,
    count(*)::integer as view_count
  from scoped_views
  group by 1, 2
  order by view_count desc, weekday_bucket asc, local_hour asc;
$$;

revoke all on function public.rpc_get_my_moment_view_time_insights(integer, integer) from public;
grant execute on function public.rpc_get_my_moment_view_time_insights(integer, integer) to authenticated;
