-- Betweener 1.2 solicitation/content guard release health.
-- Read-only. Run after the v1.2 migrations and Edge Functions are deployed.

-- 1. Required additive migrations. Every installed value must be true.
with expected(version, purpose) as (values
  ('20260915120000', 'profile image staging and publication'),
  ('20260915121000', 'private-message quality and capacity'),
  ('20260915122000', 'public UGC reporting'),
  ('20260915123000', 'known unsafe media hashes'),
  ('20260915124000', 'legal acceptance audit'),
  ('20260915125000', 'moderation evidence retention worker'),
  ('20260915130000', 'moderation evidence retention controls'),
  ('20260915131000', 'immutable chat publication and profile provenance'),
  ('20260915132000', 'honest hash provider capabilities'),
  ('20260915133000', 'child-safety evidence hold'),
  ('20260915134000', 'evidence hold retention exclusion'),
  ('20260915135000', 'profile media approval provenance'),
  ('20260915140000', 'admin profile-review guarded write context'),
  ('20260915141000', 'admin profile-review system-field context')
  ,('20260921120000', 'chat image moderation receipts')
  ,('20260921121000', 'weighted rolling actor enforcement')
  ,('20260921122000', 'legacy profile media remediation')
  ,('20260921123000', 'chat media publication provenance')
  ,('20260922100000', 'atomic chat image album rate limit')
  ,('20260923220000', 'chat expression media presentation')
  ,('20260924100000', 'chat expression semantic previews')
  ,('20260924230000', 'GIPHY provider-reference messages')
  ,('20260925090000', 'provider-expression atomic fast path')
)
select expected.version, expected.purpose, exists (
  select 1 from supabase_migrations.schema_migrations migration
  where migration.version = expected.version
) as installed
from expected order by expected.version;

-- 2. Server boundaries. Every boundary_healthy value must be true.
with expected(name, signature, authenticated_execute, service_execute) as (values
  ('profile media publication',
    'public.rpc_service_apply_profile_media_v1_2(uuid,text,text,text[],text)', false, true),
  ('content rate limit',
    'public.rpc_service_consume_content_guard_rate_limit(uuid,text)', false, true),
  ('unsafe hash match',
    'public.rpc_service_match_unsafe_media_hash(text)', false, true),
  ('public UGC report',
    'public.rpc_submit_ugc_content_report_v1(text,uuid,text,jsonb)', true, true),
  ('legal acceptance',
    'public.rpc_record_current_legal_acceptance_v1(text,text,text)', true, true),
  ('retention claim',
    'public.rpc_service_claim_moderation_evidence_retention(integer,interval)', false, true),
  ('retention scheduler configuration',
    'public.configure_moderation_evidence_retention_worker(text,text)', false, true),
  ('retention scheduler stop control',
    'public.disable_moderation_evidence_retention_worker()', false, true),
  ('hash capability state',
    'public.rpc_service_get_media_hash_capabilities()', false, true),
  ('child-safety resolution',
    'public.rpc_child_safety_resolve_evidence(uuid,text,boolean)', true, true),
  ('profile media approval registration',
    'public.rpc_service_register_approved_profile_media(uuid,text,text,text,bigint,text)', false, true),
  ('chat media approval registration',
    'public.rpc_service_register_approved_chat_media(uuid,uuid,text,uuid,text,text,text,bigint,text)', false, true),
  ('legacy media remediation claim',
    'public.rpc_service_claim_profile_media_remediation(integer)', false, true),
  ('legacy media remediation resolve',
    'public.rpc_service_resolve_profile_media_remediation(uuid,uuid,text,text,text[],text)', false, true),
  ('actor appeal reversal',
    'public.rpc_admin_reverse_content_moderation_event(uuid,text)', true, true)
  ,('chat expression publication',
    'public.rpc_finalize_chat_attachment_batch_v4(uuid,uuid,text,text,smallint,jsonb,text,uuid,text,jsonb)', false, true)
  ,('provider expression publication',
    'public.rpc_service_send_provider_expression(uuid,uuid,text,jsonb,text,uuid)', false, true)
), resolved as (
  select expected.*, to_regprocedure(expected.signature) as oid from expected
)
select name, oid is not null as installed,
  oid is not null and has_function_privilege('authenticated', oid, 'EXECUTE')
    = authenticated_execute as authenticated_boundary_healthy,
  oid is not null and has_function_privilege('service_role', oid, 'EXECUTE')
    = service_execute as service_boundary_healthy
