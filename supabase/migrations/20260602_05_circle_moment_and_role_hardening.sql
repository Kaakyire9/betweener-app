create or replace function public.can_view_moment(p_moment_id uuid)
returns boolean
language plpgsql
security definer
stable
set search_path = public, pg_catalog
as $$
declare
  v_moment public.moments%rowtype;
  v_viewer_id uuid := auth.uid();
begin
  if v_viewer_id is null or p_moment_id is null then
    return false;
  end if;

  select *
    into v_moment
  from public.moments m
  where m.id = p_moment_id
    and m.is_deleted = false
    and m.expires_at > timezone('utc'::text, now())
  limit 1;

  if v_moment.id is null then
    return false;
  end if;

  if v_moment.type in ('photo', 'video')
    and nullif(btrim(coalesce(v_moment.media_url, '')), '') is null then
    return false;
  end if;

  if v_moment.user_id = v_viewer_id or v_moment.visibility = 'public' then
    return true;
  end if;

  if v_moment.visibility = 'matches'
    and exists (
      select 1
      from public.circles c
      left join public.profiles viewer_owner on viewer_owner.id = c.created_by_profile_id
      left join public.circle_members viewer_member
        on viewer_member.circle_id = c.id
       and viewer_member.status = 'active'
       and viewer_member.is_visible is not false
      left join public.profiles viewer_profile on viewer_profile.id = viewer_member.profile_id
      left join public.profiles moment_owner on moment_owner.user_id = v_moment.user_id
      left join public.circle_members moment_member
        on moment_member.circle_id = c.id
       and moment_member.profile_id = moment_owner.id
       and moment_member.status = 'active'
       and moment_member.is_visible is not false
      where (
          viewer_owner.user_id = v_viewer_id
          or viewer_profile.user_id = v_viewer_id
        )
        and (
          viewer_owner.user_id = v_moment.user_id
          or moment_member.id is not null
        )
    ) then
    return true;
  end if;

  if v_moment.visibility = 'matches' then
    return public.is_match(v_viewer_id, v_moment.user_id);
  end if;

  return false;
end;
$$;

create or replace function public.rpc_get_circle_member_moments(
  p_circle_id uuid,
  p_limit integer default 18
)
returns table (
  id uuid,
  user_id uuid,
  type text,
  media_url text,
  thumbnail_url text,
  text_body text,
  caption text,
  created_at timestamptz,
  expires_at timestamptz,
  visibility text,
  is_deleted boolean
)
language plpgsql
security definer
stable
set search_path = public, pg_catalog
as $$
begin
  if auth.uid() is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;

  if not public.is_circle_member(p_circle_id, auth.uid())
    and not public.is_circle_owner(p_circle_id, auth.uid()) then
    raise exception 'circle_membership_required' using errcode = '42501';
  end if;

  return query
  with eligible_users as (
    select distinct profile.user_id
    from public.circle_members member
    join public.profiles profile on profile.id = member.profile_id
    where member.circle_id = p_circle_id
      and member.status = 'active'
      and member.is_visible is not false
      and profile.deleted_at is null
      and profile.user_id is not null

    union

    select owner.user_id
    from public.circles c
    join public.profiles owner on owner.id = c.created_by_profile_id
    where c.id = p_circle_id
      and owner.deleted_at is null
      and owner.user_id is not null
  )
  select
    m.id,
    m.user_id,
    m.type,
    m.media_url,
    m.thumbnail_url,
    m.text_body,
    m.caption,
    m.created_at,
    m.expires_at,
    m.visibility,
    m.is_deleted
  from public.moments m
  join eligible_users eligible on eligible.user_id = m.user_id
  where m.is_deleted = false
    and m.expires_at > timezone('utc'::text, now())
    and m.visibility <> 'private'
    and (
      m.type = 'text'
      or nullif(btrim(coalesce(m.media_url, '')), '') is not null
    )
  order by m.created_at desc, m.id desc
  limit greatest(1, least(coalesce(p_limit, 18), 48));
end;
$$;

create or replace function public.resolve_circle_role_requests_after_promotion()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  if new.status = 'active'
    and (
      tg_op = 'INSERT'
      or old.role is distinct from new.role
      or old.status is distinct from new.status
    ) then
    update public.circle_role_requests
    set status = 'approved',
        reviewed_at = coalesce(reviewed_at, timezone('utc'::text, now())),
        updated_at = timezone('utc'::text, now())
    where circle_id = new.circle_id
      and requester_profile_id = new.profile_id
      and status = 'pending'
      and (
        (requested_role = 'moderator' and lower(coalesce(new.role, 'member')) in ('moderator', 'host', 'admin', 'leader'))
        or (requested_role = 'host' and lower(coalesce(new.role, 'member')) in ('host', 'admin', 'leader'))
      );
  end if;

  return new;
end;
$$;

drop trigger if exists circle_members_resolve_role_requests_after_promotion on public.circle_members;
create trigger circle_members_resolve_role_requests_after_promotion
after insert or update of role, status on public.circle_members
for each row execute function public.resolve_circle_role_requests_after_promotion();

update public.circle_role_requests request
set status = 'approved',
    reviewed_at = coalesce(request.reviewed_at, timezone('utc'::text, now())),
    updated_at = timezone('utc'::text, now())
from public.circle_members member
where member.circle_id = request.circle_id
  and member.profile_id = request.requester_profile_id
  and member.status = 'active'
  and request.status = 'pending'
  and (
    (request.requested_role = 'moderator' and lower(coalesce(member.role, 'member')) in ('moderator', 'host', 'admin', 'leader'))
    or (request.requested_role = 'host' and lower(coalesce(member.role, 'member')) in ('host', 'admin', 'leader'))
  );

revoke all on function public.rpc_get_circle_member_moments(uuid, integer) from public;
grant execute on function public.rpc_get_circle_member_moments(uuid, integer) to authenticated;
