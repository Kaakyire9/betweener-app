create index if not exists messages_conversation_created_idx
  on public.messages (sender_id, receiver_id, created_at desc, id desc);

create index if not exists messages_receiver_sender_unread_idx
  on public.messages (receiver_id, sender_id, created_at desc, id desc)
  where is_read = false;

create index if not exists message_reactions_message_created_idx
  on public.message_reactions (message_id, created_at desc, id desc);

create or replace function public.upsert_chat_conversation_summary_from_message(
  p_owner_user_id uuid,
  p_peer_user_id uuid,
  p_message_id uuid,
  p_unread_increment integer default 0
)
returns void
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_message public.messages%rowtype;
begin
  if p_owner_user_id is null
    or p_peer_user_id is null
    or p_message_id is null
    or p_owner_user_id = p_peer_user_id then
    return;
  end if;

  select message_row.*
    into v_message
  from public.messages message_row
  where message_row.id = p_message_id;

  if v_message.id is null then
    return;
  end if;

  insert into public.chat_conversation_summaries (
    owner_user_id,
    peer_user_id,
    last_message_id,
    last_message_text,
    last_message_created_at,
    last_message_sender_id,
    last_message_receiver_id,
    last_message_is_read,
    last_message_delivered_at,
    last_message_type,
    last_message_is_view_once,
    last_message_deleted_for_all,
    last_message_edited_at,
    unread_count,
    updated_at
  )
  values (
    p_owner_user_id,
    p_peer_user_id,
    v_message.id,
    v_message.text,
    v_message.created_at,
    v_message.sender_id,
    v_message.receiver_id,
    v_message.is_read,
    v_message.delivered_at,
    coalesce(v_message.message_type, 'text'),
    coalesce(v_message.is_view_once, false),
    coalesce(v_message.deleted_for_all, false),
    v_message.edited_at,
    greatest(coalesce(p_unread_increment, 0), 0),
    timezone('utc'::text, now())
  )
  on conflict (owner_user_id, peer_user_id) do update
  set last_message_id = case
        when excluded.last_message_created_at > coalesce(chat_conversation_summaries.last_message_created_at, '-infinity'::timestamptz)
          or (
            excluded.last_message_created_at = chat_conversation_summaries.last_message_created_at
            and excluded.last_message_id > chat_conversation_summaries.last_message_id
          )
        then excluded.last_message_id
        else chat_conversation_summaries.last_message_id
      end,
      last_message_text = case
        when excluded.last_message_created_at > coalesce(chat_conversation_summaries.last_message_created_at, '-infinity'::timestamptz)
          or (
            excluded.last_message_created_at = chat_conversation_summaries.last_message_created_at
            and excluded.last_message_id > chat_conversation_summaries.last_message_id
          )
        then excluded.last_message_text
        else chat_conversation_summaries.last_message_text
      end,
      last_message_created_at = greatest(
        coalesce(chat_conversation_summaries.last_message_created_at, '-infinity'::timestamptz),
        excluded.last_message_created_at
      ),
      last_message_sender_id = case
        when excluded.last_message_created_at > coalesce(chat_conversation_summaries.last_message_created_at, '-infinity'::timestamptz)
          or (
            excluded.last_message_created_at = chat_conversation_summaries.last_message_created_at
            and excluded.last_message_id > chat_conversation_summaries.last_message_id
          )
        then excluded.last_message_sender_id
        else chat_conversation_summaries.last_message_sender_id
      end,
      last_message_receiver_id = case
        when excluded.last_message_created_at > coalesce(chat_conversation_summaries.last_message_created_at, '-infinity'::timestamptz)
          or (
            excluded.last_message_created_at = chat_conversation_summaries.last_message_created_at
            and excluded.last_message_id > chat_conversation_summaries.last_message_id
          )
        then excluded.last_message_receiver_id
        else chat_conversation_summaries.last_message_receiver_id
      end,
      last_message_is_read = case
        when excluded.last_message_created_at > coalesce(chat_conversation_summaries.last_message_created_at, '-infinity'::timestamptz)
          or (
            excluded.last_message_created_at = chat_conversation_summaries.last_message_created_at
            and excluded.last_message_id > chat_conversation_summaries.last_message_id
          )
        then excluded.last_message_is_read
        else chat_conversation_summaries.last_message_is_read
      end,
      last_message_delivered_at = case
        when excluded.last_message_created_at > coalesce(chat_conversation_summaries.last_message_created_at, '-infinity'::timestamptz)
          or (
            excluded.last_message_created_at = chat_conversation_summaries.last_message_created_at
            and excluded.last_message_id > chat_conversation_summaries.last_message_id
          )
        then excluded.last_message_delivered_at
        else chat_conversation_summaries.last_message_delivered_at
      end,
      last_message_type = case
        when excluded.last_message_created_at > coalesce(chat_conversation_summaries.last_message_created_at, '-infinity'::timestamptz)
          or (
            excluded.last_message_created_at = chat_conversation_summaries.last_message_created_at
            and excluded.last_message_id > chat_conversation_summaries.last_message_id
          )
        then excluded.last_message_type
        else chat_conversation_summaries.last_message_type
      end,
      last_message_is_view_once = case
        when excluded.last_message_created_at > coalesce(chat_conversation_summaries.last_message_created_at, '-infinity'::timestamptz)
          or (
            excluded.last_message_created_at = chat_conversation_summaries.last_message_created_at
            and excluded.last_message_id > chat_conversation_summaries.last_message_id
          )
        then excluded.last_message_is_view_once
        else chat_conversation_summaries.last_message_is_view_once
      end,
      last_message_deleted_for_all = case
        when excluded.last_message_created_at > coalesce(chat_conversation_summaries.last_message_created_at, '-infinity'::timestamptz)
          or (
            excluded.last_message_created_at = chat_conversation_summaries.last_message_created_at
            and excluded.last_message_id > chat_conversation_summaries.last_message_id
          )
        then excluded.last_message_deleted_for_all
        else chat_conversation_summaries.last_message_deleted_for_all
      end,
      last_message_edited_at = case
        when excluded.last_message_created_at > coalesce(chat_conversation_summaries.last_message_created_at, '-infinity'::timestamptz)
          or (
            excluded.last_message_created_at = chat_conversation_summaries.last_message_created_at
            and excluded.last_message_id > chat_conversation_summaries.last_message_id
          )
        then excluded.last_message_edited_at
        else chat_conversation_summaries.last_message_edited_at
      end,
      unread_count = greatest(
        chat_conversation_summaries.unread_count + greatest(coalesce(p_unread_increment, 0), 0),
        0
      ),
      updated_at = excluded.updated_at;
