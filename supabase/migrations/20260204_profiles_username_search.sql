-- Migration: add username + searchable name
-- Enables unique handle lookup and fast fuzzy search.

CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS username text,
  ADD COLUMN IF NOT EXISTS search_name text;

-- Backfill search_name from full_name.
UPDATE public.profiles
SET search_name = lower(unaccent(coalesce(full_name, '')))
WHERE search_name IS NULL;

-- Ensure usernames are case-insensitive unique.
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_username_unique
  ON public.profiles (lower(username))
  WHERE username IS NOT NULL;

-- Fast prefix/fuzzy search on names.
CREATE INDEX IF NOT EXISTS idx_profiles_search_name_trgm
  ON public.profiles
  USING gin (search_name gin_trgm_ops);

CREATE OR REPLACE FUNCTION public.update_profiles_search_name()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.search_name := lower(unaccent(coalesce(NEW.full_name, '')));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_profiles_search_name ON public.profiles;
CREATE TRIGGER set_profiles_search_name
BEFORE INSERT OR UPDATE OF full_name ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.update_profiles_search_name();
