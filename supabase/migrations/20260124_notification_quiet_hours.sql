-- Migration: quiet hours for notification suppression
ALTER TABLE public.notification_prefs
  ADD COLUMN IF NOT EXISTS quiet_hours_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS quiet_hours_start time NOT NULL DEFAULT '22:00',
  ADD COLUMN IF NOT EXISTS quiet_hours_end time NOT NULL DEFAULT '08:00',
  ADD COLUMN IF NOT EXISTS quiet_hours_tz text NOT NULL DEFAULT 'UTC';

CREATE OR REPLACE FUNCTION public.is_quiet_hours(p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  prefs record;
  local_time time;
BEGIN
  SELECT quiet_hours_enabled, quiet_hours_start, quiet_hours_end, quiet_hours_tz
  INTO prefs
  FROM public.notification_prefs
  WHERE user_id = p_user_id;

  IF prefs IS NULL OR prefs.quiet_hours_enabled IS DISTINCT FROM true THEN
    RETURN false;
  END IF;

  local_time := (now() AT TIME ZONE COALESCE(prefs.quiet_hours_tz, 'UTC'))::time;

  IF prefs.quiet_hours_start = prefs.quiet_hours_end THEN
    RETURN false;
  END IF;

  IF prefs.quiet_hours_start < prefs.quiet_hours_end THEN
    RETURN local_time >= prefs.quiet_hours_start AND local_time < prefs.quiet_hours_end;
  END IF;

  RETURN local_time >= prefs.quiet_hours_start OR local_time < prefs.quiet_hours_end;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_swipe_push()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
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

    IF public.is_quiet_hours(NEW.target_id) THEN
      RETURN NEW;
    END IF;

    PERFORM private.send_push_webhook(
      jsonb_build_object(
        'user_id', NEW.target_id,
        'title', CASE WHEN NEW.action = 'SUPERLIKE' THEN 'Superlike' ELSE 'New like' END,
        'body', CASE WHEN NEW.action = 'SUPERLIKE' THEN 'You got a superlike' ELSE 'Someone liked your profile' END,
        'data', jsonb_build_object('type', lower(NEW.action), 'swipe_id', NEW.id)
      )
    );
  END IF;
  RETURN NEW;
END;
$$;

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
    ) AND NOT public.is_quiet_hours(NEW.user1_id) THEN
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
    ) AND NOT public.is_quiet_hours(NEW.user2_id) THEN
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

  IF public.is_quiet_hours(NEW.receiver_id) THEN
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

CREATE OR REPLACE FUNCTION public.notify_profile_image_reaction_push()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  target_user_id uuid;
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

  IF public.is_quiet_hours(target_user_id) THEN
    RETURN NEW;
  END IF;

  PERFORM private.send_push_webhook(
    jsonb_build_object(
      'user_id', target_user_id,
      'title', 'New reaction',
      'body', CASE
        WHEN NEW.emoji IS NOT NULL AND NEW.emoji <> '' THEN 'Someone reacted ' || NEW.emoji
        ELSE 'Someone reacted to your photo'
      END,
      'data', jsonb_build_object('type', 'profile_reaction', 'reaction_id', NEW.id)
    )
  );
  RETURN NEW;
END;
$$;
