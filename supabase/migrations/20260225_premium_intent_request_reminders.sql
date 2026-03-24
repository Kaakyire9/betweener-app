-- Premium intent reminders ("wow" add-on)
-- - Primary reminder window varies by request type (connect/date/like/circle)
-- - Optional "last chance" reminder at 30 minutes remaining
-- - Deduped via intent_request_nudges unique constraint

-- Expand allowed nudge kinds.
ALTER TABLE public.intent_request_nudges
  DROP CONSTRAINT IF EXISTS intent_request_nudges_kind_check;

-- Backward-compat: migrate older kind values before re-adding the constraint.
UPDATE public.intent_request_nudges
SET kind = 'recipient_primary'
WHERE kind = 'recipient_expiring_soon';

ALTER TABLE public.intent_request_nudges
  ADD CONSTRAINT intent_request_nudges_kind_check
  CHECK (kind IN ('recipient_primary', 'recipient_last_chance'));

CREATE OR REPLACE FUNCTION public.rpc_process_intent_request_jobs(
  p_remind_before interval DEFAULT interval '6 hours',
  p_window interval DEFAULT interval '15 minutes'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_catalog
AS $$
DECLARE
  v_expired_marked integer := 0;
  v_expired_system_messages integer := 0;
  v_reminders_sent integer := 0;
  v_last_chance interval := interval '30 minutes';
BEGIN
  -- 1) Expire any pending requests that have passed expires_at and add a "coach" system message for the actor.
  WITH expired AS (
    UPDATE public.intent_requests ir
    SET status = 'expired'
    WHERE ir.status = 'pending'
      AND ir.expires_at < now()
    RETURNING ir.id, ir.actor_id, ir.recipient_id, ir.type
  ),
  -- Ensure the "expired" coach message still gets created even if another caller already expired the row.
  expired_events AS (
    SELECT e.id, e.actor_id, e.recipient_id, e.type
    FROM expired e
    UNION
    SELECT ir.id, ir.actor_id, ir.recipient_id, ir.type
    FROM public.intent_requests ir
    WHERE ir.status = 'expired'
      AND ir.expires_at < now()
      AND ir.expires_at >= (now() - p_window)
  ),
  inserted AS (
    INSERT INTO public.system_messages (
      user_id,
      peer_user_id,
      intent_request_id,
      event_type,
      text,
      metadata
    )
    SELECT
      pa.user_id AS user_id,
      pr.user_id AS peer_user_id,
      e.id AS intent_request_id,
      'request_expired' AS event_type,
      (
        'Your ' ||
        CASE e.type
          WHEN 'connect' THEN 'Connect'
          WHEN 'date_request' THEN 'Date'
          WHEN 'like_with_note' THEN 'Like'
          WHEN 'circle_intro' THEN 'Circle intro'
          ELSE 'request'
        END ||
        ' to ' || COALESCE(pr.full_name, 'them') ||
        ' expired. Next move: mention something specific from their photos or intro video.'
      ) AS text,
      jsonb_build_object(
        'role', 'requester',
        'kind', 'intent_expired',
        'request_type', e.type,
        'recipient_profile_id', pr.id
      ) AS metadata
    FROM expired_events e
    JOIN public.profiles pa ON pa.id = e.actor_id
    JOIN public.profiles pr ON pr.id = e.recipient_id
    WHERE pa.user_id IS NOT NULL
      AND pr.user_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM public.blocks b
        WHERE (b.blocker_id = pa.user_id AND b.blocked_id = pr.user_id)
           OR (b.blocker_id = pr.user_id AND b.blocked_id = pa.user_id)
      )
    ON CONFLICT (intent_request_id, user_id) DO NOTHING
    RETURNING 1
  )
  SELECT
    (SELECT count(*) FROM expired),
    (SELECT count(*) FROM inserted)
  INTO v_expired_marked, v_expired_system_messages;

  -- 2) Reminders to the recipient:
  -- - Primary reminder: depends on request type (premium feel)
  -- - Last chance: 30 minutes remaining
  --
  -- Notes:
  -- - We do NOT use a narrow "window" lower-bound so quiet-hours can defer delivery.
  -- - Dedup is enforced by intent_request_nudges_unique.
  WITH candidates AS (
    SELECT
      ir.id AS request_id,
      ir.type AS request_type,
      ir.actor_id,
      ir.recipient_id,
      pr.user_id AS recipient_user_id,
      pa.user_id AS actor_user_id,
      COALESCE(pa.full_name, 'Someone') AS actor_name,
      pa.avatar_url AS actor_avatar_url,
      (ir.expires_at - now()) AS time_left,
      CASE
        WHEN (ir.expires_at - now()) <= v_last_chance THEN 'recipient_last_chance'
        ELSE 'recipient_primary'
      END AS nudge_kind
    FROM public.intent_requests ir
    JOIN public.profiles pr ON pr.id = ir.recipient_id
    JOIN public.profiles pa ON pa.id = ir.actor_id
    LEFT JOIN public.notification_prefs np ON np.user_id = pr.user_id
    WHERE ir.status = 'pending'
      AND ir.expires_at > now()
      AND pr.user_id IS NOT NULL
      AND pa.user_id IS NOT NULL
      AND COALESCE(np.push_enabled, true) = true
      AND public.is_quiet_hours(pr.user_id) = false
      AND NOT EXISTS (
        SELECT 1
        FROM public.blocks b
        WHERE (b.blocker_id = pa.user_id AND b.blocked_id = pr.user_id)
           OR (b.blocker_id = pr.user_id AND b.blocked_id = pa.user_id)
      )
      -- Primary threshold (per type) OR last-chance threshold.
      AND (
        (ir.expires_at - now()) <= v_last_chance
        OR (
          (ir.expires_at - now()) <= (
            CASE ir.type
              WHEN 'date_request' THEN interval '12 hours'
              WHEN 'connect' THEN interval '3 hours'
              WHEN 'like_with_note' THEN interval '12 hours'
              WHEN 'circle_intro' THEN interval '6 hours'
              ELSE p_remind_before
            END
          )
          AND (ir.expires_at - now()) > v_last_chance
        )
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.intent_request_nudges n
        WHERE n.intent_request_id = ir.id
          AND n.kind = (
            CASE
              WHEN (ir.expires_at - now()) <= v_last_chance THEN 'recipient_last_chance'
              ELSE 'recipient_primary'
            END
          )
          AND n.user_id = pr.user_id
      )
  ),
  reserved AS (
    INSERT INTO public.intent_request_nudges (intent_request_id, kind, user_id, metadata)
    SELECT
      c.request_id,
      c.nudge_kind,
      c.recipient_user_id,
      jsonb_build_object(
        'request_type', c.request_type,
        'time_left_minutes', floor(extract(epoch from c.time_left) / 60)
      )
    FROM candidates c
    ON CONFLICT (intent_request_id, kind, user_id) DO NOTHING
    RETURNING intent_request_id, kind, user_id
  ),
  to_send AS (
    SELECT c.*
    FROM candidates c
    JOIN reserved r
      ON r.intent_request_id = c.request_id
     AND r.kind = c.nudge_kind
     AND r.user_id = c.recipient_user_id
  ),
  pushes AS (
    SELECT private.send_push_webhook(
      jsonb_build_object(
        'user_id', t.recipient_user_id,
        'title', t.actor_name,
        'body',
          CASE
            WHEN t.nudge_kind = 'recipient_last_chance'
              THEN 'Last chance to respond. This closes soon.'
            WHEN t.request_type = 'date_request'
              THEN 'Date request waiting. Open to respond?'
            WHEN t.request_type = 'like_with_note'
              THEN 'They left you a note. Want to reply?'
            WHEN t.request_type = 'circle_intro'
              THEN 'New intro is waiting. Open to respond?'
            ELSE 'Connect request waiting. Open to respond?'
          END,
        'data', jsonb_build_object(
          'type', CASE WHEN t.nudge_kind = 'recipient_last_chance' THEN 'intent_last_chance' ELSE 'intent_expiring_soon' END,
          'request_id', t.request_id,
          'request_type', t.request_type,
          'actor_id', t.actor_id,
          'recipient_id', t.recipient_id,
          'name', t.actor_name,
          'avatar_url', t.actor_avatar_url
        )
      )
    ) AS _sent
    FROM to_send t
  )
  SELECT count(*) INTO v_reminders_sent FROM pushes;

  RETURN jsonb_build_object(
    'expired_marked', v_expired_marked,
    'expired_system_messages', v_expired_system_messages,
    'reminders_sent', v_reminders_sent
  );
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_process_intent_request_jobs(interval, interval) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_process_intent_request_jobs(interval, interval) TO service_role;
