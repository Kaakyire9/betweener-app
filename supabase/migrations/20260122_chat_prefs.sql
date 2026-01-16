-- Migration: server-side chat preferences (mute/pin)
CREATE TABLE IF NOT EXISTS public.chat_prefs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  peer_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  muted boolean NOT NULL DEFAULT false,
  pinned boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chat_prefs_unique UNIQUE (user_id, peer_id)
);

CREATE INDEX IF NOT EXISTS idx_chat_prefs_user ON public.chat_prefs (user_id);
CREATE INDEX IF NOT EXISTS idx_chat_prefs_peer ON public.chat_prefs (peer_id);

ALTER TABLE public.chat_prefs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their chat prefs" ON public.chat_prefs;
CREATE POLICY "Users can view their chat prefs" ON public.chat_prefs
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can upsert their chat prefs" ON public.chat_prefs;
CREATE POLICY "Users can upsert their chat prefs" ON public.chat_prefs
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their chat prefs" ON public.chat_prefs;
CREATE POLICY "Users can update their chat prefs" ON public.chat_prefs
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their chat prefs" ON public.chat_prefs;
CREATE POLICY "Users can delete their chat prefs" ON public.chat_prefs
FOR DELETE
TO authenticated
USING (auth.uid() = user_id);