from resolved order by name;

-- 3. Storage publication boundary. Every value must be true.
select
  exists (select 1 from storage.buckets bucket where bucket.id = 'profile-media-staging-v1-2'
    and not bucket.public) as staging_private,
  exists (select 1 from storage.buckets bucket where bucket.id = 'chat-attachment-staging-v1-2'
    and not bucket.public) as chat_staging_private,
  exists (select 1 from storage.buckets bucket where bucket.id = 'moderation-quarantine'
    and not bucket.public) as quarantine_private,
  exists (select 1 from storage.buckets bucket where bucket.id = 'moderated-profile-media'
    and bucket.public) as approved_media_public,
  not exists (
    select 1 from pg_policies policy
    where policy.schemaname = 'storage' and policy.tablename = 'objects'
      and policy.roles && array['authenticated']::name[]
      and coalesce(policy.with_check, policy.qual, '') like '%moderated-profile-media%'
  ) as clients_cannot_publish_approved_media;

-- 3b. Provenance, immutable staging, and child-safety access boundaries.
select
  exists (select 1 from pg_trigger where tgrelid = 'public.profiles'::regclass
    and tgname = 'enforce_profile_media_provenance_v1_2' and not tgisinternal)
    as profile_media_provenance_active,
  not exists (select 1 from pg_policies policy
    where policy.schemaname = 'storage' and policy.tablename = 'objects'
      and policy.cmd = 'UPDATE'
      and coalesce(policy.with_check, policy.qual, '') like '%chat-attachment-staging-v1-2%')
    as chat_staging_immutable,
  not has_table_privilege('authenticated', 'public.child_safety_evidence_transitions', 'SELECT')
    as child_evidence_audit_private,
  not has_table_privilege('authenticated', 'public.child_safety_reviewers', 'SELECT')
    as child_reviewer_roster_private,
  to_regclass('public.approved_profile_media_objects') is not null
    as profile_media_provenance_registry_installed,
  not has_table_privilege('authenticated',
    'public.approved_profile_media_objects', 'SELECT')
    as profile_media_provenance_registry_private,
  to_regclass('public.approved_chat_media_objects') is not null
    as chat_media_provenance_registry_installed,
  not has_table_privilege('authenticated',
    'public.approved_chat_media_objects', 'SELECT')
    as chat_media_provenance_registry_private;

-- 4. Provider degradation is operational telemetry, not an admin queue.
select
  count(*) filter (where event_row.status = 'PENDING_REVIEW'
    and event_row.categories <@ array['provider_unavailable']::text[])::integer
      as provider_only_pending_reviews,
  count(*) filter (where event_row.status = 'PENDING_REVIEW'
    and event_row.created_at < now() - interval '24 hours')::integer
      as overdue_content_reviews,
  count(*) filter (where event_row.created_at >= now() - interval '24 hours')::integer
      as content_events_24h
from public.content_moderation_events event_row;

-- 5. New public reporting and acceptance traffic (context, not automatic fail).
select
  count(*) filter (where report.created_at >= now() - interval '24 hours')::integer
    as public_ugc_reports_24h,
  count(*) filter (where report.status = 'PENDING')::integer as open_public_ugc_reports,
  max(report.created_at) as last_public_ugc_report_at
from public.reports report
where report.evidence ->> 'source' = 'public_ugc_report';

