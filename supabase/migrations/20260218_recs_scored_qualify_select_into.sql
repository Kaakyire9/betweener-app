-- Fix PostgREST RPC errors like:
--   ERROR: 42702: column reference "latitude" is ambiguous
-- caused by PL/pgSQL RETURNS TABLE output columns being variables inside the function.
-- Any unqualified reference like `select latitude ... from profiles` can be ambiguous between:
--   - the output-column variable (latitude)
--   - the table column (profiles.latitude)
-- Fix by qualifying viewer-profile column reads with a table alias.

-- Nearby recommendations with compatibility score
create or replace function public.get_recs_nearby_scored(p_user_id uuid, p_limit integer default 20)
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
  last_active timestamp with time zone,
  verified boolean,
  verification_level integer,
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
  my_user_id uuid;
  my_min_age integer;
  my_max_age integer;
  my_region text;
  my_gender gender;
begin
  if auth.uid() is null then
    return;
  end if;

  select pr.latitude, pr.longitude, pr.user_id, pr.min_age_interest, pr.max_age_interest, pr.region, pr.gender
    into my_lat, my_lon, my_user_id, my_min_age, my_max_age, my_region, my_gender
  from public.profiles pr
  where pr.id = p_user_id
    and pr.user_id = auth.uid()
  limit 1;

  if my_user_id is null then
    return;
  end if;

  return query
  with viewer_interests as (
    select pi.interest_id
    from public.profile_interests pi
    where pi.profile_id = p_user_id
  ),
  viewer_counts as (
    select count(*)::double precision as cnt
    from viewer_interests
  )
  select
    p.id,
    p.user_id,
    p.full_name,
    p.age,
    p.bio,
    p.avatar_url,
    p.profile_video,
    p.location,
    p.latitude,
    p.longitude,
    p.region,
    p.tribe,
    p.religion,
    p.personality_type,
    p.is_active,
    p.online,
    p.last_active,
    (coalesce(p.verification_level, 0) > 0) as verified,
    p.verification_level,
    (
      -- Compatibility score (0..100)
      with target_counts as (
        select count(*)::double precision as cnt
        from public.profile_interests tpi
        where tpi.profile_id = p.id
      ),
      shared as (
        select count(*)::double precision as cnt
        from public.profile_interests tpi
        join viewer_interests vi on vi.interest_id = tpi.interest_id
        where tpi.profile_id = p.id
      )
      select
        least(100, greatest(0, round(
          100 * (
            0.50 * (
              case
                when (select vc.cnt from viewer_counts vc) <= 0 and (select tc.cnt from target_counts tc) <= 0 then 0.20
                else (select s.cnt from shared s) / greatest((select vc.cnt from viewer_counts vc) + (select tc.cnt from target_counts tc) - (select s.cnt from shared s), 1)
              end
            )
            + 0.35 * (
              case
                when my_lat is null or my_lon is null or p.latitude is null or p.longitude is null then 0.55
                else greatest(0, 1 - least((6371 * 2 * asin(sqrt(
                  power(sin(radians(p.latitude - my_lat) / 2), 2) +
                  cos(radians(my_lat)) * cos(radians(p.latitude)) *
                  power(sin(radians(p.longitude - my_lon) / 2), 2)
                ))), 250) / 250)
              end
            )
            + 0.10 * (least(coalesce(p.verification_level, 0), 3)::double precision / 3)
            + 0.05 * (case when p.online = true then 1 else 0.4 end)
          )
        )))::numeric
    ) as ai_score,
    (
      case
        when my_lat is null or my_lon is null or p.latitude is null or p.longitude is null then null::double precision
        else (6371 * 2 * asin(sqrt(
          power(sin(radians(p.latitude - my_lat) / 2), 2) +
          cos(radians(my_lat)) * cos(radians(p.latitude)) *
          power(sin(radians(p.longitude - my_lon) / 2), 2)
        )))
      end
    ) as distance_km
  from public.profiles p
  where p.id <> p_user_id
    and p.deleted_at is null
    and p.is_active = true
    and p.profile_completed is true
    and coalesce(p.discoverable_in_vibes, true) = true
    and coalesce(p.matchmaking_mode, false) = false
    and (
      my_gender is null
      or my_gender not in ('MALE', 'FEMALE')
      or p.gender is null
      or (my_gender = 'MALE' and p.gender = 'FEMALE')
      or (my_gender = 'FEMALE' and p.gender = 'MALE')
    )
    and (my_min_age is null or p.age >= my_min_age)
    and (my_max_age is null or p.age <= my_max_age)
    and not exists (
      select 1 from public.swipes s
      where s.swiper_id = p_user_id
        and s.target_id = p.id
    )
    and (
      my_user_id is null
      or not exists (
        select 1 from public.blocks b
        where (b.blocker_id = my_user_id and b.blocked_id = p.user_id)
           or (b.blocker_id = p.user_id and b.blocked_id = my_user_id)
      )
    )
  -- ai_score is column 20, distance_km is column 21 in this SELECT list.
  order by 20 desc, 21 asc nulls last, p.updated_at desc
  limit p_limit;
