-- Build the production V4 Vibes behavior learning engine without changing the client payload shape.
-- Goals:
-- 1) keep the existing RPC contract stable for the app
-- 2) move expensive global behavior scans out of the request path
-- 3) keep subscription / boost visibility meaningful but secondary to fit and trust
-- 4) fix boost semantics to follow the stored profile id in public.profile_boosts.user_id
-- 5) support trigger-driven freshness plus a service-role repair / backfill job

drop function if exists public.rpc_get_profile_card_context(uuid[]);
drop function if exists public.rpc_get_profile_card_context(uuid[], boolean);

create table if not exists public.profile_visibility_entitlements (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  premium_plan text not null default 'FREE',
  premium_rank integer not null default 0,
  has_active_boost boolean not null default false,
  boost_ends_at timestamptz,
  profile_created_at timestamptz,
  refreshed_at timestamptz not null default timezone('utc'::text, now()),
  constraint profile_visibility_entitlements_plan_check
    check (premium_plan in ('FREE', 'SILVER', 'GOLD')),
  constraint profile_visibility_entitlements_rank_check
    check (premium_rank between 0 and 2)
);

alter table public.profile_visibility_entitlements enable row level security;

create index if not exists idx_profile_visibility_entitlements_rank
  on public.profile_visibility_entitlements (premium_rank desc, refreshed_at desc);

create index if not exists idx_profile_visibility_entitlements_boost
  on public.profile_visibility_entitlements (has_active_boost, boost_ends_at desc);

create table if not exists public.profile_recommendation_quality_metrics (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  impressions_30d integer not null default 0,
  opens_30d integer not null default 0,
  positives_30d integer not null default 0,
  long_dwells_30d integer not null default 0,
  conversation_pairs_60d integer not null default 0,
  deep_conversation_pairs_60d integer not null default 0,
  accepted_matches_60d integer not null default 0,
  market_quality_score numeric not null default 0,
  refreshed_at timestamptz not null default timezone('utc'::text, now())
);

alter table public.profile_recommendation_quality_metrics enable row level security;

create index if not exists idx_profile_recommendation_quality_metrics_score
  on public.profile_recommendation_quality_metrics (market_quality_score desc, refreshed_at desc);

create table if not exists public.viewer_profile_behavior_summary (
  viewer_profile_id uuid not null references public.profiles (id) on delete cascade,
  target_profile_id uuid not null references public.profiles (id) on delete cascade,
  seen_count integer not null default 0,
  profile_open_count integer not null default 0,
  full_open_count integer not null default 0,
  intro_count integer not null default 0,
  profile_saved_count integer not null default 0,
  signal_opened_count integer not null default 0,
  intent_opened_count integer not null default 0,
  positive_count integer not null default 0,
  pass_count integer not null default 0,
  undo_count integer not null default 0,
  avg_dwell_ms double precision not null default 0,
  long_dwell_count integer not null default 0,
  last_event_at timestamptz,
  last_positive_at timestamptz,
  last_pass_at timestamptz,
  refreshed_at timestamptz not null default timezone('utc'::text, now()),
  primary key (viewer_profile_id, target_profile_id)
);

alter table public.viewer_profile_behavior_summary enable row level security;

create index if not exists idx_viewer_profile_behavior_summary_target
  on public.viewer_profile_behavior_summary (target_profile_id, refreshed_at desc);

create table if not exists public.vibes_v4_metric_refresh_queue (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  visibility_dirty boolean not null default false,
  quality_dirty boolean not null default false,
  viewer_behavior_dirty boolean not null default false,
  reason text,
  requested_at timestamptz not null default timezone('utc'::text, now()),
  locked_at timestamptz,
  processed_at timestamptz,
  attempts integer not null default 0,
  last_error text
);

alter table public.vibes_v4_metric_refresh_queue enable row level security;

create index if not exists idx_vibes_v4_metric_refresh_queue_quality
  on public.vibes_v4_metric_refresh_queue (quality_dirty, requested_at asc)
  where quality_dirty = true and locked_at is null;

create index if not exists idx_vibes_v4_metric_refresh_queue_visibility
  on public.vibes_v4_metric_refresh_queue (visibility_dirty, requested_at asc)
  where visibility_dirty = true and locked_at is null;

create index if not exists idx_vibes_v4_metric_refresh_queue_requested
  on public.vibes_v4_metric_refresh_queue (requested_at asc);

create or replace function public.normalize_vibes_country_code(
  p_country text,
  p_country_code text
)
returns text
language sql
immutable
set search_path = public, pg_catalog
as $$
  select
    case lower(nullif(btrim(coalesce(p_country, '')), ''))
      when 'ghana' then 'GH'
      when 'united kingdom' then 'GB'
      when 'uk' then 'GB'
      when 'great britain' then 'GB'
      when 'england' then 'GB'
      when 'scotland' then 'GB'
      when 'wales' then 'GB'
      when 'united states' then 'US'
      when 'usa' then 'US'
      when 'united states of america' then 'US'
      when 'canada' then 'CA'
      when 'nigeria' then 'NG'
      when 'south africa' then 'ZA'
      when 'germany' then 'DE'
      when 'netherlands' then 'NL'
      when 'france' then 'FR'
      when 'spain' then 'ES'
      when 'italy' then 'IT'
      when 'australia' then 'AU'
      when 'united arab emirates' then 'AE'
      when 'uae' then 'AE'
      else nullif(upper(btrim(coalesce(p_country_code, ''))), '')
    end
$$;

create or replace function public.normalize_vibes_country_name(
  p_country text,
  p_country_code text
)
returns text
language sql
immutable
set search_path = public, pg_catalog
as $$
  select
    case
      when lower(nullif(btrim(coalesce(p_country, '')), '')) = 'ghana' then 'Ghana'
      when lower(nullif(btrim(coalesce(p_country, '')), '')) in ('united kingdom', 'uk', 'great britain', 'england', 'scotland', 'wales') then 'United Kingdom'
      when lower(nullif(btrim(coalesce(p_country, '')), '')) in ('united states', 'usa', 'united states of america') then 'United States'
      when lower(nullif(btrim(coalesce(p_country, '')), '')) = 'canada' then 'Canada'
      when lower(nullif(btrim(coalesce(p_country, '')), '')) = 'nigeria' then 'Nigeria'
      when lower(nullif(btrim(coalesce(p_country, '')), '')) = 'south africa' then 'South Africa'
      when lower(nullif(btrim(coalesce(p_country, '')), '')) = 'germany' then 'Germany'
      when lower(nullif(btrim(coalesce(p_country, '')), '')) = 'netherlands' then 'Netherlands'
      when lower(nullif(btrim(coalesce(p_country, '')), '')) = 'france' then 'France'
      when lower(nullif(btrim(coalesce(p_country, '')), '')) = 'spain' then 'Spain'
      when lower(nullif(btrim(coalesce(p_country, '')), '')) = 'italy' then 'Italy'
      when lower(nullif(btrim(coalesce(p_country, '')), '')) = 'australia' then 'Australia'
      when lower(nullif(btrim(coalesce(p_country, '')), '')) in ('united arab emirates', 'uae') then 'United Arab Emirates'
      when nullif(btrim(coalesce(p_country, '')), '') is not null then initcap(lower(btrim(p_country)))
      else
        case upper(nullif(btrim(coalesce(p_country_code, '')), ''))
          when 'GH' then 'Ghana'
          when 'GB' then 'United Kingdom'
          when 'US' then 'United States'
          when 'CA' then 'Canada'
          when 'NG' then 'Nigeria'
          when 'ZA' then 'South Africa'
          when 'DE' then 'Germany'
          when 'NL' then 'Netherlands'
          when 'FR' then 'France'
          when 'ES' then 'Spain'
          when 'IT' then 'Italy'
          when 'AU' then 'Australia'
          when 'AE' then 'United Arab Emirates'
          else null
        end
    end
