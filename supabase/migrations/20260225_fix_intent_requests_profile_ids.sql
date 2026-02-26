-- Fix intent_requests to use profile IDs (profiles.id) while authenticating via auth.uid() == profiles.user_id.
--
-- The original intent_requests migration mixed auth user IDs and profile IDs, which can break sending/reading intents
-- when profiles.id != profiles.user_id (the normal case in this app).

-- RLS: allow reading intents if the authed user owns either the actor or recipient profile.
alter table public.intent_requests enable row level security;

drop policy if exists "Intent requests read" on public.intent_requests;
create policy "Intent requests read"
on public.intent_requests
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles pr
    where pr.id = intent_requests.recipient_id
      and pr.user_id = auth.uid()
  )
  or exists (
    select 1
    from public.profiles pa
    where pa.id = intent_requests.actor_id
      and pa.user_id = auth.uid()
  )
);

-- Inserts are expected to go through RPCs, but keep a safe policy for completeness.
drop policy if exists "Intent requests insert" on public.intent_requests;
create policy "Intent requests insert"
on public.intent_requests
for insert
to authenticated
with check (
  recipient_id <> actor_id
  and exists (
    select 1
    from public.profiles pa
    where pa.id = intent_requests.actor_id
      and pa.user_id = auth.uid()
  )
);

create or replace function public.rpc_create_intent_request(
  p_recipient_id uuid,
  p_type text,
  p_message text default null,
  p_suggested_time timestamptz default null,
  p_suggested_place text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_actor_user_id uuid;
  v_actor_profile_id uuid;
  v_recipient_user_id uuid;
  v_existing_id uuid;
  v_expires_at timestamptz;
  v_today_count integer;
begin
  v_actor_user_id := auth.uid();
  if v_actor_user_id is null then
    raise exception 'Not authenticated';
  end if;

  select p.id
    into v_actor_profile_id
  from public.profiles p
  where p.user_id = v_actor_user_id
  limit 1;

  if v_actor_profile_id is null then
    raise exception 'Profile not found';
  end if;

  if p_recipient_id = v_actor_profile_id then
    raise exception 'Cannot request yourself';
  end if;

  select p.user_id
    into v_recipient_user_id
  from public.profiles p
  where p.id = p_recipient_id
  limit 1;

  if v_recipient_user_id is null then
    raise exception 'Recipient not found';
  end if;

  -- Blocks are stored by user_id, not profile_id.
  if exists (
    select 1
    from public.blocks b
    where (b.blocker_id = v_recipient_user_id and b.blocked_id = v_actor_user_id)
       or (b.blocker_id = v_actor_user_id and b.blocked_id = v_recipient_user_id)
  ) then
    raise exception 'Blocked';
  end if;

  update public.intent_requests
  set status = 'expired'
  where status = 'pending'
    and expires_at < now()
    and recipient_id = p_recipient_id
    and actor_id = v_actor_profile_id
    and type = p_type;

  select id
    into v_existing_id
  from public.intent_requests
  where recipient_id = p_recipient_id
    and actor_id = v_actor_profile_id
    and type = p_type
    and status = 'pending'
  limit 1;

  if v_existing_id is not null then
    return v_existing_id;
  end if;

  select count(*)
    into v_today_count
  from public.intent_requests
  where actor_id = v_actor_profile_id
    and type = p_type
    and created_at >= date_trunc('day', now());

  if p_type = 'connect' and v_today_count >= 20 then
    raise exception 'Connect quota exceeded';
  end if;
  if p_type = 'date_request' and v_today_count >= 5 then
    raise exception 'Date request quota exceeded';
  end if;

  v_expires_at := case p_type
    when 'date_request' then now() + interval '24 hours'
    when 'like_with_note' then now() + interval '72 hours'
    else now() + interval '48 hours'
  end;

  insert into public.intent_requests (
    recipient_id,
    actor_id,
    type,
    message,
    suggested_time,
    suggested_place,
    status,
    created_at,
    expires_at,
    metadata
  )
  values (
    p_recipient_id,
    v_actor_profile_id,
    p_type,
    p_message,
    p_suggested_time,
    p_suggested_place,
    'pending',
    now(),
    v_expires_at,
    coalesce(p_metadata, '{}'::jsonb)
  )
  returning id into v_existing_id;

  return v_existing_id;
end;
$$;

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
  returning id into v_id;

  if v_id is null then
    raise exception 'Request not found or expired';
  end if;

  return v_id;
end;
$$;

create or replace function public.rpc_cancel_intent_request(
  p_request_id uuid
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
begin
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
  set status = 'cancelled'
  where id = p_request_id
    and actor_id = v_profile_id
    and status = 'pending'
  returning id into v_id;

  if v_id is null then
    raise exception 'Request not found or not cancellable';
  end if;

  return v_id;
end;
$$;

grant execute on function public.rpc_create_intent_request(uuid, text, text, timestamptz, text, jsonb) to authenticated;
grant execute on function public.rpc_decide_intent_request(uuid, text) to authenticated;
grant execute on function public.rpc_cancel_intent_request(uuid) to authenticated;
