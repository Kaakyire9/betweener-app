-- Migration: allow users to unblock
DROP POLICY IF EXISTS "Users can unblock users" ON public.blocks;
CREATE POLICY "Users can unblock users" ON public.blocks
FOR DELETE
USING (auth.uid() = blocker_id);
