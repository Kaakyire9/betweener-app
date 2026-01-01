-- Migration: Moments tables, RLS policies, and storage bucket
-- Path: supabase/migrations/20251230_moments.sql

-- Ensure cryptographic UUID generator is available (pgcrypto)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Moments table
CREATE TABLE IF NOT EXISTS public.moments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('video', 'photo', 'text')),
  media_url text,
  thumbnail_url text,
  text_body text,
  caption text,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
  visibility text NOT NULL DEFAULT 'matches' CHECK (visibility IN ('public', 'matches', 'vibe_check_approved', 'private')),
  is_deleted boolean NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_moments_expires_at ON public.moments (expires_at);
CREATE INDEX IF NOT EXISTS idx_moments_user_created_at ON public.moments (user_id, created_at DESC);

-- Reactions
CREATE TABLE IF NOT EXISTS public.moment_reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  moment_id uuid NOT NULL REFERENCES public.moments(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  emoji text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (moment_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_moment_reactions_moment_id ON public.moment_reactions (moment_id);

-- Comments
CREATE TABLE IF NOT EXISTS public.moment_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  moment_id uuid NOT NULL REFERENCES public.moments(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_moment_comments_moment_id ON public.moment_comments (moment_id);

-- Helper: check if two users are matched using the existing matches schema variants.
CREATE OR REPLACE FUNCTION public.is_match(a uuid, b uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  res boolean := false;
  a_profile uuid;
  b_profile uuid;
  a_candidates uuid[];
  b_candidates uuid[];
BEGIN
  IF a IS NULL OR b IS NULL THEN
    RETURN false;
  END IF;

  a_candidates := ARRAY[a];
  b_candidates := ARRAY[b];

  SELECT id INTO a_profile FROM public.profiles WHERE user_id = a;
  SELECT id INTO b_profile FROM public.profiles WHERE user_id = b;

  IF a_profile IS NOT NULL THEN
    a_candidates := array_append(a_candidates, a_profile);
  END IF;
  IF b_profile IS NOT NULL THEN
    b_candidates := array_append(b_candidates, b_profile);
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'matches' AND column_name = 'user_a')
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'matches' AND column_name = 'user_b') THEN
    EXECUTE 'SELECT EXISTS (SELECT 1 FROM public.matches WHERE (user_a = ANY($1) AND user_b = ANY($2)) OR (user_a = ANY($2) AND user_b = ANY($1)))'
      INTO res USING a_candidates, b_candidates;

  ELSIF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'matches' AND column_name = 'user1_id')
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'matches' AND column_name = 'user2_id') THEN
    EXECUTE 'SELECT EXISTS (SELECT 1 FROM public.matches WHERE (user1_id = ANY($1) AND user2_id = ANY($2)) OR (user1_id = ANY($2) AND user2_id = ANY($1)))'
      INTO res USING a_candidates, b_candidates;

  ELSIF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'matches' AND column_name = 'user_id')
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'matches' AND column_name = 'target_id') THEN
    EXECUTE 'SELECT EXISTS (SELECT 1 FROM public.matches WHERE (user_id = ANY($1) AND target_id = ANY($2)) OR (user_id = ANY($2) AND target_id = ANY($1)))'
      INTO res USING a_candidates, b_candidates;
  ELSE
    res := false;
  END IF;

  RETURN res;
END;
$$;

