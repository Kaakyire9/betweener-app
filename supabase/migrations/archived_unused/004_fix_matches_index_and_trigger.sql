-- Migration: create a unique pair index for matches and update the
-- trigger function to insert into the actual `user1_id`/`user2_id`
-- columns and set a valid match_status value ('PENDING').
--
-- Notes:
-- - This migration uses a DO block to create the unique index only if
--   it does not already exist. It then installs a safe trigger function
--   that inserts a match when reciprocal likes are detected.
-- - The function inserts with status 'PENDING'::match_status. If you
--   prefer a different enum label (e.g., 'ACCEPTED'), replace that
--   literal before applying or let me change it for you.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind = 'i'
      AND c.relname = 'unique_match_pair_user1_user2'
  ) THEN
    EXECUTE 'CREATE UNIQUE INDEX unique_match_pair_user1_user2 ON public.matches ((LEAST(user1_id, user2_id)), (GREATEST(user1_id, user2_id)))';
  END IF;
END
$$;

-- Replace the trigger function that creates a match when reciprocal
-- likes are detected. This function uses 'PENDING' as the status enum.
CREATE OR REPLACE FUNCTION public.create_match_if_reciprocal()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Only care about positive swipes (likes)
  IF NOT (NEW.is_like IS TRUE) THEN
    RETURN NEW;
  END IF;

  -- If the other user already liked this swiper, create a match
  IF EXISTS (
    SELECT 1
    FROM public.swipes s
    WHERE s.swiper_id = NEW.swipee_id
      AND s.swipee_id = NEW.swiper_id
      AND s.is_like = TRUE
  ) THEN
    -- Insert the canonical pair (lowest uuid first) but only if not present
    INSERT INTO public.matches (id, user1_id, user2_id, status, created_at, updated_at)
    SELECT gen_random_uuid(), LEAST(NEW.swiper_id, NEW.swipee_id), GREATEST(NEW.swiper_id, NEW.swipee_id), 'PENDING'::match_status, now(), now()
    WHERE NOT EXISTS (
      SELECT 1 FROM public.matches m
      WHERE m.user1_id = LEAST(NEW.swiper_id, NEW.swipee_id)
        AND m.user2_id = GREATEST(NEW.swiper_id, NEW.swipee_id)
    );
  END IF;

  RETURN NEW;
END;
$$;

-- Ensure the swipes trigger exists and invokes the function. If the
-- trigger already exists in your DB, this will replace the function
-- logic without duplicating triggers.
DROP TRIGGER IF EXISTS create_match_on_swipe ON public.swipes;
CREATE TRIGGER create_match_on_swipe
AFTER INSERT ON public.swipes
FOR EACH ROW
EXECUTE FUNCTION public.create_match_if_reciprocal();
