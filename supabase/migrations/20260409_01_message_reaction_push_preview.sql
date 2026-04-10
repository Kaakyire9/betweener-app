-- Restore premium message reaction push content.
-- Fixes two issues:
-- 1. message_reactions.user_id is an auth user id, so profile lookup must prefer profiles.user_id.
-- 2. reaction pushes should include richer body copy, including message preview where allowed.

create or replace function public.notify_message_reaction_push()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
declare
  msg_sender uuid;
  msg_receiver uuid;
  target_user_id uuid;
  reactor_name text;
  reactor_avatar text;
  reactor_profile_id uuid;
  v_message_text text;
  v_message_type text;
  v_preview_text boolean;
  v_snippet text;
  body_text text;
begin
  select m.sender_id, m.receiver_id, m.text, m.message_type
  into msg_sender, msg_receiver, v_message_text, v_message_type
  from public.messages m
  where m.id = new.message_id;

  if msg_sender is null or msg_receiver is null then
    return new;
  end if;

  if new.user_id = msg_sender then
    target_user_id := msg_receiver;
  else
    target_user_id := msg_sender;
  end if;

  if target_user_id is null then
    return new;
  end if;

  if exists (
    select 1
    from public.notification_prefs p
    where p.user_id = target_user_id
      and (p.push_enabled = false or p.message_reactions = false)
  ) then
    return new;
  end if;

  if exists (
    select 1
    from public.blocks b
    where (b.blocker_id = target_user_id and b.blocked_id = new.user_id)
       or (b.blocker_id = new.user_id and b.blocked_id = target_user_id)
  ) then
    return new;
  end if;

  select coalesce(p.preview_text, true)
  into v_preview_text
  from public.notification_prefs p
  where p.user_id = target_user_id
  limit 1;

  select p.full_name, p.avatar_url, p.id
  into reactor_name, reactor_avatar, reactor_profile_id
  from public.profiles p
  where p.user_id = new.user_id
  limit 1;

  if reactor_profile_id is null then
    select p.full_name, p.avatar_url, p.id
    into reactor_name, reactor_avatar, reactor_profile_id
    from public.profiles p
    where p.id = new.user_id
    limit 1;
  end if;

  reactor_name := coalesce(reactor_name, 'Someone');

  if coalesce(v_preview_text, true) = false then
    body_text := case
      when new.emoji is not null and new.emoji <> '' then reactor_name || ' reacted ' || new.emoji || ' to your message'
      else reactor_name || ' reacted to your message'
    end;
  else
    if v_message_type = 'text' and v_message_text is not null and v_message_text <> '' then
      if v_message_text like 'date_plan::%' then
        body_text := case
          when new.emoji is not null and new.emoji <> '' then reactor_name || ' reacted ' || new.emoji || ' to your date suggestion'
          else reactor_name || ' reacted to your date suggestion'
        end;
      else
        v_snippet := left(regexp_replace(v_message_text, '\s+', ' ', 'g'), 88);
        body_text := case
          when new.emoji is not null and new.emoji <> '' then reactor_name || ' reacted ' || new.emoji || ' to "' || v_snippet || '"'
          else reactor_name || ' reacted to "' || v_snippet || '"'
        end;
      end if;
    else
      body_text := case
        when v_message_type = 'image' then reactor_name || ' reacted' || case when new.emoji is not null and new.emoji <> '' then ' ' || new.emoji else '' end || ' to your photo'
        when v_message_type = 'video' then reactor_name || ' reacted' || case when new.emoji is not null and new.emoji <> '' then ' ' || new.emoji else '' end || ' to your video'
        when v_message_type = 'voice' then reactor_name || ' reacted' || case when new.emoji is not null and new.emoji <> '' then ' ' || new.emoji else '' end || ' to your voice note'
        when v_message_type = 'location' then reactor_name || ' reacted' || case when new.emoji is not null and new.emoji <> '' then ' ' || new.emoji else '' end || ' to your location'
        else case
          when new.emoji is not null and new.emoji <> '' then reactor_name || ' reacted ' || new.emoji || ' to your message'
          else reactor_name || ' reacted to your message'
        end
      end;
    end if;
  end if;

  perform private.send_push_webhook(
    jsonb_build_object(
      'user_id', target_user_id,
      'title', reactor_name,
      'body', body_text,
      'data', jsonb_build_object(
        'type', 'message_reaction',
        'reaction_id', new.id,
        'message_id', new.message_id,
        'reactor_id', new.user_id,
        'profile_id', reactor_profile_id,
        'name', reactor_name,
        'avatar_url', reactor_avatar,
        'reaction_emoji', new.emoji
      )
    )
  );
  return new;
end;
$$;