end;
$$;

grant execute on function public.get_recs_nearby_scored(uuid, integer) to authenticated;

-- Active recommendations with compatibility score
create or replace function public.get_recs_active_scored(p_user_id uuid, p_window_minutes integer default 30)
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
  last_active timestamp with time zone,
  verified boolean,
  verification_level integer,
  ai_score numeric
)
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  my_user_id uuid;
  my_min_age integer;
  my_max_age integer;
  my_gender gender;
  cutoff timestamptz;
begin
  if auth.uid() is null then
    return;
  end if;

  select pr.user_id, pr.min_age_interest, pr.max_age_interest, pr.gender
    into my_user_id, my_min_age, my_max_age, my_gender
  from public.profiles pr
  where pr.id = p_user_id
    and pr.user_id = auth.uid()
  limit 1;

  if my_user_id is null then
    return;
  end if;

  cutoff := now() - (p_window_minutes || ' minutes')::interval;

  return query
  with viewer_interests as (
    select pi.interest_id
    from public.profile_interests pi
    where pi.profile_id = p_user_id
  ),
  viewer_counts as (
    select count(*)::double precision as cnt
    from viewer_interests
  )
  select
    p.id,
    p.user_id,
    p.full_name,
    p.age,
    p.bio,
    p.avatar_url,
    p.profile_video,
    p.location,
    p.latitude,
    p.longitude,
    p.region,
    p.tribe,
    p.religion,
    p.personality_type,
    p.is_active,
    p.online,
    p.last_active,
    (coalesce(p.verification_level, 0) > 0) as verified,
    p.verification_level,
    (
      with target_counts as (
        select count(*)::double precision as cnt
        from public.profile_interests tpi
        where tpi.profile_id = p.id
      ),
      shared as (
        select count(*)::double precision as cnt
        from public.profile_interests tpi
        join viewer_interests vi on vi.interest_id = tpi.interest_id
        where tpi.profile_id = p.id
      )
      select
        least(100, greatest(0, round(
          100 * (
            0.70 * (
              case
                when (select vc.cnt from viewer_counts vc) <= 0 and (select tc.cnt from target_counts tc) <= 0 then 0.20
                else (select s.cnt from shared s) / greatest((select vc.cnt from viewer_counts vc) + (select tc.cnt from target_counts tc) - (select s.cnt from shared s), 1)
              end
            )
            + 0.20 * (least(coalesce(p.verification_level, 0), 3)::double precision / 3)
            + 0.10 * (case when p.online = true then 1 else 0.4 end)
          )
        )))::numeric
    ) as ai_score
  from public.profiles p
  where p.id <> p_user_id
    and p.deleted_at is null
    and (p.is_active = true or p.online = true or (p.last_active is not null and p.last_active >= cutoff))
    and p.profile_completed is true
    and coalesce(p.discoverable_in_vibes, true) = true
    and coalesce(p.matchmaking_mode, false) = false
    and (
      my_gender is null
      or my_gender not in ('MALE', 'FEMALE')
      or p.gender is null
      or (my_gender = 'MALE' and p.gender = 'FEMALE')
      or (my_gender = 'FEMALE' and p.gender = 'MALE')
    )
    and (my_min_age is null or p.age >= my_min_age)
    and (my_max_age is null or p.age <= my_max_age)
    and not exists (
      select 1 from public.swipes s
      where s.swiper_id = p_user_id
        and s.target_id = p.id
    )
    and (
      my_user_id is null
      or not exists (
        select 1 from public.blocks b
        where (b.blocker_id = my_user_id and b.blocked_id = p.user_id)
           or (b.blocker_id = p.user_id and b.blocked_id = my_user_id)
      )
    )
  -- ai_score is column 20 in this SELECT list.
  order by 20 desc, p.online desc, coalesce(p.last_active, cutoff) desc, p.updated_at desc
  limit 50;
end;
$$;

grant execute on function public.get_recs_active_scored(uuid, integer) to authenticated;

