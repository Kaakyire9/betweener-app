-- Preserve the installed-client join signature while making Circle reach a
-- discovery concern by default. Strict geographic eligibility is opt-in.

create or replace function public.rpc_join_circle(p_circle_id uuid, p_profile_id uuid)
returns text
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_owner uuid;
  v_profile public.profiles%rowtype;
  v_circle public.circles%rowtype;
  v_status text;
  v_has_invitation boolean := false;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_profile
  from public.profiles
  where id = p_profile_id and deleted_at is null
  limit 1;

  v_owner := v_profile.user_id;
  if v_owner is null or v_owner <> auth.uid() then
    raise exception 'Not authorized';
  end if;

  select * into v_circle
  from public.circles
  where id = p_circle_id
  limit 1;

  if v_circle.id is null or v_circle.status <> 'approved' or v_circle.archived_at is not null then
    raise exception 'Circle not found';
  end if;

  select exists (
    select 1
    from public.circle_invitations invitation
    where invitation.circle_id = p_circle_id
      and invitation.invited_profile_id = p_profile_id
      and invitation.status = 'pending'
      and invitation.expires_at > timezone('utc', now())
  ) into v_has_invitation;

  if not v_has_invitation
    and coalesce(v_circle.membership_eligibility_policy, 'recommend_only') = 'target_only'
    and v_circle.reach_scope in ('country', 'local')
    and (
      (
        nullif(btrim(coalesce(v_circle.country_code, '')), '') is not null
        and upper(btrim(v_circle.country_code)) <> upper(btrim(coalesce(v_profile.current_country_code, '')))
      )
      or (
        nullif(btrim(coalesce(v_circle.country_code, '')), '') is null
        and nullif(btrim(coalesce(v_circle.country_name, '')), '') is not null
        and lower(btrim(v_circle.country_name)) <> lower(btrim(coalesce(v_profile.current_country, '')))
      )
      or (
        v_circle.reach_scope = 'local'
        and nullif(btrim(coalesce(v_circle.city, '')), '') is not null
        and lower(btrim(v_circle.city)) <> lower(btrim(coalesce(v_profile.city, '')))
      )
    ) then
    raise exception 'circle_scope_mismatch' using errcode = '42501';
  end if;

  v_status := case
    when coalesce(v_circle.access_policy, 'open') in ('approval_required', 'invite_only')
      or v_circle.visibility = 'private'
      or v_circle.visibility_scope = 'invite_only'
      or coalesce(v_circle.requires_join_approval, false)
    then 'pending'
    else 'active'
  end;

  insert into public.circle_members(
    circle_id, profile_id, user_id, role, status, is_visible, joined_at, left_at
  ) values (
    p_circle_id, p_profile_id, auth.uid(), 'member', v_status, true, timezone('utc', now()), null
  )
  on conflict(circle_id, profile_id) do update
    set status = excluded.status,
        user_id = excluded.user_id,
        left_at = null,
        updated_at = timezone('utc', now());

  update public.circles circle_row
  set member_count = (
    select count(*)::integer
    from public.circle_members member
    where member.circle_id = circle_row.id and member.status = 'active'
  )
  where circle_row.id = p_circle_id;

  return v_status;
end;
$$;

revoke all on function public.rpc_join_circle(uuid, uuid) from public, anon;
grant execute on function public.rpc_join_circle(uuid, uuid) to authenticated, service_role;

comment on function public.rpc_join_circle(uuid, uuid) is
  'Compatibility-preserving Circle join. Reach ranks discovery; target_only explicitly enforces geographic eligibility.';
