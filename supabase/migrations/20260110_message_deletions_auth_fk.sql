-- Migration: align delete/hide FK references with auth.users
ALTER TABLE public.messages
  DROP CONSTRAINT IF EXISTS fk_messages_deleted_by;

ALTER TABLE public.messages
  ADD CONSTRAINT fk_messages_deleted_by
  FOREIGN KEY (deleted_by) REFERENCES auth.users (id) ON DELETE SET NULL;

ALTER TABLE public.message_hides
  DROP CONSTRAINT IF EXISTS fk_message_hides_user;

ALTER TABLE public.message_hides
  DROP CONSTRAINT IF EXISTS fk_message_hides_peer;

ALTER TABLE public.message_hides
  ADD CONSTRAINT fk_message_hides_user
  FOREIGN KEY (user_id) REFERENCES auth.users (id) ON DELETE CASCADE;

ALTER TABLE public.message_hides
  ADD CONSTRAINT fk_message_hides_peer
  FOREIGN KEY (peer_id) REFERENCES auth.users (id) ON DELETE CASCADE;
