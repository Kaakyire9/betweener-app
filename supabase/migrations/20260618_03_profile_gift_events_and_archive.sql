-- Add gift event analytics and explicit archive lifecycle operations.

create table if not exists public.profile_gift_events (
  id uuid primary key default gen_random_uuid(),
  gift_id uuid not null references public.profile_gifts(id) on delete cascade,
  actor_user_id uuid not null references auth.users(id) on delete cascade,
  actor_profile_id uuid references public.profiles(id) on delete set null,
  recipient_profile_id uuid not null references public.profiles(id) on delete cascade,
  sender_profile_id uuid references public.profiles(id) on delete set null,
  event_type text not null check (event_type in ('sent', 'revealed', 'archived', 'sender_profile_opened', 'recipient_profile_opened')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists profile_gift_events_gift_created_idx
  on public.profile_gift_events (gift_id, created_at desc);

create index if not exists profile_gift_events_recipient_type_created_idx
  on public.profile_gift_events (recipient_profile_id, event_type, created_at desc);

alter table public.profile_gift_events enable row level security;
revoke all on public.profile_gift_events from anon, authenticated;

create or replace function public.rpc_log_profile_gift_event(
  p_gift_id uuid,
  p_event_type text,
  p_metadata jsonb default '{}'::jsonb
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_gift public.profile_gifts%rowtype;
  v_actor_profile_id uuid;
  v_actor_profile_user_id uuid;
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  if coalesce(nullif(btrim(p_event_type), ''), '') not in ('sent', 'revealed', 'archived', 'sender_profile_opened', 'recipient_profile_opened') then
    raise exception 'invalid_profile_gift_event_type' using errcode = '22023';
  end if;

  select g.*
    into v_gift
  from public.profile_gifts g
  where g.id = p_gift_id
  limit 1;

  if v_gift.id is null then
    raise exception 'gift not found' using errcode = 'P0002';
  end if;

  select p.id, p.user_id
    into v_actor_profile_id, v_actor_profile_user_id
  from public.profiles p
  where p.user_id = auth.uid()
    and p.deleted_at is null
  limit 1;

  if p_event_type in ('sent', 'recipient_profile_opened') and v_gift.sender_id <> auth.uid() then
    raise exception 'gift sender required' using errcode = '42501';
  end if;

  if p_event_type in ('revealed', 'archived', 'sender_profile_opened') and not exists (
    select 1
    from public.profiles recipient
    where recipient.id = v_gift.profile_id
      and recipient.user_id = auth.uid()
      and recipient.deleted_at is null
  ) then
    raise exception 'gift recipient required' using errcode = '42501';
  end if;

  insert into public.profile_gift_events (
    gift_id,
    actor_user_id,
    actor_profile_id,
    recipient_profile_id,
    sender_profile_id,
    event_type,
    metadata
  )
  values (
    v_gift.id,
    auth.uid(),
    v_actor_profile_id,
    v_gift.profile_id,
    v_gift.sender_profile_id,
    p_event_type,
    coalesce(p_metadata, '{}'::jsonb)
  );

  return true;
end;
$$;

create or replace function public.rpc_send_profile_gift(
  p_recipient_profile_id uuid,
  p_gift_type text,
  p_include_sandbox_preview boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_sender_profile public.profiles%rowtype;
  v_recipient_profile public.profiles%rowtype;
  v_resolved_plan public.subscription_type := 'FREE';
  v_gift_id uuid;
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  if p_gift_type not in ('rose', 'teddy', 'ring') then
    raise exception 'invalid gift type' using errcode = '22023';
  end if;

  select p.*
    into v_sender_profile
  from public.profiles p
  where p.user_id = auth.uid()
    and p.deleted_at is null
  limit 1;

  if v_sender_profile.id is null then
    raise exception 'profile required' using errcode = '42501';
  end if;

  select p.*
    into v_recipient_profile
  from public.profiles p
  where p.id = p_recipient_profile_id
    and p.deleted_at is null
  limit 1;

  if v_recipient_profile.id is null then
    raise exception 'recipient profile not found' using errcode = 'P0002';
  end if;

  if v_recipient_profile.user_id = auth.uid() then
    raise exception 'cannot send gift to yourself' using errcode = '22023';
  end if;

  if exists (
    select 1
    from public.profile_gifts g
    where g.profile_id = v_recipient_profile.id
      and g.sender_id = auth.uid()
      and g.created_at >= timezone('utc'::text, now()) - interval '6 hours'
  ) then
    raise exception 'gift cooldown active' using errcode = '23514';
  end if;

  v_resolved_plan := public.get_subscription_badge_plan(
    auth.uid(),
    coalesce(p_include_sandbox_preview, false)
  );

  if p_gift_type in ('rose', 'teddy') and v_resolved_plan not in ('SILVER', 'GOLD') then
    raise exception 'premium subscription required' using errcode = '42501';
  end if;

  if p_gift_type = 'ring' and v_resolved_plan <> 'GOLD' then
    raise exception 'gold subscription required' using errcode = '42501';
  end if;

  insert into public.profile_gifts (
    profile_id,
    sender_id,
    sender_profile_id,
    sender_display_name,
    sender_avatar_url,
    sender_gender,
    gift_type
  )
  values (
    v_recipient_profile.id,
    auth.uid(),
    v_sender_profile.id,
    coalesce(
      nullif(btrim(v_sender_profile.full_name), ''),
      nullif(btrim(v_sender_profile.username), ''),
      'Someone'
    ),
    v_sender_profile.avatar_url,
    v_sender_profile.gender::text,
    p_gift_type
  )
  returning id into v_gift_id;

  perform public.rpc_log_profile_gift_event(
    v_gift_id,
    'sent',
    jsonb_build_object(
      'gift_type', p_gift_type,
      'plan', v_resolved_plan
    )
  );

  return jsonb_build_object(
    'gift_id', v_gift_id,
    'gift_type', p_gift_type,
    'recipient_profile_id', v_recipient_profile.id,
    'plan', v_resolved_plan
  );
end;
$$;

create or replace function public.rpc_reveal_profile_gift(
  p_gift_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_row public.profile_gifts%rowtype;
  v_was_revealed_at timestamptz;
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select g.revealed_at
    into v_was_revealed_at
  from public.profile_gifts g
  where g.id = p_gift_id
    and exists (
      select 1
      from public.profiles recipient
      where recipient.id = g.profile_id
        and recipient.user_id = auth.uid()
        and recipient.deleted_at is null
    )
  limit 1;

  update public.profile_gifts g
  set opened_at = coalesce(g.opened_at, timezone('utc'::text, now())),
      revealed_at = coalesce(g.revealed_at, timezone('utc'::text, now()))
  where g.id = p_gift_id
    and exists (
      select 1
      from public.profiles recipient
      where recipient.id = g.profile_id
        and recipient.user_id = auth.uid()
        and recipient.deleted_at is null
    )
  returning g.* into v_row;

  if v_row.id is null then
    raise exception 'gift not found' using errcode = 'P0002';
  end if;

  if v_was_revealed_at is null then
    perform public.rpc_log_profile_gift_event(
      v_row.id,
      'revealed',
      jsonb_build_object('gift_type', v_row.gift_type)
    );
  end if;

  return jsonb_build_object(
    'gift_id', v_row.id,
    'opened_at', v_row.opened_at,
    'revealed_at', v_row.revealed_at,
    'archived_at', v_row.archived_at
  );
end;
$$;

create or replace function public.rpc_archive_profile_gift(
  p_gift_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_row public.profile_gifts%rowtype;
  v_was_archived_at timestamptz;
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select g.archived_at
    into v_was_archived_at
  from public.profile_gifts g
  where g.id = p_gift_id
    and exists (
      select 1
      from public.profiles recipient
      where recipient.id = g.profile_id
        and recipient.user_id = auth.uid()
        and recipient.deleted_at is null
    )
  limit 1;

  update public.profile_gifts g
  set opened_at = coalesce(g.opened_at, timezone('utc'::text, now())),
      revealed_at = coalesce(g.revealed_at, timezone('utc'::text, now())),
      archived_at = coalesce(g.archived_at, timezone('utc'::text, now()))
  where g.id = p_gift_id
    and exists (
      select 1
      from public.profiles recipient
      where recipient.id = g.profile_id
        and recipient.user_id = auth.uid()
        and recipient.deleted_at is null
    )
  returning g.* into v_row;

  if v_row.id is null then
    raise exception 'gift not found' using errcode = 'P0002';
  end if;

  if v_was_archived_at is null then
    perform public.rpc_log_profile_gift_event(
      v_row.id,
      'archived',
      jsonb_build_object('gift_type', v_row.gift_type)
    );
  end if;

  return jsonb_build_object(
    'gift_id', v_row.id,
    'opened_at', v_row.opened_at,
    'revealed_at', v_row.revealed_at,
    'archived_at', v_row.archived_at
  );
end;
$$;

revoke all on function public.rpc_log_profile_gift_event(uuid, text, jsonb) from public;
grant execute on function public.rpc_log_profile_gift_event(uuid, text, jsonb) to authenticated;

revoke all on function public.rpc_send_profile_gift(uuid, text, boolean) from public;
grant execute on function public.rpc_send_profile_gift(uuid, text, boolean) to authenticated;

revoke all on function public.rpc_reveal_profile_gift(uuid) from public;
grant execute on function public.rpc_reveal_profile_gift(uuid) to authenticated;

revoke all on function public.rpc_archive_profile_gift(uuid) from public;
grant execute on function public.rpc_archive_profile_gift(uuid) to authenticated;
