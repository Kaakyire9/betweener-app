-- Live Creation Studio lifecycle.
--
-- Adds idempotent publication, optimistic editing, rescheduling with explicit
-- RSVP reconfirmation, cancellation side effects, and owner-only archiving.
-- Published Live rows are retained for safety and audit history.

begin;

alter table public.live_sessions
  add column if not exists creation_request_id uuid,
  add column if not exists scheduled_duration_minutes integer not null default 90,
  add column if not exists schedule_revision integer not null default 0,
  add column if not exists rescheduled_at timestamptz,
  add column if not exists cancellation_reason text,
  add column if not exists archived_at timestamptz;

alter table public.live_sessions
  drop constraint if exists live_sessions_scheduled_duration_valid,
  add constraint live_sessions_scheduled_duration_valid
    check (scheduled_duration_minutes between 30 and 180) not valid,
  drop constraint if exists live_sessions_schedule_revision_valid,
  add constraint live_sessions_schedule_revision_valid
    check (schedule_revision >= 0) not valid,
  drop constraint if exists live_sessions_cancellation_reason_valid,
  add constraint live_sessions_cancellation_reason_valid
    check (
      cancellation_reason is null
      or cancellation_reason in (
        'plans_changed',
        'host_unavailable',
        'not_enough_people',
        'safety',
        'other'
      )
    ) not valid;

alter table public.live_participants
  drop constraint if exists live_participants_rsvp_status_valid;

alter table public.live_participants
  add constraint live_participants_rsvp_status_valid
  check (rsvp_status in (
    'none',
    'invited',
    'going',
    'waitlisted',
    'declined',
    'needs_reconfirmation'
  )) not valid;

-- Release the brief table locks before installing the function layer. The
-- expand step is deliberately retry-safe if a later function statement fails.
commit;

begin;

-- A confirmed room may return to quorum collection only when a server-owned
-- workflow, such as rescheduling, changes the attendance contract.
create or replace function public.enforce_live_session_transition()
returns trigger
language plpgsql
set search_path = public, pg_catalog
as $$
begin
  if new.status is not distinct from old.status then return new; end if;
  if not (
    (old.status = 'draft' and new.status in ('scheduled','cancelled'))
    or (old.status = 'scheduled' and new.status in ('waiting_for_quorum','confirmed','cancelled'))
    or (old.status = 'waiting_for_quorum' and new.status in ('confirmed','cancelled'))
    or (old.status = 'confirmed' and new.status in ('waiting_for_quorum','backstage','cancelled'))
    or (old.status = 'backstage' and new.status in ('live','cancelled'))
    or (old.status = 'live' and new.status = 'ending')
    or (old.status = 'ending' and new.status = 'ended')
  ) then
    raise exception 'invalid_live_session_transition:%:%', old.status, new.status
      using errcode = '23514';
  end if;
  new.version := old.version + 1;
  return new;
end;
$$;

-- Bulk RSVP invalidation during rescheduling is followed by one deterministic
-- quorum evaluation. This avoids transient re-confirmation while rows change.
create or replace function public.live_participant_quorum_changed()
returns trigger
language plpgsql
set search_path = public, pg_catalog
as $$
begin
  if current_setting('app.live_reschedule', true) = '1' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if tg_op = 'DELETE' then
    perform public.live_evaluate_quorum(old.session_id);
    return old;
  end if;
  perform public.live_evaluate_quorum(new.session_id);
  return new;
end;
$$;

