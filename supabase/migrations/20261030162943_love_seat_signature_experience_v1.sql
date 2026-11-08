-- Love Seat Signature Experience V1: secure invalidation, cross-device ceremony
-- acknowledgement, shared duration nomination, and deterministic cleanup.
begin;

-- Content-free Realtime invalidation. Clients must refetch audience-scoped RPCs.
create table if not exists public.circle_love_seat_updates (
  circle_id uuid primary key references public.circles(id) on delete cascade,
  version bigint not null default 1,
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.circle_love_seat_updates enable row level security;
drop policy if exists circle_love_seat_updates_select_members on public.circle_love_seat_updates;
create policy circle_love_seat_updates_select_members
on public.circle_love_seat_updates for select to authenticated
using (
  public.is_circle_member(circle_id, auth.uid())
  or public.is_circle_owner(circle_id, auth.uid())
);

revoke all on public.circle_love_seat_updates from public, anon, authenticated;
grant select on public.circle_love_seat_updates to authenticated;

create or replace function public.touch_circle_love_seat_update(p_circle_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
begin
  if p_circle_id is null then return; end if;
  insert into public.circle_love_seat_updates(circle_id)
  values (p_circle_id)
  on conflict (circle_id) do update set
    version = public.circle_love_seat_updates.version + 1,
    updated_at = timezone('utc', now());
end;
$$;

create or replace function public.notify_circle_love_seat_update()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
begin
  if tg_op = 'DELETE' then
    perform public.touch_circle_love_seat_update(old.circle_id);
    return old;
  end if;
  perform public.touch_circle_love_seat_update(new.circle_id);
  return new;
end;
$$;

drop trigger if exists circle_love_seats_touch_update on public.circle_love_seats;
create trigger circle_love_seats_touch_update
after insert or update or delete on public.circle_love_seats
for each row execute function public.notify_circle_love_seat_update();

create or replace function public.notify_circle_love_seat_pulse_update()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
begin
  if tg_op = 'DELETE' then
    if old.item_type = 'love_seat' then
      perform public.touch_circle_love_seat_update(old.circle_id);
    end if;
    return old;
  end if;
  if new.item_type = 'love_seat' then
    perform public.touch_circle_love_seat_update(new.circle_id);
  end if;
  return new;
end;
$$;

drop trigger if exists circle_pulse_love_seat_touch_update on public.circle_pulse_items;
create trigger circle_pulse_love_seat_touch_update
after insert or update or delete on public.circle_pulse_items
for each row execute function public.notify_circle_love_seat_pulse_update();

revoke all on function public.touch_circle_love_seat_update(uuid) from public, anon, authenticated;
revoke all on function public.notify_circle_love_seat_update() from public, anon, authenticated;
revoke all on function public.notify_circle_love_seat_pulse_update() from public, anon, authenticated;
grant execute on function public.touch_circle_love_seat_update(uuid) to service_role;
grant execute on function public.notify_circle_love_seat_update() to service_role;
grant execute on function public.notify_circle_love_seat_pulse_update() to service_role;

-- Acknowledgement is server-owned and idempotent. No direct client table access.
create table if not exists public.circle_love_seat_arrival_acknowledgements (
  love_seat_id uuid not null references public.circle_love_seats(id) on delete cascade,
  circle_id uuid not null references public.circles(id) on delete cascade,
  viewer_profile_id uuid not null references public.profiles(id) on delete cascade,
  acknowledged_at timestamptz not null default timezone('utc', now()),
  primary key (love_seat_id, viewer_profile_id)
);

create index if not exists circle_love_seat_arrival_ack_circle_idx
  on public.circle_love_seat_arrival_acknowledgements(circle_id, viewer_profile_id);

alter table public.circle_love_seat_arrival_acknowledgements enable row level security;
revoke all on public.circle_love_seat_arrival_acknowledgements from public, anon, authenticated;
grant all on public.circle_love_seat_arrival_acknowledgements to service_role;

create or replace function public.rpc_get_circle_love_seat_arrival_acknowledged_v1(
  p_circle_id uuid,
  p_love_seat_id uuid,
  p_viewer_profile_id uuid
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
    where p.id = p_viewer_profile_id and p.user_id = auth.uid() and p.deleted_at is null
  ) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.circle_members cm
    where cm.circle_id = p_circle_id and cm.profile_id = p_viewer_profile_id
      and cm.status = 'active' and cm.is_visible is not false
  ) then
    raise exception 'circle_membership_required' using errcode = '42501';
  end if;
  return exists (
    select 1 from public.circle_love_seat_arrival_acknowledgements a
    where a.circle_id = p_circle_id and a.love_seat_id = p_love_seat_id
      and a.viewer_profile_id = p_viewer_profile_id
  );
end;
$$;

create or replace function public.rpc_acknowledge_circle_love_seat_arrival_v1(
  p_circle_id uuid,
  p_love_seat_id uuid,
  p_viewer_profile_id uuid
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
    where p.id = p_viewer_profile_id and p.user_id = auth.uid() and p.deleted_at is null
  ) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if not exists (
    select 1
    from public.circle_love_seats cls
    join public.circle_members cm on cm.circle_id = cls.circle_id
      and cm.profile_id = p_viewer_profile_id
      and cm.status = 'active' and cm.is_visible is not false
    where cls.id = p_love_seat_id and cls.circle_id = p_circle_id
      and cls.status = 'active'
      and (cls.ends_at is null or cls.ends_at > timezone('utc', now()))
  ) then
    raise exception 'active_love_seat_not_found' using errcode = '42501';
  end if;
  insert into public.circle_love_seat_arrival_acknowledgements(
    love_seat_id, circle_id, viewer_profile_id
  ) values (p_love_seat_id, p_circle_id, p_viewer_profile_id)
  on conflict (love_seat_id, viewer_profile_id) do nothing;
  return true;
end;
$$;

revoke all on function public.rpc_get_circle_love_seat_arrival_acknowledged_v1(uuid, uuid, uuid) from public, anon;
revoke all on function public.rpc_acknowledge_circle_love_seat_arrival_v1(uuid, uuid, uuid) from public, anon;
grant execute on function public.rpc_get_circle_love_seat_arrival_acknowledged_v1(uuid, uuid, uuid) to authenticated, service_role;
grant execute on function public.rpc_acknowledge_circle_love_seat_arrival_v1(uuid, uuid, uuid) to authenticated, service_role;

-- Versioned, content-minimal notification contract with stable lifecycle IDs.
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
  v_event_id text;
  v_title text;
  v_body text;
  v_payload jsonb;
begin
  select c.name into v_circle_name from public.circles c where c.id = new.circle_id limit 1;
  select p.full_name into v_featured_name from public.profiles p where p.id = new.featured_profile_id limit 1;

  if tg_op = 'INSERT' and new.status = 'requested' then
    v_event_type := 'request_received';
    v_event_id := new.id::text || ':' || v_event_type || ':' || extract(epoch from new.updated_at)::text;
    v_payload := jsonb_build_object(
      'payload_version', 1,
      'event_id', v_event_id,
      'type', 'circle_love_seat',
      'event_type', v_event_type,
      'circle_id', new.circle_id,
      'love_seat_id', new.id
    );
    for v_target_user_id in
      select distinct host_user_id
      from (
        select c.created_by_user_id as host_user_id from public.circles c where c.id = new.circle_id
        union all
        select coalesce(cm.user_id, p.user_id)
        from public.circle_members cm
        join public.profiles p on p.id = cm.profile_id
        where cm.circle_id = new.circle_id and cm.status = 'active'
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
          'data', v_payload
        ));
      end if;
    end loop;
    return new;
  end if;

  if tg_op = 'INSERT' and new.status = 'pending_user_approval' then
    select p.user_id into v_target_user_id from public.profiles p where p.id = new.featured_profile_id limit 1;
    v_event_type := 'invitation';
    v_title := 'Step into the Love Seat?';
    v_body := coalesce(v_circle_name, 'Your Circle') || ' invited you to a thoughtful spotlight.';
  elsif tg_op = 'UPDATE' and old.status = 'requested' and new.status = 'pending_user_approval' then
    select p.user_id into v_target_user_id from public.profiles p where p.id = new.featured_profile_id limit 1;
    v_event_type := 'selected';
    v_title := 'You were selected for the Love Seat';
    v_body := coalesce(v_circle_name, 'Your Circle') || ' would love to feature you. Accept when you are ready.';
  elsif tg_op = 'UPDATE' and old.status = 'pending_user_approval' and new.status in ('active', 'declined') then
    select p.user_id into v_target_user_id from public.profiles p where p.id = new.nominated_by_profile_id limit 1;
    v_event_type := case when new.status = 'active' then 'accepted' else 'declined' end;
    v_title := case when new.status = 'active' then 'Love Seat accepted' else 'Love Seat invitation declined' end;
    v_body := coalesce(nullif(btrim(v_featured_name), ''), 'A Circle member')
      || case when new.status = 'active' then ' accepted the Love Seat invitation.' else ' declined the Love Seat invitation.' end;
  elsif tg_op = 'UPDATE' and old.status = 'pending_user_approval' and new.status = 'archived' then
    select p.user_id into v_target_user_id from public.profiles p where p.id = new.featured_profile_id limit 1;
    v_event_type := 'withdrawn';
    v_title := 'Love Seat invitation updated';
    v_body := 'The Love Seat invitation from ' || coalesce(v_circle_name, 'your Circle') || ' is no longer active.';
  elsif tg_op = 'UPDATE' and old.status = 'active' and new.status = 'ended' then
    select p.user_id into v_target_user_id from public.profiles p where p.id = new.nominated_by_profile_id limit 1;
    v_event_type := 'ended';
    v_title := 'Love Seat ended';
    v_body := coalesce(nullif(btrim(v_featured_name), ''), 'A Circle member') || ' left the Love Seat.';
  else
    return new;
  end if;

  if v_target_user_id is null then return new; end if;
  if exists (
    select 1 from public.notification_prefs np
    where np.user_id = v_target_user_id and np.push_enabled = false
  ) or public.is_quiet_hours(v_target_user_id) then
    return new;
  end if;

  v_event_id := new.id::text || ':' || v_event_type || ':' || extract(epoch from new.updated_at)::text;
  perform private.send_push_webhook(jsonb_build_object(
    'user_id', v_target_user_id,
    'title', v_title,
    'body', v_body,
    'data', jsonb_build_object(
      'payload_version', 1,
      'event_id', v_event_id,
      'type', 'circle_love_seat',
      'event_type', v_event_type,
      'circle_id', new.circle_id,
      'love_seat_id', new.id
    )
  ));
  return new;
