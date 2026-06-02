alter table public.relationship_gists
  add column if not exists circle_id uuid references public.circles(id) on delete cascade,
  add column if not exists created_by_profile_id uuid references public.profiles(id) on delete set null;

create index if not exists relationship_gists_circle_published_idx
  on public.relationship_gists (circle_id, status, published_at desc);

create or replace function public.rpc_get_circle_member_moments_recovery(
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
set row_security = off
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
    and (
      moment.user_id = auth.uid()
      or moment.visibility in ('public', 'matches')
    )
    and (
      moment.type = 'text'
      or nullif(btrim(coalesce(moment.media_url, '')), '') is not null
    )
  order by moment.created_at desc, moment.id desc
  limit greatest(1, least(coalesce(p_limit, 18), 48));
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
set row_security = off
as $$
begin
  return query
  select recovery.*
  from public.rpc_get_circle_member_moments_recovery(p_circle_id, p_limit) recovery;
end;
$$;

create or replace function public.rpc_join_circle(
  p_circle_id uuid,
  p_profile_id uuid
)
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

  select *
    into v_profile
  from public.profiles
  where id = p_profile_id
    and deleted_at is null
  limit 1;

  v_owner := v_profile.user_id;
  if v_owner is null or v_owner <> auth.uid() then
    raise exception 'Not authorized';
  end if;

  select *
    into v_circle
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
      and invitation.expires_at > timezone('utc'::text, now())
  ) into v_has_invitation;

  if not v_has_invitation
    and v_circle.visibility_scope in ('country', 'local')
    and (
      (
        nullif(btrim(coalesce(v_circle.country_code, '')), '') is not null
        and upper(btrim(coalesce(v_circle.country_code, ''))) <> upper(btrim(coalesce(v_profile.current_country_code, '')))
      )
      or (
        nullif(btrim(coalesce(v_circle.country_code, '')), '') is null
        and nullif(btrim(coalesce(v_circle.country_name, '')), '') is not null
        and lower(btrim(coalesce(v_circle.country_name, ''))) <> lower(btrim(coalesce(v_profile.current_country, '')))
      )
      or (
        v_circle.visibility_scope = 'local'
        and nullif(btrim(coalesce(v_circle.city, '')), '') is not null
        and lower(btrim(coalesce(v_circle.city, ''))) <> lower(btrim(coalesce(v_profile.city, '')))
      )
    ) then
    raise exception 'circle_scope_mismatch' using errcode = '42501';
  end if;

  v_status := case
    when v_circle.visibility = 'private'
      or v_circle.visibility_scope = 'invite_only'
      or coalesce(v_circle.requires_join_approval, false)
      then 'pending'
    else 'active'
  end;

  insert into public.circle_members (circle_id, profile_id, user_id, role, status, is_visible, joined_at, left_at)
  values (p_circle_id, p_profile_id, auth.uid(), 'member', v_status, true, timezone('utc'::text, now()), null)
  on conflict (circle_id, profile_id) do update
    set status = excluded.status,
        user_id = excluded.user_id,
        left_at = null,
        updated_at = timezone('utc'::text, now());

  update public.circles circle_row
  set member_count = (
    select count(*)::int
    from public.circle_members member
    where member.circle_id = circle_row.id
      and member.status = 'active'
  )
  where circle_row.id = p_circle_id;

  return v_status;
end;
$$;

create or replace function public.rpc_get_circle_profile_suggestions(
  p_profile_id uuid,
  p_limit integer default 8
)
returns table (
  profile_id uuid,
  full_name text,
  age integer,
  avatar_url text,
  circle_id uuid,
  circle_name text,
  reason text,
  score integer
)
language plpgsql
security definer
stable
set search_path = public, pg_catalog
set row_security = off
as $$
begin
  if auth.uid() is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.profiles viewer
    where viewer.id = p_profile_id
      and viewer.user_id = auth.uid()
      and viewer.deleted_at is null
  ) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  return query
  with viewer as (
    select profile.*
    from public.profiles profile
    where profile.id = p_profile_id
  ),
  viewer_circles as (
    select member.circle_id
    from public.circle_members member
    where member.profile_id = p_profile_id
      and member.status = 'active'
      and member.is_visible is not false
  ),
  candidate_context as (
    select
      candidate.id as profile_id,
      candidate.full_name,
      candidate.age,
      candidate.avatar_url,
      circle_row.id as circle_id,
      circle_row.name as circle_name,
      (
        100
        + case when nullif(btrim(coalesce(candidate.current_country_code, '')), '') is not null
                  and upper(candidate.current_country_code) = upper(viewer.current_country_code) then 18 else 0 end
        + case when nullif(btrim(coalesce(candidate.city, '')), '') is not null
                  and lower(candidate.city) = lower(viewer.city) then 12 else 0 end
        + case when coalesce(candidate.interests, '{}') && coalesce(viewer.interests, '{}') then 20 else 0 end
        + case when nullif(btrim(coalesce(candidate.relationship_intent, '')), '') is not null
                  and candidate.relationship_intent = viewer.relationship_intent then 14 else 0 end
      )::integer as score,
      replace(concat_ws(
        ' · ',
        'Shared Circle',
        case when coalesce(candidate.interests, '{}') && coalesce(viewer.interests, '{}') then 'Shared interests' end,
        case when nullif(btrim(coalesce(candidate.current_country_code, '')), '') is not null
                  and upper(candidate.current_country_code) = upper(viewer.current_country_code) then 'Location context' end,
        case when nullif(btrim(coalesce(candidate.relationship_intent, '')), '') is not null
                  and candidate.relationship_intent = viewer.relationship_intent then 'Intent aligned' end
      ), chr(194) || chr(183), ' - ') as reason
    from viewer
    join viewer_circles viewer_circle on true
    join public.circle_members member
      on member.circle_id = viewer_circle.circle_id
     and member.status = 'active'
     and member.is_visible is not false
     and member.profile_id <> p_profile_id
    join public.profiles candidate
      on candidate.id = member.profile_id
     and candidate.deleted_at is null
     and coalesce(candidate.is_active, true)
     and candidate.profile_completed is true
     and coalesce(candidate.discoverable_in_vibes, true)
     and coalesce(candidate.matchmaking_mode, false) = false
     and candidate.user_id is not null
    join public.circles circle_row on circle_row.id = member.circle_id
    where not exists (
      select 1
      from public.blocks block
      where (block.blocker_id = viewer.user_id and block.blocked_id = candidate.user_id)
         or (block.blocker_id = candidate.user_id and block.blocked_id = viewer.user_id)
    )
  ),
  ranked as (
    select distinct on (context.profile_id)
      context.*
    from candidate_context context
    order by context.profile_id, context.score desc, context.circle_name
  )
  select
    ranked.profile_id,
    coalesce(nullif(btrim(ranked.full_name), ''), 'Circle member'),
    ranked.age,
    ranked.avatar_url,
    ranked.circle_id,
    ranked.circle_name,
    ranked.reason,
    ranked.score
  from ranked
  order by ranked.score desc, ranked.full_name nulls last, ranked.profile_id
  limit greatest(1, least(coalesce(p_limit, 8), 24));
