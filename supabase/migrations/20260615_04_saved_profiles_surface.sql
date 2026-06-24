create or replace function public.rpc_get_my_saved_profiles()
returns table (
  profile_id uuid,
  saved_at timestamptz,
  full_name text,
  age integer,
  avatar_url text,
  city text,
  region text,
  current_country text,
  current_country_code text,
  premium_plan text,
  is_new_here boolean
)
language plpgsql
security definer
stable
set search_path = public, pg_catalog
as $$
declare
  v_viewer_profile_id uuid;
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select profile.id
    into v_viewer_profile_id
  from public.profiles profile
  where profile.user_id = auth.uid()
    and profile.deleted_at is null
  limit 1;

  if v_viewer_profile_id is null then
    raise exception 'profile required' using errcode = '42501';
  end if;

  return query
  select
    target.id as profile_id,
    save_row.created_at as saved_at,
    target.full_name,
    target.age,
    target.avatar_url,
    target.city,
    target.region,
    target.current_country,
    target.current_country_code,
    public.get_active_subscription_plan(target.user_id)::text as premium_plan,
    target.created_at > timezone('utc'::text, now()) - interval '14 days' as is_new_here
  from public.profile_saves save_row
  join public.profiles target
    on target.id = save_row.target_profile_id
  where save_row.viewer_profile_id = v_viewer_profile_id
    and target.deleted_at is null
  order by save_row.created_at desc;
end;
$$;

revoke all on function public.rpc_get_my_saved_profiles() from public;
grant execute on function public.rpc_get_my_saved_profiles() to authenticated;