create or replace function public.rpc_schedule_live_studio_session_v1(
  p_client_request_id uuid,
  p_title text,
  p_description text,
  p_scheduled_start timestamptz,
  p_duration_minutes integer,
  p_format text default 'hosted_match_night',
  p_chemistry_first_enabled boolean default false,
  p_circle_id uuid default null,
  p_minimum_participants integer default 2
)
returns public.live_sessions
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  v_session public.live_sessions;
begin
  if auth.uid() is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if p_client_request_id is null then
    raise exception 'live_creation_request_id_required' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(auth.uid()::text || ':' || p_client_request_id::text, 0)
  );

  select * into v_session
  from public.live_sessions session
  where session.created_by_user_id = auth.uid()
    and session.creation_request_id = p_client_request_id;

  if v_session.id is not null then return v_session; end if;

  if nullif(btrim(p_title), '') is null or char_length(btrim(p_title)) > 120 then
    raise exception 'live_title_invalid' using errcode = '22023';
  end if;
  if char_length(coalesce(p_description, '')) > 1000 then
    raise exception 'live_description_invalid' using errcode = '22023';
  end if;
  if p_duration_minutes is null or p_duration_minutes not between 30 and 180 then
    raise exception 'live_duration_invalid' using errcode = '22023';
  end if;
  if p_scheduled_start is null
     or p_scheduled_start < timezone('utc', now()) + interval '10 minutes'
     or p_scheduled_start > timezone('utc', now()) + interval '90 days' then
    raise exception 'live_schedule_time_invalid' using errcode = '22023';
  end if;
  if p_format is null
     or (p_circle_id is null and p_format not in ('hosted_match_night','quick_connect'))
     or (p_circle_id is not null and p_format <> 'circle_live') then
    raise exception 'live_schedule_format_invalid' using errcode = '22023';
  end if;

  if p_circle_id is null then
    v_session := public.rpc_schedule_live_session_v2(
      btrim(p_title),
      nullif(btrim(p_description), ''),
      p_scheduled_start,
      p_format,
      coalesce(p_chemistry_first_enabled, false)
    );
  else
    v_session := public.rpc_schedule_circle_live_session(
      p_circle_id,
      btrim(p_title),
      nullif(btrim(p_description), ''),
      p_scheduled_start,
      coalesce(p_chemistry_first_enabled, false),
      p_minimum_participants
    );
  end if;

  update public.live_sessions session
  set creation_request_id = p_client_request_id,
      scheduled_duration_minutes = p_duration_minutes,
      scheduled_end = p_scheduled_start + make_interval(mins => p_duration_minutes),
      configuration = coalesce(session.configuration, '{}'::jsonb) || jsonb_build_object(
        'creation_surface', 'live_studio_v1'
      )
  where session.id = v_session.id
  returning * into v_session;

  update public.gatherings gathering
  set title = v_session.title,
      description = v_session.description,
      starts_at = v_session.scheduled_start,
      ends_at = v_session.scheduled_end
  where gathering.live_session_id = v_session.id;

  insert into public.live_session_events(
    session_id,
    actor_user_id,
    event_type,
    to_state,
    metadata
  ) values (
    v_session.id,
    auth.uid(),
    'studio_session_published',
    v_session.status,
    jsonb_build_object(
      'duration_minutes', p_duration_minutes,
      'circle_live', p_circle_id is not null
    )
  );

  return v_session;
end;
$$;

create or replace function public.rpc_update_live_studio_session_v1(
  p_session_id uuid,
  p_expected_version bigint,
  p_title text,
  p_description text,
  p_scheduled_start timestamptz,
  p_duration_minutes integer,
  p_chemistry_first_enabled boolean,
  p_minimum_participants integer default 2
)
returns public.live_sessions
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  v_session public.live_sessions;
  v_schedule_changed boolean;
  v_title_changed boolean;
  v_description_changed boolean;
  v_chemistry_changed boolean;
  v_quorum_changed boolean;
  v_pooling_reset boolean := false;
