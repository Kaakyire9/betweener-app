-- Create storage bucket for profile photos
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'profile-photos',
  'profile-photos',
  true,
  10485760, -- 10MB limit
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic']
);

-- Add additional columns to profiles table
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS occupation TEXT,
ADD COLUMN IF NOT EXISTS education TEXT,
ADD COLUMN IF NOT EXISTS height TEXT,
ADD COLUMN IF NOT EXISTS looking_for TEXT,
ADD COLUMN IF NOT EXISTS photos TEXT[] DEFAULT '{}';

-- Create storage policies for profile-photos bucket
CREATE POLICY "Users can view any profile photo" ON storage.objects
FOR SELECT USING (bucket_id = 'profile-photos');

CREATE POLICY "Users can upload their own profile photos" ON storage.objects
FOR INSERT WITH CHECK (
  bucket_id = 'profile-photos' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can update their own profile photos" ON storage.objects
FOR UPDATE USING (
  bucket_id = 'profile-photos' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can delete their own profile photos" ON storage.objects
FOR DELETE USING (
  bucket_id = 'profile-photos' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Update profile policies to include new columns
DROP POLICY IF EXISTS "Users can view any profile" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;

CREATE POLICY "Users can view any profile" ON profiles
FOR SELECT USING (true);

CREATE POLICY "Users can update own profile" ON profiles
FOR UPDATE USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

-- Create an index on photos array for better performance
CREATE INDEX IF NOT EXISTS profiles_photos_idx ON profiles USING GIN (photos);