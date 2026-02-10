-- Migration: profile views tracking for dashboard metrics

CREATE TABLE IF NOT EXISTS public.profile_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  viewed_profile_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  viewer_user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  -- De-dupe views to at most 1 per viewer per profile per UTC day.
  viewed_on date NOT NULL DEFAULT ((now() AT TIME ZONE 'utc')::date),
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.profile_views
  ADD CONSTRAINT IF NOT EXISTS profile_views_unique_daily_view
  UNIQUE (viewed_profile_id, viewer_user_id, viewed_on);

CREATE INDEX IF NOT EXISTS idx_profile_views_viewed_created_at
  ON public.profile_views (viewed_profile_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_profile_views_viewed_on
  ON public.profile_views (viewed_profile_id, viewed_on DESC);

CREATE INDEX IF NOT EXISTS idx_profile_views_viewer_created_at
  ON public.profile_views (viewer_user_id, created_at DESC);

ALTER TABLE public.profile_views ENABLE ROW LEVEL SECURITY;

-- Only the owner of the viewed profile can read these rows.
CREATE POLICY IF NOT EXISTS "select_own_profile_views"
  ON public.profile_views
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = profile_views.viewed_profile_id
        AND p.user_id = auth.uid()
    )
  );

-- Allow authenticated users to log views as themselves.
CREATE POLICY IF NOT EXISTS "insert_own_profile_view"
  ON public.profile_views
  FOR INSERT
  TO authenticated
  WITH CHECK (viewer_user_id = auth.uid());

-- Convenience RPC used by the app when opening a profile.
CREATE OR REPLACE FUNCTION public.log_profile_view(viewed_profile_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO public.profile_views (viewed_profile_id, viewer_user_id)
  VALUES (log_profile_view.viewed_profile_id, auth.uid());
  ON CONFLICT (viewed_profile_id, viewer_user_id, viewed_on) DO NOTHING;
EXCEPTION
  WHEN others THEN
    -- Best-effort logging; ignore failures.
    RETURN;
END;
$$;

REVOKE ALL ON FUNCTION public.log_profile_view(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.log_profile_view(uuid) TO authenticated;

-- Realtime (safe if already added)
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.profile_views;
  EXCEPTION
    WHEN duplicate_object THEN
      NULL;
    WHEN undefined_object THEN
      NULL;
  END;
END;
$$;
