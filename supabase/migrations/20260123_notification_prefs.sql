-- Migration: notification preferences
CREATE TABLE IF NOT EXISTS public.notification_prefs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  push_enabled boolean NOT NULL DEFAULT true,
  inapp_enabled boolean NOT NULL DEFAULT true,
  messages boolean NOT NULL DEFAULT true,
  reactions boolean NOT NULL DEFAULT true,
  likes boolean NOT NULL DEFAULT true,
  superlikes boolean NOT NULL DEFAULT true,
  matches boolean NOT NULL DEFAULT true,
  moments boolean NOT NULL DEFAULT true,
  verification boolean NOT NULL DEFAULT true,
  announcements boolean NOT NULL DEFAULT false,
  preview_text boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT notification_prefs_unique UNIQUE (user_id)
);

CREATE INDEX IF NOT EXISTS idx_notification_prefs_user ON public.notification_prefs (user_id);

ALTER TABLE public.notification_prefs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their notification prefs" ON public.notification_prefs;
CREATE POLICY "Users can view their notification prefs" ON public.notification_prefs
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can upsert their notification prefs" ON public.notification_prefs;
CREATE POLICY "Users can upsert their notification prefs" ON public.notification_prefs
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their notification prefs" ON public.notification_prefs;
CREATE POLICY "Users can update their notification prefs" ON public.notification_prefs
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their notification prefs" ON public.notification_prefs;
CREATE POLICY "Users can delete their notification prefs" ON public.notification_prefs
FOR DELETE
TO authenticated
USING (auth.uid() = user_id);
