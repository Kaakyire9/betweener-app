-- Mirror swipe likes into intent_requests:
-- - Skip when users are already matched (matches.status = 'ACCEPTED').
-- - Skip when there is already any pending intent between the pair (either direction).

CREATE OR REPLACE FUNCTION public.trg_mirror_swipe_like_to_intent_request()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_actor_user_id uuid;
  v_recipient_user_id uuid;
BEGIN
  IF NEW.action NOT IN ('LIKE','SUPERLIKE') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.action IN ('LIKE','SUPERLIKE') THEN
    -- Already a like; don't duplicate.
    RETURN NEW;
  END IF;

  -- If already matched, don't create an intent "like" entry.
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

  -- If any intent is already pending between them, don't add another "like" intent row.
  IF EXISTS (
    SELECT 1
    FROM public.intent_requests ir
    WHERE ir.status = 'pending'
      AND ir.expires_at > now()
      AND (
        (ir.actor_id = NEW.swiper_id AND ir.recipient_id = NEW.target_id)
        OR (ir.actor_id = NEW.target_id AND ir.recipient_id = NEW.swiper_id)
      )
  ) THEN
    RETURN NEW;
  END IF;

  -- Resolve user ids for block checks. (blocks use user_id, swipes use profile_id)
  SELECT user_id INTO v_actor_user_id FROM public.profiles WHERE id = NEW.swiper_id LIMIT 1;
  SELECT user_id INTO v_recipient_user_id FROM public.profiles WHERE id = NEW.target_id LIMIT 1;
  IF v_actor_user_id IS NULL OR v_recipient_user_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Skip if blocked either way.
  IF EXISTS (
    SELECT 1
    FROM public.blocks b
    WHERE (b.blocker_id = v_actor_user_id AND b.blocked_id = v_recipient_user_id)
       OR (b.blocker_id = v_recipient_user_id AND b.blocked_id = v_actor_user_id)
  ) THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.intent_requests (
    recipient_id,
    actor_id,
    type,
    message,
    suggested_time,
    suggested_place,
    status,
    created_at,
    expires_at,
    metadata
  )
  VALUES (
    NEW.target_id,
    NEW.swiper_id,
    'like_with_note',
    CASE WHEN NEW.action = 'SUPERLIKE' THEN 'Superliked you.' ELSE NULL END,
    NULL,
    NULL,
    'pending',
    now(),
    now() + interval '72 hours',
    jsonb_build_object(
      'source', 'swipe_trigger',
      'swipe_id', NEW.id,
      'swipe_action', NEW.action
    )
  )
  ON CONFLICT (recipient_id, actor_id, type) WHERE status = 'pending' DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS mirror_swipe_like_to_intent_request ON public.swipes;
CREATE TRIGGER mirror_swipe_like_to_intent_request
AFTER INSERT OR UPDATE OF action ON public.swipes
FOR EACH ROW
EXECUTE FUNCTION public.trg_mirror_swipe_like_to_intent_request();
