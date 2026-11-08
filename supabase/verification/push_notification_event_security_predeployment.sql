-- Safe to run before the hardening migrations exist. This probe never mutates
-- production and does not dereference objects that may still be absent.
with inventory as (
  select
    to_regclass('private.push_notification_events') as outbox,
    to_regclass('private.push_notification_delivery_reservations') as reservations,
    to_regprocedure('private.dispatch_push_notification_event_v1(uuid)') as dispatcher,
    to_regprocedure('public.rpc_service_claim_push_notification_event_v1(uuid)') as claim_rpc,
    to_regprocedure(
      'public.rpc_service_complete_push_notification_event_v1(uuid,boolean,integer,integer,text)'
    ) as complete_rpc,
    to_regprocedure(
      'public.rpc_service_reserve_push_notification_deliveries_v1(uuid,uuid[])'
    ) as reserve_rpc
)
select
  outbox is not null as outbox_present,
  reservations is not null as delivery_reservations_present,
  dispatcher is not null as hmac_dispatcher_present,
  claim_rpc is not null as claim_rpc_present,
  complete_rpc is not null as completion_rpc_present,
  reserve_rpc is not null as reservation_rpc_present,
  outbox is not null
    and reservations is not null
    and dispatcher is not null
    and claim_rpc is not null
    and complete_rpc is not null
    and reserve_rpc is not null as hardening_schema_present
from inventory;
