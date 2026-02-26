-- Fix: rpc_get_suggested_moves "column reference \"id\" is ambiguous" (SQLSTATE 42702)
--
-- In plpgsql, RETURNS TABLE column names (e.g. `id`) become variables in the function scope.
-- Unqualified `id` in SQL can then be ambiguous between that plpgsql variable and a table column.

create or replace function public.rpc_get_suggested_moves(
  p_profile_id uuid,
  p_limit integer default 6
)
returns table (
  id uuid,
  full_name text,
  age integer,
  avatar_url text,
  short_tags text[],
  has_intro_video boolean,
  distance_km double precision
)
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  my_user_id uuid;
  my_lat double precision;
  my_lon double precision;
  my_gender gender;
  my_age integer;
  my_min_age_interest integer;
  my_max_age_interest integer;
  my_region text;
  my_religion religion;
  my_looking_for text;
begin
  if auth.uid() is null then
    return;
  end if;

  select
    p.user_id,
    p.latitude,
    p.longitude,
    p.gender,
    p.age,
    p.min_age_interest,
    p.max_age_interest,
    p.region,
    p.religion,
    p.looking_for
    into
      my_user_id,
      my_lat,
      my_lon,
      my_gender,
      my_age,
      my_min_age_interest,
      my_max_age_interest,
      my_region,
      my_religion,
      my_looking_for
  from public.profiles p
  where p.id = p_profile_id
    and p.user_id = auth.uid()
  limit 1;

  if my_user_id is null then
    return;
  end if;

  return query
  with top_targets as (
    select ps.target_profile_id
    from public.profile_signals ps
    where ps.profile_id = p_profile_id
    order by ps.liked desc,
             ps.intro_video_completed desc,
             ps.dwell_score desc,
             ps.last_interacted_at desc
    limit 20
  ),
  taste_interests as (
    select i.name
    from public.profile_interests pi
    join public.interests i on i.id = pi.interest_id
    join top_targets t on t.target_profile_id = pi.profile_id
    group by i.name
    order by count(*) desc, i.name asc
    limit 5
  ),
  taste as (
    select coalesce(array_agg(name), '{}'::text[]) as top_interests
    from taste_interests
  ),
  candidates as (
    select
      p.id,
      p.full_name,
      p.age,
      p.avatar_url,
      p.profile_video,
      p.region,
      p.religion,
      p.looking_for,
      p.min_age_interest,
      p.max_age_interest,
      p.verification_level,
      p.latitude,
      p.longitude,
      p.online,
      p.last_active,
      (
        select count(*)
        from public.profile_interests pi
        join public.interests i on i.id = pi.interest_id
        where pi.profile_id = p.id
          -- `ANY (subquery)` treats the subquery as a set; since `taste.top_interests` is an array,
          -- we must pass the *array expression* directly.
          and i.name = any(taste.top_interests)
      ) as shared_interest_count
    from public.profiles p
    cross join taste
    where p.id <> p_profile_id
      and p.deleted_at is null
      and p.is_active = true
      and p.profile_completed is true
      and coalesce(p.discoverable_in_vibes, true) = true
      and p.user_id is not null
      and p.user_id <> my_user_id
      and p.full_name is not null
      and p.age is not null
      -- Respect age preferences both ways when available.
      and (
        my_min_age_interest is null
        or my_max_age_interest is null
        or (p.age between my_min_age_interest and my_max_age_interest)
      )
      and (
        my_age is null
        or p.min_age_interest is null
        or p.max_age_interest is null
        or (my_age between p.min_age_interest and p.max_age_interest)
      )
      -- Avoid same-sex suggestions by default for binary gender only.
      -- If the viewer/candidate gender is NULL or non-binary/other, we skip this filter until
      -- we implement explicit orientation/preferences.
      and (
        my_gender is null
        or my_gender not in ('MALE','FEMALE')
        or p.gender is null
        or p.gender not in ('MALE','FEMALE')
        or (my_gender = 'MALE' and p.gender = 'FEMALE')
        or (my_gender = 'FEMALE' and p.gender = 'MALE')
      )
      and not exists (
        select 1 from public.intent_requests ir
        where ((ir.actor_id = p_profile_id and ir.recipient_id = p.id)
            or (ir.actor_id = p.id and ir.recipient_id = p_profile_id))
          and ir.status in ('pending','accepted','passed')
      )
      and not exists (
        select 1 from public.matches m
        where (m.user1_id = p_profile_id and m.user2_id = p.id)
           or (m.user1_id = p.id and m.user2_id = p_profile_id)
      )
      and not exists (
        select 1 from public.blocks b
        where (b.blocker_id = my_user_id and b.blocked_id = p.user_id)
           or (b.blocker_id = p.user_id and b.blocked_id = my_user_id)
      )
  ),
  scored as (
    select
      c.*,
      (
        case
          when my_lat is null or my_lon is null or c.latitude is null or c.longitude is null
            then null::double precision
          else (6371 * 2 * asin(sqrt(
            power(sin(radians(c.latitude - my_lat) / 2), 2) +
            cos(radians(my_lat)) * cos(radians(c.latitude)) *
            power(sin(radians(c.longitude - my_lon) / 2), 2)
          )))
        end
      ) as distance_km
    from candidates c
  ),
  ranked as (
    select
      s.*,
      (
        (case when s.shared_interest_count > 0 then s.shared_interest_count * 2 else 0 end)
        + (case when s.profile_video is not null then 2 else 0 end)
        + (case when s.online = true then 1 else 0 end)
        + (case when s.last_active > now() - interval '3 days' then 1 else 0 end)
        + (case when my_region is not null and s.region is not null and my_region = s.region then 1 else 0 end)
        + (case when my_religion is not null and s.religion is not null and my_religion = s.religion then 1 else 0 end)
        + (case
            when my_looking_for is not null and s.looking_for is not null
              and lower(trim(my_looking_for)) = lower(trim(s.looking_for))
              then 1
            else 0
          end)
        + (case when coalesce(s.verification_level, 0) > 0 then 1 else 0 end)
        + (case
            when s.distance_km is null then 0
            when s.distance_km <= 25 then 2
            when s.distance_km <= 100 then 1
            when s.distance_km <= 500 then 0
            when s.distance_km <= 2000 then -1
            else -3
          end)
      ) as score
    from scored s
  )
  select
    r.id,
    r.full_name,
    r.age,
    r.avatar_url,
    (array_remove(array[
      case when r.profile_video is not null then 'Intro video' end,
      case when r.shared_interest_count > 0 then 'Shared interests' end,
      case
        when my_looking_for is not null and r.looking_for is not null
          and lower(trim(my_looking_for)) = lower(trim(r.looking_for))
          then 'Same goals'
      end,
      case when my_religion is not null and r.religion is not null and my_religion = r.religion then 'Shared values' end,
      case when my_region is not null and r.region is not null and my_region = r.region then 'Same region' end,
      case when r.online = true then 'Active now' end
    ], null))[1:3] as short_tags,
    (r.profile_video is not null) as has_intro_video,
    r.distance_km
  from ranked r
  order by r.score desc, r.distance_km asc nulls last, r.last_active desc
  limit p_limit;
end;
$$;

grant execute on function public.rpc_get_suggested_moves(uuid, integer) to authenticated;
