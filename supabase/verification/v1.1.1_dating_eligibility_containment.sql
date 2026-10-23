-- Betweener v1.1.1 dating eligibility impact and containment monitor.
--
-- READ ONLY. Counts are privacy-safe and do not expose profile or user IDs.
-- `currently_ineligible` is evaluated at query time, so these are incident
-- estimates rather than an exact count of device-local failed queues.

-- 1. Exposure upper bound by time window.
with windows(label, duration) as (
  values
    ('24_hours'::text, interval '24 hours'),
    ('7_days'::text, interval '7 days'),
    ('30_days'::text, interval '30 days')
)
select
  windows.label as audit_window,
  count(recommendation.id) filter (
    where recommendation.shown_at is not null
  )::bigint as cards_shown,
  count(recommendation.id) filter (
    where recommendation.shown_at is not null
      and not public.is_romantically_eligible(
        recommendation.viewer_profile_id,
        recommendation.target_profile_id,
        'global',
        null
      )
  )::bigint as currently_ineligible_cards_shown,
  count(distinct recommendation.viewer_profile_id) filter (
    where recommendation.shown_at is not null
      and not public.is_romantically_eligible(
        recommendation.viewer_profile_id,
        recommendation.target_profile_id,
        'global',
        null
      )
  )::bigint as potentially_affected_viewers,
  count(distinct recommendation.viewer_profile_id) filter (
    where recommendation.outcome in ('like', 'signal', 'intent')
      and not public.is_romantically_eligible(
        recommendation.viewer_profile_id,
        recommendation.target_profile_id,
        'global',
        null
      )
  )::bigint as viewers_with_positive_action
from windows
left join public.vibes_v5_3_recommendations recommendation
  on recommendation.recommended_at >= now() - windows.duration
group by windows.label, windows.duration
order by windows.duration;

-- 2. Action telemetry on pairs that are currently ineligible. These actions
-- may have been rejected or may predate a later eligibility-state change.
select
  event_row.event_type,
  count(*)::bigint as events_30d,
  count(distinct event_row.viewer_profile_id)::bigint as viewers_30d,
  max(event_row.created_at) as last_event_at
from public.vibes_events event_row
where event_row.created_at >= now() - interval '30 days'
  and event_row.event_type in ('like', 'signal_sent', 'intent_sent')
  and not public.is_romantically_eligible(
    event_row.viewer_profile_id,
    event_row.target_profile_id,
    'global',
    null
  )
group by event_row.event_type
order by event_row.event_type;

-- 3. Live containment evidence. Healthy active windows have recommendations
-- greater than zero and both ineligible columns equal to zero.
with windows(label, duration) as (
  values
    ('5_minutes'::text, interval '5 minutes'),
    ('15_minutes'::text, interval '15 minutes'),
    ('60_minutes'::text, interval '60 minutes')
)
select
  windows.label as observation_window,
  count(recommendation.id)::bigint as recommendations,
  count(recommendation.id) filter (
    where not public.is_romantically_eligible(
      recommendation.viewer_profile_id,
      recommendation.target_profile_id,
      'global',
      null
    )
  )::bigint as currently_ineligible_recommendations,
  count(recommendation.id) filter (
    where recommendation.shown_at is not null
  )::bigint as cards_shown,
  count(recommendation.id) filter (
    where recommendation.shown_at is not null
      and not public.is_romantically_eligible(
        recommendation.viewer_profile_id,
        recommendation.target_profile_id,
        'global',
        null
      )
  )::bigint as currently_ineligible_cards_shown,
  max(recommendation.recommended_at) as last_recommendation_at
from windows
left join public.vibes_v5_3_recommendations recommendation
  on recommendation.recommended_at >= now() - windows.duration
group by windows.label, windows.duration
order by windows.duration;

-- 4. Deployed contract gate.
with contract as (
  select
    to_regprocedure(
      'public.get_vibes_recommendations_v5_3(uuid,text,integer,integer,uuid,uuid,integer)'
    ) as recommender_oid
)
select
  contract.recommender_oid is not null as recommender_installed,
  coalesce(
    pg_get_functiondef(contract.recommender_oid)
      like '%is_romantically_eligible%',
    false
  ) as recommender_uses_canonical_eligibility,
  exists (
    select 1
    from pg_trigger trigger_row
    where trigger_row.tgrelid = 'public.swipes'::regclass
      and trigger_row.tgname = 'enforce_swipe_romantic_eligibility'
      and not trigger_row.tgisinternal
  ) as swipe_write_guard_active,
  exists (
    select 1
    from pg_trigger trigger_row
    where trigger_row.tgrelid = 'public.intent_requests'::regclass
      and trigger_row.tgname = 'enforce_intent_romantic_eligibility'
      and not trigger_row.tgisinternal
  ) as intent_write_guard_active
from contract;
