-- Migration: message edit history + edited indicator
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS edited_at timestamptz;

CREATE TABLE IF NOT EXISTS public.message_edits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES public.messages (id) ON DELETE CASCADE,
  editor_user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  previous_text text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_message_edits_message_created_at
  ON public.message_edits (message_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_message_edits_editor_created_at
  ON public.message_edits (editor_user_id, created_at DESC);

ALTER TABLE public.message_edits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view edit history for their messages" ON public.message_edits;
CREATE POLICY "Users can view edit history for their messages" ON public.message_edits
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.messages m
    WHERE m.id = message_id
      AND (m.sender_id = auth.uid() OR m.receiver_id = auth.uid())
  )
);

DROP POLICY IF EXISTS "Users can log edits for their messages" ON public.message_edits;
CREATE POLICY "Users can log edits for their messages" ON public.message_edits
FOR INSERT
WITH CHECK (
  editor_user_id = auth.uid()
  AND EXISTS (
    SELECT 1
    FROM public.messages m
    WHERE m.id = message_id
      AND m.sender_id = auth.uid()
      AND m.message_type = 'text'
      AND m.deleted_for_all = false
  )
);

CREATE OR REPLACE FUNCTION public.edit_message(message_id uuid, new_text text)
RETURNS SETOF public.messages
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  existing public.messages%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN;
  END IF;

  SELECT * INTO existing
  FROM public.messages
  WHERE id = edit_message.message_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF existing.sender_id <> auth.uid() THEN
    RETURN;
  END IF;

  IF existing.message_type <> 'text' OR existing.deleted_for_all THEN
    RETURN;
  END IF;

  IF new_text IS NULL OR btrim(new_text) = '' THEN
    RETURN;
  END IF;

  IF new_text = existing.text THEN
    RETURN QUERY SELECT * FROM public.messages WHERE id = existing.id;
    RETURN;
  END IF;

  INSERT INTO public.message_edits (message_id, editor_user_id, previous_text)
  VALUES (existing.id, auth.uid(), COALESCE(existing.text, ''));

  RETURN QUERY
  UPDATE public.messages
  SET text = new_text,
      edited_at = now()
  WHERE id = existing.id
  RETURNING *;
END;
$$;

REVOKE ALL ON FUNCTION public.edit_message(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.edit_message(uuid, text) TO authenticated;
