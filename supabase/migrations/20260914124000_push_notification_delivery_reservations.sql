-- Reserve each canonical notification/token pair before contacting Expo so a
-- partial campaign failure can resume without redelivering earlier batches.

begin;

create table private.push_notification_delivery_reservations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references private.push_notification_events(id) on delete cascade,
  canonical_delivery_key text not null,
  token_id uuid not null references public.push_tokens(id) on delete cascade,
  reserved_at timestamptz not null default timezone('utc', now()),
  unique(canonical_delivery_key, token_id)
);

create index push_notification_delivery_reservations_event_idx
  on private.push_notification_delivery_reservations(event_id, reserved_at);

revoke all on table private.push_notification_delivery_reservations
from public, anon, authenticated, service_role;

create or replace function public.rpc_service_reserve_push_notification_deliveries_v1(
  p_event_id uuid,
  p_token_ids uuid[]
)
returns table(reserved_token_id uuid)
language plpgsql
security definer
set search_path = public, private, pg_catalog
set row_security = off
as $$
declare
  v_event private.push_notification_events;
  v_canonical_delivery_key text;
begin
  if auth.role() <> 'service_role' then
    raise exception 'service_role_required' using errcode = '42501';
  end if;
  if p_token_ids is null
    or cardinality(p_token_ids) < 1
    or cardinality(p_token_ids) > 100
    or array_position(p_token_ids, null) is not null then
    raise exception 'push_delivery_reservation_batch_invalid' using errcode = '22023';
  end if;

  select * into v_event
  from private.push_notification_events event
  where event.id = p_event_id
    and event.status = 'processing';
  if v_event.id is null then
    raise exception 'push_notification_event_not_processing' using errcode = '55000';
  end if;

  v_canonical_delivery_key := case
    when v_event.delivery_kind = 'live_campaign'
      then 'live_campaign:' || v_event.campaign_id::text
    else 'event:' || v_event.id::text
  end;

  return query
  insert into private.push_notification_delivery_reservations(
    event_id,
    canonical_delivery_key,
    token_id
  )
  select
    v_event.id,
    v_canonical_delivery_key,
    token.id
  from unnest(p_token_ids) requested(requested_token_id)
  join public.push_tokens token on token.id = requested.requested_token_id
  where v_event.delivery_kind = 'live_campaign'
     or token.user_id = v_event.recipient_user_id
  on conflict(canonical_delivery_key, token_id) do nothing
  returning push_notification_delivery_reservations.token_id;
end;
$$;

revoke all on function public.rpc_service_reserve_push_notification_deliveries_v1(uuid, uuid[])
from public, anon, authenticated;
grant execute on function public.rpc_service_reserve_push_notification_deliveries_v1(uuid, uuid[])
to service_role;

comment on table private.push_notification_delivery_reservations is
  'At-most-once reservation ledger for each canonical notification and Expo token.';

commit;
