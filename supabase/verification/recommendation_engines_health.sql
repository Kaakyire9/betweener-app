-- Recommendation engine production health check.
--
-- Run this entire file in the Supabase SQL Editor after applying:
--   20260901120000_vibes_v5_3_freshness_outcome_learning.sql
--   20260901123000_fix_vibes_v5_3_request_id_ambiguity.sql
--   20260901124500_vibes_v5_3_resumable_decks.sql
--   20260901133000_recommendation_rotation_foundation.sql
--   20260901133100_intent_closure_recommendation_rotation.sql
--   20260901133200_relationship_compass_recommendation_engine.sql
--   20260901133300_circle_recommendation_rotation.sql
--
-- This script is read-only. It does not call recommendation RPCs, create
-- batches, or manufacture impressions. Open the product surfaces first if you
-- want to verify fresh traffic.

-- 1. Deployment and client execution permissions.
with expected(engine, signature, client_role) as (
  values
    ('Vibes V5.3',
      'public.get_vibes_recommendations_v5_3(uuid,text,integer,integer,uuid,uuid,integer)',
      'authenticated'),
    ('Vibes event logger',
      'public.rpc_log_vibes_event_v5_3(uuid,uuid,uuid,text,text,integer,integer,uuid,uuid,uuid,jsonb)',
      'authenticated'),
    ('Intent Suggested V2',
      'public.rpc_get_suggested_moves_v2(uuid,integer)',
      'authenticated'),
    ('Closure to Clarity V2',
      'public.rpc_get_closure_to_clarity_candidates_v2(uuid,integer)',
      'authenticated'),
    ('Relationship Compass',
      'public.rpc_get_relationship_compass_profiles(integer)',
      'authenticated'),
    ('Circle Home Picks V2',
      'public.rpc_get_circle_home_picks_v2(integer)',
      'authenticated'),
    ('Circle Discovery V2',
      'public.rpc_get_circle_dating_candidates_v2(uuid,integer)',
      'authenticated'),
    ('Recommendation event logger',
      'public.rpc_log_profile_recommendation_event(text,uuid,text,text,jsonb)',
      'authenticated')
)
select
  expected.engine,
  to_regprocedure(expected.signature) is not null as installed,
  case
    when to_regprocedure(expected.signature) is null then false
    else has_function_privilege(
      expected.client_role,
      to_regprocedure(expected.signature),
      'EXECUTE'
    )
  end as authenticated_can_execute
from expected
order by expected.engine;

-- 2. Server-owned health summaries.
select public.rpc_get_vibes_v5_3_health() as vibes_v5_3_health;
select public.rpc_get_profile_recommendation_rotation_health() as slower_surfaces_health;

-- 3. Vibes V5.3 traffic and outcome capture by segment over the last 24 hours.
with request_rollup as (
  select
    request.segment,
    count(*)::integer as requests,
    count(distinct request.viewer_profile_id)::integer as viewers,
    max(request.created_at) as last_request_at
  from public.vibes_v5_3_requests request
  where request.created_at >= now() - interval '24 hours'
  group by request.segment
), recommendation_rollup as (
  select
    recommendation.segment,
    count(*)::integer as recommendations,
    count(*) filter (where recommendation.shown_at is not null)::integer as cards_shown,
    count(*) filter (where recommendation.closed_at is not null)::integer as cards_closed,
    count(*) filter (where recommendation.outcome = 'pass')::integer as passes,
    count(*) filter (
      where recommendation.outcome in ('like', 'signal', 'intent')
    )::integer as positive_actions,
    count(*) filter (where recommendation.is_exploration)::integer as exploration_cards,
    count(distinct recommendation.target_profile_id)::integer as unique_profiles
  from public.vibes_v5_3_recommendations recommendation
  where recommendation.recommended_at >= now() - interval '24 hours'
  group by recommendation.segment
), segments(segment) as (
  values ('for_you'), ('nearby'), ('active_now')
)
select
  segments.segment,
  coalesce(request_rollup.requests, 0) as requests,
  coalesce(request_rollup.viewers, 0) as viewers,
  coalesce(recommendation_rollup.recommendations, 0) as recommendations,
  coalesce(recommendation_rollup.cards_shown, 0) as cards_shown,
  coalesce(recommendation_rollup.cards_closed, 0) as cards_closed,
  coalesce(recommendation_rollup.passes, 0) as passes,
  coalesce(recommendation_rollup.positive_actions, 0) as positive_actions,
  coalesce(recommendation_rollup.exploration_cards, 0) as exploration_cards,
  coalesce(recommendation_rollup.unique_profiles, 0) as unique_profiles,
  request_rollup.last_request_at
