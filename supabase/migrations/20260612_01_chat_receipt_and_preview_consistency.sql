alter function public.refresh_chat_conversation_summary(uuid, uuid)
  rename to refresh_chat_conversation_summary_unchecked;

create function public.refresh_chat_conversation_summary(
  p_owner_user_id uuid,
  p_peer_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  perform public.refresh_chat_conversation_summary_unchecked(
    p_owner_user_id,
    p_peer_user_id
  );

  update public.chat_conversation_summaries summary
  set last_activity_kind = null,
      last_activity_message_id = null,
      last_activity_preview = null,
      last_activity_at = null,
      updated_at = timezone('utc'::text, now())
  where summary.owner_user_id = p_owner_user_id
    and summary.peer_user_id = p_peer_user_id
    and summary.last_activity_message_id is distinct from summary.last_message_id;
end;
$$;

revoke all on function public.refresh_chat_conversation_summary(uuid, uuid) from public;
revoke all on function public.refresh_chat_conversation_summary_unchecked(uuid, uuid) from public;

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
      and summary.last_message_id = v_message_id
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
  where summary.last_message_id = v_message_id
    and (
      (summary.owner_user_id = v_sender and summary.peer_user_id = v_receiver)
      or
      (summary.owner_user_id = v_receiver and summary.peer_user_id = v_sender)
    )
    and new.created_at >= coalesce(summary.last_activity_at, '-infinity'::timestamptz);

  return null;
end;
$$;

update public.chat_conversation_summaries summary
set last_activity_kind = null,
    last_activity_message_id = null,
    last_activity_preview = null,
    last_activity_at = null,
    updated_at = timezone('utc'::text, now())
where summary.last_activity_message_id is distinct from summary.last_message_id;
