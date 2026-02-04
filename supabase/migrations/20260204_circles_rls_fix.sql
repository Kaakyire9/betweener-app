-- Fix circle_members RLS recursion using SECURITY DEFINER helper

create or replace function public.is_circle_member(p_circle_id uuid, p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_exists boolean;
begin
  select exists (
    select 1
    from public.circle_members cm
    join public.profiles p on p.id = cm.profile_id
    where cm.circle_id = p_circle_id
      and cm.status = 'active'
      and p.user_id = p_user_id
  ) into v_exists;
  return coalesce(v_exists, false);
end;
$$;

create or replace function public.is_circle_owner(p_circle_id uuid, p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_exists boolean;
begin
  select exists (
    select 1
    from public.circles c
    join public.profiles p on p.id = c.created_by_profile_id
    where c.id = p_circle_id
      and p.user_id = p_user_id
  ) into v_exists;
  return coalesce(v_exists, false);
end;
$$;

-- Update policies to use helper functions
drop policy if exists "circles_select_public_or_member" on public.circles;
create policy "circles_select_public_or_member"
on public.circles
for select
to authenticated
using (
  visibility = 'public'
  or public.is_circle_member(circles.id, auth.uid())
  or public.is_circle_owner(circles.id, auth.uid())
);

drop policy if exists "circle_members_select_member" on public.circle_members;
create policy "circle_members_select_member"
on public.circle_members
for select
to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = circle_members.profile_id
      and p.user_id = auth.uid()
  )
  or public.is_circle_member(circle_members.circle_id, auth.uid())
  or public.is_circle_owner(circle_members.circle_id, auth.uid())
);
