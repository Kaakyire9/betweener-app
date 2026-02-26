-- Fix: private.send_push_webhook was passing "headers" as query params for pg_net http_post,
-- resulting in requests like:
--   /push-notifications?Content-Type=application/json&x-push-secret=...
-- This can break auth (e.g., secrets pasted with trailing newline become %0D%0A) and is not intended.
--
-- Use named arguments so headers are actually sent as headers, and trim webhook_secret.

CREATE OR REPLACE FUNCTION private.send_push_webhook(payload jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public, net
AS $$
DECLARE
  cfg record;
  v_secret text;
BEGIN
  SELECT webhook_url, webhook_secret
  INTO cfg
  FROM private.push_config
  WHERE id = 1;

  IF cfg.webhook_url IS NULL OR cfg.webhook_secret IS NULL THEN
    RETURN;
  END IF;

  -- Prevent accidental copy/paste whitespace/newlines from breaking auth.
  v_secret := btrim(cfg.webhook_secret);

  PERFORM net.http_post(
    url := cfg.webhook_url,
    body := payload,
    params := '{}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-push-secret', v_secret
    )
  );
EXCEPTION
  WHEN others THEN
    RETURN;
END;
$$;

