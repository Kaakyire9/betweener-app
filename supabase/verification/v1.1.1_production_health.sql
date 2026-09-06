-- Betweener 1.1.1 production compatibility health check.
--
-- Run before and after every production database deployment until 1.1.1 is
-- formally retired. This file is strictly read-only: it does not invoke write
-- RPCs, manufacture traffic, resolve reviews, or expose raw member content.
--
-- Interpretation:
--   * Every installed/executable/active/healthy compatibility boolean is true.
--   * Every release_blocker count is zero.
--   * Queue and traffic sections are operational context, not automatic fails.

-- 1. Required compatibility migrations.
with expected(version, purpose) as (
  values
    ('20260905080000', 'onboarding helper permissions'),
    ('20260905092000', 'service write identity'),
    ('20260905093000', 'completion write identity'),
    ('20260905100000', 'legacy onboarding compatibility'),
    ('20260905103000', 'legacy onboarding UPSERT RLS'),
    ('20260905110000', 'atomic server-owned onboarding'),
    ('20260905133000', 'chat-image timeout remediation'),
    ('20260905233000', 'guarded legacy profile edits'),
    ('20260905234500', 'structured timestamp false-positive remediation'),
    ('20260905235900', 'completed-profile legacy UPSERT compatibility'),
    ('20260906100000', 'immutable approved profile media'),
    ('20260906101000', 'review cohorts and media captions'),
    ('20260906102000', 'content provider rate limits'),
    ('20260906103000', 'private-message edit restrictions'),
    ('20260906104000', 'chat media inspection policy'),
    ('20260906105000', 'moderation evidence retention markers'),
    ('20260906140000', 'Circle invitation username search'),
    ('20260906143000', 'optional profile handle lifecycle'),
    ('20260906144000', 'profile handle guard integration'),
    ('20260906145000', 'non-blocking profile handle search index'),
    ('20260906153000', 'scoped profile handle reservations')
)
select
  expected.version,
  expected.purpose,
  exists (
    select 1
    from supabase_migrations.schema_migrations migration
    where migration.version = expected.version
  ) as installed
from expected
order by expected.version;

-- 2. Server-owned function installation and execution boundaries.
with expected(name, signature, authenticated_execute, service_execute) as (
  values
    ('deterministic profile assessor',
      'public.profile_guard_assess(text)', false, true),
    ('guarded profile update v3',
      'public.rpc_service_update_profile_with_guard_v3(uuid,jsonb,timestamptz,jsonb)', false, true),
    ('atomic onboarding completion',
      'public.rpc_service_complete_profile_onboarding_with_guard_v1(uuid,jsonb,timestamptz,jsonb)', false, true),
    ('profile review queue',
      'public.rpc_admin_get_profile_guard_review_queue(boolean,integer)', true, true),
    ('profile review resolution',
      'public.rpc_admin_resolve_profile_guard_review(uuid,text,text,text)', true, true),
    ('content review queue',
      'public.rpc_admin_get_content_moderation_events(integer)', true, true),
    ('content review resolution',
      'public.rpc_admin_resolve_content_moderation_event(uuid,text,text)', true, true),
    ('moderated private-message send',
      'public.rpc_service_send_moderated_private_message(uuid,uuid,text,text,text,uuid,text,text,text[],numeric,text,text,text,text)', false, true),
    ('moderated private-message edit',
      'public.rpc_service_edit_moderated_private_message(uuid,uuid,text,text,text[],numeric,text,text,text,text)', false, true),
    ('content provider rate limiter',
      'public.rpc_service_consume_content_guard_rate_limit(uuid,text)', false, true),
    ('profile handle state',
      'public.rpc_get_my_profile_handle_state()', true, true),
    ('profile handle availability',
      'public.rpc_check_profile_username_availability(text)', true, true),
    ('profile handle update',
      'public.rpc_update_my_profile_username(text,boolean)', true, true),
    ('Circle invitation username search',
      'public.rpc_search_circle_invite_candidates_v2(uuid,uuid,text,text,text,integer,integer,integer)', true, true)
), resolved as (
  select expected.*, to_regprocedure(expected.signature) as procedure_oid
  from expected
)
select
  resolved.name,
  resolved.procedure_oid is not null as installed,
  case when resolved.procedure_oid is null then false
    else has_function_privilege('authenticated', resolved.procedure_oid, 'EXECUTE')
      = resolved.authenticated_execute
  end as authenticated_boundary_healthy,
  case when resolved.procedure_oid is null then false
    else has_function_privilege('service_role', resolved.procedure_oid, 'EXECUTE')
      = resolved.service_execute
  end as service_boundary_healthy
