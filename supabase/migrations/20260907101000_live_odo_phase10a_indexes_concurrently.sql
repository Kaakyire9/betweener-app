-- Phase 10A operational indexes. This migration intentionally runs outside a
-- transaction so production writes are not blocked by index construction.

create unique index concurrently if not exists live_director_events_idempotency_unique
  on public.live_director_events(session_id, idempotency_key)
  where idempotency_key is not null;

create index concurrently if not exists live_director_events_session_sequence_idx
  on public.live_director_events(session_id, sequence);

create index concurrently if not exists live_odo_usage_session_started_idx
  on public.live_odo_ai_usage(session_id, started_at desc);

create index concurrently if not exists live_odo_usage_open_idx
  on public.live_odo_ai_usage(session_id, lease_generation, started_at)
  where status = 'started';

create index concurrently if not exists live_odo_action_attempts_session_created_idx
  on public.live_odo_action_attempts(session_id, created_at desc);

create index concurrently if not exists live_odo_session_active_lease_idx
  on public.live_odo_session_state(lease_expires_at)
  where lease_owner is not null;

create index concurrently if not exists live_odo_trace_session_created_idx
  on public.live_odo_trace_events(session_id, created_at desc);

create index concurrently if not exists live_odo_budget_window_cleanup_idx
  on public.live_odo_budget_windows(window_started_at);

