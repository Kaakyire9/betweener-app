-- Vibes V5.1: calibrate implicit taste learning against actual exposure.
--
-- The initial V5 learner accumulated every event independently. A sequence
-- such as open -> intro -> like could therefore count several times, while a
-- common feature with only positive observations could immediately saturate
-- at 1.0. This version produces one time-decayed outcome per unique profile,
-- compares each feature with the viewer's own exposure baseline, applies
-- Bayesian shrinkage, and centres mutually exclusive feature families.

create or replace function public.refresh_vibes_v5_viewer_taste(p_viewer_profile_id uuid)
returns integer
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_rows integer := 0;
begin
  if p_viewer_profile_id is null or not exists (
    select 1
    from public.profiles as profile
    where profile.id = p_viewer_profile_id
      and profile.deleted_at is null
  ) then
    return 0;
  end if;

  delete from public.vibes_v5_viewer_feature_weights as weights
  where weights.viewer_profile_id = p_viewer_profile_id;

  with event_window as materialized (
    select
      event_row.target_profile_id,
      event_row.event_type,
      event_row.dwell_ms,
      event_row.metadata,
      event_row.created_at
    from public.vibes_events as event_row
    where event_row.viewer_profile_id = p_viewer_profile_id
      and event_row.target_profile_id is not null
      and event_row.created_at >= timezone('utc', now()) - interval '180 days'
  ),
  exposed_targets as (
    select
      event_row.target_profile_id,
      max(event_row.created_at) as last_event_at
    from event_window as event_row
    group by event_row.target_profile_id
  ),
  latest_decision as (
    select distinct on (event_row.target_profile_id)
      event_row.target_profile_id,
      event_row.event_type,
      event_row.created_at,
      case event_row.event_type
        when 'intent_sent' then 1.00
        when 'signal_sent' then 0.90
        when 'like' then 0.75
        when 'profile_saved' then 0.55
        when 'profile_unsaved' then -0.35
        when 'pass' then -0.85
        else 0.00
      end::double precision as decision_score
    from event_window as event_row
    where event_row.event_type in (
      'intent_sent', 'signal_sent', 'like', 'profile_saved',
      'profile_unsaved', 'pass'
    )
    order by event_row.target_profile_id, event_row.created_at desc
  ),
  latest_undo as (
    select
      event_row.target_profile_id,
      max(event_row.created_at) as undo_at
    from event_window as event_row
    where event_row.event_type = 'undo'
    group by event_row.target_profile_id
  ),
  engagement as (
    select
      event_row.target_profile_id,
      max(case event_row.event_type
        when 'intro_completed' then 0.28
        when 'full_profile_opened' then 0.16
        when 'intro_played' then 0.12
        when 'profile_opened' then
          case
            when coalesce(event_row.dwell_ms, 0) >= 12000 then 0.14
            when coalesce(event_row.dwell_ms, 0) >= 4000 then 0.10
            else 0.06
          end
        when 'card_seen' then
          case when coalesce(event_row.dwell_ms, 0) >= 12000 then 0.06 else 0.00 end
        else 0.00
      end)::double precision as engagement_score,
      max(event_row.created_at) filter (
        where event_row.event_type in (
          'intro_completed', 'full_profile_opened', 'intro_played',
          'profile_opened', 'card_seen'
        )
      ) as engagement_at
    from event_window as event_row
    group by event_row.target_profile_id
  ),
  pair_outcomes as materialized (
    select
      exposed.target_profile_id,
      case
        when undo.undo_at is not null
          and decision.created_at is not null
          and undo.undo_at >= decision.created_at then 0.00
        when decision.created_at is not null then decision.decision_score
        else coalesce(engagement.engagement_score, 0.00)
      end
      * exp(
          -greatest(
            extract(epoch from (
              timezone('utc', now())
              - coalesce(decision.created_at, engagement.engagement_at, exposed.last_event_at)
            )) / 86400.0,
            0
          ) / 75.0
        ) as outcome_score
    from exposed_targets as exposed
    left join latest_decision as decision
      on decision.target_profile_id = exposed.target_profile_id
    left join latest_undo as undo
      on undo.target_profile_id = exposed.target_profile_id
    left join engagement
      on engagement.target_profile_id = exposed.target_profile_id
  ),
  viewer_baseline as (
    select coalesce(avg(pair.outcome_score), 0.00)::double precision as outcome_score
    from pair_outcomes as pair
  ),
  target_features as materialized (
    select distinct
      pair.target_profile_id,
      pair.outcome_score,
      feature.feature_key,
      feature.feature_value
    from pair_outcomes as pair
    join public.profiles as target
      on target.id = pair.target_profile_id
     and target.deleted_at is null
    cross join lateral (
      select 'intention'::text, public.normalize_vibes_v5_intention(target.looking_for)
      union all select 'personality', nullif(lower(btrim(target.personality_type)), '')
      union all select 'smoking', nullif(lower(btrim(target.smoking)), '')
      union all select 'drinking', nullif(lower(btrim(target.drinking)), '')
      union all select 'exercise', nullif(lower(btrim(target.exercise_frequency)), '')
      union all select 'children', nullif(lower(btrim(target.wants_children)), '')
      union all select 'love_language', nullif(lower(btrim(target.love_language)), '')
      union all select 'intro_media',
        case when nullif(btrim(target.profile_video), '') is not null then 'yes' end
      union all
      select 'interest', nullif(lower(btrim(interest.name)), '')
      from public.profile_interests as profile_interest
      join public.interests as interest on interest.id = profile_interest.interest_id
      where profile_interest.profile_id = target.id
    ) as feature(feature_key, feature_value)
    where feature.feature_value is not null
      and feature.feature_value not in (
        'not sure', 'not sure yet', 'other', 'unknown', 'n/a',
        'prefer not to say', 'rather not say'
      )
  ),
  aggregated as (
    select
      features.feature_key,
      features.feature_value,
      count(*)::integer as exposure_count,
      sum(greatest(features.outcome_score, 0.00))::double precision as positive_evidence,
      sum(abs(least(features.outcome_score, 0.00)))::double precision as negative_evidence,
      avg(features.outcome_score)::double precision as feature_outcome,
      baseline.outcome_score as baseline_outcome
    from target_features as features
    cross join viewer_baseline as baseline
    group by features.feature_key, features.feature_value, baseline.outcome_score
  ),
  shrunk as (
    select
      aggregated.*,
      (
        (aggregated.feature_outcome - aggregated.baseline_outcome)
        * case aggregated.feature_key
            when 'interest' then 1.80
            when 'intention' then 1.65
            else 1.45
          end
        * aggregated.exposure_count::double precision
          / (aggregated.exposure_count + case
              when aggregated.feature_key = 'interest' then 6.0
              else 8.0
            end)
      )::double precision as shrunk_weight
    from aggregated
  ),
  centred as (
    select
      shrunk.*,
      case
        when shrunk.feature_key = 'intro_media' then shrunk.shrunk_weight
        else shrunk.shrunk_weight - (
          sum(shrunk.shrunk_weight * shrunk.exposure_count)
            over (partition by shrunk.feature_key)
          / nullif(
              sum(shrunk.exposure_count) over (partition by shrunk.feature_key),
              0
            )
        )
      end::double precision as calibrated_weight
    from shrunk
  ),
  inserted as (
    insert into public.vibes_v5_viewer_feature_weights (
      viewer_profile_id,
      feature_key,
      feature_value,
      weight,
      positive_evidence,
      negative_evidence,
      evidence_count,
      refreshed_at
    )
    select
      p_viewer_profile_id,
      centred.feature_key,
      centred.feature_value,
      greatest(-0.85, least(0.85, centred.calibrated_weight)),
      centred.positive_evidence,
      centred.negative_evidence,
      centred.exposure_count,
      timezone('utc', now())
    from centred
    where centred.exposure_count > 0
      and abs(centred.calibrated_weight) >= 0.01
    on conflict (viewer_profile_id, feature_key, feature_value) do update
      set weight = excluded.weight,
          positive_evidence = excluded.positive_evidence,
          negative_evidence = excluded.negative_evidence,
          evidence_count = excluded.evidence_count,
          refreshed_at = excluded.refreshed_at
    returning 1
  )
  select count(*) into v_rows from inserted;

  delete from public.vibes_v5_taste_refresh_queue as queue
  where queue.viewer_profile_id = p_viewer_profile_id;

  return v_rows;
end;
$$;

revoke all on function public.refresh_vibes_v5_viewer_taste(uuid) from public, anon, authenticated;
grant execute on function public.refresh_vibes_v5_viewer_taste(uuid) to service_role;

comment on function public.refresh_vibes_v5_viewer_taste(uuid) is
  'V5.1 exposure-aware taste calibration using one decayed outcome per unique profile, baseline centring and Bayesian shrinkage.';

-- Rebuild existing taste snapshots asynchronously with the calibrated model.
insert into public.vibes_v5_taste_refresh_queue (
  viewer_profile_id,
  requested_at,
  attempts,
  last_error
)
select distinct
  event_row.viewer_profile_id,
  timezone('utc', now()),
  0,
  null
from public.vibes_events as event_row
join public.profiles as profile on profile.id = event_row.viewer_profile_id
where event_row.viewer_profile_id is not null
  and event_row.created_at >= timezone('utc', now()) - interval '180 days'
  and profile.deleted_at is null
on conflict (viewer_profile_id) do update
  set requested_at = excluded.requested_at,
      attempts = 0,
      last_error = null;