$$;

create or replace function public.estimate_vibes_distance_km(
  p_distance_km double precision,
  p_same_city boolean,
  p_same_region boolean,
  p_same_country boolean
)
returns double precision
language sql
immutable
set search_path = public, pg_catalog
as $$
  select
    case
      when p_distance_km is not null then p_distance_km
      when coalesce(p_same_city, false) then 8::double precision
      when coalesce(p_same_region, false) then 45::double precision
      when coalesce(p_same_country, false) then 180::double precision
      else null::double precision
    end
$$;

create or replace function public.has_usable_vibes_coordinates(
  p_latitude double precision,
  p_longitude double precision
)
returns boolean
language sql
immutable
set search_path = public, pg_catalog
as $$
  select
    p_latitude is not null
    and p_longitude is not null
    and p_latitude between -90 and 90
    and p_longitude between -180 and 180
    and not (p_latitude = 0 and p_longitude = 0)
$$;

create or replace function public.vibes_real_distance_km(
  p_lat1 double precision,
  p_lon1 double precision,
  p_lat2 double precision,
  p_lon2 double precision
)
returns double precision
language sql
immutable
set search_path = public, pg_catalog
as $$
  select
    case
      when not public.has_usable_vibes_coordinates(p_lat1, p_lon1)
        or not public.has_usable_vibes_coordinates(p_lat2, p_lon2)
        then null::double precision
      else
        6371 * 2 * asin(
          sqrt(
            power(sin(radians((p_lat2 - p_lat1) / 2)), 2)
            + cos(radians(p_lat1))
            * cos(radians(p_lat2))
            * power(sin(radians((p_lon2 - p_lon1) / 2)), 2)
          )
        )
    end
$$;

create or replace function public.infer_vibes_location_coordinates(
  p_city text,
  p_region text,
  p_country text,
  p_country_code text
)
returns table (
  latitude double precision,
  longitude double precision
)
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  with input_normalized as (
    select
      public.normalize_vibes_country_code(p_country, p_country_code) as country_code_norm,
      nullif(lower(btrim(coalesce(
        public.normalize_vibes_country_name(p_country, p_country_code),
        ''
      ))), '') as country_norm,
      case
        when nullif(lower(btrim(coalesce(p_region, ''))), '') is null then null
        when nullif(lower(btrim(coalesce(p_region, ''))), '') in ('africa', 'north america', 'south america', 'europe', 'asia', 'oceania', 'middle east') then null
        when nullif(lower(btrim(coalesce(p_region, ''))), '') = nullif(lower(btrim(coalesce(
          public.normalize_vibes_country_name(p_country, p_country_code),
          ''
        ))), '') then null
        when public.normalize_vibes_country_code(p_country, p_country_code) is not null
          and nullif(lower(btrim(coalesce(p_region, ''))), '') = lower(public.normalize_vibes_country_code(p_country, p_country_code)) then null
        else nullif(lower(btrim(coalesce(p_region, ''))), '')
      end as region_norm,
      case
        when nullif(lower(btrim(coalesce(p_city, ''))), '') is null then null
        when nullif(lower(btrim(coalesce(p_city, ''))), '') in ('africa', 'north america', 'south america', 'europe', 'asia', 'oceania', 'middle east') then null
        when nullif(lower(btrim(coalesce(p_city, ''))), '') = nullif(lower(btrim(coalesce(p_region, ''))), '') then null
        when nullif(lower(btrim(coalesce(p_city, ''))), '') = nullif(lower(btrim(coalesce(
          public.normalize_vibes_country_name(p_country, p_country_code),
          ''
        ))), '') then null
        when public.normalize_vibes_country_code(p_country, p_country_code) is not null
          and nullif(lower(btrim(coalesce(p_city, ''))), '') = lower(public.normalize_vibes_country_code(p_country, p_country_code)) then null
        when nullif(lower(btrim(coalesce(p_city, ''))), '') ~ '(region|district|province|state|county|municipality|metropolitan)' then null
        else nullif(lower(btrim(coalesce(p_city, ''))), '')
      end as city_norm
  ),
  city_match as (
    select
      avg(profile.latitude)::double precision as latitude,
      avg(profile.longitude)::double precision as longitude,
      count(*)::integer as support_rows
    from public.profiles profile
    cross join input_normalized input
    cross join lateral (
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
        case
          when nullif(lower(btrim(coalesce(profile.city, ''))), '') is null then null
          when nullif(lower(btrim(coalesce(profile.city, ''))), '') in ('africa', 'north america', 'south america', 'europe', 'asia', 'oceania', 'middle east') then null
          when nullif(lower(btrim(coalesce(profile.city, ''))), '') = nullif(lower(btrim(coalesce(profile.region, ''))), '') then null
          when nullif(lower(btrim(coalesce(profile.city, ''))), '') = nullif(lower(btrim(coalesce(
            public.normalize_vibes_country_name(
              profile.current_country,
              profile.current_country_code
            ),
            ''
          ))), '') then null
          when public.normalize_vibes_country_code(profile.current_country, profile.current_country_code) is not null
            and nullif(lower(btrim(coalesce(profile.city, ''))), '') = lower(public.normalize_vibes_country_code(profile.current_country, profile.current_country_code)) then null
          when nullif(lower(btrim(coalesce(profile.city, ''))), '') ~ '(region|district|province|state|county|municipality|metropolitan)' then null
          else nullif(lower(btrim(coalesce(profile.city, ''))), '')
        end as city_norm
    ) normalized
    where profile.deleted_at is null
      and profile.latitude is not null
      and profile.longitude is not null
      and input.city_norm is not null
      and normalized.city_norm = input.city_norm
      and (
        (input.country_code_norm is not null and normalized.current_country_code_norm = input.country_code_norm)
        or (
          input.country_code_norm is null
          and normalized.current_country_code_norm is null
          and input.country_norm is not null
          and normalized.current_country_norm = input.country_norm
        )
      )
    having count(*) > 0
  ),
  region_match as (
    select
      avg(profile.latitude)::double precision as latitude,
      avg(profile.longitude)::double precision as longitude,
      count(*)::integer as support_rows
    from public.profiles profile
    cross join input_normalized input
    cross join lateral (
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
        case
          when nullif(lower(btrim(coalesce(profile.region, ''))), '') is null then null
          when nullif(lower(btrim(coalesce(profile.region, ''))), '') in ('africa', 'north america', 'south america', 'europe', 'asia', 'oceania', 'middle east') then null
          when nullif(lower(btrim(coalesce(profile.region, ''))), '') = nullif(lower(btrim(coalesce(
            public.normalize_vibes_country_name(
              profile.current_country,
              profile.current_country_code
            ),
            ''
          ))), '') then null
          when public.normalize_vibes_country_code(profile.current_country, profile.current_country_code) is not null
            and nullif(lower(btrim(coalesce(profile.region, ''))), '') = lower(public.normalize_vibes_country_code(profile.current_country, profile.current_country_code)) then null
          else nullif(lower(btrim(coalesce(profile.region, ''))), '')
        end as region_norm
    ) normalized
    where profile.deleted_at is null
      and profile.latitude is not null
      and profile.longitude is not null
      and input.region_norm is not null
      and normalized.region_norm = input.region_norm
      and (
        (input.country_code_norm is not null and normalized.current_country_code_norm = input.country_code_norm)
        or (
          input.country_code_norm is null
          and normalized.current_country_code_norm is null
          and input.country_norm is not null
          and normalized.current_country_norm = input.country_norm
        )
      )
    having count(*) > 0
  ),
  country_match as (
    select
      avg(profile.latitude)::double precision as latitude,
      avg(profile.longitude)::double precision as longitude,
      count(*)::integer as support_rows
    from public.profiles profile
    cross join input_normalized input
    cross join lateral (
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
        ))), '') as current_country_norm
    ) normalized
    where profile.deleted_at is null
      and profile.latitude is not null
      and profile.longitude is not null
      and (
        (input.country_code_norm is not null and normalized.current_country_code_norm = input.country_code_norm)
        or (
          input.country_code_norm is null
          and normalized.current_country_code_norm is null
          and input.country_norm is not null
          and normalized.current_country_norm = input.country_norm
        )
      )
    having count(*) > 0
  )
  select match.latitude, match.longitude
  from (
    select 1 as priority, city_match.latitude, city_match.longitude, city_match.support_rows
    from city_match

    union all

    select 2 as priority, region_match.latitude, region_match.longitude, region_match.support_rows
    from region_match

    union all

    select 3 as priority, country_match.latitude, country_match.longitude, country_match.support_rows
    from country_match
  ) match
  where match.latitude is not null
    and match.longitude is not null
  order by match.priority asc, match.support_rows desc
  limit 1
