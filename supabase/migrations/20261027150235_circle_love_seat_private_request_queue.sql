-- Staging ledger version: 20261027150235.
begin;

alter table public.circle_love_seats
  add column if not exists request_source text not null default 'host_nomination',
  add column if not exists duration_hours smallint not null default 24,
  add column if not exists selected_at timestamptz,
  add column if not exists request_expires_at timestamptz;

alter table public.circle_love_seats
  drop constraint if exists circle_love_seats_status_valid,
  add constraint circle_love_seats_status_valid
    check (status in ('requested', 'pending_user_approval', 'approved', 'active', 'declined', 'ended', 'archived')),
  add constraint circle_love_seats_request_source_valid
    check (request_source in ('host_nomination', 'member_request', 'live_nomination')),
  add constraint circle_love_seats_duration_valid
    check (duration_hours in (12, 24, 48)),
  add constraint circle_love_seats_request_expiry_valid
    check (request_expires_at is null or request_expires_at > created_at);

create unique index if not exists circle_love_seats_member_request_unique_idx
  on public.circle_love_seats(circle_id, featured_profile_id)
  where status = 'requested';

create index if not exists circle_love_seats_host_queue_idx
  on public.circle_love_seats(circle_id, status, created_at asc)
  where status = 'requested';

create or replace function public.cleanup_stale_circle_love_seats(
  p_circle_id uuid default null
)
returns integer
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  v_now timestamptz := timezone('utc', now());
  v_rows integer := 0;
begin
  with stale as (
    select
      cls.id,
      case when cls.status = 'active' then 'ended' else 'archived' end as next_status
    from public.circle_love_seats cls
    left join public.profiles featured
      on featured.id = cls.featured_profile_id
    left join public.circle_members featured_member
      on featured_member.circle_id = cls.circle_id
     and featured_member.profile_id = cls.featured_profile_id
     and featured_member.status = 'active'
     and featured_member.is_visible is not false
    where cls.status in ('requested', 'pending_user_approval', 'approved', 'active')
      and (p_circle_id is null or cls.circle_id = p_circle_id)
      and (
        featured.id is null
        or featured.deleted_at is not null
        or featured_member.profile_id is null
        or (cls.status = 'requested' and cls.request_expires_at <= v_now)
        or (
          cls.status in ('pending_user_approval', 'approved')
          and coalesce(cls.selected_at, cls.created_at) <= v_now - interval '24 hours'
        )
        or (cls.status = 'active' and cls.ends_at is not null and cls.ends_at <= v_now)
      )
  ),
  updated_love_seats as (
    update public.circle_love_seats cls
    set status = stale.next_status,
        responded_at = coalesce(cls.responded_at, v_now),
        ends_at = case
          when stale.next_status = 'ended' then coalesce(cls.ends_at, v_now)
          else cls.ends_at
        end
    from stale
    where cls.id = stale.id
    returning cls.id
  ),
  archived_items as (
    update public.circle_pulse_items cpi
    set status = 'archived',
        expires_at = coalesce(cpi.expires_at, v_now)
    where cpi.love_seat_id in (select id from updated_love_seats)
      and cpi.status in ('draft', 'active')
    returning cpi.id
  )
  select count(*) into v_rows from updated_love_seats;

  return v_rows;
end;
$$;

create or replace function public.rpc_request_circle_love_seat(
  p_circle_id uuid,
  p_profile_id uuid,
  p_note text default null
)
returns public.circle_love_seats
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  v_request public.circle_love_seats%rowtype;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_now timestamptz := timezone('utc', now());
begin
  if auth.uid() is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.profiles p
    where p.id = p_profile_id
      and p.user_id = auth.uid()
      and p.deleted_at is null
  ) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.circle_members cm
    where cm.circle_id = p_circle_id
      and cm.profile_id = p_profile_id
      and cm.status = 'active'
      and cm.is_visible is not false
  ) then
    raise exception 'circle_membership_required' using errcode = '42501';
  end if;

  if v_note is not null and char_length(v_note) > 500 then
    raise exception 'reason_too_long';
  end if;

  perform public.cleanup_stale_circle_love_seats(p_circle_id);

  if exists (
    select 1 from public.circle_love_seats cls
    where cls.circle_id = p_circle_id
      and cls.featured_profile_id = p_profile_id
      and cls.status in ('requested', 'pending_user_approval', 'approved', 'active')
  ) then
    raise exception 'love_seat_request_exists';
  end if;

  insert into public.circle_love_seats (
    circle_id,
    featured_profile_id,
    status,
    reason,
    request_source,
    duration_hours,
    request_expires_at
  ) values (
    p_circle_id,
    p_profile_id,
    'requested',
    v_note,
    'member_request',
    24,
    v_now + interval '7 days'
  )
  returning * into v_request;

  return v_request;
