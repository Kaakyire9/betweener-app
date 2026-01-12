-- Migration: add reply_to_message_id for message replies
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS reply_to_message_id uuid;

ALTER TABLE public.messages
  DROP CONSTRAINT IF EXISTS fk_messages_reply_to;

ALTER TABLE public.messages
  ADD CONSTRAINT fk_messages_reply_to
  FOREIGN KEY (reply_to_message_id) REFERENCES public.messages (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_messages_reply_to ON public.messages (reply_to_message_id);
