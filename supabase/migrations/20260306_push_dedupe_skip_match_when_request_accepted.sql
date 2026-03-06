-- Push dedupe:
-- - When a match is created as a result of accepting an intent request, the requester already receives
--   a premium "NAME accepted" push from system_messages.
-- - In that case, skip the "It's a match" push for that same requester to avoid double notifications.

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
  )
  AND NOT public.is_quiet_hours(u1)
  AND NOT EXISTS (
    -- If u1 just received "NAME accepted", skip the match push to avoid duplication.
    SELECT 1
    FROM public.system_messages sm
    WHERE sm.user_id = u1
      AND sm.peer_user_id = u2
      AND sm.event_type = 'request_accepted'
      AND sm.created_at >= (now() - interval '30 seconds')
  )
  THEN
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
  )
  AND NOT public.is_quiet_hours(u2)
  AND NOT EXISTS (
    -- If u2 just received "NAME accepted", skip the match push to avoid duplication.
    SELECT 1
    FROM public.system_messages sm
    WHERE sm.user_id = u2
      AND sm.peer_user_id = u1
      AND sm.event_type = 'request_accepted'
      AND sm.created_at >= (now() - interval '30 seconds')
  )
  THEN
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