end;
$$;

drop function if exists public.rpc_list_my_circle_invitations(uuid);
create function public.rpc_list_my_circle_invitations(
  p_profile_id uuid
)
returns table (
  invitation_id uuid,
  circle_id uuid,
  circle_name text,
  circle_image_url text,
  circle_image_path text,
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
    invitation.id,
    invitation.circle_id,
    circle_row.name,
    coalesce(circle_row.cover_image_url, circle_row.icon_url),
    circle_row.image_path,
    coalesce(nullif(btrim(inviter.full_name), ''), 'A Circle member'),
    invitation.message,
    invitation.expires_at
  from public.circle_invitations invitation
  join public.circles circle_row on circle_row.id = invitation.circle_id
  join public.profiles inviter on inviter.id = invitation.inviter_profile_id
  where invitation.invited_profile_id = p_profile_id
    and invitation.status = 'pending'
    and invitation.expires_at > timezone('utc'::text, now())
  order by invitation.created_at desc, invitation.id desc;
end;
$$;

create or replace function public.rpc_create_circle_relationship_gist(
  p_circle_id uuid,
  p_actor_profile_id uuid,
  p_title text,
  p_short_body text,
  p_body text,
  p_perspective text default 'general'
)
returns public.relationship_gists
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_gist public.relationship_gists%rowtype;
  v_title text := nullif(btrim(coalesce(p_title, '')), '');
  v_short_body text := nullif(btrim(coalesce(p_short_body, '')), '');
  v_body text := nullif(btrim(coalesce(p_body, '')), '');
  v_perspective text := lower(nullif(btrim(coalesce(p_perspective, '')), ''));
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

  if not public.can_manage_circle_pulse(p_circle_id, auth.uid()) then
    raise exception 'host_required' using errcode = '42501';
  end if;

  if v_title is null or char_length(v_title) not between 3 and 140 then
    raise exception 'gist_title_invalid';
  end if;

  if v_body is null or char_length(v_body) not between 20 and 5000 then
    raise exception 'gist_body_invalid';
  end if;

  if v_perspective not in ('general', 'christian', 'muslim', 'culture', 'safety', 'communication') then
    raise exception 'gist_perspective_invalid';
  end if;

  insert into public.relationship_gists (
    circle_id,
    title,
    short_body,
    body,
    perspective,
    status,
    created_by_profile_id,
    published_at
  )
  values (
    p_circle_id,
    v_title,
    v_short_body,
    v_body,
    v_perspective,
    'published',
    p_actor_profile_id,
    timezone('utc'::text, now())
  )
  returning * into v_gist;

  return v_gist;
end;
$$;

revoke all on function public.rpc_get_circle_member_moments_recovery(uuid, integer) from public;
revoke all on function public.rpc_get_circle_member_moments(uuid, integer) from public;
revoke all on function public.rpc_join_circle(uuid, uuid) from public;
revoke all on function public.rpc_get_circle_profile_suggestions(uuid, integer) from public;
revoke all on function public.rpc_list_my_circle_invitations(uuid) from public;
revoke all on function public.rpc_create_circle_relationship_gist(uuid, uuid, text, text, text, text) from public;

grant execute on function public.rpc_get_circle_member_moments_recovery(uuid, integer) to authenticated;
grant execute on function public.rpc_get_circle_member_moments(uuid, integer) to authenticated;
grant execute on function public.rpc_join_circle(uuid, uuid) to authenticated;
grant execute on function public.rpc_get_circle_profile_suggestions(uuid, integer) to authenticated;
grant execute on function public.rpc_list_my_circle_invitations(uuid) to authenticated;
grant execute on function public.rpc_create_circle_relationship_gist(uuid, uuid, text, text, text, text) to authenticated;
