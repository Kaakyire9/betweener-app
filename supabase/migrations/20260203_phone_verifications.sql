-- Migration: phone verification sessions + signup score
-- Tracks SMS verification attempts before account creation.

CREATE TABLE IF NOT EXISTS public.phone_verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  signup_session_id text NOT NULL,
  user_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  phone_number text NOT NULL,
  verification_sid text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'verified', 'failed')),
  confidence_score numeric(5, 2) NOT NULL DEFAULT 0,
  carrier_name text,
  carrier_type text,
  attempts integer NOT NULL DEFAULT 0,
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- If the table already existed, ensure required columns are present.
ALTER TABLE public.phone_verifications
  ADD COLUMN IF NOT EXISTS signup_session_id text,
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS phone_number text,
  ADD COLUMN IF NOT EXISTS verification_sid text,
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS confidence_score numeric(5, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS carrier_name text,
  ADD COLUMN IF NOT EXISTS carrier_type text,
  ADD COLUMN IF NOT EXISTS attempts integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- Backfill required values if they were added after creation.
UPDATE public.phone_verifications
SET signup_session_id = COALESCE(signup_session_id, '')
WHERE signup_session_id IS NULL;

ALTER TABLE public.phone_verifications
  ALTER COLUMN signup_session_id SET NOT NULL,
  ALTER COLUMN phone_number SET NOT NULL,
  ALTER COLUMN status SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'phone_verifications_status_check'
      AND conrelid = 'public.phone_verifications'::regclass
  ) THEN
    ALTER TABLE public.phone_verifications
      ADD CONSTRAINT phone_verifications_status_check
      CHECK (status IN ('pending', 'verified', 'failed'));
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_phone_verifications_session
  ON public.phone_verifications (signup_session_id);
CREATE INDEX IF NOT EXISTS idx_phone_verifications_phone
  ON public.phone_verifications (phone_number);
CREATE INDEX IF NOT EXISTS idx_phone_verifications_user
  ON public.phone_verifications (user_id);
CREATE INDEX IF NOT EXISTS idx_phone_verifications_created_at
  ON public.phone_verifications (created_at DESC);

ALTER TABLE public.phone_verifications ENABLE ROW LEVEL SECURITY;

-- Only service role should access this table. No public policies defined.

ALTER TABLE public.signup_events
  ADD COLUMN IF NOT EXISTS phone_verification_score numeric(5, 2);

CREATE OR REPLACE FUNCTION public.bump_phone_verifications_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_timestamp_phone_verifications ON public.phone_verifications;
CREATE TRIGGER set_timestamp_phone_verifications
BEFORE UPDATE ON public.phone_verifications
FOR EACH ROW
EXECUTE FUNCTION public.bump_phone_verifications_updated_at();