end;
$$;

create or replace function public.rpc_get_my_circle_love_seat_request(
  p_circle_id uuid,
  p_profile_id uuid
)
returns table (
  id uuid,
  circle_id uuid,
  status text,
  note text,
  created_at timestamptz,
  request_expires_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
begin
  if auth.uid() is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.profiles p
    where p.id = p_profile_id
      and p.user_id = auth.uid()
      and p.deleted_at is null
  ) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  perform public.cleanup_stale_circle_love_seats(p_circle_id);

  return query
  select cls.id, cls.circle_id, cls.status, cls.reason, cls.created_at, cls.request_expires_at
  from public.circle_love_seats cls
  where cls.circle_id = p_circle_id
    and cls.featured_profile_id = p_profile_id
    and cls.status = 'requested'
  order by cls.created_at desc
  limit 1;
end;
$$;

create or replace function public.rpc_cancel_circle_love_seat_request(
  p_request_id uuid,
  p_profile_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
begin
  if auth.uid() is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.profiles p
    where p.id = p_profile_id
      and p.user_id = auth.uid()
      and p.deleted_at is null
  ) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  update public.circle_love_seats cls
  set status = 'archived',
      responded_at = timezone('utc', now())
  where cls.id = p_request_id
    and cls.featured_profile_id = p_profile_id
    and cls.status = 'requested';

  if not found then
    raise exception 'love_seat_request_not_found';
  end if;

  return true;
end;
$$;

create or replace function public.rpc_list_circle_love_seat_requests_for_host(
  p_circle_id uuid,
  p_actor_profile_id uuid
)
returns table (
  id uuid,
  circle_id uuid,
  featured_profile_id uuid,
  featured_profile_name text,
  featured_profile_avatar_url text,
  note text,
  created_at timestamptz,
  request_expires_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
begin
  if auth.uid() is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.profiles p
    where p.id = p_actor_profile_id
      and p.user_id = auth.uid()
      and p.deleted_at is null
  ) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  if not public.can_manage_circle_pulse(p_circle_id, auth.uid()) then
    raise exception 'host_required' using errcode = '42501';
  end if;

  perform public.cleanup_stale_circle_love_seats(p_circle_id);

  return query
  select
    cls.id,
    cls.circle_id,
    cls.featured_profile_id,
    coalesce(nullif(btrim(p.full_name), ''), 'Circle member'),
    p.avatar_url,
    cls.reason,
    cls.created_at,
    cls.request_expires_at
  from public.circle_love_seats cls
  join public.profiles p on p.id = cls.featured_profile_id
  where cls.circle_id = p_circle_id
    and cls.status = 'requested'
  order by cls.created_at asc;
end;
$$;

create or replace function public.rpc_select_circle_love_seat_request(
  p_request_id uuid,
  p_actor_profile_id uuid,
  p_duration_hours smallint default 24,
  p_quote text default null
)
returns public.circle_love_seats
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  v_request public.circle_love_seats%rowtype;
  v_quote text := nullif(btrim(coalesce(p_quote, '')), '');
  v_now timestamptz := timezone('utc', now());
begin
  if auth.uid() is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;

  if p_duration_hours not in (12, 24, 48) then
    raise exception 'love_seat_duration_invalid';
  end if;

  if v_quote is not null and char_length(v_quote) > 320 then
    raise exception 'quote_too_long';
  end if;

  if not exists (
    select 1 from public.profiles p
    where p.id = p_actor_profile_id
      and p.user_id = auth.uid()
      and p.deleted_at is null
  ) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  select * into v_request
  from public.circle_love_seats cls
  where cls.id = p_request_id
  for update;

  if v_request.id is null
    or v_request.status <> 'requested'
    or v_request.request_expires_at <= v_now then
    raise exception 'love_seat_request_not_found';
  end if;

  if not public.can_manage_circle_pulse(v_request.circle_id, auth.uid()) then
    raise exception 'host_required' using errcode = '42501';
  end if;

  perform public.cleanup_stale_circle_love_seats(v_request.circle_id);

  if exists (
    select 1 from public.circle_love_seats cls
    where cls.circle_id = v_request.circle_id
      and cls.id <> v_request.id
      and cls.status in ('pending_user_approval', 'approved', 'active')
  ) then
    raise exception 'circle_love_seat_active';
  end if;

  update public.circle_love_seats
  set status = 'pending_user_approval',
      nominated_by_profile_id = p_actor_profile_id,
      quote = v_quote,
      duration_hours = p_duration_hours,
      selected_at = v_now,
      request_expires_at = null,
      responded_at = null
  where id = v_request.id
  returning * into v_request;

  return v_request;
