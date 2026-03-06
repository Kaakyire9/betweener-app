-- Premium push payloads:
-- - Consistent copy (title/body)
-- - Include avatar_url so Expo "richContent.image" shows a thumbnail on iOS/Android
-- - Correctly resolve auth user ids (notification_prefs / blocks / chat_prefs use auth.users ids)
--
-- Notes:
-- - swipes/matches store profile ids; messages/system_messages store auth user ids.
-- - push-notifications edge function already uses data.avatar_url to set richContent.image.

CREATE OR REPLACE FUNCTION public.notify_message_push()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  sender_name text;
  sender_avatar text;
  sender_profile_id uuid;
  body_text text;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.notification_prefs p
    WHERE p.user_id = NEW.receiver_id
      AND (p.push_enabled = false OR p.messages = false)
  ) THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.blocks b
    WHERE (b.blocker_id = NEW.receiver_id AND b.blocked_id = NEW.sender_id)
       OR (b.blocker_id = NEW.sender_id AND b.blocked_id = NEW.receiver_id)
  ) THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.chat_prefs p
    WHERE p.user_id = NEW.receiver_id
      AND p.peer_id = NEW.sender_id
      AND p.muted = true
  ) THEN
    RETURN NEW;
  END IF;

  -- Prefer resolving by profiles.user_id (messages use auth user ids).
  SELECT p.full_name, p.avatar_url, p.id
  INTO sender_name, sender_avatar, sender_profile_id
  FROM public.profiles p
  WHERE p.user_id = NEW.sender_id
  LIMIT 1;

  -- Backward-compat: tolerate legacy rows that stored profiles.id in sender_id.
  IF sender_profile_id IS NULL THEN
    SELECT p.full_name, p.avatar_url, p.id
    INTO sender_name, sender_avatar, sender_profile_id
    FROM public.profiles p
    WHERE p.id = NEW.sender_id
    LIMIT 1;
  END IF;

  sender_name := COALESCE(sender_name, 'New message');

  body_text := (
    CASE
      WHEN EXISTS (
        SELECT 1
        FROM public.notification_prefs p
        WHERE p.user_id = NEW.receiver_id
          AND p.preview_text = false
      ) THEN 'Sent you a message'
      WHEN NEW.message_type = 'text' AND NEW.text IS NOT NULL AND NEW.text <> '' THEN NEW.text
      WHEN NEW.message_type = 'image' THEN 'Photo'
      WHEN NEW.message_type = 'video' THEN 'Video'
      WHEN NEW.message_type = 'voice' THEN 'Voice message'
      WHEN NEW.message_type = 'location' THEN 'Location'
      ELSE 'Sent you a message'
    END
  );

  PERFORM private.send_push_webhook(
    jsonb_build_object(
      'user_id', NEW.receiver_id,
      'title', sender_name,
      'body', body_text,
      'data', jsonb_build_object(
        'type', 'message',
        'message_id', NEW.id,
        -- Profile id is used for UI deep-links (profile-view); peer_user_id is used for chat queries.
        'profile_id', sender_profile_id,
        'peer_user_id', NEW.sender_id,
        'name', sender_name,
        'avatar_url', sender_avatar
      )
    )
  );
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_swipe_push()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  recipient_user_id uuid;
  liker_user_id uuid;
  liker_name text;
  liker_avatar text;
  body_text text;
BEGIN
  IF NEW.action NOT IN ('LIKE', 'SUPERLIKE') THEN
    RETURN NEW;
  END IF;

  SELECT p.user_id INTO recipient_user_id
  FROM public.profiles p
  WHERE p.id = NEW.target_id
  LIMIT 1;

  SELECT p.user_id INTO liker_user_id
  FROM public.profiles p
  WHERE p.id = NEW.swiper_id
  LIMIT 1;

  IF recipient_user_id IS NULL OR liker_user_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.notification_prefs p
    WHERE p.user_id = recipient_user_id
      AND (
        p.push_enabled = false
        OR (NEW.action = 'LIKE' AND p.likes = false)
        OR (NEW.action = 'SUPERLIKE' AND p.superlikes = false)
      )
  ) THEN
    RETURN NEW;
  END IF;

  IF public.is_quiet_hours(recipient_user_id) THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.blocks b
    WHERE (b.blocker_id = recipient_user_id AND b.blocked_id = liker_user_id)
       OR (b.blocker_id = liker_user_id AND b.blocked_id = recipient_user_id)
  ) THEN
    RETURN NEW;
  END IF;

  SELECT p.full_name, p.avatar_url
  INTO liker_name, liker_avatar
  FROM public.profiles p
  WHERE p.id = NEW.swiper_id
  LIMIT 1;

  liker_name := COALESCE(liker_name, 'Someone');
  body_text := CASE
    WHEN NEW.action = 'SUPERLIKE' THEN 'Sent you a superlike'
    ELSE 'Liked your profile'
  END;

  PERFORM private.send_push_webhook(
    jsonb_build_object(
      'user_id', recipient_user_id,
      'title', liker_name,
      'body', body_text,
      'data', jsonb_build_object(
        'type', lower(NEW.action::text),
        'swipe_id', NEW.id,
        'profile_id', NEW.swiper_id,
        'peer_user_id', liker_user_id,
        'name', liker_name,
        'avatar_url', liker_avatar
      )
    )
  );

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_match_push()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  u1 uuid;
  u2 uuid;
  other_name text;
  other_avatar text;
