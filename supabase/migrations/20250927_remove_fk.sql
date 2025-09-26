-- Simple fix: Remove the problematic foreign key constraint
-- This allows profiles to be created without requiring a users table entry

-- Remove the foreign key constraint that's causing the issue
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS fk_profile_user;

-- The profiles table can still reference auth.users via the user_id column
-- but without a strict foreign key constraint for now
-- This allows profile creation to work with Supabase Auth users