end;
$$;

revoke all on function public.upsert_chat_conversation_summary_from_message(uuid, uuid, uuid, integer) from public;

create or replace function public.trg_refresh_chat_conversation_summary_from_messages()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_is_receipt_only boolean := false;
  v_receiver_unread_delta integer := 0;
begin
  if tg_op = 'INSERT' then
    perform public.upsert_chat_conversation_summary_from_message(
      new.sender_id,
      new.receiver_id,
      new.id,
      0
    );
    perform public.upsert_chat_conversation_summary_from_message(
      new.receiver_id,
      new.sender_id,
      new.id,
      case when coalesce(new.is_read, false) then 0 else 1 end
    );
    return null;
  end if;

  if tg_op = 'DELETE' then
    perform public.refresh_chat_conversation_summary(old.sender_id, old.receiver_id);
    perform public.refresh_chat_conversation_summary(old.receiver_id, old.sender_id);
    return null;
  end if;

  v_is_receipt_only := (
    to_jsonb(new) - array['is_read', 'read_at', 'delivered_at']::text[]
  ) is not distinct from (
    to_jsonb(old) - array['is_read', 'read_at', 'delivered_at']::text[]
  );

  if v_is_receipt_only then
    update public.chat_conversation_summaries summary
    set last_message_is_read = new.is_read,
        last_message_delivered_at = new.delivered_at,
        updated_at = timezone('utc'::text, now())
    where summary.last_message_id = new.id
      and (
        (summary.owner_user_id = new.sender_id and summary.peer_user_id = new.receiver_id)
        or
        (summary.owner_user_id = new.receiver_id and summary.peer_user_id = new.sender_id)
      )
      and (
        summary.last_message_is_read is distinct from new.is_read
        or summary.last_message_delivered_at is distinct from new.delivered_at
      );

    if coalesce(old.is_read, false) = false
      and coalesce(new.is_read, false) = true
      and not exists (
        select 1
        from public.message_hides hidden
        where hidden.user_id = new.receiver_id
          and hidden.message_id = new.id
      ) then
      v_receiver_unread_delta := 1;
    end if;

    if v_receiver_unread_delta > 0 then
      update public.chat_conversation_summaries summary
      set unread_count = greatest(summary.unread_count - v_receiver_unread_delta, 0),
          updated_at = timezone('utc'::text, now())
      where summary.owner_user_id = new.receiver_id
        and summary.peer_user_id = new.sender_id
        and summary.unread_count > 0;
    end if;
    return null;
  end if;

  perform public.refresh_chat_conversation_summary(new.sender_id, new.receiver_id);
  perform public.refresh_chat_conversation_summary(new.receiver_id, new.sender_id);
  return null;
