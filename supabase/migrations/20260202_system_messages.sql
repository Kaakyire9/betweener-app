-- Migration: system messages (chat system events)
CREATE TABLE IF NOT EXISTS public.system_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  peer_user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  intent_request_id uuid NULL REFERENCES public.intent_requests (id) ON DELETE CASCADE,
  event_type text NOT NULL DEFAULT 'request_accepted',
  text text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_system_messages_user_peer_created
  ON public.system_messages (user_id, peer_user_id, created_at DESC);

DROP INDEX IF EXISTS idx_system_messages_request_user_unique;
CREATE UNIQUE INDEX IF NOT EXISTS idx_system_messages_request_user_unique
  ON public.system_messages (intent_request_id, user_id);

ALTER TABLE public.system_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "System messages read" ON public.system_messages;
CREATE POLICY "System messages read" ON public.system_messages
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- Inserts must go through RPC.

CREATE OR REPLACE FUNCTION public.rpc_insert_request_acceptance_system_messages(
  p_request_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request record;
  v_actor_user uuid;
  v_actor_name text;
  v_recipient_user uuid;
  v_recipient_name text;
BEGIN
  SELECT *
  INTO v_request
  FROM public.intent_requests
  WHERE id = p_request_id;

  IF v_request.id IS NULL THEN
    RAISE EXCEPTION 'Request not found';
  END IF;

  SELECT user_id, full_name
  INTO v_actor_user, v_actor_name
  FROM public.profiles
  WHERE id = v_request.actor_id
  LIMIT 1;

  SELECT user_id, full_name
  INTO v_recipient_user, v_recipient_name
  FROM public.profiles
  WHERE id = v_request.recipient_id
  LIMIT 1;

  IF v_actor_user IS NULL OR v_recipient_user IS NULL THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Support apps that use profile.id as auth uid as well as profile.user_id.
  IF v_recipient_user <> auth.uid() AND v_request.recipient_id <> auth.uid() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  INSERT INTO public.system_messages (
    user_id,
    peer_user_id,
    intent_request_id,
    event_type,
    text,
    metadata
  )
  VALUES (
    v_actor_user,
    v_recipient_user,
    p_request_id,
    'request_accepted',
    COALESCE(v_recipient_name, 'They') || ' accepted your request. Start with a thoughtful hello.',
    jsonb_build_object('role', 'requester')
  )
  ON CONFLICT (intent_request_id, user_id) DO NOTHING;

  INSERT INTO public.system_messages (
    user_id,
    peer_user_id,
    intent_request_id,
    event_type,
    text,
    metadata
  )
  VALUES (
    v_recipient_user,
    v_actor_user,
    p_request_id,
    'request_accepted',
    'You accepted ' || COALESCE(v_actor_name, 'their') || '''s request. It''s time to shine.',
    jsonb_build_object('role', 'accepter')
  )
  ON CONFLICT (intent_request_id, user_id) DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_system_message_push()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
BEGIN
  -- Only push to the requester; accepter gets in-app system message only.
  IF COALESCE(NEW.metadata->>'role', '') = 'accepter' THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.notification_prefs p
    WHERE p.user_id = NEW.user_id
      AND p.push_enabled = false
  ) THEN
    RETURN NEW;
  END IF;

  IF public.is_quiet_hours(NEW.user_id) THEN
    RETURN NEW;
  END IF;

  PERFORM private.send_push_webhook(
    jsonb_build_object(
      'user_id', NEW.user_id,
      'title', 'Request update',
      'body', NEW.text,
      'data', jsonb_build_object(
        'type', 'system_message',
        'event_type', NEW.event_type,
        'peer_user_id', NEW.peer_user_id,
        'intent_request_id', NEW.intent_request_id
      )
    )
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notify_system_message_push ON public.system_messages;
CREATE TRIGGER notify_system_message_push
AFTER INSERT ON public.system_messages
FOR EACH ROW
EXECUTE FUNCTION public.notify_system_message_push();

CREATE OR REPLACE FUNCTION public.notify_intent_request_push()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  recipient_user_id uuid;
  actor_name text;
BEGIN
  SELECT user_id
  INTO recipient_user_id
  FROM public.profiles
  WHERE id = NEW.recipient_id
  LIMIT 1;

  IF recipient_user_id IS NULL THEN
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

  SELECT full_name
  INTO actor_name
  FROM public.profiles
  WHERE id = NEW.actor_id
  LIMIT 1;

  PERFORM private.send_push_webhook(
    jsonb_build_object(
      'user_id', recipient_user_id,
      'title', 'New request',
      'body', COALESCE(actor_name, 'Someone') || ' sent you a request.',
      'data', jsonb_build_object(
        'type', 'intent_request',
        'request_id', NEW.id,
        'request_type', NEW.type,
        'actor_id', NEW.actor_id,
        'recipient_id', NEW.recipient_id
      )
    )
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notify_intent_request_push ON public.intent_requests;
CREATE TRIGGER notify_intent_request_push
AFTER INSERT ON public.intent_requests
FOR EACH ROW
EXECUTE FUNCTION public.notify_intent_request_push();

ALTER TABLE public.system_messages REPLICA IDENTITY FULL;
ALTER TABLE public.intent_requests REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'system_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.system_messages;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'intent_requests'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.intent_requests;
  END IF;
END $$;