from segments
left join request_rollup using (segment)
left join recommendation_rollup using (segment)
order by segments.segment;

-- 4. Vibes client telemetry delivery. A healthy active client should increase
-- both client_events and source_events; duplicate client event IDs must be zero.
select
  (select count(*) from public.vibes_v5_3_client_events client_event
    where client_event.accepted_at >= now() - interval '24 hours') as client_events_24h,
  (select count(*) from public.vibes_events event_row
    where event_row.created_at >= now() - interval '24 hours') as source_events_24h,
  (select max(client_event.accepted_at) from public.vibes_v5_3_client_events client_event)
    as last_client_event_at,
  (select count(*) - count(distinct client_event.client_event_id)
    from public.vibes_v5_3_client_events client_event) as duplicate_client_event_ids;

-- 5. Stable-batch creation for every slower recommendation surface.
with surfaces(surface) as (
  values
    ('intent_suggested'),
    ('relationship_compass'),
    ('circle_home_picks'),
    ('circle_discovery'),
    ('closure_to_clarity')
), batch_rollup as (
  select
    batch.surface,
    count(*) filter (where batch.created_at >= now() - interval '24 hours')::integer
      as candidates_batched_24h,
    count(distinct batch.viewer_profile_id) filter (
      where batch.created_at >= now() - interval '24 hours'
    )::integer as viewers_24h,
    count(distinct (batch.viewer_profile_id, batch.context_key, batch.bucket_key)) filter (
      where batch.created_at >= now() - interval '24 hours'
    )::integer as batches_24h,
    max(batch.created_at) as last_batch_at
  from public.profile_recommendation_batches batch
  group by batch.surface
)
select
  surfaces.surface,
  coalesce(batch_rollup.batches_24h, 0) as batches_24h,
  coalesce(batch_rollup.candidates_batched_24h, 0) as candidates_batched_24h,
  coalesce(batch_rollup.viewers_24h, 0) as viewers_24h,
  batch_rollup.last_batch_at
from surfaces
left join batch_rollup using (surface)
order by surfaces.surface;

-- 6. Rendered impressions for each slower surface. This proves the cards were
-- actually displayed, rather than only fetched and batched.
with impressions as (
  select
    'intent_suggested'::text as surface,
    event_row.viewer_profile_id,
    event_row.candidate_profile_id,
    event_row.created_at
  from public.suggested_move_events event_row
  where event_row.surface = 'intent_suggested'
    and event_row.event_type = 'impression'

  union all

  select
    event_row.surface,
    event_row.viewer_profile_id,
    event_row.candidate_profile_id,
    event_row.created_at
  from public.profile_recommendation_events event_row
  where event_row.event_type = 'impression'

  union all

  select
    case
      when event_row.metadata ->> 'surface' = 'circle_home_picks'
        then 'circle_home_picks'
      else 'circle_discovery'
    end,
    event_row.viewer_profile_id,
    event_row.target_profile_id,
    event_row.created_at
  from public.circle_discovery_events event_row
  where event_row.event_type = 'candidate_impression'
    and coalesce(event_row.metadata ->> 'surface', 'circle_discover') in (
      'circle_home_picks', 'circle_discover'
    )
), surfaces(surface) as (
  values
    ('intent_suggested'),
    ('relationship_compass'),
    ('circle_home_picks'),
    ('circle_discovery'),
    ('closure_to_clarity')
), impression_rollup as (
  select
    impressions.surface,
    count(*) filter (where impressions.created_at >= now() - interval '24 hours')::integer
      as impressions_24h,
    count(distinct impressions.viewer_profile_id) filter (
      where impressions.created_at >= now() - interval '24 hours'
    )::integer as viewers_24h,
    count(distinct impressions.candidate_profile_id) filter (
      where impressions.created_at >= now() - interval '24 hours'
    )::integer as unique_profiles_24h,
    max(impressions.created_at) as last_impression_at
  from impressions
  group by impressions.surface
)
select
  surfaces.surface,
  coalesce(impression_rollup.impressions_24h, 0) as impressions_24h,
  coalesce(impression_rollup.viewers_24h, 0) as viewers_24h,
  coalesce(impression_rollup.unique_profiles_24h, 0) as unique_profiles_24h,
  impression_rollup.last_impression_at
