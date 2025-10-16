-- Add diaspora fields to profiles table
-- Execute this in Supabase SQL Editor

-- Add diaspora location fields
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS current_country TEXT DEFAULT 'Ghana';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS diaspora_status TEXT DEFAULT 'LOCAL' CHECK (diaspora_status IN ('LOCAL', 'DIASPORA', 'VISITING'));
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS willing_long_distance BOOLEAN DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS verification_level INTEGER DEFAULT 0;

-- Add diaspora experience fields
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS years_in_diaspora INTEGER;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS last_ghana_visit TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS future_ghana_plans TEXT;

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS profiles_current_country_idx ON profiles (current_country) WHERE current_country IS NOT NULL;
CREATE INDEX IF NOT EXISTS profiles_diaspora_status_idx ON profiles (diaspora_status) WHERE diaspora_status IS NOT NULL;
CREATE INDEX IF NOT EXISTS profiles_willing_long_distance_idx ON profiles (willing_long_distance) WHERE willing_long_distance = true;
CREATE INDEX IF NOT EXISTS profiles_years_in_diaspora_idx ON profiles (years_in_diaspora) WHERE years_in_diaspora IS NOT NULL;

-- Create compound index for diaspora matching
CREATE INDEX IF NOT EXISTS profiles_diaspora_matching_idx ON profiles (diaspora_status, current_country, willing_long_distance) WHERE is_active = true;

-- Create verification storage bucket policy
INSERT INTO storage.buckets (id, name, public) VALUES ('verification-docs', 'verification-docs', false) ON CONFLICT DO NOTHING;

-- Create storage policy for verification documents
CREATE POLICY "Users can upload their own verification docs" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'verification-docs' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can view their own verification docs" ON storage.objects FOR SELECT USING (bucket_id = 'verification-docs' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Admin policy to view all verification documents (you can add admin user check here)
CREATE POLICY "Admins can view all verification docs" ON storage.objects FOR SELECT USING (bucket_id = 'verification-docs');

-- Create verification_requests table for tracking submissions
CREATE TABLE IF NOT EXISTS verification_requests (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  verification_type TEXT NOT NULL CHECK (verification_type IN ('passport', 'residence', 'social', 'workplace')),
  document_url TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  submitted_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()),
  reviewed_at TIMESTAMP WITH TIME ZONE,
  reviewer_notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW())
);

-- Add automated verification columns to verification_requests
ALTER TABLE verification_requests ADD COLUMN IF NOT EXISTS auto_verification_score DECIMAL(3,2); -- 0.00 to 1.00 confidence score
ALTER TABLE verification_requests ADD COLUMN IF NOT EXISTS auto_verification_data JSONB; -- Store automated analysis results
ALTER TABLE verification_requests ADD COLUMN IF NOT EXISTS user_notified BOOLEAN DEFAULT false; -- Track if user has been notified of rejection

-- Create indexes for verification requests
CREATE INDEX IF NOT EXISTS verification_requests_user_id_idx ON verification_requests (user_id);
CREATE INDEX IF NOT EXISTS verification_requests_status_idx ON verification_requests (status);
CREATE INDEX IF NOT EXISTS verification_requests_type_idx ON verification_requests (verification_type);

-- Enable RLS on verification_requests
ALTER TABLE verification_requests ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for verification_requests
CREATE POLICY "Users can view their own verification requests" ON verification_requests FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own verification requests" ON verification_requests FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Admin policies for verification_requests (you can add admin user check here)
CREATE POLICY "Admins can view all verification requests" ON verification_requests FOR SELECT USING (true);
CREATE POLICY "Admins can update verification requests" ON verification_requests FOR UPDATE USING (true);

-- Update any existing profiles to have default values
UPDATE profiles SET 
  current_country = 'Ghana',
  diaspora_status = 'LOCAL',
  willing_long_distance = false,
  verification_level = 0
WHERE current_country IS NULL OR diaspora_status IS NULL;