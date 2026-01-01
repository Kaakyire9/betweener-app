-- Migration: profile videos bucket + policies
-- Path: supabase/migrations/20251231_profile_videos.sql

-- Ensure profiles has profile_video column for storage path
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS profile_video text;

-- Storage: profile-videos bucket (private)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'profile-videos',
  'profile-videos',
  false,
  26214400, -- 25MB
  ARRAY['video/mp4', 'video/quicktime']
)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for profile-videos bucket (path: profile-videos/{userId}/{filename})
DROP POLICY IF EXISTS "Profile videos upload" ON storage.objects;
CREATE POLICY "Profile videos upload" ON storage.objects
FOR INSERT WITH CHECK (
  bucket_id = 'profile-videos'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

DROP POLICY IF EXISTS "Profile videos update" ON storage.objects;
CREATE POLICY "Profile videos update" ON storage.objects
FOR UPDATE USING (
  bucket_id = 'profile-videos'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

DROP POLICY IF EXISTS "Profile videos delete" ON storage.objects;
CREATE POLICY "Profile videos delete" ON storage.objects
FOR DELETE USING (
  bucket_id = 'profile-videos'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

DROP POLICY IF EXISTS "Profile videos view" ON storage.objects;
CREATE POLICY "Profile videos view" ON storage.objects
FOR SELECT USING (
  bucket_id = 'profile-videos'
  AND auth.role() = 'authenticated'
);
