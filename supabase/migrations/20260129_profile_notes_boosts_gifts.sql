-- Migration: notes, boosts, and gifts
ALTER TABLE public.notification_prefs
  ADD COLUMN IF NOT EXISTS notes boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS gifts boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS boosts boolean NOT NULL DEFAULT true;

CREATE TABLE IF NOT EXISTS public.profile_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  note text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT profile_notes_note_length CHECK (char_length(note) BETWEEN 1 AND 280)
);

CREATE INDEX IF NOT EXISTS idx_profile_notes_profile ON public.profile_notes (profile_id);
CREATE INDEX IF NOT EXISTS idx_profile_notes_sender ON public.profile_notes (sender_id);

ALTER TABLE public.profile_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Profiles can view notes" ON public.profile_notes;
CREATE POLICY "Profiles can view notes" ON public.profile_notes
FOR SELECT
TO authenticated
USING (profile_id = auth.uid() OR sender_id = auth.uid());

DROP POLICY IF EXISTS "Users can send notes" ON public.profile_notes;
CREATE POLICY "Users can send notes" ON public.profile_notes
FOR INSERT
TO authenticated
WITH CHECK (sender_id = auth.uid() AND sender_id <> profile_id);

DROP POLICY IF EXISTS "Users can delete own notes" ON public.profile_notes;
CREATE POLICY "Users can delete own notes" ON public.profile_notes
FOR DELETE
TO authenticated
USING (sender_id = auth.uid() OR profile_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.profile_gifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  gift_type text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT profile_gifts_type_check CHECK (gift_type IN ('rose','teddy','ring'))
);

CREATE INDEX IF NOT EXISTS idx_profile_gifts_profile ON public.profile_gifts (profile_id);
CREATE INDEX IF NOT EXISTS idx_profile_gifts_sender ON public.profile_gifts (sender_id);

ALTER TABLE public.profile_gifts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Profiles can view gifts" ON public.profile_gifts;
CREATE POLICY "Profiles can view gifts" ON public.profile_gifts
FOR SELECT
TO authenticated
USING (profile_id = auth.uid() OR sender_id = auth.uid());

DROP POLICY IF EXISTS "Users can send gifts" ON public.profile_gifts;
CREATE POLICY "Users can send gifts" ON public.profile_gifts
FOR INSERT
TO authenticated
WITH CHECK (sender_id = auth.uid() AND sender_id <> profile_id);

DROP POLICY IF EXISTS "Users can delete own gifts" ON public.profile_gifts;
CREATE POLICY "Users can delete own gifts" ON public.profile_gifts
FOR DELETE
TO authenticated
USING (sender_id = auth.uid() OR profile_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.profile_boosts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  starts_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT profile_boosts_time_check CHECK (ends_at > starts_at)
);

CREATE INDEX IF NOT EXISTS idx_profile_boosts_user ON public.profile_boosts (user_id);
CREATE INDEX IF NOT EXISTS idx_profile_boosts_ends ON public.profile_boosts (ends_at);

ALTER TABLE public.profile_boosts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view boosts" ON public.profile_boosts;
CREATE POLICY "Users can view boosts" ON public.profile_boosts
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can create boosts" ON public.profile_boosts;
CREATE POLICY "Users can create boosts" ON public.profile_boosts
FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.notify_profile_note_push()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  sender_name text;
  sender_avatar text;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.notification_prefs p
    WHERE p.user_id = NEW.profile_id
      AND (p.push_enabled = false OR p.notes = false)
  ) THEN
    RETURN NEW;
  END IF;

  IF public.is_quiet_hours(NEW.profile_id) THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.blocks b
    WHERE (b.blocker_id = NEW.profile_id AND b.blocked_id = NEW.sender_id)
       OR (b.blocker_id = NEW.sender_id AND b.blocked_id = NEW.profile_id)
  ) THEN
    RETURN NEW;
  END IF;

  SELECT full_name, avatar_url
  INTO sender_name, sender_avatar
  FROM public.profiles
  WHERE id = NEW.sender_id
  LIMIT 1;

  sender_name := COALESCE(sender_name, 'New note');

  PERFORM private.send_push_webhook(
    jsonb_build_object(
      'user_id', NEW.profile_id,
      'title', sender_name,
      'body', NEW.note,
      'data', jsonb_build_object(
        'type', 'profile_note',
        'note_id', NEW.id,
        'profile_id', NEW.sender_id,
        'name', sender_name,
        'avatar_url', sender_avatar
      )
    )
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notify_profile_note_push ON public.profile_notes;
CREATE TRIGGER notify_profile_note_push
AFTER INSERT ON public.profile_notes
FOR EACH ROW
EXECUTE FUNCTION public.notify_profile_note_push();

CREATE OR REPLACE FUNCTION public.notify_profile_gift_push()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  sender_name text;
  sender_avatar text;
  gift_label text;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.notification_prefs p
    WHERE p.user_id = NEW.profile_id
      AND (p.push_enabled = false OR p.gifts = false)
  ) THEN
    RETURN NEW;
  END IF;

  IF public.is_quiet_hours(NEW.profile_id) THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.blocks b
    WHERE (b.blocker_id = NEW.profile_id AND b.blocked_id = NEW.sender_id)
       OR (b.blocker_id = NEW.sender_id AND b.blocked_id = NEW.profile_id)
  ) THEN
    RETURN NEW;
  END IF;

  SELECT full_name, avatar_url
  INTO sender_name, sender_avatar
  FROM public.profiles
  WHERE id = NEW.sender_id
  LIMIT 1;

  sender_name := COALESCE(sender_name, 'New gift');
  gift_label := CASE NEW.gift_type
    WHEN 'rose' THEN 'a rose'
    WHEN 'teddy' THEN 'a teddy bear'
    WHEN 'ring' THEN 'a ring'
    ELSE 'a gift'
  END;

  PERFORM private.send_push_webhook(
    jsonb_build_object(
      'user_id', NEW.profile_id,
      'title', sender_name,
      'body', sender_name || ' sent you ' || gift_label,
      'data', jsonb_build_object(
        'type', 'profile_gift',
        'gift_id', NEW.id,
        'gift_type', NEW.gift_type,
        'profile_id', NEW.sender_id,
        'name', sender_name,
        'avatar_url', sender_avatar
      )
    )
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notify_profile_gift_push ON public.profile_gifts;
CREATE TRIGGER notify_profile_gift_push
AFTER INSERT ON public.profile_gifts
FOR EACH ROW
EXECUTE FUNCTION public.notify_profile_gift_push();

ALTER TABLE public.profile_notes REPLICA IDENTITY FULL;
ALTER TABLE public.profile_gifts REPLICA IDENTITY FULL;
ALTER TABLE public.profile_boosts REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'profile_notes'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.profile_notes;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'profile_gifts'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.profile_gifts;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'profile_boosts'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.profile_boosts;
  END IF;
END $$;
