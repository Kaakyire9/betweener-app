-- Migration: reactions on profile images
CREATE TABLE IF NOT EXISTS public.profile_image_reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  image_url text NOT NULL,
  reactor_user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  emoji text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT profile_image_reactions_unique UNIQUE (profile_id, image_url, reactor_user_id),
  CONSTRAINT profile_image_reactions_emoji_check CHECK (char_length(emoji) > 0)
);

CREATE INDEX IF NOT EXISTS idx_profile_image_reactions_profile ON public.profile_image_reactions (profile_id);
CREATE INDEX IF NOT EXISTS idx_profile_image_reactions_image ON public.profile_image_reactions (image_url);
CREATE INDEX IF NOT EXISTS idx_profile_image_reactions_reactor ON public.profile_image_reactions (reactor_user_id);

ALTER TABLE public.profile_image_reactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Profiles can view image reactions" ON public.profile_image_reactions;
CREATE POLICY "Profiles can view image reactions" ON public.profile_image_reactions
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = profile_id
  )
);

DROP POLICY IF EXISTS "Users can react to profile images" ON public.profile_image_reactions;
CREATE POLICY "Users can react to profile images" ON public.profile_image_reactions
FOR INSERT
TO authenticated
WITH CHECK (reactor_user_id = auth.uid());

DROP POLICY IF EXISTS "Users can update own reactions" ON public.profile_image_reactions;
CREATE POLICY "Users can update own reactions" ON public.profile_image_reactions
FOR UPDATE
TO authenticated
USING (reactor_user_id = auth.uid())
WITH CHECK (reactor_user_id = auth.uid());

DROP POLICY IF EXISTS "Users can remove own reactions" ON public.profile_image_reactions;
CREATE POLICY "Users can remove own reactions" ON public.profile_image_reactions
FOR DELETE
TO authenticated
USING (reactor_user_id = auth.uid());

ALTER TABLE public.profile_image_reactions REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'profile_image_reactions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.profile_image_reactions;
  END IF;
END $$;
