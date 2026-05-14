-- Fix Vibes Recommendation Engine v2 return type.
-- profiles.location_precision is an enum in production, while the RPC contract
-- returns text for compatibility with existing recommendation clients.

create table if not exists public.vibes_events (
  id uuid primary key default gen_random_uuid(),
  viewer_user_id uuid not null references auth.users(id) on delete cascade,
  viewer_profile_id uuid not null references public.profiles(id) on delete cascade,
  target_profile_id uuid not null references public.profiles(id) on delete cascade,
  target_user_id uuid references auth.users(id) on delete cascade,
  segment text not null default 'for_you',
  event_type text not null,
  position integer null,
  dwell_ms integer null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc'::text, now()),
  constraint vibes_events_distinct_profiles check (viewer_profile_id <> target_profile_id),
  constraint vibes_events_segment_valid check (segment in ('for_you', 'nearby', 'active_now')),
  constraint vibes_events_type_valid check (event_type in (
    'card_seen',
    'profile_opened',
    'intro_played',
    'intro_completed',
    'pass',
    'like',
    'signal_opened',
    'signal_sent',
    'intent_opened',
    'intent_sent',
    'undo'
  )),
  constraint vibes_events_dwell_valid check (dwell_ms is null or dwell_ms >= 0)
);

create index if not exists vibes_events_viewer_created_idx
  on public.vibes_events (viewer_profile_id, created_at desc);

create index if not exists vibes_events_target_type_created_idx
  on public.vibes_events (target_profile_id, event_type, created_at desc);

create index if not exists vibes_events_pair_created_idx
  on public.vibes_events (viewer_profile_id, target_profile_id, created_at desc);

alter table public.vibes_events enable row level security;
revoke all on public.vibes_events from anon, authenticated;

drop function if exists public.rpc_log_vibes_event(uuid, uuid, text, text, integer, integer, jsonb);

