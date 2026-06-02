create table if not exists public.circle_role_requests (
  id uuid primary key default gen_random_uuid(),
  circle_id uuid not null references public.circles(id) on delete cascade,
  requester_profile_id uuid not null references public.profiles(id) on delete cascade,
  requester_user_id uuid references auth.users(id) on delete cascade,
  requested_role text not null,
  note text,
  status text not null default 'pending',
  reviewed_by_profile_id uuid references public.profiles(id) on delete set null,
  reviewed_by_user_id uuid references auth.users(id) on delete set null,
  rejection_reason text,
  reviewed_at timestamptz,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  constraint circle_role_requests_role_valid check (requested_role in ('moderator', 'host')),
  constraint circle_role_requests_status_valid check (status in ('pending', 'approved', 'rejected', 'cancelled'))
);

create unique index if not exists circle_role_requests_pending_unique_idx
  on public.circle_role_requests (circle_id, requester_profile_id, requested_role)
  where status = 'pending';

create index if not exists circle_role_requests_circle_status_idx
  on public.circle_role_requests (circle_id, status, created_at desc);

create index if not exists circle_role_requests_requester_idx
  on public.circle_role_requests (requester_profile_id, created_at desc);

alter table public.circle_role_requests enable row level security;

drop policy if exists circle_role_requests_select_member_or_reviewer on public.circle_role_requests;
create policy circle_role_requests_select_member_or_reviewer
on public.circle_role_requests
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.user_id = auth.uid()
      and (
        p.id = circle_role_requests.requester_profile_id
        or public.is_circle_owner(circle_role_requests.circle_id, auth.uid())
        or exists (
          select 1
          from public.circle_members cm
          where cm.circle_id = circle_role_requests.circle_id
            and cm.profile_id = p.id
            and cm.status = 'active'
            and lower(cm.role) in ('leader', 'host', 'admin', 'moderator')
        )
      )
  )
);

revoke all on public.circle_role_requests from anon, authenticated;
grant select on public.circle_role_requests to authenticated;

create or replace function public.rpc_request_circle_role(
  p_circle_id uuid,
  p_profile_id uuid,
  p_requested_role text,
  p_note text default null
)
returns public.circle_role_requests
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_owner uuid;
  v_current_role text;
  v_status text;
  v_request public.circle_role_requests%rowtype;
  v_requested_role text := lower(coalesce(p_requested_role, ''));
begin
  if auth.uid() is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;

  if v_requested_role not in ('moderator', 'host') then
    raise exception 'invalid_role';
  end if;

  select user_id into v_owner
  from public.profiles
  where id = p_profile_id
  limit 1;

  if v_owner is null or v_owner <> auth.uid() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  select lower(role), status
    into v_current_role, v_status
  from public.circle_members
  where circle_id = p_circle_id
    and profile_id = p_profile_id
  limit 1;

  if coalesce(v_status, '') <> 'active' then
    raise exception 'member_not_active';
  end if;

  if v_requested_role = 'moderator' and coalesce(v_current_role, '') in ('moderator', 'host', 'admin', 'leader') then
    raise exception 'already_has_role';
  end if;

  if v_requested_role = 'host' and coalesce(v_current_role, '') in ('host', 'admin', 'leader') then
    raise exception 'already_has_role';
  end if;

  if exists (
    select 1
    from public.circle_role_requests
    where circle_id = p_circle_id
      and requester_profile_id = p_profile_id
      and requested_role = v_requested_role
      and status = 'pending'
  ) then
    raise exception 'request_already_pending';
  end if;

  insert into public.circle_role_requests (
    circle_id,
    requester_profile_id,
    requester_user_id,
    requested_role,
    note
  )
  values (
    p_circle_id,
    p_profile_id,
    auth.uid(),
    v_requested_role,
    nullif(btrim(coalesce(p_note, '')), '')
  )
  returning * into v_request;

  return v_request;
end;
$$;

create or replace function public.rpc_review_circle_role_request(
  p_request_id uuid,
  p_profile_id uuid,
  p_decision text,
  p_rejection_reason text default null
)
returns public.circle_role_requests
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_owner uuid;
  v_actor_role text;
  v_request public.circle_role_requests%rowtype;
  v_decision text := lower(coalesce(p_decision, ''));
  v_is_admin boolean := public.is_admin_user(auth.uid());
  v_is_circle_owner boolean := false;
begin
  if auth.uid() is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;

  if v_decision not in ('approve', 'reject') then
    raise exception 'invalid_decision';
  end if;

  select user_id into v_owner
  from public.profiles
  where id = p_profile_id
  limit 1;

  if v_owner is null or v_owner <> auth.uid() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  select *
    into v_request
  from public.circle_role_requests
  where id = p_request_id
    and status = 'pending'
  for update;

  if v_request.id is null then
    raise exception 'request_not_found';
  end if;

  v_is_circle_owner := public.is_circle_owner(v_request.circle_id, auth.uid());

  if not v_is_admin and not v_is_circle_owner then
    select lower(role) into v_actor_role
    from public.circle_members
    where circle_id = v_request.circle_id
      and profile_id = p_profile_id
      and status = 'active'
    limit 1;

    if coalesce(v_actor_role, '') not in ('leader', 'host', 'admin') then
      raise exception 'host_required' using errcode = '42501';
    end if;

    if v_request.requested_role = 'host' then
      raise exception 'owner_required_for_host_request' using errcode = '42501';
    end if;
  end if;

  if v_decision = 'approve' then
    update public.circle_members
    set role = v_request.requested_role,
        updated_at = timezone('utc'::text, now())
    where circle_id = v_request.circle_id
      and profile_id = v_request.requester_profile_id
      and status = 'active';

    update public.circle_role_requests
    set status = 'approved',
        reviewed_by_profile_id = p_profile_id,
        reviewed_by_user_id = auth.uid(),
        rejection_reason = null,
        reviewed_at = timezone('utc'::text, now()),
        updated_at = timezone('utc'::text, now())
    where id = p_request_id
    returning * into v_request;

    return v_request;
  end if;

  update public.circle_role_requests
  set status = 'rejected',
      reviewed_by_profile_id = p_profile_id,
      reviewed_by_user_id = auth.uid(),
      rejection_reason = nullif(btrim(coalesce(p_rejection_reason, '')), ''),
      reviewed_at = timezone('utc'::text, now()),
      updated_at = timezone('utc'::text, now())
  where id = p_request_id
  returning * into v_request;

  return v_request;
end;
$$;

grant execute on function public.rpc_request_circle_role(uuid, uuid, text, text) to authenticated;
grant execute on function public.rpc_review_circle_role_request(uuid, uuid, text, text) to authenticated;
