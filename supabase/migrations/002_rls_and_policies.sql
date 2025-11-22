-- Migration: RLS policies for profiles, swipes, and matches
-- Path: supabase/migrations/002_rls_and_policies.sql

-- Enable Row Level Security and create conservative policies

-- PROFILES
ALTER TABLE IF EXISTS public.profiles ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to SELECT public profile fields
CREATE POLICY IF NOT EXISTS profiles_select_authenticated ON public.profiles
  FOR SELECT
  TO authenticated
  USING (true);

-- Allow profile owners (auth.uid() == id) to UPDATE their own profile
CREATE POLICY IF NOT EXISTS profiles_update_owner ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = id::text)
  WITH CHECK (auth.uid() = id::text);

-- Allow authenticated users to INSERT a profile if the id equals auth.uid()
CREATE POLICY IF NOT EXISTS profiles_insert_owner ON public.profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id::text);

-- SWIPES
ALTER TABLE IF EXISTS public.swipes ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to INSERT swipes where they are the actor
CREATE POLICY IF NOT EXISTS swipes_insert_self ON public.swipes
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id::text);

-- Allow authenticated users to SELECT their own swipes
CREATE POLICY IF NOT EXISTS swipes_select_self ON public.swipes
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id::text OR auth.uid() = target_id::text);

-- MATCHES
ALTER TABLE IF EXISTS public.matches ENABLE ROW LEVEL SECURITY;

-- Allow users who are part of a match to SELECT it
CREATE POLICY IF NOT EXISTS matches_select_participants ON public.matches
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_a::text OR auth.uid() = user_b::text);

-- Note: You can tighten or loosen policies depending on privacy requirements.
