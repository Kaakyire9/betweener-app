-- Revert foreign key removal and create proper auth integration
-- This migration fixes the foreign key to point to auth.users instead of custom users table

-- 1. First, let's add the foreign key back, but pointing to the correct table (auth.users)
ALTER TABLE profiles 
ADD CONSTRAINT fk_profile_user 
FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- 2. Update other tables to also properly reference auth.users
-- Photos table
ALTER TABLE photos DROP CONSTRAINT IF EXISTS fk_photo_user;
ALTER TABLE photos 
ADD CONSTRAINT fk_photo_user 
FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- Messages table
ALTER TABLE messages DROP CONSTRAINT IF EXISTS fk_message_sender;
ALTER TABLE messages DROP CONSTRAINT IF EXISTS fk_message_receiver;
ALTER TABLE messages 
ADD CONSTRAINT fk_message_sender 
FOREIGN KEY (sender_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE messages 
ADD CONSTRAINT fk_message_receiver 
FOREIGN KEY (receiver_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- Blocks table
ALTER TABLE blocks DROP CONSTRAINT IF EXISTS fk_block_sender;
ALTER TABLE blocks DROP CONSTRAINT IF EXISTS fk_block_receiver;
ALTER TABLE blocks 
ADD CONSTRAINT fk_block_sender 
FOREIGN KEY (blocker_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE blocks 
ADD CONSTRAINT fk_block_receiver 
FOREIGN KEY (blocked_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- Reports table
ALTER TABLE reports DROP CONSTRAINT IF EXISTS fk_report_sender;
ALTER TABLE reports DROP CONSTRAINT IF EXISTS fk_report_receiver;
ALTER TABLE reports 
ADD CONSTRAINT fk_report_sender 
FOREIGN KEY (reporter_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE reports 
ADD CONSTRAINT fk_report_receiver 
FOREIGN KEY (reported_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- Settings table
ALTER TABLE settings DROP CONSTRAINT IF EXISTS fk_settings_user;
ALTER TABLE settings 
ADD CONSTRAINT fk_settings_user 
FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- Subscriptions table
ALTER TABLE subscriptions DROP CONSTRAINT IF EXISTS fk_subscription_user;
ALTER TABLE subscriptions 
ADD CONSTRAINT fk_subscription_user 
FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;