end;
$$;

drop trigger if exists refresh_chat_conversation_summary_from_messages on public.messages;
create trigger refresh_chat_conversation_summary_from_messages
after insert or update or delete on public.messages
for each row
execute function public.trg_refresh_chat_conversation_summary_from_messages();

create or replace function public.trg_refresh_chat_conversation_summary_from_reactions()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_message_id uuid := coalesce(new.message_id, old.message_id);
  v_sender uuid;
  v_receiver uuid;
  v_message_type text;
  v_reaction_emoji text;
  v_reaction_user_id uuid;
  v_reaction_created_at timestamptz;
begin
  select
    message_row.sender_id,
    message_row.receiver_id,
    coalesce(message_row.message_type, 'text')
  into v_sender, v_receiver, v_message_type
  from public.messages message_row
  where message_row.id = v_message_id;

  if v_sender is null or v_receiver is null then
    return null;
  end if;

  select reaction.emoji, reaction.user_id, reaction.created_at
    into v_reaction_emoji, v_reaction_user_id, v_reaction_created_at
  from public.message_reactions reaction
  where reaction.message_id = v_message_id
  order by reaction.created_at desc, reaction.id desc
  limit 1;

  update public.chat_conversation_summaries summary
  set last_message_reaction_emoji = v_reaction_emoji,
      last_message_reaction_user_id = v_reaction_user_id,
      last_message_reaction_created_at = v_reaction_created_at,
      last_message_reaction_target_type = case
        when v_reaction_user_id is null then null
        else v_message_type
      end,
      updated_at = timezone('utc'::text, now())
  where summary.last_message_id = v_message_id
    and (
      (summary.owner_user_id = v_sender and summary.peer_user_id = v_receiver)
      or
      (summary.owner_user_id = v_receiver and summary.peer_user_id = v_sender)
    );

  if tg_op = 'DELETE' then
    update public.chat_conversation_summaries summary
    set last_activity_kind = null,
        last_activity_message_id = null,
        last_activity_preview = null,
        last_activity_at = null,
        updated_at = timezone('utc'::text, now())
    where summary.last_activity_kind = 'reaction'
      and summary.last_activity_message_id = v_message_id
      and summary.last_activity_at = old.created_at
      and (
        (summary.owner_user_id = v_sender and summary.peer_user_id = v_receiver)
        or
        (summary.owner_user_id = v_receiver and summary.peer_user_id = v_sender)
      );
    return null;
  end if;

  update public.chat_conversation_summaries summary
  set last_activity_kind = 'reaction',
      last_activity_message_id = v_message_id,
      last_activity_preview =
        case when new.user_id = summary.owner_user_id then 'You' else 'Someone' end
        || ' reacted ' || new.emoji || ' to '
        || case v_message_type
          when 'image' then 'photo'
          when 'video' then 'video'
          when 'voice' then 'voice note'
          when 'document' then 'document'
          when 'location' then 'location'
          when 'mood_sticker' then 'sticker'
          else 'message'
        end,
      last_activity_at = new.created_at,
      updated_at = timezone('utc'::text, now())
  where (
      (summary.owner_user_id = v_sender and summary.peer_user_id = v_receiver)
      or
      (summary.owner_user_id = v_receiver and summary.peer_user_id = v_sender)
    )
    and new.created_at >= coalesce(summary.last_activity_at, '-infinity'::timestamptz);

  return null;
