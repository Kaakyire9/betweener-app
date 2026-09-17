-- Betweener v1.1.1 dating eligibility production incident audit.
--
-- READ ONLY. Run this entire file in the production Supabase SQL Editor.
-- It does not call write RPCs, retry actions, clear queues, or expose raw IDs.
-- Device-local failed queues are not stored in Postgres, so the results provide
-- an exposure/action estimate. Use Postgres Logs Explorer for the authoritative
-- count of rejected `dating_not_eligible` requests.

-- 1. Contract chronology and compatibility mismatch.
with expected(version, purpose) as (
  values
    ('20260831100000', 'romantic eligibility write trigger'),
    ('20260901120000', 'Vibes V5.3 recommendation tracking'),
    ('20260901123000', 'Vibes V5.3 request-id fix'),
    ('20260901124500', 'Vibes V5.3 resumable decks'),
    ('20260901140000', 'profile moderation eligibility composition'),
    ('20260917150000', 'Vibes read/write eligibility alignment')
)
select
  expected.version,
  expected.purpose,
  exists (
    select 1
    from supabase_migrations.schema_migrations migration
    where migration.version = expected.version
  ) as installed
from expected
order by expected.version;

with definitions as (
  select
    to_regprocedure(
      'public.get_vibes_recommendations_v5_3(uuid,text,integer,integer,uuid,uuid,integer)'
    ) as recommender_oid,
    to_regprocedure('public.enforce_romantic_eligibility()') as trigger_function_oid
)
select
  definitions.recommender_oid is not null as recommender_installed,
  coalesce(
    pg_get_functiondef(definitions.recommender_oid)
      like '%is_romantically_eligible%',
    false
  ) as recommender_uses_canonical_eligibility,
  definitions.trigger_function_oid is not null as eligibility_trigger_function_installed,
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
from definitions;

-- 2. Directional installed-version activity. Push-disabled users are absent.
select
  coalesce(token.platform, 'unknown') as platform,
  coalesce(token.app_version, 'unknown') as app_version,
  count(distinct token.user_id)::integer as active_users_30d,
  count(distinct token.user_id) filter (
    where token.last_seen_at >= now() - interval '7 days'
  )::integer as active_users_7d,
  max(token.last_seen_at) as last_seen_at
from public.push_tokens token
where token.last_seen_at >= now() - interval '30 days'
group by coalesce(token.platform, 'unknown'), coalesce(token.app_version, 'unknown')
order by platform, active_users_30d desc, app_version;

-- 3. Exposure summary. `currently_ineligible` is evaluated at audit time, so a
-- profile that legitimately changed state after being shown can appear here.
with windows(label, duration) as (
  values
    ('24_hours'::text, interval '24 hours'),
    ('7_days'::text, interval '7 days'),
    ('30_days'::text, interval '30 days')
)
select
  windows.label as audit_window,
  count(recommendation.id)::bigint as recommendations,
  count(recommendation.id) filter (
    where recommendation.shown_at is not null
  )::bigint as shown,
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
      and not public.is_romantically_eligible(
        recommendation.viewer_profile_id,
        recommendation.target_profile_id,
        'global',
        null
      )
  )::bigint as currently_ineligible_shown,
  count(distinct recommendation.viewer_profile_id) filter (
    where recommendation.shown_at is not null
      and not public.is_romantically_eligible(
        recommendation.viewer_profile_id,
        recommendation.target_profile_id,
        'global',
        null
      )
  )::bigint as exposed_viewers,
  count(recommendation.id) filter (
    where recommendation.outcome in ('like', 'signal', 'intent')
      and not public.is_romantically_eligible(
        recommendation.viewer_profile_id,
        recommendation.target_profile_id,
        'global',
        null
      )
  )::bigint as positive_actions_on_currently_ineligible_pairs,
  max(recommendation.recommended_at) filter (
    where not public.is_romantically_eligible(
      recommendation.viewer_profile_id,
      recommendation.target_profile_id,
      'global',
      null
    )
  ) as last_ineligible_recommendation_at
from windows
left join public.vibes_v5_3_recommendations recommendation
  on recommendation.recommended_at >= now() - windows.duration
group by windows.label, windows.duration
order by windows.duration;

