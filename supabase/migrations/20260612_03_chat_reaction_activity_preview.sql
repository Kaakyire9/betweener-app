create or replace function public.refresh_chat_conversation_summary(
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
      last_activity_kind = case
        when v_reaction_user_id is null then null
        else 'reaction'
      end,
      last_activity_message_id = case
        when v_reaction_user_id is null then null
        else v_message_id
      end,
      last_activity_preview = case
        when v_reaction_user_id is null then null
        when v_reaction_user_id = summary.owner_user_id then
          case
            when nullif(btrim(v_reaction_emoji), '') is null
              then 'You reacted to their message'
            else 'You reacted ' || v_reaction_emoji || ' to their message'
          end
        else
          case
            when nullif(btrim(v_reaction_emoji), '') is null
              then 'Reacted to your message'
            else 'Reacted ' || v_reaction_emoji || ' to your message'
          end
      end,
      last_activity_at = v_reaction_created_at,
      updated_at = timezone('utc'::text, now())
  where summary.last_message_id = v_message_id
    and (
      (summary.owner_user_id = v_sender and summary.peer_user_id = v_receiver)
      or
      (summary.owner_user_id = v_receiver and summary.peer_user_id = v_sender)
    );

  return null;
end;
$$;

update public.chat_conversation_summaries summary
set last_activity_kind = 'reaction',
    last_activity_message_id = summary.last_message_id,
    last_activity_preview = case
      when summary.last_message_reaction_user_id = summary.owner_user_id then
        case
          when nullif(btrim(summary.last_message_reaction_emoji), '') is null
            then 'You reacted to their message'
          else 'You reacted ' || summary.last_message_reaction_emoji || ' to their message'
        end
      else
        case
          when nullif(btrim(summary.last_message_reaction_emoji), '') is null
            then 'Reacted to your message'
          else 'Reacted ' || summary.last_message_reaction_emoji || ' to your message'
        end
    end,
    last_activity_at = coalesce(
      summary.last_message_reaction_created_at,
      summary.last_message_created_at
    ),
    updated_at = timezone('utc'::text, now())
where summary.last_message_id is not null
  and summary.last_message_reaction_user_id is not null;
