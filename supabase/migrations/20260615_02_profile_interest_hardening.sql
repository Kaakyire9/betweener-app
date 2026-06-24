create or replace function public.profile_interest_score(
  p_profile_open_count integer default 0,
  p_full_open_count integer default 0,
  p_intro_watch_count integer default 0,
  p_profile_save_count integer default 0,
  p_repeat_visit_count integer default 0,
  p_intent_open_count integer default 0
)
returns integer
language sql
immutable
set search_path = public, pg_catalog
as $$
  select least(
    100,
    greatest(
      0,
      coalesce(p_profile_open_count, 0)
      + coalesce(p_full_open_count, 0) * 2
      + coalesce(p_intro_watch_count, 0) * 3
      + coalesce(p_profile_save_count, 0) * 4
      + coalesce(p_repeat_visit_count, 0) * 5
      + coalesce(p_intent_open_count, 0) * 5
    )
  )::integer;
$$;

create or replace function public.profile_interest_level(
  p_interest_score integer
)
returns text
language sql
immutable
set search_path = public, pg_catalog
as $$
  select case
    when coalesce(p_interest_score, 0) >= 16 then 'High Interest'
    when coalesce(p_interest_score, 0) >= 7 then 'Medium Interest'
    else 'Low Interest'
  end;
$$;

create or replace function public.rpc_log_vibes_event(
  p_viewer_profile_id uuid,
  p_target_profile_id uuid,
  p_segment text default 'for_you',
  p_event_type text default 'card_seen',
  p_position integer default null,
  p_dwell_ms integer default null,
  p_metadata jsonb default '{}'::jsonb
)
returns boolean
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
declare
  v_viewer_user_id uuid;
  v_target_user_id uuid;
  v_viewer_name text;
  v_viewer_avatar text;
  v_target_plan text;
  v_segment text := coalesce(nullif(btrim(p_segment), ''), 'for_you');
  v_event_type text := coalesce(nullif(btrim(p_event_type), ''), 'card_seen');
  v_throttle interval;
  v_notification_body text;
  v_has_inbox_items boolean := to_regclass('public.inbox_items') is not null;
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  if v_segment not in ('for_you', 'nearby', 'active_now') then
    raise exception 'invalid_vibes_segment';
  end if;

  if v_event_type not in (
    'card_seen', 'profile_opened', 'full_profile_opened', 'intro_played',
    'intro_completed', 'profile_saved', 'pass', 'like', 'signal_opened',
    'signal_sent', 'intent_opened', 'intent_sent', 'undo'
  ) then
    raise exception 'invalid_vibes_event_type';
  end if;

  if p_viewer_profile_id is null
    or p_target_profile_id is null
    or p_viewer_profile_id = p_target_profile_id then
    return false;
  end if;

  select profile.user_id, profile.full_name, profile.avatar_url
    into v_viewer_user_id, v_viewer_name, v_viewer_avatar
  from public.profiles profile
  where profile.id = p_viewer_profile_id
    and profile.deleted_at is null
  limit 1;

  if v_viewer_user_id is null or v_viewer_user_id <> auth.uid() then
    raise exception 'viewer profile does not belong to authenticated user' using errcode = '42501';
  end if;

  select profile.user_id
    into v_target_user_id
  from public.profiles profile
  where profile.id = p_target_profile_id
    and profile.deleted_at is null
  limit 1;

  if v_target_user_id is null then
    return false;
  end if;

  v_target_plan := public.get_active_subscription_plan(v_target_user_id)::text;

  if exists (
    select 1
    from public.blocks block_row
    where (block_row.blocker_id = v_viewer_user_id and block_row.blocked_id = v_target_user_id)
       or (block_row.blocker_id = v_target_user_id and block_row.blocked_id = v_viewer_user_id)
  ) then
    return false;
  end if;

  v_throttle := case
    when v_event_type = 'card_seen' then interval '6 hours'
    when v_event_type in ('profile_opened', 'full_profile_opened') then interval '30 minutes'
    when v_event_type in ('intro_played', 'intro_completed', 'intent_opened', 'profile_saved') then interval '6 hours'
    else interval '2 minutes'
  end;

  if exists (
    select 1
    from public.vibes_events event_row
    where event_row.viewer_profile_id = p_viewer_profile_id
      and event_row.target_profile_id = p_target_profile_id
      and event_row.event_type = v_event_type
      and event_row.segment = v_segment
      and event_row.created_at > timezone('utc'::text, now()) - v_throttle
  ) then
    return false;
  end if;

  insert into public.vibes_events (
    viewer_user_id,
    viewer_profile_id,
    target_profile_id,
    target_user_id,
    segment,
    event_type,
    position,
    dwell_ms,
    metadata
  )
  values (
    v_viewer_user_id,
    p_viewer_profile_id,
    p_target_profile_id,
    v_target_user_id,
    v_segment,
    v_event_type,
    p_position,
    greatest(coalesce(p_dwell_ms, 0), 0),
    coalesce(p_metadata, '{}'::jsonb)
  );

  v_notification_body := case
    when v_event_type = 'profile_saved' then 'Saved your profile'
    when v_event_type in ('intro_played', 'intro_completed') then 'Watched your intro video'
    when v_event_type = 'intent_opened' then 'Spent time with your Intent'
    when v_event_type in ('profile_opened', 'full_profile_opened')
      and exists (
        select 1
        from public.vibes_events previous_event
        where previous_event.viewer_profile_id = p_viewer_profile_id
          and previous_event.target_profile_id = p_target_profile_id
          and previous_event.event_type in ('profile_opened', 'full_profile_opened')
          and previous_event.created_at < timezone('utc'::text, now()) - interval '30 minutes'
          and previous_event.created_at > timezone('utc'::text, now()) - interval '30 days'
      )
      then 'Revisited your profile'
    else null
  end;

  if v_has_inbox_items
    and v_notification_body is not null
    and not exists (
      select 1
      from public.inbox_items inbox
      where inbox.user_id = v_target_user_id
        and inbox.entity_type = 'profile_interest'
        and inbox.created_at > timezone('utc'::text, now()) - interval '24 hours'
    )
    and not exists (
      select 1
      from public.notification_prefs prefs
      where prefs.user_id = v_target_user_id
        and prefs.inapp_enabled = false
    ) then
    insert into public.inbox_items (
      user_id,
      type,
      actor_id,
      entity_id,
      entity_type,
      title,
      body,
      action_required,
      metadata
    )
    values (
      v_target_user_id,
      'SYSTEM',
      case when v_target_plan in ('SILVER', 'GOLD') then p_viewer_profile_id else null end,
      p_target_profile_id,
      'profile_interest',
      case
        when v_target_plan in ('SILVER', 'GOLD')
          then coalesce(nullif(btrim(v_viewer_name), ''), 'Someone')
        else 'Profile Interest'
      end,
      v_notification_body,
      false,
      jsonb_strip_nulls(jsonb_build_object(
        'type', 'profile_interest',
        'signal', v_event_type,
        'profile_id', case when v_target_plan in ('SILVER', 'GOLD') then p_viewer_profile_id end,
        'name', case when v_target_plan in ('SILVER', 'GOLD') then v_viewer_name end,
        'avatar_url', case when v_target_plan in ('SILVER', 'GOLD') then v_viewer_avatar end,
        'route', '/profile-interest'
      ))
    );
  end if;

  return true;
