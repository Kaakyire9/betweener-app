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
  best_recent_recipe jsonb := null;
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

  with recent_boosts as (
    select
      pb.id,
      pb.created_at,
      pb.starts_at,
      pb.ends_at,
      coalesce(pb.boost_type, 'manual') as boost_type,
      coalesce(pb.audience_mode, 'for_you') as audience_mode,
      coalesce(pb.focus_mode, 'profile') as focus_mode
    from public.profile_boosts pb
    where pb.user_id = v_viewer_profile_id
      and pb.created_at > timezone('utc'::text, now()) - interval '45 days'
      and pb.ends_at <= timezone('utc'::text, now())
  ),
  boost_event_metrics as (
    select
      rb.id,
      count(distinct event_row.viewer_profile_id) filter (
        where event_row.event_type in ('profile_opened', 'full_profile_opened')
          and event_row.viewer_profile_id is not null
      )::integer as unique_viewers,
      count(*) filter (
        where event_row.event_type in ('profile_opened', 'full_profile_opened')
      )::integer as views,
      count(*) filter (
        where event_row.event_type in ('intro_played', 'intro_completed')
      )::integer as intro_opens,
      count(distinct event_row.viewer_profile_id) filter (
        where event_row.event_type = 'profile_saved'
          and event_row.viewer_profile_id is not null
      )::integer as unique_savers,
      count(distinct event_row.viewer_profile_id) filter (
        where event_row.event_type = 'intent_opened'
          and event_row.viewer_profile_id is not null
      )::integer as unique_intent_viewers
    from recent_boosts rb
    left join public.vibes_events event_row
      on event_row.target_profile_id = v_viewer_profile_id
     and event_row.created_at >= rb.starts_at
     and event_row.created_at <= rb.ends_at
     and public.is_trusted_boost_viewer(event_row.viewer_profile_id, v_viewer_profile_id)
    group by rb.id
  ),
  boost_match_metrics as (
    select
      rb.id,
      count(*)::integer as accepted_matches
    from recent_boosts rb
    left join public.matches match_row
      on match_row.status = 'ACCEPTED'
     and match_row.updated_at >= rb.starts_at
     and match_row.updated_at <= least(rb.ends_at + interval '24 hours', timezone('utc'::text, now()))
     and (
       match_row.user1_id = v_viewer_profile_id
       or match_row.user2_id = v_viewer_profile_id
     )
    left join public.profiles counterpart
      on counterpart.id = case
        when match_row.user1_id = v_viewer_profile_id then match_row.user2_id
        else match_row.user1_id
      end
    where match_row.id is null
       or public.is_trusted_boost_viewer(counterpart.id, v_viewer_profile_id)
    group by rb.id
  ),
  ranked_recipes as (
    select
      rb.*,
      coalesce(bem.unique_viewers, 0) as unique_viewers,
      coalesce(bem.views, 0) as views,
      coalesce(bem.intro_opens, 0) as intro_opens,
      coalesce(bem.unique_savers, 0) as unique_savers,
      coalesce(bem.unique_intent_viewers, 0) as unique_intent_viewers,
      coalesce(bmm.accepted_matches, 0) as accepted_matches,
      (
        coalesce(bem.unique_viewers, 0) * 0.4 +
        coalesce(bem.intro_opens, 0) * 1.3 +
        coalesce(bem.unique_savers, 0) * 4.2 +
        coalesce(bem.unique_intent_viewers, 0) * 5.0 +
        coalesce(bmm.accepted_matches, 0) * 8.0
      ) as recipe_score
    from recent_boosts rb
    left join boost_event_metrics bem
      on bem.id = rb.id
    left join boost_match_metrics bmm
      on bmm.id = rb.id
    where
      coalesce(bem.unique_viewers, 0) > 0
      or coalesce(bem.unique_savers, 0) > 0
      or coalesce(bem.unique_intent_viewers, 0) > 0
      or coalesce(bmm.accepted_matches, 0) > 0
  )
  select jsonb_build_object(
    'boost_type', recipe.boost_type,
    'audience_mode', recipe.audience_mode,
    'focus_mode', recipe.focus_mode,
    'headline',
      case
        when recipe.accepted_matches > 0 then 'Best recent converter'
        when recipe.unique_intent_viewers > 0 then 'Best recent intent recipe'
        when recipe.unique_savers > 0 then 'Best recent quality recipe'
        else 'Best recent reach recipe'
      end,
    'summary',
      case
        when recipe.accepted_matches > 0 then
          format(
            '%s brought %s and %s from trusted viewers.',
            case when recipe.boost_type = 'smart' then 'This precision recipe' else 'This boost recipe' end,
            case when recipe.accepted_matches = 1 then '1 match' else recipe.accepted_matches::text || ' matches' end,
            case when recipe.unique_intent_viewers = 1 then '1 intent viewer' else recipe.unique_intent_viewers::text || ' intent viewers' end
          )
        when recipe.unique_intent_viewers > 0 then
          format(
            'This combo drove %s and %s.',
            case when recipe.unique_intent_viewers = 1 then '1 intent viewer' else recipe.unique_intent_viewers::text || ' intent viewers' end,
            case when recipe.unique_savers = 1 then '1 save' else recipe.unique_savers::text || ' saves' end
          )
        when recipe.unique_savers > 0 then
          format(
            'This combo drove %s from a trusted audience.',
            case when recipe.unique_savers = 1 then '1 save' else recipe.unique_savers::text || ' saves' end
          )
        else
          format(
            'This combo reached %s with %s total opens.',
            case when recipe.unique_viewers = 1 then '1 trusted viewer' else recipe.unique_viewers::text || ' trusted viewers' end,
            recipe.views::text
          )
      end,
    'trusted_reach', recipe.unique_viewers,
    'views', recipe.views,
    'intro_opens', recipe.intro_opens,
    'unique_savers', recipe.unique_savers,
    'unique_intent_viewers', recipe.unique_intent_viewers,
    'accepted_matches', recipe.accepted_matches,
    'recipe_score', round(recipe.recipe_score::numeric, 2),
    'created_at', recipe.created_at
  )
    into best_recent_recipe
  from ranked_recipes recipe
  order by recipe.recipe_score desc, recipe.created_at desc
  limit 1;

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
    when best_recent_recipe is not null then
      'You already have a recent boost recipe with better-quality outcomes. Use it as your starting point instead of guessing from scratch.'
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
    'best_recent_recipe', best_recent_recipe,
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
