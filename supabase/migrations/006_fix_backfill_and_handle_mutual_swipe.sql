-- Fix: ensure trigger function uses PENDING and backfill matches using
-- the actual `swipes` column names (`swiper_id`, `target_id`, `action`).

-- 1) Replace existing trigger function to set status = 'PENDING' on conflict
CREATE OR REPLACE FUNCTION public.handle_mutual_swipe()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  SET LOCAL search_path = public, pg_catalog;
  IF NEW.action IN ('LIKE', 'SUPERLIKE') THEN
    IF EXISTS (
      SELECT 1 FROM swipes
      WHERE swiper_id = NEW.target_id
        AND target_id = NEW.swiper_id
        AND action IN ('LIKE', 'SUPERLIKE')
    ) THEN
      INSERT INTO matches (user1_id, user2_id, status, created_at, updated_at)
      VALUES (
        LEAST(NEW.swiper_id, NEW.target_id),
        GREATEST(NEW.swiper_id, NEW.target_id),
        'PENDING'::match_status,
        now(), now()
      )
      ON CONFLICT (user1_id, user2_id) DO UPDATE
      SET status = EXCLUDED.status,
          updated_at = NOW();
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

-- Ensure the function runs with a privileged owner so the SECURITY DEFINER
-- behavior is effective under Row Level Security (adjust owner as appropriate).
ALTER FUNCTION public.handle_mutual_swipe() OWNER TO postgres;

-- 2) Backfill: insert matches for existing reciprocal LIKE/SUPERLIKE pairs
INSERT INTO public.matches (user1_id, user2_id, status, created_at, updated_at)
SELECT
  LEAST(s1.swiper_id, s1.target_id) AS user1_id,
  GREATEST(s1.swiper_id, s1.target_id) AS user2_id,
  'PENDING'::match_status AS status,
  now() AS created_at,
  now() AS updated_at
FROM public.swipes s1
JOIN public.swipes s2
  ON s1.swiper_id = s2.target_id
  AND s1.target_id = s2.swiper_id
WHERE s1.action IN ('LIKE', 'SUPERLIKE')
  AND s2.action IN ('LIKE', 'SUPERLIKE')
  AND NOT EXISTS (
    SELECT 1 FROM public.matches m
    WHERE m.user1_id = LEAST(s1.swiper_id, s1.target_id)
      AND m.user2_id = GREATEST(s1.swiper_id, s1.target_id)
  );
