drop function if exists public.rpc_get_closure_to_clarity_candidates(uuid, integer);

create or replace function public.rpc_get_closure_to_clarity_candidates(
  p_intent_request_id uuid,
  p_limit integer default 28
)
returns table (
  id uuid,
  full_name text,
  age integer,
  avatar_url text,
  city text,
  region text,
  current_country text,
  current_country_code text,
  religion text,
  looking_for text,
  wants_children text,
  love_language text,
  personality_type text,
  verification_level integer,
  phone_verified boolean,
  interests text[],
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
  quality_band integer,
  closure_similarity_score double precision,
  closure_timing_score double precision,
  closure_freshness_score double precision,
  closure_rank_score double precision
)
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_viewer_profile public.profiles%rowtype;
  v_target_profile public.profiles%rowtype;
  v_request public.intent_requests%rowtype;
  v_target_profile_id uuid;
  v_selected_reasons text[] := '{}'::text[];
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select profile.*
    into v_viewer_profile
  from public.profiles profile
  where profile.user_id = auth.uid()
    and profile.deleted_at is null
  limit 1;

  if v_viewer_profile.id is null then
    raise exception 'profile required' using errcode = '42501';
  end if;

  select request_row.*
    into v_request
  from public.intent_requests request_row
  where request_row.id = p_intent_request_id
    and (
      request_row.actor_id = v_viewer_profile.id
      or request_row.recipient_id = v_viewer_profile.id
    )
  limit 1;

  if v_request.id is null then
    raise exception 'intent request not found' using errcode = '42501';
  end if;

  if not (
    v_request.status in ('expired', 'passed', 'cancelled')
    or (
      v_request.status = 'pending'
      and v_request.expires_at <= timezone('utc'::text, now())
    )
  ) then
    raise exception 'intent request is not closed';
  end if;

  v_target_profile_id := case
    when v_request.actor_id = v_viewer_profile.id then v_request.recipient_id
    else v_request.actor_id
  end;

  select profile.*
    into v_target_profile
  from public.profiles profile
  where profile.id = v_target_profile_id
    and profile.deleted_at is null
  limit 1;

  if v_target_profile.id is null then
    raise exception 'target profile not found' using errcode = '42501';
  end if;

  select coalesce(reflection.selected_reasons, '{}'::text[])
    into v_selected_reasons
  from public.intent_reflections reflection
  where reflection.intent_request_id = p_intent_request_id
    and reflection.owner_profile_id = v_viewer_profile.id
  limit 1;

  return query
  with viewer_interests as (
    select coalesce(array_agg(distinct interest.name order by interest.name), '{}'::text[]) as names
    from public.profile_interests profile_interest
    join public.interests interest on interest.id = profile_interest.interest_id
    where profile_interest.profile_id = v_viewer_profile.id
  ),
  target_interests as (
    select coalesce(array_agg(distinct interest.name order by interest.name), '{}'::text[]) as names
    from public.profile_interests profile_interest
    join public.interests interest on interest.id = profile_interest.interest_id
    where profile_interest.profile_id = v_target_profile.id
  ),
  base_candidates as (
    select
      profile.id,
      profile.full_name,
      profile.age,
      profile.avatar_url,
      profile.city,
      profile.region,
      profile.current_country,
      profile.current_country_code,
      profile.religion::text as religion,
      profile.looking_for,
      profile.wants_children,
      profile.love_language,
      profile.personality_type,
      profile.verification_level,
      profile.phone_verified,
      profile.profile_video,
      profile.latitude,
      profile.longitude,
      profile.online,
      profile.last_active,
      profile.created_at,
      left(regexp_replace(coalesce(profile.bio, ''), '\s+', ' ', 'g'), 160) as bio_snippet,
      greatest(
        coalesce(array_length(profile.photos, 1), 0),
        case
          when profile.avatar_url is not null and btrim(profile.avatar_url) <> '' then 1
          else 0
        end
      ) as photo_count,
      (
        v_viewer_profile.min_age_interest is null
        or v_viewer_profile.max_age_interest is null
        or profile.age between v_viewer_profile.min_age_interest and v_viewer_profile.max_age_interest
      ) as within_viewer_age_pref,
      (
        v_target_profile.min_age_interest is null
        or v_target_profile.max_age_interest is null
        or profile.age between v_target_profile.min_age_interest and v_target_profile.max_age_interest
      ) as within_target_age_pref,
      (
        v_viewer_profile.gender is null
        or v_viewer_profile.gender not in ('MALE', 'FEMALE')
        or profile.gender is null
        or profile.gender not in ('MALE', 'FEMALE')
        or (v_viewer_profile.gender = 'MALE' and profile.gender = 'FEMALE')
        or (v_viewer_profile.gender = 'FEMALE' and profile.gender = 'MALE')
      ) as viewer_binary_gender_match,
      (
        v_target_profile.gender is null
        or v_target_profile.gender not in ('MALE', 'FEMALE')
        or profile.gender is null
        or profile.gender not in ('MALE', 'FEMALE')
        or (v_target_profile.gender = 'MALE' and profile.gender = 'FEMALE')
        or (v_target_profile.gender = 'FEMALE' and profile.gender = 'MALE')
      ) as target_binary_gender_match
    from public.profiles profile
    where profile.id <> v_viewer_profile.id
      and profile.id <> v_target_profile.id
      and profile.deleted_at is null
      and profile.profile_completed is true
      and coalesce(profile.discoverable_in_vibes, true) = true
      and profile.user_id is not null
      and profile.user_id <> v_viewer_profile.user_id
      and profile.full_name is not null
      and profile.age is not null
      and not exists (
        select 1
        from public.intent_requests request_row
        where (
          (request_row.actor_id = v_viewer_profile.id and request_row.recipient_id = profile.id)
          or (request_row.actor_id = profile.id and request_row.recipient_id = v_viewer_profile.id)
        )
          and (
            request_row.status in ('pending', 'accepted', 'matched')
            or (
              request_row.status = 'passed'
              and request_row.created_at > now() - interval '21 days'
            )
          )
      )
      and not exists (
        select 1
        from public.matches match_row
        where (match_row.user1_id = v_viewer_profile.id and match_row.user2_id = profile.id)
           or (match_row.user1_id = profile.id and match_row.user2_id = v_viewer_profile.id)
      )
      and not exists (
        select 1
        from public.blocks block_row
        where (block_row.blocker_id = v_viewer_profile.user_id and block_row.blocked_id = profile.user_id)
           or (block_row.blocker_id = profile.user_id and block_row.blocked_id = v_viewer_profile.user_id)
      )
      and coalesce((
        select swipe_row.action::text
        from public.swipes swipe_row
        where swipe_row.swiper_id = v_viewer_profile.id
          and swipe_row.target_id = profile.id
        order by swipe_row.created_at desc, swipe_row.id desc
        limit 1
      ), '') <> 'PASS'
  ),
  tiered_candidates as (
    select base_candidate.*, 0::integer as candidate_tier
    from base_candidates base_candidate
    where base_candidate.within_viewer_age_pref
      and base_candidate.within_target_age_pref
      and base_candidate.viewer_binary_gender_match
      and base_candidate.target_binary_gender_match

    union all

    select base_candidate.*, 1::integer as candidate_tier
    from base_candidates base_candidate
    where base_candidate.within_viewer_age_pref
      and base_candidate.viewer_binary_gender_match
      and base_candidate.target_binary_gender_match

    union all

    select base_candidate.*, 2::integer as candidate_tier
    from base_candidates base_candidate
    where base_candidate.within_target_age_pref
      and base_candidate.viewer_binary_gender_match
      and base_candidate.target_binary_gender_match

    union all

    select base_candidate.*, 3::integer as candidate_tier
    from base_candidates base_candidate
    where base_candidate.viewer_binary_gender_match
      and base_candidate.target_binary_gender_match
  ),
  candidate_selection as (
    select selected.*
    from (
      select
        tiered_candidate.*,
        row_number() over (
          partition by tiered_candidate.id
          order by tiered_candidate.candidate_tier asc
        ) as tier_rank
      from tiered_candidates tiered_candidate
    ) selected
    where selected.tier_rank = 1
  ),
  enriched as (
    select
      candidate.id,
      candidate.full_name,
      candidate.age,
      candidate.avatar_url,
      candidate.city,
      candidate.region,
      candidate.current_country,
      candidate.current_country_code,
      candidate.religion,
      candidate.looking_for,
      candidate.wants_children,
      candidate.love_language,
      candidate.personality_type,
      candidate.verification_level,
      candidate.phone_verified,
      coalesce(candidate_interest_names.names, '{}'::text[]) as interests,
      coalesce(shared_target.shared_interest_names, '{}'::text[]) as shared_interest_names,
      coalesce(shared_target.shared_interest_count, 0) as shared_interest_count,
      coalesce(shared_viewer.shared_interest_count, 0) as viewer_shared_interest_count,
      prompt.prompt_title,
      prompt.prompt_answer,
      nullif(candidate.bio_snippet, '') as bio_snippet,
      candidate.profile_video,
      candidate.latitude,
      candidate.longitude,
      candidate.online,
      candidate.last_active,
      candidate.photo_count,
      candidate.candidate_tier,
      (
        nullif(lower(btrim(coalesce(candidate.region, ''))), '') is not null
        and nullif(lower(btrim(coalesce(v_target_profile.region, ''))), '') is not null
        and lower(btrim(candidate.region)) = lower(btrim(v_target_profile.region))
      ) as same_region,
      (
        nullif(lower(btrim(coalesce(candidate.religion, ''))), '') is not null
        and nullif(lower(btrim(coalesce(v_target_profile.religion::text, ''))), '') is not null
        and lower(btrim(candidate.religion)) = lower(btrim(v_target_profile.religion::text))
      ) as same_religion,
      (
        nullif(lower(btrim(coalesce(candidate.looking_for, ''))), '') is not null
        and nullif(lower(btrim(coalesce(v_target_profile.looking_for, ''))), '') is not null
        and lower(btrim(candidate.looking_for)) = lower(btrim(v_target_profile.looking_for))
      ) as same_looking_for
    from candidate_selection candidate
    left join lateral (
      select coalesce(array_agg(distinct interest.name order by interest.name), '{}'::text[]) as names
      from public.profile_interests profile_interest
      join public.interests interest on interest.id = profile_interest.interest_id
      where profile_interest.profile_id = candidate.id
    ) candidate_interest_names on true
    cross join target_interests
    cross join viewer_interests
    left join lateral (
      select
        count(*)::integer as shared_interest_count,
        (coalesce(array_agg(interest.name order by interest.name), '{}'::text[]))[1:4] as shared_interest_names
      from public.profile_interests profile_interest
      join public.interests interest on interest.id = profile_interest.interest_id
      where profile_interest.profile_id = candidate.id
        and interest.name = any(target_interests.names)
    ) shared_target on true
    left join lateral (
      select count(*)::integer as shared_interest_count
      from public.profile_interests profile_interest
      join public.interests interest on interest.id = profile_interest.interest_id
      where profile_interest.profile_id = candidate.id
        and interest.name = any(viewer_interests.names)
    ) shared_viewer on true
    left join lateral (
      select
        profile_prompt.prompt_title,
        profile_prompt.answer as prompt_answer
      from public.profile_prompts profile_prompt
      where profile_prompt.profile_id = candidate.id
        and profile_prompt.answer is not null
        and btrim(profile_prompt.answer) <> ''
      order by profile_prompt.updated_at desc nulls last, profile_prompt.created_at desc, profile_prompt.id desc
      limit 1
    ) prompt on true
  ),
  scored as (
    select
      enriched.*,
      (
        enriched.profile_video is not null
        and btrim(enriched.profile_video) <> ''
      ) as has_intro_video,
      case
        when v_viewer_profile.latitude is null
          or v_viewer_profile.longitude is null
          or enriched.latitude is null
          or enriched.longitude is null
          then null::double precision
        else (
          6371 * 2 * asin(
            sqrt(
              power(sin(radians((enriched.latitude - v_viewer_profile.latitude) / 2)), 2)
              + cos(radians(v_viewer_profile.latitude))
              * cos(radians(enriched.latitude))
              * power(sin(radians((enriched.longitude - v_viewer_profile.longitude) / 2)), 2)
            )
          )
        )
      end as distance_km,
      coalesce((enriched.online = true or enriched.last_active > now() - interval '20 minutes'), false) as active_now,
      coalesce((enriched.last_active > now() - interval '3 days'), false) as recently_active,
      (
        least(enriched.shared_interest_count, 4) * (
          case
            when 'interests_lifestyle' = any(v_selected_reasons) then 3.4
            else 2.5
          end
        )
        + case
            when enriched.same_looking_for then
              case
                when 'relationship_intent' = any(v_selected_reasons) then 4.8
                else 3.2
              end
            else 0
          end
        + case
            when enriched.same_religion then
              case
                when 'shared_values' = any(v_selected_reasons)
                  or 'faith_family' = any(v_selected_reasons)
                  then 3.6
                else 1.3
              end
            else 0
          end
        + case
            when 'faith_family' = any(v_selected_reasons)
              and nullif(lower(btrim(coalesce(enriched.wants_children, ''))), '') is not null
              and nullif(lower(btrim(coalesce(v_target_profile.wants_children, ''))), '') is not null
              and lower(btrim(enriched.wants_children)) = lower(btrim(v_target_profile.wants_children))
              then 2.8
            else 0
          end
        + case
            when 'personality' = any(v_selected_reasons)
              and nullif(lower(btrim(coalesce(enriched.personality_type, ''))), '') is not null
              and nullif(lower(btrim(coalesce(v_target_profile.personality_type, ''))), '') is not null
              and lower(btrim(enriched.personality_type)) = lower(btrim(v_target_profile.personality_type))
              then 2.1
            else 0
          end
        + case
            when 'personality' = any(v_selected_reasons)
              and nullif(lower(btrim(coalesce(enriched.love_language, ''))), '') is not null
              and nullif(lower(btrim(coalesce(v_target_profile.love_language, ''))), '') is not null
              and lower(btrim(enriched.love_language)) = lower(btrim(v_target_profile.love_language))
              then 1.9
            else 0
          end
        + case
            when 'culture_location' = any(v_selected_reasons) and enriched.same_region then 1.7
            when 'culture_location' = any(v_selected_reasons)
              and nullif(lower(btrim(coalesce(enriched.current_country, ''))), '') is not null
              and nullif(lower(btrim(coalesce(v_target_profile.current_country, ''))), '') is not null
              and lower(btrim(enriched.current_country)) = lower(btrim(v_target_profile.current_country))
              then 1.2
            else 0
          end
        + least(enriched.viewer_shared_interest_count, 2) * 0.7
      )::double precision as closure_similarity_score,
      (
        case when enriched.online = true or enriched.last_active > now() - interval '20 minutes' then 4.0 else 0 end
        + case when enriched.last_active > now() - interval '24 hours' then 1.7 when enriched.last_active > now() - interval '3 days' then 0.8 else 0 end
        + case when enriched.profile_video is not null and btrim(enriched.profile_video) <> '' then 2.2 else 0 end
        + case when coalesce(enriched.phone_verified, false) or coalesce(enriched.verification_level, 0) > 0 then 1.8 else 0 end
        + case when enriched.prompt_title is not null then 1.1 else 0 end
        + case
            when char_length(coalesce(enriched.bio_snippet, '')) >= 120 then 0.8
            when char_length(coalesce(enriched.bio_snippet, '')) >= 50 then 0.35
            else 0
          end
        + case
            when enriched.photo_count >= 3 then 0.6
            when enriched.photo_count = 2 then 0.25
            else 0
          end
      )::double precision as closure_timing_score,
      (
        least(
          (
            case
              when nullif(lower(btrim(coalesce(enriched.region, ''))), '') is not null
                and nullif(lower(btrim(coalesce(v_target_profile.region, ''))), '') is not null
                and lower(btrim(enriched.region)) <> lower(btrim(v_target_profile.region))
                then 1
              else 0
            end
            + case
                when nullif(lower(btrim(coalesce(enriched.current_country, ''))), '') is not null
                  and nullif(lower(btrim(coalesce(v_target_profile.current_country, ''))), '') is not null
                  and lower(btrim(enriched.current_country)) <> lower(btrim(v_target_profile.current_country))
                  then 1
                else 0
              end
            + case
                when nullif(lower(btrim(coalesce(enriched.personality_type, ''))), '') is not null
                  and nullif(lower(btrim(coalesce(v_target_profile.personality_type, ''))), '') is not null
                  and lower(btrim(enriched.personality_type)) <> lower(btrim(v_target_profile.personality_type))
                  then 1
                else 0
              end
            + case
                when nullif(lower(btrim(coalesce(enriched.religion, ''))), '') is not null
                  and nullif(lower(btrim(coalesce(v_target_profile.religion::text, ''))), '') is not null
                  and lower(btrim(enriched.religion)) <> lower(btrim(v_target_profile.religion::text))
                  then 1
                else 0
              end
          )::double precision,
          3
        ) * 1.35
        + case when enriched.same_looking_for then 1.4 else 0 end
        + case when enriched.shared_interest_count > 0 then 0.9 else 0 end
      )::double precision as closure_freshness_score
    from enriched
  ),
  ranked as (
    select
      scored.*,
      (
        case
          when scored.shared_interest_count >= 2 and scored.same_looking_for then 3
          when scored.shared_interest_count >= 1 or scored.same_looking_for or scored.same_religion then 2
          when scored.has_intro_video or scored.active_now or scored.prompt_title is not null then 1
          else 0
        end
      )::integer as quality_band,
      (
        scored.closure_similarity_score * 1.18
        + scored.closure_timing_score * 0.78
        + scored.closure_freshness_score * 0.56
        + case when scored.distance_km is null then 0 when scored.distance_km <= 25 then 1.4 when scored.distance_km <= 100 then 0.6 when scored.distance_km <= 500 then 0 else -0.6 end
        - case
            when scored.candidate_tier = 1 then 0.85
            when scored.candidate_tier = 2 then 1.1
            when scored.candidate_tier = 3 then 1.45
            else 0
          end
      )::double precision as closure_rank_score
    from scored
  ),
  diversified as (
    select
      ranked.*,
      row_number() over (
        partition by coalesce(nullif(lower(btrim(coalesce(ranked.region, ''))), ''), '<<none>>')
        order by ranked.quality_band desc, ranked.closure_rank_score desc, ranked.distance_km asc nulls last, ranked.last_active desc nulls last, ranked.id desc
      ) as region_rank,
      row_number() over (
        partition by
          case
            when ranked.shared_interest_count >= 2 then 'deep_overlap'
            when ranked.same_looking_for then 'intent'
            when ranked.has_intro_video then 'intro'
            when ranked.active_now then 'active'
            else 'general'
          end
        order by ranked.quality_band desc, ranked.closure_rank_score desc, ranked.distance_km asc nulls last, ranked.last_active desc nulls last, ranked.id desc
      ) as archetype_rank
    from ranked
  )
  select
    diversified.id,
    diversified.full_name,
    diversified.age,
    diversified.avatar_url,
    diversified.city,
    diversified.region,
    diversified.current_country,
    diversified.current_country_code,
    diversified.religion,
    diversified.looking_for,
    diversified.wants_children,
    diversified.love_language,
    diversified.personality_type,
    diversified.verification_level,
    diversified.phone_verified,
    diversified.interests,
    (array_remove(array[
      case when diversified.shared_interest_count > 0 then 'Shared spark' end,
      case when diversified.same_looking_for then 'Same intent' end,
      case when diversified.same_religion then 'Shared values' end,
      case when diversified.has_intro_video then 'Intro video' end,
      case when diversified.active_now then 'Active now' end,
      case when diversified.prompt_title is not null then 'Strong prompt' end
    ], null))[1:4] as short_tags,
    diversified.has_intro_video,
    diversified.distance_km,
    diversified.shared_interest_names,
    diversified.shared_interest_count,
    diversified.prompt_title,
    diversified.prompt_answer,
    diversified.bio_snippet,
    diversified.same_region,
    diversified.same_religion,
    diversified.same_looking_for,
    diversified.active_now,
    diversified.recently_active,
    diversified.candidate_tier,
    diversified.quality_band,
    diversified.closure_similarity_score,
    diversified.closure_timing_score,
    diversified.closure_freshness_score,
    diversified.closure_rank_score
  from diversified
  order by
    diversified.quality_band desc,
    (
      diversified.closure_rank_score
      - greatest(diversified.region_rank - 2, 0) * 0.55
      - greatest(diversified.archetype_rank - 2, 0) * 0.35
    ) desc,
    diversified.distance_km asc nulls last,
    diversified.last_active desc nulls last,
    diversified.id desc
  limit greatest(1, least(coalesce(p_limit, 28), 40));
end;
$$;

revoke all on function public.rpc_get_closure_to_clarity_candidates(uuid, integer) from public;
grant execute on function public.rpc_get_closure_to_clarity_candidates(uuid, integer) to authenticated;