end;
$$;

drop trigger if exists refresh_chat_conversation_summary_from_reactions on public.message_reactions;
create trigger refresh_chat_conversation_summary_from_reactions
after insert or update or delete on public.message_reactions
for each row
execute function public.trg_refresh_chat_conversation_summary_from_reactions();

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
    and receiver_id = v_user_id
    and (
      coalesce(is_read, false) = false
      or read_at is null
      or delivered_at is null
    );

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function public.rpc_mark_messages_read(
  p_message_ids uuid[]
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

  if coalesce(array_length(p_message_ids, 1), 0) = 0 then
    return 0;
  end if;

  update public.messages
  set delivered_at = coalesce(delivered_at, now()),
      read_at = coalesce(read_at, now()),
      is_read = true
  where id = any(p_message_ids)
    and receiver_id = v_user_id
    and (
      coalesce(is_read, false) = false
      or read_at is null
      or delivered_at is null
    );

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

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
begin
  if v_user_id is null then
    raise exception 'unauthenticated';
  end if;

  if p_peer_user_id is null or p_peer_user_id = v_user_id then
    raise exception 'invalid_peer';
  end if;

  if coalesce(p_typing, false) = false then
    delete from public.chat_typing_state typing
    where typing.user_id = v_user_id
      and typing.peer_user_id = p_peer_user_id;
    get diagnostics v_count = row_count;
    return v_count;
  end if;

  insert into public.chat_typing_state (
    user_id,
    peer_user_id,
    typing_until,
    updated_at
  )
  values (
    v_user_id,
    p_peer_user_id,
    v_now + ((v_typing_for_ms::text || ' milliseconds')::interval),
    v_now
  )
  on conflict (user_id, peer_user_id) do update
  set typing_until = excluded.typing_until,
      updated_at = excluded.updated_at
  where chat_typing_state.updated_at <= v_now - interval '4 seconds'
     or chat_typing_state.typing_until <= v_now + interval '1 second';

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function public.sync_profiles_presence_from_user_presence()
returns trigger
language plpgsql
set search_path = public, pg_catalog
as $$
begin
  if tg_op = 'INSERT'
    or new.online is distinct from old.online
    or old.last_active is null
    or new.last_active >= old.last_active + interval '5 minutes' then
    update public.profiles profile
    set online = new.online,
        last_active = new.last_active
    where profile.user_id = new.user_id
      and (
        profile.online is distinct from new.online
        or profile.last_active is null
        or new.last_active >= profile.last_active + interval '5 minutes'
      );
  end if;

  return new;
end;
$$;

create or replace function public.rpc_set_user_presence(
  p_online boolean
)
returns integer
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_user_id uuid := auth.uid();
  v_now timestamptz := now();
  v_count integer := 0;
begin
  if v_user_id is null then
    raise exception 'unauthenticated';
  end if;

  insert into public.user_presence (
    user_id,
    online,
    last_active,
    updated_at
  )
  values (
    v_user_id,
    coalesce(p_online, false),
    v_now,
    v_now
  )
  on conflict (user_id) do update
  set online = excluded.online,
      last_active = greatest(user_presence.last_active, excluded.last_active),
      updated_at = excluded.updated_at
  where user_presence.online is distinct from excluded.online
     or user_presence.last_active <= v_now - interval '55 seconds';

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.rpc_mark_message_read(uuid) from public;
revoke all on function public.rpc_mark_messages_read(uuid[]) from public;
revoke all on function public.rpc_set_chat_typing_state(uuid, boolean, integer) from public;
revoke all on function public.rpc_set_user_presence(boolean) from public;

grant execute on function public.rpc_mark_message_read(uuid) to authenticated;
grant execute on function public.rpc_mark_messages_read(uuid[]) to authenticated;
grant execute on function public.rpc_set_chat_typing_state(uuid, boolean, integer) to authenticated;
grant execute on function public.rpc_set_user_presence(boolean) to authenticated;
