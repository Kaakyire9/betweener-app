create or replace function public.rpc_list_circle_love_seats_for_host(
  p_circle_id uuid,
  p_actor_profile_id uuid
)
returns table (
  id uuid,
  circle_id uuid,
  featured_profile_id uuid,
  featured_profile_name text,
  featured_profile_avatar_url text,
  quote text,
  status text,
  created_at timestamptz,
  responded_at timestamptz
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
    from public.profiles p
    where p.id = p_actor_profile_id
      and p.user_id = auth.uid()
      and p.deleted_at is null
  ) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  if not public.can_manage_circle_pulse(p_circle_id, auth.uid()) then
    raise exception 'host_required' using errcode = '42501';
  end if;

  return query
  select
    cls.id,
    cls.circle_id,
    cls.featured_profile_id,
    coalesce(nullif(btrim(featured.full_name), ''), 'Circle member') as featured_profile_name,
    featured.avatar_url as featured_profile_avatar_url,
    cls.quote,
    cls.status,
    cls.created_at,
    cls.responded_at
  from public.circle_love_seats cls
  join public.profiles featured on featured.id = cls.featured_profile_id
  where cls.circle_id = p_circle_id
    and cls.status in ('pending_user_approval', 'active')
  order by
    case cls.status when 'active' then 0 else 1 end,
    cls.created_at desc;
end;
$$;

create or replace function public.rpc_cancel_circle_love_seat_nomination(
  p_love_seat_id uuid,
  p_actor_profile_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_love_seat public.circle_love_seats%rowtype;
begin
  if auth.uid() is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.profiles p
    where p.id = p_actor_profile_id
      and p.user_id = auth.uid()
      and p.deleted_at is null
  ) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  select *
    into v_love_seat
  from public.circle_love_seats cls
  where cls.id = p_love_seat_id
  for update;

  if v_love_seat.id is null then
    raise exception 'love_seat_not_found';
  end if;

  if v_love_seat.status <> 'pending_user_approval' then
    raise exception 'pending_love_seat_not_found';
  end if;

  if not public.can_manage_circle_pulse(v_love_seat.circle_id, auth.uid()) then
    raise exception 'host_required' using errcode = '42501';
  end if;

  update public.circle_love_seats
  set status = 'archived',
      responded_at = timezone('utc'::text, now())
  where id = p_love_seat_id;

  return true;
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
  select c.name
    into v_circle_name
  from public.circles c
  where c.id = new.circle_id
  limit 1;

  select p.full_name
    into v_featured_name
  from public.profiles p
  where p.id = new.featured_profile_id
  limit 1;

  if tg_op = 'INSERT' and new.status = 'pending_user_approval' then
    select p.user_id
      into v_target_user_id
    from public.profiles p
    where p.id = new.featured_profile_id
    limit 1;

    v_event_type := 'invitation';
    v_title := 'Step into the Love Seat?';
    v_body := coalesce(v_circle_name, 'Your Circle') || ' invited you to a thoughtful spotlight.';
  elsif tg_op = 'UPDATE'
    and old.status = 'pending_user_approval'
    and new.status in ('active', 'declined') then
    select p.user_id
      into v_target_user_id
    from public.profiles p
    where p.id = new.nominated_by_profile_id
    limit 1;

    v_event_type := case when new.status = 'active' then 'accepted' else 'declined' end;
    v_title := case when new.status = 'active' then 'Love Seat accepted' else 'Love Seat invitation declined' end;
    v_body := coalesce(nullif(btrim(v_featured_name), ''), 'A Circle member')
      || case when new.status = 'active' then ' accepted the Love Seat invitation.' else ' declined the Love Seat invitation.' end;
  elsif tg_op = 'UPDATE'
    and old.status = 'pending_user_approval'
    and new.status = 'archived' then
    select p.user_id
      into v_target_user_id
    from public.profiles p
    where p.id = new.featured_profile_id
    limit 1;

    v_event_type := 'withdrawn';
    v_title := 'Love Seat invitation updated';
    v_body := 'The Love Seat invitation from ' || coalesce(v_circle_name, 'your Circle') || ' is no longer active.';
  elsif tg_op = 'UPDATE'
    and old.status = 'active'
    and new.status = 'ended' then
    select p.user_id
      into v_target_user_id
    from public.profiles p
    where p.id = new.nominated_by_profile_id
    limit 1;

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
    select 1
    from public.notification_prefs np
    where np.user_id = v_target_user_id
      and np.push_enabled = false
  ) then
    return new;
  end if;

  if public.is_quiet_hours(v_target_user_id) then
    return new;
  end if;

  perform private.send_push_webhook(
    jsonb_build_object(
      'user_id', v_target_user_id,
      'title', v_title,
      'body', v_body,
      'data', jsonb_build_object(
        'type', 'circle_love_seat',
        'event_type', v_event_type,
        'circle_id', new.circle_id,
        'love_seat_id', new.id
      )
    )
  );

  return new;
end;
$$;

drop trigger if exists notify_circle_love_seat_push on public.circle_love_seats;
create trigger notify_circle_love_seat_push
after insert or update of status on public.circle_love_seats
for each row execute function public.notify_circle_love_seat_push();

revoke all on function public.rpc_list_circle_love_seats_for_host(uuid, uuid) from public;
revoke all on function public.rpc_cancel_circle_love_seat_nomination(uuid, uuid) from public;

grant execute on function public.rpc_list_circle_love_seats_for_host(uuid, uuid) to authenticated;
grant execute on function public.rpc_cancel_circle_love_seat_nomination(uuid, uuid) to authenticated;
