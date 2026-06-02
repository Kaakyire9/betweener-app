create table if not exists public.circle_invitations (
  id uuid primary key default gen_random_uuid(),
  circle_id uuid not null references public.circles(id) on delete cascade,
  inviter_profile_id uuid not null references public.profiles(id) on delete cascade,
  invited_profile_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending',
  message text,
  expires_at timestamptz not null default timezone('utc'::text, now()) + interval '14 days',
  responded_at timestamptz,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  constraint circle_invitations_status_valid check (
    status in ('pending', 'accepted', 'declined', 'revoked', 'expired')
  ),
  constraint circle_invitations_message_length check (
    message is null or char_length(btrim(message)) between 1 and 320
  )
);

create unique index if not exists circle_invitations_profile_pending_unique_idx
  on public.circle_invitations (circle_id, invited_profile_id)
  where status = 'pending';

create index if not exists circle_invitations_invited_profile_idx
  on public.circle_invitations (invited_profile_id, status, created_at desc);

create index if not exists circle_invitations_circle_idx
  on public.circle_invitations (circle_id, status, created_at desc);

drop trigger if exists circle_invitations_set_updated_at on public.circle_invitations;
create trigger circle_invitations_set_updated_at
before update on public.circle_invitations
for each row execute function public.set_updated_at();

alter table public.circle_invitations enable row level security;
revoke all on public.circle_invitations from anon, authenticated;

