-- Refresh the notification voice across core Betweener events.
-- Goals:
-- - make intent, swipe, match, note, gift, system, and verification pushes feel more emotionally intelligent
-- - keep payloads/deep links intact
-- - align push copy with the richer in-app language

create or replace function public.notify_intent_request_push()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
declare
  recipient_user_id uuid;
  actor_user_id uuid;
  actor_name text;
  actor_avatar text;
  body_text text;
begin
  if new.status is distinct from 'pending' then
    return new;
  end if;

  if new.type = 'like_with_note' then
    return new;
  end if;

  if exists (
    select 1
    from public.matches m
    where m.status in ('PENDING', 'ACCEPTED')
      and (
        (m.user1_id = new.actor_id and m.user2_id = new.recipient_id)
        or (m.user1_id = new.recipient_id and m.user2_id = new.actor_id)
      )
  ) then
    return new;
  end if;

  select p.user_id
  into recipient_user_id
  from public.profiles p
  where p.id = new.recipient_id
  limit 1;

  select p.user_id, coalesce(nullif(btrim(p.full_name), ''), 'Someone'), p.avatar_url
  into actor_user_id, actor_name, actor_avatar
  from public.profiles p
  where p.id = new.actor_id
  limit 1;

  if recipient_user_id is null or actor_user_id is null then
    return new;
  end if;

  if exists (
    select 1
    from public.notification_prefs p
    where p.user_id = recipient_user_id
      and p.push_enabled = false
  ) then
    return new;
  end if;

  if public.is_quiet_hours(recipient_user_id) then
    return new;
  end if;

  if exists (
    select 1
    from public.blocks b
    where (b.blocker_id = recipient_user_id and b.blocked_id = actor_user_id)
       or (b.blocker_id = actor_user_id and b.blocked_id = recipient_user_id)
  ) then
    return new;
  end if;

  body_text := case new.type
    when 'connect' then 'Opened the door to a thoughtful conversation.'
    when 'date_request' then 'Would like to take this beyond the app.'
    when 'circle_intro' then 'Opened a warmer introduction to connect.'
    else 'Opened a meaningful way to connect.'
  end;

  perform private.send_push_webhook(
    jsonb_build_object(
      'user_id', recipient_user_id,
      'title', actor_name,
      'body', body_text,
      'data', jsonb_build_object(
        'type', 'intent_request',
        'request_id', new.id,
        'request_type', new.type,
        'profile_id', new.actor_id,
        'peer_user_id', actor_user_id,
        'name', actor_name,
        'avatar_url', actor_avatar
      )
    )
  );

  return new;
end;
$$;

revoke all on function public.rpc_process_intent_request_jobs(interval, interval) from public;
grant execute on function public.rpc_process_intent_request_jobs(interval, interval) to service_role;

create or replace function public.notify_system_message_push()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
declare
  peer_name text;
  peer_avatar text;
  peer_profile_id uuid;
  title_text text;
  body_text text;
begin
  if coalesce(new.metadata->>'role', '') = 'accepter' then
    return new;
  end if;

  if exists (
    select 1
    from public.notification_prefs p
    where p.user_id = new.user_id
      and p.push_enabled = false
  ) then
    return new;
  end if;

  if public.is_quiet_hours(new.user_id) then
    return new;
  end if;

  select coalesce(nullif(btrim(p.full_name), ''), 'They'), p.avatar_url, p.id
  into peer_name, peer_avatar, peer_profile_id
  from public.profiles p
  where p.user_id = new.peer_user_id
  limit 1;

  if new.event_type = 'request_accepted' then
    title_text := peer_name;
    body_text := 'Reopened the door. Start with something warm and specific.';
  elsif new.event_type = 'request_expired' then
    title_text := 'A window closed';
    body_text := coalesce(nullif(btrim(new.text), ''), 'That opening closed. If it still feels right, come back warmer and more specific.');
  else
    title_text := 'Betweener';
    body_text := coalesce(nullif(btrim(new.text), ''), 'There is something worth checking.');
  end if;

  perform private.send_push_webhook(
    jsonb_build_object(
      'user_id', new.user_id,
      'title', title_text,
      'body', body_text,
      'data', jsonb_build_object(
        'type', 'system_message',
        'event_type', new.event_type,
        'system_message_id', new.id,
        'peer_user_id', new.peer_user_id,
        'profile_id', peer_profile_id,
        'name', peer_name,
        'avatar_url', peer_avatar,
        'intent_request_id', new.intent_request_id
      )
    )
  );

  return new;