-- Helper: can the current viewer see a moment?
CREATE OR REPLACE FUNCTION public.can_view_moment(p_moment_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  m record;
  viewer uuid := auth.uid();
BEGIN
  IF viewer IS NULL THEN
    RETURN false;
  END IF;

  SELECT user_id, visibility, expires_at, is_deleted
  INTO m
  FROM public.moments
  WHERE id = p_moment_id;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF m.is_deleted OR m.expires_at <= now() THEN
    RETURN false;
  END IF;

  IF m.user_id = viewer THEN
    RETURN true;
  END IF;

  IF m.visibility = 'public' THEN
    RETURN true;
  END IF;

  IF m.visibility = 'matches' THEN
    RETURN public.is_match(viewer, m.user_id);
  END IF;

  -- No approved-watchers table yet; default to owner-only.
  IF m.visibility = 'vibe_check_approved' THEN
    RETURN false;
  END IF;

  RETURN false;
END;
$$;

-- RLS: moments
ALTER TABLE public.moments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Moments select visible" ON public.moments;
CREATE POLICY "Moments select visible" ON public.moments
FOR SELECT USING (
  is_deleted = false
  AND expires_at > now()
  AND (
    user_id = auth.uid()
    OR visibility = 'public'
    OR (visibility = 'matches' AND public.is_match(auth.uid(), user_id))
  )
);

DROP POLICY IF EXISTS "Moments insert own" ON public.moments;
CREATE POLICY "Moments insert own" ON public.moments
FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Moments update own" ON public.moments;
CREATE POLICY "Moments update own" ON public.moments
FOR UPDATE USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Moments delete own" ON public.moments;
CREATE POLICY "Moments delete own" ON public.moments
FOR DELETE USING (user_id = auth.uid());

-- RLS: reactions
ALTER TABLE public.moment_reactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Moment reactions select visible" ON public.moment_reactions;
CREATE POLICY "Moment reactions select visible" ON public.moment_reactions
FOR SELECT USING (public.can_view_moment(moment_id));

DROP POLICY IF EXISTS "Moment reactions insert own" ON public.moment_reactions;
CREATE POLICY "Moment reactions insert own" ON public.moment_reactions
FOR INSERT WITH CHECK (user_id = auth.uid() AND public.can_view_moment(moment_id));

DROP POLICY IF EXISTS "Moment reactions update own" ON public.moment_reactions;
CREATE POLICY "Moment reactions update own" ON public.moment_reactions
FOR UPDATE USING (user_id = auth.uid() AND public.can_view_moment(moment_id))
WITH CHECK (user_id = auth.uid() AND public.can_view_moment(moment_id));

DROP POLICY IF EXISTS "Moment reactions delete own" ON public.moment_reactions;
CREATE POLICY "Moment reactions delete own" ON public.moment_reactions
FOR DELETE USING (user_id = auth.uid());

-- RLS: comments
ALTER TABLE public.moment_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Moment comments select visible" ON public.moment_comments;
CREATE POLICY "Moment comments select visible" ON public.moment_comments
FOR SELECT USING (is_deleted = false AND public.can_view_moment(moment_id));

DROP POLICY IF EXISTS "Moment comments insert own" ON public.moment_comments;
CREATE POLICY "Moment comments insert own" ON public.moment_comments
FOR INSERT WITH CHECK (user_id = auth.uid() AND public.can_view_moment(moment_id));

DROP POLICY IF EXISTS "Moment comments update own" ON public.moment_comments;
CREATE POLICY "Moment comments update own" ON public.moment_comments
FOR UPDATE USING (user_id = auth.uid() AND public.can_view_moment(moment_id))
WITH CHECK (user_id = auth.uid() AND public.can_view_moment(moment_id));

DROP POLICY IF EXISTS "Moment comments delete own" ON public.moment_comments;
CREATE POLICY "Moment comments delete own" ON public.moment_comments
FOR DELETE USING (user_id = auth.uid());

-- Storage: moments bucket (private)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'moments',
  'moments',
  false,
  26214400, -- 25MB
  ARRAY['video/mp4', 'video/quicktime', 'image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for moments bucket (path: moments/{userId}/{momentId}/{filename})
DROP POLICY IF EXISTS "Moments media upload" ON storage.objects;
CREATE POLICY "Moments media upload" ON storage.objects
FOR INSERT WITH CHECK (
  bucket_id = 'moments'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

DROP POLICY IF EXISTS "Moments media update" ON storage.objects;
CREATE POLICY "Moments media update" ON storage.objects
FOR UPDATE USING (
  bucket_id = 'moments'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

DROP POLICY IF EXISTS "Moments media delete" ON storage.objects;
CREATE POLICY "Moments media delete" ON storage.objects
FOR DELETE USING (
  bucket_id = 'moments'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

DROP POLICY IF EXISTS "Moments media view" ON storage.objects;
CREATE POLICY "Moments media view" ON storage.objects
FOR SELECT USING (
  bucket_id = 'moments'
  AND public.can_view_moment(((storage.foldername(name))[2])::uuid)
);