-- 4. First observed current ineligibility reason for shown V5.3 cards.
-- This is a diagnostic classification, not a replacement for the canonical
-- eligibility function. Results contain counts only.
with exposed as (
  select
    recommendation.viewer_profile_id,
    recommendation.target_profile_id,
    recommendation.shown_at,
    viewer.user_id as viewer_user_id,
    target.user_id as target_user_id,
    viewer.gender as viewer_gender,
    target.gender as target_gender,
    viewer.age as viewer_age,
    target.age as target_age,
    viewer.min_age_interest as viewer_min_age,
    viewer.max_age_interest as viewer_max_age,
    target.min_age_interest as target_min_age,
    target.max_age_interest as target_max_age,
    viewer.age_preference_confirmed_at as viewer_age_confirmed_at,
    target.age_preference_confirmed_at as target_age_confirmed_at
  from public.vibes_v5_3_recommendations recommendation
  join public.profiles viewer on viewer.id = recommendation.viewer_profile_id
  join public.profiles target on target.id = recommendation.target_profile_id
  where recommendation.shown_at >= now() - interval '30 days'
    and not public.is_romantically_eligible(
      recommendation.viewer_profile_id,
      recommendation.target_profile_id,
      'global',
      null
    )
), classified as (
  select
    exposed.*,
    case
      when not public.can_profile_surface_publicly(exposed.viewer_profile_id)
        then 'viewer_not_publicly_eligible'
      when not public.can_profile_surface_publicly(exposed.target_profile_id)
        then 'target_not_publicly_eligible'
      when exposed.viewer_profile_id = exposed.target_profile_id
        then 'same_profile'
      when upper(btrim(coalesce(exposed.viewer_gender::text, ''))) in ('MALE', 'FEMALE')
       and upper(btrim(coalesce(exposed.target_gender::text, ''))) in ('MALE', 'FEMALE')
       and upper(btrim(exposed.viewer_gender::text)) = upper(btrim(exposed.target_gender::text))
        then 'gender_pair_not_supported'
      when exposed.viewer_age_confirmed_at is not null
       and exposed.viewer_min_age is not null
       and exposed.target_age is not null
       and exposed.target_age < exposed.viewer_min_age
        then 'below_viewer_age_preference'
      when exposed.viewer_age_confirmed_at is not null
       and exposed.viewer_max_age is not null
       and exposed.target_age is not null
       and exposed.target_age > exposed.viewer_max_age
        then 'above_viewer_age_preference'
      when exposed.target_age_confirmed_at is not null
       and exposed.target_min_age is not null
       and exposed.viewer_age is not null
       and exposed.viewer_age < exposed.target_min_age
        then 'below_target_age_preference'
      when exposed.target_age_confirmed_at is not null
       and exposed.target_max_age is not null
       and exposed.viewer_age is not null
       and exposed.viewer_age > exposed.target_max_age
        then 'above_target_age_preference'
      when exists (
        select 1
        from public.blocks blocked
        where (blocked.blocker_id = exposed.viewer_user_id
               and blocked.blocked_id = exposed.target_user_id)
           or (blocked.blocker_id = exposed.target_user_id
               and blocked.blocked_id = exposed.viewer_user_id)
      ) then 'blocked_pair'
      else 'other_or_changed_state'
    end as reason
  from exposed
)
select
  classified.reason,
  count(*)::bigint as shown_cards_30d,
  count(distinct classified.viewer_profile_id)::bigint as viewers_30d,
  max(classified.shown_at) as last_shown_at
from classified
group by classified.reason
order by shown_cards_30d desc, classified.reason;

-- 5. Hashed viewer-level exposure. Safe to export for incident correlation.
select
  substring(md5(recommendation.viewer_profile_id::text) from 1 for 12) as viewer_key,
  count(*)::integer as ineligible_recommendations_30d,
  count(*) filter (where recommendation.shown_at is not null)::integer
    as ineligible_shown_30d,
  count(*) filter (
    where recommendation.outcome in ('like', 'signal', 'intent')
  )::integer as positive_actions_30d,
  max(recommendation.recommended_at) as last_recommended_at,
  max(recommendation.shown_at) as last_shown_at
from public.vibes_v5_3_recommendations recommendation
where recommendation.recommended_at >= now() - interval '30 days'
  and not public.is_romantically_eligible(
    recommendation.viewer_profile_id,
    recommendation.target_profile_id,
    'global',
    null
  )
group by recommendation.viewer_profile_id
order by positive_actions_30d desc, ineligible_shown_30d desc, last_shown_at desc
limit 200;

-- 6. Action telemetry that targeted a pair which is ineligible at audit time.
-- These events indicate user intent, not necessarily a committed server write.
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
order by events_30d desc, event_row.event_type;

-- 7. Release gate for the mismatch. `healthy` is false when the write trigger
-- is active but the V5.3 recommender does not compose canonical eligibility.
with definitions as (
  select
    to_regprocedure(
      'public.get_vibes_recommendations_v5_3(uuid,text,integer,integer,uuid,uuid,integer)'
    ) as recommender_oid
), contract as (
  select
    definitions.recommender_oid is not null as recommender_installed,
    coalesce(
      pg_get_functiondef(definitions.recommender_oid)
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
  from definitions
)
select
  contract.*,
  contract.recommender_installed
    and contract.recommender_uses_canonical_eligibility
    and contract.swipe_write_guard_active
    and contract.intent_write_guard_active as healthy
from contract;

-- Logs Explorer follow-up (not executable in SQL Editor):
--   Search Postgres logs for: dating_not_eligible
--   Time ranges: 24 hours, 7 days, and since 2026-08-31.
-- Record total events, first/last occurrence, and distinct request/user fields
-- available in structured metadata. Do not export message bodies or raw tokens.
