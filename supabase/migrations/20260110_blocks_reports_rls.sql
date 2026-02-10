-- Migration: RLS policies for blocks and reports
ALTER TABLE public.blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their blocks" ON public.blocks;
CREATE POLICY "Users can view their blocks" ON public.blocks
FOR SELECT
USING (auth.uid() = blocker_id);

DROP POLICY IF EXISTS "Users can block users" ON public.blocks;
CREATE POLICY "Users can block users" ON public.blocks
FOR INSERT
WITH CHECK (auth.uid() = blocker_id);

DROP POLICY IF EXISTS "Users can view their reports" ON public.reports;
CREATE POLICY "Users can view their reports" ON public.reports
FOR SELECT
USING (auth.uid() = reporter_id);

DROP POLICY IF EXISTS "Users can report users" ON public.reports;
CREATE POLICY "Users can report users" ON public.reports
FOR INSERT
WITH CHECK (auth.uid() = reporter_id);
