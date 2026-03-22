-- Suggested move performance analysis
-- Run these queries in Supabase SQL editor after enough suggested_move_events have accumulated.
-- The core unit below is an "exposure": one candidate shown to one viewer in one batch.
-- Note: if `batch_key` is missing, the fallback exposure key collapses repeat showings of the same
-- viewer/candidate pair. For production analysis, prefer keeping `batch_key` populated.

-- 0. Quick funnel summary: raw events and deduped exposures side by side
with raw_events as (
  select
    sme.event_type,
    count(*)::integer as raw_events
  from public.suggested_move_events sme
  where sme.surface = 'intent_suggested'
  group by 1
),
exposures as (
  select
    concat(
      'batch:',
      coalesce(sme.batch_key, 'no-batch'),
      ':',
      sme.viewer_profile_id::text,
      ':',
      sme.candidate_profile_id::text
    ) as exposure_key,
    bool_or(sme.event_type = 'impression') as had_impression,
    bool_or(sme.event_type = 'preview_profile') as had_preview,
    bool_or(sme.event_type = 'opener_revealed') as had_opener_reveal,
    bool_or(sme.event_type = 'intent_opened') as had_intent_open,
    bool_or(sme.event_type = 'intent_sent') as had_intent_sent
  from public.suggested_move_events sme
  where sme.surface = 'intent_suggested'
  group by 1
),
totals as (
  select count(*)::integer as exposure_total from exposures
)
select
  metric,
  coalesce(raw_events.raw_events, 0) as raw_events,
  exposure_count,
  round(exposure_count::numeric / nullif(totals.exposure_total, 0), 4) as exposure_rate
from totals
cross join (
  select 'impression'::text as metric, count(*) filter (where had_impression)::integer as exposure_count from exposures
  union all
  select 'preview_profile'::text as metric, count(*) filter (where had_preview)::integer as exposure_count from exposures
  union all
  select 'opener_revealed'::text as metric, count(*) filter (where had_opener_reveal)::integer as exposure_count from exposures
  union all
  select 'intent_opened'::text as metric, count(*) filter (where had_intent_open)::integer as exposure_count from exposures
  union all
  select 'intent_sent'::text as metric, count(*) filter (where had_intent_sent)::integer as exposure_count from exposures
) funnel
left join raw_events
  on raw_events.event_type = funnel.metric
order by
  case metric
    when 'impression' then 1
    when 'preview_profile' then 2
    when 'opener_revealed' then 3
    when 'intent_opened' then 4
    when 'intent_sent' then 5
    else 6
  end;


-- Base exposure model
with exposures as (
  select
    sme.viewer_profile_id,
    sme.candidate_profile_id,
    concat(
      'batch:',
      coalesce(sme.batch_key, 'no-batch'),
      ':',
      sme.viewer_profile_id::text,
      ':',
      sme.candidate_profile_id::text
    ) as exposure_key,
    min(sme.created_at) as first_seen_at,
    min(sme.slot_index) filter (where sme.slot_index is not null) as slot_index,
    bool_or(coalesce(sme.is_hero, false)) as is_hero,
    max((sme.metadata ->> 'candidate_tier')::int) as candidate_tier,
    max((sme.metadata ->> 'quality_band')::int) as quality_band,
    bool_or(coalesce((sme.metadata ->> 'same_looking_for')::boolean, false)) as same_looking_for,
    bool_or(coalesce((sme.metadata ->> 'has_intro_video')::boolean, false)) as has_intro_video,
    bool_or(coalesce((sme.metadata ->> 'has_prompt')::boolean, false)) as has_prompt,
    max(coalesce((sme.metadata ->> 'shared_interest_count')::int, 0)) as shared_interest_count,
    max((sme.metadata ->> 'distance_km')::double precision) as distance_km,
    bool_or(sme.event_type = 'impression') as had_impression,
    bool_or(sme.event_type = 'preview_profile') as had_preview,
    bool_or(sme.event_type = 'opener_revealed') as had_opener_reveal,
    bool_or(sme.event_type = 'intent_opened') as had_intent_open,
    bool_or(sme.event_type = 'intent_sent') as had_intent_sent
  from public.suggested_move_events sme
  where sme.surface = 'intent_suggested'
  group by 1, 2, 3
)
select * from exposures order by first_seen_at desc limit 50;


