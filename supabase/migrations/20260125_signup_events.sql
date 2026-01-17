-- Migration: signup events for SMS-first onboarding (IP + geo + auth method)
CREATE TABLE IF NOT EXISTS public.signup_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  signup_session_id text NOT NULL,
  user_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  phone_number text,
  phone_verified boolean NOT NULL DEFAULT false,
  auth_method text,
  oauth_provider text,
  ip_address text,
  ip_country text,
  ip_region text,
  ip_city text,
  ip_timezone text,
  geo_lat numeric,
  geo_lng numeric,
  geo_accuracy numeric,
  device_os text,
  device_model text,
  app_version text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT signup_events_session_unique UNIQUE (signup_session_id)
);

CREATE INDEX IF NOT EXISTS idx_signup_events_user ON public.signup_events (user_id);
CREATE INDEX IF NOT EXISTS idx_signup_events_session ON public.signup_events (signup_session_id);
CREATE INDEX IF NOT EXISTS idx_signup_events_created_at ON public.signup_events (created_at DESC);

ALTER TABLE public.signup_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anon can log signup events" ON public.signup_events;
CREATE POLICY "Anon can log signup events" ON public.signup_events
FOR INSERT
TO anon
WITH CHECK (user_id IS NULL);

DROP POLICY IF EXISTS "Authed can log signup events" ON public.signup_events;
CREATE POLICY "Authed can log signup events" ON public.signup_events
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their signup event" ON public.signup_events;
CREATE POLICY "Users can update their signup event" ON public.signup_events
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id OR user_id IS NULL)
WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

DROP POLICY IF EXISTS "Users can view their signup events" ON public.signup_events;
CREATE POLICY "Users can view their signup events" ON public.signup_events
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.bump_signup_events_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_timestamp_signup_events ON public.signup_events;
CREATE TRIGGER set_timestamp_signup_events
BEFORE UPDATE ON public.signup_events
FOR EACH ROW
EXECUTE FUNCTION public.bump_signup_events_updated_at();
