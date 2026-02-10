-- Migration: store Expo push tokens
CREATE TABLE IF NOT EXISTS public.push_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  token text NOT NULL,
  platform text NOT NULL,
  device_id text,
  app_version text,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT push_tokens_unique UNIQUE (token)
);

CREATE INDEX IF NOT EXISTS idx_push_tokens_user ON public.push_tokens (user_id);
CREATE INDEX IF NOT EXISTS idx_push_tokens_platform ON public.push_tokens (platform);

ALTER TABLE public.push_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their push tokens" ON public.push_tokens;
CREATE POLICY "Users can view their push tokens" ON public.push_tokens
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can upsert their push tokens" ON public.push_tokens;
CREATE POLICY "Users can upsert their push tokens" ON public.push_tokens
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their push tokens" ON public.push_tokens;
CREATE POLICY "Users can update their push tokens" ON public.push_tokens
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their push tokens" ON public.push_tokens;
CREATE POLICY "Users can delete their push tokens" ON public.push_tokens
FOR DELETE
TO authenticated
USING (auth.uid() = user_id);
