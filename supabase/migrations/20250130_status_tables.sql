-- Create status tables for WhatsApp-style 24-hour status feature
-- This migration adds the necessary tables to support user statuses

-- Table for storing user statuses
CREATE TABLE user_statuses (
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

-- Table for tracking who viewed which status
CREATE TABLE status_views (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  status_id UUID NOT NULL REFERENCES user_statuses(id) ON DELETE CASCADE,
  viewer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  viewed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  UNIQUE(status_id, viewer_id)
);

-- Indexes for better performance
CREATE INDEX idx_user_statuses_user_id ON user_statuses(user_id);
CREATE INDEX idx_user_statuses_expires_at ON user_statuses(expires_at);
CREATE INDEX idx_user_statuses_is_active ON user_statuses(is_active);
CREATE INDEX idx_user_statuses_created_at ON user_statuses(created_at);
CREATE INDEX idx_status_views_status_id ON status_views(status_id);
CREATE INDEX idx_status_views_viewer_id ON status_views(viewer_id);
CREATE INDEX idx_status_views_viewed_at ON status_views(viewed_at);

-- Function to automatically update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger to update updated_at on user_statuses
CREATE TRIGGER update_user_statuses_updated_at 
  BEFORE UPDATE ON user_statuses 
  FOR EACH ROW 
  EXECUTE FUNCTION update_updated_at_column();

-- Function to increment view count (for atomic updates)
CREATE OR REPLACE FUNCTION increment_view_count(status_id UUID)
RETURNS INTEGER AS $$
DECLARE
  new_count INTEGER;
BEGIN
  UPDATE user_statuses 
  SET view_count = view_count + 1 
  WHERE id = status_id 
  RETURNING view_count INTO new_count;
  
  RETURN COALESCE(new_count, 0);
END;
$$ LANGUAGE plpgsql;

-- Function to automatically deactivate expired statuses
CREATE OR REPLACE FUNCTION deactivate_expired_statuses()
RETURNS void AS $$
BEGIN
  UPDATE user_statuses 
  SET is_active = FALSE 
  WHERE is_active = TRUE 
    AND expires_at < NOW();
END;
$$ LANGUAGE plpgsql;

-- RLS (Row Level Security) policies

-- Enable RLS on status tables
ALTER TABLE user_statuses ENABLE ROW LEVEL SECURITY;
ALTER TABLE status_views ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view active statuses from users they haven't blocked
CREATE POLICY "Users can view active statuses" ON user_statuses
  FOR SELECT USING (
    is_active = TRUE 
    AND expires_at > NOW()
    AND NOT EXISTS (
      SELECT 1 FROM blocks 
      WHERE (blocker_id = auth.uid() AND blocked_id = user_id)
         OR (blocker_id = user_id AND blocked_id = auth.uid())
    )
  );

-- Policy: Users can insert their own statuses
CREATE POLICY "Users can insert own statuses" ON user_statuses
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Policy: Users can update their own statuses
CREATE POLICY "Users can update own statuses" ON user_statuses
  FOR UPDATE USING (auth.uid() = user_id);

-- Policy: Users can delete their own statuses
CREATE POLICY "Users can delete own statuses" ON user_statuses
  FOR DELETE USING (auth.uid() = user_id);

-- Policy: Users can view status views for their own statuses
CREATE POLICY "Users can view own status views" ON status_views
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM user_statuses 
      WHERE user_statuses.id = status_views.status_id 
        AND user_statuses.user_id = auth.uid()
    )
  );

-- Policy: Users can insert status views for viewable statuses
CREATE POLICY "Users can insert status views" ON status_views
  FOR INSERT WITH CHECK (
    auth.uid() = viewer_id
    AND EXISTS (
      SELECT 1 FROM user_statuses 
      WHERE user_statuses.id = status_views.status_id 
        AND user_statuses.is_active = TRUE
        AND user_statuses.expires_at > NOW()
        AND NOT EXISTS (
          SELECT 1 FROM blocks 
          WHERE (blocker_id = auth.uid() AND blocked_id = user_statuses.user_id)
             OR (blocker_id = user_statuses.user_id AND blocked_id = auth.uid())
        )
    )
  );

-- Storage bucket for status media
INSERT INTO storage.buckets (id, name, public) 
VALUES ('status-media', 'status-media', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policy: Users can upload to their own folder
CREATE POLICY "Users can upload status media" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'status-media' 
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- Storage policy: Users can view all status media
CREATE POLICY "Users can view status media" ON storage.objects
  FOR SELECT USING (bucket_id = 'status-media');

-- Storage policy: Users can update their own status media
CREATE POLICY "Users can update own status media" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'status-media' 
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- Storage policy: Users can delete their own status media
CREATE POLICY "Users can delete own status media" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'status-media' 
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- Add some helpful comments
COMMENT ON TABLE user_statuses IS 'Stores 24-hour status updates from users (WhatsApp-style)';
COMMENT ON TABLE status_views IS 'Tracks which users have viewed which statuses';
COMMENT ON COLUMN user_statuses.expires_at IS 'Status automatically expires after 24 hours';
COMMENT ON COLUMN user_statuses.media_type IS 'Either image or video';
COMMENT ON COLUMN user_statuses.background_color IS 'Background color for text-only statuses';
COMMENT ON COLUMN user_statuses.text_position IS 'Text position for overlay on media';

-- Create a view for easier status queries with user info
CREATE VIEW status_with_user AS
SELECT 
  s.*,
  p.full_name,
  p.avatar_url,
  p.verification_level,
  (s.expires_at > NOW() AND s.is_active) AS is_currently_active
FROM user_statuses s
JOIN profiles p ON p.user_id = s.user_id;

COMMENT ON VIEW status_with_user IS 'Status data joined with user profile information';