from resolved
order by resolved.name;

-- 3. Legacy 1.1.1 profile-write contract. Every result must be true.
with trigger_definition as (
  select pg_get_functiondef(
    'public.profile_guard_prevent_direct_public_text_write()'::regprocedure
  ) as body
), bridge_definition as (
  select pg_get_functiondef(
    'public.rpc_service_update_profile_with_guard(uuid,jsonb)'::regprocedure
  ) as body
), assessor_definition as (
  select pg_get_functiondef('public.profile_guard_assess(text)'::regprocedure) as body
)
select
  exists (
    select 1 from pg_trigger
    where tgrelid = 'public.profiles'::regclass
      and tgname = 'profile_guard_prevent_direct_public_text_write'
      and not tgisinternal
  ) as direct_write_guard_active,
  trigger_definition.body like '%existing_profile.profile_completed%'
    and trigger_definition.body like '%new.user_id = auth.uid()%'
    as completed_profile_upsert_compatibility_active,
  trigger_definition.body like '%PROFILE_CONTENT_NOT_ALLOWED%'
    as unsafe_legacy_profile_text_still_blocked,
  bridge_definition.body like '%cardinality(v_guarded_keys) > 0%'
    as preference_only_enforcement_suppressed,
  assessor_definition.body like '%iso_timestamp%'
    as structured_timestamp_normalization_active,
  exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'profiles'
      and cmd = 'INSERT' and roles @> array['authenticated']::name[]
  ) as authenticated_profile_insert_policy_present,
  exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'profiles'
      and cmd = 'UPDATE' and roles @> array['authenticated']::name[]
  ) as authenticated_profile_update_policy_present,
  exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'profiles'
      and cmd = 'SELECT' and roles @> array['authenticated']::name[]
      and qual like '%user_id = auth.uid()%'
  ) as moderated_owner_read_policy_present
from trigger_definition, bridge_definition, assessor_definition;

-- 3b. Optional handle rollout contract. Every result must be true after the
-- handle migrations are installed.
select
  exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles'
      and column_name = 'username_searchable'
      and is_nullable = 'NO'
      and column_default = 'false'
  ) as handle_search_consent_column_healthy,
  exists (
    select 1 from pg_trigger
    where tgrelid = 'public.profiles'::regclass
      and tgname = 'profile_control_handle_write'
      and not tgisinternal
  ) as handle_write_guard_active,
  exists (
    select 1
    from pg_index index_metadata
    where index_metadata.indexrelid =
        to_regclass('public.idx_profiles_searchable_username_trgm')
      and index_metadata.indrelid = 'public.profiles'::regclass
      and index_metadata.indisvalid
      and index_metadata.indisready
  ) as concurrent_handle_search_index_healthy,
  exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profile_handle_reservations'
      and column_name = 'match_mode'
      and is_nullable = 'NO'
  ) as scoped_handle_reservations_installed,
  (select count(*) = 14
    from public.profile_handle_reservations reservation
    where reservation.reason = 'cultural_character'
      and reservation.match_mode = 'exact') as cultural_exact_reservations_healthy;

