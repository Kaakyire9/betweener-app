-- Migration: enforce unique verified phones on profiles

CREATE UNIQUE INDEX IF NOT EXISTS profiles_phone_verified_unique
ON public.profiles (phone_number)
WHERE
  phone_verified = true
  AND phone_number IS NOT NULL
  AND deleted_at IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'profiles_phone_verified_requires_number'
      AND conrelid = 'public.profiles'::regclass
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_phone_verified_requires_number
      CHECK (phone_verified = false OR phone_number IS NOT NULL);
  END IF;
END;
$$;
