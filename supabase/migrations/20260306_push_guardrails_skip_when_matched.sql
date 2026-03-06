-- Push guardrails:
-- - If two profiles are already matched (matches.status = 'ACCEPTED'), don't send "like" or "new request" pushes.
--   (After a match exists, users should be interacting via chat; extra likes/intents feel spammy.)

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

  -- If already matched, skip "new request" pushes.
  IF EXISTS (
    SELECT 1
    FROM public.matches m
    WHERE m.status IN ('PENDING', 'ACCEPTED')
      AND (
        (m.user1_id = NEW.actor_id AND m.user2_id = NEW.recipient_id)
        OR (m.user1_id = NEW.recipient_id AND m.user2_id = NEW.actor_id)
      )
  ) THEN
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

  -- If already matched, skip "liked your profile" pushes.
  IF EXISTS (
    SELECT 1
    FROM public.matches m
    WHERE m.status IN ('PENDING', 'ACCEPTED')
      AND (
        (m.user1_id = NEW.swiper_id AND m.user2_id = NEW.target_id)
        OR (m.user1_id = NEW.target_id AND m.user2_id = NEW.swiper_id)
      )
  ) THEN
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
