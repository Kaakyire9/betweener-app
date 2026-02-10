-- Migration: update message_type_valid constraint to allow location
ALTER TABLE public.messages
  DROP CONSTRAINT IF EXISTS message_type_valid;

ALTER TABLE public.messages
  ADD CONSTRAINT message_type_valid
  CHECK (message_type IN ('text','voice','image','video','mood_sticker','location'));
