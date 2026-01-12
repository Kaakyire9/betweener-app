-- Migration: allow blocked users to read block status
DROP POLICY IF EXISTS "Users can view blocks they are blocked by" ON public.blocks;
CREATE POLICY "Users can view blocks they are blocked by" ON public.blocks
FOR SELECT
USING (auth.uid() = blocked_id);
