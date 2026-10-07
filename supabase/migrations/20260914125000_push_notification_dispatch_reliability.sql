-- Keep canonical events queued when pg_net is temporarily unavailable and
-- terminally close abandoned processing claims without permitting replay.

begin;

create or replace function private.dispatch_push_notification_event_v1(p_event_id uuid)
returns boolean
language plpgsql
security definer
set search_path = private, net, vault, extensions, pg_catalog
set row_security = off
as $$
declare
  v_config private.push_config;
  v_secret text;
  v_event private.push_notification_events;
  v_raw_body text;
  v_timestamp text;
  v_signature text;
  v_request_id bigint;
begin
  select * into v_event
  from private.push_notification_events event
  where event.id = p_event_id
  for update;

  if v_event.id is null or v_event.status <> 'pending' then
    return false;
  end if;
  if v_event.expires_at <= timezone('utc', now()) then
    update private.push_notification_events
    set status = 'expired', completed_at = timezone('utc', now()),
        outcome = 'dispatch_expired', updated_at = timezone('utc', now())
    where id = p_event_id;
    return false;
  end if;

  select * into v_config from private.push_config config where config.id = 1;
  if v_config.webhook_url is null
    or v_config.webhook_url !~ '^https://[^[:space:]]+/functions/v1/push-notifications$'
    or v_config.active_signing_key_id is null
    or v_config.active_signing_key_id !~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$'
    or v_config.active_signing_secret_name is null then
    update private.push_notification_events
    set outcome = 'awaiting_signing_configuration', updated_at = timezone('utc', now())
    where id = p_event_id;
    return false;
  end if;

  select secret.decrypted_secret
    into v_secret
  from vault.decrypted_secrets secret
  where secret.name = v_config.active_signing_secret_name
  order by secret.updated_at desc
  limit 1;

  if v_secret is null or char_length(v_secret) < 43 then
    update private.push_notification_events
    set outcome = 'awaiting_signing_secret', updated_at = timezone('utc', now())
    where id = p_event_id;
    return false;
  end if;

  v_raw_body := jsonb_build_object('event_id', v_event.id)::text;
  v_timestamp := floor(extract(epoch from clock_timestamp()))::bigint::text;
  v_signature := encode(
    extensions.hmac(
      convert_to(v_timestamp || '.' || v_raw_body, 'utf8'),
      convert_to(v_secret, 'utf8'),
      'sha256'
    ),
    'hex'
  );

  begin
    select net.http_post(
      url := v_config.webhook_url,
      body := v_raw_body::jsonb,
      params := '{}'::jsonb,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-betweener-key-id', v_config.active_signing_key_id,
        'x-betweener-timestamp', v_timestamp,
        'x-betweener-signature', v_signature
      ),
      timeout_milliseconds := 5000
    ) into v_request_id;
  exception
    when others then
      update private.push_notification_events
      set webhook_request_id = null,
          outcome = 'webhook_dispatch_failed',
          updated_at = timezone('utc', now())
      where id = p_event_id;
      return false;
  end;

  update private.push_notification_events
  set webhook_request_id = v_request_id,
      outcome = 'webhook_dispatched',
      updated_at = timezone('utc', now())
  where id = p_event_id;
  return true;
end;
$$;

revoke all on function private.dispatch_push_notification_event_v1(uuid)
from public, anon, authenticated, service_role;

create or replace function private.prune_push_notification_events_v1()
returns integer
language plpgsql
security definer
set search_path = private, pg_catalog
set row_security = off
as $$
declare
  v_deleted integer;
begin
  update private.push_notification_events event
  set status = 'failed',
      completed_at = timezone('utc', now()),
      outcome = 'processing_claim_abandoned',
      updated_at = timezone('utc', now())
  where event.status = 'processing'
    and event.claimed_at < timezone('utc', now()) - interval '1 hour';

  with doomed as (
    select event.id
    from private.push_notification_events event
    where event.status in ('delivered','failed','expired','suppressed')
      and event.completed_at < timezone('utc', now()) - interval '30 days'
    order by event.completed_at
    limit 5000
  )
  delete from private.push_notification_events event
  using doomed
  where event.id = doomed.id;
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke all on function private.prune_push_notification_events_v1()
from public, anon, authenticated, service_role;

commit;
