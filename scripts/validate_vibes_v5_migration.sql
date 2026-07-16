\set ON_ERROR_STOP on

begin;

\ir ../supabase/migrations/20260714150000_vibes_v5_reciprocal_intelligence.sql
\ir ../supabase/migrations/20260715100000_vibes_v5_1_taste_calibration.sql
\ir ../supabase/migrations/20260715103000_confirmed_reciprocal_age_preferences.sql

do $$
declare
  v_source text;
  v_rls_enabled boolean;
begin
  if to_regprocedure('public.get_vibes_recommendations_v5(uuid,text,integer,integer)') is null then
    raise exception 'V5 recommendation RPC was not created';
  end if;

  if to_regprocedure('public.refresh_vibes_v5_viewer_taste(uuid)') is null then
    raise exception 'V5 taste refresh function was not created';
  end if;

  if to_regclass('public.vibes_v5_viewer_feature_weights') is null
     or to_regclass('public.vibes_v5_taste_refresh_queue') is null then
    raise exception 'V5 supporting tables were not created';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'age_preference_confirmed_at'
  ) then
    raise exception 'Explicit age-preference confirmation provenance is missing';
  end if;

  if has_function_privilege(
    'anon',
    'public.get_vibes_recommendations_v5(uuid,text,integer,integer)',
    'EXECUTE'
  ) then
    raise exception 'Anonymous users must not execute the V5 recommendation RPC';
  end if;

  if not has_function_privilege(
    'authenticated',
    'public.get_vibes_recommendations_v5(uuid,text,integer,integer)',
    'EXECUTE'
  ) then
    raise exception 'Authenticated users must be able to execute V5';
  end if;

  if has_function_privilege(
    'authenticated',
    'public.refresh_vibes_v5_viewer_taste(uuid)',
    'EXECUTE'
  ) then
    raise exception 'Authenticated clients must not invoke internal taste refreshes directly';
  end if;

  select class.relrowsecurity into v_rls_enabled
  from pg_class class
  join pg_namespace namespace on namespace.oid = class.relnamespace
  where namespace.nspname = 'public'
    and class.relname = 'vibes_v5_viewer_feature_weights';

  if not coalesce(v_rls_enabled, false) then
    raise exception 'V5 learned feature weights must have RLS enabled';
  end if;

  select procedure.prosrc into v_source
  from pg_proc procedure
  join pg_namespace namespace on namespace.oid = procedure.pronamespace
  where namespace.nspname = 'public'
    and procedure.proname = 'get_vibes_recommendations_v5'
  limit 1;

  if position('null::double precision as latitude' in lower(v_source)) = 0
     or position('null::double precision as longitude' in lower(v_source)) = 0 then
    raise exception 'V5 must not expose candidate coordinates';
  end if;

  if position('candidate_min_age' in lower(v_source)) = 0
     or position('candidate_max_age' in lower(v_source)) = 0
     or position('candidate.age_preference_confirmed_at is null' in lower(v_source)) = 0 then
    raise exception 'V5 reciprocal age eligibility is missing';
  end if;

  if position('''version'', ''v5''' in lower(v_source)) = 0
     or position('reciprocal_hybrid_2' in lower(v_source)) = 0 then
    raise exception 'V5 response versioning is missing';
  end if;
end;
$$;

-- Runtime smoke test with synthetic profiles. Everything remains inside the
-- surrounding transaction and is rolled back at the end of this script.
insert into auth.users (id)
values
  ('51000000-0000-0000-0000-000000000001'::uuid),
  ('51000000-0000-0000-0000-000000000002'::uuid),
  ('51000000-0000-0000-0000-000000000003'::uuid),
  ('51000000-0000-0000-0000-000000000004'::uuid);