end;
$$;

create or replace function public.rpc_get_profile_card_context(
  p_profile_ids uuid[]
)
returns table (
  profile_id uuid,
  premium_plan text,
  is_new_here boolean,
  interest_relevance_score integer
)
language sql
security definer
stable
set search_path = public, pg_catalog
as $$
  with viewer as (
    select profile.id
    from public.profiles profile
    where profile.user_id = auth.uid()
      and profile.deleted_at is null
    limit 1
  ),
  recent as (
    select
      event_row.viewer_profile_id,
      event_row.event_type
    from public.vibes_events event_row
    join viewer on viewer.id = event_row.target_profile_id
    where event_row.viewer_profile_id = any(coalesce(p_profile_ids, '{}'::uuid[]))
      and event_row.created_at > timezone('utc'::text, now()) - interval '30 days'
  ),
  visit_counts as (
    select
      recent.viewer_profile_id,
      count(*)::integer as visit_count
    from recent
    where recent.event_type in ('profile_opened', 'full_profile_opened')
    group by recent.viewer_profile_id
  ),
  interest as (
    select
      recent.viewer_profile_id,
      public.profile_interest_score(
        count(*) filter (where recent.event_type = 'profile_opened')::integer,
        count(*) filter (where recent.event_type = 'full_profile_opened')::integer,
        count(*) filter (where recent.event_type in ('intro_played', 'intro_completed'))::integer,
        count(*) filter (where recent.event_type = 'profile_saved')::integer,
        coalesce(greatest(max(visit_counts.visit_count) - 1, 0), 0),
        count(*) filter (where recent.event_type = 'intent_opened')::integer
      ) as score
    from recent
    left join visit_counts
      on visit_counts.viewer_profile_id = recent.viewer_profile_id
    group by recent.viewer_profile_id
  )
  select
    profile.id,
    public.get_active_subscription_plan(profile.user_id)::text,
    profile.created_at > timezone('utc'::text, now()) - interval '14 days',
    coalesce(interest.score, 0)
  from public.profiles profile
  left join interest on interest.viewer_profile_id = profile.id
  where auth.uid() is not null
    and profile.id = any(coalesce(p_profile_ids, '{}'::uuid[]))
    and profile.deleted_at is null;
$$;

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

  if v_plan in ('SILVER', 'GOLD') then
    with scoped as (
      select event_row.*
      from public.vibes_events event_row
      where event_row.target_profile_id = v_profile_id
        and event_row.event_type in (
          'profile_opened', 'full_profile_opened', 'intro_played',
          'intro_completed', 'profile_saved', 'intent_opened'
        )
        and event_row.created_at > timezone('utc'::text, now())
          - case when v_plan = 'GOLD' then interval '30 days' else interval '7 days' end
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
      select grouped.*, actor.id, actor.full_name, actor.avatar_url
      from grouped
      join public.profiles actor on actor.id = grouped.viewer_profile_id
      where actor.deleted_at is null
      order by grouped.interest_score desc, grouped.last_signal_at desc
      limit case when v_plan = 'GOLD' then 40 else 12 end
    )
    select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
      'profile_id', ranked_people.id,
      'name', coalesce(nullif(btrim(ranked_people.full_name), ''), 'Someone'),
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
  end if;

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
        coalesce(nullif(btrim(actor.full_name), ''), 'Someone') as name,
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

revoke all on function public.profile_interest_score(integer, integer, integer, integer, integer, integer) from public;
revoke all on function public.profile_interest_level(integer) from public;

grant execute on function public.profile_interest_score(integer, integer, integer, integer, integer, integer) to authenticated;
grant execute on function public.profile_interest_level(integer) to authenticated;