begin
  if auth.uid() is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  select * into v_session
  from public.live_sessions session
  where session.id = p_session_id
  for update;

  if v_session.id is null then
    raise exception 'live_session_not_found' using errcode = 'P0002';
  end if;
  if v_session.created_by_user_id <> auth.uid()
     and not public.is_admin_user(auth.uid()) then
    raise exception 'live_studio_manage_forbidden' using errcode = '42501';
  end if;
  if v_session.version <> p_expected_version then
    raise exception 'live_session_version_conflict' using errcode = '40001';
  end if;
  if v_session.status not in ('scheduled','waiting_for_quorum','confirmed') then
    raise exception 'live_studio_edit_locked' using errcode = '23514';
  end if;
  if nullif(btrim(p_title), '') is null or char_length(btrim(p_title)) > 120 then
    raise exception 'live_title_invalid' using errcode = '22023';
  end if;
  if char_length(coalesce(p_description, '')) > 1000 then
    raise exception 'live_description_invalid' using errcode = '22023';
  end if;
  if p_duration_minutes is null or p_duration_minutes not between 30 and 180 then
    raise exception 'live_duration_invalid' using errcode = '22023';
  end if;
  if p_minimum_participants is null or p_minimum_participants not between 2 and 100 then
    raise exception 'live_quorum_invalid' using errcode = '22023';
  end if;

  v_schedule_changed := p_scheduled_start is distinct from v_session.scheduled_start
    or p_duration_minutes is distinct from v_session.scheduled_duration_minutes;
  if p_scheduled_start is null or (v_schedule_changed and (
    p_scheduled_start < timezone('utc', now()) + interval '10 minutes'
    or p_scheduled_start > timezone('utc', now()) + interval '90 days'
  )) then
    raise exception 'live_schedule_time_invalid' using errcode = '22023';
  end if;

  v_title_changed := btrim(p_title) is distinct from v_session.title;
  v_description_changed := nullif(btrim(p_description), '') is distinct from v_session.description;
  v_chemistry_changed := coalesce(p_chemistry_first_enabled, false)
    is distinct from v_session.chemistry_first_enabled;
  v_quorum_changed := v_session.context_type = 'circle'
    and p_minimum_participants is distinct from v_session.minimum_participants;

  if v_schedule_changed then
    perform set_config('app.live_reschedule', '1', true);
    update public.live_participants participant
    set rsvp_status = 'needs_reconfirmation'
    where participant.session_id = p_session_id
      and participant.role <> 'host'
      and participant.rsvp_status in ('going','waitlisted');
    perform set_config('app.live_reschedule', '0', true);
  end if;

  update public.live_sessions session
  set title = btrim(p_title),
      description = nullif(btrim(p_description), ''),
      scheduled_start = p_scheduled_start,
      scheduled_duration_minutes = p_duration_minutes,
      scheduled_end = p_scheduled_start + make_interval(mins => p_duration_minutes),
      chemistry_first_enabled = coalesce(p_chemistry_first_enabled, false),
      minimum_participants = case
        when session.context_type = 'circle' then p_minimum_participants
        else session.minimum_participants
      end,
      status = case
        when v_schedule_changed and session.status = 'confirmed'
          then 'waiting_for_quorum'
        else session.status
      end,
      quorum_reached_at = case
        when v_schedule_changed then null
        else session.quorum_reached_at
      end,
      schedule_revision = session.schedule_revision
        + case when v_schedule_changed then 1 else 0 end,
      rescheduled_at = case
        when v_schedule_changed then timezone('utc', now())
        else session.rescheduled_at
      end,
      version = session.version + 1
  where session.id = p_session_id
  returning * into v_session;

  if v_schedule_changed then
    with affected_users as (
      update public.live_session_pool_offers offer
      set state = 'withdrawn',
          responded_at = coalesce(offer.responded_at, timezone('utc', now()))
      where offer.state = 'pending'
        and (offer.source_session_id = p_session_id
          or offer.destination_session_id = p_session_id)
      returning offer.user_id
    )
    insert into public.live_pool_offer_updates(user_id, version, updated_at)
    select distinct affected.user_id, 1, timezone('utc', now())
    from affected_users affected
    on conflict(user_id) do update set
      version = public.live_pool_offer_updates.version + 1,
      updated_at = excluded.updated_at;

    update public.live_session_pools pool
    set state = 'cancelled',
        cancelled_at = coalesce(pool.cancelled_at, timezone('utc', now()))
    where pool.state in ('preview','offered','active')
      and exists (
        select 1 from public.live_session_pool_members member
        where member.pool_id = pool.id and member.session_id = p_session_id
      );
    v_pooling_reset := found;

    perform public.live_evaluate_quorum(p_session_id);
  end if;

  update public.gatherings gathering
  set title = v_session.title,
      description = v_session.description,
      starts_at = v_session.scheduled_start,
      ends_at = v_session.scheduled_end
  where gathering.live_session_id = p_session_id;

  insert into public.live_session_events(
    session_id,
    actor_user_id,
    event_type,
    metadata
  ) values (
    p_session_id,
    auth.uid(),
    case when v_schedule_changed then 'session_rescheduled' else 'studio_session_updated' end,
    jsonb_build_object(
      'title_changed', v_title_changed,
      'description_changed', v_description_changed,
      'schedule_changed', v_schedule_changed,
      'chemistry_first_changed', v_chemistry_changed,
      'quorum_changed', v_quorum_changed,
      'rsvp_reconfirmation_required', v_schedule_changed,
      'pooling_reset', v_pooling_reset,
      'schedule_revision', v_session.schedule_revision
    )
  );

  if v_schedule_changed then
    perform private.send_push_webhook(jsonb_build_object(
      'user_id', participant.user_id,
      'title', 'Live time changed',
      'body', 'Reconfirm your place for ' || v_session.title || '.',
      'data', jsonb_build_object(
        'type', 'live_rescheduled',
        'session_id', p_session_id,
        'scheduled_start', v_session.scheduled_start,
        'schedule_revision', v_session.schedule_revision
      )
    ))
    from public.live_participants participant
    left join public.notification_prefs preferences
      on preferences.user_id = participant.user_id
    where participant.session_id = p_session_id
      and participant.user_id <> auth.uid()
      and participant.rsvp_status = 'needs_reconfirmation'
      and coalesce(preferences.live_reminders, true);
  end if;

  select * into v_session from public.live_sessions where id = p_session_id;
  return v_session;