-- 1. Daily funnel
with exposures as (
  select
    concat(
      'batch:',
      coalesce(sme.batch_key, 'no-batch'),
      ':',
      sme.viewer_profile_id::text,
      ':',
      sme.candidate_profile_id::text
    ) as exposure_key,
    min(sme.created_at) as first_seen_at,
    bool_or(sme.event_type = 'preview_profile') as had_preview,
    bool_or(sme.event_type = 'opener_revealed') as had_opener_reveal,
    bool_or(sme.event_type = 'intent_opened') as had_intent_open,
    bool_or(sme.event_type = 'intent_sent') as had_intent_sent
  from public.suggested_move_events sme
  where sme.surface = 'intent_suggested'
  group by 1
)
select
  date_trunc('day', first_seen_at) as day,
  count(*) as exposures,
  count(*) filter (where had_preview) as previews,
  count(*) filter (where had_opener_reveal) as opener_reveals,
  count(*) filter (where had_intent_open) as intent_opens,
  count(*) filter (where had_intent_sent) as intent_sends,
  round((count(*) filter (where had_preview))::numeric / nullif(count(*), 0), 4) as preview_rate,
  round((count(*) filter (where had_intent_open))::numeric / nullif(count(*), 0), 4) as open_rate,
  round((count(*) filter (where had_intent_sent))::numeric / nullif(count(*), 0), 4) as send_rate
from exposures
group by 1
order by 1 desc;


-- 2. Compare primary vs fallback
with exposures as (
  select
    coalesce(max((sme.metadata ->> 'candidate_tier')::int), 0) as candidate_tier,
    bool_or(sme.event_type = 'preview_profile') as had_preview,
    bool_or(sme.event_type = 'intent_opened') as had_intent_open,
    bool_or(sme.event_type = 'intent_sent') as had_intent_sent
  from public.suggested_move_events sme
  where sme.surface = 'intent_suggested'
  group by concat(
    'batch:',
    coalesce(sme.batch_key, 'no-batch'),
    ':',
    sme.viewer_profile_id::text,
    ':',
    sme.candidate_profile_id::text
  )
)
select
  candidate_tier,
  count(*) as exposures,
  count(*) filter (where had_preview) as previews,
  count(*) filter (where had_intent_open) as intent_opens,
  count(*) filter (where had_intent_sent) as intent_sends,
  round((count(*) filter (where had_preview))::numeric / nullif(count(*), 0), 4) as preview_rate,
  round((count(*) filter (where had_intent_open))::numeric / nullif(count(*), 0), 4) as open_rate,
  round((count(*) filter (where had_intent_sent))::numeric / nullif(count(*), 0), 4) as send_rate
from exposures
group by 1
order by 1;


-- 3. Compare quality bands
with exposures as (
  select
    coalesce(max((sme.metadata ->> 'quality_band')::int), 0) as quality_band,
    bool_or(sme.event_type = 'preview_profile') as had_preview,
    bool_or(sme.event_type = 'intent_opened') as had_intent_open,
    bool_or(sme.event_type = 'intent_sent') as had_intent_sent
  from public.suggested_move_events sme
  where sme.surface = 'intent_suggested'
  group by concat(
    'batch:',
    coalesce(sme.batch_key, 'no-batch'),
    ':',
    sme.viewer_profile_id::text,
    ':',
    sme.candidate_profile_id::text
  )
)
select
  quality_band,
  count(*) as exposures,
  count(*) filter (where had_preview) as previews,
  count(*) filter (where had_intent_open) as intent_opens,
  count(*) filter (where had_intent_sent) as intent_sends,
  round((count(*) filter (where had_preview))::numeric / nullif(count(*), 0), 4) as preview_rate,
  round((count(*) filter (where had_intent_open))::numeric / nullif(count(*), 0), 4) as open_rate,
  round((count(*) filter (where had_intent_sent))::numeric / nullif(count(*), 0), 4) as send_rate
from exposures
group by 1
order by 1 desc;


