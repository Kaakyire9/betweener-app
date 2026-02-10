-- Migration: intent requests (Requests/Intent tab)
CREATE TABLE IF NOT EXISTS public.intent_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  actor_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('connect','date_request','like_with_note','circle_intro')),
  message text NULL,
  suggested_time timestamptz NULL,
  suggested_place text NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','passed','expired','cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_intent_requests_pending_unique
  ON public.intent_requests (recipient_id, actor_id, type)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_intent_requests_recipient_status
  ON public.intent_requests (recipient_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_intent_requests_actor_status
  ON public.intent_requests (actor_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_intent_requests_expires_at
  ON public.intent_requests (expires_at);

ALTER TABLE public.intent_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Intent requests read" ON public.intent_requests;
CREATE POLICY "Intent requests read" ON public.intent_requests
FOR SELECT
TO authenticated
USING (recipient_id = auth.uid() OR actor_id = auth.uid());

DROP POLICY IF EXISTS "Intent requests insert" ON public.intent_requests;
CREATE POLICY "Intent requests insert" ON public.intent_requests
FOR INSERT
TO authenticated
WITH CHECK (actor_id = auth.uid() AND recipient_id <> actor_id);

-- No direct UPDATE policy: updates should go through RPCs.

CREATE OR REPLACE FUNCTION public.rpc_mark_expired_intent_requests()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  updated_count integer;
BEGIN
  UPDATE public.intent_requests
  SET status = 'expired'
  WHERE status = 'pending'
    AND expires_at < now();
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count;
END;
$$;

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
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid;
  v_existing_id uuid;
  v_expires_at timestamptz;
  v_today_count integer;
BEGIN
  v_actor_id := auth.uid();
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_recipient_id = v_actor_id THEN
    RAISE EXCEPTION 'Cannot request yourself';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_recipient_id) THEN
    RAISE EXCEPTION 'Recipient not found';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.blocks b
    WHERE (b.blocker_id = p_recipient_id AND b.blocked_id = v_actor_id)
       OR (b.blocker_id = v_actor_id AND b.blocked_id = p_recipient_id)
  ) THEN
    RAISE EXCEPTION 'Blocked';
  END IF;

  UPDATE public.intent_requests
  SET status = 'expired'
  WHERE status = 'pending'
    AND expires_at < now()
    AND recipient_id = p_recipient_id
    AND actor_id = v_actor_id
    AND type = p_type;

  SELECT id
  INTO v_existing_id
  FROM public.intent_requests
  WHERE recipient_id = p_recipient_id
    AND actor_id = v_actor_id
    AND type = p_type
    AND status = 'pending'
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    RETURN v_existing_id;
  END IF;

  SELECT COUNT(*)
  INTO v_today_count
  FROM public.intent_requests
  WHERE actor_id = v_actor_id
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
    v_actor_id,
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

CREATE OR REPLACE FUNCTION public.rpc_decide_intent_request(
  p_request_id uuid,
  p_decision text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF p_decision NOT IN ('accept','pass') THEN
    RAISE EXCEPTION 'Invalid decision';
  END IF;

  UPDATE public.intent_requests
  SET status = CASE WHEN p_decision = 'accept' THEN 'accepted' ELSE 'passed' END
  WHERE id = p_request_id
    AND recipient_id = auth.uid()
    AND status = 'pending'
    AND expires_at > now()
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    RAISE EXCEPTION 'Request not found or expired';
  END IF;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_cancel_intent_request(
  p_request_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  UPDATE public.intent_requests
  SET status = 'cancelled'
  WHERE id = p_request_id
    AND actor_id = auth.uid()
    AND status = 'pending'
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    RAISE EXCEPTION 'Request not found or not pending';
  END IF;

  RETURN v_id;
END;
$$;
