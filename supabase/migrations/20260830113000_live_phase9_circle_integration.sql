-- Betweener Live Phase 9: Circle entry, Gathering references, recaps, and
-- consent-aware Love Seat provenance. Live remains the lifecycle authority.

begin;

alter table public.gatherings
  add column if not exists live_session_id uuid references public.live_sessions(id) on delete set null;

create unique index if not exists gatherings_live_session_unique_idx
  on public.gatherings(live_session_id)
  where live_session_id is not null;

alter table public.circle_love_seats
  add column if not exists origin_live_session_id uuid references public.live_sessions(id) on delete set null;

create index if not exists circle_love_seats_origin_live_idx
  on public.circle_love_seats(origin_live_session_id)
  where origin_live_session_id is not null;

-- Content-free invalidation. Circle clients re-read the audience-scoped RPC.
create table public.live_circle_updates (
  circle_id uuid primary key references public.circles(id) on delete cascade,
  version bigint not null default 1,
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.live_circle_updates enable row level security;
create policy live_circle_updates_select_members
on public.live_circle_updates for select to authenticated
using (
  public.is_circle_member(circle_id, auth.uid())
  or public.is_circle_owner(circle_id, auth.uid())
);

revoke all on public.live_circle_updates from public, anon, authenticated;
grant select on public.live_circle_updates to authenticated;

create or replace function public.touch_live_circle_update(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  v_circle_id uuid;
begin
  select s.circle_id into v_circle_id
  from public.live_sessions s
  where s.id = p_session_id and s.context_type = 'circle';

  if v_circle_id is null then return; end if;
  insert into public.live_circle_updates(circle_id)
  values(v_circle_id)
  on conflict(circle_id) do update set
    version = public.live_circle_updates.version + 1,
    updated_at = timezone('utc', now());
end;
$$;

create or replace function public.touch_live_circle_update_from_session()
returns trigger language plpgsql set search_path = public, pg_catalog as $$
begin
  perform public.touch_live_circle_update(coalesce(new.id, old.id));
  return null;
end;
$$;

create or replace function public.touch_live_circle_update_from_child()
returns trigger language plpgsql set search_path = public, pg_catalog as $$
begin
  perform public.touch_live_circle_update(coalesce(new.session_id, old.session_id));
  return null;
end;
$$;

create trigger live_sessions_circle_update
after insert or update of status, scheduled_start, title, description, quorum_reached_at, ended_at
on public.live_sessions for each row execute function public.touch_live_circle_update_from_session();

create trigger live_participants_circle_update
after insert or delete or update of rsvp_status, state, open_to_introductions
on public.live_participants for each row execute function public.touch_live_circle_update_from_child();

create trigger live_match_rounds_circle_update
after insert or delete or update of state
on public.live_match_rounds for each row execute function public.touch_live_circle_update_from_child();

create or replace function public.rpc_can_schedule_circle_live(p_circle_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
  select auth.uid() is not null
    and public.can_create_live_context('circle', p_circle_id, null, auth.uid())
    and exists (
      select 1 from public.profiles p
      where p.user_id = auth.uid()
        and p.deleted_at is null
        and p.account_state = 'active'
        and p.profile_completed
        and (coalesce(p.verification_level, 0) >= 1 or public.is_admin_user(auth.uid()))
    )
$$;

create or replace function public.rpc_schedule_circle_live_session(
  p_circle_id uuid,
  p_title text,
  p_description text,
  p_scheduled_start timestamptz,
  p_chemistry_first_enabled boolean default false,
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
  v_gathering public.gatherings;
begin
  if not public.rpc_can_schedule_circle_live(p_circle_id) then
    raise exception 'circle_live_schedule_forbidden' using errcode = '42501';
  end if;
  if p_scheduled_start < timezone('utc', now()) + interval '10 minutes'
     or p_scheduled_start > timezone('utc', now()) + interval '90 days' then
    raise exception 'live_schedule_time_invalid' using errcode = '22023';
  end if;
  if p_minimum_participants not between 2 and 100 then
    raise exception 'live_quorum_invalid' using errcode = '22023';
  end if;

  v_session := public.rpc_create_live_session(
    nullif(btrim(p_title), ''), 'circle_live', 'circle', p_circle_id,
    p_circle_id, null, p_scheduled_start
  );

  update public.live_sessions
  set description = nullif(btrim(p_description), ''),
      minimum_participants = p_minimum_participants,
      maximum_publishers = 4,
      chemistry_first_enabled = coalesce(p_chemistry_first_enabled, false),
      recording_enabled = false,
      configuration = configuration || jsonb_build_object(
        'circle_integration', 'phase9',
        'circle_lifecycle_authority', 'live_sessions'
      )
  where id = v_session.id
  returning * into v_session;

  insert into public.gatherings(
    circle_id, live_session_id, title, description, starts_at, ends_at,
    gathering_type, status, platform, address_visibility,
    created_by_profile_id, created_by_user_id, approved_at, presentation_mode
  ) values (
    p_circle_id, v_session.id, v_session.title, v_session.description,
    p_scheduled_start, p_scheduled_start + interval '90 minutes',
    'livestream', 'approved', 'Betweener Live', 'hidden',
    v_session.created_by_profile_id, auth.uid(), timezone('utc', now()), 'general'
  ) returning * into v_gathering;

  insert into public.circle_pulse_items(
    circle_id, item_type, gathering_id, status, priority, starts_at,
    created_by_profile_id, created_by_user_id
  ) values (
    p_circle_id, 'gathering', v_gathering.id, 'active', 25, timezone('utc', now()),
    v_session.created_by_profile_id, auth.uid()
  );

  perform public.touch_live_circle_update(v_session.id);
  return v_session;
end;
$$;

create or replace function public.rpc_get_circle_live_snapshot(p_circle_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  v_sessions jsonb;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  if not public.is_circle_member(p_circle_id, auth.uid())
     and not public.is_circle_owner(p_circle_id, auth.uid()) then
    raise exception 'circle_membership_required' using errcode = '42501';
  end if;

  with bounded_sessions as materialized (
    select s.*
    from public.live_sessions s
    where s.context_type = 'circle'
      and s.circle_id = p_circle_id
      and s.status <> 'cancelled'
    order by
      case when s.status in ('live','backstage','ending') then 0
           when s.status in ('scheduled','waiting_for_quorum','confirmed') then 1 else 2 end,
      case when s.status in ('scheduled','waiting_for_quorum','confirmed') then s.scheduled_start end asc nulls last,
      case when s.status not in ('scheduled','waiting_for_quorum','confirmed') then coalesce(s.ended_at, s.created_at) end desc nulls last
    limit 30
  ), session_snapshots as materialized (
    select s.*, public.live_quorum_snapshot_internal(s.id) as quorum
    from bounded_sessions s
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'session_id', s.id,
    'gathering_id', g.id,
    'title', s.title,
    'description', s.description,
    'status', s.status,
    'scheduled_start', s.scheduled_start,
    'ended_at', s.ended_at,
    'poster_path', s.configuration #>> '{event_media,poster_path}',
    'attendance_count', coalesce((s.quorum ->> 'attendance_count')::integer, 0),
    'minimum_attendance', s.minimum_participants,
    'quorum_status', s.quorum ->> 'status',
    'matches_made_count', (
      select count(*)::integer from public.live_match_rounds mr
      where mr.session_id = s.id and mr.state in ('both_accepted', 'public_introduction', 'completed')
    ),
    'total_attendee_count', (
      select count(distinct lp.user_id)::integer from public.live_participants lp
      where lp.session_id = s.id and (lp.joined_at is not null or lp.state in ('backstage','audience','stage_requested','on_stage','private_spark'))
    ),
    'viewer_rsvp_status', coalesce((
      select lp.rsvp_status from public.live_participants lp
      where lp.session_id = s.id and lp.user_id = auth.uid()
    ), 'none'),
    'is_host', s.created_by_user_id = auth.uid()
  ) order by
    case when s.status in ('live','backstage','ending') then 0
         when s.status in ('scheduled','waiting_for_quorum','confirmed') then 1 else 2 end,
    case when s.status in ('scheduled','waiting_for_quorum','confirmed') then s.scheduled_start end asc nulls last,
    case when s.status not in ('scheduled','waiting_for_quorum','confirmed') then coalesce(s.ended_at, s.created_at) end desc nulls last), '[]'::jsonb)
  into v_sessions
  from session_snapshots s
  left join public.gatherings g on g.live_session_id = s.id
  ;

  return jsonb_build_object(
    'circle_id', p_circle_id,
    'can_schedule', public.rpc_can_schedule_circle_live(p_circle_id),
    'sessions', v_sessions,
    'server_now', timezone('utc', now())
  );
end;
$$;

create or replace function public.rpc_nominate_circle_love_seat_from_live(
  p_circle_id uuid,
  p_actor_profile_id uuid,
  p_featured_profile_id uuid,
  p_live_session_id uuid,
  p_quote text default null,
  p_reason text default null
)
returns public.circle_love_seats
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  v_love_seat public.circle_love_seats;
begin
  if not exists (
    select 1
    from public.live_sessions s
    join public.live_participants lp on lp.session_id = s.id
    where s.id = p_live_session_id
      and s.context_type = 'circle' and s.circle_id = p_circle_id
      and s.status in ('live', 'ending', 'ended')
      and lp.profile_id = p_featured_profile_id
      and lp.rsvp_status = 'going'
      and lp.open_to_introductions
      and lp.role <> 'host'
      and lp.state not in ('removed', 'banned')
  ) then
    raise exception 'live_love_seat_consent_required' using errcode = '42501';
  end if;

  v_love_seat := public.rpc_nominate_circle_love_seat(
    p_circle_id, p_actor_profile_id, p_featured_profile_id, p_quote, p_reason
  );
  update public.circle_love_seats
  set origin_live_session_id = p_live_session_id
  where id = v_love_seat.id
  returning * into v_love_seat;
  return v_love_seat;
end;
$$;

revoke all on function public.touch_live_circle_update(uuid) from public, anon, authenticated;
revoke all on function public.rpc_can_schedule_circle_live(uuid) from public, anon;
revoke all on function public.rpc_schedule_circle_live_session(uuid,text,text,timestamptz,boolean,integer) from public, anon;
revoke all on function public.rpc_get_circle_live_snapshot(uuid) from public, anon;
revoke all on function public.rpc_nominate_circle_love_seat_from_live(uuid,uuid,uuid,uuid,text,text) from public, anon;

grant execute on function public.rpc_can_schedule_circle_live(uuid) to authenticated;
grant execute on function public.rpc_schedule_circle_live_session(uuid,text,text,timestamptz,boolean,integer) to authenticated;
grant execute on function public.rpc_get_circle_live_snapshot(uuid) to authenticated;
grant execute on function public.rpc_nominate_circle_love_seat_from_live(uuid,uuid,uuid,uuid,text,text) to authenticated;

do $$
begin
  alter publication supabase_realtime add table public.live_circle_updates;
exception when duplicate_object then null;
end $$;

commit;
