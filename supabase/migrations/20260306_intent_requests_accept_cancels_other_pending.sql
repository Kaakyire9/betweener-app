-- When a recipient accepts an intent request, close out any other pending requests between the same two profiles.
--
-- Why:
-- - Prevents the "Incoming" list from showing multiple pending items from the same person after you accepted one.
-- - Reduces confusing post-match noise (accepted connection should supersede other pending requests).

CREATE OR REPLACE FUNCTION public.rpc_decide_intent_request(
  p_request_id uuid,
  p_decision text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_user_id uuid;
  v_profile_id uuid;
  v_id uuid;
  v_actor_profile_id uuid;
  v_recipient_profile_id uuid;
BEGIN
  IF p_decision NOT IN ('accept','pass') THEN
    RAISE EXCEPTION 'Invalid decision';
  END IF;

  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT p.id
    INTO v_profile_id
  FROM public.profiles p
  WHERE p.user_id = v_user_id
  LIMIT 1;

  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'Profile not found';
  END IF;

  UPDATE public.intent_requests
  SET status = CASE WHEN p_decision = 'accept' THEN 'accepted' ELSE 'passed' END
  WHERE id = p_request_id
    AND recipient_id = v_profile_id
    AND status = 'pending'
    AND expires_at > now()
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    RAISE EXCEPTION 'Request not found or expired';
  END IF;

  -- If accepted, mark any other pending requests between these two profiles as passed.
  IF p_decision = 'accept' THEN
    SELECT actor_id, recipient_id
      INTO v_actor_profile_id, v_recipient_profile_id
    FROM public.intent_requests
    WHERE id = p_request_id
    LIMIT 1;

    UPDATE public.intent_requests
    SET status = 'passed'
    WHERE status = 'pending'
      AND expires_at > now()
      AND id <> p_request_id
      AND (
        (actor_id = v_actor_profile_id AND recipient_id = v_recipient_profile_id)
        OR (actor_id = v_recipient_profile_id AND recipient_id = v_actor_profile_id)
      );
  END IF;

  RETURN v_id;
END;
$$;