end;
$$;

create or replace function public.rpc_cancel_live_studio_session_v1(
  p_session_id uuid,
  p_expected_version bigint,
  p_reason text default 'plans_changed'
)
returns public.live_sessions
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  v_session public.live_sessions;
  v_previous_status text;
begin
  if auth.uid() is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  select * into v_session
  from public.live_sessions session
  where session.id = p_session_id
  for update;

  if v_session.id is null then
    raise exception 'live_session_not_found' using errcode = 'P0002';
  end if;
  if v_session.created_by_user_id <> auth.uid()
     and not public.is_admin_user(auth.uid()) then
    raise exception 'live_studio_manage_forbidden' using errcode = '42501';
  end if;
  if v_session.version <> p_expected_version then
    raise exception 'live_session_version_conflict' using errcode = '40001';
  end if;
  if v_session.status not in ('draft','scheduled','waiting_for_quorum','confirmed','backstage') then
    raise exception 'live_studio_cancel_locked' using errcode = '23514';
  end if;
  if coalesce(p_reason, 'plans_changed') not in (
    'plans_changed','host_unavailable','not_enough_people','safety','other'
  ) then
    raise exception 'live_cancellation_reason_invalid' using errcode = '22023';
  end if;

  v_previous_status := v_session.status;

  update public.live_sessions session
  set status = 'cancelled',
      cancelled_at = coalesce(session.cancelled_at, timezone('utc', now())),
      cancellation_reason = coalesce(p_reason, 'plans_changed')
  where session.id = p_session_id
  returning * into v_session;

  with affected_users as (
    update public.live_session_pool_offers offer
    set state = 'withdrawn',
        responded_at = coalesce(offer.responded_at, timezone('utc', now()))
    where offer.state = 'pending'
      and (offer.source_session_id = p_session_id
        or offer.destination_session_id = p_session_id)
    returning offer.user_id
  )
  insert into public.live_pool_offer_updates(user_id, version, updated_at)
  select distinct affected.user_id, 1, timezone('utc', now())
  from affected_users affected
  on conflict(user_id) do update set
    version = public.live_pool_offer_updates.version + 1,
    updated_at = excluded.updated_at;

  update public.live_session_pools pool
  set state = 'cancelled',
      cancelled_at = coalesce(pool.cancelled_at, timezone('utc', now()))
  where pool.state in ('preview','offered','active')
    and exists (
      select 1 from public.live_session_pool_members member
      where member.pool_id = pool.id and member.session_id = p_session_id
    );

  update public.gatherings gathering
  set status = 'cancelled',
      cancelled_at = coalesce(gathering.cancelled_at, timezone('utc', now()))
  where gathering.live_session_id = p_session_id;

  update public.circle_pulse_items pulse
  set status = 'archived'
  where pulse.gathering_id in (
    select gathering.id from public.gatherings gathering
    where gathering.live_session_id = p_session_id
  ) and pulse.status in ('draft','active');

  insert into public.live_session_events(
    session_id,
    actor_user_id,
    event_type,
    from_state,
    to_state,
    metadata
  ) values (
    p_session_id,
    auth.uid(),
    'studio_session_cancelled',
    v_previous_status,
    'cancelled',
    jsonb_build_object('reason', coalesce(p_reason, 'plans_changed'))
  );

  perform private.send_push_webhook(jsonb_build_object(
    'user_id', participant.user_id,
    'title', 'Live cancelled',
    'body', v_session.title || ' will no longer go Live.',
    'data', jsonb_build_object(
      'type', 'live_cancelled',
      'session_id', p_session_id,
      'reason', coalesce(p_reason, 'plans_changed')
    )
  ))
  from public.live_participants participant
  left join public.notification_prefs preferences
    on preferences.user_id = participant.user_id
  where participant.session_id = p_session_id
    and participant.user_id <> auth.uid()
    and participant.rsvp_status in (
      'invited', 'going', 'waitlisted', 'needs_reconfirmation'
    )
    and coalesce(preferences.live_reminders, true);

  return v_session;
