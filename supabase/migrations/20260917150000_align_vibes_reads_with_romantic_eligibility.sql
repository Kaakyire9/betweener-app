-- Align Vibes recommendation reads with the canonical romantic-eligibility
-- contract already enforced on swipe and intent writes.
--
-- The V3 boundary is the shared candidate source for V5 and V5.3. Filtering
-- there prevents ineligible candidates from entering the V5 scoring and V5.3
-- request ledger. The V5.3 wrapper is a final fail-closed boundary and keeps
-- the deployed RPC signature unchanged for v1.1.1 clients.

begin;

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
language sql
security definer
set search_path = public, pg_catalog
as $$
  select
    recommendation.id,
    recommendation.user_id,
    recommendation.full_name,
    recommendation.age,
    recommendation.bio,
    recommendation.avatar_url,
    recommendation.profile_video,
    recommendation.location,
    null::double precision as latitude,
    null::double precision as longitude,
    recommendation.region,
    recommendation.tribe,
    recommendation.religion,
    recommendation.personality_type,
    recommendation.is_active,
    recommendation.online,
    recommendation.last_active,
    recommendation.verified,
    recommendation.verification_level,
    recommendation.ai_score,
    recommendation.distance_km,
    recommendation.city,
    recommendation.current_country,
    recommendation.current_country_code,
    recommendation.location_precision,
    recommendation.recommendation_reasons
  from public.get_vibes_recommendations_v3_private(
    p_user_id,
    p_segment,
    p_limit,
    p_active_window_minutes
  ) recommendation
  where public.is_romantically_eligible(
    p_user_id,
    recommendation.id,
    'global',
    null
  );
$$;

revoke all on function public.get_vibes_recommendations_v3(
  uuid, text, integer, integer
) from public, anon;
grant execute on function public.get_vibes_recommendations_v3(
  uuid, text, integer, integer
) to authenticated, service_role;

do $$
begin
  if to_regprocedure(
    'public.get_vibes_recommendations_v5_3(uuid,text,integer,integer,uuid,uuid,integer)'
  ) is null then
    raise exception 'V5.3 recommender is not installed';
  end if;

  if to_regprocedure(
    'public.get_vibes_recommendations_v5_3_unfiltered(uuid,text,integer,integer,uuid,uuid,integer)'
  ) is null then
    alter function public.get_vibes_recommendations_v5_3(
      uuid, text, integer, integer, uuid, uuid, integer
    ) rename to get_vibes_recommendations_v5_3_unfiltered;
  end if;
end;
$$;

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
language sql
security definer
set search_path = public, pg_catalog
as $$
  select recommendation.*
  from public.get_vibes_recommendations_v5_3_unfiltered(
    p_user_id,
    p_segment,
    p_limit,
    p_active_window_minutes,
    p_client_session_id,
    p_request_id,
    p_refresh_ordinal
  ) recommendation
  where public.is_romantically_eligible(
    p_user_id,
    recommendation.id,
    'global',
    null
  );
$$;

revoke all on function public.get_vibes_recommendations_v5_3_unfiltered(
  uuid, text, integer, integer, uuid, uuid, integer
) from public, anon, authenticated;
revoke all on function public.get_vibes_recommendations_v5_3(
  uuid, text, integer, integer, uuid, uuid, integer
) from public, anon;
grant execute on function public.get_vibes_recommendations_v5_3(
  uuid, text, integer, integer, uuid, uuid, integer
) to authenticated, service_role;

comment on function public.get_vibes_recommendations_v5_3(
  uuid, text, integer, integer, uuid, uuid, integer
) is
  'V5.3 recommendation boundary filtered by canonical romantic eligibility before cards reach deployed clients.';

notify pgrst, 'reload schema';

commit;