end;
$$;

create or replace function public.rpc_get_my_circle_love_seat_nominations(
  p_profile_id uuid,
  p_circle_id uuid default null
)
returns table (
  id uuid,
  circle_id uuid,
  circle_name text,
  featured_profile_id uuid,
  nominated_by_profile_id uuid,
  nominator_name text,
  quote text,
  reason text,
  status text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
begin
  if auth.uid() is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.profiles p
    where p.id = p_profile_id
      and p.user_id = auth.uid()
      and p.deleted_at is null
  ) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  return query
  select
    cls.id,
    cls.circle_id,
    c.name,
    cls.featured_profile_id,
    cls.nominated_by_profile_id,
    coalesce(nullif(btrim(nominator.full_name), ''), 'Circle host'),
    cls.quote,
    cls.reason,
    cls.status,
    cls.created_at
  from public.circle_love_seats cls
  join public.circles c on c.id = cls.circle_id
  left join public.profiles nominator on nominator.id = cls.nominated_by_profile_id
  where cls.featured_profile_id = p_profile_id
    and cls.status = 'pending_user_approval'
    and coalesce(cls.selected_at, cls.created_at) > timezone('utc', now()) - interval '24 hours'
    and (p_circle_id is null or cls.circle_id = p_circle_id)
  order by cls.created_at desc;
end;
$$;

create or replace function public.rpc_get_my_circle_love_seat_invitations_v2(
  p_profile_id uuid,
  p_circle_id uuid default null
)
returns table (
  id uuid,
  circle_id uuid,
  circle_name text,
  featured_profile_id uuid,
  nominated_by_profile_id uuid,
  nominator_name text,
  quote text,
  reason text,
  status text,
  duration_hours smallint,
  invitation_expires_at timestamptz,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
begin
  if auth.uid() is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.profiles p
    where p.id = p_profile_id
      and p.user_id = auth.uid()
      and p.deleted_at is null
  ) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  return query
  select
    cls.id,
    cls.circle_id,
    c.name,
    cls.featured_profile_id,
    cls.nominated_by_profile_id,
    coalesce(nullif(btrim(nominator.full_name), ''), 'Circle host'),
    cls.quote,
    cls.reason,
    cls.status,
    cls.duration_hours,
    coalesce(cls.selected_at, cls.created_at) + interval '24 hours',
    cls.created_at
  from public.circle_love_seats cls
  join public.circles c on c.id = cls.circle_id
  left join public.profiles nominator on nominator.id = cls.nominated_by_profile_id
  where cls.featured_profile_id = p_profile_id
    and cls.status = 'pending_user_approval'
    and coalesce(cls.selected_at, cls.created_at) > timezone('utc', now()) - interval '24 hours'
    and (p_circle_id is null or cls.circle_id = p_circle_id)
  order by cls.created_at desc;
end;
$$;

create or replace function public.rpc_respond_circle_love_seat(
  p_love_seat_id uuid,
  p_profile_id uuid,
  p_accept boolean
)
returns public.circle_love_seats
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  v_love_seat public.circle_love_seats%rowtype;
  v_now timestamptz := timezone('utc', now());
