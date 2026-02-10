-- Migration: enable RLS + policies for push_tokens

ALTER TABLE public.push_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS push_tokens_select_own ON public.push_tokens;
DROP POLICY IF EXISTS push_tokens_insert_own ON public.push_tokens;
DROP POLICY IF EXISTS push_tokens_update_own ON public.push_tokens;
DROP POLICY IF EXISTS push_tokens_delete_own ON public.push_tokens;

CREATE POLICY push_tokens_select_own
ON public.push_tokens
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY push_tokens_insert_own
ON public.push_tokens
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY push_tokens_update_own
ON public.push_tokens
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY push_tokens_delete_own
ON public.push_tokens
FOR DELETE
USING (auth.uid() = user_id);

-- Upsert helper to safely reassign tokens between accounts on the same device
CREATE OR REPLACE FUNCTION public.upsert_push_token(
  p_user_id uuid,
  p_token text,
  p_platform text,
  p_device_id text,
  p_app_version text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Prevent callers from spoofing user_id
  IF auth.uid() IS NULL OR auth.uid() <> p_user_id THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  INSERT INTO public.push_tokens (
    user_id,
    token,
    platform,
    device_id,
    app_version,
    last_seen_at,
    updated_at
  )
  VALUES (
    p_user_id,
    p_token,
    p_platform,
    p_device_id,
    p_app_version,
    now(),
    now()
  )
  ON CONFLICT (token)
  DO UPDATE SET
    user_id = EXCLUDED.user_id,
    platform = EXCLUDED.platform,
    device_id = EXCLUDED.device_id,
    app_version = EXCLUDED.app_version,
    last_seen_at = now(),
    updated_at = now();
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_push_token(uuid, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_push_token(uuid, text, text, text, text) TO authenticated;
