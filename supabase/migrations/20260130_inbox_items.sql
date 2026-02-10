-- Migration: inbox items (actionable notifications)
CREATE TABLE IF NOT EXISTS public.inbox_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  type text NOT NULL,
  actor_id uuid,
  entity_id uuid,
  entity_type text,
  title text NOT NULL,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz,
  action_required boolean NOT NULL DEFAULT false,
  metadata jsonb,
  CONSTRAINT inbox_items_type_check CHECK (
    type IN (
      'LIKE_RECEIVED',
      'SUPERLIKE_RECEIVED',
      'MESSAGE_REQUEST',
      'NEW_MESSAGE',
      'MOMENT_REACTION',
      'MOMENT_COMMENT',
      'GIFT_RECEIVED',
      'MATCH_CREATED',
      'SYSTEM'
    )
  )
);

CREATE INDEX IF NOT EXISTS idx_inbox_items_user_read ON public.inbox_items (user_id, read_at);
CREATE INDEX IF NOT EXISTS idx_inbox_items_user_action_created ON public.inbox_items (user_id, action_required, created_at DESC);

ALTER TABLE public.inbox_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their inbox items" ON public.inbox_items;
CREATE POLICY "Users can view their inbox items" ON public.inbox_items
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their inbox items" ON public.inbox_items;
CREATE POLICY "Users can insert their inbox items" ON public.inbox_items
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their inbox items" ON public.inbox_items;
CREATE POLICY "Users can update their inbox items" ON public.inbox_items
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their inbox items" ON public.inbox_items;
CREATE POLICY "Users can delete their inbox items" ON public.inbox_items
FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

ALTER TABLE public.inbox_items REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'inbox_items'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.inbox_items;
  END IF;
END $$;
