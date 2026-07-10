-- Stage 2: move locality affinity primitives into Supabase so discovery can
-- consume one backend-generated source of truth for reason, strength, and copy.

create or replace function public.normalize_location_key(p_value text)
returns text
language sql
immutable
set search_path = public, pg_catalog
as $$
  select nullif(regexp_replace(lower(btrim(coalesce(p_value, ''))), '\s+', ' ', 'g'), '');
$$;

drop function if exists public.compute_location_affinity(uuid, uuid);
drop function if exists public.compute_location_affinities(uuid, uuid[]);

create or replace function public.compute_location_affinities(
  p_viewer_profile_id uuid,
  p_candidate_profile_ids uuid[]
)
returns table (
  profile_id uuid,
  reason_code text,
  strength double precision,
  short_text text,
  long_text text
)
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  with viewer as (
    select
      p.id,
      p.user_id,
      p.city,
      p.region,
      p.current_country,
      p.current_country_code,
      p.locality_geoname_id,
      p.locality_district,
      p.roots_visibility,
      p.roots_region,
      p.roots_locality,
      p.roots_locality_geoname_id,
      coalesce(
        public.normalize_location_key(p.current_country_code),
        public.normalize_location_key(p.current_country),
        ''
      ) as country_key,
      public.normalize_location_key(p.locality_district) as district_key,
      public.normalize_location_key(p.region) as region_key,
      public.normalize_location_key(p.roots_region) as roots_region_key
    from public.profiles p
    where p.id = p_viewer_profile_id
      and p.user_id = auth.uid()
      and p.deleted_at is null
    limit 1
  ),
  candidate_ids as (
    select distinct candidate_id as profile_id
    from unnest(coalesce(p_candidate_profile_ids, array[]::uuid[])) candidate_id
    where candidate_id is not null
      and candidate_id <> p_viewer_profile_id
  ),
  candidates as (
    select
      ids.profile_id,
      p.user_id,
      p.city,
      p.region,
      p.current_country,
      p.current_country_code,
      p.locality_geoname_id,
      p.locality_district,
      p.roots_visibility,
      p.roots_region,
      p.roots_locality,
      p.roots_locality_geoname_id,
      coalesce(
        public.normalize_location_key(p.current_country_code),
        public.normalize_location_key(p.current_country),
        ''
      ) as country_key,
      public.normalize_location_key(p.locality_district) as district_key,
      public.normalize_location_key(p.region) as region_key,
      public.normalize_location_key(p.roots_region) as roots_region_key,
      upper(btrim(coalesce(p.roots_visibility, ''))) = 'VISIBLE' as can_reveal_roots
    from candidate_ids ids
    join public.profiles p
      on p.id = ids.profile_id
    where p.deleted_at is null
  ),
  scored as (
    select
      c.profile_id,
      c.city,
      c.region,
      c.current_country,
      c.locality_district,
      c.roots_region,
      c.roots_locality,
      c.can_reveal_roots,
      (
        v.locality_geoname_id is not null
        and c.locality_geoname_id is not null
        and v.locality_geoname_id = c.locality_geoname_id
      ) as same_locality,
      (
        v.district_key is not null
        and c.district_key is not null
        and v.district_key = c.district_key
      ) as same_district,
      (
        v.region_key is not null
        and c.region_key is not null
        and v.region_key = c.region_key
      ) as same_region,
      (
        v.country_key <> ''
        and c.country_key <> ''
        and v.country_key = c.country_key
      ) as same_country,
      (
        v.roots_locality_geoname_id is not null
        and c.roots_locality_geoname_id is not null
        and v.roots_locality_geoname_id = c.roots_locality_geoname_id
      ) as shared_roots_locality,
      (
        v.roots_region_key is not null
        and c.roots_region_key is not null
        and v.roots_region_key = c.roots_region_key
      ) as shared_roots_region,
      (
        (
          v.locality_geoname_id is not null
          and c.roots_locality_geoname_id is not null
          and v.locality_geoname_id = c.roots_locality_geoname_id
        )
        or (
          c.locality_geoname_id is not null
          and v.roots_locality_geoname_id is not null
          and c.locality_geoname_id = v.roots_locality_geoname_id
        )
      )
      and v.country_key <> c.country_key as diaspora_bridge
    from viewer v
    join candidates c
      on c.user_id is distinct from v.user_id
  )
  select
    scored.profile_id,
    case
      when scored.diaspora_bridge and scored.can_reveal_roots and scored.roots_locality is not null then 'diaspora_bridge'
      when scored.shared_roots_locality and scored.can_reveal_roots and scored.roots_locality is not null then 'shared_roots_locality'
      when scored.same_locality and scored.city is not null then 'same_locality'
      when scored.shared_roots_region and scored.can_reveal_roots and scored.roots_region is not null then 'shared_roots_region'
      when scored.same_district and scored.locality_district is not null then 'same_district'
      when scored.same_region and scored.region is not null then 'same_region'
      when scored.same_country and scored.current_country is not null then 'same_country'
      else null
    end as reason_code,
    case
      when scored.diaspora_bridge and scored.can_reveal_roots and scored.roots_locality is not null then 2.6
      when scored.shared_roots_locality and scored.can_reveal_roots and scored.roots_locality is not null then 2.8
      when scored.same_locality and scored.city is not null then 3.2
      when scored.shared_roots_region and scored.can_reveal_roots and scored.roots_region is not null then 1.3
      when scored.same_district and scored.locality_district is not null then 2.1
      when scored.same_region and scored.region is not null then 1.5
      when scored.same_country and scored.current_country is not null then 0.6
      else null
    end as strength,
    case
      when scored.diaspora_bridge and scored.can_reveal_roots and scored.roots_locality is not null then 'Diaspora bridge to ' || scored.roots_locality
      when scored.shared_roots_locality and scored.can_reveal_roots and scored.roots_locality is not null then 'Shared roots around ' || scored.roots_locality
      when scored.same_locality and scored.city is not null then 'Shared connection to ' || scored.city
      when scored.shared_roots_region and scored.can_reveal_roots and scored.roots_region is not null then 'Shared roots in ' || scored.roots_region
      when scored.same_district and scored.locality_district is not null then 'Same district: ' || scored.locality_district
      when scored.same_region and scored.region is not null then 'Shared connection to ' || scored.region
      when scored.same_country and scored.current_country is not null then 'Both connected to ' || scored.current_country
      else null
    end as short_text,
    case
      when scored.diaspora_bridge and scored.can_reveal_roots and scored.roots_locality is not null then 'You share a diaspora bridge through ' || scored.roots_locality || '.'
      when scored.shared_roots_locality and scored.can_reveal_roots and scored.roots_locality is not null then 'You share roots around ' || scored.roots_locality || '.'
      when scored.same_locality and scored.city is not null then 'You both have a connection to ' || scored.city || '.'
      when scored.shared_roots_region and scored.can_reveal_roots and scored.roots_region is not null then 'There''s a shared roots connection in ' || scored.roots_region || '.'
      when scored.same_district and scored.locality_district is not null then 'You both have ties to ' || scored.locality_district || '.'
      when scored.same_region and scored.region is not null then 'You both have a connection to ' || scored.region || '.'
      when scored.same_country and scored.current_country is not null then 'You both call ' || scored.current_country || ' home.'
      else null
    end as long_text
  from scored
  where (
    scored.diaspora_bridge and scored.can_reveal_roots and scored.roots_locality is not null
  ) or (
    scored.shared_roots_locality and scored.can_reveal_roots and scored.roots_locality is not null
  ) or (
    scored.same_locality and scored.city is not null
  ) or (
    scored.shared_roots_region and scored.can_reveal_roots and scored.roots_region is not null
  ) or (
    scored.same_district and scored.locality_district is not null
  ) or (
    scored.same_region and scored.region is not null
  ) or (
    scored.same_country and scored.current_country is not null
  );
