-- Premium push payload for profile image reactions.
--
-- Upgrades notify_profile_image_reaction_push to:
-- - Use the reactor's name as title (premium feel)
-- - Include reactor avatar_url so iOS/Android can show a rich thumbnail
-- - Deep-link to the reactor profile via data.profile_id (handled by app/_layout.tsx)
--
-- Notes:
-- - profile_image_reactions.profile_id references profiles.id
-- - profile_image_reactions.reactor_user_id references auth.users.id
-- - notification_prefs / blocks / quiet-hours are keyed by auth.users.id

CREATE OR REPLACE FUNCTION public.notify_profile_image_reaction_push()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  target_user_id uuid;
  reactor_profile_id uuid;
  reactor_name text;
  reactor_avatar text;
  body_text text;
BEGIN
  -- Resolve the target auth user id from the profile id.
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

  -- Skip if blocked either way (blocks use auth user ids).
  IF EXISTS (
    SELECT 1
    FROM public.blocks b
    WHERE (b.blocker_id = target_user_id AND b.blocked_id = NEW.reactor_user_id)
       OR (b.blocker_id = NEW.reactor_user_id AND b.blocked_id = target_user_id)
  ) THEN
    RETURN NEW;
  END IF;

  -- Resolve reactor profile + display fields.
  SELECT p.id, p.full_name, p.avatar_url
  INTO reactor_profile_id, reactor_name, reactor_avatar
  FROM public.profiles p
  WHERE p.user_id = NEW.reactor_user_id
  LIMIT 1;

  reactor_name := COALESCE(reactor_name, 'Someone');
  body_text := CASE
    WHEN NEW.emoji IS NOT NULL AND NEW.emoji <> '' THEN 'reacted ' || NEW.emoji
    ELSE 'reacted to your photo'
  END;

  PERFORM private.send_push_webhook(
    jsonb_build_object(
      'user_id', target_user_id,
      'title', reactor_name,
      'body', body_text,
      'data', jsonb_build_object(
        'type', 'profile_reaction',
        'reaction_id', NEW.id,
        'profile_id', reactor_profile_id,
        'peer_user_id', NEW.reactor_user_id,
        'name', reactor_name,
        'avatar_url', reactor_avatar,
        'emoji', NEW.emoji
      )
    )
  );

  RETURN NEW;
END;
$$;