begin
  if auth.uid() is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.profiles p
    where p.id = p_profile_id
      and p.user_id = auth.uid()
      and p.deleted_at is null
  ) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  select * into v_love_seat
  from public.circle_love_seats cls
  where cls.id = p_love_seat_id
  for update;

  if v_love_seat.id is null then
    raise exception 'love_seat_not_found';
  end if;

  if v_love_seat.featured_profile_id <> p_profile_id then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  if v_love_seat.status <> 'pending_user_approval' then
    raise exception 'love_seat_already_answered';
  end if;

  if coalesce(v_love_seat.selected_at, v_love_seat.created_at) <= v_now - interval '24 hours' then
    raise exception 'love_seat_invitation_expired';
  end if;

  if coalesce(p_accept, false) and exists (
    select 1 from public.circle_love_seats cls
    where cls.circle_id = v_love_seat.circle_id
      and cls.status = 'active'
      and cls.id <> v_love_seat.id
  ) then
    raise exception 'circle_love_seat_active';
  end if;

  update public.circle_love_seats
  set status = case when coalesce(p_accept, false) then 'active' else 'declined' end,
      approved_by_profile_id = case when coalesce(p_accept, false) then p_profile_id else null end,
      starts_at = case when coalesce(p_accept, false) then v_now else starts_at end,
      ends_at = case
        when coalesce(p_accept, false) then v_now + make_interval(hours => duration_hours)
        else ends_at
      end,
      responded_at = v_now
  where id = p_love_seat_id
  returning * into v_love_seat;

  if coalesce(p_accept, false) then
    insert into public.circle_pulse_items (
      circle_id,
      item_type,
      love_seat_id,
      title,
      body,
      status,
      priority,
      starts_at,
      expires_at,
      created_by_profile_id,
      created_by_user_id
    ) values (
      v_love_seat.circle_id,
      'love_seat',
      v_love_seat.id,
      'Love Seat',
      v_love_seat.quote,
      'active',
      100,
      v_love_seat.starts_at,
      v_love_seat.ends_at,
      v_love_seat.nominated_by_profile_id,
      auth.uid()
    );
  end if;

  return v_love_seat;
end;
$$;

create or replace function public.notify_circle_love_seat_push()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
declare
  v_target_user_id uuid;
  v_circle_name text;
  v_featured_name text;
  v_event_type text;
  v_title text;
  v_body text;
begin
  select c.name into v_circle_name
  from public.circles c
  where c.id = new.circle_id
  limit 1;

  select p.full_name into v_featured_name
  from public.profiles p
  where p.id = new.featured_profile_id
  limit 1;

  if tg_op = 'INSERT' and new.status = 'requested' then
    for v_target_user_id in
      select distinct host_user_id
      from (
        select c.created_by_user_id as host_user_id
        from public.circles c
        where c.id = new.circle_id
        union all
        select coalesce(cm.user_id, p.user_id) as host_user_id
        from public.circle_members cm
        join public.profiles p on p.id = cm.profile_id
        where cm.circle_id = new.circle_id
          and cm.status = 'active'
          and lower(cm.role) in ('leader', 'host', 'admin', 'moderator')
      ) recipients
      where host_user_id is not null
    loop
      if not exists (
        select 1 from public.notification_prefs np
        where np.user_id = v_target_user_id and np.push_enabled = false
      ) and not public.is_quiet_hours(v_target_user_id) then
        perform private.send_push_webhook(jsonb_build_object(
          'user_id', v_target_user_id,
          'title', 'New private Love Seat request',
          'body', coalesce(nullif(btrim(v_featured_name), ''), 'A Circle member')
            || ' joined the private queue in ' || coalesce(v_circle_name, 'your Circle') || '.',
          'data', jsonb_build_object(
            'type', 'circle_love_seat',
            'event_type', 'request_received',
            'circle_id', new.circle_id,
            'love_seat_id', new.id
          )
        ));
      end if;
    end loop;
    return new;
  end if;

  if tg_op = 'INSERT' and new.status = 'pending_user_approval' then
    select p.user_id into v_target_user_id
    from public.profiles p where p.id = new.featured_profile_id limit 1;
    v_event_type := 'invitation';
    v_title := 'Step into the Love Seat?';
    v_body := coalesce(v_circle_name, 'Your Circle') || ' invited you to a thoughtful spotlight.';
  elsif tg_op = 'UPDATE' and old.status = 'requested' and new.status = 'pending_user_approval' then
    select p.user_id into v_target_user_id
    from public.profiles p where p.id = new.featured_profile_id limit 1;
    v_event_type := 'selected';
    v_title := 'You were selected for the Love Seat';
    v_body := coalesce(v_circle_name, 'Your Circle') || ' would love to feature you. Accept when you are ready.';
  elsif tg_op = 'UPDATE'
    and old.status = 'pending_user_approval'
    and new.status in ('active', 'declined') then
    select p.user_id into v_target_user_id
    from public.profiles p where p.id = new.nominated_by_profile_id limit 1;
    v_event_type := case when new.status = 'active' then 'accepted' else 'declined' end;
    v_title := case when new.status = 'active' then 'Love Seat accepted' else 'Love Seat invitation declined' end;
    v_body := coalesce(nullif(btrim(v_featured_name), ''), 'A Circle member')
      || case when new.status = 'active' then ' accepted the Love Seat invitation.' else ' declined the Love Seat invitation.' end;
  elsif tg_op = 'UPDATE'
    and old.status = 'pending_user_approval'
    and new.status = 'archived' then
    select p.user_id into v_target_user_id
    from public.profiles p where p.id = new.featured_profile_id limit 1;
    v_event_type := 'withdrawn';
    v_title := 'Love Seat invitation updated';
    v_body := 'The Love Seat invitation from ' || coalesce(v_circle_name, 'your Circle') || ' is no longer active.';
  elsif tg_op = 'UPDATE' and old.status = 'active' and new.status = 'ended' then
    select p.user_id into v_target_user_id
    from public.profiles p where p.id = new.nominated_by_profile_id limit 1;
    v_event_type := 'ended';
    v_title := 'Love Seat ended';
    v_body := coalesce(nullif(btrim(v_featured_name), ''), 'A Circle member') || ' left the Love Seat.';
  else
    return new;
  end if;

  if v_target_user_id is null then
    return new;
  end if;

  if exists (
    select 1 from public.notification_prefs np
    where np.user_id = v_target_user_id and np.push_enabled = false
  ) or public.is_quiet_hours(v_target_user_id) then
    return new;
  end if;

  perform private.send_push_webhook(jsonb_build_object(
    'user_id', v_target_user_id,
    'title', v_title,
    'body', v_body,
    'data', jsonb_build_object(
      'type', 'circle_love_seat',
      'event_type', v_event_type,
      'circle_id', new.circle_id,
      'love_seat_id', new.id
    )
  ));

  return new;
