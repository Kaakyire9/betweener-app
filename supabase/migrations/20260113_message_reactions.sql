-- Migration: add per-message reactions
CREATE TABLE IF NOT EXISTS public.message_reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL,
  user_id uuid NOT NULL,
  emoji text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_message_reactions_message FOREIGN KEY (message_id) REFERENCES public.messages (id) ON DELETE CASCADE,
  CONSTRAINT fk_message_reactions_user FOREIGN KEY (user_id) REFERENCES auth.users (id) ON DELETE CASCADE,
  CONSTRAINT message_reactions_unique UNIQUE (message_id, user_id),
  CONSTRAINT message_reactions_emoji_check CHECK (char_length(emoji) > 0)
);

CREATE INDEX IF NOT EXISTS idx_message_reactions_message ON public.message_reactions (message_id);
CREATE INDEX IF NOT EXISTS idx_message_reactions_user ON public.message_reactions (user_id);

ALTER TABLE public.message_reactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view reactions" ON public.message_reactions;
CREATE POLICY "Users can view reactions" ON public.message_reactions
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.messages m
    WHERE m.id = message_id
      AND (m.sender_id = auth.uid() OR m.receiver_id = auth.uid())
  )
);

DROP POLICY IF EXISTS "Users can add reactions" ON public.message_reactions;
CREATE POLICY "Users can add reactions" ON public.message_reactions
FOR INSERT
WITH CHECK (
  auth.uid() = user_id
  AND EXISTS (
    SELECT 1
    FROM public.messages m
    WHERE m.id = message_id
      AND (m.sender_id = auth.uid() OR m.receiver_id = auth.uid())
  )
);

DROP POLICY IF EXISTS "Users can update own reactions" ON public.message_reactions;
CREATE POLICY "Users can update own reactions" ON public.message_reactions
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can remove own reactions" ON public.message_reactions;
CREATE POLICY "Users can remove own reactions" ON public.message_reactions
FOR DELETE
USING (auth.uid() = user_id);

ALTER TABLE public.message_reactions REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'message_reactions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.message_reactions;
  END IF;
END $$;
