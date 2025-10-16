-- Test script to verify the verification system is working correctly
-- Run this in Supabase SQL Editor to check current state

-- 1. Check verification requests table structure
SELECT column_name, data_type, is_nullable, column_default 
FROM information_schema.columns 
WHERE table_name = 'verification_requests'
ORDER BY ordinal_position;

-- 2. Check current verification requests
SELECT 
  vr.id,
  vr.status,
  vr.verification_type,
  vr.user_notified,
  vr.reviewer_notes,
  vr.submitted_at,
  vr.reviewed_at,
  p.full_name,
  p.verification_level
FROM verification_requests vr
LEFT JOIN profiles p ON vr.profile_id = p.id
ORDER BY vr.created_at DESC;

-- 3. Check RLS policies on verification_requests
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies 
WHERE tablename = 'verification_requests';

-- 4. Test admin permissions (run as authenticated user)
-- INSERT INTO verification_requests (user_id, profile_id, verification_type, status) 
-- VALUES (auth.uid(), (SELECT id FROM profiles WHERE user_id = auth.uid() LIMIT 1), 'passport', 'pending');

-- 5. Check storage policies
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies 
WHERE tablename = 'objects' AND schemaname = 'storage';