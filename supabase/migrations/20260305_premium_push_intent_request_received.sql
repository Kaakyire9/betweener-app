-- Premium push payload for newly received intent requests.
--
-- Improves over the older notify_intent_request_push by:
-- - Using the actor's name as the notification title (premium feel).
-- - Including actor avatar_url so iOS/Android can show a rich thumbnail.
-- - Using auth user ids for notification prefs / blocks / quiet-hours checks.
--
-- Notes:
-- - intent_requests.actor_id / recipient_id are profiles.id.
-- - blocks / notification_prefs are keyed by auth.users.id (profiles.user_id).
-- - like_with_note is pushed via swipes; we skip here to avoid duplicate pushes.

CREATE OR REPLACE FUNCTION public.notify_intent_request_push()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  recipient_user_id uuid;
  actor_user_id uuid;
  actor_name text;
  actor_avatar text;
  body_text text;
BEGIN
  -- Only notify for newly created actionable requests.
  IF NEW.status IS DISTINCT FROM 'pending' THEN
    RETURN NEW;
  END IF;

  -- Likes are notified via swipes (LIKE/SUPERLIKE) to avoid double pushes.
  IF NEW.type = 'like_with_note' THEN
    RETURN NEW;
  END IF;

  SELECT p.user_id INTO recipient_user_id
  FROM public.profiles p
  WHERE p.id = NEW.recipient_id
  LIMIT 1;

  SELECT p.user_id, p.full_name, p.avatar_url
  INTO actor_user_id, actor_name, actor_avatar
  FROM public.profiles p
  WHERE p.id = NEW.actor_id
  LIMIT 1;

  IF recipient_user_id IS NULL OR actor_user_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.notification_prefs p
    WHERE p.user_id = recipient_user_id
      AND p.push_enabled = false
  ) THEN
    RETURN NEW;
  END IF;

  IF public.is_quiet_hours(recipient_user_id) THEN
    RETURN NEW;
  END IF;

  -- Skip if blocked either way (blocks use auth user ids).
  IF EXISTS (
    SELECT 1
    FROM public.blocks b
    WHERE (b.blocker_id = recipient_user_id AND b.blocked_id = actor_user_id)
       OR (b.blocker_id = actor_user_id AND b.blocked_id = recipient_user_id)
  ) THEN
    RETURN NEW;
  END IF;

  actor_name := COALESCE(actor_name, 'Someone');

  body_text := CASE NEW.type
    WHEN 'connect' THEN 'Sent you a connect request.'
    WHEN 'date_request' THEN 'Sent you a date request.'
    WHEN 'circle_intro' THEN 'Sent you a circle intro.'
    ELSE 'Sent you a request.'
  END;

  PERFORM private.send_push_webhook(
    jsonb_build_object(
      'user_id', recipient_user_id,
      'title', actor_name,
      'body', body_text,
      'data', jsonb_build_object(
        'type', 'intent_request',
        'request_id', NEW.id,
        'request_type', NEW.type,
        -- Deep-link + display helpers
        'profile_id', NEW.actor_id,
        'peer_user_id', actor_user_id,
        'name', actor_name,
        'avatar_url', actor_avatar
      )
    )
  );

  RETURN NEW;
END;
$$;

-- Ensure the trigger exists (idempotent).
DROP TRIGGER IF EXISTS notify_intent_request_push ON public.intent_requests;
CREATE TRIGGER notify_intent_request_push
AFTER INSERT ON public.intent_requests
FOR EACH ROW
EXECUTE FUNCTION public.notify_intent_request_push();

