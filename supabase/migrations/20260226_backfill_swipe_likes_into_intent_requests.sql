-- Backfill + trigger: mirror swipe likes (LIKE/SUPERLIKE) into Intent "Likes" (intent_requests.type = like_with_note).
--
-- Why:
-- - Premium UX: the Intent -> Likes tab should show historical likes immediately (no "empty" cold start).
-- - Reliability: a DB trigger ensures older app versions (or clients that only write swipes) still populate Intent.
--
-- Progressive backfill (run in this order when you're ready):
--   select public.rpc_backfill_swipe_likes_into_intent_requests(30);
--   select public.rpc_backfill_swipe_likes_into_intent_requests(60);
--   select public.rpc_backfill_swipe_likes_into_intent_requests(90);
--
-- Notes:
-- - We intentionally mark rows as expired if their natural 72h window has already passed.
--   They still show up in the "All" history without polluting the "Action" inbox.
-- - We dedupe: if any like_with_note already exists for the pair, we skip backfill for that swipe.

CREATE OR REPLACE FUNCTION public.rpc_backfill_swipe_likes_into_intent_requests(
  p_days integer DEFAULT 30,
  p_limit integer DEFAULT 5000
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_inserted integer := 0;
BEGIN
  -- Guardrails.
  IF p_days IS NULL OR p_days < 1 THEN
    RAISE EXCEPTION 'p_days must be >= 1';
  END IF;
  IF p_limit IS NULL OR p_limit < 1 THEN
    RAISE EXCEPTION 'p_limit must be >= 1';
  END IF;

  WITH candidates AS (
    SELECT
      s.id AS swipe_id,
      s.swiper_id AS actor_profile_id,
      s.target_id AS recipient_profile_id,
      s.action AS swipe_action,
      s.created_at AS swipe_created_at
    FROM public.swipes s
    WHERE s.action IN ('LIKE','SUPERLIKE')
      AND s.created_at >= (now() - make_interval(days => p_days))
    ORDER BY s.created_at DESC
    LIMIT p_limit
  ),
  resolved AS (
    SELECT
      c.*,
      pa.user_id AS actor_user_id,
      pr.user_id AS recipient_user_id
    FROM candidates c
    JOIN public.profiles pa ON pa.id = c.actor_profile_id
    JOIN public.profiles pr ON pr.id = c.recipient_profile_id
    WHERE pa.user_id IS NOT NULL
      AND pr.user_id IS NOT NULL
  ),
  filtered AS (
    SELECT r.*
    FROM resolved r
    WHERE NOT EXISTS (
      -- Skip if any like_with_note already exists for this pair (any status).
      SELECT 1
      FROM public.intent_requests ir
      WHERE ir.recipient_id = r.recipient_profile_id
        AND ir.actor_id = r.actor_profile_id
        AND ir.type = 'like_with_note'
    )
    AND NOT EXISTS (
      -- Skip if blocked either way (blocks are stored by user_id).
      SELECT 1
      FROM public.blocks b
      WHERE (b.blocker_id = r.actor_user_id AND b.blocked_id = r.recipient_user_id)
         OR (b.blocker_id = r.recipient_user_id AND b.blocked_id = r.actor_user_id)
    )
  ),
  inserted AS (
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
    SELECT
      f.recipient_profile_id,
      f.actor_profile_id,
      'like_with_note',
      NULL,
      NULL,
      NULL,
      CASE
        WHEN (f.swipe_created_at + interval '72 hours') < now() THEN 'expired'
        ELSE 'pending'
      END,
      f.swipe_created_at,
      (f.swipe_created_at + interval '72 hours'),
      jsonb_build_object(
        'source', 'swipe_backfill',
        'swipe_id', f.swipe_id,
        'swipe_action', f.swipe_action,
        'backfill_days', p_days
      )
    FROM filtered f
    RETURNING 1
  )
  SELECT count(*) INTO v_inserted FROM inserted;

  RETURN v_inserted;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_backfill_swipe_likes_into_intent_requests(integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_backfill_swipe_likes_into_intent_requests(integer, integer) TO service_role;

-- Mirror future swipe likes into intent_requests so older clients still populate the Intent -> Likes feed.
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

-- Safe initial backfill (small cap) for a premium first-run Intent -> Likes experience.
-- Re-run manually with 60 then 90 days when ready.
SELECT public.rpc_backfill_swipe_likes_into_intent_requests(30, 5000);

