-- Migration: prevent sending messages when blocked
DROP POLICY IF EXISTS "Users can send messages" ON public.messages;
CREATE POLICY "Users can send messages" ON public.messages
FOR INSERT
WITH CHECK (
  auth.uid() = sender_id
  AND NOT EXISTS (
    SELECT 1
    FROM public.blocks b
    WHERE (b.blocker_id = sender_id AND b.blocked_id = receiver_id)
       OR (b.blocker_id = receiver_id AND b.blocked_id = sender_id)
  )
);
