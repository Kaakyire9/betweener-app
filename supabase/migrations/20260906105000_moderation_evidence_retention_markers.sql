-- Durable, idempotent markers for moderation evidence retention.

alter table public.content_moderation_events
  add column if not exists evidence_redacted_at timestamptz;
alter table public.profile_moderation_events
  add column if not exists evidence_redacted_at timestamptz;

create index if not exists content_moderation_events_retention_idx
  on public.content_moderation_events(created_at)
  where status <> 'PENDING_REVIEW' and evidence_redacted_at is null;
create index if not exists profile_moderation_events_retention_idx
  on public.profile_moderation_events(created_at)
  where resolved_at is not null and evidence_redacted_at is null;
