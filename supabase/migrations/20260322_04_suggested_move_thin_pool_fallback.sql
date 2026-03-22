drop function if exists public.rpc_get_suggested_moves(uuid, integer);

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
  distance_km double precision,
  shared_interest_names text[],
  shared_interest_count integer,
  prompt_title text,
  prompt_answer text,
  bio_snippet text,
  same_region boolean,
  same_religion boolean,
  same_looking_for boolean,
  active_now boolean,
  recently_active boolean,
  candidate_tier integer,
  quality_band integer
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
  with viewer_interests as (
    select coalesce(array_agg(distinct i.name order by i.name), '{}'::text[]) as names
    from public.profile_interests pi
    join public.interests i on i.id = pi.interest_id
    where pi.profile_id = p_profile_id
  ),
  top_targets as (
    select ps.target_profile_id
    from public.profile_signals ps
    where ps.profile_id = p_profile_id
    order by
      ps.liked desc,
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
    select
      (select names from viewer_interests) as viewer_interest_names,
      case
        when exists (select 1 from taste_interests) then
          coalesce((select array_agg(name order by name) from taste_interests), '{}'::text[])
        else
          (select names from viewer_interests)
      end as top_interest_names
  ),
  candidate_market_feedback as (
    select
      sme.candidate_profile_id,
      count(*) filter (where sme.event_type = 'impression')::integer as impression_count,
      count(*) filter (where sme.event_type = 'preview_profile')::integer as preview_count,
      count(*) filter (where sme.event_type = 'opener_revealed')::integer as opener_reveal_count,
      count(*) filter (where sme.event_type = 'intent_opened')::integer as intent_open_count,
      count(*) filter (where sme.event_type = 'intent_sent')::integer as intent_sent_count
    from public.suggested_move_events sme
    group by sme.candidate_profile_id
  ),
  viewer_candidate_feedback as (
    select
      sme.candidate_profile_id,
      count(*) filter (where sme.event_type = 'impression')::integer as viewer_impression_count,
      count(*) filter (where sme.event_type = 'preview_profile')::integer as viewer_preview_count,
      count(*) filter (where sme.event_type = 'opener_revealed')::integer as viewer_opener_count,
      count(*) filter (where sme.event_type = 'intent_opened')::integer as viewer_intent_open_count,
      count(*) filter (where sme.event_type = 'intent_sent')::integer as viewer_intent_sent_count,
      max(sme.created_at) as viewer_last_event_at
    from public.suggested_move_events sme
    where sme.viewer_profile_id = p_profile_id
    group by sme.candidate_profile_id
  ),
  candidate_response_history as (
    select
      ir.recipient_id as candidate_profile_id,
      count(*) filter (where ir.status in ('accepted', 'passed', 'matched'))::integer as decision_count,
      count(*) filter (where ir.status in ('accepted', 'matched'))::integer as positive_decision_count
    from public.intent_requests ir
    where ir.recipient_id <> p_profile_id
    group by ir.recipient_id
  ),
  base_candidates as (
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
      left(regexp_replace(coalesce(p.bio, ''), '\s+', ' ', 'g'), 160) as bio_snippet,
      greatest(
        coalesce(array_length(p.photos, 1), 0),
        case when p.avatar_url is not null and btrim(p.avatar_url) <> '' then 1 else 0 end
      ) as photo_count,
      (my_region is not null and p.region is not null and my_region = p.region) as same_region,
      (my_religion is not null and p.religion is not null and my_religion = p.religion) as same_religion,
      (
        my_looking_for is not null
        and p.looking_for is not null
        and lower(trim(my_looking_for)) = lower(trim(p.looking_for))
      ) as same_looking_for,
      (
        my_min_age_interest is null
        or my_max_age_interest is null
        or p.age between my_min_age_interest and my_max_age_interest
      ) as within_viewer_age_pref,
      (
        my_age is null
        or p.min_age_interest is null
        or p.max_age_interest is null
        or my_age between p.min_age_interest and p.max_age_interest
      ) as within_mutual_age_pref,
      (
        my_gender is null
        or my_gender not in ('MALE', 'FEMALE')
        or p.gender is null
        or p.gender not in ('MALE', 'FEMALE')
        or (my_gender = 'MALE' and p.gender = 'FEMALE')
        or (my_gender = 'FEMALE' and p.gender = 'MALE')
      ) as binary_gender_match
    from public.profiles p
    where p.id <> p_profile_id
      and p.deleted_at is null
      and p.is_active = true
      and p.profile_completed is true
      and coalesce(p.discoverable_in_vibes, true) = true
      and p.user_id is not null
      and p.user_id <> my_user_id
      and p.full_name is not null
      and p.age is not null
      and not exists (
        select 1
        from public.intent_requests ir
        where (
            (ir.actor_id = p_profile_id and ir.recipient_id = p.id)
            or (ir.actor_id = p.id and ir.recipient_id = p_profile_id)
          )
          and (
            ir.status in ('pending', 'accepted', 'matched')
            or (
              ir.status = 'passed'
              and ir.created_at > now() - interval '21 days'
            )
          )
      )
      and not exists (
        select 1
        from public.matches m
        where (m.user1_id = p_profile_id and m.user2_id = p.id)
           or (m.user1_id = p.id and m.user2_id = p_profile_id)
      )
      and not exists (
        select 1
        from public.blocks b
        where (b.blocker_id = my_user_id and b.blocked_id = p.user_id)
           or (b.blocker_id = p.user_id and b.blocked_id = my_user_id)
      )
      and coalesce((
        select sw.action::text
        from public.swipes sw
        where sw.swiper_id = p_profile_id
          and sw.target_id = p.id
        order by sw.created_at desc, sw.id desc
        limit 1
      ), '') <> 'PASS'
  ),
  primary_candidates as (
    select bc.*, 0::integer as candidate_tier
    from base_candidates bc
    where bc.within_viewer_age_pref
      and bc.within_mutual_age_pref
      and bc.binary_gender_match
  ),
  high_quality_primary_count as (
    select count(*)::integer as total
    from primary_candidates pc
    cross join taste
    where pc.same_looking_for
      or pc.profile_video is not null
      or exists (
        select 1
        from public.profile_interests pi
        join public.interests i on i.id = pi.interest_id
        where pi.profile_id = pc.id
          and i.name = any(taste.viewer_interest_names)
      )
      or exists (
        select 1
        from public.profile_prompts pp
        where pp.profile_id = pc.id
          and pp.answer is not null
          and btrim(pp.answer) <> ''
      )
      or (
        (pc.online = true or pc.last_active > now() - interval '20 minutes')
        and my_lat is not null
        and my_lon is not null
        and pc.latitude is not null
        and pc.longitude is not null
        and (6371 * 2 * asin(sqrt(
          power(sin(radians(pc.latitude - my_lat) / 2), 2) +
          cos(radians(my_lat)) * cos(radians(pc.latitude)) *
          power(sin(radians(pc.longitude - my_lon) / 2), 2)
        ))) <= 25
      )
  ),
  fallback_candidates as (
    select bc.*, 1::integer as candidate_tier
    from base_candidates bc
    cross join high_quality_primary_count hq
    where hq.total < 3
      and bc.within_viewer_age_pref
      and not bc.within_mutual_age_pref
      and bc.binary_gender_match
  ),
  candidate_selection as (
    select * from primary_candidates
    union all
    select * from fallback_candidates
  ),
  candidates as (
    select
      c.id,
      c.full_name,
      c.age,
      c.avatar_url,
      c.profile_video,
      c.region,
      c.religion,
      c.looking_for,
      c.min_age_interest,
      c.max_age_interest,
      c.verification_level,
      c.latitude,
      c.longitude,
      c.online,
      c.last_active,
      c.bio_snippet,
      c.photo_count,
      coalesce(shared.shared_interest_count, 0) as shared_interest_count,
      coalesce(shared.shared_interest_names, '{}'::text[]) as shared_interest_names,
      coalesce(taste_overlap.taste_interest_count, 0) as taste_interest_count,
      prompt.prompt_title,
      prompt.answer as prompt_answer,
      coalesce(signal.opened_profile_count, 0) as opened_profile_count,
      coalesce(signal.dwell_score, 0) as dwell_score,
      coalesce(signal.intro_video_completed, false) as signal_intro_video_completed,
      coalesce(signal.liked, false) as signal_liked,
      signal.last_interacted_at as signal_last_interacted_at,
      swipe.action as latest_swipe_action,
      c.same_region,
      c.same_religion,
      c.same_looking_for,
      coalesce(market.impression_count, 0) as market_impression_count,
      coalesce(market.preview_count, 0) as market_preview_count,
      coalesce(market.opener_reveal_count, 0) as market_opener_reveal_count,
      coalesce(market.intent_open_count, 0) as market_intent_open_count,
      coalesce(market.intent_sent_count, 0) as market_intent_sent_count,
      coalesce(viewer.viewer_impression_count, 0) as viewer_impression_count,
      coalesce(viewer.viewer_preview_count, 0) as viewer_preview_count,
      coalesce(viewer.viewer_opener_count, 0) as viewer_opener_count,
      coalesce(viewer.viewer_intent_open_count, 0) as viewer_intent_open_count,
      coalesce(viewer.viewer_intent_sent_count, 0) as viewer_intent_sent_count,
      viewer.viewer_last_event_at,
      coalesce(response_history.decision_count, 0) as recipient_decision_count,
      coalesce(response_history.positive_decision_count, 0) as recipient_positive_decision_count,
      c.candidate_tier
    from candidate_selection c
    cross join taste
    left join lateral (
      select
        count(*)::integer as shared_interest_count,
        (coalesce(array_agg(i.name order by i.name), '{}'::text[]))[1:3] as shared_interest_names
      from public.profile_interests pi
      join public.interests i on i.id = pi.interest_id
      where pi.profile_id = c.id
        and i.name = any(taste.viewer_interest_names)
    ) shared on true
    left join lateral (
      select count(*)::integer as taste_interest_count
      from public.profile_interests pi
      join public.interests i on i.id = pi.interest_id
      where pi.profile_id = c.id
        and i.name = any(taste.top_interest_names)
    ) taste_overlap on true
    left join lateral (
      select pp.prompt_title, pp.answer
      from public.profile_prompts pp
      where pp.profile_id = c.id
        and pp.answer is not null
        and btrim(pp.answer) <> ''
      order by pp.updated_at desc nulls last, pp.created_at desc, pp.id desc
      limit 1
    ) prompt on true
    left join public.profile_signals signal
      on signal.profile_id = p_profile_id
     and signal.target_profile_id = c.id
    left join lateral (
      select sw.action
      from public.swipes sw
      where sw.swiper_id = p_profile_id
        and sw.target_id = c.id
      order by sw.created_at desc, sw.id desc
      limit 1
    ) swipe on true
    left join candidate_market_feedback market
      on market.candidate_profile_id = c.id
    left join viewer_candidate_feedback viewer
      on viewer.candidate_profile_id = c.id
    left join candidate_response_history response_history
      on response_history.candidate_profile_id = c.id
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
      ) as distance_km,
      (c.online = true or c.last_active > now() - interval '20 minutes') as active_now,
      (c.last_active > now() - interval '3 days') as recently_active,
      case
        when c.market_impression_count >= 8 then c.market_preview_count::double precision / greatest(c.market_impression_count, 1)
        else null::double precision
      end as market_preview_rate,
      case
        when c.market_impression_count >= 8 then c.market_intent_open_count::double precision / greatest(c.market_impression_count, 1)
        else null::double precision
      end as market_open_rate,
      case
        when c.market_impression_count >= 8 then c.market_intent_sent_count::double precision / greatest(c.market_impression_count, 1)
        else null::double precision
      end as market_send_rate,
      case
        when c.recipient_decision_count >= 5 then c.recipient_positive_decision_count::double precision / greatest(c.recipient_decision_count, 1)
        else null::double precision
      end as recipient_positive_rate
    from candidates c
  ),
  ranked as (
    select
      s.*,
      (
        case
          when s.same_looking_for or s.shared_interest_count > 0 then 3
          when s.prompt_title is not null then 2
          when s.active_now and s.distance_km is not null and s.distance_km <= 25 then 2
          when s.profile_video is not null or s.active_now then 1
          else 0
        end
      )::integer as quality_band,
      (
        least(s.shared_interest_count, 3) * 3.0
        + least(s.taste_interest_count, 3) * 1.25
        + case when s.profile_video is not null then 2.5 else 0 end
        + case when s.active_now then 1.5 else 0 end
        + case when s.recently_active then 0.75 else -0.75 end
        + case when s.same_region then 0.6 else 0 end
        + case when s.same_religion then 0.3 else 0 end
        + case when s.same_looking_for then 2.2 else 0 end
        + case when coalesce(s.verification_level, 0) > 0 then 0.8 else 0 end
        + case
            when s.photo_count >= 3 then 1.0
            when s.photo_count = 2 then 0.45
            when s.photo_count = 1 then 0.1
            else -1.5
          end
        + case when s.prompt_title is not null then 0.8 else 0 end
        + case
            when char_length(coalesce(s.bio_snippet, '')) >= 120 then 0.6
            when char_length(coalesce(s.bio_snippet, '')) >= 40 then 0.2
            else -0.6
          end
        + case
            when s.latest_swipe_action = 'SUPERLIKE' then 2.5
            when s.latest_swipe_action = 'LIKE' then 1.5
            else 0
          end
        + case when s.signal_liked then 1.25 else 0 end
        + case when s.signal_intro_video_completed then 0.75 else 0 end
        + case
            when s.market_preview_rate is null then 0
            when s.market_preview_rate >= 0.30 then 1.0
            when s.market_preview_rate >= 0.18 then 0.5
            when s.market_preview_rate < 0.08 then -0.5
            else 0
          end
        + case
            when s.market_open_rate is null then 0
            when s.market_open_rate >= 0.14 then 1.1
            when s.market_open_rate >= 0.08 then 0.5
            when s.market_open_rate < 0.03 then -0.45
            else 0
          end
        + case
            when s.market_send_rate is null then 0
            when s.market_send_rate >= 0.08 then 1.3
            when s.market_send_rate >= 0.04 then 0.55
            when s.market_send_rate < 0.015 then -0.75
            else 0
          end
        + case
            when s.recipient_positive_rate is null then 0
            when s.recipient_positive_rate >= 0.45 then 1.4
            when s.recipient_positive_rate >= 0.28 then 0.6
            when s.recipient_positive_rate < 0.10 then -0.8
            else 0
          end
        - case
            when s.shared_interest_count = 0 and not s.same_looking_for then 1.1
            else 0
          end
        - case
            when s.shared_interest_count = 0
              and not s.same_looking_for
              and s.prompt_title is null
              and s.profile_video is null
            then 0.65
            else 0
          end
        - case
            when s.shared_interest_count = 0
              and not s.same_looking_for
              and not s.active_now
              and s.distance_km is null
            then 0.5
            else 0
          end
        - case
            when s.viewer_impression_count >= 2 and s.viewer_intent_sent_count = 0 and s.viewer_preview_count = 0 then least(s.viewer_impression_count, 4) * 0.75
            else 0
          end
        - case
            when s.viewer_impression_count >= 3 and s.viewer_intent_sent_count = 0 and s.viewer_preview_count > 0 then least(s.viewer_impression_count, 4) * 0.55
            else 0
          end
        - case
            when s.viewer_last_event_at > now() - interval '36 hours' and s.viewer_intent_sent_count = 0 then 0.85
            else 0
          end
        - case
            when s.opened_profile_count >= 2 and not s.signal_liked then least(s.opened_profile_count, 4) * 0.9
            else 0
          end
        - case
            when s.signal_last_interacted_at > now() - interval '2 days' and not s.signal_liked then 1.25
            else 0
          end
        - case
            when s.opened_profile_count >= 3 and s.dwell_score < 12 and not s.signal_liked then 1.0
            else 0
          end
        - case when s.candidate_tier = 1 then 2.4 else 0 end
        + case
            when s.distance_km is null then 0
            when s.distance_km <= 25 then 2
            when s.distance_km <= 100 then 1
            when s.distance_km <= 500 then 0
            when s.distance_km <= 2000 then -1
            else -3
          end
      )::double precision as base_score
    from scored s
  ),
  diversified as (
    select
      r.*,
      row_number() over (
        partition by coalesce(r.region, '<<none>>')
        order by r.quality_band desc, r.base_score desc, r.distance_km asc nulls last, r.last_active desc nulls last, r.id desc
      ) as region_rank,
      row_number() over (
        partition by coalesce(r.looking_for, '<<none>>')
        order by r.quality_band desc, r.base_score desc, r.distance_km asc nulls last, r.last_active desc nulls last, r.id desc
      ) as goal_rank,
      row_number() over (
        partition by
          case
            when r.shared_interest_count > 0 then 'shared'
            when r.profile_video is not null then 'video'
            when r.active_now then 'active'
            when r.same_looking_for then 'goals'
            else 'general'
          end
        order by r.quality_band desc, r.base_score desc, r.distance_km asc nulls last, r.last_active desc nulls last, r.id desc
      ) as archetype_rank
    from ranked r
  ),
  hero_pool as (
    select exists(
      select 1
      from diversified d
      where d.quality_band >= 2
    ) as has_hero_quality
  )
  select
    d.id,
    d.full_name,
    d.age,
    d.avatar_url,
    (array_remove(array[
      case when d.shared_interest_count > 0 then 'Shared interests' end,
      case when d.same_looking_for then 'Same goals' end,
      case when d.same_religion then 'Shared values' end,
      case when d.same_region then 'Same region' end,
      case when d.profile_video is not null then 'Intro video' end,
      case when d.active_now then 'Active now' end,
      case when d.prompt_title is not null then 'Strong prompt' end
    ], null))[1:3] as short_tags,
    (d.profile_video is not null) as has_intro_video,
    d.distance_km,
    d.shared_interest_names,
    d.shared_interest_count,
    d.prompt_title,
    d.prompt_answer,
    nullif(d.bio_snippet, '') as bio_snippet,
    d.same_region,
    d.same_religion,
    d.same_looking_for,
    d.active_now,
    d.recently_active,
    d.candidate_tier,
    d.quality_band
  from diversified d
  cross join hero_pool hp
  order by
    case
      when hp.has_hero_quality and d.quality_band >= 2 then 1
      when hp.has_hero_quality then 0
      else 1
    end desc,
    d.quality_band desc,
    (
      d.base_score
      - greatest(d.region_rank - 1, 0) * 0.70
      - greatest(d.goal_rank - 1, 0) * 0.45
      - greatest(d.archetype_rank - 1, 0) * 0.35
    ) desc,
    d.distance_km asc nulls last,
    d.last_active desc nulls last,
    d.id desc
  limit p_limit;
end;
$$;

grant execute on function public.rpc_get_suggested_moves(uuid, integer) to authenticated;
