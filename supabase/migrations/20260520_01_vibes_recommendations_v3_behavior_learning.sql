create index if not exists idx_messages_created_at
  on public.messages (created_at desc);

create index if not exists idx_matches_status_updated_at
  on public.matches (status, updated_at desc);

drop function if exists public.get_vibes_recommendations_v3(uuid, text, integer, integer);

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

  select
    pr.latitude,
    pr.longitude,
    pr.user_id,
    pr.min_age_interest,
    pr.max_age_interest,
    pr.region,
    pr.gender,
    pr.city,
    pr.current_country,
    pr.current_country_code,
    pr.origin_country,
    pr.origin_country_code
  into
    my_lat,
    my_lon,
    my_user_id,
    my_min_age,
    my_max_age,
    my_region,
    my_gender,
    my_city,
    my_country,
    my_country_code,
    my_origin_country,
    my_origin_country_code
  from public.profiles pr
  where pr.id = p_user_id
    and pr.user_id = auth.uid()
  limit 1;

  if my_user_id is null then
    return;
  end if;

  my_region_norm := nullif(lower(btrim(coalesce(my_region, ''))), '');
  my_city_norm := nullif(lower(btrim(coalesce(my_city, ''))), '');
  my_country_norm := nullif(lower(btrim(coalesce(my_country, ''))), '');
  my_country_code_norm := nullif(upper(btrim(coalesce(my_country_code, ''))), '');
  my_origin_country_norm := nullif(lower(btrim(coalesce(my_origin_country, ''))), '');
  my_origin_country_code_norm := nullif(upper(btrim(coalesce(my_origin_country_code, ''))), '');
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
      (count(*) filter (where ve.event_type = 'card_seen'))::integer as seen_count,
      (count(*) filter (where ve.event_type = 'profile_opened'))::integer as opened_count,
      (count(*) filter (where ve.event_type in ('intro_played', 'intro_completed')))::integer as intro_count,
      (count(*) filter (where ve.event_type = 'signal_opened'))::integer as signal_opened_count,
      (count(*) filter (where ve.event_type = 'intent_opened'))::integer as intent_opened_count,
      (count(*) filter (where ve.event_type in ('like', 'signal_sent', 'intent_sent')))::integer as positive_count,
      (count(*) filter (where ve.event_type = 'pass'))::integer as pass_count,
      (count(*) filter (where ve.event_type = 'undo'))::integer as undo_count,
      (avg(ve.dwell_ms) filter (where ve.dwell_ms is not null))::double precision as avg_dwell_ms,
      (count(*) filter (where coalesce(ve.dwell_ms, 0) >= 4000))::integer as long_dwell_count,
      max(ve.created_at) as last_event_at,
      max(ve.created_at) filter (where ve.event_type in ('like', 'signal_sent', 'intent_sent')) as last_positive_at,
      max(ve.created_at) filter (where ve.event_type = 'pass') as last_pass_at
    from public.vibes_events ve
    where ve.viewer_profile_id = p_user_id
      and ve.created_at >= now() - interval '60 days'
    group by ve.target_profile_id
  ),
  market_feedback as (
    select
      ve.target_profile_id,
      (count(*) filter (where ve.event_type = 'card_seen'))::double precision as impressions,
      (count(*) filter (where ve.event_type in ('profile_opened', 'signal_opened', 'intent_opened', 'intro_played', 'intro_completed')))::double precision as opens,
      (count(*) filter (where ve.event_type in ('like', 'signal_sent', 'intent_sent')))::double precision as positives,
      (count(*) filter (where coalesce(ve.dwell_ms, 0) >= 4000))::double precision as long_dwells
    from public.vibes_events ve
    where ve.created_at >= now() - interval '30 days'
    group by ve.target_profile_id
  ),
  recent_message_pairs as (
    select
      least(m.sender_id, m.receiver_id) as user_a,
      greatest(m.sender_id, m.receiver_id) as user_b,
      count(*)::double precision as message_count,
      max(m.created_at) as last_message_at
    from public.messages m
    where m.created_at >= now() - interval '60 days'
    group by 1, 2
  ),
  market_conversations as (
    select
      p.id as target_profile_id,
      (count(*) filter (where rmp.message_count >= 2))::double precision as conversation_pairs,
      (count(*) filter (where rmp.message_count >= 6))::double precision as deep_conversation_pairs
    from recent_message_pairs rmp
    join public.profiles p
      on p.user_id = rmp.user_a
      or p.user_id = rmp.user_b
    group by p.id
  ),
  market_match_outcomes as (
    select
      paired.profile_id,
      count(*)::double precision as accepted_matches
    from (
      select m.user1_id as profile_id
      from public.matches m
      where m.status = 'ACCEPTED'
        and m.updated_at >= now() - interval '60 days'

      union all

      select m.user2_id as profile_id
      from public.matches m
      where m.status = 'ACCEPTED'
        and m.updated_at >= now() - interval '60 days'
    ) paired
    group by paired.profile_id
  ),
  recent_pass_suppression as (
    select
      ve.target_profile_id,
      (count(*) filter (where ve.event_type = 'pass'))::integer as pass_count,
      max(ve.created_at) filter (where ve.event_type = 'pass') as last_pass_at
    from public.vibes_events ve
    where ve.viewer_profile_id = p_user_id
      and ve.created_at >= now() - interval '45 days'
    group by ve.target_profile_id
  ),
  active_moments as (
    select distinct m.user_id
    from public.moments m
    where public.can_view_moment(m.id)
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
      exists (select 1 from active_moments am where am.user_id = p.user_id) as has_active_moment,
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
          and
          my_country_norm is not null
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
      loc.candidate_country_group,
      loc.candidate_region_group
    from public.profiles p
    cross join lateral (
      select
        nullif(upper(btrim(coalesce(p.current_country_code, ''))), '') as candidate_country_code_norm,
        nullif(lower(btrim(coalesce(p.current_country, ''))), '') as candidate_country_norm,
        case
          when nullif(upper(btrim(coalesce(p.origin_country_code, ''))), '') is not null then nullif(upper(btrim(coalesce(p.origin_country_code, ''))), '')
          when upper(coalesce(p.current_country_code, '')) = 'GH' then 'GH'
          else null
        end as candidate_origin_country_code_norm,
        case
          when nullif(lower(btrim(coalesce(p.origin_country, ''))), '') is not null then nullif(lower(btrim(coalesce(p.origin_country, ''))), '')
          when lower(btrim(coalesce(p.current_country, ''))) = 'ghana' then 'ghana'
          else null
        end as candidate_origin_country_norm,
        case
          when nullif(lower(btrim(coalesce(p.region, ''))), '') is null then null
          when nullif(lower(btrim(coalesce(p.region, ''))), '') in ('africa', 'north america', 'south america', 'europe', 'asia', 'oceania', 'middle east') then null
          when nullif(lower(btrim(coalesce(p.region, ''))), '') = nullif(lower(btrim(coalesce(p.current_country, ''))), '') then null
          when nullif(lower(btrim(coalesce(p.region, ''))), '') = lower(nullif(upper(btrim(coalesce(p.current_country_code, ''))), '')) then null
          else nullif(lower(btrim(coalesce(p.region, ''))), '')
        end as candidate_region_norm,
        case
          when nullif(lower(btrim(coalesce(p.city, ''))), '') is null then null
          when nullif(lower(btrim(coalesce(p.city, ''))), '') in ('africa', 'north america', 'south america', 'europe', 'asia', 'oceania', 'middle east') then null
          when nullif(lower(btrim(coalesce(p.city, ''))), '') = nullif(lower(btrim(coalesce(p.region, ''))), '') then null
          when nullif(lower(btrim(coalesce(p.city, ''))), '') = nullif(lower(btrim(coalesce(p.current_country, ''))), '') then null
          when nullif(lower(btrim(coalesce(p.city, ''))), '') = lower(nullif(upper(btrim(coalesce(p.current_country_code, ''))), '')) then null
          when nullif(lower(btrim(coalesce(p.city, ''))), '') ~ '(region|district|province|state|county|municipality|metropolitan)' then null
          else nullif(lower(btrim(coalesce(p.city, ''))), '')
        end as candidate_city_norm,
        coalesce(
          nullif(upper(btrim(coalesce(p.current_country_code, ''))), ''),
          nullif(lower(btrim(coalesce(p.current_country, ''))), ''),
          '<<none>>'
        ) as candidate_country_group,
        coalesce(
          case
            when nullif(lower(btrim(coalesce(p.region, ''))), '') is null then null
            when nullif(lower(btrim(coalesce(p.region, ''))), '') in ('africa', 'north america', 'south america', 'europe', 'asia', 'oceania', 'middle east') then null
            when nullif(lower(btrim(coalesce(p.region, ''))), '') = nullif(lower(btrim(coalesce(p.current_country, ''))), '') then null
            when nullif(lower(btrim(coalesce(p.region, ''))), '') = lower(nullif(upper(btrim(coalesce(p.current_country_code, ''))), '')) then null
            else nullif(lower(btrim(coalesce(p.region, ''))), '')
          end,
          coalesce(
            nullif(upper(btrim(coalesce(p.current_country_code, ''))), ''),
            nullif(lower(btrim(coalesce(p.current_country, ''))), '')
          ),
          '<<none>>'
        ) as candidate_region_group,
        (
          (
            case
              when nullif(upper(btrim(coalesce(p.origin_country_code, ''))), '') is not null then nullif(upper(btrim(coalesce(p.origin_country_code, ''))), '')
              when upper(coalesce(p.current_country_code, '')) = 'GH' then 'GH'
              else null
            end
          ) is not null
          and nullif(upper(btrim(coalesce(p.current_country_code, ''))), '') is not null
          and (
            case
              when nullif(upper(btrim(coalesce(p.origin_country_code, ''))), '') is not null then nullif(upper(btrim(coalesce(p.origin_country_code, ''))), '')
              when upper(coalesce(p.current_country_code, '')) = 'GH' then 'GH'
              else null
            end
          ) <> nullif(upper(btrim(coalesce(p.current_country_code, ''))), '')
        ) as candidate_is_diaspora
    ) loc
    left join recent_pass_suppression rps on rps.target_profile_id = p.id
    where p.id <> p_user_id
      and p.deleted_at is null
      and p.profile_completed is true
      and coalesce(p.discoverable_in_vibes, true) = true
      and coalesce(p.matchmaking_mode, false) = false
      and (
        v_segment <> 'active_now'
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
          and s.action::text in ('LIKE', 'SUPERLIKE')
      )
      and not exists (
        select 1 from public.swipes s
        where s.swiper_id = p_user_id
          and s.target_id = p.id
          and s.action::text = 'PASS'
          and s.created_at >= now() - interval '7 days'
      )
      and not (
        coalesce(rps.last_pass_at, '-infinity'::timestamptz) >= now() - interval '3 days'
        or (
          coalesce(rps.pass_count, 0) >= 2
          and coalesce(rps.last_pass_at, '-infinity'::timestamptz) >= now() - interval '21 days'
        )
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
      coalesce(vf.signal_opened_count, 0) as viewer_signal_opened_count,
      coalesce(vf.intent_opened_count, 0) as viewer_intent_opened_count,
      coalesce(vf.positive_count, 0) as viewer_positive_count,
      coalesce(vf.pass_count, 0) as viewer_pass_count,
      coalesce(vf.undo_count, 0) as viewer_undo_count,
      coalesce(vf.avg_dwell_ms, 0) as viewer_avg_dwell_ms,
      coalesce(vf.long_dwell_count, 0) as viewer_long_dwell_count,
      vf.last_event_at as viewer_last_event_at,
      vf.last_positive_at as viewer_last_positive_at,
      vf.last_pass_at as viewer_last_pass_at,
      coalesce(mf.impressions, 0) as market_impressions,
      coalesce(mf.opens, 0) as market_opens,
      coalesce(mf.positives, 0) as market_positives,
      coalesce(mf.long_dwells, 0) as market_long_dwells,
      coalesce(mc.conversation_pairs, 0) as market_conversation_pairs,
      coalesce(mc.deep_conversation_pairs, 0) as market_deep_conversation_pairs,
      coalesce(mm.accepted_matches, 0) as market_accepted_matches,
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
          when c.distance_km is null then 0.40
          when c.distance_km <= 10 then 1
          when c.distance_km <= 25 then 0.94
          when c.distance_km <= 100 then 0.80
          when c.distance_km <= 500 then 0.55
          when c.distance_km <= 2000 then 0.28
          else 0.10
        end
      ) as distance_score,
      (
        case
          when c.last_active is not null and c.last_active >= now() - interval '3 minutes' then 1
          when c.last_active is not null and c.last_active >= now() - interval '15 minutes' then 0.84
          when c.last_active is not null and c.last_active >= now() - interval '60 minutes' then 0.60
          when c.last_active is not null and c.last_active >= now() - interval '24 hours' then 0.28
          else 0
        end
      ) as activity_score,
      least(coalesce(c.verification_level, 0), 3)::double precision / 3 as verification_score,
      (
        (case when coalesce(c.profile_video, '') <> '' then 0.38 else 0 end) +
        (case when length(coalesce(c.bio, '')) >= 80 then 0.26 when length(coalesce(c.bio, '')) >= 30 then 0.13 else 0 end) +
        (case when c.has_active_moment then 0.28 else 0 end)
      ) as richness_score,
      (
        case
          when c.same_city then 1.00
          when c.same_region then 0.84
          when c.same_country then 0.70
          when c.distance_km is not null and c.distance_km <= 50 then 0.58
          when c.distance_km is not null and c.distance_km <= 250 then 0.34
          else 0
        end
      ) as geo_affinity_score,
      (
        case
          when c.same_city then 0
          when c.same_region then 1
          when c.same_country then 2
          else 3
        end
      ) as geo_bucket,
      (
        case
          when c.same_origin_country and (my_is_diaspora or coalesce(c.candidate_is_diaspora, false)) then 1.00
          when c.same_origin_country then 0.82
          when c.origin_residence_bridge then 0.48
          else 0
        end
      ) as origin_affinity_score,
      least(
        (
          coalesce(mf.opens, 0) +
          coalesce(mf.positives, 0) * 1.6 +
          coalesce(mf.long_dwells, 0) * 0.7 +
          coalesce(mc.conversation_pairs, 0) * 1.8 +
          coalesce(mc.deep_conversation_pairs, 0) * 2.4 +
          coalesce(mm.accepted_matches, 0) * 2.1
        ) / greatest(coalesce(mf.impressions, 0), 12),
        1.25
      ) as market_quality_score
    from candidate_base c
    left join viewer_feedback vf on vf.target_profile_id = c.id
    left join market_feedback mf on mf.target_profile_id = c.id
    left join market_conversations mc on mc.target_profile_id = c.id
    left join market_match_outcomes mm on mm.profile_id = c.id
  ),
  ranked as (
    select
      s.*,
      (
        case v_segment
          when 'nearby' then
            100 * (
              0.28 * s.geo_affinity_score +
              0.26 * s.distance_score +
              0.16 * s.activity_score +
              0.12 * s.interest_score +
              0.03 * s.origin_affinity_score +
              0.08 * s.verification_score +
              0.05 * s.richness_score +
              0.02 * s.market_quality_score
            )
          when 'active_now' then
            100 * (
              0.27 * s.activity_score +
              0.23 * s.geo_affinity_score +
              0.17 * s.interest_score +
              0.06 * s.origin_affinity_score +
              0.11 * s.distance_score +
              0.08 * s.verification_score +
              0.07 * s.richness_score +
              0.01 * s.market_quality_score
            )
          else
            100 * (
              0.23 * s.interest_score +
              0.18 * s.geo_affinity_score +
              0.12 * s.origin_affinity_score +
              0.12 * s.activity_score +
              0.10 * s.distance_score +
              0.09 * s.verification_score +
              0.11 * s.richness_score +
              0.05 * s.market_quality_score
            )
        end
        + least(s.viewer_opened_count, 3) * 2.8
        + least(s.viewer_intro_count, 2) * 2.0
        + least(s.viewer_signal_opened_count + s.viewer_intent_opened_count, 3) * 1.9
        + least(greatest(s.viewer_positive_count - s.viewer_undo_count, 0), 2) * 4.5
        + least(s.viewer_long_dwell_count, 3) * 1.4
        + least(s.viewer_avg_dwell_ms / 4000.0, 1.5) * 1.8
        + case
            when s.viewer_last_positive_at >= now() - interval '7 days' then 3.6
            when s.viewer_last_positive_at >= now() - interval '21 days' then 1.8
            else 0
          end
        - least(s.viewer_seen_count, 6) * 0.9
        - least(s.viewer_pass_count, 3) * 5.5
        - least(s.viewer_undo_count, 2) * 1.6
        - case
            when s.viewer_last_pass_at >= now() - interval '7 days' then 7.5
            when s.viewer_last_pass_at >= now() - interval '21 days' then 3.0
            else 0
          end
        + case
            when v_segment = 'for_you' and s.same_city then 12.0
            when v_segment = 'for_you' and s.same_region then 7.0
            when v_segment = 'for_you' and s.same_country then 4.4
            when v_segment = 'for_you' and s.same_origin_country and (my_is_diaspora or coalesce(s.candidate_is_diaspora, false)) then 5.5
            when v_segment = 'for_you' and s.same_origin_country then 2.8
            when v_segment = 'for_you' and s.origin_residence_bridge then 1.5
            when v_segment = 'active_now' and s.same_city then 6.0
            when v_segment = 'active_now' and s.same_region then 3.5
            when v_segment = 'active_now' and s.same_country then 2.2
            when v_segment = 'active_now' and s.same_origin_country then 1.6
            when v_segment = 'nearby' and s.same_city then 5.0
            when v_segment = 'nearby' and s.same_region then 2.5
            when v_segment = 'nearby' and s.same_origin_country then 1.0
            else 0
          end
        + case
            when s.market_impressions < 8 then 1.9
            when s.market_impressions < 20 then 0.9
            else 0
          end
        + ((abs(hashtext(s.id::text || current_date::text)) % 100)::double precision / 100.0) * 2.4
      ) as final_score
    from scored s
  ),
  diversified as (
    select
      r.*,
      row_number() over (
        partition by r.candidate_country_group
        order by r.final_score desc, r.last_active desc nulls last, r.updated_at desc
      ) as country_rank,
      row_number() over (
        partition by r.candidate_region_group
        order by r.final_score desc, r.last_active desc nulls last, r.updated_at desc
      ) as region_rank
    from ranked r
  ),
  ordered as (
    select
      d.*,
      (
        d.final_score
        - case
            when v_segment = 'for_you' then greatest(d.country_rank - 1, 0) * 0.35 + greatest(d.region_rank - 1, 0) * 0.20
            when v_segment = 'active_now' then greatest(d.region_rank - 1, 0) * 0.18
            else greatest(d.region_rank - 1, 0) * 0.12
          end
      ) as adjusted_score
    from diversified d
  )
  select
    o.id,
    o.user_id,
    o.full_name,
    o.age,
    o.bio,
    o.avatar_url,
    o.profile_video,
    o.location,
    o.latitude,
    o.longitude,
    o.region,
    o.tribe,
    o.religion::text as religion,
    o.personality_type,
    (o.last_active is not null and o.last_active >= now() - interval '15 minutes') as is_active,
    (o.last_active is not null and o.last_active >= now() - interval '3 minutes') as online,
    o.last_active,
    (coalesce(o.verification_level, 0) > 0) as verified,
    o.verification_level,
    least(100, greatest(0, round(o.adjusted_score)))::numeric as ai_score,
    o.distance_km,
    o.city,
    o.current_country,
    o.current_country_code,
    o.location_precision::text as location_precision,
    jsonb_build_object(
      'version', 'v3',
      'segment', v_segment,
      'interest', o.interest_score,
      'distance', o.distance_score,
      'activity', o.activity_score,
      'richness', o.richness_score,
      'geo_affinity', o.geo_affinity_score,
      'geo_bucket', o.geo_bucket,
      'origin_affinity', o.origin_affinity_score,
      'market_quality', o.market_quality_score,
      'viewer_seen_count', o.viewer_seen_count,
      'viewer_positive_count', o.viewer_positive_count,
      'viewer_pass_count', o.viewer_pass_count,
      'has_active_moment', o.has_active_moment,
      'same_city', o.same_city,
      'same_region', o.same_region,
      'same_country', o.same_country,
      'same_origin_country', o.same_origin_country,
      'origin_residence_bridge', o.origin_residence_bridge,
      'viewer_is_diaspora', my_is_diaspora,
      'candidate_is_diaspora', coalesce(o.candidate_is_diaspora, false)
    ) as recommendation_reasons
  from ordered o
  order by
    case when v_segment = 'nearby' and o.distance_km is null then 1 else 0 end,
    o.adjusted_score desc,
    case when v_segment = 'for_you' then o.geo_bucket else 3 end asc,
    o.distance_km asc nulls last,
    o.last_active desc nulls last,
    o.updated_at desc
  limit v_limit;
end;
$$;

revoke all on function public.get_vibes_recommendations_v3(uuid, text, integer, integer) from public;
grant execute on function public.get_vibes_recommendations_v3(uuid, text, integer, integer) to authenticated;
