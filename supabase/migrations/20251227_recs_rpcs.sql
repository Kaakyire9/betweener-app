-- Nearby recommendations: uses user coordinates to compute distance and returns ordered list
create or replace function public.get_recs_nearby(p_user_id uuid, p_limit integer default 20)
returns table (
  id uuid,
  user_id uuid,
  full_name text,
  age integer,
  bio text,
  avatar_url text,
  location text,
  latitude double precision,
  longitude double precision,
  region text,
  tribe text,
  religion text,
  personality_type text,
  is_active boolean,
  last_active timestamp with time zone,
  verified boolean,
  ai_score numeric,
  distance_km double precision
)
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  my_lat double precision;
  my_lon double precision;
begin
  select latitude, longitude into my_lat, my_lon
  from public.profiles
  where id = p_user_id
  limit 1;

  if my_lat is null or my_lon is null then
    -- fallback: return recent active users ordered by region match
    return query
      select p.id, p.user_id, p.full_name, p.age, p.bio, p.avatar_url, p.location,
             p.latitude, p.longitude, p.region, p.tribe, p.religion, p.personality_type,
             p.is_active, p.last_active, p.verified, p.ai_score, null::double precision as distance_km
      from public.profiles p
      where p.id <> p_user_id and p.deleted_at is null and p.is_active = true
      order by (p.region = (select region from public.profiles where id = p_user_id limit 1)) desc,
               p.last_active desc
      limit p_limit;
  end if;

  return query
    select p.id, p.user_id, p.full_name, p.age, p.bio, p.avatar_url, p.location,
           p.latitude, p.longitude, p.region, p.tribe, p.religion, p.personality_type,
           p.is_active, p.last_active, p.verified, p.ai_score,
           (6371 * 2 * asin(sqrt(
              power(sin(radians(p.latitude - my_lat) / 2), 2) +
              cos(radians(my_lat)) * cos(radians(p.latitude)) *
              power(sin(radians(p.longitude - my_lon) / 2), 2)
           ))) as distance_km
    from public.profiles p
    where p.id <> p_user_id and p.deleted_at is null and p.latitude is not null and p.longitude is not null
    order by distance_km asc
    limit p_limit;
end;
$$;

grant execute on function public.get_recs_nearby(uuid, integer) to authenticated;

-- Active recommendations: users active in a recent window
create or replace function public.get_recs_active(p_user_id uuid, p_window_minutes integer default 30)
returns table (
  id uuid,
  user_id uuid,
  full_name text,
  age integer,
  bio text,
  avatar_url text,
  location text,
  latitude double precision,
  longitude double precision,
  region text,
  tribe text,
  religion text,
  personality_type text,
  is_active boolean,
  last_active timestamp with time zone,
  verified boolean,
  ai_score numeric
)
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  cutoff timestamp with time zone;
begin
  cutoff := now() - make_interval(mins => p_window_minutes);
  return query
    select p.id, p.user_id, p.full_name, p.age, p.bio, p.avatar_url, p.location,
           p.latitude, p.longitude, p.region, p.tribe, p.religion, p.personality_type,
           p.is_active, p.last_active, p.verified, p.ai_score
    from public.profiles p
    where p.id <> p_user_id
      and p.deleted_at is null
      and (
        p.is_active = true
        or (p.last_active is not null and p.last_active >= cutoff)
      )
    order by coalesce(p.last_active, cutoff) desc
    limit 50;
end;
$$;

grant execute on function public.get_recs_active(uuid, integer) to authenticated;
