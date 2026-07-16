-- Keep raw device coordinates server-side while preserving the existing
-- profiles latitude/longitude contract as a coarse discovery centroid.

create table if not exists public.profile_private_locations (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  user_id uuid not null,
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  accuracy_meters double precision,
  captured_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.profile_private_locations enable row level security;
revoke all on table public.profile_private_locations from public, anon, authenticated;

comment on table public.profile_private_locations is
  'Server-only raw device coordinates. Client-facing profile coordinates are coarse centroids.';

create or replace function public.protect_profile_precise_coordinates()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  if new.location_precision::text = 'EXACT'
     and new.latitude is not null
     and new.longitude is not null
     and (
       tg_op = 'INSERT'
       or old.location_precision::text is distinct from 'EXACT'
       or new.latitude is distinct from old.latitude
       or new.longitude is distinct from old.longitude
     ) then
    insert into public.profile_private_locations (
      profile_id,
      user_id,
      latitude,
      longitude,
      captured_at,
      updated_at
    ) values (
      new.id,
      new.user_id,
      new.latitude,
      new.longitude,
      timezone('utc', now()),
      timezone('utc', now())
    )
    on conflict (profile_id) do update
      set user_id = excluded.user_id,
          latitude = excluded.latitude,
          longitude = excluded.longitude,
          captured_at = excluded.captured_at,
          updated_at = excluded.updated_at;

    -- Roughly one-kilometre cells: useful for nearby discovery, unsuitable as
    -- an exact device/home coordinate.
    new.latitude := round(new.latitude::numeric, 2)::double precision;
    new.longitude := round(new.longitude::numeric, 2)::double precision;
  elsif new.location_precision::text <> 'EXACT' then
    delete from public.profile_private_locations where profile_id = new.id;
  end if;

  return new;
end;
$$;

revoke all on function public.protect_profile_precise_coordinates() from public, anon, authenticated;

-- Protect existing exact records before reducing their public precision.
insert into public.profile_private_locations (
  profile_id,
  user_id,
  latitude,
  longitude,
  captured_at,
  updated_at
)
select
  profile.id,
  profile.user_id,
  profile.latitude,
  profile.longitude,
  coalesce(profile.location_updated_at, profile.updated_at, timezone('utc', now())),
  timezone('utc', now())
from public.profiles profile
where profile.location_precision::text = 'EXACT'
  and profile.latitude is not null
  and profile.longitude is not null
on conflict (profile_id) do nothing;

update public.profiles
set latitude = round(latitude::numeric, 2)::double precision,
    longitude = round(longitude::numeric, 2)::double precision
where location_precision::text = 'EXACT'
  and latitude is not null
  and longitude is not null;

drop trigger if exists protect_profile_precise_coordinates on public.profiles;
create trigger protect_profile_precise_coordinates
before insert or update of latitude, longitude, location_precision on public.profiles
for each row execute function public.protect_profile_precise_coordinates();

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
  from public.profiles profile
  where profile.user_id = auth.uid()
    and profile.deleted_at is null
  limit 1;

  if v_profile_id is null then
    raise exception 'Profile not found' using errcode = 'P0002';
  end if;

  update public.profiles
  set latitude = p_latitude,
      longitude = p_longitude,
      location_precision = 'EXACT',
      location_updated_at = timezone('utc', now())
  where id = v_profile_id;

  update public.profile_private_locations
  set accuracy_meters = case
        when p_accuracy_meters is not null and p_accuracy_meters >= 0 then p_accuracy_meters
        else accuracy_meters
      end,
      updated_at = timezone('utc', now())
  where profile_id = v_profile_id;

  return query
  select profile.id, profile.latitude, profile.longitude, profile.location_precision::text
  from public.profiles profile
  where profile.id = v_profile_id;
end;
$$;

revoke all on function public.set_my_precise_location(double precision, double precision, double precision) from public;
grant execute on function public.set_my_precise_location(double precision, double precision, double precision) to authenticated;

-- Preserve the established V3 response contract for deployed clients while
-- preventing candidate coordinates from crossing the API boundary.
do $$
begin
  if to_regprocedure('public.get_vibes_recommendations_v3(uuid,text,integer,integer)') is not null
     and to_regprocedure('public.get_vibes_recommendations_v3_private(uuid,text,integer,integer)') is null then
    execute 'alter function public.get_vibes_recommendations_v3(uuid, text, integer, integer) rename to get_vibes_recommendations_v3_private';
  end if;
end;
$$;

create or replace function public.get_vibes_recommendations_v3(
  p_user_id uuid,
  p_segment text default 'for_you',
  p_limit integer default 30,
  p_active_window_minutes integer default 30
)
returns table (
  id uuid,
  user_id uuid,
  full_name text,
  age integer,
  bio text,
  avatar_url text,
  profile_video text,
  location text,
  latitude double precision,
  longitude double precision,
  region text,
  tribe text,
  religion text,
  personality_type text,
  is_active boolean,
  online boolean,
  last_active timestamptz,
  verified boolean,
  verification_level integer,
  ai_score numeric,
  distance_km double precision,
  city text,
  current_country text,
  current_country_code text,
  location_precision text,
  recommendation_reasons jsonb
)
language sql
security definer
set search_path = public, pg_catalog
as $$
  select
    recommendation.id,
    recommendation.user_id,
    recommendation.full_name,
    recommendation.age,
    recommendation.bio,
    recommendation.avatar_url,
    recommendation.profile_video,
    recommendation.location,
    null::double precision as latitude,
    null::double precision as longitude,
    recommendation.region,
    recommendation.tribe,
    recommendation.religion,
    recommendation.personality_type,
    recommendation.is_active,
    recommendation.online,
    recommendation.last_active,
    recommendation.verified,
    recommendation.verification_level,
    recommendation.ai_score,
    recommendation.distance_km,
    recommendation.city,
    recommendation.current_country,
    recommendation.current_country_code,
    recommendation.location_precision,
    recommendation.recommendation_reasons
  from public.get_vibes_recommendations_v3_private(
    p_user_id,
    p_segment,
    p_limit,
    p_active_window_minutes
  ) recommendation;
$$;

revoke all on function public.get_vibes_recommendations_v3_private(uuid, text, integer, integer) from public, anon, authenticated;
revoke all on function public.get_vibes_recommendations_v3(uuid, text, integer, integer) from public;
grant execute on function public.get_vibes_recommendations_v3(uuid, text, integer, integer) to authenticated;
