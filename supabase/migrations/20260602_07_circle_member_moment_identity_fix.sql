create or replace function public.is_circle_member(
  p_circle_id uuid,
  p_user_id uuid
)
returns boolean
language plpgsql
security definer
stable
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  v_exists boolean;
begin
  select exists (
    select 1
    from public.circle_members member
    left join public.profiles profile on profile.id = member.profile_id
    where member.circle_id = p_circle_id
      and member.status = 'active'
      and (
        member.user_id = p_user_id
        or profile.user_id = p_user_id
      )
  ) into v_exists;

  return coalesce(v_exists, false);
end;
$$;

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
  from public.moments moment
  where moment.id = p_moment_id
    and moment.is_deleted = false
    and moment.expires_at > timezone('utc'::text, now())
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
      from public.circles circle_row
      left join public.profiles circle_owner on circle_owner.id = circle_row.created_by_profile_id
      left join public.circle_members viewer_member
        on viewer_member.circle_id = circle_row.id
       and viewer_member.status = 'active'
       and viewer_member.is_visible is not false
      left join public.profiles viewer_profile on viewer_profile.id = viewer_member.profile_id
      left join public.circle_members moment_member
        on moment_member.circle_id = circle_row.id
       and moment_member.status = 'active'
       and moment_member.is_visible is not false
      left join public.profiles moment_profile on moment_profile.id = moment_member.profile_id
      where coalesce(circle_row.archived_at, 'infinity'::timestamptz) > timezone('utc'::text, now())
        and (
          circle_row.created_by_user_id = v_viewer_id
          or circle_owner.user_id = v_viewer_id
          or viewer_member.user_id = v_viewer_id
          or viewer_profile.user_id = v_viewer_id
        )
        and (
          circle_row.created_by_user_id = v_moment.user_id
          or circle_owner.user_id = v_moment.user_id
          or moment_member.user_id = v_moment.user_id
          or moment_profile.user_id = v_moment.user_id
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
    select member.user_id
    from public.circle_members member
    where member.circle_id = p_circle_id
      and member.status = 'active'
      and member.is_visible is not false
      and member.user_id is not null

    union

    select profile.user_id
    from public.circle_members member
    join public.profiles profile on profile.id = member.profile_id
    where member.circle_id = p_circle_id
      and member.status = 'active'
      and member.is_visible is not false
      and profile.user_id is not null

    union

    select circle_row.created_by_user_id
    from public.circles circle_row
    where circle_row.id = p_circle_id
      and circle_row.created_by_user_id is not null

    union

    select owner.user_id
    from public.circles circle_row
    join public.profiles owner on owner.id = circle_row.created_by_profile_id
    where circle_row.id = p_circle_id
      and owner.user_id is not null
  )
  select
    moment.id,
    moment.user_id,
    moment.type,
    moment.media_url,
    moment.thumbnail_url,
    moment.text_body,
    moment.caption,
    moment.created_at,
    moment.expires_at,
    moment.visibility,
    moment.is_deleted
  from public.moments moment
  join eligible_users eligible on eligible.user_id = moment.user_id
  where moment.is_deleted = false
    and moment.expires_at > timezone('utc'::text, now())
    and moment.visibility <> 'private'
    and (
      moment.type = 'text'
      or nullif(btrim(coalesce(moment.media_url, '')), '') is not null
    )
  order by moment.created_at desc, moment.id desc
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
      member.user_id as membership_user_id,
      profile.user_id as profile_user_id
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
      circle_row.created_by_user_id,
      owner.user_id
    from public.circles circle_row
    left join public.profiles owner on owner.id = circle_row.created_by_profile_id
    where circle_row.id = p_circle_id
      and not exists (
        select 1
        from public.circle_members member
        where member.circle_id = circle_row.id
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
        'membership_user_id', eligible.membership_user_id,
        'profile_user_id', eligible.profile_user_id,
        'identity_mismatch', eligible.membership_user_id is distinct from eligible.profile_user_id,
        'active_moment_count', (
          select count(*)::integer
          from public.moments moment
          where (
              moment.user_id = eligible.membership_user_id
              or moment.user_id = eligible.profile_user_id
            )
            and moment.is_deleted = false
            and moment.expires_at > timezone('utc'::text, now())
        ),
        'circle_visible_moment_count', (
          select count(*)::integer
          from public.moments moment
          where (
              moment.user_id = eligible.membership_user_id
              or moment.user_id = eligible.profile_user_id
            )
            and moment.is_deleted = false
            and moment.expires_at > timezone('utc'::text, now())
            and moment.visibility <> 'private'
            and (
              moment.type = 'text'
              or nullif(btrim(coalesce(moment.media_url, '')), '') is not null
            )
        )
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

revoke all on function public.is_circle_member(uuid, uuid) from public;
revoke all on function public.rpc_get_circle_member_moments(uuid, integer) from public;
revoke all on function public.rpc_debug_circle_member_moments(uuid) from public;

grant execute on function public.is_circle_member(uuid, uuid) to authenticated;
grant execute on function public.rpc_get_circle_member_moments(uuid, integer) to authenticated;
grant execute on function public.rpc_debug_circle_member_moments(uuid) to authenticated;
