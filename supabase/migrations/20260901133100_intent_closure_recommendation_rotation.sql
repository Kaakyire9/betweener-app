-- Slow, coherent delivery fields for Intent Suggested and Closure to Clarity.
-- Requires 20260901133000_recommendation_rotation_foundation.sql.

begin;

-- Intent Suggested keeps its mature taste/quality model, but a delivery layer
-- removes reciprocal-age fallbacks and freezes the chosen field for one day.
create or replace function public.rpc_get_suggested_moves_v2(
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
set row_security = off
as $$
#variable_conflict use_column
declare
  v_bucket_start timestamptz := date_trunc('day', timezone('utc', now())) at time zone 'utc';
  v_bucket_key text := to_char(timezone('utc', now()), 'YYYY-MM-DD');
  v_limit integer := greatest(1, least(coalesce(p_limit, 6), 12));
begin
  if auth.uid() is null or not exists (
    select 1 from public.profiles viewer
    where viewer.id = p_profile_id
      and viewer.user_id = auth.uid()
      and viewer.deleted_at is null
      and viewer.account_state = 'active'
  ) then
    raise exception 'viewer profile does not belong to authenticated user' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.profile_recommendation_batches batch
    where batch.viewer_profile_id = p_profile_id
      and batch.surface = 'intent_suggested'
      and batch.context_key = ''
      and batch.bucket_key = v_bucket_key
  ) then
    insert into public.profile_recommendation_batches (
      viewer_profile_id, surface, context_key, bucket_key, candidate_profile_id, rank
    )
    with seed as (
      select base.*, base.ordinality::integer as source_rank
      from public.rpc_get_suggested_moves(
        p_profile_id, greatest(48, v_limit * 10)
      ) with ordinality as base
      where public.is_romantically_eligible(p_profile_id, base.id, 'global', null)
    ), ranked as (
      select seed.*,
        exposure.last_prior_impression_at,
        row_number() over (
          order by
            case
              when exposure.last_prior_impression_at is null then 0
              when exposure.last_prior_impression_at < v_bucket_start - interval '14 days' then 1
              when exposure.last_prior_impression_at < v_bucket_start - interval '72 hours' then 2
              else 3
            end,
            seed.source_rank,
            seed.id
        )::integer as delivery_rank
      from seed
      left join lateral (
        select max(event_row.created_at) as last_prior_impression_at
        from public.suggested_move_events event_row
        where event_row.viewer_profile_id = p_profile_id
          and event_row.candidate_profile_id = seed.id
          and event_row.surface = 'intent_suggested'
          and event_row.event_type = 'impression'
          and event_row.created_at < v_bucket_start
      ) exposure on true
    )
    select p_profile_id, 'intent_suggested', '', v_bucket_key, ranked.id, ranked.delivery_rank
    from ranked
    where ranked.delivery_rank <= 36
    on conflict do nothing;
  end if;

  return query
  with seed as (
    select base.*
    from public.rpc_get_suggested_moves(
      p_profile_id, greatest(72, v_limit * 12)
    ) base
    where public.is_romantically_eligible(p_profile_id, base.id, 'global', null)
  )
  select
    seed.id, seed.full_name, seed.age, seed.avatar_url, seed.short_tags,
    seed.has_intro_video, seed.distance_km, seed.shared_interest_names,
    seed.shared_interest_count, seed.prompt_title, seed.prompt_answer,
    seed.bio_snippet, seed.same_region, seed.same_religion,
    seed.same_looking_for, seed.active_now, seed.recently_active,
    0::integer as candidate_tier, seed.quality_band
  from public.profile_recommendation_batches batch
  join seed on seed.id = batch.candidate_profile_id
  where batch.viewer_profile_id = p_profile_id
    and batch.surface = 'intent_suggested'
    and batch.context_key = ''
    and batch.bucket_key = v_bucket_key
  order by batch.rank
  limit v_limit;
end;
$$;