BEGIN
  IF NOT (NEW.status = 'ACCEPTED' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status)) THEN
    RETURN NEW;
  END IF;

  SELECT user_id INTO u1 FROM public.profiles WHERE id = NEW.user1_id LIMIT 1;
  SELECT user_id INTO u2 FROM public.profiles WHERE id = NEW.user2_id LIMIT 1;

  IF u1 IS NULL OR u2 IS NULL THEN
    RETURN NEW;
  END IF;

  -- Notify u1 about u2
  IF NOT EXISTS (
    SELECT 1
    FROM public.notification_prefs p
    WHERE p.user_id = u1
      AND (p.push_enabled = false OR p.matches = false)
  ) AND NOT public.is_quiet_hours(u1) THEN
    SELECT full_name, avatar_url
    INTO other_name, other_avatar
    FROM public.profiles
    WHERE id = NEW.user2_id
    LIMIT 1;

    other_name := COALESCE(other_name, 'them');

    PERFORM private.send_push_webhook(
      jsonb_build_object(
        'user_id', u1,
        'title', 'It''s a match',
        'body', 'You and ' || other_name || ' matched—say hi.',
        'data', jsonb_build_object(
          'type', 'match',
          'match_id', NEW.id,
          'profile_id', NEW.user2_id,
          'peer_user_id', u2,
          'name', other_name,
          'avatar_url', other_avatar
        )
      )
    );
  END IF;

  -- Notify u2 about u1
  IF NOT EXISTS (
    SELECT 1
    FROM public.notification_prefs p
    WHERE p.user_id = u2
      AND (p.push_enabled = false OR p.matches = false)
  ) AND NOT public.is_quiet_hours(u2) THEN
    SELECT full_name, avatar_url
    INTO other_name, other_avatar
    FROM public.profiles
    WHERE id = NEW.user1_id
    LIMIT 1;

    other_name := COALESCE(other_name, 'them');

    PERFORM private.send_push_webhook(
      jsonb_build_object(
        'user_id', u2,
        'title', 'It''s a match',
        'body', 'You and ' || other_name || ' matched—say hi.',
        'data', jsonb_build_object(
          'type', 'match',
          'match_id', NEW.id,
          'profile_id', NEW.user1_id,
          'peer_user_id', u1,
          'name', other_name,
          'avatar_url', other_avatar
        )
      )
    );
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_system_message_push()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  peer_name text;
  peer_avatar text;
  peer_profile_id uuid;
  title_text text;
  body_text text;
BEGIN
  -- Only push to the requester; accepter gets in-app system message only.
  IF COALESCE(NEW.metadata->>'role', '') = 'accepter' THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.notification_prefs p
    WHERE p.user_id = NEW.user_id
      AND p.push_enabled = false
  ) THEN
    RETURN NEW;
  END IF;

  IF public.is_quiet_hours(NEW.user_id) THEN
    RETURN NEW;
  END IF;

  SELECT p.full_name, p.avatar_url, p.id
  INTO peer_name, peer_avatar, peer_profile_id
  FROM public.profiles p
  WHERE p.user_id = NEW.peer_user_id
  LIMIT 1;

  peer_name := COALESCE(peer_name, 'They');

  IF NEW.event_type = 'request_accepted' THEN
    title_text := peer_name || ' accepted';
    body_text := 'Start with a thoughtful hello.';
  ELSE
    title_text := 'Update';
    body_text := NEW.text;
  END IF;

  PERFORM private.send_push_webhook(
    jsonb_build_object(
      'user_id', NEW.user_id,
      'title', title_text,
      'body', body_text,
      'data', jsonb_build_object(
        'type', 'system_message',
        'event_type', NEW.event_type,
        'system_message_id', NEW.id,
        'peer_user_id', NEW.peer_user_id,
        'profile_id', peer_profile_id,
        'name', peer_name,
        'avatar_url', peer_avatar,
        'intent_request_id', NEW.intent_request_id
      )
    )
  );
  RETURN NEW;
END;
$$;