insert into public.profiles (
  id,
  user_id,
  full_name,
  age,
  gender,
  city,
  region,
  current_country,
  current_country_code,
  latitude,
  longitude,
  location_precision,
  looking_for,
  min_age_interest,
  max_age_interest,
  age_preference_confirmed_at,
  religion,
  wants_children,
  personality_type,
  phone_number,
  phone_verified,
  profile_completed,
  discoverable_in_vibes,
  identity_status,
  relationship_compass,
  verification_level,
  last_active
)
values
  (
    '52000000-0000-0000-0000-000000000001'::uuid,
    '51000000-0000-0000-0000-000000000001'::uuid,
    'V5 Viewer',
    30,
    'MALE',
    'Bristol',
    'England',
    'United Kingdom',
    'GB',
    51.4545,
    -2.5879,
    'CITY',
    'Something serious',
    24,
    36,
    timezone('utc', now()),
    'CHRISTIAN',
    'YES',
    'INTJ',
    '+447000000001',
    true,
    true,
    true,
    'active',
    '{"intention":"serious","priorities":{"religion":"nice","family":"nice","lifestyle":"nice","interests":"nice","education":"open","career":"open"},"flexibility":{"religion":"prefer","children":"prefer","verified":"prefer"},"geography":{"mode":"long_distance","radius":100},"pace":"balanced"}'::jsonb,
    1,
    timezone('utc', now())
  ),
  (
    '52000000-0000-0000-0000-000000000002'::uuid,
    '51000000-0000-0000-0000-000000000002'::uuid,
    'Reciprocal Candidate',
    29,
    'FEMALE',
    'Bath',
    'England',
    'United Kingdom',
    'GB',
    51.3811,
    -2.3590,
    'CITY',
    'Long-term relationship',
    27,
    35,
    timezone('utc', now()),
    'CHRISTIAN',
    'YES',
    'ENFP',
    '+447000000002',
    true,
    true,
    true,
    'active',
    '{"intention":"long_term","priorities":{"religion":"nice","family":"nice","lifestyle":"nice","interests":"nice","education":"open","career":"open"},"flexibility":{"religion":"prefer","children":"prefer","verified":"prefer"},"geography":{"mode":"long_distance","radius":100},"pace":"balanced"}'::jsonb,
    1,
    timezone('utc', now())
  ),
  (
    '52000000-0000-0000-0000-000000000003'::uuid,
    '51000000-0000-0000-0000-000000000003'::uuid,
    'Age Incompatible Candidate',
    28,
    'FEMALE',
    'Cardiff',
    'Wales',
    'United Kingdom',
    'GB',
    51.4816,
    -3.1791,
    'CITY',
    'Something serious',
    40,
    55,
    timezone('utc', now()),
    'CHRISTIAN',
    'YES',
    'ISTJ',
    '+447000000003',
    true,
    true,
    true,
    'active',
    '{}'::jsonb,
    1,
    timezone('utc', now())
  ),
  (
    '52000000-0000-0000-0000-000000000004'::uuid,
    '51000000-0000-0000-0000-000000000004'::uuid,
    'Legacy Default Candidate',
    28,
    'FEMALE',
    'Newport',
    'Wales',
    'United Kingdom',
    'GB',
    51.5842,
    -2.9977,
    'CITY',
    'Something serious',
    18,
    25,
    null,
    'CHRISTIAN',
    'YES',
    'INFJ',
    '+447000000004',
    true,
    true,
    true,
    'active',
    '{}'::jsonb,
    0,
    timezone('utc', now())
  );

insert into public.vibes_events (
  viewer_user_id,
  viewer_profile_id,
  target_profile_id,
  target_user_id,
  segment,
  event_type,
  dwell_ms,
  metadata
)
values
  (
    '51000000-0000-0000-0000-000000000001'::uuid,
    '52000000-0000-0000-0000-000000000001'::uuid,
    '52000000-0000-0000-0000-000000000002'::uuid,
    '51000000-0000-0000-0000-000000000002'::uuid,
    'for_you',
    'intro_completed',
    14000,
    '{"source":"v5_contract_test"}'::jsonb
  ),
  (
    '51000000-0000-0000-0000-000000000001'::uuid,
    '52000000-0000-0000-0000-000000000001'::uuid,
    '52000000-0000-0000-0000-000000000003'::uuid,
    '51000000-0000-0000-0000-000000000003'::uuid,
    'for_you',
    'pass',
    5000,
    '{"source":"v5_contract_test"}'::jsonb
  );

select public.refresh_vibes_v5_viewer_taste(
  '52000000-0000-0000-0000-000000000001'::uuid
);

