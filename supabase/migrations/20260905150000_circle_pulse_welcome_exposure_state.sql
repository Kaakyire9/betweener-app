-- Circle Pulse Welcome Constellation exposure state.
-- Circle membership remains the source of truth; this table only records how
-- each viewer has encountered currently eligible Welcome Seat members.

create table if not exists public.circle_pulse_welcome_views (
  id uuid primary key default gen_random_uuid(),
  circle_id uuid not null references public.circles(id) on delete cascade,
  viewer_profile_id uuid not null references public.profiles(id) on delete cascade,
  welcome_profile_id uuid not null references public.profiles(id) on delete cascade,
  viewer_user_id uuid not null references auth.users(id) on delete cascade,
  first_seen_at timestamptz not null default timezone('utc', now()),
  last_seen_at timestamptz not null default timezone('utc', now()),
  gallery_opened_at timestamptz,
  profile_opened_at timestamptz,
  welcome_started_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint circle_pulse_welcome_views_unique_viewer_member
    unique (circle_id, viewer_profile_id, welcome_profile_id),
  constraint circle_pulse_welcome_views_seen_order_valid
    check (last_seen_at >= first_seen_at)
);

create index if not exists circle_pulse_welcome_views_viewer_idx
  on public.circle_pulse_welcome_views (viewer_profile_id, circle_id, last_seen_at desc);

create index if not exists circle_pulse_welcome_views_member_idx
  on public.circle_pulse_welcome_views (circle_id, welcome_profile_id, last_seen_at desc);

alter table public.circle_pulse_welcome_views enable row level security;

revoke all on table public.circle_pulse_welcome_views from public, anon, authenticated;
grant all on table public.circle_pulse_welcome_views to service_role;

create or replace function public.rpc_get_circle_pulse_welcome_view_state(
  p_circle_id uuid,
  p_viewer_profile_id uuid
)
returns table (
  welcome_profile_id uuid,
  first_seen_at timestamptz,
  last_seen_at timestamptz,
  gallery_opened_at timestamptz,
  profile_opened_at timestamptz,
  welcome_started_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, pg_catalog
as $$
begin
  if auth.uid() is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.profiles profile
    where profile.id = p_viewer_profile_id
      and profile.user_id = auth.uid()
      and profile.deleted_at is null
  ) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  if not public.can_manage_circle_pulse(p_circle_id, auth.uid())
    and not public.is_circle_member(p_circle_id, auth.uid())
    and not public.is_circle_owner(p_circle_id, auth.uid()) then
    raise exception 'circle_membership_required' using errcode = '42501';
  end if;

  return query
  select
    view_state.welcome_profile_id,
    view_state.first_seen_at,
    view_state.last_seen_at,
    view_state.gallery_opened_at,
    view_state.profile_opened_at,
    view_state.welcome_started_at
  from public.circle_pulse_welcome_views view_state
  where view_state.circle_id = p_circle_id
    and view_state.viewer_profile_id = p_viewer_profile_id
  order by view_state.last_seen_at desc, view_state.welcome_profile_id;
end;
$$;

create or replace function public.rpc_record_circle_pulse_welcome_event(
  p_circle_id uuid,
  p_viewer_profile_id uuid,
  p_welcome_profile_ids uuid[],
  p_event_type text
)
returns integer
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_now timestamptz := timezone('utc', now());
  v_recorded integer := 0;
begin
  if auth.uid() is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;

  if p_circle_id is null
    or p_viewer_profile_id is null
    or coalesce(cardinality(p_welcome_profile_ids), 0) = 0
    or cardinality(p_welcome_profile_ids) > 50 then
    raise exception 'invalid_welcome_event';
  end if;

  if p_event_type not in ('impression', 'gallery_opened', 'profile_opened', 'welcome_started') then
    raise exception 'invalid_welcome_event_type';
  end if;

  if not exists (
    select 1
    from public.profiles profile
    where profile.id = p_viewer_profile_id
      and profile.user_id = auth.uid()
      and profile.deleted_at is null
  ) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  if not public.can_manage_circle_pulse(p_circle_id, auth.uid())
    and not public.is_circle_member(p_circle_id, auth.uid())
    and not public.is_circle_owner(p_circle_id, auth.uid()) then
    raise exception 'circle_membership_required' using errcode = '42501';
  end if;

  if exists (
    select 1
    from unnest(p_welcome_profile_ids) requested(profile_id)
    where not exists (
      select 1
      from public.circle_pulse_welcome_members welcome_member
      join public.circle_members member
        on member.id = welcome_member.membership_id
       and member.circle_id = welcome_member.circle_id
       and member.profile_id = welcome_member.profile_id
      join public.profiles profile
        on profile.id = welcome_member.profile_id
      where welcome_member.circle_id = p_circle_id
        and welcome_member.profile_id = requested.profile_id
        and welcome_member.status = 'active'
        and welcome_member.expires_at > v_now
        and member.status = 'active'
        and member.is_visible is not false
        and profile.deleted_at is null
    )
  ) then
    raise exception 'welcome_member_not_available';
  end if;

  insert into public.circle_pulse_welcome_views (
    circle_id,
    viewer_profile_id,
    welcome_profile_id,
    viewer_user_id,
    first_seen_at,
    last_seen_at,
    gallery_opened_at,
    profile_opened_at,
    welcome_started_at,
    created_at,
    updated_at
  )
  select
    p_circle_id,
    p_viewer_profile_id,
    requested.profile_id,
    auth.uid(),
    v_now,
    v_now,
    case when p_event_type = 'gallery_opened' then v_now else null end,
    case when p_event_type = 'profile_opened' then v_now else null end,
    case when p_event_type = 'welcome_started' then v_now else null end,
    v_now,
    v_now
  from (
    select distinct profile_id
    from unnest(p_welcome_profile_ids) requested_profile(profile_id)
  ) requested
  on conflict (circle_id, viewer_profile_id, welcome_profile_id)
  do update
    set viewer_user_id = excluded.viewer_user_id,
        last_seen_at = excluded.last_seen_at,
        gallery_opened_at = case
          when p_event_type = 'gallery_opened'
            then coalesce(public.circle_pulse_welcome_views.gallery_opened_at, excluded.gallery_opened_at)
          else public.circle_pulse_welcome_views.gallery_opened_at
        end,
        profile_opened_at = case
          when p_event_type = 'profile_opened'
            then coalesce(public.circle_pulse_welcome_views.profile_opened_at, excluded.profile_opened_at)
          else public.circle_pulse_welcome_views.profile_opened_at
        end,
        welcome_started_at = case
          when p_event_type = 'welcome_started'
            then coalesce(public.circle_pulse_welcome_views.welcome_started_at, excluded.welcome_started_at)
          else public.circle_pulse_welcome_views.welcome_started_at
        end,
        updated_at = excluded.updated_at;

  get diagnostics v_recorded = row_count;
  return v_recorded;
end;
$$;

revoke all on function public.rpc_get_circle_pulse_welcome_view_state(uuid, uuid) from public, anon;
grant execute on function public.rpc_get_circle_pulse_welcome_view_state(uuid, uuid) to authenticated, service_role;

revoke all on function public.rpc_record_circle_pulse_welcome_event(uuid, uuid, uuid[], text) from public, anon;
grant execute on function public.rpc_record_circle_pulse_welcome_event(uuid, uuid, uuid[], text) to authenticated, service_role;

comment on table public.circle_pulse_welcome_views is
  'Viewer exposure state for active Circle Pulse welcome members; Circle membership remains authoritative.';
