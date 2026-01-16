-- Migration: E2EE view-once media only (image/video)

-- Identity public key for encryption
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS public_key text;

-- Message fields for encrypted view-once media
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS is_view_once boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS encrypted_media boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS encrypted_media_path text,
  ADD COLUMN IF NOT EXISTS encrypted_key_sender text,
  ADD COLUMN IF NOT EXISTS encrypted_key_receiver text,
  ADD COLUMN IF NOT EXISTS encrypted_key_nonce text,
  ADD COLUMN IF NOT EXISTS encrypted_media_nonce text,
  ADD COLUMN IF NOT EXISTS encrypted_media_alg text,
  ADD COLUMN IF NOT EXISTS encrypted_media_mime text,
  ADD COLUMN IF NOT EXISTS encrypted_media_size integer;

ALTER TABLE public.messages
  DROP CONSTRAINT IF EXISTS message_view_once_media_only;
ALTER TABLE public.messages
  ADD CONSTRAINT message_view_once_media_only
  CHECK (NOT is_view_once OR message_type IN ('image','video'));

ALTER TABLE public.messages
  DROP CONSTRAINT IF EXISTS message_encrypted_media_only;
ALTER TABLE public.messages
  ADD CONSTRAINT message_encrypted_media_only
  CHECK (NOT encrypted_media OR message_type IN ('image','video'));

ALTER TABLE public.messages
  DROP CONSTRAINT IF EXISTS message_view_once_requires_encryption;
ALTER TABLE public.messages
  ADD CONSTRAINT message_view_once_requires_encryption
  CHECK (NOT is_view_once OR encrypted_media = true);

ALTER TABLE public.messages
  DROP CONSTRAINT IF EXISTS message_encrypted_media_requires_keys;
ALTER TABLE public.messages
  ADD CONSTRAINT message_encrypted_media_requires_keys
  CHECK (
    NOT encrypted_media
    OR (
      encrypted_key_sender IS NOT NULL
      AND encrypted_key_receiver IS NOT NULL
      AND encrypted_key_nonce IS NOT NULL
      AND encrypted_media_nonce IS NOT NULL
      AND encrypted_media_path IS NOT NULL
    )
  );

ALTER TABLE public.messages
  DROP CONSTRAINT IF EXISTS message_encrypted_media_requires_view_once;
ALTER TABLE public.messages
  ADD CONSTRAINT message_encrypted_media_requires_view_once
  CHECK (NOT encrypted_media OR is_view_once = true);

CREATE TABLE IF NOT EXISTS public.message_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES public.messages (id) ON DELETE CASCADE,
  viewer_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT message_views_unique UNIQUE (message_id, viewer_id)
);

CREATE INDEX IF NOT EXISTS idx_message_views_message ON public.message_views (message_id);
CREATE INDEX IF NOT EXISTS idx_message_views_viewer ON public.message_views (viewer_id);

ALTER TABLE public.message_views ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view view-once receipts" ON public.message_views;
CREATE POLICY "Users can view view-once receipts" ON public.message_views
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.messages m
    WHERE m.id = message_id
      AND (m.sender_id = auth.uid() OR m.receiver_id = auth.uid())
  )
);

DROP POLICY IF EXISTS "Recipients can mark view-once viewed" ON public.message_views;
CREATE POLICY "Recipients can mark view-once viewed" ON public.message_views
FOR INSERT
WITH CHECK (
  viewer_id = auth.uid()
  AND EXISTS (
    SELECT 1
    FROM public.messages m
    WHERE m.id = message_id
      AND m.receiver_id = auth.uid()
      AND m.is_view_once = true
      AND m.message_type IN ('image','video')
  )
);

ALTER TABLE public.message_views REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'message_views'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.message_views;
  END IF;
END $$;
