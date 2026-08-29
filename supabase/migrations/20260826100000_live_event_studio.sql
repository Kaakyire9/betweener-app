-- Betweener Live event studio: authoritative scheduling, promotional media,
-- reservations and durable post-event outcome summaries.

begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'live-event-media',
  'live-event-media',
  true,
  26214400,
  array['image/jpeg','image/png','image/webp','video/mp4','video/quicktime']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Live event media is publicly readable" on storage.objects;
create policy "Live event media is publicly readable"
on storage.objects for select
to public
using (bucket_id = 'live-event-media');

drop policy if exists "Creators upload owned live event media" on storage.objects;
create policy "Creators upload owned live event media"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'live-event-media'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Creators update owned live event media" on storage.objects;
create policy "Creators update owned live event media"
on storage.objects for update
to authenticated
using (
  bucket_id = 'live-event-media'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'live-event-media'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Creators delete owned live event media" on storage.objects;
create policy "Creators delete owned live event media"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'live-event-media'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create or replace function public.enforce_live_session_start_time()
returns trigger
language plpgsql
set search_path = public, pg_catalog
as $$
begin
  if new.status = 'live'
     and old.status is distinct from 'live'
     and new.scheduled_start is not null
     and timezone('utc', now()) < new.scheduled_start then
    raise exception 'live_session_not_due' using errcode = '22023';
  end if;
  return new;
end;
$$;

drop trigger if exists live_sessions_start_time_guard on public.live_sessions;
create trigger live_sessions_start_time_guard
before update of status on public.live_sessions
for each row execute function public.enforce_live_session_start_time();

create or replace function public.rpc_update_live_event_media(
  p_session_id uuid,
  p_poster_path text default null,
  p_teaser_video_path text default null,
  p_teaser_duration_seconds integer default null
)
returns public.live_sessions
language plpgsql
security definer
set search_path = public, storage, pg_catalog
set row_security = off
as $$
declare
  v_session public.live_sessions;
  v_prefix text;
  v_poster_mime_type text;
  v_teaser_mime_type text;
begin
  if auth.uid() is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  select * into v_session
  from public.live_sessions s
  where s.id = p_session_id
  for update;

  if v_session.id is null then
    raise exception 'live_session_not_found' using errcode = 'P0002';
  end if;
  if v_session.created_by_user_id <> auth.uid() then
    raise exception 'live_event_media_forbidden' using errcode = '42501';
  end if;
  if v_session.status not in ('draft','scheduled','waiting_for_quorum','confirmed','backstage') then
    raise exception 'live_event_media_locked' using errcode = '23514';
  end if;
  if p_teaser_duration_seconds is not null
     and (p_teaser_duration_seconds < 1 or p_teaser_duration_seconds > 20) then
    raise exception 'live_event_teaser_duration_invalid' using errcode = '22023';
  end if;
  if p_teaser_video_path is not null and p_teaser_duration_seconds is null then
    raise exception 'live_event_teaser_duration_required' using errcode = '22023';
  end if;
  if p_teaser_video_path is null and p_teaser_duration_seconds is not null then
    raise exception 'live_event_teaser_path_required' using errcode = '22023';
  end if;

  v_prefix := auth.uid()::text || '/' || p_session_id::text || '/';
  if p_poster_path is not null and p_poster_path not like v_prefix || '%' then
    raise exception 'live_event_poster_path_invalid' using errcode = '22023';
  end if;
  if p_teaser_video_path is not null and p_teaser_video_path not like v_prefix || '%' then
    raise exception 'live_event_teaser_path_invalid' using errcode = '22023';
  end if;
  if p_poster_path is not null then
    select lower(coalesce(o.metadata ->> 'mimetype', o.metadata ->> 'mime_type', ''))
    into v_poster_mime_type
    from storage.objects o
    where o.bucket_id = 'live-event-media' and o.name = p_poster_path;

    if not found then
      raise exception 'live_event_poster_missing' using errcode = '22023';
    end if;
    if v_poster_mime_type not in ('image/jpeg', 'image/png', 'image/webp') then
      raise exception 'live_event_poster_type_invalid' using errcode = '22023';
    end if;
  end if;
  if p_teaser_video_path is not null then
    select lower(coalesce(o.metadata ->> 'mimetype', o.metadata ->> 'mime_type', ''))
    into v_teaser_mime_type
    from storage.objects o
    where o.bucket_id = 'live-event-media' and o.name = p_teaser_video_path;

    if not found then
      raise exception 'live_event_teaser_missing' using errcode = '22023';
    end if;
    if v_teaser_mime_type not in ('video/mp4', 'video/quicktime') then
      raise exception 'live_event_teaser_type_invalid' using errcode = '22023';
    end if;
  end if;

  update public.live_sessions s
  set configuration = jsonb_set(
    coalesce(s.configuration, '{}'::jsonb),
    '{event_media}',
    jsonb_strip_nulls(jsonb_build_object(
      'poster_path', nullif(btrim(p_poster_path), ''),
      'teaser_video_path', nullif(btrim(p_teaser_video_path), ''),
      'teaser_duration_seconds', p_teaser_duration_seconds
    )),
    true
  )
  where s.id = p_session_id
  returning * into v_session;

  insert into public.live_session_events(session_id, actor_user_id, event_type, metadata)
  values (
    p_session_id,
    auth.uid(),
    'event_media_updated',
    jsonb_build_object(
      'has_poster', p_poster_path is not null,
      'has_teaser', p_teaser_video_path is not null
    )
  );
  return v_session;
end;
$$;

revoke all on function public.rpc_update_live_event_media(uuid,text,text,integer) from public, anon;
grant execute on function public.rpc_update_live_event_media(uuid,text,text,integer) to authenticated;

create or replace function public.rpc_list_live_studio_sessions(
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
  started_at timestamptz,
  ended_at timestamptz,
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
    select s.*
    from public.live_sessions s
    where auth.uid() is not null
      and (
        s.status in ('scheduled','waiting_for_quorum','confirmed','backstage','live','ending')
        or (s.status in ('ended','cancelled') and s.created_by_user_id = auth.uid())
      )
      and (p_before is null or coalesce(s.scheduled_start,s.created_at) < p_before)
      and public.can_view_live_session(s.id,auth.uid())
    order by
      case
        when s.status in ('live','ending') then 0
        when s.status in ('ended','cancelled') then 2
        else 1
      end,
      case when s.status in ('live','ending')
        then coalesce(s.started_at,s.updated_at)
      end desc,
      case when s.status not in ('live','ending','ended','cancelled')
        then coalesce(s.scheduled_start,s.created_at)
      end asc,
      case when s.status in ('ended','cancelled')
        then coalesce(s.ended_at,s.cancelled_at,s.updated_at)
      end desc
    limit greatest(1,least(coalesce(p_limit,30),60))
  ), participant_metrics as (
    select
      p.session_id,
      count(*) filter (where p.state in ('audience','stage_requested')) as audience_count,
      count(*) filter (where p.state = 'on_stage') as stage_count,
      count(*) filter (where p.rsvp_status in ('going','waitlisted')) as reservation_count,
      count(distinct p.user_id) filter (where p.joined_at is not null) as total_attendee_count
    from public.live_participants p
    join visible v on v.id = p.session_id
    group by p.session_id
  ), match_metrics as (
    select r.session_id, count(*) filter (where r.state = 'completed') as matches_made_count
    from public.live_match_rounds r
    join visible v on v.id = r.session_id
    group by r.session_id
  )
  select
    s.id,s.title,s.description,s.format,s.status,s.context_type,s.context_id,s.circle_id,
    s.created_by_profile_id,s.scheduled_start,s.scheduled_end,s.started_at,s.ended_at,
    s.configuration #>> '{event_media,poster_path}',
    s.configuration #>> '{event_media,teaser_video_path}',
    nullif(s.configuration #>> '{event_media,teaser_duration_seconds}','')::integer,
    least(s.maximum_publishers,4),
    coalesce(me.rsvp_status,'none'),coalesce(me.state,'invited'),
    coalesce(pm.audience_count,0),coalesce(pm.stage_count,0),
    coalesce(pm.reservation_count,0),coalesce(pm.total_attendee_count,0),
    coalesce(mm.matches_made_count,0)
  from visible s
  left join public.live_participants me on me.session_id=s.id and me.user_id=auth.uid()
  left join participant_metrics pm on pm.session_id=s.id
  left join match_metrics mm on mm.session_id=s.id
  order by
    case
      when s.status in ('live','ending') then 0
      when s.status in ('ended','cancelled') then 2
      else 1
    end,
    case when s.status in ('live','ending')
      then coalesce(s.started_at,s.updated_at)
    end desc,
    case when s.status not in ('live','ending','ended','cancelled')
      then coalesce(s.scheduled_start,s.created_at)
    end asc,
    case when s.status in ('ended','cancelled')
      then coalesce(s.ended_at,s.cancelled_at,s.updated_at)
    end desc;
$$;

revoke all on function public.rpc_list_live_studio_sessions(integer,timestamptz) from public, anon;
grant execute on function public.rpc_list_live_studio_sessions(integer,timestamptz) to authenticated;

commit;
