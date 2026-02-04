-- Circles moderation RPCs (set matchmaker, remove member)

create or replace function public.rpc_set_circle_member_role(
  p_circle_id uuid,
  p_member_id uuid,
  p_profile_id uuid,
  p_role text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_is_leader boolean;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if p_role not in ('leader','matchmaker','member') then
    raise exception 'Invalid role';
  end if;

  select user_id into v_owner
  from public.profiles
  where id = p_profile_id
  limit 1;

  if v_owner is null or v_owner <> auth.uid() then
    raise exception 'Not authorized';
  end if;

  select exists (
    select 1 from public.circle_members
    where circle_id = p_circle_id
      and profile_id = p_profile_id
      and role = 'leader'
      and status = 'active'
  ) into v_is_leader;

  if not v_is_leader then
    raise exception 'Only leader can change roles';
  end if;

  if p_member_id = p_profile_id and p_role <> 'leader' then
    raise exception 'Leader cannot change own role';
  end if;

  update public.circle_members
  set role = p_role
  where circle_id = p_circle_id
    and profile_id = p_member_id
    and status = 'active';

  return true;
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
set search_path = public
as $$
declare
  v_owner uuid;
  v_is_leader boolean;
  v_target_role text;
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

  select exists (
    select 1 from public.circle_members
    where circle_id = p_circle_id
      and profile_id = p_profile_id
      and role = 'leader'
      and status = 'active'
  ) into v_is_leader;

  if not v_is_leader then
    raise exception 'Only leader can remove members';
  end if;

  select role into v_target_role
  from public.circle_members
  where circle_id = p_circle_id
    and profile_id = p_member_id
  limit 1;

  if v_target_role = 'leader' then
    raise exception 'Cannot remove leader';
  end if;

  delete from public.circle_members
  where circle_id = p_circle_id
    and profile_id = p_member_id;

  return true;
end;
$$;

grant execute on function public.rpc_set_circle_member_role(uuid, uuid, uuid, text) to authenticated;
grant execute on function public.rpc_remove_circle_member(uuid, uuid, uuid) to authenticated;
