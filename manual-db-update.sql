-- Manual SQL to add HIGH PRIORITY fields
-- Execute this in Supabase SQL Editor

-- Add lifestyle fields
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS exercise_frequency TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS smoking TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS drinking TEXT;

-- Add family fields  
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS has_children TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS wants_children TEXT;

-- Add personality fields
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS personality_type TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS love_language TEXT;

-- Add living situation fields
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS living_situation TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS pets TEXT;

-- Add languages (array for multiple languages)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS languages_spoken TEXT[] DEFAULT '{}';

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS profiles_exercise_frequency_idx ON profiles (exercise_frequency) WHERE exercise_frequency IS NOT NULL;
CREATE INDEX IF NOT EXISTS profiles_smoking_idx ON profiles (smoking) WHERE smoking IS NOT NULL;
CREATE INDEX IF NOT EXISTS profiles_drinking_idx ON profiles (drinking) WHERE drinking IS NOT NULL;
CREATE INDEX IF NOT EXISTS profiles_has_children_idx ON profiles (has_children) WHERE has_children IS NOT NULL;
CREATE INDEX IF NOT EXISTS profiles_wants_children_idx ON profiles (wants_children) WHERE wants_children IS NOT NULL;
CREATE INDEX IF NOT EXISTS profiles_personality_type_idx ON profiles (personality_type) WHERE personality_type IS NOT NULL;
CREATE INDEX IF NOT EXISTS profiles_living_situation_idx ON profiles (living_situation) WHERE living_situation IS NOT NULL;
CREATE INDEX IF NOT EXISTS profiles_pets_idx ON profiles (pets) WHERE pets IS NOT NULL;
CREATE INDEX IF NOT EXISTS profiles_languages_spoken_idx ON profiles USING GIN (languages_spoken) WHERE languages_spoken IS NOT NULL;

-- Populate default interests (if they don't exist)
INSERT INTO interests (name) VALUES 
  ('Music'), ('Travel'), ('Food'), ('Dancing'), ('Movies'), ('Art'),
  ('Reading'), ('Sports'), ('Gaming'), ('Cooking'), ('Photography'), ('Fitness'),
  ('Nature'), ('Technology'), ('Fashion'), ('Writing'), ('Singing'), ('Comedy'),
  ('Business'), ('Volunteering'), ('Learning'), ('Socializing'), ('Adventure'), ('Relaxing')
ON CONFLICT (name) DO NOTHING;