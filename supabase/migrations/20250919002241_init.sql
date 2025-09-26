-- ENUMS
CREATE TYPE gender AS ENUM ('MALE', 'FEMALE', 'NON_BINARY', 'OTHER');
CREATE TYPE religion AS ENUM ('CHRISTIAN', 'MUSLIM', 'TRADITIONALIST', 'OTHER');
CREATE TYPE match_status AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED');
CREATE TYPE swipe_action AS ENUM ('LIKE', 'PASS', 'SUPERLIKE');
CREATE TYPE subscription_type AS ENUM ('FREE', 'SILVER', 'GOLD');
CREATE TYPE location_precision AS ENUM ('EXACT', 'CITY');

-- USERS TABLE (authentication)
CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text UNIQUE NOT NULL,
  password text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_active timestamptz,
  is_verified boolean NOT NULL DEFAULT false,
  is_premium boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_last_active ON users(last_active) WHERE is_active = true;

-- PROFILES TABLE (user details)
CREATE TABLE profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid UNIQUE NOT NULL,
  full_name text NOT NULL,
  age int NOT NULL CHECK (age >= 18),
  gender gender NOT NULL,
  bio text NOT NULL,
  region text NOT NULL,
  tribe text NOT NULL,
  religion religion NOT NULL,
  avatar_url text,
  location text,
  latitude float8 CHECK (latitude >= -90 AND latitude <= 90),
  longitude float8 CHECK (longitude >= -180 AND longitude <= 180),
  min_age_interest int NOT NULL CHECK (min_age_interest >= 18),
  max_age_interest int NOT NULL CHECK (max_age_interest >= min_age_interest),
  online boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true, -- <- NEW COLUMN ADDED HERE
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  location_precision location_precision NOT NULL DEFAULT 'EXACT',
  location_updated_at timestamptz,
  city text,
  CONSTRAINT fk_profile_user FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);


-- Profile indexes for discovery
CREATE INDEX idx_profiles_region ON profiles(region) WHERE deleted_at IS NULL;
CREATE INDEX idx_profiles_tribe ON profiles(tribe) WHERE deleted_at IS NULL;
CREATE INDEX idx_profiles_religion ON profiles(religion) WHERE deleted_at IS NULL;
CREATE INDEX idx_profiles_age ON profiles(age) WHERE deleted_at IS NULL;
CREATE INDEX idx_profiles_lat_long ON profiles(latitude, longitude) WHERE deleted_at IS NULL;
CREATE INDEX idx_profiles_full_name ON profiles(full_name) WHERE deleted_at IS NULL;
CREATE INDEX idx_profiles_online ON profiles(online) WHERE online = true AND deleted_at IS NULL;

-- Covering index for main discovery query (CORRECTED)
CREATE INDEX idx_profile_discovery ON profiles (
    gender,
    age,
    region
) INCLUDE (latitude, longitude, avatar_url, full_name, user_id)
WHERE is_active = true AND deleted_at IS NULL; -- <- Now it correctly references the column in THIS table

-- INTEREST TABLE
CREATE TABLE interests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text UNIQUE NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- PROFILE_INTEREST TABLE (many-to-many)
CREATE TABLE profile_interests (
  profile_id uuid NOT NULL,
  interest_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (profile_id, interest_id),
  CONSTRAINT fk_profile_interest_profile FOREIGN KEY(profile_id) REFERENCES profiles(id) ON DELETE CASCADE,
  CONSTRAINT fk_profile_interest_interest FOREIGN KEY(interest_id) REFERENCES interests(id) ON DELETE CASCADE
);

CREATE INDEX idx_profile_interests_interest ON profile_interests(interest_id);

-- PHOTOS TABLE
CREATE TABLE photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  url text NOT NULL,
  user_id uuid NOT NULL,
  is_primary boolean NOT NULL DEFAULT false,
  ordering int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_photo_user FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE(user_id, url)
);

CREATE INDEX idx_photos_user_id ON photos(user_id);
CREATE INDEX idx_photos_primary ON photos(user_id, is_primary) WHERE is_primary = true;