from surfaces
left join impression_rollup using (surface)
order by surfaces.surface;

-- 7. Action funnel over seven days for the slower surfaces.
with surface_events as (
  select
    event_row.surface,
    event_row.event_type,
    event_row.created_at
  from public.suggested_move_events event_row
  where event_row.surface = 'intent_suggested'

  union all

  select
    event_row.surface,
    event_row.event_type,
    event_row.created_at
  from public.profile_recommendation_events event_row

  union all

  select
    case
      when event_row.metadata ->> 'surface' = 'circle_home_picks'
        then 'circle_home_picks'
      else 'circle_discovery'
    end,
    event_row.event_type,
    event_row.created_at
  from public.circle_discovery_events event_row
  where coalesce(event_row.metadata ->> 'surface', 'circle_discover') in (
    'circle_home_picks', 'circle_discover'
  )
)
select
  surface_events.surface,
  surface_events.event_type,
  count(*)::integer as events_7d,
  max(surface_events.created_at) as last_event_at
from surface_events
where surface_events.created_at >= now() - interval '7 days'
group by surface_events.surface, surface_events.event_type
order by surface_events.surface, surface_events.event_type;

-- 8. Batch integrity. Every returned row should be healthy=true. No rows means
-- no slower-surface batch has been created in the last eight days.
select
  substring(md5(batch.viewer_profile_id::text) from 1 for 12) as viewer_key,
  batch.surface,
  batch.context_key,
  batch.bucket_key,
  count(*)::integer as candidate_count,
  min(batch.rank)::integer as first_rank,
  max(batch.rank)::integer as last_rank,
  count(distinct batch.rank)::integer as distinct_ranks,
  (
    min(batch.rank) = 1
    and max(batch.rank) = count(*)
    and count(distinct batch.rank) = count(*)
  ) as healthy,
  max(batch.created_at) as created_at
from public.profile_recommendation_batches batch
where batch.created_at >= now() - interval '8 days'
group by
  batch.viewer_profile_id,
  batch.surface,
  batch.context_key,
  batch.bucket_key
order by created_at desc;

