-- Migration: push webhooks for likes/superlikes/matches
CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;

CREATE TABLE IF NOT EXISTS private.push_config (
  id integer PRIMARY KEY DEFAULT 1,
  webhook_url text,
  webhook_secret text
);

INSERT INTO private.push_config (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION private.send_push_webhook(payload jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public, net
AS $$
DECLARE
  cfg record;
BEGIN
  SELECT webhook_url, webhook_secret
  INTO cfg
  FROM private.push_config
  WHERE id = 1;

  IF cfg.webhook_url IS NULL OR cfg.webhook_secret IS NULL THEN
    RETURN;
  END IF;

  PERFORM net.http_post(
    cfg.webhook_url,
    payload,
    jsonb_build_object(
      'Content-Type', 'application/json',
      'x-push-secret', cfg.webhook_secret
    )
  );
EXCEPTION
  WHEN others THEN
    RETURN;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_swipe_push()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  liker_name text;
  liker_avatar text;
BEGIN
  IF NEW.action IN ('LIKE', 'SUPERLIKE') THEN
    IF EXISTS (
      SELECT 1
      FROM public.notification_prefs p
      WHERE p.user_id = NEW.target_id
        AND (
          p.push_enabled = false
          OR (NEW.action = 'LIKE' AND p.likes = false)
          OR (NEW.action = 'SUPERLIKE' AND p.superlikes = false)
        )
    ) THEN
      RETURN NEW;
    END IF;
    SELECT full_name, avatar_url
    INTO liker_name, liker_avatar
    FROM public.profiles
    WHERE id = NEW.swiper_id;

    liker_name := COALESCE(liker_name, 'Someone');
    RAISE LOG 'notify_swipe_push user_id=% action=% swipe_id=%', NEW.target_id, NEW.action, NEW.id;
    PERFORM private.send_push_webhook(
      jsonb_build_object(
        'user_id', NEW.target_id,
        'title', liker_name,
        'body', CASE WHEN NEW.action = 'SUPERLIKE' THEN liker_name || ' sent you a superlike' ELSE liker_name || ' liked your profile' END,
        'data', jsonb_build_object(
          'type', lower(NEW.action::text),
          'swipe_id', NEW.id,
          'profile_id', NEW.swiper_id,
          'name', liker_name,
          'avatar_url', liker_avatar
        )
      )
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notify_swipe_push ON public.swipes;
CREATE TRIGGER notify_swipe_push
AFTER INSERT ON public.swipes
FOR EACH ROW
EXECUTE FUNCTION public.notify_swipe_push();

CREATE OR REPLACE FUNCTION public.notify_match_push()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
BEGIN
  IF NEW.status = 'ACCEPTED' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.notification_prefs p
      WHERE p.user_id = NEW.user1_id
        AND (p.push_enabled = false OR p.matches = false)
    ) THEN
      PERFORM private.send_push_webhook(
        jsonb_build_object(
          'user_id', NEW.user1_id,
          'title', 'It''s a match',
          'body', 'Say hello to your new match',
          'data', jsonb_build_object('type', 'match', 'match_id', NEW.id)
        )
      );
    END IF;
    IF NOT EXISTS (
      SELECT 1
      FROM public.notification_prefs p
      WHERE p.user_id = NEW.user2_id
        AND (p.push_enabled = false OR p.matches = false)
    ) THEN
      PERFORM private.send_push_webhook(
        jsonb_build_object(
          'user_id', NEW.user2_id,
          'title', 'It''s a match',
          'body', 'Say hello to your new match',
          'data', jsonb_build_object('type', 'match', 'match_id', NEW.id)
        )
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notify_match_push ON public.matches;
CREATE TRIGGER notify_match_push
AFTER INSERT OR UPDATE ON public.matches
FOR EACH ROW
EXECUTE FUNCTION public.notify_match_push();

CREATE OR REPLACE FUNCTION public.notify_message_push()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
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

  PERFORM private.send_push_webhook(
    jsonb_build_object(
      'user_id', NEW.receiver_id,
      'title', 'New message',
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
      'data', jsonb_build_object('type', 'message', 'message_id', NEW.id)
    )
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notify_message_push ON public.messages;
CREATE TRIGGER notify_message_push
AFTER INSERT ON public.messages
FOR EACH ROW
EXECUTE FUNCTION public.notify_message_push();

CREATE OR REPLACE FUNCTION public.notify_profile_image_reaction_push()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  target_user_id uuid;
  reactor_name text;
  reactor_avatar text;
BEGIN
  SELECT p.user_id
  INTO target_user_id
  FROM public.profiles p
  WHERE p.id = NEW.profile_id
  LIMIT 1;

  IF target_user_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.notification_prefs p
    WHERE p.user_id = target_user_id
      AND (p.push_enabled = false OR p.reactions = false)
  ) THEN
    RETURN NEW;
  END IF;

  SELECT full_name, avatar_url
  INTO reactor_name, reactor_avatar
  FROM public.profiles
  WHERE id = NEW.reactor_user_id
  LIMIT 1;

  reactor_name := COALESCE(reactor_name, 'Someone');

  PERFORM private.send_push_webhook(
    jsonb_build_object(
      'user_id', target_user_id,
      'title', reactor_name,
      'body', CASE
        WHEN NEW.emoji IS NOT NULL AND NEW.emoji <> '' THEN reactor_name || ' reacted ' || NEW.emoji
        ELSE reactor_name || ' reacted to your photo'
      END,
      'data', jsonb_build_object(
        'type', 'profile_reaction',
        'reaction_id', NEW.id,
        'profile_id', NEW.profile_id,
        'reactor_id', NEW.reactor_user_id,
        'name', reactor_name,
        'avatar_url', reactor_avatar
      )
    )
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notify_profile_image_reaction_push ON public.profile_image_reactions;
CREATE TRIGGER notify_profile_image_reaction_push
AFTER INSERT ON public.profile_image_reactions
FOR EACH ROW
EXECUTE FUNCTION public.notify_profile_image_reaction_push();

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
      AND (p.push_enabled = false OR p.reactions = false)
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
        'name', reactor_name,
        'avatar_url', reactor_avatar
      )
    )
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notify_message_reaction_push ON public.message_reactions;
CREATE TRIGGER notify_message_reaction_push
AFTER INSERT ON public.message_reactions
FOR EACH ROW
EXECUTE FUNCTION public.notify_message_reaction_push();