-- 4. Production version rules. Both platforms must keep 1.1.1 supported until
-- the retirement gate.
with expected(platform) as (values ('ios'::text), ('android'::text))
select
  expected.platform,
  rule.latest_version,
  rule.latest_build_number,
  rule.minimum_supported_version,
  rule.minimum_supported_build_number,
  rule.update_mode,
  rule.enabled,
  rule.updated_at,
  case
    when rule.id is null then 'missing_production_rule'
    when not rule.enabled then 'rule_disabled'
    when string_to_array(rule.minimum_supported_version, '.')::int[]
       > string_to_array('1.1.1', '.')::int[] then 'v1.1.1_not_supported'
    else 'v1.1.1_supported'
  end as compatibility_status
from expected
left join lateral (
  select candidate.*
  from public.app_version_rules candidate
  where candidate.platform = expected.platform
    and candidate.environment = 'production'
  order by candidate.enabled desc, candidate.updated_at desc
  limit 1
) rule on true
order by expected.platform;

-- 5. Approximate installed-version activity from push-token heartbeats.
-- This is directional telemetry; users without push tokens are not represented.
select
  coalesce(token.platform, 'unknown') as platform,
  coalesce(token.app_version, 'unknown') as app_version,
  count(distinct token.user_id)::integer as active_users_30d,
  max(token.last_seen_at) as last_seen_at
from public.push_tokens token
where token.last_seen_at >= now() - interval '30 days'
group by coalesce(token.platform, 'unknown'), coalesce(token.app_version, 'unknown')
order by platform, active_users_30d desc, app_version;

-- 6. Guard operator configuration. Unexpected OFF/REPORT_ONLY is visible here.
select
  configuration.enabled,
  configuration.semantic_enabled,
  configuration.enforcement_mode,
  configuration.backfill_enabled,
  configuration.updated_at,
  case
    when not configuration.enabled or configuration.enforcement_mode = 'OFF'
      then 'guard_disabled'
    when configuration.enforcement_mode = 'REPORT_ONLY'
      then 'report_only'
    else 'enforcing'
  end as status
from public.profile_guard_configuration configuration
where configuration.id = true;

-- 6b. 1.1.1-compatible policy for media without complete byte inspection.
-- Change one type at a time only after its full pipeline and mobile UX ship.
select
  policy.attachment_type,
  policy.enabled,
  policy.enforcement_mode,
  policy.inspection_strategy,
  policy.updated_at,
  case when policy.enabled and policy.enforcement_mode = 'REPORT_ONLY'
    then 'v1.1.1_compatible' else 'blocks_or_disables_legacy_media' end as status
from public.content_guard_media_policies policy
order by policy.attachment_type;

-- 7. Profile moderation population summary.
select
  profile.profile_moderation_state,
  count(*)::integer as profiles,
  count(*) filter (where profile.discoverable_in_vibes)::integer as discoverable,
  count(*) filter (where profile.profile_completed)::integer as completed,
  max(profile.updated_at) as last_profile_update_at
from public.profiles profile
where profile.deleted_at is null
group by profile.profile_moderation_state
order by profile.profile_moderation_state;

