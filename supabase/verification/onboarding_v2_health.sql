-- Betweener v1.2 atomic onboarding health check.
-- Read-only. Run after the V2 migration and Edge Function deployment.

-- 1. Installation and service-only execution boundary.
select
  exists (
    select 1 from supabase_migrations.schema_migrations
    where version = '20260916120000'
  ) as migration_installed,
  exists (
    select 1 from supabase_migrations.schema_migrations
    where version = '20260917120000'
  ) as evidence_contract_fix_installed,
  to_regprocedure(
    'public.rpc_service_complete_profile_onboarding_v2(uuid,jsonb,text[],uuid,timestamptz,jsonb)'
  ) is not null as function_installed,
  case when to_regprocedure(
    'public.rpc_service_complete_profile_onboarding_v2(uuid,jsonb,text[],uuid,timestamptz,jsonb)'
  ) is null then false else not has_function_privilege(
    'authenticated',
    to_regprocedure(
      'public.rpc_service_complete_profile_onboarding_v2(uuid,jsonb,text[],uuid,timestamptz,jsonb)'
    ),
    'EXECUTE'
  ) end as authenticated_blocked,
  case when to_regprocedure(
    'public.rpc_service_complete_profile_onboarding_v2(uuid,jsonb,text[],uuid,timestamptz,jsonb)'
  ) is null then false else has_function_privilege(
    'service_role',
    to_regprocedure(
      'public.rpc_service_complete_profile_onboarding_v2(uuid,jsonb,text[],uuid,timestamptz,jsonb)'
    ),
    'EXECUTE'
  ) end as service_role_allowed;

-- 2. Every receipt must represent one fully completed profile with 3-5
-- persisted interests matching the receipt.
with receipt_health as (
  select
    receipt.user_id,
    receipt.profile_id,
    receipt.interest_ids,
    profile.profile_completed,
    profile.identity_status,
    nullif(btrim(coalesce(profile.avatar_url, '')), '') is not null
      as avatar_present,
    public.profile_media_reference_is_approved(
      receipt.user_id,
      profile.avatar_url
    ) as avatar_approved,
    count(profile_interest.interest_id)::integer as persisted_interests,
    count(profile_interest.interest_id) filter (
      where profile_interest.interest_id = any(receipt.interest_ids)
    )::integer as matching_interests
  from public.profile_onboarding_completion_receipts_v2 receipt
  join public.profiles profile
    on profile.id = receipt.profile_id
   and profile.user_id = receipt.user_id
  left join public.profile_interests profile_interest
    on profile_interest.profile_id = receipt.profile_id
  group by
    receipt.user_id,
    receipt.profile_id,
    receipt.interest_ids,
    profile.profile_completed,
    profile.identity_status,
    profile.avatar_url
), blockers as (
  select count(*)::bigint as affected
  from receipt_health
  where not coalesce(profile_completed, false)
     or identity_status <> 'active'
     or not avatar_present
     or not avatar_approved
     or cardinality(interest_ids) not between 3 and 5
     or persisted_interests <> cardinality(interest_ids)
     or matching_interests <> cardinality(interest_ids)
)
select
  affected as receipt_integrity_blockers,
  affected = 0 as healthy
from blockers;

-- 3. Operational summary. No member content is exposed.
select
  receipt.onboarding_variant,
  count(*)::integer as completions,
  min(receipt.committed_at) as first_completion_at,
  max(receipt.committed_at) as last_completion_at
from public.profile_onboarding_completion_receipts_v2 receipt
group by receipt.onboarding_variant
order by receipt.onboarding_variant;
