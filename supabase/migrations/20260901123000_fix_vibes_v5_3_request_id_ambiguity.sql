-- Repair the deployed V5.3 recommender's PL/pgSQL output-column ambiguity.
-- The function returns a column named `id`; using ON CONFLICT (id) therefore
-- collided with that output variable at runtime. The named constraint keeps
-- request UUIDs server-authoritative and unambiguous.

create or replace function public.get_vibes_recommendations_v5_3(
  p_user_id uuid,
  p_segment text default 'for_you',
  p_limit integer default 30,
  p_active_window_minutes integer default 30,
  p_client_session_id uuid default null,
  p_request_id uuid default null,
  p_refresh_ordinal integer default 0
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
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
#variable_conflict use_column
declare
  v_limit integer := greatest(1, least(coalesce(p_limit, 30), 50));
  v_seed_limit integer;
  v_segment text := coalesce(nullif(btrim(p_segment), ''), 'for_you');
  v_session_id uuid := coalesce(p_client_session_id, gen_random_uuid());
  v_request_id uuid := coalesce(p_request_id, gen_random_uuid());
  v_exploration_count integer;
begin
  if auth.uid() is null then
    return;
  end if;

  if v_segment not in ('for_you', 'nearby', 'active_now') then
    return;
  end if;

  if not exists (
    select 1
    from public.profiles viewer
    where viewer.id = p_user_id
      and viewer.user_id = auth.uid()
      and viewer.deleted_at is null
  ) then
    return;
  end if;

  if not exists (
    select 1
    from public.vibes_v5_3_feature_weights weight
    where weight.viewer_profile_id = p_user_id
  ) and (
    exists (
      select 1 from public.vibes_events event_row
      where event_row.viewer_profile_id = p_user_id
      limit 1
    )
    or exists (
      select 1 from public.intent_requests request
      where request.actor_id = p_user_id or request.recipient_id = p_user_id
      limit 1
    )
  ) then
    perform public.refresh_vibes_v5_3_contextual_taste(p_user_id);
  end if;

  v_seed_limit := least(50, greatest(v_limit * 2, 36));
  v_exploration_count := greatest(1, ceil(v_limit * 0.12)::integer);

  return query
  with base as materialized (
    select recommendation.*
    from public.get_vibes_recommendations_v5(
      p_user_id,
      v_segment,
      v_seed_limit,
      p_active_window_minutes
    ) recommendation
  ),
  exposure_stats as (
    select
      recommendation.target_profile_id,
      max(recommendation.shown_at) as last_shown_at,
      count(*) filter (
        where recommendation.shown_at >= timezone('utc', now()) - interval '24 hours'
      )::integer as shown_1d,
      count(*) filter (
        where recommendation.shown_at >= timezone('utc', now()) - interval '7 days'
      )::integer as shown_7d,
      bool_or(
        recommendation.shown_at is not null
        and request.client_session_id = v_session_id
      ) as shown_in_session
    from public.vibes_v5_3_recommendations recommendation
    join public.vibes_v5_3_requests request on request.id = recommendation.request_id
    where recommendation.viewer_profile_id = p_user_id
      and recommendation.shown_at is not null
      and recommendation.recommended_at >= timezone('utc', now()) - interval '30 days'
    group by recommendation.target_profile_id
  ),
  pair_feedback as (
    select
      event_row.target_profile_id,
      count(*) filter (where event_row.event_type = 'profile_opened')::integer as opens,
      count(*) filter (where event_row.event_type = 'full_profile_opened')::integer as full_opens,
      count(*) filter (where event_row.event_type in ('intro_played', 'intro_completed'))::integer as intros,
      count(*) filter (where event_row.event_type in ('signal_opened', 'intent_opened'))::integer as action_opens,
      count(*) filter (where coalesce(event_row.dwell_ms, 0) >= 12000)::integer as long_dwells,
      avg(coalesce(event_row.dwell_ms, 0))::double precision as avg_dwell_ms
    from public.vibes_events event_row
    where event_row.viewer_profile_id = p_user_id
      and event_row.created_at >= timezone('utc', now()) - interval '30 days'
    group by event_row.target_profile_id
  ),
  contextual_score as (
    select
      base.id as target_profile_id,
      coalesce(sum(weight.weight), 0)::double precision as score,
      coalesce(sum(weight.evidence_count), 0)::integer as evidence_count
    from base
    join public.profiles candidate on candidate.id = base.id
    left join lateral (
      select feature.feature_key, feature.feature_value
      from (
        select 'intention'::text, public.normalize_vibes_v5_intention(candidate.looking_for)
        union all select 'personality', nullif(lower(btrim(candidate.personality_type)), '')
        union all select 'religion', nullif(lower(btrim(candidate.religion::text)), '')
        union all select 'smoking', nullif(lower(btrim(candidate.smoking)), '')
        union all select 'drinking', nullif(lower(btrim(candidate.drinking)), '')
        union all select 'exercise', nullif(lower(btrim(candidate.exercise_frequency)), '')
        union all select 'children', nullif(lower(btrim(candidate.wants_children)), '')
        union all select 'love_language', nullif(lower(btrim(candidate.love_language)), '')
        union all select 'intro_media', case when nullif(btrim(candidate.profile_video), '') is not null then 'yes' end
        union all
        select 'interest', nullif(lower(btrim(interest.name)), '')
        from public.profile_interests profile_interest
        join public.interests interest on interest.id = profile_interest.interest_id
        where profile_interest.profile_id = candidate.id
      ) feature(feature_key, feature_value)
      where feature.feature_value is not null
    ) feature on true
    left join public.vibes_v5_3_feature_weights weight
      on weight.viewer_profile_id = p_user_id
     and weight.context in (v_segment, 'outcome')
     and weight.feature_key = feature.feature_key
     and weight.feature_value = feature.feature_value
    group by base.id
  ),
  scored as (
    select
      base.*,
      coalesce(exposure.shown_in_session, false) as shown_in_session,
      exposure.last_shown_at,
      coalesce(exposure.shown_1d, 0) as shown_1d,
      coalesce(exposure.shown_7d, 0) as shown_7d,
      case
        when exposure.last_shown_at is null then 0
        when exposure.last_shown_at < timezone('utc', now()) - interval '14 days' then 1
        when exposure.last_shown_at < timezone('utc', now()) - interval '7 days' then 2
        when exposure.last_shown_at < timezone('utc', now()) - interval '72 hours' then 3
        when exposure.last_shown_at < timezone('utc', now()) - interval '24 hours' then 4
        else 5
      end as freshness_tier,
      case
        when exposure.last_shown_at is null then 'unseen'
        when exposure.last_shown_at < timezone('utc', now()) - interval '14 days' then 'rested'
        when exposure.last_shown_at < timezone('utc', now()) - interval '7 days' then 'week'
        when exposure.last_shown_at < timezone('utc', now()) - interval '72 hours' then 'recent'
        when exposure.last_shown_at < timezone('utc', now()) - interval '24 hours' then 'cooldown'
        else 'same_day'
      end as freshness_bucket,
      greatest(0.0, least(100.0,
        coalesce(base.ai_score, 0)::double precision
        -- Neutralise V3's exact-pair re-engagement loop. These signals still
        -- teach feature taste; they no longer force the same person back up.
        - 0.72 * (
          least(coalesce(pair.opens, 0), 3) * 2.8
          + least(coalesce(pair.full_opens, 0), 3) * 1.8
          + least(coalesce(pair.intros, 0), 2) * 2.0
          + least(coalesce(pair.action_opens, 0), 3) * 1.9
          + least(coalesce(pair.long_dwells, 0), 3) * 1.4
          + least(coalesce(pair.avg_dwell_ms, 0) / 4000.0, 1.5) * 1.8
        )
        + least(7.0, greatest(-4.0, coalesce(contextual.score, 0) * 4.0))
      )) as adjusted_score,
      row_number() over (
        order by
          case when exposure.last_shown_at is null then 0 else 1 end,
          abs(hashtext(base.id::text || v_session_id::text || v_request_id::text)),
          coalesce(base.ai_score, 0) desc
      ) as exploration_rank
    from base
    left join exposure_stats exposure on exposure.target_profile_id = base.id
    left join pair_feedback pair on pair.target_profile_id = base.id
    left join contextual_score contextual on contextual.target_profile_id = base.id
  ),
  marked as (
    select
      scored.*,
      (
        scored.exploration_rank <= v_exploration_count
        and scored.freshness_tier <= 2
        and coalesce(scored.ai_score, 0) >= 35
      ) as is_exploration
    from scored
  ),
  lane_ranked as (
    select
      marked.*,
      row_number() over (
        partition by marked.is_exploration
        order by
          marked.shown_in_session,
          marked.freshness_tier,
          marked.adjusted_score desc,
          marked.last_active desc nulls last,
          marked.id
      ) as lane_rank
    from marked
  ),
  interleaved as (
    select
      lane_ranked.*,
      case
        when lane_ranked.is_exploration then lane_ranked.lane_rank * 7
        else lane_ranked.lane_rank + floor((lane_ranked.lane_rank - 1) / 6.0)::integer
      end as delivery_slot
    from lane_ranked
  ),
  selected as materialized (
    select
      interleaved.*,
      row_number() over (
        order by interleaved.delivery_slot, interleaved.is_exploration, interleaved.id
      )::integer as final_rank
    from interleaved
    order by interleaved.delivery_slot, interleaved.is_exploration, interleaved.id
    limit v_limit
  ),
  request_write as (
    insert into public.vibes_v5_3_requests as stored_request (
      id,
      client_session_id,
      viewer_profile_id,
      segment,
      refresh_ordinal,
      candidate_count,
      metadata
    )
    values (
      v_request_id,
      v_session_id,
      p_user_id,
      v_segment,
      greatest(coalesce(p_refresh_ordinal, 0), 0),
      (select count(*)::integer from selected),
      jsonb_build_object('seed_count', (select count(*) from base))
    )
    on conflict on constraint vibes_v5_3_requests_pkey do update
      set candidate_count = excluded.candidate_count,
          metadata = stored_request.metadata || excluded.metadata
    returning stored_request.id
  ),
  recommendation_write as (
    insert into public.vibes_v5_3_recommendations as stored_recommendation (
      request_id,
      viewer_profile_id,
      target_profile_id,
      segment,
      rank,
      score,
      is_exploration,
      freshness_bucket,
      metadata
    )
    select
      request_write.id,
      p_user_id,
      selected.id,
      v_segment,
      selected.final_rank,
      selected.adjusted_score,
      selected.is_exploration,
      selected.freshness_bucket,
      jsonb_build_object(
        'shown_in_session_before', selected.shown_in_session,
        'shown_1d', selected.shown_1d,
        'shown_7d', selected.shown_7d
      )
    from selected
    cross join request_write
    on conflict (request_id, target_profile_id) do update
      set rank = excluded.rank,
          score = excluded.score,
          is_exploration = excluded.is_exploration,
          freshness_bucket = excluded.freshness_bucket,
          metadata = excluded.metadata
    returning stored_recommendation.id, stored_recommendation.target_profile_id
  )
  select
    selected.id,
    selected.user_id,
    selected.full_name,
    selected.age,
    selected.bio,
    selected.avatar_url,
    selected.profile_video,
    selected.location,
    null::double precision as latitude,
    null::double precision as longitude,
    selected.region,
    selected.tribe,
    selected.religion,
    selected.personality_type,
    selected.is_active,
    selected.online,
    selected.last_active,
    selected.verified,
    selected.verification_level,
    round(selected.adjusted_score::numeric) as ai_score,
    selected.distance_km,
    selected.city,
    selected.current_country,
    selected.current_country_code,
    selected.location_precision,
    coalesce(selected.recommendation_reasons, '{}'::jsonb)
      || jsonb_build_object(
        'version', 'v5.3',
        'model', 'freshness_outcome_hybrid_3',
        'segment', v_segment,
        'session_id', v_session_id,
        'request_id', v_request_id,
        'recommendation_id', recommendation_write.id,
        'rank', selected.final_rank,
        'exploration', selected.is_exploration,
        'freshness_bucket', selected.freshness_bucket
      ) as recommendation_reasons
  from selected
  join recommendation_write on recommendation_write.target_profile_id = selected.id
  order by selected.final_rank;
end;
$$;

revoke all on function public.get_vibes_recommendations_v5_3(
  uuid, text, integer, integer, uuid, uuid, integer
) from public, anon;
grant execute on function public.get_vibes_recommendations_v5_3(
  uuid, text, integer, integer, uuid, uuid, integer
) to authenticated, service_role;

comment on function public.get_vibes_recommendations_v5_3(
  uuid, text, integer, integer, uuid, uuid, integer
) is
  'V5.3 reciprocal recommender with unseen-first session delivery, graduated cooldowns, 12% interleaved exploration, exact-pair loop neutralisation, contextual taste, downstream outcome learning, and privacy-safe attribution.';

notify pgrst, 'reload schema';
