-- Add profile_completed flag to gate onboarding completion

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS profile_completed boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS profiles_profile_completed_idx
  ON public.profiles (profile_completed)
  WHERE profile_completed = true;
