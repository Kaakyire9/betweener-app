-- Snapshot active boost mode into the entitlement table and let the feed apply
-- bounded audience/focus-aware lift. This keeps the client contract stable while
-- making premium boosts materially smarter.

alter table public.profile_visibility_entitlements
  add column if not exists boost_type text,
  add column if not exists boost_audience_mode text,
  add column if not exists boost_focus_mode text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profile_visibility_entitlements_boost_type_check'
  ) then
    alter table public.profile_visibility_entitlements
      add constraint profile_visibility_entitlements_boost_type_check
      check (
        boost_type is null
        or boost_type in ('manual', 'smart')
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'profile_visibility_entitlements_boost_audience_mode_check'
  ) then
    alter table public.profile_visibility_entitlements
      add constraint profile_visibility_entitlements_boost_audience_mode_check
      check (
        boost_audience_mode is null
        or boost_audience_mode in ('for_you', 'nearby', 'active_now', 'intent_match', 'second_look')
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'profile_visibility_entitlements_boost_focus_mode_check'
  ) then
    alter table public.profile_visibility_entitlements
      add constraint profile_visibility_entitlements_boost_focus_mode_check
      check (
        boost_focus_mode is null
        or boost_focus_mode in ('profile', 'intro', 'intent')
      );
  end if;
end;
$$;

create or replace function public.refresh_profile_visibility_entitlements(
  p_profile_ids uuid[] default null
)
returns integer
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_rows integer := 0;
begin
  with active_boosts as (
    select distinct on (boost_row.user_id)
      boost_row.user_id as profile_id,
      boost_row.ends_at as boost_ends_at,
      coalesce(boost_row.boost_type, 'manual') as boost_type,
      coalesce(boost_row.audience_mode, 'for_you') as boost_audience_mode,
      coalesce(boost_row.focus_mode, 'profile') as boost_focus_mode
    from public.profile_boosts boost_row
    where boost_row.ends_at > timezone('utc'::text, now())
      and coalesce(boost_row.status, 'active') = 'active'
      and (p_profile_ids is null or boost_row.user_id = any(p_profile_ids))
    order by boost_row.user_id, boost_row.ends_at desc, boost_row.created_at desc
  ),
  source as (
    select
      profile.id as profile_id,
      profile.user_id,
      plan_state.premium_plan,
      case plan_state.premium_plan
        when 'GOLD' then 2
        when 'SILVER' then 1
        else 0
      end as premium_rank,
      active_boosts.boost_ends_at is not null as has_active_boost,
      active_boosts.boost_ends_at,
      active_boosts.boost_type,
      active_boosts.boost_audience_mode,
      active_boosts.boost_focus_mode,
      profile.created_at as profile_created_at,
      timezone('utc'::text, now()) as refreshed_at
    from public.profiles profile
    cross join lateral (
      select public.get_active_subscription_plan(profile.user_id)::text as premium_plan
    ) plan_state
    left join active_boosts
      on active_boosts.profile_id = profile.id
    where profile.deleted_at is null
      and (p_profile_ids is null or profile.id = any(p_profile_ids))
  ),
  upserted as (
    insert into public.profile_visibility_entitlements (
      profile_id,
      user_id,
      premium_plan,
      premium_rank,
      has_active_boost,
      boost_ends_at,
      boost_type,
      boost_audience_mode,
      boost_focus_mode,
      profile_created_at,
      refreshed_at
    )
    select
      source.profile_id,
      source.user_id,
      source.premium_plan,
      source.premium_rank,
      source.has_active_boost,
      source.boost_ends_at,
      source.boost_type,
      source.boost_audience_mode,
      source.boost_focus_mode,
      source.profile_created_at,
      source.refreshed_at
    from source
    on conflict (profile_id) do update
      set user_id = excluded.user_id,
          premium_plan = excluded.premium_plan,
          premium_rank = excluded.premium_rank,
          has_active_boost = excluded.has_active_boost,
          boost_ends_at = excluded.boost_ends_at,
          boost_type = excluded.boost_type,
          boost_audience_mode = excluded.boost_audience_mode,
          boost_focus_mode = excluded.boost_focus_mode,
          profile_created_at = excluded.profile_created_at,
          refreshed_at = excluded.refreshed_at
    returning 1
  )
  select count(*) into v_rows
  from upserted;

  if p_profile_ids is null then
    delete from public.profile_visibility_entitlements ent
    where not exists (
      select 1
      from public.profiles profile
      where profile.id = ent.profile_id
        and profile.deleted_at is null
    );
  end if;

  return v_rows;
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
  last_active timestamp with time zone,
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
  my_city text;
  my_location_precision text;
  my_country text;
  my_country_code text;
  my_origin_country text;
  my_origin_country_code text;
  my_looking_for text;
  my_region_norm text;
  my_city_norm text;
  my_country_norm text;
  my_country_code_norm text;
  my_origin_country_norm text;
  my_origin_country_code_norm text;
  my_looking_for_norm text;
  my_is_diaspora boolean := false;
  my_has_usable_coordinates boolean := false;
  v_segment text := coalesce(nullif(btrim(p_segment), ''), 'for_you');
  v_limit integer := greatest(1, least(coalesce(p_limit, 30), 80));
  v_nearby_radius_km double precision := 250;
  v_nearby_lat_delta double precision := 0;
  v_nearby_lon_delta double precision := 0;
  v_seed_limit integer;
  v_candidate_ids uuid[] := '{}'::uuid[];
  cutoff timestamptz;