end;
$$;

create or replace function public.notify_swipe_push()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
declare
  recipient_user_id uuid;
  liker_user_id uuid;
  liker_name text;
  liker_avatar text;
  body_text text;
begin
  if new.action not in ('LIKE', 'SUPERLIKE') then
    return new;
  end if;

  if exists (
    select 1
    from public.matches m
    where m.status in ('PENDING', 'ACCEPTED')
      and (
        (m.user1_id = new.swiper_id and m.user2_id = new.target_id)
        or (m.user1_id = new.target_id and m.user2_id = new.swiper_id)
      )
  ) then
    return new;
  end if;

  select p.user_id
  into recipient_user_id
  from public.profiles p
  where p.id = new.target_id
  limit 1;

  select p.user_id, coalesce(nullif(btrim(p.full_name), ''), 'Someone'), p.avatar_url
  into liker_user_id, liker_name, liker_avatar
  from public.profiles p
  where p.id = new.swiper_id
  limit 1;

  if recipient_user_id is null or liker_user_id is null then
    return new;
  end if;

  if exists (
    select 1
    from public.notification_prefs p
    where p.user_id = recipient_user_id
      and (
        p.push_enabled = false
        or (new.action = 'LIKE' and p.likes = false)
        or (new.action = 'SUPERLIKE' and p.superlikes = false)
      )
  ) then
    return new;
  end if;

  if public.is_quiet_hours(recipient_user_id) then
    return new;
  end if;

  if exists (
    select 1
    from public.blocks b
    where (b.blocker_id = recipient_user_id and b.blocked_id = liker_user_id)
       or (b.blocker_id = liker_user_id and b.blocked_id = recipient_user_id)
  ) then
    return new;
  end if;

  body_text := case
    when new.action = 'SUPERLIKE' then 'Made a stronger move toward you.'
    else 'Noticed you and wanted you to know.'
  end;

  perform private.send_push_webhook(
    jsonb_build_object(
      'user_id', recipient_user_id,
      'title', liker_name,
      'body', body_text,
      'data', jsonb_build_object(
        'type', lower(new.action::text),
        'swipe_id', new.id,
        'profile_id', new.swiper_id,
        'peer_user_id', liker_user_id,
        'name', liker_name,
        'avatar_url', liker_avatar
      )
    )
  );

  return new;
end;
$$;

create or replace function public.notify_match_push()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
declare
  u1 uuid;
  u2 uuid;
  other_name text;
  other_avatar text;
begin
  if not (new.status = 'ACCEPTED' and (tg_op = 'INSERT' or old.status is distinct from new.status)) then
    return new;
  end if;

  select user_id into u1 from public.profiles where id = new.user1_id limit 1;
  select user_id into u2 from public.profiles where id = new.user2_id limit 1;

  if u1 is null or u2 is null then
    return new;
  end if;

  if not exists (
    select 1
    from public.notification_prefs p
    where p.user_id = u1
      and (p.push_enabled = false or p.matches = false)
  )
  and not public.is_quiet_hours(u1)
  and not exists (
    select 1
    from public.system_messages sm
    where sm.user_id = u1
      and sm.peer_user_id = u2
      and sm.event_type = 'request_accepted'
      and sm.created_at >= (now() - interval '30 seconds')
  )
  then
    select coalesce(nullif(btrim(full_name), ''), 'them'), avatar_url
    into other_name, other_avatar
    from public.profiles
    where id = new.user2_id
    limit 1;

    perform private.send_push_webhook(
      jsonb_build_object(
        'user_id', u1,
        'title', 'It''s a match',
        'body', 'You and ' || other_name || ' saw something in each other. Start with something real.',
        'data', jsonb_build_object(
          'type', 'match',
          'match_id', new.id,
          'profile_id', new.user2_id,
          'peer_user_id', u2,
          'name', other_name,
          'avatar_url', other_avatar
        )
      )
    );
  end if;

  if not exists (
    select 1
    from public.notification_prefs p
    where p.user_id = u2
      and (p.push_enabled = false or p.matches = false)
  )
  and not public.is_quiet_hours(u2)
  and not exists (
    select 1
    from public.system_messages sm
    where sm.user_id = u2
      and sm.peer_user_id = u1
      and sm.event_type = 'request_accepted'
      and sm.created_at >= (now() - interval '30 seconds')
  )
  then
    select coalesce(nullif(btrim(full_name), ''), 'them'), avatar_url
    into other_name, other_avatar
    from public.profiles
    where id = new.user1_id
    limit 1;

    perform private.send_push_webhook(
      jsonb_build_object(
        'user_id', u2,
        'title', 'It''s a match',
        'body', 'You and ' || other_name || ' saw something in each other. Start with something real.',
        'data', jsonb_build_object(
          'type', 'match',
          'match_id', new.id,
          'profile_id', new.user1_id,
          'peer_user_id', u1,
          'name', other_name,
          'avatar_url', other_avatar
        )
      )
    );
  end if;

  return new;
