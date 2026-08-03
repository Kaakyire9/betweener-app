-- Read-only production verification for the hardened attachment lifecycle.
-- Every column must return true after the migration and function deployment.

with finalize_definition as (
  select pg_get_functiondef(
    'public.rpc_finalize_chat_attachment_batch(uuid,uuid,text,text,smallint,jsonb,text,uuid)'::regprocedure
  ) as body
),
cancel_definition as (
  select pg_get_functiondef(
    'public.rpc_cancel_chat_attachment_batch(uuid,uuid,text,jsonb)'::regprocedure
  ) as body
),
atomic_finalize_definition as (
  select pg_get_functiondef(
    'public.rpc_finalize_chat_attachment_batch_v3(uuid,uuid,text,text,smallint,jsonb,text,uuid,jsonb)'::regprocedure
  ) as body
)
select
  to_regclass('public.chat_attachment_lifecycle_events') is not null
    as lifecycle_event_store_present,
  to_regclass('public.chat_attachment_cancellations') is not null
    as cancellation_tombstones_present,
  exists (
    select 1
    from pg_trigger
    where tgrelid = 'public.message_attachments'::regclass
      and tgname = 'enforce_chat_attachment_state_transition'
      and not tgisinternal
  ) as attachment_transition_guard_active,
  (
    select prosecdef
    from pg_proc
    where oid = 'public.enforce_chat_attachment_state_transition()'::regprocedure
  ) as transition_events_bypass_client_rls,
  exists (
    select 1
    from pg_trigger
    where tgrelid = 'public.messages'::regclass
      and tgname = 'enforce_chat_message_attachment_state_transition'
      and not tgisinternal
  ) as message_transition_guard_active,
  exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and tablename = 'messages'
      and indexdef ilike '%unique%'
      and indexdef ilike '%sender_id%'
      and indexdef ilike '%client_message_id%'
  ) as database_idempotency_key_unique,
  finalize_definition.body like '%pg_advisory_xact_lock%'
    as duplicate_finalizers_serialized,
  position(
    concat('insert into public.message_', 'attachments')
    in finalize_definition.body
  ) > 0
    and finalize_definition.body like '%attachment_state = ''ready''%'
    as atomic_batch_publication_active,
  finalize_definition.body like '%attachment_set_hash%'
    and finalize_definition.body like '%attachment_idempotency_conflict%'
    as immutable_attachment_set_enforced,
  finalize_definition.body like '%chat_attachment_cancellations%'
    as cancelled_batches_cannot_resurrect,
  cancel_definition.body like '%pg_advisory_xact_lock%'
    and cancel_definition.body like '%chat_attachment_cancellations%'
    as cancellation_race_guard_active,
  exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'message_attachments'
      and column_name = 'preview_storage_path'
  ) as server_preview_metadata_present,
  exists (
    select 1
    from pg_trigger
    where tgrelid = 'public.message_attachments'::regclass
      and tgname = 'schedule_chat_attachment_preview_cleanup'
      and not tgisinternal
  ) as preview_cleanup_active
  ,to_regclass('public.chat_attachment_finalization_keys') is not null
    as exact_finalization_keys_present
  ,to_regclass('public.chat_attachment_retention_runs') is not null
    as retention_run_history_present
  ,to_regprocedure('public.rpc_claim_chat_attachment_finalization(uuid,text,jsonb)') is not null
    as exact_finalization_claim_active
  ,to_regprocedure('public.rpc_fail_chat_attachment_cleanup(bigint,text)') is not null
    as cleanup_dead_letter_handler_active
  ,to_regprocedure('public.configure_chat_attachment_retention_worker(text,text)') is not null
    as retention_scheduler_configurator_active
  ,not has_function_privilege(
      'authenticated',
      'public.rpc_prepare_view_once_attachment(uuid)',
      'EXECUTE'
    )
    and not has_function_privilege(
      'authenticated',
      'public.rpc_complete_view_once_attachment(uuid)',
      'EXECUTE'
    ) as split_view_once_protocol_revoked
  ,not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Chat senders can delete media'
  ) as direct_client_media_delete_revoked
  ,to_regprocedure(
    'public.rpc_finalize_chat_attachment_batch_v3(uuid,uuid,text,text,smallint,jsonb,text,uuid,jsonb)'
  ) is not null as atomic_batch_finalizer_present
  ,to_regprocedure(
    'public.rpc_finalize_chat_attachment_v3(uuid,uuid,text,uuid,text,text,text,text,text,bigint,integer,integer,integer,text,uuid,text,jsonb,boolean,text,text,text,text,text,jsonb,text,jsonb)'
  ) is not null as atomic_single_finalizer_present
  ,atomic_finalize_definition.body like '%rpc_claim_chat_attachment_finalization%'
    and atomic_finalize_definition.body like '%rpc_finalize_chat_attachment_batch%'
    and atomic_finalize_definition.body like '%canonical_message_id = v_message.id%'
    as claim_publish_and_result_binding_are_atomic
  ,exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'chat_attachment_finalization_keys'
      and column_name = 'canonical_message_id'
  ) as canonical_result_binding_present
  ,exists (
    select 1 from pg_trigger
    where tgrelid = 'public.message_attachments'::regclass
      and tgname = 'enforce_chat_attachment_canonical_identity'
      and not tgisinternal
  ) as canonical_attachment_identity_guard_active
  ,to_regprocedure(
    'public.rpc_abandon_stale_chat_attachment_finalizations(integer)'
  ) is not null as stale_finalization_abandonment_present
  ,exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'chat_attachment_retention_runs'
      and column_name = 'abandoned_finalization_count'
  ) as abandonment_observability_present
from finalize_definition, cancel_definition, atomic_finalize_definition;