-- 9. Rotation evidence across consecutive fields. This will naturally be
-- empty until a viewer has crossed at least two surface bucket boundaries.
with bucket_summary as (
  select
    batch.viewer_profile_id,
    batch.surface,
    batch.context_key,
    batch.bucket_key,
    max(batch.created_at) as bucket_created_at,
    count(*)::integer as candidate_count
  from public.profile_recommendation_batches batch
  group by
    batch.viewer_profile_id,
    batch.surface,
    batch.context_key,
    batch.bucket_key
), ranked_buckets as (
  select
    bucket_summary.*,
    row_number() over (
      partition by
        bucket_summary.viewer_profile_id,
        bucket_summary.surface,
        bucket_summary.context_key
      order by bucket_summary.bucket_created_at desc, bucket_summary.bucket_key desc
    ) as bucket_ordinal
  from bucket_summary
), consecutive as (
  select
    latest.viewer_profile_id,
    latest.surface,
    latest.context_key,
    latest.bucket_key as latest_bucket,
    previous.bucket_key as previous_bucket,
    latest.candidate_count as latest_candidates,
    previous.candidate_count as previous_candidates
  from ranked_buckets latest
  join ranked_buckets previous
    on previous.viewer_profile_id = latest.viewer_profile_id
   and previous.surface = latest.surface
   and previous.context_key = latest.context_key
   and previous.bucket_ordinal = 2
  where latest.bucket_ordinal = 1
), overlap as (
  select
    consecutive.*,
    count(*) filter (
      where previous_candidate.candidate_profile_id is not null
    )::integer as repeated_candidates,
    count(*) filter (
      where previous_candidate.candidate_profile_id is not null
        and previous_candidate.rank <> latest_candidate.rank
    )::integer as candidates_with_rank_change,
    round(avg(
      abs(previous_candidate.rank - latest_candidate.rank)
    ) filter (
      where previous_candidate.candidate_profile_id is not null
    ), 2) as average_absolute_rank_change,
    count(*) filter (
      where latest_candidate.rank <= 9
        and previous_candidate.rank <= 9
    )::integer as repeated_top_nine
  from consecutive
  join public.profile_recommendation_batches latest_candidate
    on latest_candidate.viewer_profile_id = consecutive.viewer_profile_id
   and latest_candidate.surface = consecutive.surface
   and latest_candidate.context_key = consecutive.context_key
   and latest_candidate.bucket_key = consecutive.latest_bucket
  left join public.profile_recommendation_batches previous_candidate
    on previous_candidate.viewer_profile_id = consecutive.viewer_profile_id
   and previous_candidate.surface = consecutive.surface
   and previous_candidate.context_key = consecutive.context_key
   and previous_candidate.bucket_key = consecutive.previous_bucket
   and previous_candidate.candidate_profile_id = latest_candidate.candidate_profile_id
  group by
    consecutive.viewer_profile_id,
    consecutive.surface,
    consecutive.context_key,
    consecutive.latest_bucket,
    consecutive.previous_bucket,
    consecutive.latest_candidates,
    consecutive.previous_candidates
)
select
  substring(md5(overlap.viewer_profile_id::text) from 1 for 12) as viewer_key,
  overlap.surface,
  overlap.context_key,
  overlap.latest_bucket,
  overlap.previous_bucket,
  overlap.latest_candidates,
  overlap.previous_candidates,
  overlap.repeated_candidates,
  overlap.candidates_with_rank_change,
  overlap.average_absolute_rank_change,
  overlap.repeated_top_nine,
  round(
    overlap.repeated_candidates::numeric
      / nullif(least(overlap.latest_candidates, overlap.previous_candidates), 0),
    3
  ) as candidate_overlap_rate,
  round(
    overlap.repeated_top_nine::numeric
      / nullif(least(overlap.latest_candidates, overlap.previous_candidates, 9), 0),
    3
  ) as top_nine_overlap_rate,
  (
    overlap.candidates_with_rank_change > 0
    or overlap.repeated_top_nine
      < least(overlap.latest_candidates, overlap.previous_candidates, 9)
  ) as rotation_observed
from overlap
order by overlap.surface, viewer_key;

