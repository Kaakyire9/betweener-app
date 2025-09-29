-- First, create the storage bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'profile-photos',
  'profile-photos',
  true,
  10485760, -- 10MB limit
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic']
) ON CONFLICT (id) DO NOTHING;

-- Add additional columns to profiles table if they don't exist
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS occupation TEXT,
ADD COLUMN IF NOT EXISTS education TEXT,
ADD COLUMN IF NOT EXISTS height TEXT,
ADD COLUMN IF NOT EXISTS looking_for TEXT,
ADD COLUMN IF NOT EXISTS photos TEXT[] DEFAULT '{}';

-- Drop existing storage policies if they exist
DROP POLICY IF EXISTS "Users can view any profile photo" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload their own profile photos" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own profile photos" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own profile photos" ON storage.objects;

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
) WITH CHECK (
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

-- Fix NULL constraint issues for profile updates
-- Make gender and other fields nullable to allow partial updates
ALTER TABLE profiles ALTER COLUMN gender DROP NOT NULL;
ALTER TABLE profiles ALTER COLUMN tribe DROP NOT NULL;  
ALTER TABLE profiles ALTER COLUMN religion DROP NOT NULL;
ALTER TABLE profiles ALTER COLUMN min_age_interest DROP NOT NULL;
ALTER TABLE profiles ALTER COLUMN max_age_interest DROP NOT NULL;

-- Set defaults for existing NULL values
UPDATE profiles SET 
  gender = COALESCE(gender, 'unspecified'),
  tribe = COALESCE(tribe, ''),
  religion = COALESCE(religion, ''),
  min_age_interest = COALESCE(min_age_interest, 18),
  max_age_interest = COALESCE(max_age_interest, 50)
WHERE gender IS NULL OR tribe IS NULL OR religion IS NULL 
   OR min_age_interest IS NULL OR max_age_interest IS NULL;