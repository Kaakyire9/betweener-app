-- Migration: add per-user pinned messages
CREATE TABLE IF NOT EXISTS public.message_pins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL,
  user_id uuid NOT NULL,
  peer_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_message_pins_message FOREIGN KEY (message_id) REFERENCES public.messages (id) ON DELETE CASCADE,
  CONSTRAINT fk_message_pins_user FOREIGN KEY (user_id) REFERENCES auth.users (id) ON DELETE CASCADE,
  CONSTRAINT fk_message_pins_peer FOREIGN KEY (peer_id) REFERENCES auth.users (id) ON DELETE CASCADE,
  CONSTRAINT message_pins_unique UNIQUE (user_id, message_id),
  CONSTRAINT cannot_pin_self_message CHECK (user_id <> peer_id)
);

CREATE INDEX IF NOT EXISTS idx_message_pins_user ON public.message_pins (user_id);
CREATE INDEX IF NOT EXISTS idx_message_pins_peer ON public.message_pins (peer_id);
CREATE INDEX IF NOT EXISTS idx_message_pins_message ON public.message_pins (message_id);

ALTER TABLE public.message_pins ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their pins" ON public.message_pins;
CREATE POLICY "Users can view their pins" ON public.message_pins
FOR SELECT
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can pin messages" ON public.message_pins;
CREATE POLICY "Users can pin messages" ON public.message_pins
FOR INSERT
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can unpin messages" ON public.message_pins;
CREATE POLICY "Users can unpin messages" ON public.message_pins
FOR DELETE
USING (auth.uid() = user_id);
