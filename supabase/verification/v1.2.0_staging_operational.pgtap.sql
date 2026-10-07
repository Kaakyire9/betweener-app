-- Staging-only operational gate. Run explicitly with `supabase test db --linked`.
-- This file is read-only and never returns stored secrets or member content.

begin;

create extension if not exists pgtap with schema extensions;
set local role postgres;
set search_path = public, extensions, pg_catalog;
select plan(12);

select ok(
  exists (select 1 from supabase_migrations.schema_migrations
    where version = '20260915140000'),
  'admin review guarded-write context migration is installed'
);
select ok(
  exists (select 1 from supabase_migrations.schema_migrations
    where version = '20260915141000'),
  'admin review system-field context migration is installed'
);
select ok(
  exists (
    select 1 from public.moderation_evidence_retention_config configuration
    where configuration.singleton and configuration.enabled
      and char_length(configuration.cron_secret) >= 32
  ),
  'retention worker configuration contains an enabled strong secret'
);
select ok(
  exists (
    select 1 from public.moderation_evidence_retention_config configuration
    where configuration.singleton
      and configuration.endpoint =
        'https://xsgzxadwuxuziubglvps.supabase.co/functions/v1/moderation-evidence-retention'
  ),
  'retention worker points only to the staging endpoint'
);
select ok(
  exists (select 1 from cron.job job
    where job.jobname = 'moderation-evidence-retention' and job.active),
  'retention worker cron job is active'
);
select ok(
  not exists (select 1 from public.moderation_evidence_retention_runs run
    where run.status = 'running'
      and run.started_at < timezone('utc', now()) - interval '15 minutes'),
  'retention worker has no stuck run'
);
select ok(
  not exists (select 1 from public.moderation_evidence_retention_runs run
    where run.dead_letter_count > 0),
  'retention worker has no dead letters'
);
select ok(
  exists (select 1 from public.media_hash_provider_capabilities capability
    where capability.enabled and capability.exact_hash_matching),
  'exact unsafe-hash matching is enabled'
);
select ok(
  not exists (select 1 from public.media_hash_provider_capabilities capability
    where capability.enabled and capability.external_provider_connected),
  'unconnected external hash provider is not claimed as connected'
);
select ok(
  not exists (select 1 from public.content_moderation_events event_row
    where (event_row.evidence_hold or event_row.legal_hold)
      and event_row.evidence_retention_claim_id is not null),
  'held evidence cannot enter retention claims'
);
select ok(
  exists (select 1 from storage.buckets bucket
    where bucket.id = 'profile-media-staging-v1-2' and not bucket.public)
  and exists (select 1 from storage.buckets bucket
    where bucket.id = 'chat-attachment-staging-v1-2' and not bucket.public)
  and exists (select 1 from storage.buckets bucket
    where bucket.id = 'moderation-quarantine' and not bucket.public),
  'all moderation staging and quarantine buckets are private'
);
select is(
  (select count(*)::bigint from public.content_moderation_events event_row
    where event_row.status = 'PENDING_REVIEW'
      and event_row.categories <@ array['provider_unavailable']::text[]),
  0::bigint,
  'provider-only failures do not create an admin review backlog'
);

select * from finish();
rollback;