-- BLOCKS TABLE
CREATE TABLE blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  blocker_id uuid NOT NULL,
  blocked_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_block_sender FOREIGN KEY(blocker_id) REFERENCES users(id),
  CONSTRAINT fk_block_receiver FOREIGN KEY(blocked_id) REFERENCES users(id),
  CONSTRAINT cannot_block_self CHECK (blocker_id != blocked_id),
  UNIQUE(blocker_id, blocked_id)
);

CREATE INDEX idx_blocks_blocker ON blocks(blocker_id);
CREATE INDEX idx_blocks_blocked ON blocks(blocked_id);

-- MESSAGES TABLE
CREATE TABLE messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  text text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  sender_id uuid NOT NULL,
  receiver_id uuid NOT NULL,
  is_read boolean NOT NULL DEFAULT false,
  CONSTRAINT fk_message_sender FOREIGN KEY(sender_id) REFERENCES users(id),
  CONSTRAINT fk_message_receiver FOREIGN KEY(receiver_id) REFERENCES users(id),
  CONSTRAINT cannot_message_self CHECK (sender_id != receiver_id)
);

CREATE INDEX idx_messages_sender_id ON messages(sender_id);
CREATE INDEX idx_messages_receiver_id ON messages(receiver_id);
CREATE INDEX idx_messages_unread ON messages(receiver_id, is_read) WHERE is_read = false;

-- Ultimate message performance index for conversations
CREATE INDEX idx_messages_conversation ON messages (
    LEAST(sender_id, receiver_id),
    GREATEST(sender_id, receiver_id),
    created_at DESC
);

-- REPORTS TABLE
CREATE TABLE reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id uuid NOT NULL,
  reported_id uuid NOT NULL,
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'PENDING',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_report_sender FOREIGN KEY(reporter_id) REFERENCES users(id),
  CONSTRAINT fk_report_receiver FOREIGN KEY(reported_id) REFERENCES users(id),
  CONSTRAINT cannot_report_self CHECK (reporter_id != reported_id)
);

CREATE INDEX idx_reports_reporter ON reports(reporter_id);
CREATE INDEX idx_reports_reported ON reports(reported_id);

-- SETTINGS TABLE
CREATE TABLE settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid UNIQUE NOT NULL,
  notifications boolean NOT NULL DEFAULT true,
  show_online boolean NOT NULL DEFAULT true,
  dark_mode boolean NOT NULL DEFAULT false,
  show_age boolean NOT NULL DEFAULT true,
  show_distance boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_settings_user FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- SUBSCRIPTIONS TABLE
CREATE TABLE subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  type subscription_type NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  CONSTRAINT fk_subscription_user FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_subscriptions_user ON subscriptions(user_id);
CREATE INDEX idx_subscriptions_active ON subscriptions(is_active) WHERE is_active = true;

-- SWIPES TABLE
CREATE TABLE swipes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  swiper_id uuid NOT NULL,
  target_id uuid NOT NULL,
  action swipe_action NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_swipe_user FOREIGN KEY(swiper_id) REFERENCES profiles(id) ON DELETE CASCADE,
  CONSTRAINT fk_swipe_target FOREIGN KEY(target_id) REFERENCES profiles(id) ON DELETE CASCADE,
  CONSTRAINT cannot_swipe_on_self CHECK (swiper_id != target_id),
  UNIQUE(swiper_id, target_id)
);

CREATE INDEX idx_swipes_swiper_id ON swipes(swiper_id);
CREATE INDEX idx_swipes_target_id ON swipes(target_id);
CREATE INDEX idx_swipes_action ON swipes(action) WHERE action IN ('LIKE', 'SUPERLIKE');

-- MATCHES TABLE
CREATE TABLE matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user1_id uuid NOT NULL,
  user2_id uuid NOT NULL,
  status match_status NOT NULL DEFAULT 'PENDING',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_match_user1 FOREIGN KEY(user1_id) REFERENCES profiles(id) ON DELETE CASCADE,
  CONSTRAINT fk_match_user2 FOREIGN KEY(user2_id) REFERENCES profiles(id) ON DELETE CASCADE,
  UNIQUE(user1_id, user2_id)
);