select count(*)::integer as legal_acceptances,
  count(distinct acceptance.user_id)::integer as users_with_acceptance,
  max(acceptance.accepted_at) as last_acceptance_at
from public.legal_acceptances acceptance;

-- 6. Hash feed status. An empty list means integration-ready, not feed-ready.
select
  count(*) filter (where blocked.enabled)::integer as active_hashes,
  count(*) filter (where blocked.enabled and blocked.category = 'CSAM')::integer
    as active_csam_hashes,
  max(blocked.created_at) filter (where blocked.enabled) as last_hash_added_at
from public.unsafe_media_hash_blocklist blocked;

select
  coalesce(bool_or(capability.exact_hash_matching and capability.enabled), false)
    as exact_hash_matching,
  coalesce(bool_or(capability.perceptual_matching and capability.enabled), false)
    as perceptual_matching,
  coalesce(bool_or(capability.video_matching and capability.enabled), false)
    as video_matching,
  coalesce(bool_or(capability.external_provider_connected and capability.enabled), false)
    as external_provider_connected,
  case when coalesce(bool_or(capability.external_provider_connected and capability.enabled), false)
    then 'CONNECTED' else 'HASH_PROVIDER_NOT_CONNECTED' end as provider_status,
  max(capability.last_successful_sync) as last_successful_sync,
  max(capability.feed_version) as feed_version,
  max(capability.stale_after) as stale_after
from public.media_hash_provider_capabilities capability;

-- 6b. Legacy profile-media remediation. Dead letters and cleanup-pending rows
-- require operator attention before broad 1.2 rollout.
select
  count(*) filter (where job.status in ('PENDING', 'RETRY'))::integer as queued,
  count(*) filter (where job.status = 'PROCESSING'
    and job.claimed_at < now() - interval '15 minutes')::integer as stuck_claims,
  count(*) filter (where job.status = 'DEAD_LETTER')::integer as dead_letters,
  count(*) filter (where job.needs_source_cleanup)::integer as cleanup_pending,
  count(*) filter (where job.status = 'REMOVED')::integer as removed,
  count(*) filter (where job.status = 'SAFE')::integer as safe
from public.profile_media_remediation_jobs job;

-- 7. Retention worker. A configured scheduler and recent successful run are
-- required after the first production scheduling window.
select
  exists (
    select 1 from public.moderation_evidence_retention_config configuration
    where configuration.singleton and configuration.enabled
      and char_length(configuration.cron_secret) >= 32
  ) as retention_configured,
  exists (
    select 1 from cron.job job
    where job.jobname = 'moderation-evidence-retention' and job.active
  ) as retention_scheduled,
  count(*) filter (
    where run.status = 'running'
      and run.started_at < now() - interval '15 minutes'
  )::integer as stuck_runs,
  count(*) filter (where run.dead_letter_count > 0)::integer as runs_with_dead_letters,
  max(run.completed_at) filter (where run.status = 'succeeded') as last_success_at
from public.moderation_evidence_retention_runs run;