end;
$$;

revoke all on function public.notify_circle_love_seat_push() from public, anon, authenticated;
grant execute on function public.notify_circle_love_seat_push() to service_role;

-- Direct host invitations use the same duration model as queue selections.
create or replace function public.rpc_nominate_circle_love_seat_v2(
  p_circle_id uuid,
  p_actor_profile_id uuid,
  p_featured_profile_id uuid,
  p_quote text default null,
  p_duration_hours smallint default 24
)
returns public.circle_love_seats
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  v_love_seat public.circle_love_seats%rowtype;
begin
  if p_duration_hours not in (12, 24, 48) then
    raise exception 'love_seat_duration_invalid';
  end if;
  select public.rpc_nominate_circle_love_seat(
    p_circle_id, p_actor_profile_id, p_featured_profile_id, p_quote, null::text
  ) into v_love_seat;
  update public.circle_love_seats
  set duration_hours = p_duration_hours,
      selected_at = coalesce(selected_at, timezone('utc', now()))
  where id = v_love_seat.id
  returning * into v_love_seat;
  return v_love_seat;
end;
$$;

revoke all on function public.rpc_nominate_circle_love_seat_v2(uuid, uuid, uuid, text, smallint) from public, anon;
grant execute on function public.rpc_nominate_circle_love_seat_v2(uuid, uuid, uuid, text, smallint) to authenticated, service_role;

