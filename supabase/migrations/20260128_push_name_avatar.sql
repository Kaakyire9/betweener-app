-- Migration: push payloads with sender name for messages/matches/reactions
CREATE OR REPLACE FUNCTION public.notify_message_push()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  sender_name text;
  sender_avatar text;
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

  SELECT full_name, avatar_url
  INTO sender_name, sender_avatar
  FROM public.profiles
  WHERE id = NEW.sender_id
  LIMIT 1;

  sender_name := COALESCE(sender_name, 'New message');

  PERFORM private.send_push_webhook(
    jsonb_build_object(
      'user_id', NEW.receiver_id,
      'title', sender_name,
      'body', (
        CASE
          WHEN EXISTS (
            SELECT 1
            FROM public.notification_prefs p
            WHERE p.user_id = NEW.receiver_id
              AND p.preview_text = false
          ) THEN 'New message'
          WHEN NEW.message_type = 'text' AND NEW.text IS NOT NULL AND NEW.text <> '' THEN NEW.text
          WHEN NEW.message_type = 'image' THEN 'Photo'
          WHEN NEW.message_type = 'video' THEN 'Video'
          WHEN NEW.message_type = 'voice' THEN 'Voice message'
          WHEN NEW.message_type = 'location' THEN 'Location'
          ELSE 'New message'
        END
      ),
      'data', jsonb_build_object(
        'type', 'message',
        'message_id', NEW.id,
        'profile_id', NEW.sender_id,
        'name', sender_name,
        'avatar_url', sender_avatar
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
  other_name text;
  other_avatar text;
BEGIN
  IF NEW.status = 'ACCEPTED' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.notification_prefs p
      WHERE p.user_id = NEW.user1_id
        AND (p.push_enabled = false OR p.matches = false)
    ) AND NOT public.is_quiet_hours(NEW.user1_id) THEN
      SELECT full_name, avatar_url
      INTO other_name, other_avatar
      FROM public.profiles
      WHERE id = NEW.user2_id
      LIMIT 1;

      other_name := COALESCE(other_name, 'New match');

      PERFORM private.send_push_webhook(
        jsonb_build_object(
          'user_id', NEW.user1_id,
          'title', other_name,
          'body', 'It''s a match',
          'data', jsonb_build_object(
            'type', 'match',
            'match_id', NEW.id,
            'profile_id', NEW.user2_id,
            'name', other_name,
            'avatar_url', other_avatar
          )
        )
      );
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM public.notification_prefs p
      WHERE p.user_id = NEW.user2_id
        AND (p.push_enabled = false OR p.matches = false)
    ) AND NOT public.is_quiet_hours(NEW.user2_id) THEN
      SELECT full_name, avatar_url
      INTO other_name, other_avatar
      FROM public.profiles
      WHERE id = NEW.user1_id
      LIMIT 1;

      other_name := COALESCE(other_name, 'New match');

      PERFORM private.send_push_webhook(
        jsonb_build_object(
          'user_id', NEW.user2_id,
          'title', other_name,
          'body', 'It''s a match',
          'data', jsonb_build_object(
            'type', 'match',
            'match_id', NEW.id,
            'profile_id', NEW.user1_id,
            'name', other_name,
            'avatar_url', other_avatar
          )
        )
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_message_reaction_push()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  msg_sender uuid;
  msg_receiver uuid;
  target_user_id uuid;
  reactor_name text;
  reactor_avatar text;
BEGIN
  SELECT m.sender_id, m.receiver_id
  INTO msg_sender, msg_receiver
  FROM public.messages m
  WHERE m.id = NEW.message_id;

  IF msg_sender IS NULL OR msg_receiver IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.user_id = msg_sender THEN
    target_user_id := msg_receiver;
  ELSE
    target_user_id := msg_sender;
  END IF;

  IF target_user_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.notification_prefs p
    WHERE p.user_id = target_user_id
      AND (p.push_enabled = false OR p.message_reactions = false)
  ) THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.blocks b
    WHERE (b.blocker_id = target_user_id AND b.blocked_id = NEW.user_id)
       OR (b.blocker_id = NEW.user_id AND b.blocked_id = target_user_id)
  ) THEN
    RETURN NEW;
  END IF;

  SELECT full_name, avatar_url
  INTO reactor_name, reactor_avatar
  FROM public.profiles
  WHERE id = NEW.user_id
  LIMIT 1;

  reactor_name := COALESCE(reactor_name, 'Someone');

  PERFORM private.send_push_webhook(
    jsonb_build_object(
      'user_id', target_user_id,
      'title', reactor_name,
      'body', CASE
        WHEN NEW.emoji IS NOT NULL AND NEW.emoji <> '' THEN reactor_name || ' reacted ' || NEW.emoji
        ELSE reactor_name || ' reacted to your message'
      END,
      'data', jsonb_build_object(
        'type', 'message_reaction',
        'reaction_id', NEW.id,
        'message_id', NEW.message_id,
        'reactor_id', NEW.user_id,
        'profile_id', NEW.user_id,
        'name', reactor_name,
        'avatar_url', reactor_avatar
      )
    )
  );
  RETURN NEW;
END;
$$;
