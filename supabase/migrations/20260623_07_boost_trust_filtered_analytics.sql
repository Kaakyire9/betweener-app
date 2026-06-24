-- Make boost analytics production-credible by excluding obvious non-market traffic:
-- internal admin accounts, deleted/hidden/duplicate-linked profiles, and self-owned traffic.
-- This migration supersedes the earlier boost analytics patches by recreating the
-- recommendation and recent-boost RPCs with trust filtering baked in.

create or replace function public.is_trusted_boost_viewer(
  p_viewer_profile_id uuid,
  p_target_profile_id uuid default null
)
returns boolean
language sql
security definer
stable
set search_path = public, pg_catalog
as $$
  select exists (
    select 1
    from public.profiles viewer
    left join public.internal_admins ia
      on ia.user_id = viewer.user_id
    left join public.profiles target
      on target.id = p_target_profile_id
    where viewer.id = p_viewer_profile_id
      and viewer.deleted_at is null
      and coalesce(viewer.account_state, 'active') = 'active'
      and coalesce(viewer.profile_completed, false) = true
      and viewer.duplicate_of_user_id is null
      and viewer.recovered_to_user_id is null
      and ia.user_id is null
      and (
        p_target_profile_id is null
        or (
          viewer.id <> p_target_profile_id
          and target.id is not null
          and viewer.user_id <> target.user_id
        )
      )
  );
$$;