-- 10. Focused live check: Intent Suggested Moves.
-- Select and run only this statement after opening the Intent tab and allowing
-- Suggested Moves to render. The initial collapsed field normally logs three
-- unique impressions; expanding it can log up to six.
with installation as (
  select
    to_regprocedure(
      'public.rpc_get_suggested_moves_v2(uuid,integer)'
    ) is not null as recommender_installed,
    case when to_regprocedure(
      'public.rpc_get_suggested_moves_v2(uuid,integer)'
    ) is null then false else has_function_privilege(
      'authenticated',
      to_regprocedure('public.rpc_get_suggested_moves_v2(uuid,integer)'),
      'EXECUTE'
    ) end as recommender_executable,
    to_regprocedure(
      'public.rpc_log_suggested_move_event(uuid,uuid,text,text,text,integer,boolean,jsonb)'
    ) is not null as event_logger_installed,
    case when to_regprocedure(
      'public.rpc_log_suggested_move_event(uuid,uuid,text,text,text,integer,boolean,jsonb)'
    ) is null then false else has_function_privilege(
      'authenticated',
      to_regprocedure(
        'public.rpc_log_suggested_move_event(uuid,uuid,text,text,text,integer,boolean,jsonb)'
      ),
      'EXECUTE'
    ) end as event_logger_executable
), batch_fields as (
  select
    batch.viewer_profile_id,
    batch.bucket_key,
    min(batch.created_at) as batch_created_at,
    count(*)::integer as candidate_count,
    min(batch.rank)::integer as first_rank,
    max(batch.rank)::integer as last_rank,
    count(distinct batch.rank)::integer as distinct_ranks
  from public.profile_recommendation_batches batch
  where batch.surface = 'intent_suggested'
    and batch.context_key = ''
  group by batch.viewer_profile_id, batch.bucket_key
), latest_batch as (
  select batch_fields.*
  from batch_fields
  order by batch_fields.batch_created_at desc
  limit 1
), event_rollup as (
  select
    count(*) filter (where event_row.event_type = 'impression')::integer
      as impressions_since_batch,
    count(distinct event_row.candidate_profile_id) filter (
      where event_row.event_type = 'impression'
    )::integer as unique_impressed_profiles,
    count(*) filter (where event_row.event_type = 'preview_profile')::integer
      as profile_opens,
    count(*) filter (where event_row.event_type = 'opener_revealed')::integer
      as openers_revealed,
    count(*) filter (where event_row.event_type = 'intent_opened')::integer
      as intents_opened,
    count(*) filter (where event_row.event_type = 'intent_sent')::integer
      as intents_sent,
    max(event_row.created_at) as last_event_at
  from public.suggested_move_events event_row
  cross join latest_batch
  where event_row.viewer_profile_id = latest_batch.viewer_profile_id
    and event_row.surface = 'intent_suggested'
    and event_row.created_at >= latest_batch.batch_created_at
)
select
  case when latest_batch.viewer_profile_id is null then null
    else substring(md5(latest_batch.viewer_profile_id::text) from 1 for 12)
  end as viewer_key,
  installation.recommender_installed,
  installation.recommender_executable,
  installation.event_logger_installed,
  installation.event_logger_executable,
  latest_batch.bucket_key,
  coalesce(
    latest_batch.bucket_key = to_char(timezone('utc', now()), 'YYYY-MM-DD'),
    false
  ) as current_utc_day_batch,
  coalesce(latest_batch.candidate_count, 0) as candidate_count,
  coalesce(
    latest_batch.first_rank = 1
      and latest_batch.last_rank = latest_batch.candidate_count
      and latest_batch.distinct_ranks = latest_batch.candidate_count,
    false
  ) as ranks_healthy,
  coalesce(event_rollup.impressions_since_batch, 0) as impressions_since_batch,
  coalesce(event_rollup.unique_impressed_profiles, 0) as unique_impressed_profiles,
  coalesce(event_rollup.profile_opens, 0) as profile_opens,
  coalesce(event_rollup.openers_revealed, 0) as openers_revealed,
  coalesce(event_rollup.intents_opened, 0) as intents_opened,
  coalesce(event_rollup.intents_sent, 0) as intents_sent,
  event_rollup.last_event_at,
  case
    when not installation.recommender_installed
      or not installation.recommender_executable then 'recommender_not_ready'
    when not installation.event_logger_installed
      or not installation.event_logger_executable then 'event_logger_not_ready'
    when latest_batch.viewer_profile_id is null then 'no_batch_observed'
    when latest_batch.bucket_key <> to_char(timezone('utc', now()), 'YYYY-MM-DD')
      then 'no_current_day_batch'
    when not (
      latest_batch.first_rank = 1
      and latest_batch.last_rank = latest_batch.candidate_count
      and latest_batch.distinct_ranks = latest_batch.candidate_count
    ) then 'batch_rank_integrity_failed'
    when coalesce(event_rollup.impressions_since_batch, 0) = 0
      then 'batch_created_but_not_rendered'
    else 'healthy'
  end as status
