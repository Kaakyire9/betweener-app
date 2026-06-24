-- Allow free plan profile interest to surface redacted avatar previews for blurred teaser cards.

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

  with recent as (
    select event_row.*
    from public.vibes_events event_row
    where event_row.target_profile_id = v_profile_id
      and event_row.created_at > timezone('utc'::text, now()) - interval '7 days'
  ),
  visit_counts as (
    select viewer_profile_id, count(*)::integer as visit_count
    from recent
    where event_type in ('profile_opened', 'full_profile_opened')
    group by viewer_profile_id
  )
  select jsonb_build_object(
    'profile_visits', (select count(*) from recent where event_type = 'profile_opened'),
    'intro_watches', (select count(*) from recent where event_type in ('intro_played', 'intro_completed')),
    'profile_saves', (
      select count(*)
      from public.profile_saves save_row
      where save_row.target_profile_id = v_profile_id
        and save_row.created_at > timezone('utc'::text, now()) - interval '7 days'
    ),
    'full_opens', (select count(*) from recent where event_type = 'full_profile_opened'),
    'repeat_visits', (select coalesce(sum(greatest(visit_count - 1, 0)), 0) from visit_counts),
    'intent_opens', (select count(*) from recent where event_type = 'intent_opened')
  ) into v_metrics;

  with scoped as (
    select event_row.*
    from public.vibes_events event_row
    where event_row.target_profile_id = v_profile_id
      and event_row.event_type in (
        'profile_opened', 'full_profile_opened', 'intro_played',
        'intro_completed', 'profile_saved', 'intent_opened'
      )
      and event_row.created_at > timezone('utc'::text, now())
        - case
            when v_plan = 'GOLD' then interval '30 days'
            else interval '7 days'
          end
  ),
  grouped as (
    select
      scoped.viewer_profile_id,
      max(scoped.created_at) as last_signal_at,
      count(*) filter (where scoped.event_type in ('profile_opened', 'full_profile_opened'))::integer as visit_count,
      bool_or(scoped.event_type in ('intro_played', 'intro_completed')) as watched_intro,
      bool_or(scoped.event_type = 'profile_saved') as saved_profile,
      bool_or(scoped.event_type = 'intent_opened') as opened_intent,
      public.profile_interest_score(
        count(*) filter (where scoped.event_type = 'profile_opened')::integer,
        count(*) filter (where scoped.event_type = 'full_profile_opened')::integer,
        count(*) filter (where scoped.event_type in ('intro_played', 'intro_completed'))::integer,
        count(*) filter (where scoped.event_type = 'profile_saved')::integer,
        greatest(count(*) filter (where scoped.event_type in ('profile_opened', 'full_profile_opened')) - 1, 0)::integer,
        count(*) filter (where scoped.event_type = 'intent_opened')::integer
      ) as interest_score
    from scoped
    group by scoped.viewer_profile_id
  ),
  ranked_people as (
    select grouped.*, actor.id, actor.full_name, actor.username, actor.avatar_url
    from grouped
    join public.profiles actor on actor.id = grouped.viewer_profile_id
    where actor.deleted_at is null
    order by grouped.interest_score desc, grouped.last_signal_at desc
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
    'visit_count', ranked_people.visit_count,
    'watched_intro', ranked_people.watched_intro,
    'saved_profile', ranked_people.saved_profile,
    'opened_intent', ranked_people.opened_intent,
    'interest_score', ranked_people.interest_score,
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
  )) order by ranked_people.interest_score desc, ranked_people.last_signal_at desc), '[]'::jsonb)
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
        event_row.event_type as signal,
        event_row.created_at as occurred_at
      from public.vibes_events event_row
      join public.profiles actor on actor.id = event_row.viewer_profile_id
      where event_row.target_profile_id = v_profile_id
        and event_row.event_type in (
          'profile_opened', 'full_profile_opened', 'intro_played',
          'intro_completed', 'profile_saved', 'intent_opened'
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
