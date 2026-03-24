-- Fix RLS policies for interests and profile_interests tables
-- This allows users to read interests and manage their own profile_interests

-- Enable RLS on interests table
ALTER TABLE public.interests ENABLE ROW LEVEL SECURITY;

-- Create policy to allow all authenticated users to read interests
DROP POLICY IF EXISTS "Authenticated users can view all interests" ON public.interests;
CREATE POLICY "Authenticated users can view all interests"
ON public.interests
FOR SELECT
TO authenticated
USING (true);

-- Enable RLS on profile_interests table  
ALTER TABLE public.profile_interests ENABLE ROW LEVEL SECURITY;

-- Create policies for profile_interests table
DROP POLICY IF EXISTS "Users can view their own profile interests" ON public.profile_interests;
DROP POLICY IF EXISTS "Authenticated users can view all profile interests" ON public.profile_interests;
DROP POLICY IF EXISTS "Users can insert their own profile interests" ON public.profile_interests;
DROP POLICY IF EXISTS "Users can delete their own profile interests" ON public.profile_interests;

-- Note: profile_interests.profile_id references profiles.id (a profile UUID), not auth.users.id.
-- Ownership is determined by profiles.user_id = auth.uid().
CREATE POLICY "Authenticated users can view all profile interests"
ON public.profile_interests
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Users can insert their own profile interests"
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

CREATE POLICY "Users can delete their own profile interests"
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

-- Ensure the default interests are populated
INSERT INTO interests (name) VALUES 
  ('Music'), ('Travel'), ('Food'), ('Dancing'), ('Movies'), ('Art'),
  ('Reading'), ('Sports'), ('Gaming'), ('Cooking'), ('Photography'), ('Fitness'),
  ('Nature'), ('Technology'), ('Fashion'), ('Writing'), ('Singing'), ('Comedy'),
  ('Business'), ('Volunteering'), ('Learning'), ('Socializing'), ('Adventure'), ('Relaxing')
ON CONFLICT (name) DO NOTHING;
