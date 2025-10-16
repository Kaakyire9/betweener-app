-- Add phone verification table to database
-- Execute this in Supabase SQL Editor

-- Create phone_verifications table
CREATE TABLE IF NOT EXISTS phone_verifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  phone_number TEXT NOT NULL,
  country_code TEXT,
  is_ghana_number BOOLEAN DEFAULT false,
  verification_score DECIMAL(3,2) DEFAULT 0.0, -- 0.00 to 1.00 confidence score
  is_verified BOOLEAN DEFAULT false,
  verification_attempts INTEGER DEFAULT 0,
  last_attempt_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()),
  verified_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW())
);

-- Add phone number to profiles table if not exists
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS phone_number TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS phone_verified BOOLEAN DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS phone_verification_score DECIMAL(3,2) DEFAULT 0.0;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS phone_verifications_user_id_idx ON phone_verifications (user_id);
CREATE INDEX IF NOT EXISTS phone_verifications_phone_number_idx ON phone_verifications (phone_number);
CREATE INDEX IF NOT EXISTS phone_verifications_verified_idx ON phone_verifications (is_verified) WHERE is_verified = true;

-- Enable RLS on phone_verifications
ALTER TABLE phone_verifications ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for phone_verifications
CREATE POLICY "Users can view their own phone verifications" ON phone_verifications FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own phone verifications" ON phone_verifications FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own phone verifications" ON phone_verifications FOR UPDATE USING (auth.uid() = user_id);

-- Admin policies for phone_verifications
CREATE POLICY "Admins can view all phone verifications" ON phone_verifications FOR SELECT USING (true);
CREATE POLICY "Admins can update phone verifications" ON phone_verifications FOR UPDATE USING (true);

-- Add trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = TIMEZONE('utc'::text, NOW());
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_phone_verifications_updated_at BEFORE UPDATE ON phone_verifications FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();