create or replace function public.can_invite_to_circle(
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
begin
  if p_circle_id is null or p_user_id is null then
    return false;
  end if;

  return public.is_circle_owner(p_circle_id, p_user_id)
    or public.is_circle_member(p_circle_id, p_user_id);
end;
$$;

create or replace function public.rpc_search_circle_invite_candidates(
  p_circle_id uuid,
  p_actor_profile_id uuid,
  p_search text default null,
  p_country text default null,
  p_interest text default null,
  p_min_age integer default null,
  p_max_age integer default null,
  p_limit integer default 24
)
returns table (
  profile_id uuid,
  full_name text,
  avatar_url text,
  age integer,
  location text,
  country text,
  interests text[]
)
language plpgsql
security definer
stable
set search_path = public, pg_catalog
as $$
declare
  v_search text := nullif(btrim(coalesce(p_search, '')), '');
  v_country text := nullif(btrim(coalesce(p_country, '')), '');
  v_interest text := nullif(btrim(coalesce(p_interest, '')), '');
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
    candidate.id,
    coalesce(nullif(btrim(candidate.full_name), ''), 'Betweener member') as full_name,
    candidate.avatar_url,
    candidate.age,
    coalesce(nullif(btrim(candidate.city), ''), nullif(btrim(candidate.region), ''), nullif(btrim(candidate.location), '')) as location,
    coalesce(nullif(btrim(candidate.current_country), ''), nullif(btrim(candidate.current_country_code), '')) as country,
    array(
      select i.name
      from public.profile_interests pi
      join public.interests i on i.id = pi.interest_id
      where pi.profile_id = candidate.id
      order by i.name
      limit 4
    ) as interests
  from public.profiles candidate
  where candidate.id <> p_actor_profile_id
    and candidate.deleted_at is null
    and coalesce(candidate.is_active, true)
    and not exists (
      select 1
      from public.circle_members cm
      where cm.circle_id = p_circle_id
        and cm.profile_id = candidate.id
        and cm.status in ('active', 'pending', 'invited')
    )
    and (
      v_search is null
      or concat_ws(' ', candidate.full_name, candidate.city, candidate.region, candidate.current_country) ilike '%' || v_search || '%'
    )
    and (
      v_country is null
      or candidate.current_country ilike '%' || v_country || '%'
      or candidate.current_country_code ilike v_country
    )
    and (p_min_age is null or candidate.age >= p_min_age)
    and (p_max_age is null or candidate.age <= p_max_age)
    and (
      v_interest is null
      or exists (
        select 1
        from public.profile_interests pi
        join public.interests i on i.id = pi.interest_id
        where pi.profile_id = candidate.id
          and i.name ilike '%' || v_interest || '%'
      )
    )
  order by
    case when v_search is not null and candidate.full_name ilike v_search || '%' then 0 else 1 end,
    candidate.full_name asc nulls last,
    candidate.id
  limit greatest(1, least(coalesce(p_limit, 24), 50));
end;
$$;

create or replace function public.rpc_invite_profile_to_circle(
  p_circle_id uuid,
  p_actor_profile_id uuid,
  p_invited_profile_id uuid,
  p_message text default null
)
returns public.circle_invitations
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
declare
  v_invitation public.circle_invitations%rowtype;
  v_message text := nullif(btrim(coalesce(p_message, '')), '');
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

  if not public.can_invite_to_circle(p_circle_id, auth.uid()) then
    raise exception 'circle_membership_required' using errcode = '42501';
  end if;

  if v_message is not null and char_length(v_message) > 320 then
    raise exception 'invitation_message_too_long';
  end if;

  select candidate.user_id
    into v_target_user_id
  from public.profiles candidate
  where candidate.id = p_invited_profile_id
    and candidate.deleted_at is null
    and coalesce(candidate.is_active, true)
  limit 1;

  if v_target_user_id is null then
    raise exception 'invitee_not_available';
  end if;

  if exists (
    select 1
    from public.circle_members cm
    where cm.circle_id = p_circle_id
      and cm.profile_id = p_invited_profile_id
      and cm.status in ('active', 'pending')
  ) then
    raise exception 'invitee_already_in_circle';
  end if;

  insert into public.circle_invitations (
    circle_id,
    inviter_profile_id,
    invited_profile_id,
    message,
    expires_at
  )
  values (
    p_circle_id,
    p_actor_profile_id,
    p_invited_profile_id,
    v_message,
    timezone('utc'::text, now()) + interval '14 days'
  )
  on conflict (circle_id, invited_profile_id)
    where status = 'pending'
  do update set inviter_profile_id = excluded.inviter_profile_id,
                message = excluded.message,
                expires_at = excluded.expires_at,
                updated_at = timezone('utc'::text, now())
  returning * into v_invitation;

  insert into public.circle_members (
    circle_id,
    profile_id,
    user_id,
    role,
    status,
    is_visible,
    joined_at,
    left_at
  )
  values (
    p_circle_id,
    p_invited_profile_id,
    v_target_user_id,
    'member',
    'invited',
    true,
    timezone('utc'::text, now()),
    null
  )
  on conflict (circle_id, profile_id)
  do update set status = 'invited',
                user_id = excluded.user_id,
                left_at = null,
                updated_at = timezone('utc'::text, now())
  where circle_members.status not in ('active', 'pending');

  select c.name
    into v_circle_name
  from public.circles c
  where c.id = p_circle_id
  limit 1;

  if not exists (
    select 1
    from public.notification_prefs np
    where np.user_id = v_target_user_id
      and np.push_enabled = false
  ) and not public.is_quiet_hours(v_target_user_id) then
    perform private.send_push_webhook(
      jsonb_build_object(
        'user_id', v_target_user_id,
        'title', 'A Circle invited you in',
        'body', coalesce(v_circle_name, 'A Betweener Circle') || ' sent you a private invitation.',
        'data', jsonb_build_object(
          'type', 'circle_invitation',
          'circle_id', p_circle_id,
          'invitation_id', v_invitation.id
        )
      )
    );
  end if;

  return v_invitation;
end;
$$;

create or replace function public.rpc_respond_circle_invitation(
  p_circle_id uuid,
  p_profile_id uuid,
  p_accept boolean
)
returns text
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_invitation public.circle_invitations%rowtype;
  v_status text := case when coalesce(p_accept, false) then 'accepted' else 'declined' end;
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

  select *
    into v_invitation
  from public.circle_invitations ci
  where ci.circle_id = p_circle_id
    and ci.invited_profile_id = p_profile_id
    and ci.status = 'pending'
  order by ci.created_at desc
  limit 1
  for update;

  if v_invitation.id is null then
    raise exception 'circle_invitation_not_found';
  end if;

  if v_invitation.expires_at <= timezone('utc'::text, now()) then
    update public.circle_invitations
    set status = 'expired',
        responded_at = timezone('utc'::text, now())
    where id = v_invitation.id;

    update public.circle_members
    set status = 'removed',
        left_at = timezone('utc'::text, now())
    where circle_id = p_circle_id
      and profile_id = p_profile_id
      and status = 'invited';

    return 'expired';
  end if;

  update public.circle_invitations
  set status = v_status,
      responded_at = timezone('utc'::text, now())
  where id = v_invitation.id;

  if v_status = 'accepted' then
    update public.circle_members
    set status = 'active',
        joined_at = timezone('utc'::text, now()),
        left_at = null
    where circle_id = p_circle_id
      and profile_id = p_profile_id
      and status = 'invited';
  else
    update public.circle_members
    set status = 'removed',
        left_at = timezone('utc'::text, now())
    where circle_id = p_circle_id
      and profile_id = p_profile_id
      and status = 'invited';
  end if;

  update public.circles c
  set member_count = (
    select count(*)::integer
    from public.circle_members cm
    where cm.circle_id = c.id
      and cm.status = 'active'
  )
  where c.id = p_circle_id;

  return v_status;
end;
$$;

revoke all on function public.can_invite_to_circle(uuid, uuid) from public;
revoke all on function public.rpc_search_circle_invite_candidates(uuid, uuid, text, text, text, integer, integer, integer) from public;
revoke all on function public.rpc_invite_profile_to_circle(uuid, uuid, uuid, text) from public;
revoke all on function public.rpc_respond_circle_invitation(uuid, uuid, boolean) from public;

grant execute on function public.can_invite_to_circle(uuid, uuid) to authenticated;
grant execute on function public.rpc_search_circle_invite_candidates(uuid, uuid, text, text, text, integer, integer, integer) to authenticated;
grant execute on function public.rpc_invite_profile_to_circle(uuid, uuid, uuid, text) to authenticated;
grant execute on function public.rpc_respond_circle_invitation(uuid, uuid, boolean) to authenticated;