-- 8. Final code/data gate. healthy must be true before v1.2 publication.
with boundaries as (
  select
    to_regprocedure('public.rpc_service_apply_profile_media_v1_2(uuid,text,text,text[],text)') is not null
    and to_regprocedure('public.rpc_service_match_unsafe_media_hash(text)') is not null
    and to_regprocedure('public.rpc_submit_ugc_content_report_v1(text,uuid,text,jsonb)') is not null
    and to_regprocedure('public.rpc_record_current_legal_acceptance_v1(text,text,text)') is not null
    and to_regprocedure('public.rpc_service_claim_moderation_evidence_retention(integer,interval)') is not null
    and to_regprocedure('public.disable_moderation_evidence_retention_worker()') is not null
    and to_regprocedure('public.rpc_service_get_media_hash_capabilities()') is not null
    and to_regprocedure('public.rpc_child_safety_resolve_evidence(uuid,text,boolean)') is not null
    and to_regprocedure(
      'public.rpc_service_register_approved_profile_media(uuid,text,text,text,bigint,text)'
    ) is not null
    and to_regprocedure(
      'public.rpc_service_register_approved_chat_media(uuid,uuid,text,uuid,text,text,text,bigint,text)'
    ) is not null
    and to_regprocedure(
      'public.rpc_service_claim_profile_media_remediation(integer)'
    ) is not null
    and to_regprocedure(
      'public.rpc_service_resolve_profile_media_remediation(uuid,uuid,text,text,text[],text)'
    ) is not null
    and to_regprocedure(
      'public.rpc_admin_reverse_content_moderation_event(uuid,text)'
    ) is not null
    and to_regprocedure(
      'public.rpc_finalize_chat_attachment_batch_v4(uuid,uuid,text,text,smallint,jsonb,text,uuid,text,jsonb)'
    ) is not null
    and to_regprocedure(
      'public.rpc_service_send_provider_expression(uuid,uuid,text,jsonb,text,uuid)'
    ) is not null
    and exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'messages'
        and column_name = 'provider_media' and data_type = 'jsonb'
    )
    and exists (select 1 from pg_trigger where tgrelid = 'public.messages'::regclass
      and tgname = 'enforce_chat_provider_media_write' and not tgisinternal)
    and to_regclass('public.approved_profile_media_objects') is not null
    and not has_table_privilege(
      'authenticated', 'public.approved_profile_media_objects', 'SELECT'
    )
    and to_regclass('public.approved_chat_media_objects') is not null
    and not has_table_privilege(
      'authenticated', 'public.approved_chat_media_objects', 'SELECT'
    )
    and exists (select 1 from pg_trigger where tgrelid = 'public.profiles'::regclass
      and tgname = 'enforce_profile_media_provenance_v1_2' and not tgisinternal)
    as healthy
), queues as (
  select count(*)::bigint as blockers
  from public.content_moderation_events event_row
  where event_row.status = 'PENDING_REVIEW'
    and event_row.categories <@ array['provider_unavailable']::text[]
), storage as (
  select exists (select 1 from storage.buckets bucket
    where bucket.id = 'profile-media-staging-v1-2' and not bucket.public)
    and exists (select 1 from storage.buckets bucket
      where bucket.id = 'chat-attachment-staging-v1-2' and not bucket.public)
    and exists (select 1 from storage.buckets bucket
      where bucket.id = 'moderation-quarantine' and not bucket.public) as healthy
), provider as (
  select not coalesce(bool_or(external_provider_connected and enabled), false)
    and coalesce(bool_or(exact_hash_matching and enabled), false)
    as healthy
  from public.media_hash_provider_capabilities
), held_evidence as (
  select not exists (
    select 1 from public.content_moderation_events event_row
    where (event_row.evidence_hold or event_row.legal_hold)
      and event_row.evidence_retention_claim_id is not null
  ) as healthy
), retention as (
  select exists (
    select 1 from public.moderation_evidence_retention_config configuration
    where configuration.singleton and configuration.enabled
      and char_length(configuration.cron_secret) >= 32
  ) and exists (
    select 1 from cron.job job
    where job.jobname = 'moderation-evidence-retention' and job.active
  ) and not exists (
    select 1 from public.moderation_evidence_retention_runs run
    where run.status = 'running'
      and run.started_at < now() - interval '15 minutes'
  ) as healthy
)
select boundaries.healthy as boundaries_healthy,
  storage.healthy as storage_healthy,
  retention.healthy as retention_healthy,
  provider.healthy as provider_state_healthy,
  held_evidence.healthy as held_evidence_healthy,
  queues.blockers as provider_queue_blockers,
  boundaries.healthy and storage.healthy and retention.healthy
    and provider.healthy and held_evidence.healthy
    and queues.blockers = 0 as healthy
from boundaries, storage, retention, provider, held_evidence, queues;