end;
$$;

revoke all on function public.cleanup_stale_circle_love_seats(uuid) from public, anon;
revoke all on function public.rpc_request_circle_love_seat(uuid, uuid, text) from public, anon;
revoke all on function public.rpc_get_my_circle_love_seat_request(uuid, uuid) from public, anon;
revoke all on function public.rpc_cancel_circle_love_seat_request(uuid, uuid) from public, anon;
revoke all on function public.rpc_list_circle_love_seat_requests_for_host(uuid, uuid) from public, anon;
revoke all on function public.rpc_select_circle_love_seat_request(uuid, uuid, smallint, text) from public, anon;
revoke all on function public.rpc_get_my_circle_love_seat_nominations(uuid, uuid) from public, anon;
revoke all on function public.rpc_get_my_circle_love_seat_invitations_v2(uuid, uuid) from public, anon;
revoke all on function public.rpc_respond_circle_love_seat(uuid, uuid, boolean) from public, anon;
revoke all on function public.notify_circle_love_seat_push() from public, anon, authenticated;

revoke all on function public.cleanup_stale_circle_love_seats(uuid) from authenticated;
grant execute on function public.cleanup_stale_circle_love_seats(uuid) to service_role;
grant execute on function public.rpc_request_circle_love_seat(uuid, uuid, text) to authenticated, service_role;
grant execute on function public.rpc_get_my_circle_love_seat_request(uuid, uuid) to authenticated, service_role;
grant execute on function public.rpc_cancel_circle_love_seat_request(uuid, uuid) to authenticated, service_role;
grant execute on function public.rpc_list_circle_love_seat_requests_for_host(uuid, uuid) to authenticated, service_role;
grant execute on function public.rpc_select_circle_love_seat_request(uuid, uuid, smallint, text) to authenticated, service_role;
grant execute on function public.rpc_get_my_circle_love_seat_nominations(uuid, uuid) to authenticated, service_role;
grant execute on function public.rpc_get_my_circle_love_seat_invitations_v2(uuid, uuid) to authenticated, service_role;
grant execute on function public.rpc_respond_circle_love_seat(uuid, uuid, boolean) to authenticated, service_role;
grant execute on function public.notify_circle_love_seat_push() to service_role;

comment on column public.circle_love_seats.duration_hours is
  'Accepted Love Seat visibility window. Supported values are 12, 24, and 48 hours.';

comment on function public.rpc_request_circle_love_seat(uuid, uuid, text) is
  'Creates a private seven-day Love Seat queue request for the authenticated Circle member.';

commit;