-- "For you" recommendations (general) with compatibility score
create or replace function public.get_recs_for_you_scored(p_user_id uuid, p_limit integer default 20)
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
  last_active timestamp with time zone,
  verified boolean,
  verification_level integer,
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
  my_user_id uuid;
  my_min_age integer;
  my_max_age integer;
  my_region text;
  my_gender gender;
begin
  if auth.uid() is null then
    return;
  end if;

  select pr.latitude, pr.longitude, pr.user_id, pr.min_age_interest, pr.max_age_interest, pr.region, pr.gender
    into my_lat, my_lon, my_user_id, my_min_age, my_max_age, my_region, my_gender
  from public.profiles pr
  where pr.id = p_user_id
    and pr.user_id = auth.uid()
  limit 1;

  if my_user_id is null then
    return;
  end if;

  return query
  with viewer_interests as (
    select pi.interest_id
    from public.profile_interests pi
    where pi.profile_id = p_user_id
  ),
  viewer_counts as (
    select count(*)::double precision as cnt
    from viewer_interests
  )
  select
    p.id,
    p.user_id,
    p.full_name,
    p.age,
    p.bio,
    p.avatar_url,
    p.profile_video,
    p.location,
    p.latitude,
    p.longitude,
    p.region,
    p.tribe,
    p.religion,
    p.personality_type,
    p.is_active,
    p.online,
    p.last_active,
    (coalesce(p.verification_level, 0) > 0) as verified,
    p.verification_level,
    (
      with target_counts as (
        select count(*)::double precision as cnt
        from public.profile_interests tpi
        where tpi.profile_id = p.id
      ),
      shared as (
        select count(*)::double precision as cnt
        from public.profile_interests tpi
        join viewer_interests vi on vi.interest_id = tpi.interest_id
        where tpi.profile_id = p.id
      )
      select
        least(100, greatest(0, round(
          100 * (
            0.55 * (
              case
                when (select vc.cnt from viewer_counts vc) <= 0 and (select tc.cnt from target_counts tc) <= 0 then 0.20
                else (select s.cnt from shared s) / greatest((select vc.cnt from viewer_counts vc) + (select tc.cnt from target_counts tc) - (select s.cnt from shared s), 1)
              end
            )
            + 0.25 * (
              case
                when my_lat is null or my_lon is null or p.latitude is null or p.longitude is null then 0.55
                else greatest(0, 1 - least((6371 * 2 * asin(sqrt(
                  power(sin(radians(p.latitude - my_lat) / 2), 2) +
                  cos(radians(my_lat)) * cos(radians(p.latitude)) *
                  power(sin(radians(p.longitude - my_lon) / 2), 2)
                ))), 250) / 250)
              end
            )
            + 0.10 * (case when my_region is not null and p.region is not null and p.region = my_region then 1 else 0.0 end)
            + 0.07 * (least(coalesce(p.verification_level, 0), 3)::double precision / 3)
            + 0.03 * (case when p.online = true then 1 else 0.4 end)
          )
        )))::numeric
    ) as ai_score,
    (
      case
        when my_lat is null or my_lon is null or p.latitude is null or p.longitude is null then null::double precision
        else (6371 * 2 * asin(sqrt(
          power(sin(radians(p.latitude - my_lat) / 2), 2) +
          cos(radians(my_lat)) * cos(radians(p.latitude)) *
          power(sin(radians(p.longitude - my_lon) / 2), 2)
        )))
      end
    ) as distance_km
  from public.profiles p
  where p.id <> p_user_id
    and p.deleted_at is null
    and p.is_active = true
    and p.profile_completed is true
    and coalesce(p.discoverable_in_vibes, true) = true
    and coalesce(p.matchmaking_mode, false) = false
    and (
      my_gender is null
      or my_gender not in ('MALE', 'FEMALE')
      or p.gender is null
      or (my_gender = 'MALE' and p.gender = 'FEMALE')
      or (my_gender = 'FEMALE' and p.gender = 'MALE')
    )
    and (my_min_age is null or p.age >= my_min_age)
    and (my_max_age is null or p.age <= my_max_age)
    and not exists (
      select 1 from public.swipes s
      where s.swiper_id = p_user_id
        and s.target_id = p.id
    )
    and (
      my_user_id is null
      or not exists (
        select 1 from public.blocks b
        where (b.blocker_id = my_user_id and b.blocked_id = p.user_id)
           or (b.blocker_id = p.user_id and b.blocked_id = my_user_id)
      )
    )
  -- ai_score is column 20, distance_km is column 21 in this SELECT list.
  order by 20 desc, 21 asc nulls last, p.updated_at desc
  limit p_limit;
end;
$$;

grant execute on function public.get_recs_for_you_scored(uuid, integer) to authenticated;

