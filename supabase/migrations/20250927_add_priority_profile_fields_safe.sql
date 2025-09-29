-- Add HIGH PRIORITY profile fields for better matching
-- Date: 2025-09-27 (corrected)

-- Add lifestyle fields (only if they don't exist)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='exercise_frequency') THEN
        ALTER TABLE profiles ADD COLUMN exercise_frequency TEXT;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='smoking') THEN
        ALTER TABLE profiles ADD COLUMN smoking TEXT;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='drinking') THEN
        ALTER TABLE profiles ADD COLUMN drinking TEXT;
    END IF;
END $$;

-- Add family fields
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='has_children') THEN
        ALTER TABLE profiles ADD COLUMN has_children TEXT;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='wants_children') THEN
        ALTER TABLE profiles ADD COLUMN wants_children TEXT;
    END IF;
END $$;

-- Add personality fields
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='personality_type') THEN
        ALTER TABLE profiles ADD COLUMN personality_type TEXT;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='love_language') THEN
        ALTER TABLE profiles ADD COLUMN love_language TEXT;
    END IF;
END $$;

-- Add living situation fields
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='living_situation') THEN
        ALTER TABLE profiles ADD COLUMN living_situation TEXT;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='pets') THEN
        ALTER TABLE profiles ADD COLUMN pets TEXT;
    END IF;
END $$;

-- Add languages (array for multiple languages)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='languages_spoken') THEN
        ALTER TABLE profiles ADD COLUMN languages_spoken TEXT[] DEFAULT '{}';
    END IF;
END $$;

-- Create indexes for better query performance (only if they don't exist)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE c.relname = 'profiles_exercise_frequency_idx' AND n.nspname = 'public') THEN
        CREATE INDEX profiles_exercise_frequency_idx ON profiles (exercise_frequency) WHERE exercise_frequency IS NOT NULL;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE c.relname = 'profiles_smoking_idx' AND n.nspname = 'public') THEN
        CREATE INDEX profiles_smoking_idx ON profiles (smoking) WHERE smoking IS NOT NULL;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE c.relname = 'profiles_drinking_idx' AND n.nspname = 'public') THEN
        CREATE INDEX profiles_drinking_idx ON profiles (drinking) WHERE drinking IS NOT NULL;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE c.relname = 'profiles_has_children_idx' AND n.nspname = 'public') THEN
        CREATE INDEX profiles_has_children_idx ON profiles (has_children) WHERE has_children IS NOT NULL;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE c.relname = 'profiles_wants_children_idx' AND n.nspname = 'public') THEN
        CREATE INDEX profiles_wants_children_idx ON profiles (wants_children) WHERE wants_children IS NOT NULL;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE c.relname = 'profiles_personality_type_idx' AND n.nspname = 'public') THEN
        CREATE INDEX profiles_personality_type_idx ON profiles (personality_type) WHERE personality_type IS NOT NULL;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE c.relname = 'profiles_living_situation_idx' AND n.nspname = 'public') THEN
        CREATE INDEX profiles_living_situation_idx ON profiles (living_situation) WHERE living_situation IS NOT NULL;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE c.relname = 'profiles_pets_idx' AND n.nspname = 'public') THEN
        CREATE INDEX profiles_pets_idx ON profiles (pets) WHERE pets IS NOT NULL;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE c.relname = 'profiles_languages_spoken_idx' AND n.nspname = 'public') THEN
        CREATE INDEX profiles_languages_spoken_idx ON profiles USING GIN (languages_spoken) WHERE languages_spoken IS NOT NULL;
    END IF;
END $$;

-- Add comments for documentation
COMMENT ON COLUMN profiles.exercise_frequency IS 'How often user exercises: Daily, Weekly, Occasionally, Never';
COMMENT ON COLUMN profiles.smoking IS 'Smoking habits: Never, Socially, Regularly, Trying to Quit';
COMMENT ON COLUMN profiles.drinking IS 'Drinking habits: Never, Socially, Regularly, Occasionally';
COMMENT ON COLUMN profiles.has_children IS 'Current children status: No, Yes - living with me, Yes - not living with me';
COMMENT ON COLUMN profiles.wants_children IS 'Future children preference: Definitely, Probably, Not Sure, Probably Not, Never';
COMMENT ON COLUMN profiles.personality_type IS 'Personality type: Introvert, Extrovert, Ambivert, Not Sure';
COMMENT ON COLUMN profiles.love_language IS 'Primary love language: Words of Affirmation, Quality Time, Physical Touch, Acts of Service, Gifts';
COMMENT ON COLUMN profiles.living_situation IS 'Current living arrangement: Own Place, Rent Alone, Roommates, With Family, Student Housing';
COMMENT ON COLUMN profiles.pets IS 'Pet preference: No Pets, Dog Lover, Cat Lover, Other Pets, Allergic to Pets';
COMMENT ON COLUMN profiles.languages_spoken IS 'Languages user speaks (array): English, Twi, Ga, Ewe, Fante, etc.';