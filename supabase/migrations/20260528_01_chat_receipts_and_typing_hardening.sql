alter table public.messages
  add column if not exists read_at timestamptz;

update public.messages
set read_at = coalesce(read_at, delivered_at, created_at)
where is_read = true
  and read_at is null;

alter table public.messages
  drop constraint if exists messages_read_requires_timestamp;

alter table public.messages
  add constraint messages_read_requires_timestamp
  check (not is_read or read_at is not null);

create or replace function public.normalize_message_receipt_update()
returns trigger
language plpgsql
set search_path = public, pg_catalog
as $$
begin
  if auth.uid() is not null
    and auth.uid() = old.receiver_id
    and auth.uid() <> old.sender_id then
    if (
      to_jsonb(new) - array['is_read', 'read_at', 'delivered_at']::text[]
    ) is distinct from (
      to_jsonb(old) - array['is_read', 'read_at', 'delivered_at']::text[]
    ) then
      raise exception 'receiver_can_only_update_receipt_fields';
    end if;

    if old.delivered_at is not null and new.delivered_at is distinct from old.delivered_at then
      raise exception 'delivered_at_is_immutable';
    end if;

    if old.read_at is not null and new.read_at is distinct from old.read_at then
      raise exception 'read_at_is_immutable';
    end if;

    if old.is_read = true and coalesce(new.is_read, false) = false then
      raise exception 'cannot_unread_message';
    end if;

    if new.read_at is not null and new.delivered_at is null then
      new.delivered_at := coalesce(old.delivered_at, new.read_at);
    end if;

    if coalesce(new.is_read, false) = true or new.read_at is not null then
      new.is_read := true;
      new.read_at := coalesce(old.read_at, new.read_at, new.delivered_at, now());
    end if;

    if new.read_at is not null and new.delivered_at is not null and new.read_at < new.delivered_at then
      new.read_at := new.delivered_at;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists messages_normalize_receipts_before_update on public.messages;

create trigger messages_normalize_receipts_before_update
before update on public.messages
for each row
execute function public.normalize_message_receipt_update();

drop function if exists public.rpc_acknowledge_messages_delivered(uuid, uuid);

create or replace function public.rpc_acknowledge_messages_delivered(
  p_peer_user_id uuid default null,
  p_message_id uuid default null
)
returns integer
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_user_id uuid := auth.uid();
  v_count integer := 0;
begin
  if v_user_id is null then
    raise exception 'unauthenticated';
  end if;

  update public.messages
  set delivered_at = coalesce(delivered_at, now())
  where receiver_id = v_user_id
    and sender_id <> v_user_id
    and delivered_at is null
    and (p_message_id is null or id = p_message_id)
    and (p_peer_user_id is null or sender_id = p_peer_user_id);

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

drop function if exists public.rpc_mark_message_read(uuid);

create or replace function public.rpc_mark_message_read(
  p_message_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_user_id uuid := auth.uid();
  v_count integer := 0;
begin
  if v_user_id is null then
    raise exception 'unauthenticated';
  end if;

  update public.messages
  set delivered_at = coalesce(delivered_at, now()),
      read_at = coalesce(read_at, now()),
      is_read = true
  where id = p_message_id
    and receiver_id = v_user_id;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

grant execute on function public.rpc_acknowledge_messages_delivered(uuid, uuid) to authenticated;
grant execute on function public.rpc_mark_message_read(uuid) to authenticated;

alter table public.chat_typing_state
  drop constraint if exists chat_typing_state_typing_until_bounds;

alter table public.chat_typing_state
  add constraint chat_typing_state_typing_until_bounds
  check (
    typing_until is null
    or (
      typing_until >= updated_at - interval '5 seconds'
      and typing_until <= updated_at + interval '15 seconds'
    )
  );

create index if not exists idx_chat_typing_state_peer_typing_until
  on public.chat_typing_state (peer_user_id, typing_until desc, updated_at desc);

drop function if exists public.rpc_set_chat_typing_state(uuid, boolean, integer);

create or replace function public.rpc_set_chat_typing_state(
  p_peer_user_id uuid,
  p_typing boolean,
  p_typing_for_ms integer default 5000
)
returns integer
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_user_id uuid := auth.uid();
  v_count integer := 0;
  v_now timestamptz := now();
  v_typing_for_ms integer := greatest(1000, least(coalesce(p_typing_for_ms, 5000), 8000));
  v_typing_until timestamptz;
begin
  if v_user_id is null then
    raise exception 'unauthenticated';
  end if;

  if p_peer_user_id is null or p_peer_user_id = v_user_id then
    raise exception 'invalid_peer';
  end if;

  delete from public.chat_typing_state
  where typing_until is not null
    and typing_until < v_now - interval '30 seconds';

  if coalesce(p_typing, false) = false then
    delete from public.chat_typing_state
    where user_id = v_user_id
      and peer_user_id = p_peer_user_id;

    get diagnostics v_count = row_count;
    return v_count;
  end if;

  v_typing_until := v_now + ((v_typing_for_ms::text || ' milliseconds')::interval);

  insert into public.chat_typing_state (
    user_id,
    peer_user_id,
    typing_until,
    updated_at
  )
  values (
    v_user_id,
    p_peer_user_id,
    v_typing_until,
    v_now
  )
  on conflict (user_id, peer_user_id) do update
  set typing_until = excluded.typing_until,
      updated_at = excluded.updated_at;

  return 1;
end;
$$;

grant execute on function public.rpc_set_chat_typing_state(uuid, boolean, integer) to authenticated;