create or replace function public.rpc_log_vibes_event(
  p_viewer_profile_id uuid,
  p_target_profile_id uuid,
  p_segment text default 'for_you',
  p_event_type text default 'card_seen',
  p_position integer default null,
  p_dwell_ms integer default null,
  p_metadata jsonb default '{}'::jsonb
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_viewer_user_id uuid;
  v_target_user_id uuid;
  v_segment text := coalesce(nullif(btrim(p_segment), ''), 'for_you');
  v_event_type text := coalesce(nullif(btrim(p_event_type), ''), 'card_seen');
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  if v_segment not in ('for_you', 'nearby', 'active_now') then
    raise exception 'invalid_vibes_segment';
  end if;

  if v_event_type not in (
    'card_seen',
    'profile_opened',
    'intro_played',
    'intro_completed',
    'pass',
    'like',
    'signal_opened',
    'signal_sent',
    'intent_opened',
    'intent_sent',
    'undo'
  ) then
    raise exception 'invalid_vibes_event_type';
  end if;

  if p_viewer_profile_id is null or p_target_profile_id is null or p_viewer_profile_id = p_target_profile_id then
    return false;
  end if;

  select p.user_id
    into v_viewer_user_id
  from public.profiles p
  where p.id = p_viewer_profile_id
  limit 1;

  if v_viewer_user_id is null or v_viewer_user_id <> auth.uid() then
    raise exception 'viewer profile does not belong to authenticated user';
  end if;

  select p.user_id
    into v_target_user_id
  from public.profiles p
  where p.id = p_target_profile_id
  limit 1;

  if v_target_user_id is null then
    return false;
  end if;

  insert into public.vibes_events (
    viewer_user_id,
    viewer_profile_id,
    target_profile_id,
    target_user_id,
    segment,
    event_type,
    position,
    dwell_ms,
    metadata
  )
  values (
    auth.uid(),
    p_viewer_profile_id,
    p_target_profile_id,
    v_target_user_id,
    v_segment,
    v_event_type,
    p_position,
    p_dwell_ms,
    coalesce(p_metadata, '{}'::jsonb)
  );

  return true;
end;
$$;

revoke all on function public.rpc_log_vibes_event(uuid, uuid, text, text, integer, integer, jsonb) from public;
grant execute on function public.rpc_log_vibes_event(uuid, uuid, text, text, integer, integer, jsonb) to authenticated;

drop function if exists public.get_vibes_recommendations_v2(uuid, text, integer, integer);

create or replace function public.get_vibes_recommendations_v2(
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
  v_segment text := coalesce(nullif(btrim(p_segment), ''), 'for_you');
  v_limit integer := greatest(1, least(coalesce(p_limit, 30), 80));
  cutoff timestamptz;
begin
  if auth.uid() is null then
    return;
  end if;

  if v_segment not in ('for_you', 'nearby', 'active_now') then
    v_segment := 'for_you';
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

  cutoff := now() - (greatest(5, least(coalesce(p_active_window_minutes, 30), 240)) || ' minutes')::interval;

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
  viewer_feedback as (
    select
      ve.target_profile_id,
      count(*) filter (where ve.event_type = 'card_seen')::integer as seen_count,
      count(*) filter (where ve.event_type = 'profile_opened')::integer as opened_count,
      count(*) filter (where ve.event_type in ('intro_played', 'intro_completed'))::integer as intro_count,
      count(*) filter (where ve.event_type in ('like', 'signal_sent', 'intent_sent'))::integer as positive_count,
      count(*) filter (where ve.event_type = 'pass')::integer as pass_count,
      max(ve.created_at) as last_event_at
    from public.vibes_events ve
    where ve.viewer_profile_id = p_user_id
      and ve.created_at >= now() - interval '45 days'
    group by ve.target_profile_id
  ),
  market_feedback as (
    select
      ve.target_profile_id,
      count(*) filter (where ve.event_type = 'card_seen')::double precision as impressions,
      count(*) filter (where ve.event_type = 'profile_opened')::double precision as opens,
      count(*) filter (where ve.event_type in ('like', 'signal_sent', 'intent_sent'))::double precision as positives
    from public.vibes_events ve
    where ve.created_at >= now() - interval '21 days'
    group by ve.target_profile_id
  ),
  active_moments as (
    select distinct m.user_id
    from public.moments m
    where m.is_deleted = false
      and m.expires_at > now()
      and m.visibility in ('public', 'matches', 'vibe_check_approved')
  ),
  candidate_base as (
    select
      p.*,
      (
        case
          when my_lat is null or my_lon is null or p.latitude is null or p.longitude is null then null::double precision
          else (6371 * 2 * asin(sqrt(
            power(sin(radians(p.latitude - my_lat) / 2), 2) +
            cos(radians(my_lat)) * cos(radians(p.latitude)) *
            power(sin(radians(p.longitude - my_lon) / 2), 2)
          )))
        end
      ) as distance_km,
      exists (select 1 from active_moments am where am.user_id = p.user_id) as has_active_moment
    from public.profiles p
    where p.id <> p_user_id
      and p.deleted_at is null
      and p.profile_completed is true
      and coalesce(p.discoverable_in_vibes, true) = true
      and coalesce(p.matchmaking_mode, false) = false
      and (
        v_segment <> 'active_now'
        or p.online = true
        or p.is_active = true
        or (p.last_active is not null and p.last_active >= cutoff)
      )
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
      and not exists (
        select 1 from public.intent_requests ir
        where ir.status = 'pending'
          and ir.expires_at > now()
          and (
            (ir.actor_id = p_user_id and ir.recipient_id = p.id)
            or (ir.actor_id = p.id and ir.recipient_id = p_user_id)
          )
      )
      and not exists (
        select 1 from public.profile_signal_gestures psg
        where psg.status in ('sent', 'seen')
          and psg.expires_at > now()
          and (
            (psg.sender_profile_id = p_user_id and psg.receiver_profile_id = p.id)
            or (psg.sender_profile_id = p.id and psg.receiver_profile_id = p_user_id)
          )
      )
      and not exists (
        select 1 from public.matches mt
        where mt.status in ('PENDING', 'ACCEPTED')
          and (
            (mt.user1_id = p_user_id and mt.user2_id = p.id)
            or (mt.user1_id = p.id and mt.user2_id = p_user_id)
          )
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
      coalesce(vf.seen_count, 0) as viewer_seen_count,
      coalesce(vf.opened_count, 0) as viewer_opened_count,
      coalesce(vf.intro_count, 0) as viewer_intro_count,
      coalesce(vf.positive_count, 0) as viewer_positive_count,
      coalesce(vf.pass_count, 0) as viewer_pass_count,
      coalesce(mf.impressions, 0) as market_impressions,
      coalesce(mf.opens, 0) as market_opens,
      coalesce(mf.positives, 0) as market_positives,
      (
        with target_counts as (
          select count(*)::double precision as cnt
          from public.profile_interests tpi
          where tpi.profile_id = c.id
        ),
        shared as (
          select count(*)::double precision as cnt
          from public.profile_interests tpi
          join viewer_interests vi on vi.interest_id = tpi.interest_id
          where tpi.profile_id = c.id
        )
        select
          case
            when (select vc.cnt from viewer_counts vc) <= 0 and (select tc.cnt from target_counts tc) <= 0 then 0.20
            else (select s.cnt from shared s) / greatest((select vc.cnt from viewer_counts vc) + (select tc.cnt from target_counts tc) - (select s.cnt from shared s), 1)
          end
      ) as interest_score,
      (
        case
          when c.distance_km is null then 0.52
          when c.distance_km <= 10 then 1
          when c.distance_km <= 25 then 0.92
          when c.distance_km <= 100 then 0.74
          when c.distance_km <= 500 then 0.48
          when c.distance_km <= 2000 then 0.25
          else 0.08
        end
      ) as distance_score,
      (
        case
          when c.online = true then 1
          when c.last_active is not null and c.last_active >= now() - interval '15 minutes' then 0.82
          when c.last_active is not null and c.last_active >= now() - interval '60 minutes' then 0.55
          when c.last_active is not null and c.last_active >= now() - interval '24 hours' then 0.25
          else 0
        end
      ) as activity_score,
      (
        least(coalesce(c.verification_level, 0), 3)::double precision / 3
      ) as verification_score,
      (
        (case when coalesce(c.profile_video, '') <> '' then 0.35 else 0 end) +
        (case when length(coalesce(c.bio, '')) >= 80 then 0.25 when length(coalesce(c.bio, '')) >= 30 then 0.12 else 0 end) +
        (case when c.has_active_moment then 0.24 else 0 end)
      ) as richness_score
    from candidate_base c
    left join viewer_feedback vf on vf.target_profile_id = c.id
    left join market_feedback mf on mf.target_profile_id = c.id
  ),
  ranked as (
    select
      s.*,
      (
        case v_segment
          when 'nearby' then
            100 * (
              0.43 * s.distance_score +
              0.20 * s.interest_score +
              0.13 * s.activity_score +
              0.10 * s.verification_score +
              0.08 * s.richness_score +
              0.06 * least((s.market_opens + s.market_positives * 1.5) / greatest(s.market_impressions, 8), 1)
            )
          when 'active_now' then
            100 * (
              0.38 * s.activity_score +
              0.22 * s.interest_score +
              0.15 * s.distance_score +
              0.10 * s.verification_score +
              0.09 * s.richness_score +
              0.06 * least((s.market_opens + s.market_positives * 1.5) / greatest(s.market_impressions, 8), 1)
            )
          else
            100 * (
              0.32 * s.interest_score +
              0.17 * s.distance_score +
              0.15 * s.activity_score +
              0.12 * s.verification_score +
              0.13 * s.richness_score +
              0.11 * least((s.market_opens + s.market_positives * 1.5) / greatest(s.market_impressions, 8), 1)
            )
        end
        + least(s.viewer_opened_count, 3) * 2.4
        + least(s.viewer_intro_count, 2) * 2.0
        + least(s.viewer_positive_count, 2) * 4.2
        - least(s.viewer_seen_count, 5) * 1.1
        - least(s.viewer_pass_count, 3) * 7.0
        + ((abs(hashtext(s.id::text || current_date::text)) % 100)::double precision / 100.0) * 2.5
      ) as final_score
    from scored s
  )
  select
    r.id,
    r.user_id,
    r.full_name,
    r.age,
    r.bio,
    r.avatar_url,
    r.profile_video,
    r.location,
    r.latitude,
    r.longitude,
    r.region,
    r.tribe,
    r.religion::text as religion,
    r.personality_type,
    r.is_active,
    r.online,
    r.last_active,
    (coalesce(r.verification_level, 0) > 0) as verified,
    r.verification_level,
    least(100, greatest(0, round(r.final_score)))::numeric as ai_score,
    r.distance_km,
    r.city,
    r.current_country,
    r.current_country_code,
    r.location_precision::text as location_precision,
    jsonb_build_object(
      'segment', v_segment,
      'interest', r.interest_score,
      'distance', r.distance_score,
      'activity', r.activity_score,
      'richness', r.richness_score,
      'viewer_seen_count', r.viewer_seen_count,
      'has_active_moment', r.has_active_moment
    ) as recommendation_reasons
  from ranked r
  order by
    case when v_segment = 'nearby' and r.distance_km is null then 1 else 0 end,
    r.final_score desc,
    r.distance_km asc nulls last,
    r.last_active desc nulls last,
    r.updated_at desc
  limit v_limit;
end;
$$;

revoke all on function public.get_vibes_recommendations_v2(uuid, text, integer, integer) from public;
grant execute on function public.get_vibes_recommendations_v2(uuid, text, integer, integer) to authenticated;
