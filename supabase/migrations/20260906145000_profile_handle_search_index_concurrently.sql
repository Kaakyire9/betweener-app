-- Build the optional handle-search accelerator without blocking profile writes.
-- Deliberately not enclosed in BEGIN/COMMIT: PostgreSQL requires concurrent
-- index operations to run outside a transaction block.
-- Apply with the project-pinned Supabase CLI 2.116.0, which dispatches these
-- statements outside its migration pipeline.

drop index concurrently if exists public.idx_profiles_searchable_username_trgm;

create index concurrently idx_profiles_searchable_username_trgm
  on public.profiles using gin (lower(username) public.gin_trgm_ops)
  where username is not null and username_searchable;
