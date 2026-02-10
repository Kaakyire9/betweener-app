-- Migration: separate message reaction notification preference + push hook
ALTER TABLE public.notification_prefs
  ADD COLUMN IF NOT EXISTS message_reactions boolean NOT NULL DEFAULT true;

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
