-- Migration: create profiles, swipes, and matches tables
-- Path: supabase/migrations/001_create_profiles_and_swipes.sql
-- Creates basic profile storage, swipe records, and a server-side trigger
-- that inserts a `matches` row when two users like each other.

-- Ensure cryptographic UUID generator is available (pgcrypto)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Profiles table: store public profile fields used by the app
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text,
  age integer,
  tagline text,
  interests jsonb,
  avatar_url text,
  distance text,
  is_active boolean DEFAULT false,
  last_active timestamptz,
  verified boolean DEFAULT false,
  personality_tags jsonb,
  ai_score integer DEFAULT 0,
  profile_video text,
  created_at timestamptz DEFAULT now()
);

-- Swipes table: records of interactions (who swiped whom and how)
CREATE TABLE IF NOT EXISTS public.swipes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  target_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  action text NOT NULL CHECK (action IN ('like','dislike','superlike')),
  created_at timestamptz DEFAULT now()
);

-- Matches table: created when two users mutually like each other
CREATE TABLE IF NOT EXISTS public.matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_a uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  user_b uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now()
);

-- Ensure we only create one match per pair by creating a unique expression index
-- that orders the pair deterministically (LEAST/GREATEST) so user order doesn't matter.
-- Drop any old index if present
DROP INDEX IF EXISTS idx_matches_pair_key;

-- Create the unique pair index using whichever column names exist in the current DB.
-- Common variants: (user_a,user_b), (user1_id,user2_id), (user_id,target_id)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'matches' AND column_name = 'user_a')
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'matches' AND column_name = 'user_b') THEN
    EXECUTE 'CREATE UNIQUE INDEX IF NOT EXISTS idx_matches_pair_key ON public.matches ((LEAST(user_a::text, user_b::text) || ''|'' || GREATEST(user_a::text, user_b::text)))';

  ELSIF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'matches' AND column_name = 'user1_id')
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'matches' AND column_name = 'user2_id') THEN
    EXECUTE 'CREATE UNIQUE INDEX IF NOT EXISTS idx_matches_pair_key ON public.matches ((LEAST(user1_id::text, user2_id::text) || ''|'' || GREATEST(user1_id::text, user2_id::text)))';

  ELSIF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'matches' AND column_name = 'user_id')
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'matches' AND column_name = 'target_id') THEN
    EXECUTE 'CREATE UNIQUE INDEX IF NOT EXISTS idx_matches_pair_key ON public.matches ((LEAST(user_id::text, target_id::text) || ''|'' || GREATEST(user_id::text, target_id::text)))';

  ELSE
    RAISE NOTICE 'Could not find expected column pair for matches; please verify table schema and create an index manually.';
  END IF;
END;
$$;

-- Helpful indexes for swipe lookups
CREATE UNIQUE INDEX IF NOT EXISTS idx_swipes_user_target ON public.swipes (user_id, target_id);
CREATE INDEX IF NOT EXISTS idx_swipes_target_user ON public.swipes (target_id, user_id);

-- Indexes for profiles queries
CREATE INDEX IF NOT EXISTS idx_profiles_ai_score ON public.profiles (ai_score);
CREATE INDEX IF NOT EXISTS idx_profiles_is_active ON public.profiles (is_active);

-- Trigger function: when inserting a 'like' or 'superlike', check for reciprocal
-- and create a `matches` row if both users have liked each other.
CREATE OR REPLACE FUNCTION public.create_match_if_reciprocal()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  reciprocal_count int;
  a uuid;
  b uuid;
BEGIN
  -- Only act on positive interactions
  IF (NEW.action IS NULL) OR (NEW.action NOT IN ('like','superlike')) THEN
    RETURN NEW;
  END IF;

  -- Check if the reciprocal swipe exists (target liked the actor)
  SELECT count(*) INTO reciprocal_count FROM public.swipes s
    WHERE s.user_id = NEW.target_id
      AND s.target_id = NEW.user_id
      AND s.action IN ('like','superlike');

  IF reciprocal_count > 0 THEN
    -- Determine ordered pair to avoid duplicates
    IF NEW.user_id < NEW.target_id THEN
      a := NEW.user_id; b := NEW.target_id;
    ELSE
      a := NEW.target_id; b := NEW.user_id;
    END IF;

    -- Try to insert a match; if it already exists the unique index prevents duplicates
    BEGIN
      INSERT INTO public.matches (user_a, user_b) VALUES (a, b);
    EXCEPTION WHEN unique_violation THEN
      -- ignore duplicate attempts
      NULL;
    END;
  END IF;

  RETURN NEW;
END;
$$;

-- Attach the trigger to inserts on swipes
DROP TRIGGER IF EXISTS trg_create_match_on_swipe_insert ON public.swipes;
CREATE TRIGGER trg_create_match_on_swipe_insert
AFTER INSERT ON public.swipes
FOR EACH ROW
EXECUTE FUNCTION public.create_match_if_reciprocal();

-- Quick sanity check comments:
-- - `profiles.profile_video` stores a public HTTPS URL for video preview.
-- - Applications should grant least-privilege access for inserts/selects.
