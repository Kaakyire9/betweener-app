-- Migration: allow swipe targets to read swipes (in-app toasts/realtime)
ALTER TABLE public.swipes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view swipes targeting them" ON public.swipes;
CREATE POLICY "Users can view swipes targeting them" ON public.swipes
FOR SELECT
TO authenticated
USING (
  auth.uid() IN (
    SELECT p.user_id
    FROM public.profiles p
    WHERE p.id = target_id
  )
);