end;
$$;

create or replace function public.notify_profile_note_push()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
declare
  target_user_id uuid;
  sender_profile_id uuid;
  sender_name text;
  sender_avatar text;
  preview_text boolean;
  body_text text;
begin
  select p.user_id
  into target_user_id
  from public.profiles p
  where p.id = new.profile_id
  limit 1;

  select p.id, coalesce(nullif(btrim(p.full_name), ''), 'Someone'), p.avatar_url
  into sender_profile_id, sender_name, sender_avatar
  from public.profiles p
  where p.user_id = new.sender_id
  limit 1;

  if target_user_id is null or new.sender_id is null then
    return new;
  end if;

  if exists (
    select 1
    from public.notification_prefs p
    where p.user_id = target_user_id
      and (p.push_enabled = false or p.notes = false)
  ) then
    return new;
  end if;

  if public.is_quiet_hours(target_user_id) then
    return new;
  end if;

  if exists (
    select 1
    from public.blocks b
    where (b.blocker_id = target_user_id and b.blocked_id = new.sender_id)
       or (b.blocker_id = new.sender_id and b.blocked_id = target_user_id)
  ) then
    return new;
  end if;

  select coalesce(p.preview_text, true)
  into preview_text
  from public.notification_prefs p
  where p.user_id = target_user_id
  limit 1;

  body_text := case
    when coalesce(preview_text, true) = false then 'Left you a note worth opening.'
    when nullif(btrim(coalesce(new.note, '')), '') is not null then
      'Left you a note: "' || left(regexp_replace(new.note, '\s+', ' ', 'g'), 120) || '"'
    else 'Left you a note worth opening.'
  end;

  perform private.send_push_webhook(
    jsonb_build_object(
      'user_id', target_user_id,
      'title', sender_name,
      'body', body_text,
      'data', jsonb_build_object(
        'type', 'profile_note',
        'note_id', new.id,
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

create or replace function public.notify_profile_gift_push()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
declare
  target_user_id uuid;
  sender_profile_id uuid;
  sender_name text;
  sender_avatar text;
  body_text text;
begin
  select p.user_id
  into target_user_id
  from public.profiles p
  where p.id = new.profile_id
  limit 1;

  select p.id, coalesce(nullif(btrim(p.full_name), ''), 'Someone'), p.avatar_url
  into sender_profile_id, sender_name, sender_avatar
  from public.profiles p
  where p.user_id = new.sender_id
  limit 1;

  if target_user_id is null or new.sender_id is null then
    return new;
  end if;

  if exists (
    select 1
    from public.notification_prefs p
    where p.user_id = target_user_id
      and (p.push_enabled = false or p.gifts = false)
  ) then
    return new;
  end if;

  if public.is_quiet_hours(target_user_id) then
    return new;
  end if;

  if exists (
    select 1
    from public.blocks b
    where (b.blocker_id = target_user_id and b.blocked_id = new.sender_id)
       or (b.blocker_id = new.sender_id and b.blocked_id = target_user_id)
  ) then
    return new;
  end if;

  body_text := case new.gift_type
    when 'rose' then 'Sent a rose to get your attention.'
    when 'teddy' then 'Sent a teddy bear with softer energy.'
    when 'ring' then 'Sent a ring. That move was not casual.'
    else 'Sent you a thoughtful gift.'
  end;

  perform private.send_push_webhook(
    jsonb_build_object(
      'user_id', target_user_id,
      'title', sender_name,
      'body', body_text,
      'data', jsonb_build_object(
        'type', 'profile_gift',
        'gift_id', new.id,
        'gift_type', new.gift_type,
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

create or replace function public.notify_verification_outcome_push()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_target_level integer;
  v_title text;
  v_body text;
  v_method_label text;
begin
  if new.status not in ('approved', 'rejected')
     or old.status is not distinct from new.status then
    return new;
  end if;

  if new.user_id is null then
    return new;
  end if;

  if exists (
    select 1
    from public.notification_prefs p
    where p.user_id = new.user_id
      and (p.push_enabled = false or p.verification = false)
  ) then
    return new;
  end if;

  if public.is_quiet_hours(new.user_id) then
    return new;
  end if;

  v_target_level := case new.verification_type
    when 'social' then 1
    when 'selfie_liveness' then 2
    when 'passport' then 2
    when 'residence' then 2
    when 'workplace' then 2
    else 1
  end;

  v_method_label := case new.verification_type
    when 'social' then 'social proof'
    when 'selfie_liveness' then 'face check'
    when 'passport' then 'passport proof'
    when 'residence' then 'residence proof'
    when 'workplace' then 'work or study proof'
    else 'verification'
  end;

  if new.status = 'approved' then
    v_title := 'Trust update';
    v_body := 'Your ' || v_method_label || ' moved you to Trust level ' || v_target_level || '.';
  else
    v_title := 'One proof needs another pass';
    v_body := 'One proof needs a cleaner pass. Pick it up privately when you are ready.';
  end if;

  perform private.send_push_webhook(
    jsonb_build_object(
      'user_id', new.user_id,
      'title', v_title,
      'body', v_body,
      'data', jsonb_build_object(
        'type', 'verification_outcome',
        'status', new.status,
        'request_id', new.id,
        'verification_type', new.verification_type,
        'target_level', v_target_level
      )
    )
  );

  return new;
end;
$$;

create or replace function public.rpc_process_intent_request_jobs(
  p_remind_before interval default interval '6 hours',
  p_window interval default interval '15 minutes'
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
declare
  v_expired_marked integer := 0;
  v_expired_system_messages integer := 0;
  v_reminders_sent integer := 0;
  v_last_chance interval := interval '30 minutes';
begin
  with expired as (
    update public.intent_requests ir
    set status = 'expired'
    where ir.status = 'pending'
      and ir.expires_at < now()
    returning ir.id, ir.actor_id, ir.recipient_id, ir.type
  ),
  expired_events as (
    select e.id, e.actor_id, e.recipient_id, e.type
    from expired e
    union
    select ir.id, ir.actor_id, ir.recipient_id, ir.type
    from public.intent_requests ir
    where ir.status = 'expired'
      and ir.expires_at < now()
      and ir.expires_at >= (now() - p_window)
  ),
  inserted as (
    insert into public.system_messages (
      user_id,
      peer_user_id,
      intent_request_id,
      event_type,
      text,
      metadata
    )
    select
      pa.user_id as user_id,
      pr.user_id as peer_user_id,
      e.id as intent_request_id,
      'request_expired' as event_type,
      (
        'Your ' ||
        case e.type
          when 'connect' then 'conversation opening'
          when 'date_request' then 'date invitation'
          when 'like_with_note' then 'opening'
          when 'circle_intro' then 'introduction'
          else 'opening'
        end ||
        ' to ' || coalesce(pr.full_name, 'them') ||
        ' closed. If it still feels right, come back warmer and more specific.'
      ) as text,
      jsonb_build_object(
        'role', 'requester',
        'kind', 'intent_expired',
        'request_type', e.type,
        'recipient_profile_id', pr.id
      ) as metadata
    from expired_events e
    join public.profiles pa on pa.id = e.actor_id
    join public.profiles pr on pr.id = e.recipient_id
    where pa.user_id is not null
      and pr.user_id is not null
      and not exists (
        select 1
        from public.blocks b
        where (b.blocker_id = pa.user_id and b.blocked_id = pr.user_id)
           or (b.blocker_id = pr.user_id and b.blocked_id = pa.user_id)
      )
    on conflict (intent_request_id, user_id) do nothing
    returning 1
  )
  select
    (select count(*) from expired),
    (select count(*) from inserted)
  into v_expired_marked, v_expired_system_messages;

  with candidates as (
    select
      ir.id as request_id,
      ir.type as request_type,
      ir.actor_id,
      ir.recipient_id,
      pr.user_id as recipient_user_id,
      pa.user_id as actor_user_id,
      coalesce(nullif(btrim(pa.full_name), ''), 'Someone') as actor_name,
      pa.avatar_url as actor_avatar_url,
      (ir.expires_at - now()) as time_left,
      case
        when (ir.expires_at - now()) <= v_last_chance then 'recipient_last_chance'
        else 'recipient_primary'
      end as nudge_kind
    from public.intent_requests ir
    join public.profiles pr on pr.id = ir.recipient_id
    join public.profiles pa on pa.id = ir.actor_id
    left join public.notification_prefs np on np.user_id = pr.user_id
    where ir.status = 'pending'
      and ir.expires_at > now()
      and pr.user_id is not null
      and pa.user_id is not null
      and coalesce(np.push_enabled, true) = true
      and public.is_quiet_hours(pr.user_id) = false
      and not exists (
        select 1
        from public.blocks b
        where (b.blocker_id = pa.user_id and b.blocked_id = pr.user_id)
           or (b.blocker_id = pr.user_id and b.blocked_id = pa.user_id)
      )
      and (
        (ir.expires_at - now()) <= v_last_chance
        or (
          (ir.expires_at - now()) <= (
            case ir.type
              when 'date_request' then interval '12 hours'
              when 'connect' then interval '3 hours'
              when 'like_with_note' then interval '12 hours'
              when 'circle_intro' then interval '6 hours'
              else p_remind_before
            end
          )
          and (ir.expires_at - now()) > v_last_chance
        )
      )
      and not exists (
        select 1
        from public.intent_request_nudges n
        where n.intent_request_id = ir.id
          and n.kind = (
            case
              when (ir.expires_at - now()) <= v_last_chance then 'recipient_last_chance'
              else 'recipient_primary'
            end
          )
          and n.user_id = pr.user_id
      )
  ),
  reserved as (
    insert into public.intent_request_nudges (intent_request_id, kind, user_id, metadata)
    select
      c.request_id,
      c.nudge_kind,
      c.recipient_user_id,
      jsonb_build_object(
        'request_type', c.request_type,
        'time_left_minutes', floor(extract(epoch from c.time_left) / 60)
      )
    from candidates c
    on conflict (intent_request_id, kind, user_id) do nothing
    returning intent_request_id, kind, user_id
  ),
  to_send as (
    select c.*
    from candidates c
    join reserved r
      on r.intent_request_id = c.request_id
     and r.kind = c.nudge_kind
     and r.user_id = c.recipient_user_id
  ),
  pushes as (
    select private.send_push_webhook(
      jsonb_build_object(
        'user_id', t.recipient_user_id,
        'title', t.actor_name,
        'body',
          case
            when t.nudge_kind = 'recipient_last_chance'
              then 'This opening is about to close. If you are curious, answer now.'
            when t.request_type = 'date_request'
              then 'Would still like to take this beyond the app.'
            when t.request_type = 'like_with_note'
              then 'Left you a note worth answering.'
            when t.request_type = 'circle_intro'
              then 'Opened a more personal way to connect.'
            else 'Left the door open for a thoughtful reply.'
          end,
        'data', jsonb_build_object(
          'type', case when t.nudge_kind = 'recipient_last_chance' then 'intent_last_chance' else 'intent_expiring_soon' end,
          'request_id', t.request_id,
          'request_type', t.request_type,
          'actor_id', t.actor_id,
          'recipient_id', t.recipient_id,
          'name', t.actor_name,
          'avatar_url', t.actor_avatar_url
        )
      )
    ) as _sent
    from to_send t
  )
  select count(*) into v_reminders_sent from pushes;

  return jsonb_build_object(
    'expired_marked', v_expired_marked,
    'expired_system_messages', v_expired_system_messages,
    'reminders_sent', v_reminders_sent
  );
end;
$$;
