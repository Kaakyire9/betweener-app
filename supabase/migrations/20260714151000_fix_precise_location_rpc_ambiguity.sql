-- Qualify profile_private_locations columns inside the precise-location RPC.
-- The function returns a column named profile_id, which is also a PL/pgSQL
-- output variable; an unqualified table column therefore raises SQLSTATE 42702.

create or replace function public.set_my_precise_location(
  p_latitude double precision,
  p_longitude double precision,
  p_accuracy_meters double precision default null
)
returns table (
  profile_id uuid,
  latitude double precision,
  longitude double precision,
  location_precision text
)
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_profile_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if p_latitude is null or p_latitude not between -90 and 90
     or p_longitude is null or p_longitude not between -180 and 180 then
    raise exception 'Invalid coordinates' using errcode = '22023';
  end if;

  select profile.id into v_profile_id
  from public.profiles as profile
  where profile.user_id = auth.uid()
    and profile.deleted_at is null
  limit 1;

  if v_profile_id is null then
    raise exception 'Profile not found' using errcode = 'P0002';
  end if;

  update public.profiles as profile
  set latitude = p_latitude,
      longitude = p_longitude,
      location_precision = 'EXACT',
      location_updated_at = timezone('utc', now())
  where profile.id = v_profile_id;

  update public.profile_private_locations as private_location
  set accuracy_meters = case
        when p_accuracy_meters is not null and p_accuracy_meters >= 0 then p_accuracy_meters
        else private_location.accuracy_meters
      end,
      updated_at = timezone('utc', now())
  where private_location.profile_id = v_profile_id;

  return query
  select
    profile.id,
    profile.latitude,
    profile.longitude,
    profile.location_precision::text
  from public.profiles as profile
  where profile.id = v_profile_id;
end;
$$;

revoke all on function public.set_my_precise_location(double precision, double precision, double precision) from public;
grant execute on function public.set_my_precise_location(double precision, double precision, double precision) to authenticated;