revoke all on function public.rpc_get_suggested_moves_v2(uuid, integer) from public, anon;
grant execute on function public.rpc_get_suggested_moves_v2(uuid, integer) to authenticated;
-- Closure is intentionally the slowest field: the same closed request keeps a
-- coherent seven-day set. Central reciprocal eligibility removes every relaxed
-- age fallback before the candidates reach the client-side narrative lanes.
create or replace function public.rpc_get_closure_to_clarity_candidates_v2(
  p_intent_request_id uuid,
  p_limit integer default 28
)
returns table (
  id uuid, full_name text, age integer, avatar_url text, city text, region text,
  current_country text, current_country_code text, religion text, looking_for text,
  wants_children text, love_language text, personality_type text,
  verification_level integer, phone_verified boolean, interests text[],
  short_tags text[], has_intro_video boolean, distance_km double precision,
  shared_interest_names text[], shared_interest_count integer, prompt_title text,
  prompt_answer text, bio_snippet text, same_region boolean, same_religion boolean,
  same_looking_for boolean, active_now boolean, recently_active boolean,
  candidate_tier integer, quality_band integer, closure_similarity_score double precision,
  closure_timing_score double precision, closure_freshness_score double precision,
  closure_rank_score double precision
)
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
#variable_conflict use_column
declare
  v_viewer_id uuid;
  v_bucket_start timestamptz := to_timestamp(
    floor(extract(epoch from timezone('utc', now())) / 604800) * 604800
  );
  v_bucket_key text := floor(extract(epoch from timezone('utc', now())) / 604800)::bigint::text;
  v_context_key text := coalesce(p_intent_request_id::text, '');
  v_limit integer := greatest(1, least(coalesce(p_limit, 28), 40));
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  select profile.id into v_viewer_id
  from public.profiles profile
  where profile.user_id = auth.uid() and profile.deleted_at is null
    and profile.account_state = 'active'
  limit 1;
  if v_viewer_id is null then return; end if;

  if not exists (
    select 1 from public.profile_recommendation_batches batch
    where batch.viewer_profile_id = v_viewer_id
      and batch.surface = 'closure_to_clarity'
      and batch.context_key = v_context_key
      and batch.bucket_key = v_bucket_key
  ) then
    insert into public.profile_recommendation_batches (
      viewer_profile_id, surface, context_key, bucket_key, candidate_profile_id, rank
    )
    with seed as (
      select base.*, base.ordinality::integer as source_rank
      from public.rpc_get_closure_to_clarity_candidates(
        p_intent_request_id, 40
      ) with ordinality as base
      where public.is_romantically_eligible(v_viewer_id, base.id, 'global', null)
    ), ranked as (
      select seed.*,
        exposure.last_prior_impression_at,
        row_number() over (
          order by
            case
              when exposure.last_prior_impression_at is null then 0
              when exposure.last_prior_impression_at < v_bucket_start - interval '30 days' then 1
              when exposure.last_prior_impression_at < v_bucket_start - interval '7 days' then 2
              else 3
            end,
            seed.source_rank,
            seed.id
        )::integer as delivery_rank
      from seed
      left join lateral (
        select max(event_row.created_at) as last_prior_impression_at
        from public.profile_recommendation_events event_row
        where event_row.viewer_profile_id = v_viewer_id
          and event_row.candidate_profile_id = seed.id
          and event_row.surface = 'closure_to_clarity'
          and event_row.event_type = 'impression'
          and event_row.created_at < v_bucket_start
      ) exposure on true
    )
    select v_viewer_id, 'closure_to_clarity', v_context_key, v_bucket_key,
      ranked.id, ranked.delivery_rank
    from ranked
    on conflict do nothing;
  end if;

  return query
  with seed as (
    select base.*
    from public.rpc_get_closure_to_clarity_candidates(p_intent_request_id, 40) base
    where public.is_romantically_eligible(v_viewer_id, base.id, 'global', null)
  )
  select
    seed.id, seed.full_name, seed.age, seed.avatar_url, seed.city, seed.region,
    seed.current_country, seed.current_country_code, seed.religion,
    seed.looking_for, seed.wants_children, seed.love_language,
    seed.personality_type, seed.verification_level, seed.phone_verified,
    seed.interests, seed.short_tags, seed.has_intro_video, seed.distance_km,
    seed.shared_interest_names, seed.shared_interest_count, seed.prompt_title,
    seed.prompt_answer, seed.bio_snippet, seed.same_region, seed.same_religion,
    seed.same_looking_for, seed.active_now, seed.recently_active,
    0::integer as candidate_tier, seed.quality_band,
    seed.closure_similarity_score, seed.closure_timing_score,
    seed.closure_freshness_score, seed.closure_rank_score
  from public.profile_recommendation_batches batch
  join seed on seed.id = batch.candidate_profile_id
  where batch.viewer_profile_id = v_viewer_id
    and batch.surface = 'closure_to_clarity'
    and batch.context_key = v_context_key
    and batch.bucket_key = v_bucket_key
  order by batch.rank
  limit v_limit;
end;
$$;

revoke all on function public.rpc_get_closure_to_clarity_candidates_v2(uuid, integer)
  from public, anon;
grant execute on function public.rpc_get_closure_to_clarity_candidates_v2(uuid, integer)
  to authenticated;

notify pgrst, 'reload schema';

commit;