create or replace function public.rpc_get_profile_boost_recommendations()
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  resolved_plan public.subscription_type := 'FREE';
  v_viewer_profile_id uuid;
  active_boost record;
  best_hour integer := null;
  best_score numeric := 0;
  recent_unique_viewers integer := 0;
  recent_views integer := 0;
  recent_intro_opens integer := 0;
  recent_saves integer := 0;
  recent_intent_opens integer := 0;
  recommended_start_at timestamptz;
  recommendation_reason text;
  audience_options jsonb;
  focus_options jsonb;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  resolved_plan := public.get_active_subscription_plan(auth.uid());

  select p.id
    into v_viewer_profile_id
  from public.profiles p
  where p.user_id = auth.uid()
    and p.deleted_at is null
  limit 1;

  if v_viewer_profile_id is null then
    raise exception 'profile required';
  end if;

  select
    pb.id,
    pb.ends_at,
    pb.boost_type,
    pb.audience_mode,
    pb.focus_mode
    into active_boost
  from public.profile_boosts pb
  where pb.user_id = v_viewer_profile_id
    and pb.starts_at <= timezone('utc'::text, now())
    and pb.ends_at > timezone('utc'::text, now())
  order by pb.ends_at desc
  limit 1;

  with recent_events as (
    select event_row.event_type, extract(hour from event_row.created_at)::integer as hour_bucket
    from public.vibes_events event_row
    where event_row.target_profile_id = v_viewer_profile_id
      and event_row.created_at > timezone('utc'::text, now()) - interval '21 days'
      and public.is_trusted_boost_viewer(event_row.viewer_profile_id, v_viewer_profile_id)
      and event_row.event_type in (
        'profile_opened', 'full_profile_opened', 'intro_played',
        'intro_completed', 'profile_saved', 'intent_opened'
      )
  ),
  hour_scores as (
    select
      recent_events.hour_bucket,
      count(*)::integer as raw_events,
      sum(
        case recent_events.event_type
          when 'profile_saved' then 4.0
          when 'intent_opened' then 3.3
          when 'intro_completed' then 3.0
          when 'intro_played' then 2.0
          when 'full_profile_opened' then 1.8
          else 1.0
        end
      ) as weighted_score
    from recent_events
    group by recent_events.hour_bucket
  )
  select
    hour_scores.hour_bucket,
    hour_scores.weighted_score
    into best_hour,
      best_score
  from hour_scores
  order by hour_scores.weighted_score desc, hour_scores.raw_events desc, hour_scores.hour_bucket asc
  limit 1;

  select
    count(distinct event_row.viewer_profile_id) filter (
      where event_row.event_type in ('profile_opened', 'full_profile_opened')
        and event_row.viewer_profile_id is not null
    )::integer,
    count(*) filter (where event_row.event_type in ('profile_opened', 'full_profile_opened'))::integer,
    count(*) filter (where event_row.event_type in ('intro_played', 'intro_completed'))::integer,
    count(*) filter (where event_row.event_type = 'profile_saved')::integer,
    count(*) filter (where event_row.event_type = 'intent_opened')::integer
    into recent_unique_viewers,
      recent_views,
      recent_intro_opens,
      recent_saves,
      recent_intent_opens
  from public.vibes_events event_row
  where event_row.target_profile_id = v_viewer_profile_id
    and event_row.created_at > timezone('utc'::text, now()) - interval '7 days'
    and public.is_trusted_boost_viewer(event_row.viewer_profile_id, v_viewer_profile_id);

  if best_hour is null then
    best_hour := 20;
  end if;

  recommended_start_at := date_trunc('day', timezone('utc'::text, now()))
    + (best_hour || ' hours')::interval;
  if recommended_start_at <= timezone('utc'::text, now()) + interval '15 minutes' then
    recommended_start_at := recommended_start_at + interval '1 day';
  end if;

  recommendation_reason := case
    when recent_unique_viewers <= 1 and recent_views >= 10 then
      'Most of this traffic is coming from a very small number of viewers. Use the totals as directional, not broad-market demand yet.'
    when recent_saves >= 4 or recent_intent_opens >= 4 then
      'Your strongest signals are already converting. A precision boost can turn that momentum into deeper actions.'
    when recent_intro_opens >= 6 then
      'People are spending time with your intro. Lead with an intro-focused boost while attention is warm.'
    when recent_views >= 8 then
      'You are getting profile traffic. A boost now is best used to convert opens into saves and intent.'
    when best_score >= 6 then
      'Your profile historically performs best around this time window.'
    else
      'Use a boost when people nearby are active and your profile is fresh.'
  end;

  audience_options := case
    when resolved_plan = 'GOLD' then
      jsonb_build_array(
        jsonb_build_object('id', 'for_you', 'label', 'For you', 'description', 'Balanced discovery boost across your strongest fit lane.'),
        jsonb_build_object('id', 'nearby', 'label', 'Nearby', 'description', 'Lean into local visibility and short-distance discovery.'),
        jsonb_build_object('id', 'active_now', 'label', 'Active now', 'description', 'Bias the lift toward currently active members.'),
        jsonb_build_object('id', 'intent_match', 'label', 'Intent match', 'description', 'Favor people whose intent looks aligned with yours.'),
        jsonb_build_object('id', 'second_look', 'label', 'Second look', 'description', 'Quietly resurface you where there were earlier opens or curiosity.')
      )
    else
      jsonb_build_array(
        jsonb_build_object('id', 'for_you', 'label', 'For you', 'description', 'Balanced discovery boost across your strongest fit lane.'),
        jsonb_build_object('id', 'nearby', 'label', 'Nearby', 'description', 'Lean into local visibility and short-distance discovery.')
      )
  end;

  focus_options := case
    when resolved_plan = 'GOLD' then
      jsonb_build_array(
        jsonb_build_object('id', 'profile', 'label', 'Profile', 'description', 'Promote your overall profile story.'),
        jsonb_build_object('id', 'intro', 'label', 'Intro', 'description', 'Bias toward people likely to open your intro video.'),
        jsonb_build_object('id', 'intent', 'label', 'Intent', 'description', 'Bias toward deeper intent and fit evaluation.')
      )
    else
      jsonb_build_array(
        jsonb_build_object('id', 'profile', 'label', 'Profile', 'description', 'Promote your overall profile story.')
      )
  end;

  return jsonb_strip_nulls(jsonb_build_object(
    'plan', resolved_plan,
    'has_active_boost', active_boost.id is not null,
    'active_boost_ends_at', active_boost.ends_at,
    'recommended_start_at', recommended_start_at,
    'recommended_audience_mode', case when resolved_plan = 'GOLD' then 'intent_match' else 'for_you' end,
    'recommended_focus_mode', case when resolved_plan = 'GOLD' and recent_intro_opens >= recent_views then 'intro' else 'profile' end,
    'recommendation_reason', recommendation_reason,
    'audience_options', audience_options,
    'focus_options', focus_options,
    'recent_metrics', jsonb_build_object(
      'unique_viewers_7d', recent_unique_viewers,
      'views_7d', recent_views,
      'intro_opens_7d', recent_intro_opens,
      'saves_7d', recent_saves,
      'intent_opens_7d', recent_intent_opens
    )
  ));
end;
$$;

