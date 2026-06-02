create or replace function public.rpc_approve_circle_member(
  p_circle_id uuid,
  p_member_id uuid,
  p_profile_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_owner uuid;
  v_actor_role text;
  v_is_admin boolean := public.is_admin_user(auth.uid());
  v_is_circle_owner boolean := false;
  v_updated boolean := false;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select user_id into v_owner
  from public.profiles
  where id = p_profile_id
  limit 1;

  if v_owner is null or v_owner <> auth.uid() then
    raise exception 'Not authorized';
  end if;

  v_is_circle_owner := public.is_circle_owner(p_circle_id, auth.uid());

  if not v_is_admin and not v_is_circle_owner then
    select lower(role) into v_actor_role
    from public.circle_members
    where circle_id = p_circle_id
      and profile_id = p_profile_id
      and status = 'active'
    limit 1;

    if coalesce(v_actor_role, '') not in ('leader', 'host', 'admin', 'moderator') then
      raise exception 'Only hosts or moderators can approve';
    end if;
  end if;

  update public.circle_members
  set status = 'active',
      left_at = null,
      updated_at = timezone('utc'::text, now())
  where circle_id = p_circle_id
    and profile_id = p_member_id
    and status = 'pending';
  v_updated := found;

  update public.circles c
  set member_count = (
    select count(*)::int
    from public.circle_members cm
    where cm.circle_id = c.id
      and cm.status = 'active'
  )
  where c.id = p_circle_id;

  return v_updated;
end;
$$;

create or replace function public.rpc_set_circle_member_role(
  p_circle_id uuid,
  p_member_id uuid,
  p_profile_id uuid,
  p_role text
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_owner uuid;
  v_actor_role text;
  v_target_role text;
  v_target_status text;
  v_is_admin boolean := public.is_admin_user(auth.uid());
  v_is_circle_owner boolean := false;
  v_next_role text := lower(coalesce(p_role, ''));
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if v_next_role not in ('leader', 'host', 'moderator', 'matchmaker', 'member') then
    raise exception 'Invalid role';
  end if;

  select user_id into v_owner
  from public.profiles
  where id = p_profile_id
  limit 1;

  if v_owner is null or v_owner <> auth.uid() then
    raise exception 'Not authorized';
  end if;

  v_is_circle_owner := public.is_circle_owner(p_circle_id, auth.uid());

  select lower(role), status
    into v_target_role, v_target_status
  from public.circle_members
  where circle_id = p_circle_id
    and profile_id = p_member_id
  for update;

  if coalesce(v_target_status, '') <> 'active' then
    raise exception 'Member not active';
  end if;

  if not v_is_admin and not v_is_circle_owner then
    select lower(role) into v_actor_role
    from public.circle_members
    where circle_id = p_circle_id
      and profile_id = p_profile_id
      and status = 'active'
    limit 1;

    if coalesce(v_actor_role, '') not in ('leader', 'host', 'admin') then
      raise exception 'Only hosts can change roles';
    end if;

    if v_next_role in ('leader', 'host', 'admin') then
      raise exception 'Only owners can assign host roles';
    end if;

    if coalesce(v_target_role, '') in ('leader', 'host', 'admin') then
      raise exception 'Only owners can change host roles';
    end if;
  end if;

  if p_member_id = p_profile_id and v_next_role not in ('leader', 'host', 'admin') then
    raise exception 'Host cannot change own role';
  end if;

  update public.circle_members
  set role = case when v_next_role = 'leader' then 'host' else v_next_role end,
      updated_at = timezone('utc'::text, now())
  where circle_id = p_circle_id
    and profile_id = p_member_id
    and status = 'active';

  return found;
end;
$$;

create or replace function public.rpc_remove_circle_member(
  p_circle_id uuid,
  p_member_id uuid,
  p_profile_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_owner uuid;
  v_actor_role text;
  v_target_role text;
  v_target_status text;
  v_is_admin boolean := public.is_admin_user(auth.uid());
  v_is_circle_owner boolean := false;
  v_updated boolean := false;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select user_id into v_owner
  from public.profiles
  where id = p_profile_id
  limit 1;

  if v_owner is null or v_owner <> auth.uid() then
    raise exception 'Not authorized';
  end if;

  if p_member_id = p_profile_id then
    raise exception 'Use leave circle for your own membership';
  end if;

  v_is_circle_owner := public.is_circle_owner(p_circle_id, auth.uid());

  select lower(role), status
    into v_target_role, v_target_status
  from public.circle_members
  where circle_id = p_circle_id
    and profile_id = p_member_id
  for update;

  if v_target_status is null then
    raise exception 'Member not found';
  end if;

  if not v_is_admin and not v_is_circle_owner then
    select lower(role) into v_actor_role
    from public.circle_members
    where circle_id = p_circle_id
      and profile_id = p_profile_id
      and status = 'active'
    limit 1;

    if coalesce(v_actor_role, '') not in ('leader', 'host', 'admin', 'moderator') then
      raise exception 'Only hosts or moderators can remove members';
    end if;

    if coalesce(v_target_role, '') in ('leader', 'host', 'admin', 'moderator') then
      raise exception 'Only owners can remove leadership members';
    end if;
  end if;

  update public.circle_members
  set status = case
        when v_target_status = 'pending' then 'removed'
        else 'removed'
      end,
      left_at = timezone('utc'::text, now()),
      updated_at = timezone('utc'::text, now())
  where circle_id = p_circle_id
    and profile_id = p_member_id;
  v_updated := found;

  update public.circles c
  set member_count = (
    select count(*)::int
    from public.circle_members cm
    where cm.circle_id = c.id
      and cm.status = 'active'
  )
  where c.id = p_circle_id;

  return v_updated;
end;
$$;
