-- Fix: chat tables still referencing legacy public.users instead of auth.users.
--
-- Symptoms:
--   23503: Key is not present in table "users"
--   - messages.receiver_id / sender_id FK violations
--   - chat_prefs.peer_id FK violations
--
-- This migration:
-- - Best-effort converts profile-id based rows to auth user ids (when possible)
-- - Replaces foreign keys to reference auth.users (NOT VALID to avoid failing on any historic bad rows)
-- - Optionally attempts to VALIDATE constraints (best-effort)

-- 1) Best-effort backfill: convert any rows that accidentally stored profiles.id into *_id columns.
-- Only converts when the current value matches profiles.id and does NOT already exist in auth.users.
UPDATE public.messages m
SET sender_id = p.user_id
FROM public.profiles p
WHERE m.sender_id = p.id
  AND NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = m.sender_id);

UPDATE public.messages m
SET receiver_id = p.user_id
FROM public.profiles p
WHERE m.receiver_id = p.id
  AND NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = m.receiver_id);

UPDATE public.chat_prefs cp
SET peer_id = p.user_id
FROM public.profiles p
WHERE cp.peer_id = p.id
  AND NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = cp.peer_id);

UPDATE public.chat_prefs cp
SET user_id = p.user_id
FROM public.profiles p
WHERE cp.user_id = p.id
  AND NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = cp.user_id);

-- 2) Replace FKs on messages -> auth.users
ALTER TABLE public.messages
  DROP CONSTRAINT IF EXISTS fk_message_sender;
ALTER TABLE public.messages
  DROP CONSTRAINT IF EXISTS fk_message_receiver;

ALTER TABLE public.messages
  ADD CONSTRAINT fk_message_sender
  FOREIGN KEY (sender_id) REFERENCES auth.users (id) ON DELETE CASCADE NOT VALID;

ALTER TABLE public.messages
  ADD CONSTRAINT fk_message_receiver
  FOREIGN KEY (receiver_id) REFERENCES auth.users (id) ON DELETE CASCADE NOT VALID;

-- 3) Replace FKs on chat_prefs -> auth.users
ALTER TABLE public.chat_prefs
  DROP CONSTRAINT IF EXISTS chat_prefs_user_id_fkey;
ALTER TABLE public.chat_prefs
  DROP CONSTRAINT IF EXISTS chat_prefs_peer_id_fkey;

ALTER TABLE public.chat_prefs
  ADD CONSTRAINT chat_prefs_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users (id) ON DELETE CASCADE NOT VALID;

ALTER TABLE public.chat_prefs
  ADD CONSTRAINT chat_prefs_peer_id_fkey
  FOREIGN KEY (peer_id) REFERENCES auth.users (id) ON DELETE CASCADE NOT VALID;

-- 4) Best-effort validation (won't block deploy if historical rows are inconsistent).
DO $$
BEGIN
  BEGIN
    ALTER TABLE public.messages VALIDATE CONSTRAINT fk_message_sender;
    ALTER TABLE public.messages VALIDATE CONSTRAINT fk_message_receiver;
  EXCEPTION WHEN others THEN
    -- ignore
  END;

  BEGIN
    ALTER TABLE public.chat_prefs VALIDATE CONSTRAINT chat_prefs_user_id_fkey;
    ALTER TABLE public.chat_prefs VALIDATE CONSTRAINT chat_prefs_peer_id_fkey;
  EXCEPTION WHEN others THEN
    -- ignore
  END;
END;
$$;

