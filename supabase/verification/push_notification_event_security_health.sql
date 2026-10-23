with definitions as (
  select
    lower(coalesce(pg_get_functiondef(to_regprocedure('private.send_push_webhook(jsonb)')), '')) as producer,
    lower(coalesce(pg_get_functiondef(to_regprocedure('private.dispatch_push_notification_event_v1(uuid)')), '')) as dispatcher,
    lower(coalesce(pg_get_functiondef(to_regprocedure('private.dispatch_pending_push_notification_events_v1(integer)')), '')) as pending_dispatcher,
    lower(coalesce(pg_get_functiondef(to_regprocedure('private.expire_pending_push_notification_events_v1(integer,uuid)')), '')) as expiry_finalizer,
    lower(coalesce(pg_get_functiondef(to_regprocedure('private.prune_push_notification_events_v1()')), '')) as pruner,
    lower(coalesce(pg_get_functiondef(to_regprocedure('public.rpc_service_claim_push_notification_event_v1(uuid)')), '')) as claim,
    lower(coalesce(pg_get_functiondef(to_regprocedure('public.rpc_service_complete_push_notification_event_v1(uuid,boolean,integer,integer,text)')), '')) as complete
), configuration as (
  select
    max(config.active_signing_key_id) filter (where config.id = 1) as active_signing_key_id,
    coalesce(bool_or(config.id = 1 and config.webhook_secret is null), false) as legacy_secret_retired,
    coalesce(bool_or(
      config.id = 1 and exists (
        select 1
        from vault.decrypted_secrets secret
        where secret.name = config.active_signing_secret_name
          and char_length(secret.decrypted_secret) >= 43
      )
    ), false) as dedicated_secret_ready
  from private.push_config config
), privileges as (
  select
    not has_function_privilege('anon', 'private.send_push_webhook(jsonb)', 'execute')
      and not has_function_privilege('authenticated', 'private.send_push_webhook(jsonb)', 'execute')
      and not has_function_privilege('service_role', 'private.send_push_webhook(jsonb)', 'execute')
      and not has_function_privilege('anon', 'private.dispatch_push_notification_event_v1(uuid)', 'execute')
      and not has_function_privilege('authenticated', 'private.dispatch_push_notification_event_v1(uuid)', 'execute')
      and not has_function_privilege('service_role', 'private.dispatch_push_notification_event_v1(uuid)', 'execute')
      and not has_function_privilege('anon', 'private.expire_pending_push_notification_events_v1(integer,uuid)', 'execute')
      and not has_function_privilege('authenticated', 'private.expire_pending_push_notification_events_v1(integer,uuid)', 'execute')
      and not has_function_privilege('service_role', 'private.expire_pending_push_notification_events_v1(integer,uuid)', 'execute')
      and not has_function_privilege('anon', 'public.rpc_service_claim_push_notification_event_v1(uuid)', 'execute')
      and not has_function_privilege('authenticated', 'public.rpc_service_claim_push_notification_event_v1(uuid)', 'execute')
      and has_function_privilege('service_role', 'public.rpc_service_claim_push_notification_event_v1(uuid)', 'execute')
      and not has_function_privilege('anon', 'public.rpc_service_complete_push_notification_event_v1(uuid,boolean,integer,integer,text)', 'execute')
      and not has_function_privilege('authenticated', 'public.rpc_service_complete_push_notification_event_v1(uuid,boolean,integer,integer,text)', 'execute')
      and has_function_privilege('service_role', 'public.rpc_service_complete_push_notification_event_v1(uuid,boolean,integer,integer,text)', 'execute')
      and not has_function_privilege('anon', 'public.rpc_service_reserve_push_notification_deliveries_v1(uuid,uuid[])', 'execute')
      and not has_function_privilege('authenticated', 'public.rpc_service_reserve_push_notification_deliveries_v1(uuid,uuid[])', 'execute')
      and has_function_privilege('service_role', 'public.rpc_service_reserve_push_notification_deliveries_v1(uuid,uuid[])', 'execute')
      and not has_table_privilege('anon', 'private.push_notification_events', 'select')
      and not has_table_privilege('authenticated', 'private.push_notification_events', 'select')
      and not has_table_privilege('service_role', 'private.push_notification_events', 'select')
      and not has_table_privilege('service_role', 'private.push_notification_delivery_reservations', 'select')
      as server_only
), volume as (
  select
    count(*) filter (where created_at >= timezone('utc', now()) - interval '1 hour') as events_last_hour,
    count(*) filter (
      where status = 'pending' and expires_at > timezone('utc', now())
    ) as actionable_pending_events,
    count(*) filter (
      where status = 'pending'
        and expires_at <= timezone('utc', now())
        and expires_at > timezone('utc', now()) - interval '2 minutes'
    ) as pending_expiry_grace_events,
    count(*) filter (
      where status = 'pending'
        and expires_at <= timezone('utc', now()) - interval '2 minutes'
    ) as stranded_pending_events,
    count(*) filter (where status = 'expired') as terminal_expired_events,
    count(*) filter (where status = 'processing') as processing_events,
    count(*) filter (where status = 'failed') as failed_events
  from private.push_notification_events
)
select
  to_regclass('private.push_notification_events') is not null as outbox_present,
  to_regprocedure('private.dispatch_push_notification_event_v1(uuid)') is not null as signed_dispatcher_present,
  to_regprocedure('public.rpc_service_claim_push_notification_event_v1(uuid)') is not null as atomic_claim_present,
  to_regprocedure('public.rpc_service_complete_push_notification_event_v1(uuid,boolean,integer,integer,text)') is not null as completion_present,
  to_regprocedure('public.rpc_service_reserve_push_notification_deliveries_v1(uuid,uuid[])') is not null as token_reservation_present,
  definitions.dispatcher like '%extensions.hmac%'
    and definitions.dispatcher like '%sha256%'
    and definitions.dispatcher like '%v_timestamp || ''.'' || v_raw_body%'
    and definitions.dispatcher like '%x-betweener-signature%'
    and definitions.dispatcher not like '%x-push-secret%' as hmac_raw_body_only,
  definitions.expiry_finalizer like '%for update skip locked%'
    and definitions.expiry_finalizer like '%event.status = ''pending''%'
    and definitions.expiry_finalizer like '%event.claimed_at is null%'
    and definitions.expiry_finalizer like '%event.expires_at <= v_now%'
    and definitions.expiry_finalizer like '%push_notification_delivery_reservations%'
    and definitions.dispatcher like '%expire_pending_push_notification_events_v1(1, p_event_id)%'
    and definitions.claim like '%expire_pending_push_notification_events_v1(1, p_event_id)%'
    and definitions.pending_dispatcher like '%expire_pending_push_notification_events_v1(1000, null)%'
    and definitions.pruner like '%expire_pending_push_notification_events_v1(5000, null)%'
    as expiry_lifecycle_present,
  definitions.producer like '%on conflict(idempotency_key) do nothing%' as producer_idempotent,
  definitions.claim like '%pg_advisory_xact_lock%'
    and definitions.claim like '%push-notification-rate-window%'
    and definitions.claim like '%v_event.status <> ''pending''%'
    and definitions.claim like '%''claimstatus'', ''duplicate''%'
    and definitions.complete like '%and status = ''processing''%' as replay_closed,
  privileges.server_only,
  configuration.legacy_secret_retired,
  configuration.active_signing_key_id is not null
    and configuration.dedicated_secret_ready as signing_configuration_ready,
  volume.events_last_hour,
  volume.actionable_pending_events,
  volume.actionable_pending_events as pending_events,
  volume.pending_expiry_grace_events,
  volume.stranded_pending_events,
  volume.terminal_expired_events,
  volume.processing_events,
  volume.failed_events,
  (
    to_regclass('private.push_notification_events') is not null
    and to_regprocedure('private.dispatch_push_notification_event_v1(uuid)') is not null
    and to_regprocedure('public.rpc_service_claim_push_notification_event_v1(uuid)') is not null
    and to_regprocedure('public.rpc_service_reserve_push_notification_deliveries_v1(uuid,uuid[])') is not null
    and definitions.dispatcher like '%extensions.hmac%'
    and definitions.dispatcher like '%sha256%'
    and definitions.dispatcher like '%v_timestamp || ''.'' || v_raw_body%'
    and definitions.dispatcher not like '%x-push-secret%'
    and definitions.expiry_finalizer like '%for update skip locked%'
    and definitions.expiry_finalizer like '%event.status = ''pending''%'
    and definitions.expiry_finalizer like '%event.claimed_at is null%'
    and definitions.expiry_finalizer like '%event.expires_at <= v_now%'
    and definitions.expiry_finalizer like '%push_notification_delivery_reservations%'
    and definitions.dispatcher like '%expire_pending_push_notification_events_v1(1, p_event_id)%'
    and definitions.claim like '%expire_pending_push_notification_events_v1(1, p_event_id)%'
    and definitions.pending_dispatcher like '%expire_pending_push_notification_events_v1(1000, null)%'
    and definitions.pruner like '%expire_pending_push_notification_events_v1(5000, null)%'
    and definitions.producer like '%on conflict(idempotency_key) do nothing%'
    and definitions.claim like '%pg_advisory_xact_lock%'
    and definitions.claim like '%push-notification-rate-window%'
    and definitions.claim like '%v_event.status <> ''pending''%'
    and privileges.server_only
    and configuration.legacy_secret_retired
    and configuration.active_signing_key_id is not null
    and configuration.dedicated_secret_ready
    and volume.stranded_pending_events = 0
  ) as healthy
from definitions
cross join configuration
cross join privileges
cross join volume;