-- 8. Profile lifecycle release blockers. Every count must be zero.
with blockers as (
  select 'moderated_profile_is_discoverable'::text as blocker,
    count(*)::bigint as affected
  from public.profiles profile
  where profile.deleted_at is null
    and profile.profile_moderation_state <> 'CLEAR'
    and profile.discoverable_in_vibes

  union all

  select 'hidden_deterministic_profile_has_no_open_event', count(*)
  from public.profiles profile
  where profile.deleted_at is null
    and profile.profile_moderation_state in ('ACTION_REQUIRED', 'RESTRICTED')
    and not exists (
      select 1 from public.profile_moderation_events event_row
      where event_row.profile_id = profile.id
        and event_row.resolved_at is null
        and event_row.decision in ('REQUIRE_REWRITE', 'RESTRICT_PROFILE')
    )

  union all

  select 'review_required_profile_has_no_open_human_review', count(*)
  from public.profiles profile
  where profile.deleted_at is null
    and profile.profile_moderation_state = 'REVIEW_REQUIRED'
    and not exists (
      select 1 from public.profile_moderation_events event_row
      where event_row.profile_id = profile.id
        and event_row.reviewed_at is null
        and event_row.decision = 'HUMAN_REVIEW'
    )

  union all

  select 'clear_profile_has_open_deterministic_event', count(*)
  from public.profiles profile
  where profile.deleted_at is null
    and profile.profile_moderation_state = 'CLEAR'
    and exists (
      select 1 from public.profile_moderation_events event_row
      where event_row.profile_id = profile.id
        and event_row.resolved_at is null
        and event_row.decision in ('REQUIRE_REWRITE', 'RESTRICT_PROFILE')
    )

  union all

  select 'open_structured_timestamp_phone_false_positive', count(distinct event_row.profile_id)
  from public.profile_moderation_events event_row
  join public.profiles profile on profile.id = event_row.profile_id
  where event_row.resolved_at is null
    and event_row.categories = array['PHONE_CONTACT']::text[]
    and profile.relationship_compass ? 'updatedAt'
    and public.profile_guard_assess(concat_ws(' ',
      profile.full_name, profile.username, profile.bio, profile.occupation,
      profile.education, profile.looking_for, profile.tribe,
      array_to_string(profile.roots, ' '), profile.roots_note, profile.height,
      profile.exercise_frequency, profile.smoking, profile.drinking,
      profile.has_children, profile.wants_children, profile.personality_type,
      profile.love_language, profile.living_situation, profile.pets,
      array_to_string(profile.languages_spoken, ' '), profile.future_ghana_plans,
      profile.relationship_compass::text
    ))->>'decision' = 'ALLOW'
)
select blocker, affected, affected = 0 as healthy
from blockers
order by blocker;

-- 9. Recent profile enforcement traffic. No member text/evidence is returned.
select
  event_row.source,
  event_row.decision,
  event_row.categories,
  count(*) filter (where event_row.created_at >= now() - interval '24 hours')::integer
    as events_24h,
  count(*) filter (where event_row.created_at >= now() - interval '7 days')::integer
    as events_7d,
  count(*) filter (where event_row.resolved_at is null)::integer as unresolved,
  max(event_row.created_at) as last_event_at
from public.profile_moderation_events event_row
where event_row.created_at >= now() - interval '7 days'
   or event_row.resolved_at is null
group by event_row.source, event_row.decision, event_row.categories
order by unresolved desc, events_24h desc, event_row.source;

-- 10. Open profile review SLA. Hashed keys support correlation without IDs.
select
  substring(md5(event_row.profile_id::text) from 1 for 12) as profile_key,
  event_row.categories,
  event_row.risk_score,
  event_row.detector_version,
  event_row.created_at,
  round(extract(epoch from (now() - event_row.created_at)) / 3600, 1)
    as age_hours,
  case
    when event_row.created_at < now() - interval '24 hours' then 'over_24h'
    when event_row.created_at < now() - interval '4 hours' then 'over_4h'
    else 'within_4h'
  end as sla
from public.profile_moderation_events event_row
where event_row.decision = 'HUMAN_REVIEW'
  and event_row.reviewed_at is null
order by event_row.created_at;

-- 11. Content moderation traffic and provider reliability.
select
  event_row.content_type,
  event_row.decision,
  event_row.status,
  coalesce(event_row.failure_reason, '') as failure_reason,
  count(*) filter (where event_row.created_at >= now() - interval '24 hours')::integer
    as events_24h,
  count(*) filter (where event_row.created_at >= now() - interval '7 days')::integer
    as events_7d,
  max(event_row.created_at) as last_event_at
from public.content_moderation_events event_row
where event_row.created_at >= now() - interval '7 days'
   or event_row.status = 'PENDING_REVIEW'
group by
  event_row.content_type, event_row.decision, event_row.status,
  coalesce(event_row.failure_reason, '')
order by events_24h desc, event_row.content_type, event_row.status;

