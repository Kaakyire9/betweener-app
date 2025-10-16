-- Fix RLS policies for interests and profile_interests tables
-- This allows users to read interests and manage their own profile_interests

-- Enable RLS on interests table
ALTER TABLE interests ENABLE ROW LEVEL SECURITY;

-- Create policy to allow all authenticated users to read interests
CREATE POLICY "Authenticated users can view all interests" ON interests FOR SELECT USING (auth.role() = 'authenticated');

-- Enable RLS on profile_interests table  
ALTER TABLE profile_interests ENABLE ROW LEVEL SECURITY;

-- Create policies for profile_interests table
CREATE POLICY "Users can view their own profile interests" ON profile_interests FOR SELECT USING (auth.uid() = profile_id);
CREATE POLICY "Users can insert their own profile interests" ON profile_interests FOR INSERT WITH CHECK (auth.uid() = profile_id);
CREATE POLICY "Users can delete their own profile interests" ON profile_interests FOR DELETE USING (auth.uid() = profile_id);

-- Ensure the default interests are populated
INSERT INTO interests (name) VALUES 
  ('Music'), ('Travel'), ('Food'), ('Dancing'), ('Movies'), ('Art'),
  ('Reading'), ('Sports'), ('Gaming'), ('Cooking'), ('Photography'), ('Fitness'),
  ('Nature'), ('Technology'), ('Fashion'), ('Writing'), ('Singing'), ('Comedy'),
  ('Business'), ('Volunteering'), ('Learning'), ('Socializing'), ('Adventure'), ('Relaxing')
ON CONFLICT (name) DO NOTHING;