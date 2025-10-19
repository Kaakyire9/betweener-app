-- Create status tables manually (simplified version)
-- This script creates the essential tables for status functionality

-- Drop tables if they exist (for clean setup)
DROP TABLE IF EXISTS public.status_views CASCADE;
DROP TABLE IF EXISTS public.user_statuses CASCADE;

-- Create user_statuses table
CREATE TABLE public.user_statuses (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  media_url TEXT NOT NULL,
  media_type TEXT NOT NULL CHECK (media_type IN ('image', 'video')),
  caption TEXT,
  background_color TEXT,
  text_position TEXT CHECK (text_position IN ('top', 'center', 'bottom')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  is_active BOOLEAN DEFAULT TRUE NOT NULL,
  view_count INTEGER DEFAULT 0 NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- Create status_views table
CREATE TABLE public.status_views (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  status_id UUID NOT NULL REFERENCES public.user_statuses(id) ON DELETE CASCADE,
  viewer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  viewed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  UNIQUE(status_id, viewer_id)
);

-- Create indexes for better performance
CREATE INDEX idx_user_statuses_user_id ON public.user_statuses(user_id);
CREATE INDEX idx_user_statuses_expires_at ON public.user_statuses(expires_at);
CREATE INDEX idx_user_statuses_is_active ON public.user_statuses(is_active);
CREATE INDEX idx_user_statuses_created_at ON public.user_statuses(created_at);
CREATE INDEX idx_status_views_status_id ON public.status_views(status_id);
CREATE INDEX idx_status_views_viewer_id ON public.status_views(viewer_id);

-- Enable RLS
ALTER TABLE public.user_statuses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.status_views ENABLE ROW LEVEL SECURITY;

-- Basic RLS policies
CREATE POLICY "Users can view active statuses" ON public.user_statuses
  FOR SELECT USING (
    is_active = TRUE 
    AND expires_at > NOW()
  );

CREATE POLICY "Users can insert own statuses" ON public.user_statuses
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own statuses" ON public.user_statuses
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own statuses" ON public.user_statuses
  FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Users can view own status views" ON public.status_views
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.user_statuses 
      WHERE user_statuses.id = status_views.status_id 
        AND user_statuses.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert status views" ON public.status_views
  FOR INSERT WITH CHECK (
    auth.uid() = viewer_id
    AND EXISTS (
      SELECT 1 FROM public.user_statuses 
      WHERE user_statuses.id = status_views.status_id 
        AND user_statuses.is_active = TRUE
        AND user_statuses.expires_at > NOW()
    )
  );

-- Grant permissions
GRANT ALL ON public.user_statuses TO authenticated;
GRANT ALL ON public.status_views TO authenticated;
GRANT ALL ON public.user_statuses TO service_role;
GRANT ALL ON public.status_views TO service_role;