-- 4. Hook performance: prompt / intro video / same looking for / shared interests
with exposures as (
  select
    bool_or(coalesce((sme.metadata ->> 'has_prompt')::boolean, false)) as has_prompt,
    bool_or(coalesce((sme.metadata ->> 'has_intro_video')::boolean, false)) as has_intro_video,
    bool_or(coalesce((sme.metadata ->> 'same_looking_for')::boolean, false)) as same_looking_for,
    max(coalesce((sme.metadata ->> 'shared_interest_count')::int, 0)) as shared_interest_count,
    bool_or(sme.event_type = 'preview_profile') as had_preview,
    bool_or(sme.event_type = 'intent_opened') as had_intent_open,
    bool_or(sme.event_type = 'intent_sent') as had_intent_sent
  from public.suggested_move_events sme
  where sme.surface = 'intent_suggested'
  group by concat(
    'batch:',
    coalesce(sme.batch_key, 'no-batch'),
    ':',
    sme.viewer_profile_id::text,
    ':',
    sme.candidate_profile_id::text
  )
)
select
  has_prompt,
  has_intro_video,
  same_looking_for,
  case
    when shared_interest_count >= 2 then '2+'
    when shared_interest_count = 1 then '1'
    else '0'
  end as shared_interest_bucket,
  count(*) as exposures,
  count(*) filter (where had_preview) as previews,
  count(*) filter (where had_intent_open) as intent_opens,
  count(*) filter (where had_intent_sent) as intent_sends,
  round((count(*) filter (where had_intent_sent))::numeric / nullif(count(*), 0), 4) as send_rate
from exposures
group by 1, 2, 3, 4
order by send_rate desc nulls last, exposures desc;


-- 5. Distance buckets
with exposures as (
  select
    max((sme.metadata ->> 'distance_km')::double precision) as distance_km,
    bool_or(sme.event_type = 'intent_sent') as had_intent_sent
  from public.suggested_move_events sme
  where sme.surface = 'intent_suggested'
  group by concat(
    'batch:',
    coalesce(sme.batch_key, 'no-batch'),
    ':',
    sme.viewer_profile_id::text,
    ':',
    sme.candidate_profile_id::text
  )
),
bucketed as (
  select
    case
      when distance_km is null then 'unknown'
      when distance_km <= 25 then '<=25km'
      when distance_km <= 100 then '26-100km'
      when distance_km <= 500 then '101-500km'
      when distance_km <= 2000 then '501-2000km'
      else '2000km+'
    end as distance_bucket,
    had_intent_sent
  from exposures
)
select
  distance_bucket,
  count(*) as exposures,
  count(*) filter (where had_intent_sent) as intent_sends,
  round((count(*) filter (where had_intent_sent))::numeric / nullif(count(*), 0), 4) as send_rate
from bucketed
group by 1
order by
  case distance_bucket
    when '<=25km' then 1
    when '26-100km' then 2
    when '101-500km' then 3
    when '501-2000km' then 4
    when '2000km+' then 5
    else 6
  end;


-- 6. Slot and hero performance
with exposures as (
  select
    min(sme.slot_index) filter (where sme.slot_index is not null) as slot_index,
    bool_or(coalesce(sme.is_hero, false)) as is_hero,
    bool_or(sme.event_type = 'preview_profile') as had_preview,
    bool_or(sme.event_type = 'intent_sent') as had_intent_sent
  from public.suggested_move_events sme
  where sme.surface = 'intent_suggested'
  group by concat(
    'batch:',
    coalesce(sme.batch_key, 'no-batch'),
    ':',
    sme.viewer_profile_id::text,
    ':',
    sme.candidate_profile_id::text
  )
)
select
  coalesce(slot_index, -1) as slot_index,
  is_hero,
  count(*) as exposures,
  count(*) filter (where had_preview) as previews,
  count(*) filter (where had_intent_sent) as intent_sends,
  round((count(*) filter (where had_preview))::numeric / nullif(count(*), 0), 4) as preview_rate,
  round((count(*) filter (where had_intent_sent))::numeric / nullif(count(*), 0), 4) as send_rate
from exposures
group by 1, 2
order by 1, 2 desc;
