-- Fix NULL constraint issues for profile updates
-- This allows existing profiles to be updated without providing all required fields

-- Make gender column nullable temporarily for updates (or set a default)
ALTER TABLE profiles ALTER COLUMN gender DROP NOT NULL;

-- Alternatively, if you want to keep NOT NULL but set a default:
-- ALTER TABLE profiles ALTER COLUMN gender SET DEFAULT 'unspecified';

-- Make sure other potentially problematic columns are nullable for partial updates
ALTER TABLE profiles ALTER COLUMN tribe DROP NOT NULL;
ALTER TABLE profiles ALTER COLUMN religion DROP NOT NULL;
ALTER TABLE profiles ALTER COLUMN min_age_interest DROP NOT NULL;
ALTER TABLE profiles ALTER COLUMN max_age_interest DROP NOT NULL;

-- Set reasonable defaults for these fields if they're null
UPDATE profiles SET 
  gender = COALESCE(gender, 'unspecified'),
  tribe = COALESCE(tribe, ''),
  religion = COALESCE(religion, ''),
  min_age_interest = COALESCE(min_age_interest, 18),
  max_age_interest = COALESCE(max_age_interest, 50)
WHERE gender IS NULL OR tribe IS NULL OR religion IS NULL 
   OR min_age_interest IS NULL OR max_age_interest IS NULL;