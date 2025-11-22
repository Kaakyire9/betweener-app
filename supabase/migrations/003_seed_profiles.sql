-- Migration: Seed profiles for local development/testing
-- Path: supabase/migrations/003_seed_profiles.sql

-- Insert a few deterministic profiles for QA and local testing
INSERT INTO public.profiles (id, name, age, tagline, interests, avatar_url, distance, is_active, last_active, verified, personality_tags, ai_score, profile_video)
VALUES
  ('11111111-1111-1111-1111-111111111111', 'Sena', 29, 'Coffee + trails = perfect weekend', '["Hiking","Coffee","Design"]', 'https://images.unsplash.com/photo-1545996124-8e6f5b9e2f6d?w=800&q=80&auto=format&fit=crop&crop=face', '1.2 km away', false, now() - interval '30 minutes', true, '["Calm","Family Oriented","Goal Driven"]', 92, NULL),
  ('22222222-2222-2222-2222-222222222222', 'Daniel', 31, 'Weekend coder, weekday dad', '["Technology","Cooking","Running"]', 'https://images.unsplash.com/photo-1544005313-1d1d3a2b7f9a?w=800&q=80&auto=format&fit=crop&crop=face', '6.8 km away', true, now() - interval '2 minutes', false, '["Goal Driven","Adventurous"]', 87, NULL),
  ('33333333-3333-3333-3333-333333333333', 'Esi', 26, 'Painter, coffee snob, plant parent', '["Art","Plants","Travel"]', 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=800&q=80&auto=format&fit=crop&crop=face', '3.4 km away', false, now() - interval '2 hours', false, '["Creative","Curious","Calm"]', 78, NULL)
ON CONFLICT (id) DO NOTHING;

-- Optional: sample swipe to simulate a like from Daniel -> Sena
INSERT INTO public.swipes (user_id, target_id, action)
VALUES ('22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'like')
ON CONFLICT DO NOTHING;
