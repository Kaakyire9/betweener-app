-- Fix foreign key constraint issue for profile creation
-- This script addresses the profile creation error during onboarding

-- First, let's check what foreign key constraints exist
SELECT 
    tc.table_name, 
    tc.constraint_name, 
    tc.constraint_type, 
    kcu.column_name,
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name 
FROM 
    information_schema.table_constraints AS tc 
    JOIN information_schema.key_column_usage AS kcu
      ON tc.constraint_name = kcu.constraint_name
      AND tc.table_schema = kcu.table_schema
    JOIN information_schema.constraint_column_usage AS ccu
      ON ccu.constraint_name = tc.constraint_name
      AND ccu.table_schema = tc.table_schema
WHERE tc.constraint_type = 'FOREIGN KEY' 
    AND tc.table_name='profiles';

-- Drop the problematic foreign key constraint temporarily
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS fk_profile_user;

-- Recreate it with DEFERRABLE to avoid race conditions
ALTER TABLE profiles 
ADD CONSTRAINT fk_profile_user 
FOREIGN KEY (user_id) REFERENCES auth.users(id) 
ON DELETE CASCADE 
DEFERRABLE INITIALLY DEFERRED;

-- Also ensure the profiles table has proper RLS policies
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;

CREATE POLICY "Users can view own profile" ON profiles
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own profile" ON profiles
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own profile" ON profiles
  FOR UPDATE USING (auth.uid() = user_id);

-- Grant necessary permissions
GRANT ALL ON profiles TO authenticated;
GRANT ALL ON profiles TO service_role;