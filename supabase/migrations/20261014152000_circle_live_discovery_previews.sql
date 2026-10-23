-- Public discovery exposes only a bounded Circle Live preview. Full room state,
-- RSVP and participation continue to use membership-protected Live RPCs.

create or replace function public.rpc_list_discoverable_circle_live_previews(p_limit integer default 24)
returns table(
  session_id uuid,
  circle_id uuid,
  circle_name text,
  circle_slug text,
  live_title text,
  live_description text,
  live_status text,
  scheduled_start timestamptz,
  poster_path text,
  reach_scope text,
  access_policy text,
  country_code text,
  country_name text,
  region text,
  city text,
  member_count integer,
  viewer_membership_status text
)
language plpgsql
stable
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
begin
  if auth.uid() is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;

  return query
  select
    session.id,
    circle.id,
    circle.name,
    circle.slug,
    session.title,
    session.description,
    session.status,
    session.scheduled_start,
    session.configuration #>> '{event_media,poster_path}',
    circle.reach_scope,
    circle.access_policy,
    circle.country_code,
    circle.country_name,
    circle.region,
    circle.city,
    circle.member_count,
    membership.status
  from public.live_sessions session
  join public.circles circle on circle.id = session.circle_id
  left join public.circle_members membership
    on membership.circle_id = circle.id
   and membership.user_id = auth.uid()
   and membership.left_at is null
  where session.context_type = 'circle'
    and session.status in ('scheduled', 'waiting_for_quorum', 'confirmed', 'backstage', 'live')
    and circle.status = 'approved'
    and circle.archived_at is null
    and circle.visibility = 'public'
    and circle.access_policy <> 'invite_only'
    and circle.live_discovery_policy = 'discoverable_join_required'
  order by
    case when session.status in ('live', 'backstage') then 0 else 1 end,
    session.scheduled_start asc nulls last,
    session.created_at desc
  limit least(greatest(coalesce(p_limit, 24), 1), 48);
end;
$$;

revoke all on function public.rpc_list_discoverable_circle_live_previews(integer)
from public, anon;
grant execute on function public.rpc_list_discoverable_circle_live_previews(integer)
to authenticated, service_role;

comment on function public.rpc_list_discoverable_circle_live_previews(integer) is
  'Privacy-safe Circle Live acquisition previews. Membership remains mandatory for full session access and participation.';