-- 12. Content moderation release blockers. Every count must be zero.
with blockers as (
  select 'timeout_only_chat_image_pending_review'::text as blocker,
    count(*)::bigint as affected
  from public.content_moderation_events event_row
  where event_row.content_type = 'chat_image'
    and event_row.status = 'PENDING_REVIEW'
    and event_row.categories <@ array['provider_unavailable']::text[]
    and event_row.failure_reason in (
      'OPENAI_VISION_TIMEOUT', 'OPENAI_VISION_INVALID_RESPONSE'
    )

  union all

  select 'resolved_content_event_has_invalid_review_shape', count(*)
  from public.content_moderation_events event_row
  where (event_row.status in ('APPROVED', 'REJECTED')) <> (event_row.reviewed_at is not null)

  union all

  select 'pending_content_event_has_review_metadata', count(*)
  from public.content_moderation_events event_row
  where event_row.status = 'PENDING_REVIEW'
    and (event_row.reviewed_at is not null
      or event_row.reviewed_by is not null
      or event_row.review_outcome is not null)
)
select blocker, affected, affected = 0 as healthy
from blockers
order by blocker;

-- 13. Open content review SLA. Hashed keys avoid exposing user IDs.
select
  substring(md5(event_row.actor_user_id::text) from 1 for 12) as actor_key,
  event_row.content_type,
  event_row.categories,
  event_row.risk_score,
  event_row.provider,
  event_row.provider_model,
  event_row.failure_reason,
  event_row.created_at,
  round(extract(epoch from (now() - event_row.created_at)) / 3600, 1)
    as age_hours
from public.content_moderation_events event_row
where event_row.status = 'PENDING_REVIEW'
order by event_row.created_at;

-- 14. View-once pre-encryption moderation receipts.
select
  count(*) filter (where receipt.created_at >= now() - interval '24 hours')::integer
    as receipts_24h,
  count(*) filter (where receipt.created_at >= now() - interval '7 days')::integer
    as receipts_7d,
  count(*) filter (
    where receipt.finalized_at is null and receipt.expires_at <= now()
  )::integer as expired_unfinalized,
  count(*) filter (
    where receipt.finalized_at is null and receipt.expires_at > now()
  )::integer as live_unfinalized,
  max(receipt.created_at) as last_receipt_at,
  max(receipt.finalized_at) as last_finalized_at
from public.view_once_moderation_receipts receipt;

-- 15. Chat attachment publication and retention health.
select
  count(*) filter (
    where finalization.status = 'claimed'
      and finalization.created_at < now() - interval '15 minutes'
  )::integer as stuck_claims,
  count(*) filter (
    where finalization.status = 'completed'
      and finalization.canonical_message_id is null
  )::integer as completed_without_message,
  count(*) filter (
    where finalization.created_at >= now() - interval '24 hours'
  )::integer as finalizations_24h,
  max(finalization.created_at) as last_finalization_at
from public.chat_attachment_finalization_keys finalization;

select
  retention.status,
  retention.started_at,
  retention.completed_at,
  retention.scheduled_count,
  retention.claimed_count,
  retention.deleted_count,
  retention.failed_count,
  retention.dead_letter_count,
  retention.abandoned_finalization_count,
  retention.error
from public.chat_attachment_retention_runs retention
order by retention.started_at desc
limit 10;

-- 15b. Moderation evidence eligible for the retention worker's dry run.
select
  (select count(*) from public.content_moderation_events event_row
    where event_row.status <> 'PENDING_REVIEW'
      and event_row.evidence_redacted_at is null
      and event_row.created_at < now() - interval '30 days') as content_candidates,
  (select count(*) from public.profile_moderation_events event_row
    where event_row.resolved_at is not null
      and event_row.evidence_redacted_at is null
      and event_row.created_at < now() - interval '30 days') as profile_candidates;

