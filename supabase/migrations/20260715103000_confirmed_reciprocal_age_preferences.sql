-- Treat only deliberately confirmed age preferences as reciprocal hard gates.
-- Historic profiles inherited database defaults without an explicit user choice;
-- those defaults must not silently collapse the recommendation deck.

alter table public.profiles
  add column if not exists age_preference_confirmed_at timestamptz;

comment on column public.profiles.age_preference_confirmed_at is
  'Set only when the member explicitly confirms or edits their preferred age range. Null means legacy/unconfirmed and is not a reciprocal hard exclusion.';

create or replace function public.get_vibes_recommendations_v5(
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
declare
  v_limit integer := greatest(1, least(coalesce(p_limit, 30), 50));
  v_seed_limit integer;
  v_viewer public.profiles%rowtype;
  v_viewer_compass jsonb := '{}'::jsonb;
  v_taste_evidence integer := 0;
begin
  if auth.uid() is null then
    return;
  end if;

  select profile.* into v_viewer
  from public.profiles profile
  where profile.id = p_user_id
    and profile.user_id = auth.uid()
    and profile.deleted_at is null
  limit 1;

  if v_viewer.id is null then
    return;
  end if;

  v_viewer_compass := case
    when jsonb_typeof(coalesce(v_viewer.relationship_compass, '{}'::jsonb)) = 'object'
      then coalesce(v_viewer.relationship_compass, '{}'::jsonb)
    else '{}'::jsonb
  end;

  -- First use gets an immediate taste snapshot. Subsequent updates are queued
  -- and processed asynchronously so feed reads remain predictable.
  if not exists (
    select 1
    from public.vibes_v5_viewer_feature_weights weights
    where weights.viewer_profile_id = p_user_id
  ) and exists (
    select 1 from public.vibes_events event_row
    where event_row.viewer_profile_id = p_user_id
    limit 1
  ) then
    perform public.refresh_vibes_v5_viewer_taste(p_user_id);
  end if;

  select count(*)::integer
  into v_taste_evidence
  from public.vibes_events event_row
  where event_row.viewer_profile_id = p_user_id
    and event_row.created_at >= timezone('utc', now()) - interval '180 days'
    and event_row.event_type in (
      'profile_opened', 'full_profile_opened', 'intro_played', 'intro_completed',
      'profile_saved', 'pass', 'like', 'signal_sent', 'intent_sent', 'undo'
    );

  v_seed_limit := least(80, greatest(v_limit * 3, 50));

  return query
  with base as materialized (
    select recommendation.*
    from public.get_vibes_recommendations_v3(
      p_user_id,
      p_segment,
      v_seed_limit,
      p_active_window_minutes
    ) recommendation
  ),
  viewer_interests as (
    select profile_interest.interest_id
    from public.profile_interests profile_interest
    where profile_interest.profile_id = p_user_id
  ),
  candidate_facts as (
    select
      base.*,
      candidate.min_age_interest as candidate_min_age,
      candidate.max_age_interest as candidate_max_age,
      candidate.age_preference_confirmed_at as candidate_age_preference_confirmed_at,
      candidate.looking_for as candidate_looking_for,
      candidate.relationship_compass as candidate_compass,
      candidate.smoking,
      candidate.drinking,
      candidate.exercise_frequency,
      candidate.wants_children,
      candidate.love_language,
      candidate.education,
      candidate.occupation,
      candidate.profile_video as candidate_profile_video,
      candidate.last_active as candidate_last_active,
      public.normalize_vibes_v5_intention(
        coalesce(candidate.relationship_compass->>'intention', candidate.looking_for)
      ) as candidate_intention,
      public.normalize_vibes_v5_intention(
        coalesce(v_viewer_compass->>'intention', v_viewer.looking_for)
      ) as viewer_intention,
      coalesce(candidate.verification_level, 0) > 0 as candidate_verified,
      coalesce(v_viewer.verification_level, 0) > 0 as viewer_verified,
      coalesce((
        select count(*)
        from public.profile_interests candidate_interest
        join viewer_interests viewer_interest
          on viewer_interest.interest_id = candidate_interest.interest_id
        where candidate_interest.profile_id = candidate.id
      ), 0)::integer as shared_interest_count
    from base
    join public.profiles candidate on candidate.id = base.id
    where candidate.deleted_at is null
      and (
        candidate.age_preference_confirmed_at is null
        or v_viewer.age is null
        or candidate.min_age_interest is null
        or v_viewer.age >= candidate.min_age_interest
      )
      and (
        candidate.age_preference_confirmed_at is null
        or v_viewer.age is null
        or candidate.max_age_interest is null
        or v_viewer.age <= candidate.max_age_interest
      )
  ),
  candidate_features as (
    select distinct
      candidate_facts.id as candidate_id,
      feature.feature_key,
      feature.feature_value
    from candidate_facts
    cross join lateral (
      select 'intention'::text, candidate_facts.candidate_intention
      union all select 'personality', nullif(lower(btrim(candidate_facts.personality_type)), '')
      union all select 'smoking', nullif(lower(btrim(candidate_facts.smoking)), '')
      union all select 'drinking', nullif(lower(btrim(candidate_facts.drinking)), '')
      union all select 'exercise', nullif(lower(btrim(candidate_facts.exercise_frequency)), '')
      union all select 'children', nullif(lower(btrim(candidate_facts.wants_children)), '')
      union all select 'love_language', nullif(lower(btrim(candidate_facts.love_language)), '')
      union all select 'intro_media', case when nullif(btrim(candidate_facts.candidate_profile_video), '') is not null then 'yes' end
      union all select 'activity', case when candidate_facts.candidate_last_active >= timezone('utc', now()) - interval '3 days' then 'recent' end
      union all
      select 'interest', nullif(lower(btrim(interest.name)), '')
      from public.profile_interests profile_interest
      join public.interests interest on interest.id = profile_interest.interest_id
      where profile_interest.profile_id = candidate_facts.id
    ) as feature(feature_key, feature_value)
    where feature.feature_value is not null
  ),
  taste_scores as (
    select
      candidate_features.candidate_id,
      coalesce(sum(
        weights.weight * case candidate_features.feature_key
          when 'intention' then 1.25
          when 'interest' then 1.00
          when 'personality' then 0.80
          when 'children' then 0.75
          when 'love_language' then 0.65
          when 'exercise' then 0.55
          when 'smoking' then 0.55
          when 'drinking' then 0.50
          when 'intro_media' then 0.45
          when 'activity' then 0.35
          else 0
        end
      ), 0)::double precision as raw_taste_score,
      count(weights.feature_value)::integer as matched_taste_features
    from candidate_features
    left join public.vibes_v5_viewer_feature_weights weights
      on weights.viewer_profile_id = p_user_id
     and weights.feature_key = candidate_features.feature_key
     and weights.feature_value = candidate_features.feature_value
    group by candidate_features.candidate_id
  ),
  pair_scored as (
    select
      candidate_facts.*,
      coalesce(taste_scores.matched_taste_features, 0) as matched_taste_features,
      least(8.0, greatest(-8.0,
        coalesce(taste_scores.raw_taste_score, 0)
          * least(1.0, sqrt(greatest(v_taste_evidence, 0)::double precision / 30.0))
          * 2.4
      )) as learned_taste_score,
      case
        when candidate_facts.viewer_intention is null or candidate_facts.candidate_intention is null then 0
        when candidate_facts.viewer_intention = candidate_facts.candidate_intention then 6.0
        when candidate_facts.viewer_intention = 'open' or candidate_facts.candidate_intention = 'open' then 2.0
        when candidate_facts.viewer_intention = 'committed' and candidate_facts.candidate_intention = 'friendship' then -3.0
        when candidate_facts.viewer_intention = 'friendship' and candidate_facts.candidate_intention = 'committed' then -2.0
        when candidate_facts.viewer_intention <> candidate_facts.candidate_intention then -5.0
        else 0
      end as intention_score,
      least(candidate_facts.shared_interest_count, 4) * 1.15 as explicit_interest_score,
      case
        when lower(coalesce(v_viewer_compass#>>'{flexibility,verified}', 'open')) = 'must'
          then case when candidate_facts.candidate_verified then 2.5 else -100 end
        when lower(coalesce(v_viewer_compass#>>'{flexibility,verified}', 'open')) = 'prefer'
          then case when candidate_facts.candidate_verified then 1.1 else -0.4 end
        else 0
      end
      + case
          when lower(coalesce(candidate_facts.candidate_compass#>>'{flexibility,verified}', 'open')) = 'must'
            then case when candidate_facts.viewer_verified then 2.0 else -100 end
          when lower(coalesce(candidate_facts.candidate_compass#>>'{flexibility,verified}', 'open')) = 'prefer'
            then case when candidate_facts.viewer_verified then 0.8 else -0.3 end
          else 0
        end as reciprocal_verification_score,
      case
        when lower(coalesce(v_viewer_compass#>>'{flexibility,religion}', 'open')) = 'must'
          and (
            nullif(lower(v_viewer.religion::text), '') is null
            or nullif(lower(candidate_facts.religion), '') is null
          ) then -100
        when nullif(lower(v_viewer.religion::text), '') is null
          or nullif(lower(candidate_facts.religion), '') is null then 0
        when lower(v_viewer.religion::text) = lower(candidate_facts.religion) then
          case lower(coalesce(v_viewer_compass#>>'{priorities,religion}', 'open'))
            when 'essential' then 5.0 when 'nice' then 2.3 else 0.4 end
        else
          case
            when lower(coalesce(v_viewer_compass#>>'{flexibility,religion}', 'open')) = 'must' then -100
            when lower(coalesce(v_viewer_compass#>>'{priorities,religion}', 'open')) = 'essential' then -4.0
            when lower(coalesce(v_viewer_compass#>>'{flexibility,religion}', 'open')) = 'prefer' then -1.2
            else 0
          end
      end
      + case
          when lower(coalesce(candidate_facts.candidate_compass#>>'{flexibility,religion}', 'open')) = 'must'
            and (
              nullif(lower(v_viewer.religion::text), '') is null
              or nullif(lower(candidate_facts.religion), '') is null
            ) then -100
          when nullif(lower(v_viewer.religion::text), '') is null
            or nullif(lower(candidate_facts.religion), '') is null then 0
          when lower(v_viewer.religion::text) = lower(candidate_facts.religion) then
            case lower(coalesce(candidate_facts.candidate_compass#>>'{priorities,religion}', 'open'))
              when 'essential' then 3.5 when 'nice' then 1.5 else 0 end
          when lower(coalesce(candidate_facts.candidate_compass#>>'{flexibility,religion}', 'open')) = 'must' then -100
          else 0
        end as reciprocal_religion_score,
      case
        when lower(coalesce(v_viewer_compass#>>'{flexibility,children}', 'open')) = 'must'
          and (
            nullif(lower(v_viewer.wants_children), '') is null
            or nullif(lower(candidate_facts.wants_children), '') is null
          ) then -100
        when nullif(lower(v_viewer.wants_children), '') is null
          or nullif(lower(candidate_facts.wants_children), '') is null then 0
        when lower(v_viewer.wants_children) = lower(candidate_facts.wants_children) then
          case lower(coalesce(v_viewer_compass#>>'{priorities,family}', 'open'))
            when 'essential' then 4.0 when 'nice' then 1.8 else 0.3 end
        when lower(coalesce(v_viewer_compass#>>'{flexibility,children}', 'open')) = 'must' then -100
        when lower(coalesce(v_viewer_compass#>>'{priorities,family}', 'open')) = 'essential' then -3.5
        else -0.4
      end
      + case
          when lower(coalesce(candidate_facts.candidate_compass#>>'{flexibility,children}', 'open')) = 'must'
            and (
              nullif(lower(v_viewer.wants_children), '') is null
              or nullif(lower(candidate_facts.wants_children), '') is null
            ) then -100
          when nullif(lower(v_viewer.wants_children), '') is null
            or nullif(lower(candidate_facts.wants_children), '') is null then 0
          when lower(v_viewer.wants_children) = lower(candidate_facts.wants_children) then
            case lower(coalesce(candidate_facts.candidate_compass#>>'{priorities,family}', 'open'))
              when 'essential' then 3.0 when 'nice' then 1.2 else 0 end
          when lower(coalesce(candidate_facts.candidate_compass#>>'{flexibility,children}', 'open')) = 'must' then -100
          else 0
        end as reciprocal_family_score,
      (
        case when nullif(lower(v_viewer.smoking), '') is not null
          and lower(v_viewer.smoking) = lower(coalesce(candidate_facts.smoking, '')) then 0.8 else 0 end
        + case when nullif(lower(v_viewer.drinking), '') is not null
          and lower(v_viewer.drinking) = lower(coalesce(candidate_facts.drinking, '')) then 0.6 else 0 end
        + case when nullif(lower(v_viewer.exercise_frequency), '') is not null
          and lower(v_viewer.exercise_frequency) = lower(coalesce(candidate_facts.exercise_frequency, '')) then 0.7 else 0 end
        + case when nullif(lower(v_viewer.love_language), '') is not null
          and lower(v_viewer.love_language) = lower(coalesce(candidate_facts.love_language, '')) then 0.9 else 0 end
      ) * case lower(coalesce(v_viewer_compass#>>'{priorities,lifestyle}', 'open'))
        when 'essential' then 1.4 when 'nice' then 0.8 else 0.25 end as lifestyle_score
    from candidate_facts
    left join taste_scores on taste_scores.candidate_id = candidate_facts.id
  ),
  eligible as (
    select pair_scored.*
    from pair_scored
    where pair_scored.reciprocal_verification_score > -50
      and pair_scored.reciprocal_religion_score > -50
      and pair_scored.reciprocal_family_score > -50
      and (
        lower(coalesce(v_viewer_compass#>>'{geography,mode}', 'open')) <> 'nearby'
        or (
          pair_scored.distance_km is not null
          and pair_scored.distance_km <= greatest(
            10,
            least(
              500,
              case
                when coalesce(v_viewer_compass#>>'{geography,radius}', '') ~ '^[0-9]+([.][0-9]+)?$'
                  then (v_viewer_compass#>>'{geography,radius}')::double precision
                else 50
              end
            )
          )
        )
        or (
          nullif(lower(btrim(v_viewer.city)), '') is not null
          and lower(btrim(coalesce(pair_scored.city, ''))) = lower(btrim(v_viewer.city))
        )
      )
      and (
        lower(coalesce(v_viewer_compass#>>'{geography,mode}', 'open')) <> 'same_city'
        or nullif(lower(btrim(v_viewer.city)), '') is null
        or lower(btrim(coalesce(pair_scored.city, ''))) = lower(btrim(v_viewer.city))
      )
  ),
  final_scored as (
    select
      eligible.*,
      least(100.0, greatest(0.0,
        coalesce(eligible.ai_score, 0)::double precision * 0.72
        + eligible.intention_score
        + eligible.explicit_interest_score
        + eligible.learned_taste_score
        + eligible.reciprocal_verification_score
        + eligible.reciprocal_religion_score
        + eligible.reciprocal_family_score
        + eligible.lifestyle_score
        + case
            when eligible.candidate_age_preference_confirmed_at is null then 0.6
            when eligible.candidate_min_age is not null
              and eligible.candidate_max_age is not null
              and v_viewer.age between eligible.candidate_min_age and eligible.candidate_max_age then 2.2
            else 0.6
          end
        + case
            when v_taste_evidence < 30
              then ((abs(hashtext(eligible.id::text || p_user_id::text || current_date::text)) % 100)::double precision / 100.0) * 2.2
            else ((abs(hashtext(eligible.id::text || p_user_id::text || current_date::text)) % 100)::double precision / 100.0) * 0.8
          end
      )) as v5_score
    from eligible
  ),
  ordered as (
    select
      final_scored.*,
      row_number() over (
        partition by coalesce(nullif(lower(btrim(final_scored.city)), ''), nullif(lower(btrim(final_scored.region)), ''), 'global')
        order by final_scored.v5_score desc, final_scored.last_active desc nulls last
      ) as locality_rank
    from final_scored
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
    null::double precision as latitude,
    null::double precision as longitude,
    ordered.region,
    ordered.tribe,
    ordered.religion,
    ordered.personality_type,
    ordered.is_active,
    ordered.online,
    ordered.last_active,
    ordered.verified,
    ordered.verification_level,
    round(greatest(
      0,
      least(100, ordered.v5_score - greatest(ordered.locality_rank - 3, 0) * 0.35)
    )::numeric) as ai_score,
    ordered.distance_km,
    ordered.city,
    ordered.current_country,
    ordered.current_country_code,
    ordered.location_precision,
    coalesce(ordered.recommendation_reasons, '{}'::jsonb)
      || jsonb_build_object(
        'version', 'v5',
        'model', 'reciprocal_hybrid_2',
        'taste_confidence', least(1.0, sqrt(greatest(v_taste_evidence, 0)::double precision / 60.0)),
        'public_reasons', (
          select coalesce(jsonb_agg(distinct reason.value), '[]'::jsonb)
          from jsonb_array_elements_text(
            coalesce(ordered.recommendation_reasons->'public_reasons', '[]'::jsonb)
            || to_jsonb(array_remove(array[
              case when ordered.intention_score >= 5 then 'mutual_intent' end,
              case when ordered.explicit_interest_score >= 2.3 then 'shared_interests' end,
              case when ordered.learned_taste_score >= 2 then 'learned_taste' end,
              case when ordered.reciprocal_religion_score + ordered.reciprocal_family_score >= 3 then 'shared_values' end,
              case when ordered.lifestyle_score >= 1.2 then 'lifestyle_fit' end,
              case when ordered.candidate_age_preference_confirmed_at is not null and ordered.candidate_min_age is not null and ordered.candidate_max_age is not null then 'reciprocal_fit' end
            ]::text[], null))
          ) reason(value)
        )
      ) as recommendation_reasons
  from ordered
  order by
    (ordered.v5_score - greatest(ordered.locality_rank - 3, 0) * 0.35) desc,
    ordered.last_active desc nulls last,
    ordered.id
  limit v_limit;
end;
$$;

revoke all on function public.get_vibes_recommendations_v5(uuid, text, integer, integer) from public, anon;
grant execute on function public.get_vibes_recommendations_v5(uuid, text, integer, integer) to authenticated, service_role;

comment on function public.get_vibes_recommendations_v5(uuid, text, integer, integer) is
  'V5.2 reciprocal hybrid recommender. Candidate age preferences are hard eligibility gates only after explicit confirmation; legacy defaults remain rank-neutral and cannot collapse deck breadth.';
