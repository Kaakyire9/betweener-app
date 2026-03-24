-- Backfill: ensure profiles.phone_verified / phone_number are synced from verified phone_verifications rows.
-- Without this, older users may have a verified phone_verifications row but profiles.phone_verified = false,
-- causing profile_completed = false and discoverable_in_vibes to be forced off by triggers.

WITH latest_verified AS (
  SELECT DISTINCT ON (pv.user_id)
    pv.user_id,
    pv.phone_number
  FROM public.phone_verifications pv
  WHERE pv.user_id IS NOT NULL
    AND (pv.status = 'verified' OR pv.is_verified IS TRUE)
  ORDER BY pv.user_id, COALESCE(pv.verified_at, pv.updated_at, pv.created_at) DESC
)
UPDATE public.profiles p
SET phone_verified = true,
    phone_number = COALESCE(p.phone_number, v.phone_number),
    updated_at = now()
FROM latest_verified v
WHERE p.user_id = v.user_id
  AND (p.phone_verified IS DISTINCT FROM true OR p.phone_number IS NULL);

