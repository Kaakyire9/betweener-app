alter table public.revenuecat_webhook_inbox
  add column if not exists environment_source text not null default 'missing'
    check (environment_source in ('event.environment', 'event.purchase_environment', 'missing', 'unsupported')),
  add column if not exists attempt_count integer not null default 0
    check (attempt_count between 0 and 100),
  add column if not exists delivery_count integer not null default 1
    check (delivery_count between 1 and 1000000),
  add column if not exists last_received_at timestamptz not null default timezone('utc', now()),
  add column if not exists error text
    check (error is null or char_length(error) <= 2000);

update public.revenuecat_webhook_inbox
set
  attempt_count = case when processing_state = 'received' then 0 else 1 end,
  last_received_at = received_at
where attempt_count = 0
   or last_received_at is distinct from received_at;

create or replace function public.rpc_service_claim_revenuecat_webhook_event_v1(
  p_revenuecat_event_id text,
  p_event_type text,
  p_environment text,
  p_environment_source text,
  p_app_user_id text,
  p_payload jsonb,
  p_payload_sha256 text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  v_row public.revenuecat_webhook_inbox;
begin
  insert into public.revenuecat_webhook_inbox (
    revenuecat_event_id,
    event_type,
    environment,
    environment_source,
    app_user_id,
    processing_state,
    attempt_count,
    delivery_count,
    payload,
    payload_sha256,
    processing_started_at,
    last_received_at
  ) values (
    p_revenuecat_event_id,
    p_event_type,
    p_environment,
    p_environment_source,
    p_app_user_id,
    'processing',
    1,
    1,
    p_payload,
    p_payload_sha256,
    timezone('utc', now()),
    timezone('utc', now())
  )
  on conflict (revenuecat_event_id) do nothing
  returning * into v_row;

  if found then
    return jsonb_build_object(
      'should_process', true,
      'duplicate', false,
      'processing_state', v_row.processing_state,
      'attempt_count', v_row.attempt_count,
      'delivery_count', v_row.delivery_count,
      'received_at', v_row.received_at
    );
  end if;

  update public.revenuecat_webhook_inbox
  set
    delivery_count = delivery_count + 1,
    last_received_at = timezone('utc', now()),
    updated_at = timezone('utc', now())
  where revenuecat_event_id = p_revenuecat_event_id
  returning * into v_row;

  return jsonb_build_object(
    'should_process', false,
    'duplicate', true,
    'processing_state', v_row.processing_state,
    'attempt_count', v_row.attempt_count,
    'delivery_count', v_row.delivery_count,
    'received_at', v_row.received_at
  );
end;
$$;

revoke all on function public.rpc_service_claim_revenuecat_webhook_event_v1(
  text, text, text, text, text, jsonb, text
) from public, anon, authenticated;
grant execute on function public.rpc_service_claim_revenuecat_webhook_event_v1(
  text, text, text, text, text, jsonb, text
) to service_role;

comment on function public.rpc_service_claim_revenuecat_webhook_event_v1(
  text, text, text, text, text, jsonb, text
) is 'Atomically records the first RevenueCat delivery and observes later deliveries without reprocessing them.';
