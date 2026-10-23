-- Betweener 1.2.0 profile-media guard health check.
-- Read-only. Do not add these checks to the 1.1.1 production compatibility gate.

-- 1. Additive contract and execution boundary. Every boolean must be true.
with publication as (
  select to_regprocedure(
    'public.rpc_service_apply_profile_media_v1_2(uuid,text,text,text[],text)'
  ) as oid
)
select
  exists (select 1 from storage.buckets bucket
    where bucket.id = 'profile-media-staging-v1-2' and not bucket.public)
    as staging_bucket_private,
  exists (select 1 from pg_trigger where tgrelid = 'public.profiles'::regclass
      and tgname = 'enforce_profile_media_provenance_v1_2' and not tgisinternal)
    as provenance_trigger_active,
  to_regclass('public.approved_profile_media_objects') is not null
    as provenance_registry_installed,
  not has_table_privilege('authenticated',
    'public.approved_profile_media_objects', 'SELECT')
    as provenance_registry_private,
  not exists (select 1 from pg_policies policy
    where policy.schemaname = 'storage' and policy.tablename = 'objects'
      and policy.cmd = 'UPDATE'
      and coalesce(policy.with_check, policy.qual, '') like '%profile-media-staging-v1-2%')
    as staged_bytes_immutable,
  publication.oid is not null as publication_rpc_installed,
  publication.oid is not null
    and not has_function_privilege('authenticated', publication.oid, 'EXECUTE')
    as authenticated_cannot_publish,
  publication.oid is not null
    and has_function_privilege('service_role', publication.oid, 'EXECUTE')
    as service_can_publish
from publication;

-- 2. Recent automated decisions. RETRY_LATER indicates provider reliability,
-- not member misconduct and never creates an admin-review task.
select
  event_row.slot,
  event_row.decision,
  event_row.reason_code,
  count(*) filter (where event_row.created_at >= now() - interval '24 hours')::integer
    as events_24h,
  count(*) filter (where event_row.created_at >= now() - interval '7 days')::integer
    as events_7d,
  max(event_row.created_at) as last_event_at
from public.profile_media_guard_events_v1_2 event_row
where event_row.created_at >= now() - interval '7 days'
group by event_row.slot, event_row.decision, event_row.reason_code
order by events_24h desc, event_row.slot, event_row.decision;

-- 3. Provider availability. Investigate when retry rate is sustained above 5%.
select
  count(*) filter (where event_row.decision = 'RETRY_LATER')::integer as retries_24h,
  count(*)::integer as attempts_24h,
  round(
    count(*) filter (where event_row.decision = 'RETRY_LATER')::numeric
      / nullif(count(*), 0),
    3
  ) as retry_rate_24h,
  max(event_row.created_at) filter (where event_row.decision = 'RETRY_LATER')
    as last_retry_at
from public.profile_media_guard_events_v1_2 event_row
where event_row.created_at >= now() - interval '24 hours';
