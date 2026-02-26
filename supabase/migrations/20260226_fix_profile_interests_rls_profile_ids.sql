-- Fix RLS for interests/profile_interests:
-- - profile_interests.profile_id references profiles.id (NOT auth.users.id)
-- - writes must be allowed only for the authed user's own profile row

ALTER TABLE public.interests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profile_interests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Interests read" ON public.interests;
CREATE POLICY "Interests read"
ON public.interests
FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS "Profile interests read" ON public.profile_interests;
CREATE POLICY "Profile interests read"
ON public.profile_interests
FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS "Profile interests insert (own profile)" ON public.profile_interests;
CREATE POLICY "Profile interests insert (own profile)"
ON public.profile_interests
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = profile_interests.profile_id
      AND p.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Profile interests update (own profile)" ON public.profile_interests;
CREATE POLICY "Profile interests update (own profile)"
ON public.profile_interests
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = profile_interests.profile_id
      AND p.user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = profile_interests.profile_id
      AND p.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Profile interests delete (own profile)" ON public.profile_interests;
CREATE POLICY "Profile interests delete (own profile)"
ON public.profile_interests
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = profile_interests.profile_id
      AND p.user_id = auth.uid()
  )
);