from installation
left join latest_batch on true
cross join event_rollup;

-- 11. Focused live check: remaining slower profile engines.
-- Before running only this statement, visit Circle Home, open an individual
-- Circle's Discover view, and open Closure to Clarity for a qualifying closed
-- Intent. Closure can legitimately report no_batch_observed when no qualifying
-- closed request or eligible candidate field exists.
with expected(surface, recommender_signature, logger_signature, cadence, current_bucket) as (
  values
    (
      'circle_home_picks'::text,
      'public.rpc_get_circle_home_picks_v2(integer)',
      'public.rpc_log_circle_discovery_event(uuid,text,uuid,jsonb)',
      '72_hours'::text,
      floor(extract(epoch from timezone('utc', now())) / 259200)::bigint::text
    ),
    (
      'circle_discovery'::text,
      'public.rpc_get_circle_dating_candidates_v2(uuid,integer)',
      'public.rpc_log_circle_discovery_event(uuid,text,uuid,jsonb)',
      'daily'::text,
      to_char(timezone('utc', now()), 'YYYY-MM-DD')
    ),
    (
      'closure_to_clarity'::text,
      'public.rpc_get_closure_to_clarity_candidates_v2(uuid,integer)',
      'public.rpc_log_profile_recommendation_event(text,uuid,text,text,jsonb)',
      'seven_days'::text,
      floor(extract(epoch from timezone('utc', now())) / 604800)::bigint::text
    )
), installation as (
  select
    expected.*,
    to_regprocedure(expected.recommender_signature) is not null
      as recommender_installed,
    case when to_regprocedure(expected.recommender_signature) is null then false
      else has_function_privilege(
        'authenticated',
        to_regprocedure(expected.recommender_signature),
        'EXECUTE'
      )
    end as recommender_executable,
    to_regprocedure(expected.logger_signature) is not null as event_logger_installed,
    case when to_regprocedure(expected.logger_signature) is null then false
      else has_function_privilege(
        'authenticated',
        to_regprocedure(expected.logger_signature),
        'EXECUTE'
      )
    end as event_logger_executable
  from expected
), batch_fields as (
  select
    batch.viewer_profile_id,
    batch.surface,
    batch.context_key,
    batch.bucket_key,
    min(batch.created_at) as batch_created_at,
    count(*)::integer as candidate_count,
    min(batch.rank)::integer as first_rank,
    max(batch.rank)::integer as last_rank,
    count(distinct batch.rank)::integer as distinct_ranks
  from public.profile_recommendation_batches batch
  where batch.surface in (
    'circle_home_picks', 'circle_discovery', 'closure_to_clarity'
  )
  group by
    batch.viewer_profile_id,
    batch.surface,
    batch.context_key,
    batch.bucket_key
), ranked_batches as (
  select
    batch_fields.*,
    row_number() over (
      partition by batch_fields.surface
      order by batch_fields.batch_created_at desc
    ) as freshness_rank
  from batch_fields
), latest_batch as (
  select ranked_batches.*
  from ranked_batches
  where ranked_batches.freshness_rank = 1
), surface_events as (
  select
    case when event_row.metadata ->> 'surface' = 'circle_home_picks'
      then 'circle_home_picks' else 'circle_discovery'
    end as surface,
    event_row.viewer_profile_id,
    case when event_row.metadata ->> 'surface' = 'circle_home_picks'
      then '' else event_row.circle_id::text
    end as context_key,
    event_row.event_type,
    event_row.target_profile_id as candidate_profile_id,
    event_row.created_at
  from public.circle_discovery_events event_row
  where coalesce(event_row.metadata ->> 'surface', 'circle_discover') in (
    'circle_home_picks', 'circle_discover'
  )

  union all

  select
    event_row.surface,
    event_row.viewer_profile_id,
    event_row.context_key,
    event_row.event_type,
    event_row.candidate_profile_id,
    event_row.created_at
  from public.profile_recommendation_events event_row
  where event_row.surface = 'closure_to_clarity'
)
select
  installation.surface,
  installation.cadence,
  case when latest_batch.viewer_profile_id is null then null
    else substring(md5(latest_batch.viewer_profile_id::text) from 1 for 12)
  end as viewer_key,
  case when coalesce(latest_batch.context_key, '') = '' then ''
    else substring(md5(latest_batch.context_key) from 1 for 12)
  end as context_key,
  installation.recommender_installed,
  installation.recommender_executable,
  installation.event_logger_installed,
  installation.event_logger_executable,
  latest_batch.bucket_key,
  coalesce(latest_batch.bucket_key = installation.current_bucket, false)
    as current_bucket,
  coalesce(latest_batch.candidate_count, 0) as candidate_count,
  coalesce(
    latest_batch.first_rank = 1
      and latest_batch.last_rank = latest_batch.candidate_count
      and latest_batch.distinct_ranks = latest_batch.candidate_count,
    false
  ) as ranks_healthy,
  coalesce(telemetry.impressions, 0) as impressions_since_batch,
  coalesce(telemetry.unique_impressed_profiles, 0) as unique_impressed_profiles,
  coalesce(telemetry.profile_opens, 0) as profile_opens,
  coalesce(telemetry.passes, 0) as passes,
  coalesce(telemetry.intents_opened, 0) as intents_opened,
  coalesce(telemetry.intents_sent, 0) as intents_sent,
  telemetry.last_event_at,
  case
    when not installation.recommender_installed
      or not installation.recommender_executable then 'recommender_not_ready'
    when not installation.event_logger_installed
      or not installation.event_logger_executable then 'event_logger_not_ready'
    when latest_batch.viewer_profile_id is null then 'no_batch_observed'
    when latest_batch.bucket_key <> installation.current_bucket
      then 'no_current_bucket'
    when not (
      latest_batch.first_rank = 1
      and latest_batch.last_rank = latest_batch.candidate_count
      and latest_batch.distinct_ranks = latest_batch.candidate_count
    ) then 'batch_rank_integrity_failed'
    when coalesce(telemetry.impressions, 0) = 0
      then 'batch_created_but_not_rendered'
    else 'healthy'
  end as status
from installation
left join latest_batch on latest_batch.surface = installation.surface
left join lateral (
  select
    count(*) filter (
      where event_row.event_type in ('candidate_impression', 'impression')
    )::integer as impressions,
    count(distinct event_row.candidate_profile_id) filter (
      where event_row.event_type in ('candidate_impression', 'impression')
    )::integer as unique_impressed_profiles,
    count(*) filter (where event_row.event_type = 'profile_opened')::integer
      as profile_opens,
    count(*) filter (where event_row.event_type = 'candidate_passed')::integer
      as passes,
    count(*) filter (where event_row.event_type = 'intent_opened')::integer
      as intents_opened,
    count(*) filter (where event_row.event_type = 'intent_sent')::integer
      as intents_sent,
    max(event_row.created_at) as last_event_at
  from surface_events event_row
  where event_row.surface = installation.surface
    and event_row.viewer_profile_id = latest_batch.viewer_profile_id
    and event_row.context_key = latest_batch.context_key
    and event_row.created_at >= latest_batch.batch_created_at
) telemetry on true
order by installation.surface;