-- 16. Final release gate. healthy must be true and release_blockers must be 0.
with profile_blockers as (
  select count(*)::bigint as affected
  from public.profiles profile
  where profile.deleted_at is null
    and (
      (profile.profile_moderation_state <> 'CLEAR' and profile.discoverable_in_vibes)
      or (
        profile.profile_moderation_state in ('ACTION_REQUIRED', 'RESTRICTED')
        and not exists (
          select 1 from public.profile_moderation_events event_row
          where event_row.profile_id = profile.id
            and event_row.resolved_at is null
            and event_row.decision in ('REQUIRE_REWRITE', 'RESTRICT_PROFILE')
        )
      )
      or (
        profile.profile_moderation_state = 'REVIEW_REQUIRED'
        and not exists (
          select 1 from public.profile_moderation_events event_row
          where event_row.profile_id = profile.id
            and event_row.reviewed_at is null
            and event_row.decision = 'HUMAN_REVIEW'
        )
      )
    )
), content_blockers as (
  select count(*)::bigint as affected
  from public.content_moderation_events event_row
  where event_row.content_type = 'chat_image'
    and event_row.status = 'PENDING_REVIEW'
    and event_row.categories <@ array['provider_unavailable']::text[]
    and event_row.failure_reason in (
      'OPENAI_VISION_TIMEOUT', 'OPENAI_VISION_INVALID_RESPONSE'
    )
), attachment_blockers as (
  select count(*)::bigint as affected
  from public.chat_attachment_finalization_keys finalization
  where (finalization.status = 'claimed'
      and finalization.created_at < now() - interval '15 minutes')
     or (finalization.status = 'completed'
      and finalization.canonical_message_id is null)
), version_blockers as (
  select count(*)::bigint as affected
  from (values ('ios'::text), ('android'::text)) expected(platform)
  left join lateral (
    select rule.*
    from public.app_version_rules rule
    where rule.platform = expected.platform
      and rule.environment = 'production'
    order by rule.enabled desc, rule.updated_at desc
    limit 1
  ) rule on true
  where rule.id is null
     or not rule.enabled
     or string_to_array(rule.minimum_supported_version, '.')::int[]
       > string_to_array('1.1.1', '.')::int[]
), migration_blockers as (
  select count(*)::bigint as affected
  from (values
    ('20260905080000'), ('20260905092000'), ('20260905093000'),
    ('20260905100000'), ('20260905103000'), ('20260905110000'),
    ('20260905133000'), ('20260905233000'), ('20260905234500'),
    ('20260905235900'), ('20260906100000'), ('20260906101000'),
    ('20260906102000'), ('20260906103000'), ('20260906104000'),
    ('20260906105000'), ('20260906140000'), ('20260906143000'),
    ('20260906144000'), ('20260906145000'), ('20260906153000')
  ) expected(version)
  where not exists (select 1 from supabase_migrations.schema_migrations migration
    where migration.version = expected.version)
), configuration_blockers as (
  select case when exists (
    select 1 from public.profile_guard_configuration configuration
    where configuration.id = true and configuration.enabled
      and configuration.enforcement_mode = 'ENFORCE'
  ) then 0::bigint else 1::bigint end as affected
), moderation_sla_blockers as (
  select count(*)::bigint as affected from (
    select event_row.id from public.profile_moderation_events event_row
    where event_row.decision = 'HUMAN_REVIEW' and event_row.reviewed_at is null
      and event_row.created_at < now() - interval '24 hours'
    union all
    select event_row.id from public.content_moderation_events event_row
    where event_row.status = 'PENDING_REVIEW'
      and event_row.created_at < now() - interval '24 hours'
  ) overdue
), receipt_blockers as (
  select count(*)::bigint as affected
  from public.view_once_moderation_receipts receipt
  where receipt.finalized_at is null and receipt.expires_at <= now()
), storage_boundary_blockers as (
  select case when exists (
    select 1 from storage.buckets bucket
    where bucket.id = 'moderated-profile-media' and bucket.public
  ) and not exists (
    select 1 from pg_policies policy
    where policy.schemaname = 'storage' and policy.tablename = 'objects'
      and policy.roles && array['authenticated']::name[]
      and coalesce(policy.with_check, policy.qual, '') like '%moderated-profile-media%'
  ) then 0::bigint else 1::bigint end as affected
), media_policy_blockers as (
  select (3 - count(*))::bigint
    + count(*) filter (where not policy.enabled
      or policy.enforcement_mode <> 'REPORT_ONLY')::bigint as affected
  from public.content_guard_media_policies policy
  where policy.attachment_type in ('video', 'audio', 'document')
), handle_contract_blockers as (
  select case when
    exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'profiles'
        and column_name = 'username_searchable'
        and is_nullable = 'NO'
        and column_default = 'false'
    )
    and exists (
      select 1 from pg_trigger
      where tgrelid = 'public.profiles'::regclass
        and tgname = 'profile_control_handle_write'
        and not tgisinternal
    )
    and exists (
      select 1 from pg_index index_metadata
      where index_metadata.indexrelid =
          to_regclass('public.idx_profiles_searchable_username_trgm')
        and index_metadata.indrelid = 'public.profiles'::regclass
        and index_metadata.indisvalid
        and index_metadata.indisready
    )
    and exists (
      select 1 from information_schema.columns
      where table_schema = 'public'
        and table_name = 'profile_handle_reservations'
        and column_name = 'match_mode'
        and is_nullable = 'NO'
    )
    and (select count(*) = 14
      from public.profile_handle_reservations reservation
      where reservation.reason = 'cultural_character'
        and reservation.match_mode = 'exact')
    and to_regprocedure(
      'public.rpc_update_my_profile_username(text,boolean)'
    ) is not null
    and to_regprocedure(
      'public.rpc_search_circle_invite_candidates_v2(uuid,uuid,text,text,text,integer,integer,integer)'
    ) is not null
    then 0::bigint else 1::bigint end as affected
), contract as (
  select
    exists (
      select 1 from pg_trigger
      where tgrelid = 'public.profiles'::regclass
        and tgname = 'profile_guard_prevent_direct_public_text_write'
        and not tgisinternal
    )
    and pg_get_functiondef(
      'public.profile_guard_prevent_direct_public_text_write()'::regprocedure
    ) like '%existing_profile.profile_completed%'
    and pg_get_functiondef(
      'public.rpc_service_update_profile_with_guard(uuid,jsonb)'::regprocedure
    ) like '%cardinality(v_guarded_keys) > 0%'
    and pg_get_functiondef(
      'public.profile_guard_assess(text)'::regprocedure
    ) like '%iso_timestamp%'
    as healthy
)
select
  contract.healthy as compatibility_contract_healthy,
  profile_blockers.affected as profile_release_blockers,
  content_blockers.affected as content_release_blockers,
  attachment_blockers.affected as attachment_release_blockers,
  version_blockers.affected as version_rule_release_blockers,
  migration_blockers.affected as migration_release_blockers,
  configuration_blockers.affected as configuration_release_blockers,
  moderation_sla_blockers.affected as moderation_sla_release_blockers,
  receipt_blockers.affected as receipt_release_blockers,
  storage_boundary_blockers.affected as storage_boundary_release_blockers,
  media_policy_blockers.affected as media_policy_release_blockers,
  handle_contract_blockers.affected as handle_contract_release_blockers,
  profile_blockers.affected
    + content_blockers.affected
    + attachment_blockers.affected
    + version_blockers.affected
    + migration_blockers.affected
    + configuration_blockers.affected
    + moderation_sla_blockers.affected
    + receipt_blockers.affected
    + storage_boundary_blockers.affected
    + media_policy_blockers.affected
    + handle_contract_blockers.affected as release_blockers,
  contract.healthy
    and profile_blockers.affected = 0
    and content_blockers.affected = 0
    and attachment_blockers.affected = 0
    and version_blockers.affected = 0
    and migration_blockers.affected = 0
    and configuration_blockers.affected = 0
    and moderation_sla_blockers.affected = 0
    and receipt_blockers.affected = 0
    and storage_boundary_blockers.affected = 0
    and media_policy_blockers.affected = 0
    and handle_contract_blockers.affected = 0 as healthy
from contract, profile_blockers, content_blockers, attachment_blockers,
  version_blockers, migration_blockers, configuration_blockers,
  moderation_sla_blockers, receipt_blockers, storage_boundary_blockers,
  media_policy_blockers, handle_contract_blockers;