create or replace function public.rpc_get_my_recent_boost_analytics()
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_viewer_profile_id uuid;
  boost_row record;
  unique_viewer_count integer := 0;
  view_count integer := 0;
  unique_intro_viewer_count integer := 0;
  intro_count integer := 0;
  unique_saver_count integer := 0;
  save_count integer := 0;
  unique_intent_viewer_count integer := 0;
  intent_count integer := 0;
  like_count integer := 0;
  accepted_match_count integer := 0;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  select p.id
    into v_viewer_profile_id
  from public.profiles p
  where p.user_id = auth.uid()
    and p.deleted_at is null
  limit 1;

  if v_viewer_profile_id is null then
    raise exception 'profile required';
  end if;

  select
    pb.id,
    pb.starts_at,
    pb.ends_at,
    pb.created_at,
    pb.boost_type,
    pb.audience_mode,
    pb.focus_mode,
    pb.status
    into boost_row
  from public.profile_boosts pb
  where pb.user_id = v_viewer_profile_id
    and pb.created_at > timezone('utc'::text, now()) - interval '30 days'
  order by pb.ends_at desc, pb.created_at desc
  limit 1;

  if boost_row.id is null then
    return jsonb_build_object(
      'has_boost', false,
      'metrics', jsonb_build_object(
        'unique_viewers', 0,
        'views', 0,
        'unique_intro_viewers', 0,
        'intro_opens', 0,
        'unique_savers', 0,
        'saves', 0,
        'unique_intent_viewers', 0,
        'intent_opens', 0,
        'likes', 0,
        'accepted_matches', 0
      )
    );
  end if;

  select
    count(distinct event_row.viewer_profile_id) filter (
      where event_row.event_type in ('profile_opened', 'full_profile_opened')
        and event_row.viewer_profile_id is not null
    )::integer,
    count(*) filter (where event_row.event_type in ('profile_opened', 'full_profile_opened'))::integer,
    count(distinct event_row.viewer_profile_id) filter (
      where event_row.event_type in ('intro_played', 'intro_completed')
        and event_row.viewer_profile_id is not null
    )::integer,
    count(*) filter (where event_row.event_type in ('intro_played', 'intro_completed'))::integer,
    count(distinct event_row.viewer_profile_id) filter (
      where event_row.event_type = 'profile_saved'
        and event_row.viewer_profile_id is not null
    )::integer,
    count(*) filter (where event_row.event_type = 'profile_saved')::integer,
    count(distinct event_row.viewer_profile_id) filter (
      where event_row.event_type = 'intent_opened'
        and event_row.viewer_profile_id is not null
    )::integer,
    count(*) filter (where event_row.event_type = 'intent_opened')::integer,
    count(*) filter (where event_row.event_type = 'like')::integer
    into unique_viewer_count,
      view_count,
      unique_intro_viewer_count,
      intro_count,
      unique_saver_count,
      save_count,
      unique_intent_viewer_count,
      intent_count,
      like_count
  from public.vibes_events event_row
  where event_row.target_profile_id = v_viewer_profile_id
    and event_row.created_at >= boost_row.starts_at
    and event_row.created_at <= least(boost_row.ends_at, timezone('utc'::text, now()))
    and public.is_trusted_boost_viewer(event_row.viewer_profile_id, v_viewer_profile_id);

  select count(*)::integer
    into accepted_match_count
  from public.matches match_row
  cross join lateral (
    select case
      when match_row.user1_id = v_viewer_profile_id then match_row.user2_id
      else match_row.user1_id
    end as counterpart_profile_id
  ) counterpart
  where match_row.status = 'ACCEPTED'
    and match_row.updated_at >= boost_row.starts_at
    and match_row.updated_at <= least(boost_row.ends_at + interval '24 hours', timezone('utc'::text, now()))
    and (
      match_row.user1_id = v_viewer_profile_id
      or match_row.user2_id = v_viewer_profile_id
    )
    and public.is_trusted_boost_viewer(counterpart.counterpart_profile_id, v_viewer_profile_id);

  return jsonb_build_object(
    'has_boost', true,
    'boost', jsonb_build_object(
      'id', boost_row.id,
      'starts_at', boost_row.starts_at,
      'ends_at', boost_row.ends_at,
      'created_at', boost_row.created_at,
      'boost_type', boost_row.boost_type,
      'audience_mode', boost_row.audience_mode,
      'focus_mode', boost_row.focus_mode,
      'status', boost_row.status,
      'is_active', boost_row.starts_at <= timezone('utc'::text, now()) and boost_row.ends_at > timezone('utc'::text, now())
    ),
    'metrics', jsonb_build_object(
      'unique_viewers', unique_viewer_count,
      'views', view_count,
      'unique_intro_viewers', unique_intro_viewer_count,
      'intro_opens', intro_count,
      'unique_savers', unique_saver_count,
      'saves', save_count,
      'unique_intent_viewers', unique_intent_viewer_count,
      'intent_opens', intent_count,
      'likes', like_count,
      'accepted_matches', accepted_match_count
    )
  );
end;
$$;

revoke all on function public.is_trusted_boost_viewer(uuid, uuid) from public;