$$;

create or replace function public.compute_location_affinity(
  p_viewer_profile_id uuid,
  p_candidate_profile_id uuid
)
returns table (
  reason_code text,
  strength double precision,
  short_text text,
  long_text text
)
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select
    affinity.reason_code,
    affinity.strength,
    affinity.short_text,
    affinity.long_text
  from public.compute_location_affinities(
    p_viewer_profile_id,
    array[p_candidate_profile_id]
  ) affinity
  limit 1;
$$;

revoke all on function public.compute_location_affinity(uuid, uuid) from public;
revoke all on function public.compute_location_affinities(uuid, uuid[]) from public;
grant execute on function public.compute_location_affinity(uuid, uuid) to authenticated;
grant execute on function public.compute_location_affinities(uuid, uuid[]) to authenticated;

drop function if exists public.get_recs_nearby_scored(uuid, integer);
drop function if exists public.get_recs_active_scored(uuid, integer);
drop function if exists public.get_recs_for_you_scored(uuid, integer);

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
  distance_km double precision,
  location_affinity_reason_code text,
  location_affinity_strength double precision,
  location_affinity_short_text text
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
  ),
  base_candidates as (
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
      p.religion::text as religion,
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
      case
        when my_lat is null or my_lon is null or p.latitude is null or p.longitude is null then null::double precision
        else (6371 * 2 * asin(sqrt(
          power(sin(radians(p.latitude - my_lat) / 2), 2) +
          cos(radians(my_lat)) * cos(radians(p.latitude)) *
          power(sin(radians(p.longitude - my_lon) / 2), 2)
        )))
      end as distance_km,
      p.updated_at as sort_updated_at
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
  ),
  ranked as (
    select *
    from base_candidates
    order by ai_score desc, distance_km asc nulls last, sort_updated_at desc
    limit p_limit
  )
  select
    ranked.id,
    ranked.user_id,
    ranked.full_name,
    ranked.age,
    ranked.bio,
    ranked.avatar_url,
    ranked.profile_video,
    ranked.location,
    ranked.latitude,
    ranked.longitude,
    ranked.region,
    ranked.tribe,
    ranked.religion,
    ranked.personality_type,
    ranked.is_active,
    ranked.online,
    ranked.last_active,
    ranked.verified,
    ranked.verification_level,
    ranked.ai_score,
    ranked.distance_km,
    affinity.reason_code,
    affinity.strength,
    affinity.short_text
  from ranked
  left join lateral public.compute_location_affinity(p_user_id, ranked.id) affinity on true;
