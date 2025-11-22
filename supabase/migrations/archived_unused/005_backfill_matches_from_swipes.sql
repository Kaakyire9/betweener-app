-- Backfill migration: create matches for existing reciprocal likes
-- Inserts canonical pair (LEAST/GREATEST) with status 'PENDING'.

INSERT INTO public.matches (id, user1_id, user2_id, status, created_at, updated_at)
SELECT gen_random_uuid(), LEAST(s1.swiper_id, s1.swipee_id), GREATEST(s1.swiper_id, s1.swipee_id), 'PENDING'::match_status, now(), now()
FROM public.swipes s1
JOIN public.swipes s2
  ON s1.swiper_id = s2.swipee_id
  AND s1.swipee_id = s2.swiper_id
WHERE s1.is_like IS TRUE
  AND s2.is_like IS TRUE
  -- avoid creating duplicates
  AND NOT EXISTS (
    SELECT 1 FROM public.matches m
    WHERE m.user1_id = LEAST(s1.swiper_id, s1.swipee_id)
      AND m.user2_id = GREATEST(s1.swiper_id, s1.swipee_id)
  );
