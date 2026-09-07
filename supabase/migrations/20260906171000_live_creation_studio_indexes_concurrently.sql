-- Build Creation Studio indexes without blocking normal Live writes.
-- Deliberately not enclosed in BEGIN/COMMIT: PostgreSQL requires concurrent
-- index operations to run outside a transaction block.

-- Remove a potentially invalid remnant from an interrupted concurrent build
-- before recreating it. These names are new in this rollout.
drop index concurrently if exists
  public.live_sessions_creator_request_unique_idx;

create unique index concurrently live_sessions_creator_request_unique_idx
  on public.live_sessions(created_by_user_id, creation_request_id)
  where creation_request_id is not null;

drop index concurrently if exists public.live_sessions_owner_archive_idx;

create index concurrently live_sessions_owner_archive_idx
  on public.live_sessions(created_by_user_id, archived_at, updated_at desc);
