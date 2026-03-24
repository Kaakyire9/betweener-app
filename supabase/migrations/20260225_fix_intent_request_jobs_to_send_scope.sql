-- Fix rpc_process_intent_request_jobs: CTE scope for `to_send`.
-- Previous version referenced `to_send` outside its WITH statement, causing:
--   SQLSTATE 42P01: relation "to_send" does not exist

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
BEGIN
  -- 1) Expire any pending requests that have passed expires_at.
  WITH expired AS (
    UPDATE public.intent_requests ir
    SET status = 'expired'
    WHERE ir.status = 'pending'
      AND ir.expires_at < now()
    RETURNING ir.id, ir.actor_id, ir.recipient_id, ir.type
  ),
  -- Ensure the "expired" coach message still gets created even if another caller
  -- (e.g. the app) already marked the row as expired shortly before this job ran.
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
      -- Don't create "coach" messages if the pair is blocked either way.
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

  -- 2) "Closing soon" reminder (recipient only), once per request.
  --
  -- Use an inner subquery so the CTEs are scoped to this single statement.
  PERFORM private.send_push_webhook(
    jsonb_build_object(
      'user_id', t.recipient_user_id,
      'title', t.actor_name,
      'body', (
        CASE t.request_type
          WHEN 'date_request' THEN 'Your date request is closing soon. Open to respond?'
          WHEN 'like_with_note' THEN 'Their like with a note is closing soon. Open to respond?'
          WHEN 'circle_intro' THEN 'Their circle intro is closing soon. Open to respond?'
          ELSE 'Their connect request is closing soon. Open to respond?'
        END
      ),
      'data', jsonb_build_object(
        'type', 'intent_expiring_soon',
        'request_id', t.request_id,
        'request_type', t.request_type,
        'actor_id', t.actor_id,
        'recipient_id', t.recipient_id,
        'name', t.actor_name,
        'avatar_url', t.actor_avatar_url
      )
    )
  )
  FROM (
    WITH candidates AS (
      SELECT
        ir.id AS request_id,
        ir.type AS request_type,
        ir.actor_id,
        ir.recipient_id,
        pr.user_id AS recipient_user_id,
        pa.user_id AS actor_user_id,
        COALESCE(pa.full_name, 'Someone') AS actor_name,
        pa.avatar_url AS actor_avatar_url
      FROM public.intent_requests ir
      JOIN public.profiles pr ON pr.id = ir.recipient_id
      JOIN public.profiles pa ON pa.id = ir.actor_id
      LEFT JOIN public.notification_prefs np ON np.user_id = pr.user_id
      WHERE ir.status = 'pending'
        AND ir.expires_at > now()
        AND (ir.expires_at - now()) <= p_remind_before
        AND (ir.expires_at - now()) > GREATEST(p_remind_before - p_window, interval '0')
        AND pr.user_id IS NOT NULL
        AND pa.user_id IS NOT NULL
        AND COALESCE(np.push_enabled, true) = true
        AND public.is_quiet_hours(pr.user_id) = false
        AND NOT EXISTS (
          SELECT 1
          FROM public.intent_request_nudges n
          WHERE n.intent_request_id = ir.id
            AND n.kind = 'recipient_expiring_soon'
            AND n.user_id = pr.user_id
        )
        AND NOT EXISTS (
          SELECT 1
          FROM public.blocks b
          WHERE (b.blocker_id = pa.user_id AND b.blocked_id = pr.user_id)
             OR (b.blocker_id = pr.user_id AND b.blocked_id = pa.user_id)
        )
    ),
    reserved AS (
      INSERT INTO public.intent_request_nudges (intent_request_id, kind, user_id, metadata)
      SELECT
        c.request_id,
        'recipient_expiring_soon',
        c.recipient_user_id,
        jsonb_build_object(
          'remind_before', p_remind_before::text,
          'window', p_window::text,
          'request_type', c.request_type
        )
      FROM candidates c
      ON CONFLICT (intent_request_id, kind, user_id) DO NOTHING
      RETURNING intent_request_id, user_id
    ),
    to_send AS (
      SELECT c.*
      FROM candidates c
      JOIN reserved r
        ON r.intent_request_id = c.request_id
       AND r.user_id = c.recipient_user_id
    )
    SELECT * FROM to_send
  ) AS t;

  GET DIAGNOSTICS v_reminders_sent = ROW_COUNT;

  RETURN jsonb_build_object(
    'expired_marked', v_expired_marked,
    'expired_system_messages', v_expired_system_messages,
    'reminders_sent', v_reminders_sent
  );
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_process_intent_request_jobs(interval, interval) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_process_intent_request_jobs(interval, interval) TO service_role;