begin
  if auth.uid() is null then
    return;
  end if;

  if v_segment not in ('for_you', 'nearby', 'active_now') then
    v_segment := 'for_you';
  end if;

  select
    profile.latitude,
    profile.longitude,
    profile.user_id,
    profile.min_age_interest,
    profile.max_age_interest,
    profile.region,
    profile.gender,
    profile.city,
    profile.location_precision::text,
    profile.current_country,
    profile.current_country_code,
    profile.origin_country,
    profile.origin_country_code,
    profile.looking_for
  into
    my_lat,
    my_lon,
    my_user_id,
    my_min_age,
    my_max_age,
    my_region,
    my_gender,
    my_city,
    my_location_precision,
    my_country,
    my_country_code,
    my_origin_country,
    my_origin_country_code,
    my_looking_for
  from public.profiles profile
  where profile.id = p_user_id
    and profile.user_id = auth.uid()
    and profile.deleted_at is null
  limit 1;

  if my_user_id is null then
    return;
  end if;

  my_region_norm := nullif(lower(btrim(coalesce(my_region, ''))), '');
  my_city_norm := nullif(lower(btrim(coalesce(my_city, ''))), '');
  my_country_norm := nullif(lower(btrim(coalesce(
    public.normalize_vibes_country_name(my_country, my_country_code),
    ''
  ))), '');
  my_country_code_norm := public.normalize_vibes_country_code(my_country, my_country_code);
  my_origin_country_norm := nullif(lower(btrim(coalesce(
    public.normalize_vibes_country_name(my_origin_country, my_origin_country_code),
    ''
  ))), '');
  my_origin_country_code_norm := public.normalize_vibes_country_code(
    my_origin_country,
    my_origin_country_code
  );
  my_looking_for_norm := nullif(lower(btrim(coalesce(my_looking_for, ''))), '');

  if my_origin_country_code_norm is null and my_country_code_norm = 'GH' then
    my_origin_country_code_norm := 'GH';
  end if;

  if my_origin_country_norm is null and my_country_norm = 'ghana' then
    my_origin_country_norm := 'ghana';
  end if;

  my_region_norm := case
    when my_region_norm is null then null
    when my_region_norm in ('africa', 'north america', 'south america', 'europe', 'asia', 'oceania', 'middle east') then null
    when my_country_norm is not null and my_region_norm = my_country_norm then null
    when my_country_code_norm is not null and my_region_norm = lower(my_country_code_norm) then null
    else my_region_norm
  end;

  my_city_norm := case
    when my_city_norm is null then null
    when my_city_norm in ('africa', 'north america', 'south america', 'europe', 'asia', 'oceania', 'middle east') then null
    when my_region_norm is not null and my_city_norm = my_region_norm then null
    when my_country_norm is not null and my_city_norm = my_country_norm then null
    when my_country_code_norm is not null and my_city_norm = lower(my_country_code_norm) then null
    when my_city_norm ~ '(region|district|province|state|county|municipality|metropolitan)' then null
    else my_city_norm
  end;

  my_has_usable_coordinates := public.has_usable_vibes_coordinates(my_lat, my_lon);

  if my_has_usable_coordinates then
    v_nearby_lat_delta := least(v_nearby_radius_km / 111.0, 10.0);
    v_nearby_lon_delta := least(
      v_nearby_radius_km
        / greatest(111.0 * greatest(abs(cos(radians(my_lat))), 0.2), 1.0),
      10.0
    );
  end if;

  if v_segment = 'nearby' and not my_has_usable_coordinates then
    return;
  end if;

  my_is_diaspora := (
    my_origin_country_code_norm is not null
    and my_country_code_norm is not null
    and my_origin_country_code_norm <> my_country_code_norm
  ) or (
    my_origin_country_code_norm is null
    and my_country_code_norm is null
    and my_origin_country_norm is not null
    and my_country_norm is not null
    and my_origin_country_norm <> my_country_norm
  );

  cutoff := now() - (greatest(5, least(coalesce(p_active_window_minutes, 30), 240)) || ' minutes')::interval;
  v_seed_limit := greatest(v_limit * 6, 180);
  v_seed_limit := least(v_seed_limit, 360);

  select coalesce(array_agg(seed.id), '{}'::uuid[])
    into v_candidate_ids
  from (
    with viewer_state as (
      select
        summary_row.target_profile_id,
        summary_row.pass_count,
        summary_row.last_pass_at
      from public.viewer_profile_behavior_summary summary_row
      where summary_row.viewer_profile_id = p_user_id
    ),
    seed_base_raw as (
      select
        profile.id,
        profile.last_active,
        profile.updated_at,
        profile.created_at,
        profile.looking_for,
        coalesce(profile.verification_level, 0) as verification_level,
        loc.raw_distance_km,
        coalesce(seed_quality_metrics.impressions_30d, 0) as market_impressions,
        coalesce(seed_quality_metrics.market_quality_score, 0)::double precision as market_quality_score,
        coalesce(seed_entitlements.has_active_boost, false) as has_active_boost,
        coalesce(seed_entitlements.premium_rank, 0) as premium_rank,
        coalesce(seed_entitlements.boost_type, 'manual') as boost_type,
        coalesce(seed_entitlements.boost_audience_mode, 'for_you') as boost_audience_mode,
        coalesce(seed_entitlements.boost_focus_mode, 'profile') as boost_focus_mode,
        (coalesce(profile.profile_video, '') <> '') as has_intro_media,
        (
          length(btrim(coalesce(profile.looking_for, ''))) >= 8
          or profile.relationship_compass is not null
        ) as has_intent_content,
        (
          my_looking_for_norm is not null
          and nullif(lower(btrim(coalesce(profile.looking_for, ''))), '') = my_looking_for_norm
        ) as same_looking_for,
        (
          my_city_norm is not null
          and loc.candidate_city_norm = my_city_norm
          and (
            (my_country_code_norm is not null and loc.candidate_country_code_norm is not null and loc.candidate_country_code_norm = my_country_code_norm)
            or (
              my_country_code_norm is null
              and loc.candidate_country_code_norm is null
              and my_country_norm is not null
              and loc.candidate_country_norm = my_country_norm
            )
          )
        ) as same_city,
        (
          my_region_norm is not null
          and loc.candidate_region_norm = my_region_norm
          and (
            (my_country_code_norm is not null and loc.candidate_country_code_norm is not null and loc.candidate_country_code_norm = my_country_code_norm)
            or (
              my_country_code_norm is null
              and loc.candidate_country_code_norm is null
              and my_country_norm is not null
              and loc.candidate_country_norm = my_country_norm
            )
          )
        ) as same_region,
        (
          (my_country_code_norm is not null and loc.candidate_country_code_norm is not null and loc.candidate_country_code_norm = my_country_code_norm)
          or (
            my_country_code_norm is null
            and loc.candidate_country_code_norm is null
            and my_country_norm is not null
            and loc.candidate_country_norm = my_country_norm
          )
        ) as same_country,
        (
          (my_origin_country_code_norm is not null and loc.candidate_origin_country_code_norm is not null and loc.candidate_origin_country_code_norm = my_origin_country_code_norm)
          or (
            my_origin_country_code_norm is null
            and loc.candidate_origin_country_code_norm is null
            and my_origin_country_norm is not null
            and loc.candidate_origin_country_norm = my_origin_country_norm
          )
        ) as same_origin_country,
        (
          (my_origin_country_code_norm is not null and loc.candidate_country_code_norm is not null and loc.candidate_country_code_norm = my_origin_country_code_norm)
          or (
            my_origin_country_code_norm is null
            and loc.candidate_country_code_norm is null
            and my_origin_country_norm is not null
            and loc.candidate_country_norm = my_origin_country_norm
          )
          or (
            my_country_code_norm is not null
            and loc.candidate_origin_country_code_norm is not null
            and loc.candidate_origin_country_code_norm = my_country_code_norm
          )
          or (
            my_country_code_norm is null
            and loc.candidate_origin_country_code_norm is null
            and my_country_norm is not null
            and loc.candidate_origin_country_norm = my_country_norm
          )
        ) as origin_residence_bridge
      from public.profiles profile
      cross join lateral (
        with canonical as (
          select
            public.normalize_vibes_country_code(
              profile.current_country,
              profile.current_country_code
            ) as current_country_code_norm,
            nullif(lower(btrim(coalesce(
              public.normalize_vibes_country_name(
                profile.current_country,
                profile.current_country_code
              ),
              ''
            ))), '') as current_country_norm,
            public.normalize_vibes_country_code(
              profile.origin_country,
              profile.origin_country_code
            ) as origin_country_code_norm,
            nullif(lower(btrim(coalesce(
              public.normalize_vibes_country_name(
                profile.origin_country,
                profile.origin_country_code
              ),
              ''
            ))), '') as origin_country_norm
        )
        select
          canonical.current_country_code_norm as candidate_country_code_norm,
          canonical.current_country_norm as candidate_country_norm,
          case
            when canonical.origin_country_code_norm is not null
              then canonical.origin_country_code_norm
            when canonical.current_country_code_norm = 'GH'
              then 'GH'
            else null
          end as candidate_origin_country_code_norm,
          case
            when canonical.origin_country_norm is not null
              then canonical.origin_country_norm
            when canonical.current_country_norm = 'ghana'
              then 'ghana'
            else null
          end as candidate_origin_country_norm,
          case
            when nullif(lower(btrim(coalesce(profile.region, ''))), '') is null then null
            when nullif(lower(btrim(coalesce(profile.region, ''))), '') in ('africa', 'north america', 'south america', 'europe', 'asia', 'oceania', 'middle east') then null
            when nullif(lower(btrim(coalesce(profile.region, ''))), '') = canonical.current_country_norm then null
            when nullif(lower(btrim(coalesce(profile.region, ''))), '') = lower(canonical.current_country_code_norm) then null
            else nullif(lower(btrim(coalesce(profile.region, ''))), '')
          end as candidate_region_norm,
          case
            when nullif(lower(btrim(coalesce(profile.city, ''))), '') is null then null
            when nullif(lower(btrim(coalesce(profile.city, ''))), '') in ('africa', 'north america', 'south america', 'europe', 'asia', 'oceania', 'middle east') then null
            when nullif(lower(btrim(coalesce(profile.city, ''))), '') = nullif(lower(btrim(coalesce(profile.region, ''))), '') then null
            when nullif(lower(btrim(coalesce(profile.city, ''))), '') = canonical.current_country_norm then null
            when nullif(lower(btrim(coalesce(profile.city, ''))), '') = lower(canonical.current_country_code_norm) then null
            when nullif(lower(btrim(coalesce(profile.city, ''))), '') ~ '(region|district|province|state|county|municipality|metropolitan)' then null
            else nullif(lower(btrim(coalesce(profile.city, ''))), '')
          end as candidate_city_norm,
          public.vibes_real_distance_km(
            my_lat,
            my_lon,
            profile.latitude,
            profile.longitude
          ) as raw_distance_km
        from canonical
      ) loc
      left join viewer_state
        on viewer_state.target_profile_id = profile.id
      left join public.profile_visibility_entitlements seed_entitlements
        on seed_entitlements.profile_id = profile.id
      left join public.profile_recommendation_quality_metrics seed_quality_metrics
        on seed_quality_metrics.profile_id = profile.id
      where profile.id <> p_user_id
        and profile.deleted_at is null
        and profile.profile_completed is true
        and coalesce(profile.discoverable_in_vibes, true) = true
        and coalesce(profile.matchmaking_mode, false) = false
        and (
          v_segment <> 'nearby'
          or (
            public.has_usable_vibes_coordinates(profile.latitude, profile.longitude)
            and profile.latitude between my_lat - v_nearby_lat_delta and my_lat + v_nearby_lat_delta
            and profile.longitude between my_lon - v_nearby_lon_delta and my_lon + v_nearby_lon_delta
          )
        )
        and (
          v_segment <> 'active_now'
          or (profile.last_active is not null and profile.last_active >= cutoff)
        )
        and (
          my_gender is null
          or my_gender not in ('MALE', 'FEMALE')
          or profile.gender is null
          or (my_gender = 'MALE' and profile.gender = 'FEMALE')
          or (my_gender = 'FEMALE' and profile.gender = 'MALE')
        )
        and (my_min_age is null or profile.age >= my_min_age)
        and (my_max_age is null or profile.age <= my_max_age)
        and not exists (
          select 1
          from public.swipes swipe_row
          where swipe_row.swiper_id = p_user_id
            and swipe_row.target_id = profile.id
            and swipe_row.action::text in ('LIKE', 'SUPERLIKE')
        )
        and not exists (
          select 1
          from public.swipes swipe_row
          where swipe_row.swiper_id = p_user_id
            and swipe_row.target_id = profile.id
            and swipe_row.action::text = 'PASS'
            and swipe_row.created_at >= now() - interval '7 days'
        )
        and not (
          coalesce(viewer_state.last_pass_at, '-infinity'::timestamptz) >= now() - interval '3 days'
          or (
            coalesce(viewer_state.pass_count, 0) >= 2
            and coalesce(viewer_state.last_pass_at, '-infinity'::timestamptz) >= now() - interval '21 days'
          )
        )
        and not exists (
          select 1
          from public.intent_requests request_row
          where request_row.status = 'pending'
            and request_row.expires_at > now()
            and (
              (request_row.actor_id = p_user_id and request_row.recipient_id = profile.id)
              or (request_row.actor_id = profile.id and request_row.recipient_id = p_user_id)
            )
        )
        and not exists (
          select 1
          from public.profile_signal_gestures gesture_row
          where gesture_row.status in ('sent', 'seen')
            and gesture_row.expires_at > now()
            and (
              (gesture_row.sender_profile_id = p_user_id and gesture_row.receiver_profile_id = profile.id)
              or (gesture_row.sender_profile_id = profile.id and gesture_row.receiver_profile_id = p_user_id)
            )
        )
        and not exists (
          select 1
          from public.matches match_row
          where match_row.status in ('PENDING', 'ACCEPTED')
            and (
              (match_row.user1_id = p_user_id and match_row.user2_id = profile.id)
              or (match_row.user1_id = profile.id and match_row.user2_id = p_user_id)
            )
        )
        and not exists (
          select 1
          from public.blocks block_row
          where (block_row.blocker_id = my_user_id and block_row.blocked_id = profile.user_id)
             or (block_row.blocker_id = profile.user_id and block_row.blocked_id = my_user_id)
        )
    ),
    seed_base as (
      select
        seed_base_raw.*,
        (seed_base_raw.raw_distance_km is not null) as has_real_distance,
        case
          when v_segment = 'nearby' then seed_base_raw.raw_distance_km
          else public.estimate_vibes_distance_km(
            seed_base_raw.raw_distance_km,
            seed_base_raw.same_city,
            seed_base_raw.same_region,
            seed_base_raw.same_country
          )
        end as distance_km
      from seed_base_raw
    ),
    seed_lanes as (
      select
        seed_base.*,
        case
          when seed_base.same_city then 'city'
          when seed_base.same_region then 'region'
          when seed_base.same_country then 'country'
          when seed_base.same_origin_country then 'origin'
          when seed_base.origin_residence_bridge then 'bridge'
          else 'global'
        end as locality_bucket,
        case
          when v_segment = 'nearby' then
            case
              when seed_base.distance_km is not null and seed_base.distance_km <= 10 then 'hyper_local'
              when seed_base.distance_km is not null and seed_base.distance_km <= 25 then 'local'
              when seed_base.distance_km is not null and seed_base.distance_km <= 100 then 'regional'
              when seed_base.distance_km is not null and seed_base.distance_km <= 250 then 'extended'
              else 'global'
            end
          when v_segment = 'active_now' then
            case
              when seed_base.last_active >= now() - interval '3 minutes' and seed_base.same_city then 'live_city'
              when seed_base.last_active >= now() - interval '10 minutes'
                and seed_base.distance_km is not null
                and seed_base.distance_km <= 25 then 'live_local'
              when seed_base.last_active >= now() - interval '10 minutes' then 'live_global'
              when seed_base.last_active >= now() - interval '30 minutes' and seed_base.same_region then 'warm_region'
              when seed_base.last_active >= now() - interval '30 minutes' then 'warm_global'
              when seed_base.distance_km is not null and seed_base.distance_km <= 100 then 'recent_local'
              else 'recent_global'
            end
          else
            case
              when seed_base.same_city or seed_base.same_region then 'local_core'
              when seed_base.same_country then 'local_country'
              when seed_base.same_origin_country or seed_base.origin_residence_bridge then 'origin_bridge'
              when seed_base.market_impressions < 8
                and (
                  seed_base.last_active >= now() - interval '24 hours'
                  or seed_base.market_quality_score >= 0.18
                  or seed_base.has_active_boost
                  or seed_base.premium_rank > 0
                  or seed_base.verification_level > 0
                  or seed_base.created_at >= now() - interval '14 days'
                ) then 'explore'
              when seed_base.market_quality_score >= 0.32 or seed_base.verification_level > 0 then 'proven_global'
              else 'global'
            end
        end as seed_lane
      from seed_base
      where v_segment <> 'nearby'
         or (
           seed_base.has_real_distance
           and seed_base.raw_distance_km <= v_nearby_radius_km
         )
    ),
    seed_ranked as (
      select
        seed_lanes.*,
        row_number() over (
          partition by seed_lanes.locality_bucket
          order by
            case when seed_lanes.distance_km is null then 1 else 0 end,
            seed_lanes.distance_km asc nulls last,
            seed_lanes.last_active desc nulls last,
            seed_lanes.updated_at desc
        ) as locality_rank,
        row_number() over (
          partition by seed_lanes.seed_lane
          order by
            case
              when v_segment = 'active_now' and seed_lanes.last_active >= now() - interval '3 minutes' then 0
              when v_segment = 'active_now' and seed_lanes.last_active >= now() - interval '10 minutes' then 1
              when v_segment = 'active_now' and seed_lanes.last_active >= now() - interval '30 minutes' then 2
              else 3
            end,
            case
              when seed_lanes.has_active_boost
                and seed_lanes.boost_audience_mode = 'second_look'
                and seed_lanes.same_looking_for
                then 0
              when seed_lanes.has_active_boost
                and seed_lanes.boost_audience_mode = 'intent_match'
                and seed_lanes.same_looking_for
                then 0
              else 1
            end,
            case
              when v_segment = 'for_you'
                and seed_lanes.locality_bucket in ('city', 'region', 'country')
                then seed_lanes.distance_km
            end asc nulls last,
            seed_lanes.market_quality_score desc,
            seed_lanes.last_active desc nulls last,
            case when seed_lanes.distance_km is null then 1 else 0 end,
            seed_lanes.distance_km asc nulls last,
            seed_lanes.updated_at desc
        ) as seed_lane_rank
      from seed_lanes
    )
    select seed_ranked.id
    from seed_ranked
    order by
      case when v_segment = 'nearby' and seed_ranked.distance_km is null then 1 else 0 end,
      case
        when v_segment = 'for_you' and seed_ranked.seed_lane = 'local_core'
          and seed_ranked.seed_lane_rank <= greatest(1, ceil(v_seed_limit * 0.24)::integer) then 0
        when v_segment = 'for_you' and seed_ranked.seed_lane = 'local_country'
          and seed_ranked.seed_lane_rank <= greatest(1, ceil(v_seed_limit * 0.16)::integer) then 1
        when v_segment = 'for_you' and seed_ranked.seed_lane = 'origin_bridge'
          and seed_ranked.seed_lane_rank <= greatest(1, ceil(v_seed_limit * 0.12)::integer) then 2
        when v_segment = 'for_you' and seed_ranked.seed_lane = 'explore'
          and seed_ranked.seed_lane_rank <= greatest(1, ceil(v_seed_limit * 0.12)::integer) then 3
        when v_segment = 'for_you' and seed_ranked.seed_lane = 'proven_global'
          and seed_ranked.seed_lane_rank <= greatest(1, ceil(v_seed_limit * 0.18)::integer) then 4
        when v_segment = 'for_you' and seed_ranked.seed_lane = 'global'
          and seed_ranked.seed_lane_rank <= greatest(1, ceil(v_seed_limit * 0.18)::integer) then 5
        when v_segment = 'for_you' then 6
        when v_segment = 'nearby' and seed_ranked.seed_lane = 'hyper_local'
          and seed_ranked.seed_lane_rank <= greatest(1, ceil(v_seed_limit * 0.36)::integer) then 0
        when v_segment = 'nearby' and seed_ranked.seed_lane = 'local'
          and seed_ranked.seed_lane_rank <= greatest(1, ceil(v_seed_limit * 0.28)::integer) then 1
        when v_segment = 'nearby' and seed_ranked.seed_lane = 'regional'
          and seed_ranked.seed_lane_rank <= greatest(1, ceil(v_seed_limit * 0.18)::integer) then 2
        when v_segment = 'nearby' and seed_ranked.seed_lane = 'extended'
          and seed_ranked.seed_lane_rank <= greatest(1, ceil(v_seed_limit * 0.12)::integer) then 3
        when v_segment = 'nearby' and seed_ranked.seed_lane = 'global'
          and seed_ranked.seed_lane_rank <= greatest(1, ceil(v_seed_limit * 0.06)::integer) then 4
        when v_segment = 'nearby' then 5
        when v_segment = 'active_now' and seed_ranked.seed_lane = 'live_city'
          and seed_ranked.seed_lane_rank <= greatest(1, ceil(v_seed_limit * 0.22)::integer) then 0
        when v_segment = 'active_now' and seed_ranked.seed_lane = 'live_local'
          and seed_ranked.seed_lane_rank <= greatest(1, ceil(v_seed_limit * 0.18)::integer) then 1
        when v_segment = 'active_now' and seed_ranked.seed_lane = 'live_global'
          and seed_ranked.seed_lane_rank <= greatest(1, ceil(v_seed_limit * 0.18)::integer) then 2
        when v_segment = 'active_now' and seed_ranked.seed_lane = 'warm_region'
          and seed_ranked.seed_lane_rank <= greatest(1, ceil(v_seed_limit * 0.14)::integer) then 3
        when v_segment = 'active_now' and seed_ranked.seed_lane = 'warm_global'
          and seed_ranked.seed_lane_rank <= greatest(1, ceil(v_seed_limit * 0.14)::integer) then 4
        when v_segment = 'active_now' and seed_ranked.seed_lane = 'recent_local'
          and seed_ranked.seed_lane_rank <= greatest(1, ceil(v_seed_limit * 0.08)::integer) then 5
        when v_segment = 'active_now' and seed_ranked.seed_lane = 'recent_global'
          and seed_ranked.seed_lane_rank <= greatest(1, ceil(v_seed_limit * 0.06)::integer) then 6
        when v_segment = 'active_now' then 7
        else 0
      end,
      case when v_segment in ('for_you', 'nearby', 'active_now') then seed_ranked.seed_lane_rank end asc,
      case when seed_ranked.has_active_boost and seed_ranked.boost_type = 'smart' then 0 else 1 end,
      case when v_segment = 'nearby' then seed_ranked.distance_km end asc nulls last,
      case
        when v_segment = 'for_you' then
          case seed_ranked.locality_bucket
            when 'city' then 0
            when 'region' then 1
            when 'country' then 2
            when 'origin' then 3
            when 'bridge' then 4
            else 5
          end
      end asc,
      case when v_segment = 'for_you' then seed_ranked.locality_rank end asc,
      case when v_segment = 'active_now' then seed_ranked.distance_km end asc nulls last,
      case
        when v_segment = 'for_you'
          and seed_ranked.locality_bucket in ('city', 'region', 'country')
          then seed_ranked.distance_km
      end asc nulls last,
      seed_ranked.last_active desc nulls last,
      seed_ranked.updated_at desc
    limit v_seed_limit
  ) seed;

  if coalesce(array_length(v_candidate_ids, 1), 0) = 0 then
    return;
  end if;

  return query
  with viewer_interests as (
    select interest_row.interest_id
    from public.profile_interests interest_row
    where interest_row.profile_id = p_user_id
  ),
  viewer_counts as (
    select count(*)::double precision as cnt
    from viewer_interests
  ),
  viewer_feedback as (
    select
      summary_row.target_profile_id,
      summary_row.seen_count,
      summary_row.profile_open_count,
      summary_row.full_open_count,
      summary_row.intro_count,
      summary_row.profile_saved_count,
      summary_row.signal_opened_count,
      summary_row.intent_opened_count,
      summary_row.positive_count,
      summary_row.pass_count,
      summary_row.undo_count,
      summary_row.avg_dwell_ms,
      summary_row.long_dwell_count,
      summary_row.last_event_at,
      summary_row.last_positive_at,
      summary_row.last_pass_at,
      summary_row.refreshed_at
    from public.viewer_profile_behavior_summary summary_row
    where summary_row.viewer_profile_id = p_user_id
      and summary_row.target_profile_id = any(v_candidate_ids)
  ),
  active_moments as (
    select distinct moment_row.user_id
    from public.moments moment_row
    where moment_row.user_id in (
      select distinct candidate_profile.user_id
      from public.profiles candidate_profile
      where candidate_profile.id = any(v_candidate_ids)
        and candidate_profile.deleted_at is null
    )
      and public.can_view_moment(moment_row.id)
  ),
  candidate_base_raw as (
    select
      profile.*,
      coalesce(entitlements.premium_plan, 'FREE') as premium_plan,
      coalesce(entitlements.premium_rank, 0) as premium_rank,
      entitlements.boost_ends_at,
      coalesce(entitlements.has_active_boost, false) as has_active_boost,
      coalesce(entitlements.boost_type, 'manual') as boost_type,
      coalesce(entitlements.boost_audience_mode, 'for_you') as boost_audience_mode,
      coalesce(entitlements.boost_focus_mode, 'profile') as boost_focus_mode,
      entitlements.refreshed_at as premium_snapshot_refreshed_at,
      quality_metrics.impressions_30d,
      quality_metrics.opens_30d,
      quality_metrics.positives_30d,
      quality_metrics.long_dwells_30d,
      quality_metrics.conversation_pairs_60d,
      quality_metrics.deep_conversation_pairs_60d,
      quality_metrics.accepted_matches_60d,
      quality_metrics.market_quality_score as market_quality_score_raw,
      quality_metrics.refreshed_at as quality_metrics_refreshed_at,
      loc.raw_distance_km,
      exists (
        select 1
        from active_moments active_moment
        where active_moment.user_id = profile.user_id
      ) as has_active_moment,
      (
        my_looking_for_norm is not null
        and nullif(lower(btrim(coalesce(profile.looking_for, ''))), '') = my_looking_for_norm
      ) as same_looking_for,
      (coalesce(profile.profile_video, '') <> '') as has_intro_media,
      (
        length(btrim(coalesce(profile.looking_for, ''))) >= 8
        or profile.relationship_compass is not null
      ) as has_intent_content,
      (
        my_city_norm is not null
        and loc.candidate_city_norm = my_city_norm
        and (
          (my_country_code_norm is not null and loc.candidate_country_code_norm is not null and loc.candidate_country_code_norm = my_country_code_norm)
          or (
            my_country_code_norm is null
            and loc.candidate_country_code_norm is null
            and my_country_norm is not null
            and loc.candidate_country_norm = my_country_norm
          )
        )
      ) as same_city,
      (
        my_region_norm is not null
        and loc.candidate_region_norm = my_region_norm
        and (
          (my_country_code_norm is not null and loc.candidate_country_code_norm is not null and loc.candidate_country_code_norm = my_country_code_norm)
          or (
            my_country_code_norm is null
            and loc.candidate_country_code_norm is null
            and my_country_norm is not null
            and loc.candidate_country_norm = my_country_norm
          )
        )
      ) as same_region,
      (
        (my_country_code_norm is not null and loc.candidate_country_code_norm is not null and loc.candidate_country_code_norm = my_country_code_norm)
        or (
          my_country_code_norm is null
          and loc.candidate_country_code_norm is null
          and my_country_norm is not null
          and loc.candidate_country_norm = my_country_norm
        )
      ) as same_country,
      (
        (my_origin_country_code_norm is not null and loc.candidate_origin_country_code_norm is not null and loc.candidate_origin_country_code_norm = my_origin_country_code_norm)
        or (
          my_origin_country_code_norm is null
          and loc.candidate_origin_country_code_norm is null
          and my_origin_country_norm is not null
          and loc.candidate_origin_country_norm = my_origin_country_norm
        )
      ) as same_origin_country,
      (
        (my_origin_country_code_norm is not null and loc.candidate_country_code_norm is not null and loc.candidate_country_code_norm = my_origin_country_code_norm)
        or (
          my_origin_country_code_norm is null
          and loc.candidate_country_code_norm is null
          and my_origin_country_norm is not null
          and loc.candidate_country_norm = my_origin_country_norm
        )
        or (
          my_country_code_norm is not null
          and loc.candidate_origin_country_code_norm is not null
          and loc.candidate_origin_country_code_norm = my_country_code_norm
        )
        or (
          my_country_code_norm is null
          and loc.candidate_origin_country_code_norm is null
          and my_country_norm is not null
          and loc.candidate_origin_country_norm = my_country_norm
        )
      ) as origin_residence_bridge,
      loc.candidate_is_diaspora,
      loc.candidate_city_group,
      loc.candidate_country_group,
      loc.candidate_region_group
    from public.profiles profile
    cross join lateral (
      with canonical as (
        select
          public.normalize_vibes_country_code(
            profile.current_country,
            profile.current_country_code
          ) as current_country_code_norm,
          nullif(lower(btrim(coalesce(
            public.normalize_vibes_country_name(
              profile.current_country,
              profile.current_country_code
            ),
            ''
          ))), '') as current_country_norm,
          public.normalize_vibes_country_code(
            profile.origin_country,
            profile.origin_country_code
          ) as origin_country_code_norm,
          nullif(lower(btrim(coalesce(
            public.normalize_vibes_country_name(
              profile.origin_country,
              profile.origin_country_code
            ),
            ''
          ))), '') as origin_country_norm
      )
      select
        canonical.current_country_code_norm as candidate_country_code_norm,
        canonical.current_country_norm as candidate_country_norm,
        case
          when canonical.origin_country_code_norm is not null
            then canonical.origin_country_code_norm
          when canonical.current_country_code_norm = 'GH'
            then 'GH'
          else null
        end as candidate_origin_country_code_norm,
        case
          when canonical.origin_country_norm is not null
            then canonical.origin_country_norm
          when canonical.current_country_norm = 'ghana'
            then 'ghana'
          else null
        end as candidate_origin_country_norm,
        case
          when nullif(lower(btrim(coalesce(profile.region, ''))), '') is null then null
          when nullif(lower(btrim(coalesce(profile.region, ''))), '') in ('africa', 'north america', 'south america', 'europe', 'asia', 'oceania', 'middle east') then null
          when nullif(lower(btrim(coalesce(profile.region, ''))), '') = canonical.current_country_norm then null
          when nullif(lower(btrim(coalesce(profile.region, ''))), '') = lower(canonical.current_country_code_norm) then null
          else nullif(lower(btrim(coalesce(profile.region, ''))), '')
        end as candidate_region_norm,
        case
          when nullif(lower(btrim(coalesce(profile.city, ''))), '') is null then null
          when nullif(lower(btrim(coalesce(profile.city, ''))), '') in ('africa', 'north america', 'south america', 'europe', 'asia', 'oceania', 'middle east') then null
          when nullif(lower(btrim(coalesce(profile.city, ''))), '') = nullif(lower(btrim(coalesce(profile.region, ''))), '') then null
          when nullif(lower(btrim(coalesce(profile.city, ''))), '') = canonical.current_country_norm then null
          when nullif(lower(btrim(coalesce(profile.city, ''))), '') = lower(canonical.current_country_code_norm) then null
          when nullif(lower(btrim(coalesce(profile.city, ''))), '') ~ '(region|district|province|state|county|municipality|metropolitan)' then null
          else nullif(lower(btrim(coalesce(profile.city, ''))), '')
        end as candidate_city_norm,
        public.vibes_real_distance_km(
          my_lat,
          my_lon,
          profile.latitude,
          profile.longitude
        ) as raw_distance_km,
        coalesce(
          case
            when nullif(lower(btrim(coalesce(profile.city, ''))), '') is null then null
            when nullif(lower(btrim(coalesce(profile.city, ''))), '') in ('africa', 'north america', 'south america', 'europe', 'asia', 'oceania', 'middle east') then null
            when nullif(lower(btrim(coalesce(profile.city, ''))), '') = nullif(lower(btrim(coalesce(profile.region, ''))), '') then null
            when nullif(lower(btrim(coalesce(profile.city, ''))), '') = canonical.current_country_norm then null
            when nullif(lower(btrim(coalesce(profile.city, ''))), '') = lower(canonical.current_country_code_norm) then null
            when nullif(lower(btrim(coalesce(profile.city, ''))), '') ~ '(region|district|province|state|county|municipality|metropolitan)' then null
            else nullif(lower(btrim(coalesce(profile.city, ''))), '')
          end,
          coalesce(
            case
              when nullif(lower(btrim(coalesce(profile.region, ''))), '') is null then null
              when nullif(lower(btrim(coalesce(profile.region, ''))), '') in ('africa', 'north america', 'south america', 'europe', 'asia', 'oceania', 'middle east') then null
              when nullif(lower(btrim(coalesce(profile.region, ''))), '') = canonical.current_country_norm then null
              when nullif(lower(btrim(coalesce(profile.region, ''))), '') = lower(canonical.current_country_code_norm) then null
              else nullif(lower(btrim(coalesce(profile.region, ''))), '')
            end,
            coalesce(
              canonical.current_country_code_norm,
              canonical.current_country_norm
            )
          ),
          '<<none>>'
        ) as candidate_city_group,
        coalesce(
          canonical.current_country_code_norm,
          canonical.current_country_norm,
          '<<none>>'
        ) as candidate_country_group,
        coalesce(
          case
            when nullif(lower(btrim(coalesce(profile.region, ''))), '') is null then null
            when nullif(lower(btrim(coalesce(profile.region, ''))), '') in ('africa', 'north america', 'south america', 'europe', 'asia', 'oceania', 'middle east') then null
            when nullif(lower(btrim(coalesce(profile.region, ''))), '') = canonical.current_country_norm then null
            when nullif(lower(btrim(coalesce(profile.region, ''))), '') = lower(canonical.current_country_code_norm) then null
            else nullif(lower(btrim(coalesce(profile.region, ''))), '')
          end,
          coalesce(
            canonical.current_country_code_norm,
            canonical.current_country_norm
          ),
          '<<none>>'
        ) as candidate_region_group,
        (
          (
            case
              when canonical.origin_country_code_norm is not null
                then canonical.origin_country_code_norm
              when canonical.current_country_code_norm = 'GH'
                then 'GH'
              else null
            end
          ) is not null
          and canonical.current_country_code_norm is not null
          and (
            case
              when canonical.origin_country_code_norm is not null
                then canonical.origin_country_code_norm
              when canonical.current_country_code_norm = 'GH'
                then 'GH'
              else null
            end
          ) <> canonical.current_country_code_norm
        ) as candidate_is_diaspora
      from canonical
    ) loc
    left join public.profile_visibility_entitlements entitlements
      on entitlements.profile_id = profile.id
    left join public.profile_recommendation_quality_metrics quality_metrics
      on quality_metrics.profile_id = profile.id
    where profile.id = any(v_candidate_ids)
      and profile.deleted_at is null
  ),
  candidate_base as (
    select candidate_scored.*
    from (
      select
        candidate_base_raw.*,
        (candidate_base_raw.raw_distance_km is not null) as has_real_distance,
        case
          when v_segment = 'nearby' then candidate_base_raw.raw_distance_km
          else public.estimate_vibes_distance_km(
            candidate_base_raw.raw_distance_km,
            candidate_base_raw.same_city,
            candidate_base_raw.same_region,
            candidate_base_raw.same_country
          )
        end as distance_km
      from candidate_base_raw
    ) candidate_scored
    where v_segment <> 'nearby'
       or (
         candidate_scored.has_real_distance
         and candidate_scored.raw_distance_km <= v_nearby_radius_km
       )
  ),
  scored as (
    select
      candidate_base.*,
      coalesce(viewer_feedback.seen_count, 0) as viewer_seen_count,
      coalesce(viewer_feedback.profile_open_count, 0) as viewer_opened_count,
      coalesce(viewer_feedback.full_open_count, 0) as viewer_full_open_count,
      coalesce(viewer_feedback.intro_count, 0) as viewer_intro_count,
      coalesce(viewer_feedback.profile_saved_count, 0) as viewer_saved_count,
      coalesce(viewer_feedback.signal_opened_count, 0) as viewer_signal_opened_count,
      coalesce(viewer_feedback.intent_opened_count, 0) as viewer_intent_opened_count,
      coalesce(viewer_feedback.positive_count, 0) as viewer_positive_count,
      coalesce(viewer_feedback.pass_count, 0) as viewer_pass_count,
      coalesce(viewer_feedback.undo_count, 0) as viewer_undo_count,
      coalesce(viewer_feedback.avg_dwell_ms, 0) as viewer_avg_dwell_ms,
      coalesce(viewer_feedback.long_dwell_count, 0) as viewer_long_dwell_count,
      viewer_feedback.last_event_at as viewer_last_event_at,
      viewer_feedback.last_positive_at as viewer_last_positive_at,
      viewer_feedback.last_pass_at as viewer_last_pass_at,
      viewer_feedback.refreshed_at as behavior_summary_refreshed_at,
      coalesce(candidate_base.impressions_30d, 0) as market_impressions,
      coalesce(candidate_base.opens_30d, 0) as market_opens,
      coalesce(candidate_base.positives_30d, 0) as market_positives,
      coalesce(candidate_base.long_dwells_30d, 0) as market_long_dwells,
      coalesce(candidate_base.conversation_pairs_60d, 0) as market_conversation_pairs,
      coalesce(candidate_base.deep_conversation_pairs_60d, 0) as market_deep_conversation_pairs,
      coalesce(candidate_base.accepted_matches_60d, 0) as market_accepted_matches,
      coalesce(
        coalesce(candidate_base.positives_30d, 0)::double precision
          / nullif(coalesce(candidate_base.impressions_30d, 0)::double precision, 0),
        0
      ) as market_positive_rate,
      (
        coalesce(candidate_base.impressions_30d, 0) < 8
        and (
          candidate_base.last_active >= now() - interval '24 hours'
          or coalesce(candidate_base.market_quality_score_raw, 0) >= 0.18
          or coalesce(candidate_base.has_active_boost, false)
          or coalesce(candidate_base.premium_rank, 0) > 0
          or coalesce(candidate_base.verification_level, 0) > 0
        )
      ) as exploration_candidate,
      (
        with target_counts as (
          select count(*)::double precision as cnt
          from public.profile_interests target_interest
          where target_interest.profile_id = candidate_base.id
        ),
        shared as (
          select count(*)::double precision as cnt
          from public.profile_interests target_interest
          join viewer_interests viewer_interest
            on viewer_interest.interest_id = target_interest.interest_id
          where target_interest.profile_id = candidate_base.id
        )
        select
          case
            when (select viewer_counts.cnt from viewer_counts) <= 0 and (select target_counts.cnt from target_counts) <= 0 then 0.20
            else (select shared.cnt from shared)
              / greatest(
                  (select viewer_counts.cnt from viewer_counts) +
                  (select target_counts.cnt from target_counts) -
                  (select shared.cnt from shared),
                  1
                )
          end
      ) as interest_score,
      (
        case
          when candidate_base.distance_km is null then 0.40
          when candidate_base.distance_km <= 10 then 1
          when candidate_base.distance_km <= 25 then 0.94
          when candidate_base.distance_km <= 100 then 0.80
          when candidate_base.distance_km <= 500 then 0.55
          when candidate_base.distance_km <= 2000 then 0.28
          else 0.10
        end
      ) as distance_score,
      (
        case
          when candidate_base.last_active is not null and candidate_base.last_active >= now() - interval '3 minutes' then 1
          when candidate_base.last_active is not null and candidate_base.last_active >= now() - interval '15 minutes' then 0.84
          when candidate_base.last_active is not null and candidate_base.last_active >= now() - interval '60 minutes' then 0.60
          when candidate_base.last_active is not null and candidate_base.last_active >= now() - interval '24 hours' then 0.28
          else 0
        end
      ) as activity_score,
      least(coalesce(candidate_base.verification_level, 0), 3)::double precision / 3 as verification_score,
      (
        (case when coalesce(candidate_base.profile_video, '') <> '' then 0.38 else 0 end) +
        (case
           when length(coalesce(candidate_base.bio, '')) >= 80 then 0.26
           when length(coalesce(candidate_base.bio, '')) >= 30 then 0.13
           else 0
         end) +
        (case when candidate_base.has_active_moment then 0.28 else 0 end)
      ) as richness_score,
      (
        case
          when candidate_base.same_city then 1.00
          when candidate_base.same_region then 0.84
          when candidate_base.same_country then 0.70
          when candidate_base.distance_km is not null and candidate_base.distance_km <= 50 then 0.58
          when candidate_base.distance_km is not null and candidate_base.distance_km <= 250 then 0.34
          else 0
        end
      ) as geo_affinity_score,
      (
        case
          when candidate_base.same_city then 0
          when candidate_base.same_region then 1
          when candidate_base.same_country then 2
          else 3
        end
      ) as geo_bucket,
      (
        case
          when candidate_base.same_origin_country and (my_is_diaspora or coalesce(candidate_base.candidate_is_diaspora, false)) then 1.00
          when candidate_base.same_origin_country then 0.82
          when candidate_base.origin_residence_bridge then 0.48
          else 0
        end
      ) as origin_affinity_score,
      coalesce(candidate_base.market_quality_score_raw, 0)::double precision as market_quality_score,
      (
        case candidate_base.premium_rank
          when 2 then 2.4
          when 1 then 1.1
          else 0
        end
      ) as premium_visibility_bonus
    from candidate_base
    left join viewer_feedback
      on viewer_feedback.target_profile_id = candidate_base.id
  ),
  boosted as (
    select
      boosted_base.*,
      (
        case
          when not boosted_base.has_active_boost then 0
          when boosted_base.boost_audience_mode = 'nearby' then
            case
              when v_segment = 'nearby'
                and boosted_base.distance_km is not null
                and boosted_base.distance_km <= 25 then 1.00
              when boosted_base.same_city then 1.00
              when boosted_base.same_region then 0.82
              when boosted_base.same_country then 0.58
              when boosted_base.distance_km is not null and boosted_base.distance_km <= 100 then 0.48
              else 0.12
            end
          when boosted_base.boost_audience_mode = 'active_now' then
            case
              when v_segment = 'active_now'
                and boosted_base.last_active >= now() - interval '10 minutes' then 1.00
              when boosted_base.last_active >= now() - interval '15 minutes' then 0.82
              when boosted_base.last_active >= now() - interval '60 minutes' then 0.56
              else 0.10
            end
          when boosted_base.boost_audience_mode = 'intent_match' then
            case
              when boosted_base.same_looking_for then 1.00
              when boosted_base.has_intent_content and boosted_base.viewer_intent_opened_count > 0 then 0.86
              when boosted_base.has_intent_content then 0.52
              else 0.14
            end
          when boosted_base.boost_audience_mode = 'second_look' then
            case
              when (
                boosted_base.viewer_saved_count > 0
                or boosted_base.viewer_opened_count > 0
                or boosted_base.viewer_signal_opened_count + boosted_base.viewer_intent_opened_count > 0
              )
                and boosted_base.viewer_pass_count = 0
                and coalesce(boosted_base.viewer_last_pass_at, '-infinity'::timestamptz) < now() - interval '21 days' then 1.00
              when boosted_base.viewer_seen_count >= 2
                and boosted_base.viewer_pass_count = 0 then 0.72
              else 0.12
            end
          else
            case
              when v_segment = 'for_you' then 1.00
              when boosted_base.same_city or boosted_base.same_region then 0.78
              when boosted_base.same_country then 0.54
              else 0.32
            end
        end
      ) as boost_audience_alignment,
      (
        case
          when not boosted_base.has_active_boost then 0
          when boosted_base.boost_focus_mode = 'intro' then
            case
              when boosted_base.has_intro_media and boosted_base.viewer_intro_count = 0 then 1.00
              when boosted_base.has_intro_media then 0.82
              else 0.10
            end
          when boosted_base.boost_focus_mode = 'intent' then
            case
              when boosted_base.same_looking_for then 1.00
              when boosted_base.has_intent_content and boosted_base.viewer_intent_opened_count = 0 then 0.88
              when boosted_base.has_intent_content then 0.70
              else 0.12
            end
          else
            case
              when boosted_base.has_intro_media or length(coalesce(boosted_base.bio, '')) >= 30 then 0.82
              else 0.56
            end
        end
      ) as boost_focus_alignment,
      (
        case
          when not boosted_base.has_active_boost then 0
          else
            (case when boosted_base.boost_type = 'smart' then 1.4 else 0.8 end)
            + (case when v_segment = 'for_you' then 1.8 when v_segment = 'active_now' then 1.4 else 1.2 end)
            + (
              case
                when boosted_base.boost_audience_mode = 'nearby' then
                  case
                    when v_segment = 'nearby'
                      and boosted_base.distance_km is not null
                      and boosted_base.distance_km <= 25 then 1.00
                    when boosted_base.same_city then 1.00
                    when boosted_base.same_region then 0.82
                    when boosted_base.same_country then 0.58
                    when boosted_base.distance_km is not null and boosted_base.distance_km <= 100 then 0.48
                    else 0.12
                  end
                when boosted_base.boost_audience_mode = 'active_now' then
                  case
                    when v_segment = 'active_now'
                      and boosted_base.last_active >= now() - interval '10 minutes' then 1.00
                    when boosted_base.last_active >= now() - interval '15 minutes' then 0.82
                    when boosted_base.last_active >= now() - interval '60 minutes' then 0.56
                    else 0.10
                  end
                when boosted_base.boost_audience_mode = 'intent_match' then
                  case
                    when boosted_base.same_looking_for then 1.00
                    when boosted_base.has_intent_content and boosted_base.viewer_intent_opened_count > 0 then 0.86
                    when boosted_base.has_intent_content then 0.52
                    else 0.14
                  end
                when boosted_base.boost_audience_mode = 'second_look' then
                  case
                    when (
                      boosted_base.viewer_saved_count > 0
                      or boosted_base.viewer_opened_count > 0
                      or boosted_base.viewer_signal_opened_count + boosted_base.viewer_intent_opened_count > 0
                    )
                      and boosted_base.viewer_pass_count = 0
                      and coalesce(boosted_base.viewer_last_pass_at, '-infinity'::timestamptz) < now() - interval '21 days' then 1.00
                    when boosted_base.viewer_seen_count >= 2
                      and boosted_base.viewer_pass_count = 0 then 0.72
                    else 0.12
                  end
                else
                  case
                    when v_segment = 'for_you' then 1.00
                    when boosted_base.same_city or boosted_base.same_region then 0.78
                    when boosted_base.same_country then 0.54
                    else 0.32
                  end
              end
            ) * (case when boosted_base.boost_type = 'smart' then 3.6 else 2.8 end)
            + (
              case
                when boosted_base.boost_focus_mode = 'intro' then
                  case
                    when boosted_base.has_intro_media and boosted_base.viewer_intro_count = 0 then 1.00
                    when boosted_base.has_intro_media then 0.82
                    else 0.10
                  end
                when boosted_base.boost_focus_mode = 'intent' then
                  case
                    when boosted_base.same_looking_for then 1.00
                    when boosted_base.has_intent_content and boosted_base.viewer_intent_opened_count = 0 then 0.88
                    when boosted_base.has_intent_content then 0.70
                    else 0.12
                  end
                else
                  case
                    when boosted_base.has_intro_media or length(coalesce(boosted_base.bio, '')) >= 30 then 0.82
                    else 0.56
                  end
              end
            ) * (case when boosted_base.boost_focus_mode = 'profile' then 1.2 else 1.8 end)
        end
      ) as boost_visibility_bonus
    from scored boosted_base
  ),
  ranked as (
    select
      boosted.*,
      (
        case v_segment
          when 'nearby' then
            100 * (
              0.28 * boosted.geo_affinity_score +
              0.26 * boosted.distance_score +
              0.16 * boosted.activity_score +
              0.12 * boosted.interest_score +
              0.03 * boosted.origin_affinity_score +
              0.08 * boosted.verification_score +
              0.05 * boosted.richness_score +
              0.02 * boosted.market_quality_score
            )
          when 'active_now' then
            100 * (
              0.27 * boosted.activity_score +
              0.23 * boosted.geo_affinity_score +
              0.17 * boosted.interest_score +
              0.06 * boosted.origin_affinity_score +
              0.11 * boosted.distance_score +
              0.08 * boosted.verification_score +
              0.07 * boosted.richness_score +
              0.01 * boosted.market_quality_score
            )
          else
            100 * (
              0.23 * boosted.interest_score +
              0.18 * boosted.geo_affinity_score +
              0.12 * boosted.origin_affinity_score +
              0.12 * boosted.activity_score +
              0.10 * boosted.distance_score +
              0.09 * boosted.verification_score +
              0.11 * boosted.richness_score +
              0.05 * boosted.market_quality_score
            )
        end
        + least(boosted.viewer_opened_count, 3) * 2.8
        + least(boosted.viewer_full_open_count, 3) * 1.8
        + least(boosted.viewer_intro_count, 2) * 2.0
        + least(boosted.viewer_saved_count, 2) * 3.2
        + least(boosted.viewer_signal_opened_count + boosted.viewer_intent_opened_count, 3) * 1.9
        + least(greatest(boosted.viewer_positive_count - boosted.viewer_undo_count, 0), 2) * 4.5
        + least(boosted.viewer_long_dwell_count, 3) * 1.4
        + least(boosted.viewer_avg_dwell_ms / 4000.0, 1.5) * 1.8
        + case
            when boosted.viewer_last_positive_at >= now() - interval '7 days' then 3.6
            when boosted.viewer_last_positive_at >= now() - interval '21 days' then 1.8
            else 0
          end
        + case
            when v_segment = 'for_you' and boosted.exploration_candidate then 2.2
            when v_segment = 'active_now' and boosted.exploration_candidate and boosted.activity_score >= 0.60 then 1.2
            when v_segment = 'nearby'
              and boosted.exploration_candidate
              and boosted.distance_km is not null
              and boosted.distance_km <= 25 then 0.9
            when boosted.market_impressions < 20 and boosted.market_quality_score >= 0.30 then 0.7
            else 0
          end
        + case
            when v_segment = 'active_now'
              and boosted.has_active_moment
              and boosted.last_active >= now() - interval '10 minutes' then 4.2
            when v_segment = 'active_now' and boosted.has_active_moment then 2.4
            else 0
          end
        + case
            when v_segment = 'active_now' and boosted.last_active >= now() - interval '3 minutes' then 4.0
            when v_segment = 'active_now' and boosted.last_active >= now() - interval '10 minutes' then 2.2
            when v_segment = 'active_now' and boosted.last_active >= now() - interval '20 minutes' then 0.9
            else 0
          end
        + case
            when v_segment = 'active_now' and boosted.distance_km is not null and boosted.distance_km <= 10 then 2.2
            when v_segment = 'active_now' and boosted.distance_km is not null and boosted.distance_km <= 25 then 1.2
            when v_segment = 'active_now' and boosted.distance_km is not null and boosted.distance_km <= 50 then 0.6
            else 0
          end
        - case
            when boosted.market_impressions >= 120
              and boosted.market_quality_score < 0.08
              and boosted.market_positive_rate < 0.04 then 3.0
            when boosted.market_impressions >= 60
              and boosted.market_quality_score < 0.10
              and boosted.market_positive_rate < 0.05 then 1.6
            else 0
          end
        - least(boosted.viewer_seen_count, 6) * 0.9
        - least(boosted.viewer_pass_count, 3) * 5.5
        - least(boosted.viewer_undo_count, 2) * 1.6
        - case
            when boosted.viewer_last_pass_at >= now() - interval '7 days' then 7.5
            when boosted.viewer_last_pass_at >= now() - interval '21 days' then 3.0
            else 0
          end
        + case
            when v_segment = 'for_you' and boosted.same_city then 12.0
            when v_segment = 'for_you' and boosted.same_region then 7.0
            when v_segment = 'for_you' and boosted.same_country then 4.4
            when v_segment = 'for_you' and boosted.same_origin_country and (my_is_diaspora or coalesce(boosted.candidate_is_diaspora, false)) then 5.5
            when v_segment = 'for_you' and boosted.same_origin_country then 2.8
            when v_segment = 'for_you' and boosted.origin_residence_bridge then 1.5
            when v_segment = 'active_now' and boosted.same_city then 6.0
            when v_segment = 'active_now' and boosted.same_region then 3.5
            when v_segment = 'active_now' and boosted.same_country then 2.2
            when v_segment = 'active_now' and boosted.same_origin_country then 1.6
            when v_segment = 'nearby' and boosted.same_city then 5.0
            when v_segment = 'nearby' and boosted.same_region then 2.5
            when v_segment = 'nearby' and boosted.same_origin_country then 1.0
            else 0
          end
        + case
            when v_segment = 'for_you' and boosted.same_looking_for then 2.4
            when v_segment = 'active_now' and boosted.same_looking_for then 1.2
            else 0
          end
        + case
            when boosted.market_impressions < 8 then 1.9
            when boosted.market_impressions < 20 then 0.9
            else 0
          end
        + boosted.premium_visibility_bonus
        + boosted.boost_visibility_bonus
        + ((abs(hashtext(boosted.id::text || current_date::text)) % 100)::double precision / 100.0) * 2.4
      ) as final_score
    from boosted
  ),
  diversified as (
    select
      ranked.*,
      row_number() over (
        partition by ranked.candidate_city_group
        order by ranked.final_score desc, ranked.last_active desc nulls last, ranked.updated_at desc
      ) as city_rank,
      row_number() over (
        partition by ranked.candidate_country_group
        order by ranked.final_score desc, ranked.last_active desc nulls last, ranked.updated_at desc
      ) as country_rank,
      row_number() over (
        partition by ranked.candidate_region_group
        order by ranked.final_score desc, ranked.last_active desc nulls last, ranked.updated_at desc
      ) as region_rank
    from ranked
  ),
  ordered as (
    select
      diversified.*,
      (
        diversified.final_score
        - case
            when v_segment = 'for_you' then
              greatest(diversified.city_rank - 2, 0) * 0.55
              + greatest(diversified.region_rank - 3, 0) * 0.22
              + greatest(diversified.country_rank - 4, 0) * 0.18
            when v_segment = 'active_now' then
              greatest(diversified.city_rank - 2, 0) * 0.30
              + greatest(diversified.region_rank - 3, 0) * 0.18
            else
              greatest(diversified.city_rank - 3, 0) * 0.16
              + greatest(diversified.region_rank - 4, 0) * 0.10
          end
      ) as adjusted_score
    from diversified
  )
  select
    ordered.id,
    ordered.user_id,
    ordered.full_name,
    ordered.age,
    ordered.bio,
    ordered.avatar_url,
    ordered.profile_video,
    ordered.location,
    ordered.latitude,
    ordered.longitude,
    ordered.region,
    ordered.tribe,
    ordered.religion::text as religion,
    ordered.personality_type,
    (ordered.last_active is not null and ordered.last_active >= now() - interval '15 minutes') as is_active,
    (ordered.last_active is not null and ordered.last_active >= now() - interval '3 minutes') as online,
    ordered.last_active,
    (coalesce(ordered.verification_level, 0) > 0) as verified,
    ordered.verification_level,
    least(100, greatest(0, round(ordered.adjusted_score)))::numeric as ai_score,
    ordered.distance_km,
    ordered.city,
    ordered.current_country,
    ordered.current_country_code,
    ordered.location_precision::text as location_precision,
    jsonb_build_object(
      'version', 'v4',
      'segment', v_segment,
      'premium_plan', ordered.premium_plan,
      'has_active_boost', ordered.has_active_boost,
      'boost_ends_at', ordered.boost_ends_at,
      'boost_type', ordered.boost_type,
      'boost_audience_mode', ordered.boost_audience_mode,
      'boost_focus_mode', ordered.boost_focus_mode,
      'subscription_visibility_score', null,
      'public_reasons', to_jsonb(array_remove(array[
        case when ordered.interest_score >= 0.25 then 'shared_interests' end,
        case when ordered.activity_score >= 0.60 then 'recently_active' end,
        case when ordered.same_city then 'same_city' end,
        case when not ordered.same_city and ordered.same_region then 'same_region' end,
        case when ordered.same_origin_country then 'shared_origin' end,
        case when ordered.same_looking_for then 'same_looking_for' end,
        case when ordered.has_active_moment then 'active_moment' end,
        case when ordered.has_active_boost then 'boosted' end,
        case when ordered.premium_plan in ('SILVER', 'GOLD') then 'premium' end
      ]::text[], null))
    ) as recommendation_reasons
  from ordered
  order by
    case when v_segment = 'nearby' and ordered.distance_km is null then 1 else 0 end,
    ordered.adjusted_score desc,
    case when v_segment = 'for_you' then ordered.geo_bucket else 3 end asc,
    ordered.distance_km asc nulls last,
    ordered.last_active desc nulls last,
    ordered.updated_at desc
  limit v_limit;
end;
$$;
