-- Migration: add soft delete + per-user hides for messages
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS deleted_for_all boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by uuid;

ALTER TABLE public.messages
  DROP CONSTRAINT IF EXISTS fk_messages_deleted_by;

ALTER TABLE public.messages
  ADD CONSTRAINT fk_messages_deleted_by
  FOREIGN KEY (deleted_by) REFERENCES auth.users (id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.message_hides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL,
  user_id uuid NOT NULL,
  peer_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_message_hides_message FOREIGN KEY (message_id) REFERENCES public.messages (id) ON DELETE CASCADE,
  CONSTRAINT fk_message_hides_user FOREIGN KEY (user_id) REFERENCES auth.users (id) ON DELETE CASCADE,
  CONSTRAINT fk_message_hides_peer FOREIGN KEY (peer_id) REFERENCES auth.users (id) ON DELETE CASCADE,
  CONSTRAINT message_hides_unique UNIQUE (user_id, message_id),
  CONSTRAINT cannot_hide_self_message CHECK (user_id <> peer_id)
);

CREATE INDEX IF NOT EXISTS idx_message_hides_user ON public.message_hides (user_id);
CREATE INDEX IF NOT EXISTS idx_message_hides_peer ON public.message_hides (peer_id);
CREATE INDEX IF NOT EXISTS idx_message_hides_message ON public.message_hides (message_id);
CREATE INDEX IF NOT EXISTS idx_message_hides_user_peer ON public.message_hides (user_id, peer_id);

ALTER TABLE public.message_hides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their hidden messages" ON public.message_hides;
CREATE POLICY "Users can view their hidden messages" ON public.message_hides
FOR SELECT
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can hide messages" ON public.message_hides;
CREATE POLICY "Users can hide messages" ON public.message_hides
FOR INSERT
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own messages" ON public.messages;
CREATE POLICY "Users can delete own messages" ON public.messages
FOR UPDATE
USING (auth.uid() = sender_id)
WITH CHECK (auth.uid() = sender_id AND deleted_for_all = true);