end;
$$;

grant execute on function public.get_recs_nearby_scored(uuid, integer) to authenticated;

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
  ai_score numeric,
  distance_km double precision,
  location_affinity_reason_code text,
  location_affinity_strength double precision,
  location_affinity_short_text text
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
  my_gender gender;
  cutoff timestamptz;
begin
  if auth.uid() is null then
    return;
  end if;

  select pr.latitude, pr.longitude, pr.user_id, pr.min_age_interest, pr.max_age_interest, pr.gender
    into my_lat, my_lon, my_user_id, my_min_age, my_max_age, my_gender
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
  ),
  base_candidates as (
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
      p.religion::text as religion,
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
      ) as ai_score,
      case
        when my_lat is null or my_lon is null or p.latitude is null or p.longitude is null then null::double precision
        else (6371 * 2 * asin(sqrt(
          power(sin(radians(p.latitude - my_lat) / 2), 2) +
          cos(radians(my_lat)) * cos(radians(p.latitude)) *
          power(sin(radians(p.longitude - my_lon) / 2), 2)
        )))
      end as distance_km,
      p.updated_at as sort_updated_at
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
  ),
  ranked as (
    select *
    from base_candidates
    order by ai_score desc, online desc, coalesce(last_active, cutoff) desc, distance_km asc nulls last, sort_updated_at desc
    limit 50
  )
  select
    ranked.id,
    ranked.user_id,
    ranked.full_name,
    ranked.age,
    ranked.bio,
    ranked.avatar_url,
    ranked.profile_video,
    ranked.location,
    ranked.latitude,
    ranked.longitude,
    ranked.region,
    ranked.tribe,
    ranked.religion,
    ranked.personality_type,
    ranked.is_active,
    ranked.online,
    ranked.last_active,
    ranked.verified,
    ranked.verification_level,
    ranked.ai_score,
    ranked.distance_km,
    affinity.reason_code,
    affinity.strength,
    affinity.short_text
  from ranked
  left join lateral public.compute_location_affinity(p_user_id, ranked.id) affinity on true;
end;
$$;

grant execute on function public.get_recs_active_scored(uuid, integer) to authenticated;

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
  distance_km double precision,
  location_affinity_reason_code text,
  location_affinity_strength double precision,
  location_affinity_short_text text
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
  ),
  base_candidates as (
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
      p.religion::text as religion,
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
      case
        when my_lat is null or my_lon is null or p.latitude is null or p.longitude is null then null::double precision
        else (6371 * 2 * asin(sqrt(
          power(sin(radians(p.latitude - my_lat) / 2), 2) +
          cos(radians(my_lat)) * cos(radians(p.latitude)) *
          power(sin(radians(p.longitude - my_lon) / 2), 2)
        )))
      end as distance_km,
      p.updated_at as sort_updated_at
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
  ),
  ranked as (
    select *
    from base_candidates
    order by ai_score desc, distance_km asc nulls last, sort_updated_at desc
    limit p_limit
  )
  select
    ranked.id,
    ranked.user_id,
    ranked.full_name,
    ranked.age,
    ranked.bio,
    ranked.avatar_url,
    ranked.profile_video,
    ranked.location,
    ranked.latitude,
    ranked.longitude,
    ranked.region,
    ranked.tribe,
    ranked.religion,
    ranked.personality_type,
    ranked.is_active,
    ranked.online,
    ranked.last_active,
    ranked.verified,
    ranked.verification_level,
    ranked.ai_score,
    ranked.distance_km,
    affinity.reason_code,
    affinity.strength,
    affinity.short_text
  from ranked
  left join lateral public.compute_location_affinity(p_user_id, ranked.id) affinity on true;
end;
$$;

grant execute on function public.get_recs_for_you_scored(uuid, integer) to authenticated;
