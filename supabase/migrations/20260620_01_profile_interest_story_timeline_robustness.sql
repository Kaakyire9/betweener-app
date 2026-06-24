-- Normalize signal stories with recency weighting and clearer timeline semantics.

create or replace function public.rpc_get_my_profile_interest()
returns jsonb
language plpgsql
security definer
stable
set search_path = public, pg_catalog
as $$
declare
  v_profile_id uuid;
  v_plan text;
  v_metrics jsonb;
  v_people jsonb := '[]'::jsonb;
  v_timeline jsonb := '[]'::jsonb;
  v_window interval;
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select profile.id
    into v_profile_id
  from public.profiles profile
  where profile.user_id = auth.uid()
    and profile.deleted_at is null
  limit 1;

  if v_profile_id is null then
    raise exception 'profile required';
  end if;

  v_plan := public.get_active_subscription_plan(auth.uid())::text;
  v_window := case when v_plan = 'GOLD' then interval '30 days' else interval '7 days' end;

  with recent as (
    select event_row.*
    from public.vibes_events event_row
    join public.profiles actor
      on actor.id = event_row.viewer_profile_id
     and actor.deleted_at is null
    where event_row.target_profile_id = v_profile_id
      and event_row.created_at > timezone('utc'::text, now()) - interval '7 days'
      and event_row.viewer_profile_id is not null
  ),
  recent_visit_counts as (
    select
      recent.viewer_profile_id,
      count(*) filter (where recent.event_type = 'profile_opened')::integer as profile_open_count,
      count(*) filter (where recent.event_type = 'full_profile_opened')::integer as full_open_count,
      count(*) filter (where recent.event_type in ('profile_opened', 'full_profile_opened'))::integer as total_open_count
    from recent
    group by recent.viewer_profile_id
  ),
  recent_saves as (
    select
      save_row.viewer_profile_id,
      max(save_row.created_at) as saved_at
    from public.profile_saves save_row
    join public.profiles actor
      on actor.id = save_row.viewer_profile_id
     and actor.deleted_at is null
    where save_row.target_profile_id = v_profile_id
      and save_row.created_at > timezone('utc'::text, now()) - interval '7 days'
    group by save_row.viewer_profile_id
  )
  select jsonb_build_object(
    'profile_visits', (
      select count(*)
      from recent_visit_counts
      where total_open_count > 0
    ),
    'unique_visitors', (
      select count(*)
      from recent_visit_counts
      where total_open_count > 0
    ),
    'profile_visit_events', (
      select coalesce(sum(total_open_count), 0)
      from recent_visit_counts
    ),
    'intro_watches', (
      select count(distinct recent.viewer_profile_id)
      from recent
      where recent.event_type in ('intro_played', 'intro_completed')
    ),
    'intro_watch_events', (
      select count(*)
      from recent
      where recent.event_type in ('intro_played', 'intro_completed')
    ),
    'profile_saves', (
      select count(*)
      from recent_saves
    ),
    'full_opens', (
      select count(distinct recent.viewer_profile_id)
      from recent
      where recent.event_type = 'full_profile_opened'
    ),
    'full_open_events', (
      select count(*)
      from recent
      where recent.event_type = 'full_profile_opened'
    ),
    'repeat_visits', (
      select count(*)
      from recent_visit_counts
      where total_open_count > 1
    ),
    'repeat_visit_events', (
      select coalesce(sum(greatest(total_open_count - 1, 0)), 0)
      from recent_visit_counts
    ),
    'intent_opens', (
      select count(distinct recent.viewer_profile_id)
      from recent
      where recent.event_type = 'intent_opened'
    ),
    'intent_open_events', (
      select count(*)
      from recent
      where recent.event_type = 'intent_opened'
    )
  ) into v_metrics;

  with scoped as (
    select event_row.*
    from public.vibes_events event_row
    join public.profiles actor
      on actor.id = event_row.viewer_profile_id
     and actor.deleted_at is null
    where event_row.target_profile_id = v_profile_id
      and event_row.viewer_profile_id is not null
      and event_row.event_type in (
        'profile_opened', 'full_profile_opened', 'intro_played',
        'intro_completed', 'profile_saved', 'profile_unsaved', 'intent_opened'
      )
      and event_row.created_at > timezone('utc'::text, now()) - v_window
  ),
  current_saves as (
    select
      save_row.viewer_profile_id,
      max(save_row.created_at) as saved_at
    from public.profile_saves save_row
    join public.profiles actor
      on actor.id = save_row.viewer_profile_id
     and actor.deleted_at is null
    where save_row.target_profile_id = v_profile_id
      and save_row.created_at > timezone('utc'::text, now()) - v_window
    group by save_row.viewer_profile_id
  ),
  signal_people as (
    select scoped.viewer_profile_id
    from scoped
    union
    select current_saves.viewer_profile_id
    from current_saves
  ),
  grouped as (
    select
      signal_people.viewer_profile_id,
      max(scoped.created_at) as last_event_at,
      count(*) filter (where scoped.event_type = 'profile_opened')::integer as profile_open_count,
      count(*) filter (where scoped.event_type = 'full_profile_opened')::integer as full_open_count,
      count(*) filter (where scoped.event_type in ('profile_opened', 'full_profile_opened'))::integer as visit_count,
      count(*) filter (where scoped.event_type = 'intro_played')::integer as intro_play_count,
      count(*) filter (where scoped.event_type = 'intro_completed')::integer as intro_complete_count,
      count(*) filter (where scoped.event_type in ('intro_played', 'intro_completed'))::integer as intro_watch_count,
      count(*) filter (where scoped.event_type = 'profile_saved')::integer as save_event_count,
      count(*) filter (where scoped.event_type = 'profile_unsaved')::integer as unsave_event_count,
      count(*) filter (where scoped.event_type = 'intent_opened')::integer as intent_open_count,
      greatest(count(*) filter (where scoped.event_type in ('profile_opened', 'full_profile_opened')) - 1, 0)::integer as repeat_visit_count
    from signal_people
    left join scoped
      on scoped.viewer_profile_id = signal_people.viewer_profile_id
    group by signal_people.viewer_profile_id
  ),
  latest_signal as (
    select distinct on (scoped.viewer_profile_id)
      scoped.viewer_profile_id,
      scoped.event_type,
      scoped.created_at
    from scoped
    order by scoped.viewer_profile_id, scoped.created_at desc, scoped.id desc
  ),
  enriched as (
    select
      grouped.viewer_profile_id,
      case
        when grouped.last_event_at is null then current_saves.saved_at
        when current_saves.saved_at is null then grouped.last_event_at
        else greatest(grouped.last_event_at, current_saves.saved_at)
      end as last_signal_at,
      grouped.profile_open_count,
      grouped.full_open_count,
      grouped.visit_count,
      grouped.intro_play_count,
      grouped.intro_complete_count,
      grouped.intro_watch_count,
      case
        when current_saves.viewer_profile_id is not null then greatest(grouped.save_event_count, 1)
        else 0
      end::integer as profile_save_count,
      grouped.unsave_event_count,
      current_saves.viewer_profile_id is not null as saved_profile,
      grouped.intent_open_count,
      grouped.repeat_visit_count,
      grouped.intro_watch_count > 0 as watched_intro,
      grouped.intent_open_count > 0 as opened_intent,
      latest_signal.event_type as last_signal_type,
      public.profile_interest_score(
        grouped.profile_open_count,
        grouped.full_open_count,
        grouped.intro_watch_count,
        case
          when current_saves.viewer_profile_id is not null then greatest(grouped.save_event_count, 1)
          else 0
        end::integer,
        grouped.repeat_visit_count,
        grouped.intent_open_count
      ) as interest_score,
      case
        when coalesce(
          case
            when grouped.last_event_at is null then current_saves.saved_at
            when current_saves.saved_at is null then grouped.last_event_at
            else greatest(grouped.last_event_at, current_saves.saved_at)
          end,
          timezone('utc'::text, now()) - interval '365 days'
        ) > timezone('utc'::text, now()) - interval '24 hours' then 4
        when coalesce(
          case
            when grouped.last_event_at is null then current_saves.saved_at
            when current_saves.saved_at is null then grouped.last_event_at
            else greatest(grouped.last_event_at, current_saves.saved_at)
          end,
          timezone('utc'::text, now()) - interval '365 days'
        ) > timezone('utc'::text, now()) - interval '3 days' then 2
        when coalesce(
          case
            when grouped.last_event_at is null then current_saves.saved_at
            when current_saves.saved_at is null then grouped.last_event_at
            else greatest(grouped.last_event_at, current_saves.saved_at)
          end,
          timezone('utc'::text, now()) - interval '365 days'
        ) > timezone('utc'::text, now()) - interval '7 days' then 1
        else 0
      end as recency_bonus
    from grouped
    left join current_saves
      on current_saves.viewer_profile_id = grouped.viewer_profile_id
    left join latest_signal
      on latest_signal.viewer_profile_id = grouped.viewer_profile_id
  ),
  ranked_people as (
    select
      enriched.*,
      actor.id,
      actor.full_name,
      actor.username,
      actor.avatar_url,
      case
        when enriched.saved_profile and enriched.profile_save_count > 0 then 'profile_saved'
        when not enriched.saved_profile and enriched.last_signal_type = 'profile_unsaved' then 'profile_unsaved'
        when enriched.intent_open_count > 0 then 'intent_opened'
        when enriched.intro_complete_count > 0 then 'intro_completed'
        when enriched.intro_play_count > 1 then 'intro_replayed'
        when enriched.intro_play_count > 0 then 'intro_played'
        when enriched.repeat_visit_count > 0 then 'repeat_visit'
        when enriched.full_open_count > 0 then 'full_profile_opened'
        else 'profile_opened'
      end as dominant_signal,
      enriched.interest_score + enriched.recency_bonus as ranking_score
    from enriched
    join public.profiles actor
      on actor.id = enriched.viewer_profile_id
    where actor.deleted_at is null
    order by ranking_score desc, enriched.last_signal_at desc nulls last
    limit case
      when v_plan = 'GOLD' then 40
      when v_plan = 'SILVER' then 12
      else 8
    end
  )
  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
    'profile_id', ranked_people.id,
    'name', case
      when v_plan = 'FREE' then 'Private member'
      else coalesce(nullif(btrim(ranked_people.full_name), ''), nullif(btrim(ranked_people.username), ''), 'Someone')
    end,
    'avatar_url', ranked_people.avatar_url,
    'last_signal_at', ranked_people.last_signal_at,
    'last_signal_type', ranked_people.last_signal_type,
    'visit_count', ranked_people.visit_count,
    'profile_open_count', ranked_people.profile_open_count,
    'full_open_count', ranked_people.full_open_count,
    'intro_play_count', ranked_people.intro_play_count,
    'intro_complete_count', ranked_people.intro_complete_count,
    'intro_watch_count', ranked_people.intro_watch_count,
    'profile_save_count', ranked_people.profile_save_count,
    'profile_unsave_count', ranked_people.unsave_event_count,
    'intent_open_count', ranked_people.intent_open_count,
    'repeat_visit_count', ranked_people.repeat_visit_count,
    'watched_intro', ranked_people.watched_intro,
    'saved_profile', ranked_people.saved_profile,
    'opened_intent', ranked_people.opened_intent,
    'dominant_signal', ranked_people.dominant_signal,
    'interest_score', ranked_people.interest_score,
    'ranking_score', ranked_people.ranking_score,
    'interest_level', public.profile_interest_level(ranked_people.interest_score),
    'shared_values', case when v_plan = 'GOLD' then (
      select coalesce(jsonb_agg(value_name order by value_name), '[]'::jsonb)
      from (
        select distinct interest.name as value_name
        from public.profile_interests actor_interest
        join public.profile_interests owner_interest
          on owner_interest.interest_id = actor_interest.interest_id
        join public.interests interest on interest.id = actor_interest.interest_id
        where actor_interest.profile_id = ranked_people.id
          and owner_interest.profile_id = v_profile_id
        limit 5
      ) shared
    ) end
  )) order by ranked_people.ranking_score desc, ranked_people.last_signal_at desc nulls last), '[]'::jsonb)
    into v_people
  from ranked_people;

  if v_plan = 'GOLD' then
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', timeline.id,
      'profile_id', timeline.profile_id,
      'name', timeline.name,
      'avatar_url', timeline.avatar_url,
      'signal', timeline.signal,
      'occurred_at', timeline.occurred_at
    ) order by timeline.occurred_at desc), '[]'::jsonb)
      into v_timeline
    from (
      select
        event_row.id,
        actor.id as profile_id,
        coalesce(
          nullif(btrim(actor.full_name), ''),
          nullif(btrim(actor.username), ''),
          'Someone'
        ) as name,
        actor.avatar_url,
        case
          when event_row.event_type = 'profile_unsaved' then 'profile_unsaved'
          when event_row.event_type = 'intro_played'
            and exists (
              select 1
              from public.vibes_events earlier_intro
              where earlier_intro.viewer_profile_id = event_row.viewer_profile_id
                and earlier_intro.target_profile_id = event_row.target_profile_id
                and earlier_intro.event_type in ('intro_played', 'intro_completed')
                and earlier_intro.created_at < event_row.created_at
                and earlier_intro.created_at > event_row.created_at - interval '30 days'
            ) then 'intro_replayed'
          when event_row.event_type = 'profile_opened'
            and exists (
              select 1
              from public.vibes_events earlier_open
              where earlier_open.viewer_profile_id = event_row.viewer_profile_id
                and earlier_open.target_profile_id = event_row.target_profile_id
                and earlier_open.event_type in ('profile_opened', 'full_profile_opened')
                and earlier_open.created_at < event_row.created_at
                and earlier_open.created_at > event_row.created_at - interval '30 days'
            ) then 'repeat_visit'
          else event_row.event_type
        end as signal,
        event_row.created_at as occurred_at
      from public.vibes_events event_row
      join public.profiles actor
        on actor.id = event_row.viewer_profile_id
       and actor.deleted_at is null
      where event_row.target_profile_id = v_profile_id
        and event_row.event_type in (
          'profile_opened', 'full_profile_opened', 'intro_played',
          'intro_completed', 'profile_saved', 'profile_unsaved', 'intent_opened'
        )
        and event_row.created_at > timezone('utc'::text, now()) - interval '30 days'
      order by event_row.created_at desc
      limit 60
    ) timeline;
  end if;

  return jsonb_build_object(
    'plan', v_plan,
    'window_days', case when v_plan = 'GOLD' then 30 else 7 end,
    'metrics', coalesce(v_metrics, '{}'::jsonb),
    'people', coalesce(v_people, '[]'::jsonb),
    'timeline', coalesce(v_timeline, '[]'::jsonb)
  );
end;
$$;

revoke all on function public.rpc_get_my_profile_interest() from public;
grant execute on function public.rpc_get_my_profile_interest() to authenticated;