$$;

create or replace function public.backfill_profile_country_codes(
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
  with source as (
    select
      profile.id,
      public.normalize_vibes_country_code(profile.current_country, profile.current_country_code) as next_current_country_code,
      public.normalize_vibes_country_code(profile.origin_country, profile.origin_country_code) as next_origin_country_code,
      case
        when nullif(btrim(coalesce(profile.current_country, '')), '') is null
          then public.normalize_vibes_country_name(profile.current_country, profile.current_country_code)
        else profile.current_country
      end as next_current_country,
      case
        when nullif(btrim(coalesce(profile.origin_country, '')), '') is null
          then public.normalize_vibes_country_name(profile.origin_country, profile.origin_country_code)
        else profile.origin_country
      end as next_origin_country
    from public.profiles profile
    where profile.deleted_at is null
      and (p_profile_ids is null or profile.id = any(p_profile_ids))
  ),
  updated as (
    update public.profiles profile
    set current_country_code = source.next_current_country_code,
        origin_country_code = source.next_origin_country_code,
        current_country = source.next_current_country,
        origin_country = source.next_origin_country,
        updated_at = timezone('utc'::text, now())
    from source
    where profile.id = source.id
      and (
        profile.current_country_code is distinct from source.next_current_country_code
        or profile.origin_country_code is distinct from source.next_origin_country_code
        or profile.current_country is distinct from source.next_current_country
        or profile.origin_country is distinct from source.next_origin_country
      )
    returning 1
  )
  select count(*) into v_rows
  from updated;

  return v_rows;
end;
$$;

create or replace function public.trg_normalize_profile_country_codes()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  new.current_country_code := public.normalize_vibes_country_code(
    new.current_country,
    new.current_country_code
  );
  new.origin_country_code := public.normalize_vibes_country_code(
    new.origin_country,
    new.origin_country_code
  );

  if nullif(btrim(coalesce(new.current_country, '')), '') is null then
    new.current_country := public.normalize_vibes_country_name(
      new.current_country,
      new.current_country_code
    );
  end if;

  if nullif(btrim(coalesce(new.origin_country, '')), '') is null then
    new.origin_country := public.normalize_vibes_country_name(
      new.origin_country,
      new.origin_country_code
    );
  end if;

  return new;
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
    select
      boost_row.user_id as profile_id,
      max(boost_row.ends_at) as boost_ends_at
    from public.profile_boosts boost_row
    where boost_row.ends_at > timezone('utc'::text, now())
      and (p_profile_ids is null or boost_row.user_id = any(p_profile_ids))
    group by boost_row.user_id
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
      source.profile_created_at,
      source.refreshed_at
    from source
    on conflict (profile_id) do update
      set user_id = excluded.user_id,
          premium_plan = excluded.premium_plan,
          premium_rank = excluded.premium_rank,
          has_active_boost = excluded.has_active_boost,
          boost_ends_at = excluded.boost_ends_at,
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

create or replace function public.refresh_profile_recommendation_quality_metrics(
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
  with scoped_profiles as (
    select
      profile.id,
      profile.user_id
    from public.profiles profile
    where profile.deleted_at is null
      and (p_profile_ids is null or profile.id = any(p_profile_ids))
  ),
  scoped_user_ids as (
    select coalesce(array_agg(distinct scoped_profiles.user_id), '{}'::uuid[]) as ids
    from scoped_profiles
  ),
  scoped_event_metrics as (
    select
      event_row.target_profile_id as profile_id,
      count(*) filter (where event_row.event_type = 'card_seen')::integer as impressions_30d,
      count(*) filter (
        where event_row.event_type in (
          'profile_opened', 'signal_opened', 'intent_opened', 'intro_played', 'intro_completed'
        )
      )::integer as opens_30d,
      count(*) filter (
        where event_row.event_type in ('like', 'signal_sent', 'intent_sent')
      )::integer as positives_30d,
      count(*) filter (where coalesce(event_row.dwell_ms, 0) >= 4000)::integer as long_dwells_30d
    from public.vibes_events event_row
    where event_row.created_at >= now() - interval '30 days'
      and (p_profile_ids is null or event_row.target_profile_id = any(p_profile_ids))
    group by event_row.target_profile_id
  ),
  recent_message_pairs as (
    select
      least(message_row.sender_id, message_row.receiver_id) as user_a,
      greatest(message_row.sender_id, message_row.receiver_id) as user_b,
      count(*)::integer as message_count
    from public.messages message_row
    cross join scoped_user_ids
    where message_row.created_at >= now() - interval '60 days'
      and (
        message_row.sender_id = any(scoped_user_ids.ids)
        or message_row.receiver_id = any(scoped_user_ids.ids)
      )
    group by 1, 2
  ),
  scoped_conversations as (
    select
      scoped_profiles.id as profile_id,
      count(*) filter (where recent_message_pairs.message_count >= 2)::integer as conversation_pairs_60d,
      count(*) filter (where recent_message_pairs.message_count >= 6)::integer as deep_conversation_pairs_60d
    from scoped_profiles
    left join recent_message_pairs
      on recent_message_pairs.user_a = scoped_profiles.user_id
      or recent_message_pairs.user_b = scoped_profiles.user_id
    group by scoped_profiles.id
  ),
  scoped_matches as (
    select
      paired.profile_id,
      count(*)::integer as accepted_matches_60d
    from (
      select match_row.user1_id as profile_id
      from public.matches match_row
      where match_row.status = 'ACCEPTED'
        and match_row.updated_at >= now() - interval '60 days'
        and (p_profile_ids is null or match_row.user1_id = any(p_profile_ids))

      union all

      select match_row.user2_id as profile_id
      from public.matches match_row
      where match_row.status = 'ACCEPTED'
        and match_row.updated_at >= now() - interval '60 days'
        and (p_profile_ids is null or match_row.user2_id = any(p_profile_ids))
    ) paired
    group by paired.profile_id
  ),
  source as (
    select
      scoped_profiles.id as profile_id,
      coalesce(scoped_event_metrics.impressions_30d, 0) as impressions_30d,
      coalesce(scoped_event_metrics.opens_30d, 0) as opens_30d,
      coalesce(scoped_event_metrics.positives_30d, 0) as positives_30d,
      coalesce(scoped_event_metrics.long_dwells_30d, 0) as long_dwells_30d,
      coalesce(scoped_conversations.conversation_pairs_60d, 0) as conversation_pairs_60d,
      coalesce(scoped_conversations.deep_conversation_pairs_60d, 0) as deep_conversation_pairs_60d,
      coalesce(scoped_matches.accepted_matches_60d, 0) as accepted_matches_60d,
      least(
        (
          coalesce(scoped_event_metrics.opens_30d, 0) +
          coalesce(scoped_event_metrics.positives_30d, 0) * 1.6 +
          coalesce(scoped_event_metrics.long_dwells_30d, 0) * 0.7 +
          coalesce(scoped_conversations.conversation_pairs_60d, 0) * 1.8 +
          coalesce(scoped_conversations.deep_conversation_pairs_60d, 0) * 2.4 +
          coalesce(scoped_matches.accepted_matches_60d, 0) * 2.1
        ) / greatest(coalesce(scoped_event_metrics.impressions_30d, 0), 12),
        1.25
      )::numeric as market_quality_score,
      timezone('utc'::text, now()) as refreshed_at
    from scoped_profiles
    left join scoped_event_metrics
      on scoped_event_metrics.profile_id = scoped_profiles.id
    left join scoped_conversations
      on scoped_conversations.profile_id = scoped_profiles.id
    left join scoped_matches
      on scoped_matches.profile_id = scoped_profiles.id
  ),
  upserted as (
    insert into public.profile_recommendation_quality_metrics (
      profile_id,
      impressions_30d,
      opens_30d,
      positives_30d,
      long_dwells_30d,
      conversation_pairs_60d,
      deep_conversation_pairs_60d,
      accepted_matches_60d,
      market_quality_score,
      refreshed_at
    )
    select
      source.profile_id,
      source.impressions_30d,
      source.opens_30d,
      source.positives_30d,
      source.long_dwells_30d,
      source.conversation_pairs_60d,
      source.deep_conversation_pairs_60d,
      source.accepted_matches_60d,
      source.market_quality_score,
      source.refreshed_at
    from source
    on conflict (profile_id) do update
      set impressions_30d = excluded.impressions_30d,
          opens_30d = excluded.opens_30d,
          positives_30d = excluded.positives_30d,
          long_dwells_30d = excluded.long_dwells_30d,
          conversation_pairs_60d = excluded.conversation_pairs_60d,
          deep_conversation_pairs_60d = excluded.deep_conversation_pairs_60d,
          accepted_matches_60d = excluded.accepted_matches_60d,
          market_quality_score = excluded.market_quality_score,
          refreshed_at = excluded.refreshed_at
    returning 1
  )
  select count(*) into v_rows
  from upserted;

  if p_profile_ids is null then
    delete from public.profile_recommendation_quality_metrics metrics
    where not exists (
      select 1
      from public.profiles profile
      where profile.id = metrics.profile_id
        and profile.deleted_at is null
    );
  end if;

  return v_rows;
end;
$$;

create or replace function public.refresh_viewer_profile_behavior_summary(
  p_viewer_profile_id uuid,
  p_target_profile_ids uuid[] default null
)
returns integer
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_rows integer := 0;
begin
  if p_viewer_profile_id is null then
    return 0;
  end if;

  if p_target_profile_ids is null then
    delete from public.viewer_profile_behavior_summary summary_row
    where summary_row.viewer_profile_id = p_viewer_profile_id;
  else
    delete from public.viewer_profile_behavior_summary summary_row
    where summary_row.viewer_profile_id = p_viewer_profile_id
      and summary_row.target_profile_id = any(p_target_profile_ids);
  end if;

  with source as (
    select
      event_row.target_profile_id,
      count(*) filter (where event_row.event_type = 'card_seen')::integer as seen_count,
      count(*) filter (where event_row.event_type = 'profile_opened')::integer as profile_open_count,
      count(*) filter (where event_row.event_type = 'full_profile_opened')::integer as full_open_count,
      count(*) filter (
        where event_row.event_type in ('intro_played', 'intro_completed')
      )::integer as intro_count,
      count(*) filter (where event_row.event_type = 'profile_saved')::integer as profile_saved_count,
      count(*) filter (where event_row.event_type = 'signal_opened')::integer as signal_opened_count,
      count(*) filter (where event_row.event_type = 'intent_opened')::integer as intent_opened_count,
      count(*) filter (
        where event_row.event_type in ('like', 'signal_sent', 'intent_sent')
      )::integer as positive_count,
      count(*) filter (where event_row.event_type = 'pass')::integer as pass_count,
      count(*) filter (where event_row.event_type = 'undo')::integer as undo_count,
      coalesce(
        (avg(event_row.dwell_ms) filter (where event_row.dwell_ms is not null))::double precision,
        0
      ) as avg_dwell_ms,
      count(*) filter (where coalesce(event_row.dwell_ms, 0) >= 4000)::integer as long_dwell_count,
      max(event_row.created_at) as last_event_at,
      max(event_row.created_at) filter (
        where event_row.event_type in ('like', 'signal_sent', 'intent_sent')
      ) as last_positive_at,
      max(event_row.created_at) filter (where event_row.event_type = 'pass') as last_pass_at,
      timezone('utc'::text, now()) as refreshed_at
    from public.vibes_events event_row
    where event_row.viewer_profile_id = p_viewer_profile_id
      and event_row.created_at >= now() - interval '60 days'
      and (p_target_profile_ids is null or event_row.target_profile_id = any(p_target_profile_ids))
    group by event_row.target_profile_id
  ),
  inserted as (
    insert into public.viewer_profile_behavior_summary (
      viewer_profile_id,
      target_profile_id,
      seen_count,
      profile_open_count,
      full_open_count,
      intro_count,
      profile_saved_count,
      signal_opened_count,
      intent_opened_count,
      positive_count,
      pass_count,
      undo_count,
      avg_dwell_ms,
      long_dwell_count,
      last_event_at,
      last_positive_at,
      last_pass_at,
      refreshed_at
    )
    select
      p_viewer_profile_id,
      source.target_profile_id,
      source.seen_count,
      source.profile_open_count,
      source.full_open_count,
      source.intro_count,
      source.profile_saved_count,
      source.signal_opened_count,
      source.intent_opened_count,
      source.positive_count,
      source.pass_count,
      source.undo_count,
      source.avg_dwell_ms,
      source.long_dwell_count,
      source.last_event_at,
      source.last_positive_at,
      source.last_pass_at,
      source.refreshed_at
    from source
    returning 1
  )
  select count(*) into v_rows
  from inserted;

  return v_rows;
end;
$$;

create or replace function public.enqueue_vibes_v4_metric_refresh(
  p_profile_id uuid,
  p_visibility_dirty boolean default false,
  p_quality_dirty boolean default false,
  p_viewer_behavior_dirty boolean default false,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  if p_profile_id is null then
    return;
  end if;

  insert into public.vibes_v4_metric_refresh_queue (
    profile_id,
    visibility_dirty,
    quality_dirty,
    viewer_behavior_dirty,
    reason,
    requested_at,
    locked_at,
    processed_at,
    last_error
  )
  values (
    p_profile_id,
    coalesce(p_visibility_dirty, false),
    coalesce(p_quality_dirty, false),
    coalesce(p_viewer_behavior_dirty, false),
    nullif(btrim(coalesce(p_reason, '')), ''),
    timezone('utc'::text, now()),
    null,
    null,
    null
  )
  on conflict (profile_id) do update
    set visibility_dirty = public.vibes_v4_metric_refresh_queue.visibility_dirty or excluded.visibility_dirty,
        quality_dirty = public.vibes_v4_metric_refresh_queue.quality_dirty or excluded.quality_dirty,
        viewer_behavior_dirty = public.vibes_v4_metric_refresh_queue.viewer_behavior_dirty or excluded.viewer_behavior_dirty,
        reason = coalesce(excluded.reason, public.vibes_v4_metric_refresh_queue.reason),
        requested_at = timezone('utc'::text, now()),
        locked_at = null,
        processed_at = null,
        last_error = null;
end;
$$;

create or replace function public.trg_refresh_profile_visibility_entitlements_from_profiles()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_profile_id uuid;
begin
  if tg_op = 'DELETE' then
    v_profile_id := old.id;
    if v_profile_id is null then
      return null;
    end if;

    delete from public.profile_visibility_entitlements ent where ent.profile_id = v_profile_id;
    delete from public.profile_recommendation_quality_metrics metrics where metrics.profile_id = v_profile_id;
    delete from public.vibes_v4_metric_refresh_queue queue_row where queue_row.profile_id = v_profile_id;
    return null;
  else
    v_profile_id := new.id;
  end if;

  if v_profile_id is null then
    return null;
  end if;

  if new.deleted_at is not null then
    delete from public.profile_visibility_entitlements ent where ent.profile_id = v_profile_id;
    delete from public.profile_recommendation_quality_metrics metrics where metrics.profile_id = v_profile_id;
    delete from public.vibes_v4_metric_refresh_queue queue_row where queue_row.profile_id = v_profile_id;
    return null;
  end if;

  perform public.refresh_profile_visibility_entitlements(array[v_profile_id]);
  return null;
end;
$$;

create or replace function public.trg_refresh_profile_visibility_entitlements_from_subscriptions()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_user_ids uuid[] := '{}'::uuid[];
  v_user_id uuid;
  v_profile_ids uuid[] := '{}'::uuid[];
  v_new_user_id uuid := null;
  v_old_user_id uuid := null;
begin
  if tg_op <> 'DELETE' then
    v_new_user_id := new.user_id;
  end if;
  if tg_op <> 'INSERT' then
    v_old_user_id := old.user_id;
  end if;

  select coalesce(array_agg(distinct changed.user_id), '{}'::uuid[])
    into v_user_ids
  from (
    values (v_new_user_id), (v_old_user_id)
  ) as changed(user_id)
  where changed.user_id is not null;

  foreach v_user_id in array v_user_ids loop
    select coalesce(array_agg(profile.id), '{}'::uuid[])
      into v_profile_ids
    from public.profiles profile
    where profile.user_id = v_user_id
      and profile.deleted_at is null;

    if coalesce(array_length(v_profile_ids, 1), 0) > 0 then
      perform public.refresh_profile_visibility_entitlements(v_profile_ids);
    end if;
  end loop;

  return null;
end;
$$;

create or replace function public.trg_refresh_profile_visibility_entitlements_from_boosts()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_profile_ids uuid[] := '{}'::uuid[];
  v_profile_id uuid;
  v_new_profile_id uuid := null;
  v_old_profile_id uuid := null;
begin
  if tg_op <> 'DELETE' then
    v_new_profile_id := new.user_id;
  end if;
  if tg_op <> 'INSERT' then
    v_old_profile_id := old.user_id;
  end if;

  select coalesce(array_agg(distinct changed.profile_id), '{}'::uuid[])
    into v_profile_ids
  from (
    values (v_new_profile_id), (v_old_profile_id)
  ) as changed(profile_id)
  where changed.profile_id is not null;

  foreach v_profile_id in array v_profile_ids loop
    perform public.refresh_profile_visibility_entitlements(array[v_profile_id]);
  end loop;

  return null;
end;
$$;

create or replace function public.trg_refresh_viewer_behavior_summary_from_vibes_events()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_changes record;
  v_new_viewer_profile_id uuid := null;
  v_new_target_profile_id uuid := null;
  v_old_viewer_profile_id uuid := null;
  v_old_target_profile_id uuid := null;
begin
  if tg_op <> 'DELETE' then
    v_new_viewer_profile_id := new.viewer_profile_id;
    v_new_target_profile_id := new.target_profile_id;
  end if;
  if tg_op <> 'INSERT' then
    v_old_viewer_profile_id := old.viewer_profile_id;
    v_old_target_profile_id := old.target_profile_id;
  end if;

  for v_changes in
    select distinct changed.viewer_profile_id, changed.target_profile_id
    from (
      values
        (v_new_viewer_profile_id, v_new_target_profile_id),
        (v_old_viewer_profile_id, v_old_target_profile_id)
    ) as changed(viewer_profile_id, target_profile_id)
    where changed.viewer_profile_id is not null
      and changed.target_profile_id is not null
  loop
    perform public.refresh_viewer_profile_behavior_summary(
      v_changes.viewer_profile_id,
      array[v_changes.target_profile_id]
    );
  end loop;

  return null;
end;
$$;

create or replace function public.trg_enqueue_profile_quality_metrics_from_vibes_events()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_profile_ids uuid[] := '{}'::uuid[];
  v_new_profile_id uuid := null;
  v_old_profile_id uuid := null;
begin
  if tg_op <> 'DELETE' then
    v_new_profile_id := new.target_profile_id;
  end if;
  if tg_op <> 'INSERT' then
    v_old_profile_id := old.target_profile_id;
  end if;

  select coalesce(array_agg(distinct changed.profile_id), '{}'::uuid[])
    into v_profile_ids
  from (
    values (v_new_profile_id), (v_old_profile_id)
  ) as changed(profile_id)
  where changed.profile_id is not null;

  if coalesce(array_length(v_profile_ids, 1), 0) > 0 then
    foreach v_new_profile_id in array v_profile_ids loop
      perform public.enqueue_vibes_v4_metric_refresh(
        v_new_profile_id,
        false,
        true,
        false,
        'vibes_events'
      );
    end loop;
  end if;

  return null;
end;
$$;

create or replace function public.trg_enqueue_profile_quality_metrics_from_messages()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_user_ids uuid[] := '{}'::uuid[];
  v_profile_ids uuid[] := '{}'::uuid[];
  v_new_sender_id uuid := null;
  v_new_receiver_id uuid := null;
  v_old_sender_id uuid := null;
  v_old_receiver_id uuid := null;
begin
  if tg_op <> 'DELETE' then
    v_new_sender_id := new.sender_id;
    v_new_receiver_id := new.receiver_id;
  end if;
  if tg_op <> 'INSERT' then
    v_old_sender_id := old.sender_id;
    v_old_receiver_id := old.receiver_id;
  end if;

  select coalesce(array_agg(distinct changed.user_id), '{}'::uuid[])
    into v_user_ids
  from (
    values
      (v_new_sender_id),
      (v_new_receiver_id),
      (v_old_sender_id),
      (v_old_receiver_id)
  ) as changed(user_id)
  where changed.user_id is not null;

  select coalesce(array_agg(profile.id), '{}'::uuid[])
    into v_profile_ids
  from public.profiles profile
  where profile.user_id = any(v_user_ids)
    and profile.deleted_at is null;

  if coalesce(array_length(v_profile_ids, 1), 0) > 0 then
    foreach v_new_sender_id in array v_profile_ids loop
      perform public.enqueue_vibes_v4_metric_refresh(
        v_new_sender_id,
        false,
        true,
        false,
        'messages'
      );
    end loop;
  end if;

  return null;
end;
$$;

create or replace function public.trg_enqueue_profile_quality_metrics_from_matches()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_profile_ids uuid[] := '{}'::uuid[];
  v_new_user1_id uuid := null;
  v_new_user2_id uuid := null;
  v_old_user1_id uuid := null;
  v_old_user2_id uuid := null;
begin
  if tg_op <> 'DELETE' then
    v_new_user1_id := new.user1_id;
    v_new_user2_id := new.user2_id;
  end if;
  if tg_op <> 'INSERT' then
    v_old_user1_id := old.user1_id;
    v_old_user2_id := old.user2_id;
  end if;

  select coalesce(array_agg(distinct changed.profile_id), '{}'::uuid[])
    into v_profile_ids
  from (
    values
      (v_new_user1_id),
      (v_new_user2_id),
      (v_old_user1_id),
      (v_old_user2_id)
  ) as changed(profile_id)
  where changed.profile_id is not null;

  if coalesce(array_length(v_profile_ids, 1), 0) > 0 then
    foreach v_new_user1_id in array v_profile_ids loop
      perform public.enqueue_vibes_v4_metric_refresh(
        v_new_user1_id,
        false,
        true,
        false,
        'matches'
      );
    end loop;
  end if;

  return null;
end;
$$;

create or replace function public.rpc_process_vibes_v4_jobs(
  p_visibility_limit integer default 500,
  p_quality_limit integer default 250,
  p_viewer_limit integer default 150,
  p_visibility_stale_after interval default interval '30 minutes',
  p_quality_stale_after interval default interval '6 hours',
  p_viewer_stale_after interval default interval '6 hours'
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_visibility_profile_ids uuid[] := '{}'::uuid[];
  v_quality_queued_profile_ids uuid[] := '{}'::uuid[];
  v_quality_stale_profile_ids uuid[] := '{}'::uuid[];
  v_quality_profile_ids uuid[] := '{}'::uuid[];
  v_viewer_profile_ids uuid[] := '{}'::uuid[];
  v_viewer_profile_id uuid;
  v_visibility_refreshed integer := 0;
  v_quality_refreshed integer := 0;
  v_viewer_refreshed integer := 0;
begin
  select coalesce(array_agg(stale.profile_id), '{}'::uuid[])
    into v_visibility_profile_ids
  from (
    select profile.id as profile_id
    from public.profiles profile
    left join public.profile_visibility_entitlements ent
      on ent.profile_id = profile.id
    where profile.deleted_at is null
      and (
        ent.profile_id is null
        or ent.refreshed_at < timezone('utc'::text, now()) - p_visibility_stale_after
      )
    order by ent.refreshed_at asc nulls first, profile.created_at asc
    limit greatest(1, least(coalesce(p_visibility_limit, 500), 5000))
  ) stale;

  if coalesce(array_length(v_visibility_profile_ids, 1), 0) > 0 then
    v_visibility_refreshed := public.refresh_profile_visibility_entitlements(v_visibility_profile_ids);
  end if;

  with queued as (
    select queue_row.profile_id
    from public.vibes_v4_metric_refresh_queue queue_row
    join public.profiles profile
      on profile.id = queue_row.profile_id
     and profile.deleted_at is null
    where queue_row.quality_dirty = true
      and (
        queue_row.locked_at is null
        or queue_row.locked_at < timezone('utc'::text, now()) - interval '30 minutes'
      )
    order by queue_row.requested_at asc
    for update of queue_row skip locked
    limit greatest(1, least(coalesce(p_quality_limit, 250), 5000))
  ),
  locked as (
    update public.vibes_v4_metric_refresh_queue queue_row
    set locked_at = timezone('utc'::text, now()),
        attempts = queue_row.attempts + 1,
        last_error = null
    from queued
    where queue_row.profile_id = queued.profile_id
    returning queue_row.profile_id
  )
  select coalesce(array_agg(locked.profile_id), '{}'::uuid[])
    into v_quality_queued_profile_ids
  from locked;

  if coalesce(array_length(v_quality_queued_profile_ids, 1), 0) < greatest(1, least(coalesce(p_quality_limit, 250), 5000)) then
    select coalesce(array_agg(stale.profile_id), '{}'::uuid[])
      into v_quality_stale_profile_ids
    from (
      select profile.id as profile_id
      from public.profiles profile
      left join public.profile_recommendation_quality_metrics metrics
        on metrics.profile_id = profile.id
      where profile.deleted_at is null
        and (
          metrics.profile_id is null
          or metrics.refreshed_at < timezone('utc'::text, now()) - p_quality_stale_after
        )
        and not (profile.id = any(v_quality_queued_profile_ids))
      order by metrics.refreshed_at asc nulls first, profile.created_at asc
      limit greatest(
        1,
        least(coalesce(p_quality_limit, 250), 5000) - coalesce(array_length(v_quality_queued_profile_ids, 1), 0)
      )
    ) stale;
  end if;

  select coalesce(array_agg(distinct selected.profile_id), '{}'::uuid[])
    into v_quality_profile_ids
  from (
    select unnest(v_quality_queued_profile_ids) as profile_id
    union
    select unnest(v_quality_stale_profile_ids) as profile_id
  ) selected;

  if coalesce(array_length(v_quality_profile_ids, 1), 0) > 0 then
    v_quality_refreshed := public.refresh_profile_recommendation_quality_metrics(v_quality_profile_ids);
  end if;

  if coalesce(array_length(v_quality_queued_profile_ids, 1), 0) > 0 then
    update public.vibes_v4_metric_refresh_queue queue_row
    set quality_dirty = false,
        processed_at = timezone('utc'::text, now()),
        locked_at = null,
        last_error = null
    where queue_row.profile_id = any(v_quality_queued_profile_ids);

    delete from public.vibes_v4_metric_refresh_queue queue_row
    where queue_row.profile_id = any(v_quality_queued_profile_ids)
      and queue_row.visibility_dirty = false
      and queue_row.quality_dirty = false
      and queue_row.viewer_behavior_dirty = false;
  end if;

  select coalesce(array_agg(stale.viewer_profile_id), '{}'::uuid[])
    into v_viewer_profile_ids
  from (
    with active_viewers as (
      select distinct event_row.viewer_profile_id
      from public.vibes_events event_row
      join public.profiles viewer
        on viewer.id = event_row.viewer_profile_id
       and viewer.deleted_at is null
      where event_row.viewer_profile_id is not null
        and event_row.created_at >= now() - interval '60 days'
    ),
    freshness as (
      select
        summary_row.viewer_profile_id,
        max(summary_row.refreshed_at) as refreshed_at
      from public.viewer_profile_behavior_summary summary_row
      group by summary_row.viewer_profile_id
    )
    select active_viewers.viewer_profile_id
    from active_viewers
    left join freshness
      on freshness.viewer_profile_id = active_viewers.viewer_profile_id
    where freshness.viewer_profile_id is null
       or freshness.refreshed_at < timezone('utc'::text, now()) - p_viewer_stale_after
    order by freshness.refreshed_at asc nulls first, active_viewers.viewer_profile_id
    limit greatest(1, least(coalesce(p_viewer_limit, 150), 2000))
  ) stale;

  foreach v_viewer_profile_id in array v_viewer_profile_ids loop
    v_viewer_refreshed := v_viewer_refreshed + public.refresh_viewer_profile_behavior_summary(v_viewer_profile_id, null);
  end loop;

  return jsonb_build_object(
    'visibility_profiles_selected', coalesce(array_length(v_visibility_profile_ids, 1), 0),
    'visibility_rows_refreshed', v_visibility_refreshed,
    'quality_queue_profiles_selected', coalesce(array_length(v_quality_queued_profile_ids, 1), 0),
    'quality_profiles_selected', coalesce(array_length(v_quality_profile_ids, 1), 0),
    'quality_rows_refreshed', v_quality_refreshed,
    'viewer_profiles_selected', coalesce(array_length(v_viewer_profile_ids, 1), 0),
    'viewer_rows_refreshed', v_viewer_refreshed
  );
end;
$$;

drop trigger if exists vibes_v4_refresh_visibility_from_profiles on public.profiles;
create trigger vibes_v4_refresh_visibility_from_profiles
after insert or update or delete on public.profiles
for each row
execute function public.trg_refresh_profile_visibility_entitlements_from_profiles();

drop trigger if exists normalize_profile_country_codes on public.profiles;
create trigger normalize_profile_country_codes
before insert or update of current_country, current_country_code, origin_country, origin_country_code
on public.profiles
for each row
execute function public.trg_normalize_profile_country_codes();

drop trigger if exists vibes_v4_refresh_visibility_from_subscriptions on public.subscriptions;
create trigger vibes_v4_refresh_visibility_from_subscriptions
after insert or update or delete on public.subscriptions
for each row
execute function public.trg_refresh_profile_visibility_entitlements_from_subscriptions();

drop trigger if exists vibes_v4_refresh_visibility_from_boosts on public.profile_boosts;
create trigger vibes_v4_refresh_visibility_from_boosts
after insert or update or delete on public.profile_boosts
for each row
execute function public.trg_refresh_profile_visibility_entitlements_from_boosts();

drop trigger if exists vibes_v4_refresh_behavior_from_vibes_events on public.vibes_events;
create trigger vibes_v4_refresh_behavior_from_vibes_events
after insert or update or delete on public.vibes_events
for each row
execute function public.trg_refresh_viewer_behavior_summary_from_vibes_events();

drop trigger if exists vibes_v4_refresh_quality_from_vibes_events on public.vibes_events;
create trigger vibes_v4_refresh_quality_from_vibes_events
after insert or update or delete on public.vibes_events
for each row
execute function public.trg_enqueue_profile_quality_metrics_from_vibes_events();

drop trigger if exists vibes_v4_refresh_quality_from_messages on public.messages;
create trigger vibes_v4_refresh_quality_from_messages
after insert or update or delete on public.messages
for each row
execute function public.trg_enqueue_profile_quality_metrics_from_messages();

drop trigger if exists vibes_v4_refresh_quality_from_matches on public.matches;
create trigger vibes_v4_refresh_quality_from_matches
after insert or update or delete on public.matches
for each row
execute function public.trg_enqueue_profile_quality_metrics_from_matches();

select public.backfill_profile_country_codes();

create or replace function public.rpc_get_profile_card_context(
  p_profile_ids uuid[],
  p_include_sandbox_preview boolean default false
)
returns table (
  profile_id uuid,
  premium_plan text,
  is_new_here boolean,
  interest_relevance_score integer,
  has_active_boost boolean,
  boost_ends_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_profile_ids uuid[] := '{}'::uuid[];
  v_viewer_profile_id uuid;
begin
  if auth.uid() is null then
    return;
  end if;

  select coalesce(array_agg(limited.profile_id), '{}'::uuid[])
    into v_profile_ids
  from (
    select distinct requested.profile_id
    from unnest(coalesce(p_profile_ids, '{}'::uuid[])) as requested(profile_id)
    where requested.profile_id is not null
    limit 80
  ) limited;

  if coalesce(array_length(v_profile_ids, 1), 0) = 0 then
    return;
  end if;

  select profile.id
    into v_viewer_profile_id
  from public.profiles profile
  where profile.user_id = auth.uid()
    and profile.deleted_at is null
  limit 1;

  if v_viewer_profile_id is null then
    return;
  end if;

  return query
  select
    profile.id as profile_id,
    case
      when coalesce(p_include_sandbox_preview, false)
        and public.is_admin_user(auth.uid())
        then public.get_subscription_badge_plan(profile.user_id, true)::text
      else coalesce(ent.premium_plan, 'FREE')
    end as premium_plan,
    coalesce(ent.profile_created_at, profile.created_at) > timezone('utc'::text, now()) - interval '14 days' as is_new_here,
    coalesce(
      public.profile_interest_score(
        coalesce(state.profile_open_count, 0),
        coalesce(state.full_open_count, 0),
        coalesce(state.intro_count, 0),
        coalesce(state.profile_saved_count, 0),
        greatest(coalesce(state.profile_open_count, 0) + coalesce(state.full_open_count, 0) - 1, 0),
        coalesce(state.intent_opened_count, 0)
      ),
      0
    ) as interest_relevance_score,
    coalesce(ent.has_active_boost, false) as has_active_boost,
    ent.boost_ends_at
  from public.profiles profile
  left join public.profile_visibility_entitlements ent
    on ent.profile_id = profile.id
  left join public.viewer_profile_behavior_summary state
    on state.viewer_profile_id = v_viewer_profile_id
   and state.target_profile_id = profile.id
  where profile.id = any(v_profile_ids)
    and profile.deleted_at is null
    and profile.id <> v_viewer_profile_id
    and profile.profile_completed is true
    and coalesce(profile.discoverable_in_vibes, true) = true
    and coalesce(profile.matchmaking_mode, false) = false
    and not exists (
      select 1
      from public.blocks block_row
      where (block_row.blocker_id = auth.uid() and block_row.blocked_id = profile.user_id)
         or (block_row.blocker_id = profile.user_id and block_row.blocked_id = auth.uid())
    );
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
  my_region_norm text;
  my_city_norm text;
  my_country_norm text;
  my_country_code_norm text;
  my_origin_country_norm text;
  my_origin_country_code_norm text;
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
    profile.origin_country_code
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
    my_origin_country_code
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
        coalesce(profile.verification_level, 0) as verification_level,
        loc.raw_distance_km,
        coalesce(seed_quality_metrics.impressions_30d, 0) as market_impressions,
        coalesce(seed_quality_metrics.market_quality_score, 0)::double precision as market_quality_score,
        coalesce(seed_entitlements.has_active_boost, false) as has_active_boost,
        coalesce(seed_entitlements.premium_rank, 0) as premium_rank,
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
      ) as premium_visibility_bonus,
      (
        case
          when not candidate_base.has_active_boost then 0
          when v_segment = 'for_you' then 5.6
          when v_segment = 'active_now' then 4.8
          else 3.8
        end
      ) as boost_visibility_bonus
    from candidate_base
    left join viewer_feedback
      on viewer_feedback.target_profile_id = candidate_base.id
  ),
  ranked as (
    select
      scored.*,
      (
        case v_segment
          when 'nearby' then
            100 * (
              0.28 * scored.geo_affinity_score +
              0.26 * scored.distance_score +
              0.16 * scored.activity_score +
              0.12 * scored.interest_score +
              0.03 * scored.origin_affinity_score +
              0.08 * scored.verification_score +
              0.05 * scored.richness_score +
              0.02 * scored.market_quality_score
            )
          when 'active_now' then
            100 * (
              0.27 * scored.activity_score +
              0.23 * scored.geo_affinity_score +
              0.17 * scored.interest_score +
              0.06 * scored.origin_affinity_score +
              0.11 * scored.distance_score +
              0.08 * scored.verification_score +
              0.07 * scored.richness_score +
              0.01 * scored.market_quality_score
            )
          else
            100 * (
              0.23 * scored.interest_score +
              0.18 * scored.geo_affinity_score +
              0.12 * scored.origin_affinity_score +
              0.12 * scored.activity_score +
              0.10 * scored.distance_score +
              0.09 * scored.verification_score +
              0.11 * scored.richness_score +
              0.05 * scored.market_quality_score
            )
        end
        + least(scored.viewer_opened_count, 3) * 2.8
        + least(scored.viewer_full_open_count, 3) * 1.8
        + least(scored.viewer_intro_count, 2) * 2.0
        + least(scored.viewer_saved_count, 2) * 3.2
        + least(scored.viewer_signal_opened_count + scored.viewer_intent_opened_count, 3) * 1.9
        + least(greatest(scored.viewer_positive_count - scored.viewer_undo_count, 0), 2) * 4.5
        + least(scored.viewer_long_dwell_count, 3) * 1.4
        + least(scored.viewer_avg_dwell_ms / 4000.0, 1.5) * 1.8
        + case
            when scored.viewer_last_positive_at >= now() - interval '7 days' then 3.6
            when scored.viewer_last_positive_at >= now() - interval '21 days' then 1.8
            else 0
          end
        + case
            when v_segment = 'for_you' and scored.exploration_candidate then 2.2
            when v_segment = 'active_now' and scored.exploration_candidate and scored.activity_score >= 0.60 then 1.2
            when v_segment = 'nearby'
              and scored.exploration_candidate
              and scored.distance_km is not null
              and scored.distance_km <= 25 then 0.9
            when scored.market_impressions < 20 and scored.market_quality_score >= 0.30 then 0.7
            else 0
          end
        + case
            when v_segment = 'active_now'
              and scored.has_active_moment
              and scored.last_active >= now() - interval '10 minutes' then 4.2
            when v_segment = 'active_now' and scored.has_active_moment then 2.4
            else 0
          end
        + case
            when v_segment = 'active_now' and scored.last_active >= now() - interval '3 minutes' then 4.0
            when v_segment = 'active_now' and scored.last_active >= now() - interval '10 minutes' then 2.2
            when v_segment = 'active_now' and scored.last_active >= now() - interval '20 minutes' then 0.9
            else 0
          end
        + case
            when v_segment = 'active_now' and scored.distance_km is not null and scored.distance_km <= 10 then 2.2
            when v_segment = 'active_now' and scored.distance_km is not null and scored.distance_km <= 25 then 1.2
            when v_segment = 'active_now' and scored.distance_km is not null and scored.distance_km <= 50 then 0.6
            else 0
          end
        - case
            when scored.market_impressions >= 120
              and scored.market_quality_score < 0.08
              and scored.market_positive_rate < 0.04 then 3.0
            when scored.market_impressions >= 60
              and scored.market_quality_score < 0.10
              and scored.market_positive_rate < 0.05 then 1.6
            else 0
          end
        - least(scored.viewer_seen_count, 6) * 0.9
        - least(scored.viewer_pass_count, 3) * 5.5
        - least(scored.viewer_undo_count, 2) * 1.6
        - case
            when scored.viewer_last_pass_at >= now() - interval '7 days' then 7.5
            when scored.viewer_last_pass_at >= now() - interval '21 days' then 3.0
            else 0
          end
        + case
            when v_segment = 'for_you' and scored.same_city then 12.0
            when v_segment = 'for_you' and scored.same_region then 7.0
            when v_segment = 'for_you' and scored.same_country then 4.4
            when v_segment = 'for_you' and scored.same_origin_country and (my_is_diaspora or coalesce(scored.candidate_is_diaspora, false)) then 5.5
            when v_segment = 'for_you' and scored.same_origin_country then 2.8
            when v_segment = 'for_you' and scored.origin_residence_bridge then 1.5
            when v_segment = 'active_now' and scored.same_city then 6.0
            when v_segment = 'active_now' and scored.same_region then 3.5
            when v_segment = 'active_now' and scored.same_country then 2.2
            when v_segment = 'active_now' and scored.same_origin_country then 1.6
            when v_segment = 'nearby' and scored.same_city then 5.0
            when v_segment = 'nearby' and scored.same_region then 2.5
            when v_segment = 'nearby' and scored.same_origin_country then 1.0
            else 0
          end
        + case
            when scored.market_impressions < 8 then 1.9
            when scored.market_impressions < 20 then 0.9
            else 0
          end
        + scored.premium_visibility_bonus
        + scored.boost_visibility_bonus
        + ((abs(hashtext(scored.id::text || current_date::text)) % 100)::double precision / 100.0) * 2.4
      ) as final_score
    from scored
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
      'subscription_visibility_score', null,
      'public_reasons', to_jsonb(array_remove(array[
        case when ordered.interest_score >= 0.25 then 'shared_interests' end,
        case when ordered.activity_score >= 0.60 then 'recently_active' end,
        case when ordered.same_city then 'same_city' end,
        case when not ordered.same_city and ordered.same_region then 'same_region' end,
        case when ordered.same_origin_country then 'shared_origin' end,
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

-- Staging EXPLAIN ANALYZE notes
-- Replace placeholder UUIDs with real staging IDs before running.
-- 1) Recommendation engine hot path
-- explain (analyze, buffers, verbose)
-- select *
-- from public.get_vibes_recommendations_v3(
--   '00000000-0000-0000-0000-000000000000'::uuid,
--   'for_you',
--   30,
--   30
-- );
--
-- 2) Profile-card context guardrails
-- explain (analyze, buffers, verbose)
-- select *
-- from public.rpc_get_profile_card_context(
--   array[
--     '00000000-0000-0000-0000-000000000001'::uuid,
--     '00000000-0000-0000-0000-000000000002'::uuid
--   ],
--   false
-- );
--
-- 3) Background worker
-- explain (analyze, buffers, verbose)
-- select public.rpc_process_vibes_v4_jobs(
--   500,
--   250,
--   150,
--   interval '30 minutes',
--   interval '6 hours',
--   interval '6 hours'
-- );

revoke all on function public.refresh_profile_visibility_entitlements(uuid[]) from public;
revoke all on function public.refresh_profile_recommendation_quality_metrics(uuid[]) from public;
revoke all on function public.refresh_viewer_profile_behavior_summary(uuid, uuid[]) from public;
revoke all on function public.enqueue_vibes_v4_metric_refresh(uuid, boolean, boolean, boolean, text) from public;
revoke all on function public.normalize_vibes_country_code(text, text) from public;
revoke all on function public.normalize_vibes_country_name(text, text) from public;
revoke all on function public.estimate_vibes_distance_km(double precision, boolean, boolean, boolean) from public;
revoke all on function public.has_usable_vibes_coordinates(double precision, double precision) from public;
revoke all on function public.vibes_real_distance_km(double precision, double precision, double precision, double precision) from public;
revoke all on function public.infer_vibes_location_coordinates(text, text, text, text) from public;
revoke all on function public.backfill_profile_country_codes(uuid[]) from public;
revoke all on function public.trg_normalize_profile_country_codes() from public;
revoke all on function public.trg_refresh_profile_visibility_entitlements_from_profiles() from public;
revoke all on function public.trg_refresh_profile_visibility_entitlements_from_subscriptions() from public;
revoke all on function public.trg_refresh_profile_visibility_entitlements_from_boosts() from public;
revoke all on function public.trg_refresh_viewer_behavior_summary_from_vibes_events() from public;
revoke all on function public.trg_enqueue_profile_quality_metrics_from_vibes_events() from public;
revoke all on function public.trg_enqueue_profile_quality_metrics_from_messages() from public;
revoke all on function public.trg_enqueue_profile_quality_metrics_from_matches() from public;
revoke all on function public.rpc_process_vibes_v4_jobs(integer, integer, integer, interval, interval, interval) from public;

revoke all on table public.profile_visibility_entitlements from public, anon, authenticated;
revoke all on table public.profile_recommendation_quality_metrics from public, anon, authenticated;
revoke all on table public.viewer_profile_behavior_summary from public, anon, authenticated;
revoke all on table public.vibes_v4_metric_refresh_queue from public, anon, authenticated;

revoke all on function public.rpc_get_profile_card_context(uuid[], boolean) from public;
grant execute on function public.rpc_get_profile_card_context(uuid[], boolean) to authenticated;

revoke all on function public.get_vibes_recommendations_v3(uuid, text, integer, integer) from public;
grant execute on function public.get_vibes_recommendations_v3(uuid, text, integer, integer) to authenticated;

grant execute on function public.rpc_process_vibes_v4_jobs(integer, integer, integer, interval, interval, interval) to service_role;
