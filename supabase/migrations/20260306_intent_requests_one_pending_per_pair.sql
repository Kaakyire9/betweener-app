-- Guardrail: only one pending intent_request may exist between two profiles at a time (any type, either direction).
--
-- Why:
-- - Prevents "Connect + Date + Like" spam from the same person while the first request is still pending.
-- - Prevents crossed-requests (A->B pending while B->A tries to send).
--
-- Notes:
-- - This is enforced at the RPC layer (source of truth for clients).
-- - We keep the older per-type unique index, but this adds the UX rule testers expect.

CREATE OR REPLACE FUNCTION public.rpc_create_intent_request(
  p_recipient_id uuid,
  p_type text,
  p_message text DEFAULT NULL,
  p_suggested_time timestamptz DEFAULT NULL,
  p_suggested_place text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_actor_user_id uuid;
  v_actor_profile_id uuid;
  v_recipient_user_id uuid;
  v_existing_id uuid;
  v_incoming_id uuid;
  v_expires_at timestamptz;
  v_today_count integer;
BEGIN
  v_actor_user_id := auth.uid();
  IF v_actor_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT p.id
    INTO v_actor_profile_id
  FROM public.profiles p
  WHERE p.user_id = v_actor_user_id
  LIMIT 1;

  IF v_actor_profile_id IS NULL THEN
    RAISE EXCEPTION 'Profile not found';
  END IF;

  IF p_recipient_id = v_actor_profile_id THEN
    RAISE EXCEPTION 'Cannot request yourself';
  END IF;

  SELECT p.user_id
    INTO v_recipient_user_id
  FROM public.profiles p
  WHERE p.id = p_recipient_id
  LIMIT 1;

  IF v_recipient_user_id IS NULL THEN
    RAISE EXCEPTION 'Recipient not found';
  END IF;

  -- Blocks are stored by user_id, not profile_id.
  IF EXISTS (
    SELECT 1
    FROM public.blocks b
    WHERE (b.blocker_id = v_recipient_user_id AND b.blocked_id = v_actor_user_id)
       OR (b.blocker_id = v_actor_user_id AND b.blocked_id = v_recipient_user_id)
  ) THEN
    RAISE EXCEPTION 'Blocked';
  END IF;

  -- If users are already matched (mutual-like match or accepted), don't allow new intents/requests between them.
  IF EXISTS (
    SELECT 1
    FROM public.matches m
    WHERE m.status IN ('PENDING', 'ACCEPTED')
      AND (
        (m.user1_id = v_actor_profile_id AND m.user2_id = p_recipient_id)
        OR (m.user1_id = p_recipient_id AND m.user2_id = v_actor_profile_id)
      )
  ) THEN
    RAISE EXCEPTION 'Already matched';
  END IF;

  -- Expire any stale pending requests between these profiles (either direction).
  UPDATE public.intent_requests
  SET status = 'expired'
  WHERE status = 'pending'
    AND expires_at < now()
    AND (
      (recipient_id = p_recipient_id AND actor_id = v_actor_profile_id)
      OR (recipient_id = v_actor_profile_id AND actor_id = p_recipient_id)
    );

  -- If there's already an outgoing pending request to this profile (any type), block creating another.
  SELECT id
    INTO v_existing_id
  FROM public.intent_requests
  WHERE recipient_id = p_recipient_id
    AND actor_id = v_actor_profile_id
    AND status = 'pending'
    AND expires_at > now()
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    RAISE EXCEPTION 'You''ve already placed a request. Please wait for their response.';
  END IF;

  -- If there's an incoming pending request from this profile, user should accept/pass it (no cross-requests).
  SELECT id
    INTO v_incoming_id
  FROM public.intent_requests
  WHERE recipient_id = v_actor_profile_id
    AND actor_id = p_recipient_id
    AND status = 'pending'
    AND expires_at > now()
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_incoming_id IS NOT NULL THEN
    RAISE EXCEPTION 'You already have a request from them. Open Intent to respond.';
  END IF;

  SELECT COUNT(*)
    INTO v_today_count
  FROM public.intent_requests
  WHERE actor_id = v_actor_profile_id
    AND type = p_type
    AND created_at >= date_trunc('day', now());

  IF p_type = 'connect' AND v_today_count >= 20 THEN
    RAISE EXCEPTION 'Connect quota exceeded';
  END IF;
  IF p_type = 'date_request' AND v_today_count >= 5 THEN
    RAISE EXCEPTION 'Date request quota exceeded';
  END IF;

  v_expires_at := CASE p_type
    WHEN 'date_request' THEN now() + interval '24 hours'
    WHEN 'like_with_note' THEN now() + interval '72 hours'
    ELSE now() + interval '48 hours'
  END;

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
    p_recipient_id,
    v_actor_profile_id,
    p_type,
    p_message,
    p_suggested_time,
    p_suggested_place,
    'pending',
    now(),
    v_expires_at,
    COALESCE(p_metadata, '{}'::jsonb)
  )
  RETURNING id INTO v_existing_id;

  RETURN v_existing_id;
END;
$$;
