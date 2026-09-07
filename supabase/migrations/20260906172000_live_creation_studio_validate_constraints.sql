-- Validate the expand-first Studio constraints after the short metadata-only
-- installation locks have been released. VALIDATE CONSTRAINT permits normal
-- reads and writes while PostgreSQL verifies existing rows.

begin;

alter table public.live_sessions
  validate constraint live_sessions_scheduled_duration_valid;

alter table public.live_sessions
  validate constraint live_sessions_schedule_revision_valid;

alter table public.live_sessions
  validate constraint live_sessions_cancellation_reason_valid;

alter table public.live_participants
  validate constraint live_participants_rsvp_status_valid;

commit;