do $$
begin
  if not exists (
    select 1
    from public.vibes_v5_viewer_feature_weights weights
    where weights.viewer_profile_id = '52000000-0000-0000-0000-000000000001'::uuid
      and weights.feature_key = 'personality'
      and weights.feature_value = 'enfp'
      and weights.weight > 0
  ) then
    raise exception 'V5 did not learn a transferable positive personality signal';
  end if;

  if not exists (
    select 1
    from public.vibes_v5_viewer_feature_weights weights
    where weights.viewer_profile_id = '52000000-0000-0000-0000-000000000001'::uuid
      and weights.feature_key = 'personality'
      and weights.feature_value = 'istj'
      and weights.weight < 0
  ) then
    raise exception 'V5.1 did not learn a transferable negative personality signal';
  end if;

  if exists (
    select 1
    from public.vibes_v5_viewer_feature_weights weights
    where weights.viewer_profile_id = '52000000-0000-0000-0000-000000000001'::uuid
      and abs(weights.weight) >= 0.99
  ) then
    raise exception 'V5.1 produced an overconfident saturated taste weight';
  end if;

  if exists (
    select 1
    from public.vibes_v5_viewer_feature_weights weights
    where weights.viewer_profile_id = '52000000-0000-0000-0000-000000000001'::uuid
      and weights.feature_value in ('not sure', 'other', 'unknown')
  ) then
    raise exception 'V5.1 retained a non-discriminating vague feature value';
  end if;
end;
$$;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', '51000000-0000-0000-0000-000000000001',
    'role', 'authenticated'
  )::text,
  true
);
select set_config('request.jwt.claim.sub', '51000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

\echo 'Synthetic V4 candidate seed:'
select auth.uid() as authenticated_user;
select id, user_id, age, gender, profile_completed, discoverable_in_vibes, deleted_at
from public.profiles
where id in (
  '52000000-0000-0000-0000-000000000001'::uuid,
  '52000000-0000-0000-0000-000000000002'::uuid,
  '52000000-0000-0000-0000-000000000003'::uuid,
  '52000000-0000-0000-0000-000000000004'::uuid
);
select id, ai_score, recommendation_reasons->>'version' as version
from public.get_vibes_recommendations_v3(
  '52000000-0000-0000-0000-000000000001'::uuid,
  'for_you',
  10,
  30
);

\echo 'Synthetic V5 candidate result:'
select id, ai_score, recommendation_reasons->>'version' as version
from public.get_vibes_recommendations_v5(
  '52000000-0000-0000-0000-000000000001'::uuid,
  'for_you',
  10,
  30
);

do $$
declare
  v_result record;
begin
  select * into v_result
  from public.get_vibes_recommendations_v5(
    '52000000-0000-0000-0000-000000000001'::uuid,
    'for_you',
    10,
    30
  )
  limit 1;

  if v_result.id is distinct from '52000000-0000-0000-0000-000000000002'::uuid then
    raise exception 'V5 failed reciprocal eligibility; expected compatible candidate, received %', v_result.id;
  end if;

  if v_result.latitude is not null or v_result.longitude is not null then
    raise exception 'V5 exposed private candidate coordinates at runtime';
  end if;

  if v_result.recommendation_reasons->>'version' is distinct from 'v5' then
    raise exception 'V5 runtime response is not versioned correctly';
  end if;

  if exists (
    select 1
    from public.get_vibes_recommendations_v5(
      '52000000-0000-0000-0000-000000000001'::uuid,
      'for_you',
      10,
      30
    ) recommendation
    where recommendation.id = '52000000-0000-0000-0000-000000000003'::uuid
  ) then
    raise exception 'V5 returned a candidate whose age preference excludes the viewer';
  end if;

  if not exists (
    select 1
    from public.get_vibes_recommendations_v5(
      '52000000-0000-0000-0000-000000000001'::uuid,
      'for_you',
      10,
      30
    ) recommendation
    where recommendation.id = '52000000-0000-0000-0000-000000000004'::uuid
  ) then
    raise exception 'V5 incorrectly treated an unconfirmed legacy age default as a hard exclusion';
  end if;
end;
$$;

rollback;

\echo 'Vibes V5.2 migration contract validated successfully.'
