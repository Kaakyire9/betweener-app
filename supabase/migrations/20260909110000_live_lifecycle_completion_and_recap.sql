-- Betweener Live lifecycle completion and privacy-safe recap.
-- Ending a room is atomic, ended rooms remain visible to attendees, and recap
-- metrics expose aggregates plus only the caller's own participation.

begin;

create or replace function public.rpc_end_live_session_v1(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  v_session public.live_sessions;
begin
  if auth.uid() is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;

  select * into v_session
  from public.live_sessions session
  where session.id = p_session_id
  for update;

  if v_session.id is null then
    raise exception 'live_session_not_found' using errcode = 'P0002';
  end if;
  if not public.has_live_capability(p_session_id, 'live.end_session') then
    raise exception 'live_session_transition_forbidden' using errcode = '42501';
  end if;
  if v_session.status = 'ended' then
    return jsonb_build_object(
      'sessionId', v_session.id,
      'status', v_session.status,
      'endedAt', v_session.ended_at,
      'version', v_session.version
    );
  end if;
  if v_session.status not in ('live', 'ending') then
    raise exception 'live_session_end_unavailable:%', v_session.status using errcode = '23514';
  end if;

  if v_session.status = 'live' then
    select * into v_session
    from public.rpc_transition_live_session(
      v_session.id,
      v_session.version,
      'ending'
    );
  end if;

  select * into v_session
  from public.rpc_transition_live_session(
    v_session.id,
    v_session.version,
    'ended'
  );

  return jsonb_build_object(
    'sessionId', v_session.id,
    'status', v_session.status,
    'endedAt', v_session.ended_at,
    'version', v_session.version
  );
end;
$$;

-- Earlier clients stopped after the first half of the end transition. Complete
-- those rooms once so they leave Live now and receive a stable recap timestamp.
update public.live_sessions
set
  status = 'ended',
  ended_at = coalesce(ended_at, updated_at, timezone('utc', now()))
where status = 'ending';

create or replace function public.rpc_get_live_session_recap_v1(p_session_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  v_session public.live_sessions;
  v_participant public.live_participants;
begin
  if auth.uid() is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;

  select * into v_session
  from public.live_sessions session
  where session.id = p_session_id;

  if v_session.id is null then
    raise exception 'live_session_not_found' using errcode = 'P0002';
  end if;
  if v_session.status <> 'ended' then
    raise exception 'live_session_recap_not_ready' using errcode = '55000';
  end if;
  if not public.can_view_live_session(p_session_id, auth.uid()) then
    raise exception 'live_session_recap_forbidden' using errcode = '42501';
  end if;

  select * into v_participant
  from public.live_participants participant
  where participant.session_id = p_session_id
    and participant.user_id = auth.uid();

  return jsonb_build_object(
    'session_id', v_session.id,
    'is_host', v_session.created_by_user_id = auth.uid(),
    'viewer_role', case
      when v_session.created_by_user_id = auth.uid() then 'host'
      else coalesce(v_participant.role, 'guest')
    end,
    'started_at', v_session.started_at,
    'ended_at', v_session.ended_at,
    'duration_seconds', greatest(
      0,
      floor(extract(epoch from (
        coalesce(v_session.ended_at, timezone('utc', now()))
        - coalesce(v_session.started_at, v_session.created_at)
      )))::bigint
    ),
    'total_attendees', (
      select count(distinct participant.user_id)
      from public.live_participants participant
      where participant.session_id = p_session_id
        and participant.joined_at is not null
    ),
    'room_pulse_notes', (
      select count(*) from public.live_comments comment
      where comment.session_id = p_session_id and comment.status = 'visible'
    ),
    'reactions', (
      select count(*) from public.live_reactions reaction
      where reaction.session_id = p_session_id
    ),
    'audience_polls', (
      select count(*) from public.live_audience_polls poll
      where poll.session_id = p_session_id and poll.state <> 'cancelled'
    ),
    'poll_responses', (
      select count(*)
      from public.live_audience_poll_votes vote
      join public.live_audience_polls poll on poll.id = vote.poll_id
      where poll.session_id = p_session_id
    ),
    'hosted_introductions', (
      select count(*) from public.live_match_rounds match_round
      where match_round.session_id = p_session_id and match_round.state = 'completed'
    ),
    'private_sparks', (
      select count(*) from public.live_private_sparks private_spark
      where private_spark.session_id = p_session_id and private_spark.state = 'ended'
    ),
    'quick_connect_rounds', (
      select count(*) from public.live_quick_connect_pairings pairing
      where pairing.session_id = p_session_id and pairing.state = 'completed'
    ),
    'my_attended', v_participant.joined_at is not null,
    'my_room_pulse_notes', (
      select count(*) from public.live_comments comment
      where comment.session_id = p_session_id
        and comment.user_id = auth.uid()
        and comment.status = 'visible'
    ),
    'my_reactions', (
      select count(*) from public.live_reactions reaction
      where reaction.session_id = p_session_id and reaction.user_id = auth.uid()
    ),
    'my_poll_responses', (
      select count(*)
      from public.live_audience_poll_votes vote
      join public.live_audience_polls poll on poll.id = vote.poll_id
      where poll.session_id = p_session_id and vote.user_id = auth.uid()
    ),
    'my_hosted_introductions', (
      select count(*) from public.live_match_rounds match_round
      where match_round.session_id = p_session_id
        and match_round.state = 'completed'
        and auth.uid() in (match_round.participant_a_user_id, match_round.participant_b_user_id)
    ),
    'my_private_sparks', (
      select count(*) from public.live_private_sparks private_spark
      where private_spark.session_id = p_session_id
        and private_spark.state = 'ended'
        and auth.uid() in (private_spark.participant_a_user_id, private_spark.participant_b_user_id)
    ),
    'my_quick_connect_rounds', (
      select count(*) from public.live_quick_connect_pairings pairing
      where pairing.session_id = p_session_id
        and pairing.state = 'completed'
        and auth.uid() in (pairing.participant_a_user_id, pairing.participant_b_user_id)
    ),
    'server_now', timezone('utc', now())
  );
end;
$$;

-- Keep the existing v2 shape stable while allowing every non-banned attendee
-- to find an ended room in Past Live and open their own aggregate recap.
create or replace function public.rpc_list_live_studio_sessions_v2(
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
        or (
          session.status in ('ended','cancelled')
          and (
            session.created_by_user_id = auth.uid()
            or exists (
              select 1 from public.live_participants participant
              where participant.session_id = session.id
                and participant.user_id = auth.uid()
                and participant.state <> 'banned'
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

revoke all on function public.rpc_end_live_session_v1(uuid),
  public.rpc_get_live_session_recap_v1(uuid)
from public, anon;
grant execute on function public.rpc_end_live_session_v1(uuid),
  public.rpc_get_live_session_recap_v1(uuid)
to authenticated, service_role;

commit;
