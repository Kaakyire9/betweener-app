-- Make intent acceptance authoritative.
--
-- Any surface that accepts an intent request should create the accepted match
-- and enqueue a durable "It's a match" celebration for both profiles.

create table if not exists public.match_celebration_events (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  recipient_user_id uuid not null references auth.users(id) on delete cascade,
  recipient_profile_id uuid not null references public.profiles(id) on delete cascade,
  peer_user_id uuid not null references auth.users(id) on delete cascade,
  peer_profile_id uuid not null references public.profiles(id) on delete cascade,
  seen_at timestamptz null,
  created_at timestamptz not null default timezone('utc'::text, now()),
  constraint match_celebration_events_unique unique (match_id, recipient_user_id)
);

create index if not exists match_celebration_events_recipient_seen_idx
  on public.match_celebration_events (recipient_user_id, seen_at, created_at desc);

alter table public.match_celebration_events enable row level security;

drop policy if exists match_celebration_events_select_own on public.match_celebration_events;
create policy match_celebration_events_select_own
on public.match_celebration_events
for select
to authenticated
using (recipient_user_id = auth.uid());

revoke all on public.match_celebration_events from anon, authenticated;
grant select on public.match_celebration_events to authenticated;

create or replace function public.rpc_mark_match_celebration_seen(
  p_event_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  update public.match_celebration_events
  set seen_at = coalesce(seen_at, now())
  where id = p_event_id
    and recipient_user_id = auth.uid();

  return found;
end;
$$;

revoke all on function public.rpc_mark_match_celebration_seen(uuid) from public;
grant execute on function public.rpc_mark_match_celebration_seen(uuid) to authenticated;

create or replace function public.trg_insert_match_celebration_events()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_user1_id uuid;
  v_user2_id uuid;
begin
  if new.status::text <> 'ACCEPTED' then
    return new;
  end if;

  if tg_op = 'UPDATE' and old.status::text = 'ACCEPTED' then
    return new;
  end if;

  select p.user_id
    into v_user1_id
  from public.profiles p
  where p.id = new.user1_id
  limit 1;

  select p.user_id
    into v_user2_id
  from public.profiles p
  where p.id = new.user2_id
  limit 1;

  if v_user1_id is null or v_user2_id is null then
    return new;
  end if;

  insert into public.match_celebration_events (
    match_id,
    recipient_user_id,
    recipient_profile_id,
    peer_user_id,
    peer_profile_id
  )
  values
    (new.id, v_user1_id, new.user1_id, v_user2_id, new.user2_id),
    (new.id, v_user2_id, new.user2_id, v_user1_id, new.user1_id)
  on conflict (match_id, recipient_user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists insert_match_celebration_events on public.matches;
create trigger insert_match_celebration_events
after insert or update of status on public.matches
for each row
execute function public.trg_insert_match_celebration_events();

create or replace function public.rpc_decide_intent_request(
  p_request_id uuid,
  p_decision text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_user_id uuid;
  v_profile_id uuid;
  v_id uuid;
  v_actor_profile_id uuid;
  v_recipient_profile_id uuid;
  v_match_id uuid;
  v_user1_profile_id uuid;
  v_user2_profile_id uuid;
begin
  if p_decision not in ('accept','pass') then
    raise exception 'Invalid decision';
  end if;

  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  select p.id
    into v_profile_id
  from public.profiles p
  where p.user_id = v_user_id
  limit 1;

  if v_profile_id is null then
    raise exception 'Profile not found';
  end if;

  update public.intent_requests
  set status = case when p_decision = 'accept' then 'accepted' else 'passed' end
  where id = p_request_id
    and recipient_id = v_profile_id
    and status = 'pending'
    and expires_at > now()
  returning id, actor_id, recipient_id
    into v_id, v_actor_profile_id, v_recipient_profile_id;

  if v_id is null then
    raise exception 'Request not found or expired';
  end if;

  if p_decision = 'accept' then
    if v_actor_profile_id::text < v_recipient_profile_id::text then
      v_user1_profile_id := v_actor_profile_id;
      v_user2_profile_id := v_recipient_profile_id;
    else
      v_user1_profile_id := v_recipient_profile_id;
      v_user2_profile_id := v_actor_profile_id;
    end if;

    select m.id
      into v_match_id
    from public.matches m
    where (m.user1_id = v_actor_profile_id and m.user2_id = v_recipient_profile_id)
       or (m.user1_id = v_recipient_profile_id and m.user2_id = v_actor_profile_id)
    limit 1
    for update;

    if v_match_id is null then
      begin
        insert into public.matches (user1_id, user2_id, status, created_at, updated_at)
        values (v_user1_profile_id, v_user2_profile_id, 'ACCEPTED'::match_status, now(), now())
        returning id into v_match_id;
      exception when unique_violation then
        select m.id
          into v_match_id
        from public.matches m
        where (m.user1_id = v_actor_profile_id and m.user2_id = v_recipient_profile_id)
           or (m.user1_id = v_recipient_profile_id and m.user2_id = v_actor_profile_id)
        limit 1
        for update;
      end;
    end if;

    if v_match_id is not null then
      update public.matches
      set status = 'ACCEPTED'::match_status,
          updated_at = now()
      where id = v_match_id
        and status::text <> 'ACCEPTED';
    end if;

    update public.intent_requests
    set status = 'passed'
    where status = 'pending'
      and expires_at > now()
      and id <> p_request_id
      and (
        (actor_id = v_actor_profile_id and recipient_id = v_recipient_profile_id)
        or (actor_id = v_recipient_profile_id and recipient_id = v_actor_profile_id)
      );
  end if;

  return v_id;
end;
$$;

grant execute on function public.rpc_decide_intent_request(uuid, text) to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1
       from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'match_celebration_events'
     ) then
    alter publication supabase_realtime add table public.match_celebration_events;
  end if;
exception
  when duplicate_object then null;
end;
$$;