-- Tighten legacy Love Seat RPC grants while retaining authenticated compatibility.
revoke all on function public.rpc_nominate_circle_love_seat(uuid, uuid, uuid, text, text) from public, anon;
revoke all on function public.rpc_cancel_circle_love_seat_nomination(uuid, uuid) from public, anon;
revoke all on function public.rpc_end_circle_love_seat(uuid, uuid) from public, anon;
revoke all on function public.rpc_list_circle_love_seats_for_host(uuid, uuid) from public, anon;
grant execute on function public.rpc_nominate_circle_love_seat(uuid, uuid, uuid, text, text) to authenticated, service_role;
grant execute on function public.rpc_cancel_circle_love_seat_nomination(uuid, uuid) to authenticated, service_role;
grant execute on function public.rpc_end_circle_love_seat(uuid, uuid) to authenticated, service_role;
grant execute on function public.rpc_list_circle_love_seats_for_host(uuid, uuid) to authenticated, service_role;

-- Publish only the content-free invalidation table.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'circle_love_seat_updates'
  ) then
    alter publication supabase_realtime add table public.circle_love_seat_updates;
  end if;
end;
$$;

-- Deterministic lifecycle cleanup. Keep RPC-level cleanup as a second line of defence.
do $$
declare
  v_job_id bigint;
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    for v_job_id in execute
      'select jobid from cron.job where jobname = ''circle-love-seat-cleanup-v1'''
    loop
      execute format('select cron.unschedule(%s)', v_job_id);
    end loop;
    execute $schedule$
      select cron.schedule(
        'circle-love-seat-cleanup-v1',
        '*/5 * * * *',
        'select public.cleanup_stale_circle_love_seats(null);'
      )
    $schedule$;
  end if;
end;
$$;

comment on table public.circle_love_seat_updates is
  'Content-free Love Seat lifecycle invalidation; clients refetch authorized RPC snapshots.';
comment on table public.circle_love_seat_arrival_acknowledgements is
  'Server-owned idempotent record preventing repeat Love Seat ceremonies across devices.';

commit;
