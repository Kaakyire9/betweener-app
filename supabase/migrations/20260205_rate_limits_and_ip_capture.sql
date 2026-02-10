-- Migration: rate limits + server-side IP capture for phone verification

CREATE TABLE IF NOT EXISTS public.rate_limits (
  key text NOT NULL,
  window_seconds integer NOT NULL,
  window_bucket bigint NOT NULL,
  count integer NOT NULL DEFAULT 0,
  last_request_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rate_limits_pkey PRIMARY KEY (key, window_seconds, window_bucket)
);

CREATE INDEX IF NOT EXISTS idx_rate_limits_key
  ON public.rate_limits (key);

ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;

-- Only service role should access this table. No public policies defined.

CREATE OR REPLACE FUNCTION public.bump_rate_limit(
  p_key text,
  p_window_seconds integer,
  p_limit integer
)
RETURNS TABLE(allowed boolean, current_count integer, window_bucket bigint)
LANGUAGE plpgsql
AS $$
DECLARE
  v_bucket bigint;
BEGIN
  v_bucket := floor(extract(epoch from now()) / p_window_seconds);

  INSERT INTO public.rate_limits (key, window_seconds, window_bucket, count, last_request_at)
  VALUES (p_key, p_window_seconds, v_bucket, 1, now())
  ON CONFLICT (key, window_seconds, window_bucket)
  DO UPDATE SET
    count = public.rate_limits.count + 1,
    last_request_at = now()
  RETURNING (public.rate_limits.count <= p_limit), public.rate_limits.count, v_bucket
  INTO allowed, current_count, window_bucket;

  RETURN NEXT;
END;
$$;

-- Capture server-side request metadata on phone verifications
ALTER TABLE public.phone_verifications
  ADD COLUMN IF NOT EXISTS request_ip text,
  ADD COLUMN IF NOT EXISTS request_user_agent text;
