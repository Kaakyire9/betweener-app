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
      left join public.profiles circle_owner on circle_owner.id = c.created_by_profile_id
      left join public.circle_members viewer_member
        on viewer_member.circle_id = c.id
       and viewer_member.status = 'active'
       and viewer_member.is_visible is not false
      left join public.profiles viewer_profile on viewer_profile.id = viewer_member.profile_id
      left join public.circle_members moment_member
        on moment_member.circle_id = c.id
       and moment_member.status = 'active'
       and moment_member.is_visible is not false
      left join public.profiles moment_profile on moment_profile.id = moment_member.profile_id
      where coalesce(c.archived_at, 'infinity'::timestamptz) > timezone('utc'::text, now())
        and (
          coalesce(c.created_by_user_id, circle_owner.user_id) = v_viewer_id
          or coalesce(viewer_member.user_id, viewer_profile.user_id) = v_viewer_id
        )
        and (
          coalesce(c.created_by_user_id, circle_owner.user_id) = v_moment.user_id
          or coalesce(moment_member.user_id, moment_profile.user_id) = v_moment.user_id
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
    select distinct coalesce(member.user_id, profile.user_id) as user_id
    from public.circle_members member
    left join public.profiles profile on profile.id = member.profile_id
    where member.circle_id = p_circle_id
      and member.status = 'active'
      and member.is_visible is not false
      and coalesce(member.user_id, profile.user_id) is not null

    union

    select coalesce(c.created_by_user_id, owner.user_id)
    from public.circles c
    left join public.profiles owner on owner.id = c.created_by_profile_id
    where c.id = p_circle_id
      and coalesce(c.created_by_user_id, owner.user_id) is not null
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

create or replace function public.rpc_debug_circle_member_moments(
  p_circle_id uuid
)
returns jsonb
language plpgsql
security definer
stable
set search_path = public, pg_catalog
as $$
declare
  v_result jsonb;
begin
  if auth.uid() is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;

  if not public.can_manage_circle_pulse(p_circle_id, auth.uid())
    and not public.is_circle_owner(p_circle_id, auth.uid()) then
    raise exception 'host_required' using errcode = '42501';
  end if;

  with eligible_profiles as (
    select
      member.profile_id,
      coalesce(nullif(btrim(profile.full_name), ''), 'Circle member') as profile_name,
      member.role,
      member.status,
      member.is_visible,
      coalesce(member.user_id, profile.user_id) as user_id
    from public.circle_members member
    left join public.profiles profile on profile.id = member.profile_id
    where member.circle_id = p_circle_id

    union all

    select
      owner.id,
      coalesce(nullif(btrim(owner.full_name), ''), 'Circle creator'),
      'creator'::text,
      'active'::text,
      true,
      coalesce(c.created_by_user_id, owner.user_id)
    from public.circles c
    left join public.profiles owner on owner.id = c.created_by_profile_id
    where c.id = p_circle_id
      and not exists (
        select 1
        from public.circle_members member
        where member.circle_id = c.id
          and member.profile_id = owner.id
      )
  )
  select jsonb_build_object(
    'circle_id', p_circle_id,
    'viewer_user_id', auth.uid(),
    'profiles', coalesce(jsonb_agg(
      jsonb_build_object(
        'profile_id', eligible.profile_id,
        'profile_name', eligible.profile_name,
        'role', eligible.role,
        'membership_status', eligible.status,
        'is_visible', eligible.is_visible,
        'resolved_user_id', eligible.user_id,
        'active_moment_count', (
          select count(*)::integer
          from public.moments m
          where m.user_id = eligible.user_id
            and m.is_deleted = false
            and m.expires_at > timezone('utc'::text, now())
        ),
        'circle_visible_moment_count', (
          select count(*)::integer
          from public.moments m
          where m.user_id = eligible.user_id
            and m.is_deleted = false
            and m.expires_at > timezone('utc'::text, now())
            and m.visibility <> 'private'
            and (
              m.type = 'text'
              or nullif(btrim(coalesce(m.media_url, '')), '') is not null
            )
        ),
        'recent_moments', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', recent.id,
            'type', recent.type,
            'visibility', recent.visibility,
            'is_deleted', recent.is_deleted,
            'expires_at', recent.expires_at,
            'has_media', nullif(btrim(coalesce(recent.media_url, '')), '') is not null
          ) order by recent.created_at desc)
          from (
            select m.*
            from public.moments m
            where m.user_id = eligible.user_id
            order by m.created_at desc, m.id desc
            limit 3
          ) recent
        ), '[]'::jsonb)
      )
      order by eligible.profile_name, eligible.profile_id
    ), '[]'::jsonb)
  )
    into v_result
  from eligible_profiles eligible;

  return coalesce(v_result, jsonb_build_object(
    'circle_id', p_circle_id,
    'viewer_user_id', auth.uid(),
    'profiles', '[]'::jsonb
  ));
end;
$$;

create or replace function public.rpc_archive_owned_circle(
  p_circle_id uuid,
  p_actor_profile_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_circle public.circles%rowtype;
begin
  if auth.uid() is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.profiles actor
    where actor.id = p_actor_profile_id
      and actor.user_id = auth.uid()
      and actor.deleted_at is null
  ) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  select *
    into v_circle
  from public.circles c
  where c.id = p_circle_id
  for update;

  if v_circle.id is null then
    raise exception 'circle_not_found';
  end if;

  if v_circle.created_by_profile_id <> p_actor_profile_id then
    raise exception 'circle_creator_required' using errcode = '42501';
  end if;

  if coalesce(v_circle.is_official, false) then
    raise exception 'official_circle_requires_admin' using errcode = '42501';
  end if;

  update public.circles
  set status = 'archived',
      archived_at = timezone('utc'::text, now()),
      updated_at = timezone('utc'::text, now())
  where id = p_circle_id;

  return true;
end;
$$;

create or replace function public.rpc_delete_owned_circle(
  p_circle_id uuid,
  p_actor_profile_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_circle public.circles%rowtype;
begin
  if auth.uid() is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.profiles actor
    where actor.id = p_actor_profile_id
      and actor.user_id = auth.uid()
      and actor.deleted_at is null
  ) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  select *
    into v_circle
  from public.circles c
  where c.id = p_circle_id
  for update;

  if v_circle.id is null then
    raise exception 'circle_not_found';
  end if;

  if v_circle.created_by_profile_id <> p_actor_profile_id then
    raise exception 'circle_creator_required' using errcode = '42501';
  end if;

  if coalesce(v_circle.is_official, false) then
    raise exception 'official_circle_requires_admin' using errcode = '42501';
  end if;

  if v_circle.status = 'approved' and v_circle.archived_at is null then
    raise exception 'archive_live_circle_first';
  end if;

  delete from public.circles
  where id = p_circle_id;

  return found;
end;
$$;

revoke all on function public.rpc_get_circle_member_moments(uuid, integer) from public;
revoke all on function public.rpc_debug_circle_member_moments(uuid) from public;
revoke all on function public.rpc_archive_owned_circle(uuid, uuid) from public;
revoke all on function public.rpc_delete_owned_circle(uuid, uuid) from public;

grant execute on function public.rpc_get_circle_member_moments(uuid, integer) to authenticated;
grant execute on function public.rpc_debug_circle_member_moments(uuid) to authenticated;
grant execute on function public.rpc_archive_owned_circle(uuid, uuid) to authenticated;
grant execute on function public.rpc_delete_owned_circle(uuid, uuid) to authenticated;
