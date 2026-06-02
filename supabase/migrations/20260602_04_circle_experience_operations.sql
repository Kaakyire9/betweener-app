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

  if v_moment.visibility in ('public', 'matches')
    and exists (
      select 1
      from public.circle_members viewer_member
      join public.profiles viewer_profile on viewer_profile.id = viewer_member.profile_id
      join public.circle_members owner_member on owner_member.circle_id = viewer_member.circle_id
      where viewer_profile.user_id = v_viewer_id
        and viewer_profile.deleted_at is null
        and viewer_member.status = 'active'
        and viewer_member.is_visible is not false
        and owner_member.user_id = v_moment.user_id
        and owner_member.status = 'active'
        and owner_member.is_visible is not false
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
  join public.circle_members member
    on member.circle_id = p_circle_id
   and member.user_id = m.user_id
   and member.status = 'active'
   and member.is_visible is not false
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

create or replace function public.rpc_list_sent_circle_invitations(
  p_circle_id uuid,
  p_actor_profile_id uuid
)
returns table (
  id uuid,
  invited_profile_id uuid,
  invited_profile_name text,
  invited_profile_avatar_url text,
  invited_profile_age integer,
  invited_profile_location text,
  status text,
  created_at timestamptz,
  expires_at timestamptz
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

  if not exists (
    select 1
    from public.profiles actor
    where actor.id = p_actor_profile_id
      and actor.user_id = auth.uid()
      and actor.deleted_at is null
  ) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  if not public.can_invite_to_circle(p_circle_id, auth.uid()) then
    raise exception 'circle_membership_required' using errcode = '42501';
  end if;

  return query
  select
    ci.id,
    ci.invited_profile_id,
    coalesce(nullif(btrim(invited.full_name), ''), 'Betweener member') as invited_profile_name,
    invited.avatar_url as invited_profile_avatar_url,
    invited.age as invited_profile_age,
    coalesce(nullif(btrim(invited.city), ''), nullif(btrim(invited.region), ''), nullif(btrim(invited.location), '')) as invited_profile_location,
    ci.status,
    ci.created_at,
    ci.expires_at
  from public.circle_invitations ci
  join public.profiles invited on invited.id = ci.invited_profile_id
  where ci.circle_id = p_circle_id
    and ci.status = 'pending'
    and ci.expires_at > timezone('utc'::text, now())
  order by ci.created_at desc, ci.id desc;
end;
$$;

create or replace function public.rpc_cancel_circle_invitation(
  p_invitation_id uuid,
  p_actor_profile_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
declare
  v_invitation public.circle_invitations%rowtype;
  v_target_user_id uuid;
  v_circle_name text;
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
    into v_invitation
  from public.circle_invitations ci
  where ci.id = p_invitation_id
    and ci.status = 'pending'
  for update;

  if v_invitation.id is null then
    raise exception 'circle_invitation_not_found';
  end if;

  if v_invitation.inviter_profile_id <> p_actor_profile_id
    and not public.can_manage_circle_pulse(v_invitation.circle_id, auth.uid()) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  update public.circle_invitations
  set status = 'revoked',
      responded_at = timezone('utc'::text, now())
  where id = p_invitation_id;

  update public.circle_members
  set status = 'removed',
      left_at = timezone('utc'::text, now())
  where circle_id = v_invitation.circle_id
    and profile_id = v_invitation.invited_profile_id
    and status = 'invited';

  select invited.user_id, c.name
    into v_target_user_id, v_circle_name
  from public.profiles invited
  join public.circles c on c.id = v_invitation.circle_id
  where invited.id = v_invitation.invited_profile_id
  limit 1;

  if v_target_user_id is not null
    and not exists (
      select 1
      from public.notification_prefs np
      where np.user_id = v_target_user_id
        and np.push_enabled = false
    )
    and not public.is_quiet_hours(v_target_user_id) then
    perform private.send_push_webhook(
      jsonb_build_object(
        'user_id', v_target_user_id,
        'title', 'Circle invitation updated',
        'body', 'The invitation from ' || coalesce(v_circle_name, 'a Betweener Circle') || ' is no longer active.',
        'data', jsonb_build_object(
          'type', 'circle_invitation',
          'event_type', 'withdrawn',
          'circle_id', v_invitation.circle_id,
          'invitation_id', v_invitation.id
        )
      )
    );
  end if;

  return true;
end;
$$;

create or replace function public.rpc_get_my_circle_invitation_count(
  p_profile_id uuid
)
returns integer
language plpgsql
security definer
stable
set search_path = public, pg_catalog
as $$
declare
  v_count integer := 0;
begin
  if auth.uid() is null then
    return 0;
  end if;

  if not exists (
    select 1
    from public.profiles recipient
    where recipient.id = p_profile_id
      and recipient.user_id = auth.uid()
      and recipient.deleted_at is null
  ) then
    return 0;
  end if;

  select count(*)::integer
    into v_count
  from public.circle_invitations ci
  where ci.invited_profile_id = p_profile_id
    and ci.status = 'pending'
    and ci.expires_at > timezone('utc'::text, now());

  return coalesce(v_count, 0);
end;
$$;

create or replace function public.rpc_list_my_circle_invitations(
  p_profile_id uuid
)
returns table (
  invitation_id uuid,
  circle_id uuid,
  circle_name text,
  circle_image_url text,
  inviter_name text,
  message text,
  expires_at timestamptz
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

  if not exists (
    select 1
    from public.profiles recipient
    where recipient.id = p_profile_id
      and recipient.user_id = auth.uid()
      and recipient.deleted_at is null
  ) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  return query
  select
    ci.id as invitation_id,
    ci.circle_id,
    c.name as circle_name,
    coalesce(c.cover_image_url, c.icon_url) as circle_image_url,
    coalesce(nullif(btrim(inviter.full_name), ''), 'A Circle member') as inviter_name,
    ci.message,
    ci.expires_at
  from public.circle_invitations ci
  join public.circles c on c.id = ci.circle_id
  join public.profiles inviter on inviter.id = ci.inviter_profile_id
  where ci.invited_profile_id = p_profile_id
    and ci.status = 'pending'
    and ci.expires_at > timezone('utc'::text, now())
  order by ci.created_at desc, ci.id desc;
end;
$$;

revoke all on function public.rpc_get_circle_member_moments(uuid, integer) from public;
revoke all on function public.rpc_list_sent_circle_invitations(uuid, uuid) from public;
revoke all on function public.rpc_cancel_circle_invitation(uuid, uuid) from public;
revoke all on function public.rpc_get_my_circle_invitation_count(uuid) from public;
revoke all on function public.rpc_list_my_circle_invitations(uuid) from public;

grant execute on function public.rpc_get_circle_member_moments(uuid, integer) to authenticated;
grant execute on function public.rpc_list_sent_circle_invitations(uuid, uuid) to authenticated;
grant execute on function public.rpc_cancel_circle_invitation(uuid, uuid) to authenticated;
grant execute on function public.rpc_get_my_circle_invitation_count(uuid) to authenticated;
grant execute on function public.rpc_list_my_circle_invitations(uuid) to authenticated;
