create or replace function public.notify_message_push()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
declare
  sender_name text;
  sender_avatar text;
  sender_profile_id uuid;
  body_text text;
  v_date_plan jsonb;
  v_place_name text;
begin
  if exists (
    select 1
    from public.notification_prefs p
    where p.user_id = new.receiver_id
      and (p.push_enabled = false or p.messages = false)
  ) then
    return new;
  end if;

  if exists (
    select 1
    from public.blocks b
    where (b.blocker_id = new.receiver_id and b.blocked_id = new.sender_id)
       or (b.blocker_id = new.sender_id and b.blocked_id = new.receiver_id)
  ) then
    return new;
  end if;

  if exists (
    select 1
    from public.chat_prefs p
    where p.user_id = new.receiver_id
      and p.peer_id = new.sender_id
      and p.muted = true
  ) then
    return new;
  end if;

  select p.full_name, p.avatar_url, p.id
  into sender_name, sender_avatar, sender_profile_id
  from public.profiles p
  where p.user_id = new.sender_id
  limit 1;

  if sender_profile_id is null then
    select p.full_name, p.avatar_url, p.id
    into sender_name, sender_avatar, sender_profile_id
    from public.profiles p
    where p.id = new.sender_id
    limit 1;
  end if;

  sender_name := coalesce(sender_name, 'New message');

  if new.message_type = 'text'
     and new.text is not null
     and new.text like 'date_plan::%' then
    begin
      v_date_plan := substring(new.text from char_length('date_plan::') + 1)::jsonb;
      v_place_name := nullif(btrim(coalesce(v_date_plan->>'placeName', '')), '');
      body_text := coalesce('Date suggestion: ' || v_place_name, 'Date suggestion');
    exception
      when others then
        body_text := 'Date suggestion';
    end;
  else
    body_text := (
      case
        when exists (
          select 1
          from public.notification_prefs p
          where p.user_id = new.receiver_id
            and p.preview_text = false
        ) then 'Sent you a message'
        when new.message_type = 'text' and new.text is not null and new.text <> '' then new.text
        when new.message_type = 'image' then 'Photo'
        when new.message_type = 'video' then 'Video'
        when new.message_type = 'voice' then 'Voice message'
        when new.message_type = 'location' then 'Location'
        else 'Sent you a message'
      end
    );
  end if;

  perform private.send_push_webhook(
    jsonb_build_object(
      'user_id', new.receiver_id,
      'title', sender_name,
      'body', body_text,
      'data', jsonb_build_object(
        'type', 'message',
        'message_id', new.id,
        'profile_id', sender_profile_id,
        'peer_user_id', new.sender_id,
        'name', sender_name,
        'avatar_url', sender_avatar
      )
    )
  );
  return new;
end;
$$;
