-- Fix ambiguous window_bucket reference in bump_rate_limit

CREATE OR REPLACE FUNCTION public.bump_rate_limit(
  p_key text,
  p_window_seconds integer,
  p_limit integer
)
RETURNS TABLE(allowed boolean, current_count integer, window_bucket_out bigint)
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
  RETURNING (public.rate_limits.count <= p_limit), public.rate_limits.count, public.rate_limits.window_bucket
  INTO allowed, current_count, window_bucket_out;

  RETURN NEXT;
END;
$$;