end;
$$;

create or replace function public.rpc_archive_live_studio_session_v1(
  p_session_id uuid,
  p_expected_version bigint
)
returns public.live_sessions
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  v_session public.live_sessions;
begin
  if auth.uid() is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  select * into v_session
  from public.live_sessions session
  where session.id = p_session_id
  for update;

  if v_session.id is null then
    raise exception 'live_session_not_found' using errcode = 'P0002';
  end if;
  if v_session.created_by_user_id <> auth.uid()
     and not public.is_admin_user(auth.uid()) then
    raise exception 'live_studio_manage_forbidden' using errcode = '42501';
  end if;
  if v_session.version <> p_expected_version then
    raise exception 'live_session_version_conflict' using errcode = '40001';
  end if;
  if v_session.status not in ('ended','cancelled') then
    raise exception 'live_studio_archive_locked' using errcode = '23514';
  end if;

  update public.live_sessions session
  set archived_at = coalesce(session.archived_at, timezone('utc', now())),
      version = session.version + 1
  where session.id = p_session_id
  returning * into v_session;

  insert into public.live_session_events(session_id, actor_user_id, event_type)
  values(p_session_id, auth.uid(), 'studio_session_archived');

  return v_session;
end;
$$;

-- Version the expanded catalogue instead of replacing the 1.1.1 RPC. This is
-- intentionally expand-only: production 1.1.1 keeps its exact return shape
-- while the new Studio opts into lifecycle metadata through v2.
drop function if exists public.rpc_list_live_studio_sessions_v2(integer, timestamptz);
create function public.rpc_list_live_studio_sessions_v2(
  p_limit integer default 30,
  p_before timestamptz default null
)
returns table(
  id uuid,
  title text,
  description text,
  format text,
  status text,
  context_type text,
  context_id uuid,
  circle_id uuid,
  created_by_profile_id uuid,
  scheduled_start timestamptz,
  scheduled_end timestamptz,
  scheduled_duration_minutes integer,
  schedule_revision integer,
  rescheduled_at timestamptz,
  started_at timestamptz,
  ended_at timestamptz,
  cancelled_at timestamptz,
  cancellation_reason text,
  archived_at timestamptz,
  chemistry_first_enabled boolean,
  minimum_participants integer,
  version bigint,
  poster_path text,
  teaser_video_path text,
  teaser_duration_seconds integer,
  maximum_publishers integer,
  rsvp_status text,
  participant_state text,
  audience_count bigint,
  stage_count bigint,
  reservation_count bigint,
  total_attendee_count bigint,
  matches_made_count bigint
)
language sql
stable
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
  with visible as (
    select session.*
    from public.live_sessions session
    where auth.uid() is not null
      and (
        session.status in ('scheduled','waiting_for_quorum','confirmed','backstage','live','ending')
        or (session.status = 'ended' and session.created_by_user_id = auth.uid())
        or (
          session.status = 'cancelled'
          and (
            session.created_by_user_id = auth.uid()
            or exists (
              select 1 from public.live_participants participant
              where participant.session_id = session.id
                and participant.user_id = auth.uid()
            )
          )
        )
      )
      and not (
        session.created_by_user_id = auth.uid()
        and session.archived_at is not null
      )
      and (p_before is null or coalesce(session.scheduled_start,session.created_at) < p_before)
      and public.can_view_live_session(session.id,auth.uid())
    order by
      case
        when session.status in ('live','ending') then 0
        when session.status in ('ended','cancelled') then 2
        else 1
      end,
      case when session.status in ('live','ending')
        then coalesce(session.started_at,session.updated_at)
      end desc,
      case when session.status not in ('live','ending','ended','cancelled')
        then coalesce(session.scheduled_start,session.created_at)
      end asc,
      case when session.status in ('ended','cancelled')
        then coalesce(session.ended_at,session.cancelled_at,session.updated_at)
      end desc
    limit greatest(1,least(coalesce(p_limit,30),60))
  ), participant_metrics as (
    select
      participant.session_id,
      count(*) filter (where participant.state in ('audience','stage_requested')) as audience_count,
      count(*) filter (where participant.state = 'on_stage') as stage_count,
      count(*) filter (where participant.rsvp_status in ('going','waitlisted')) as reservation_count,
      count(distinct participant.user_id) filter (where participant.joined_at is not null) as total_attendee_count
    from public.live_participants participant
    join visible session on session.id = participant.session_id
    group by participant.session_id
  ), match_metrics as (
    select match_round.session_id,
      count(*) filter (where match_round.state = 'completed') as matches_made_count
    from public.live_match_rounds match_round
    join visible session on session.id = match_round.session_id
    group by match_round.session_id
  )
  select
    session.id,
    session.title,
    session.description,
    session.format,
    session.status,
    session.context_type,
    session.context_id,
    session.circle_id,
    session.created_by_profile_id,
    session.scheduled_start,
    session.scheduled_end,
    session.scheduled_duration_minutes,
    session.schedule_revision,
    session.rescheduled_at,
    session.started_at,
    session.ended_at,
    session.cancelled_at,
    session.cancellation_reason,
    session.archived_at,
    session.chemistry_first_enabled,
    session.minimum_participants,
    session.version,
    session.configuration #>> '{event_media,poster_path}',
    session.configuration #>> '{event_media,teaser_video_path}',
    nullif(session.configuration #>> '{event_media,teaser_duration_seconds}','')::integer,
    least(session.maximum_publishers,4),
    coalesce(me.rsvp_status,'none'),
    coalesce(me.state,'invited'),
    coalesce(metrics.audience_count,0),
    coalesce(metrics.stage_count,0),
    coalesce(metrics.reservation_count,0),
    coalesce(metrics.total_attendee_count,0),
    coalesce(matches.matches_made_count,0)
  from visible session
  left join public.live_participants me
    on me.session_id = session.id and me.user_id = auth.uid()
  left join participant_metrics metrics on metrics.session_id = session.id
  left join match_metrics matches on matches.session_id = session.id
  order by
    case
      when session.status in ('live','ending') then 0
      when session.status in ('ended','cancelled') then 2
      else 1
    end,
    case when session.status in ('live','ending')
      then coalesce(session.started_at,session.updated_at)
    end desc,
    case when session.status not in ('live','ending','ended','cancelled')
      then coalesce(session.scheduled_start,session.created_at)
    end asc,
    case when session.status in ('ended','cancelled')
      then coalesce(session.ended_at,session.cancelled_at,session.updated_at)
    end desc;
$$;

revoke all on function public.rpc_schedule_live_studio_session_v1(
  uuid,text,text,timestamptz,integer,text,boolean,uuid,integer
) from public, anon;
revoke all on function public.rpc_update_live_studio_session_v1(
  uuid,bigint,text,text,timestamptz,integer,boolean,integer
) from public, anon;
revoke all on function public.rpc_cancel_live_studio_session_v1(uuid,bigint,text)
  from public, anon;
revoke all on function public.rpc_archive_live_studio_session_v1(uuid,bigint)
  from public, anon;
revoke all on function public.rpc_list_live_studio_sessions_v2(integer,timestamptz)
  from public, anon;

grant execute on function public.rpc_schedule_live_studio_session_v1(
  uuid,text,text,timestamptz,integer,text,boolean,uuid,integer
) to authenticated;
grant execute on function public.rpc_update_live_studio_session_v1(
  uuid,bigint,text,text,timestamptz,integer,boolean,integer
) to authenticated;
grant execute on function public.rpc_cancel_live_studio_session_v1(uuid,bigint,text)
  to authenticated;
grant execute on function public.rpc_archive_live_studio_session_v1(uuid,bigint)
  to authenticated;
grant execute on function public.rpc_list_live_studio_sessions_v2(integer,timestamptz)
  to authenticated;

commit;