CREATE INDEX idx_matches_user1_id ON matches(user1_id);
CREATE INDEX idx_matches_user2_id ON matches(user2_id);
CREATE INDEX idx_matches_status ON matches(status) WHERE status = 'PENDING';

-- AUTOMATED TIMESTAMP TRIGGER FUNCTION
CREATE OR REPLACE FUNCTION trigger_set_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- APPLY TIMESTAMP TRIGGERS
CREATE TRIGGER set_timestamp_users
BEFORE UPDATE ON users
FOR EACH ROW
EXECUTE FUNCTION trigger_set_timestamp();

CREATE TRIGGER set_timestamp_profiles
BEFORE UPDATE ON profiles
FOR EACH ROW
EXECUTE FUNCTION trigger_set_timestamp();

CREATE TRIGGER set_timestamp_settings
BEFORE UPDATE ON settings
FOR EACH ROW
EXECUTE FUNCTION trigger_set_timestamp();

CREATE TRIGGER set_timestamp_matches
BEFORE UPDATE ON matches
FOR EACH ROW
EXECUTE FUNCTION trigger_set_timestamp();

-- AUTOMATIC MATCHING TRIGGER FUNCTION
CREATE OR REPLACE FUNCTION handle_mutual_swipe()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.action IN ('LIKE', 'SUPERLIKE') THEN
    IF EXISTS (
      SELECT 1 FROM swipes
      WHERE swiper_id = NEW.target_id
      AND target_id = NEW.swiper_id
      AND action IN ('LIKE', 'SUPERLIKE')
    ) THEN
      INSERT INTO matches (user1_id, user2_id)
      VALUES (
        LEAST(NEW.swiper_id, NEW.target_id),
        GREATEST(NEW.swiper_id, NEW.target_id)
      )
      ON CONFLICT (user1_id, user2_id) DO UPDATE
      SET status = 'ACCEPTED',
          updated_at = NOW();
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- MATCH TRIGGER
CREATE TRIGGER check_for_match
AFTER INSERT ON swipes
FOR EACH ROW
EXECUTE FUNCTION handle_mutual_swipe();

-- FUNCTION: Sync user is_active to profile
CREATE OR REPLACE FUNCTION sync_user_active_status()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_active IS DISTINCT FROM OLD.is_active THEN
    UPDATE profiles
    SET is_active = NEW.is_active
    WHERE user_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- TRIGGER: On users update
CREATE TRIGGER trigger_sync_user_active_status
  AFTER UPDATE OF is_active ON users
  FOR EACH ROW
  EXECUTE FUNCTION sync_user_active_status();

-- ENABLE ROW LEVEL SECURITY
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE swipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

-- BASIC RLS POLICIES (Expand these according to your auth logic)
CREATE POLICY "Users can view own profile" ON profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can view available profiles" ON profiles FOR SELECT USING (
  auth.uid() != user_id
  AND is_active = true
  AND deleted_at IS NULL
);
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can view own swipes" ON swipes FOR SELECT USING (
  auth.uid() IN (SELECT user_id FROM profiles WHERE id = swiper_id)
);
CREATE POLICY "Users can create swipes" ON swipes FOR INSERT WITH CHECK (
  auth.uid() IN (SELECT user_id FROM profiles WHERE id = swiper_id)
);

CREATE POLICY "Users can view their matches" ON matches FOR SELECT USING (
  auth.uid() IN (
    SELECT user_id FROM profiles WHERE id IN (user1_id, user2_id)
  )
);

CREATE POLICY "Users can view their messages" ON messages FOR SELECT USING (
  auth.uid() IN (sender_id, receiver_id)
);
CREATE POLICY "Users can send messages" ON messages FOR INSERT WITH CHECK (
  auth.uid() = sender_id
);