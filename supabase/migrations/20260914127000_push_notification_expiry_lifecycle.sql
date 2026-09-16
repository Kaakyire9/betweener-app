-- Terminalize expired pending push events through one concurrency-safe path.
-- The minute dispatcher performs the primary sweep; retention repeats it as a
-- defensive maintenance fallback before pruning terminal audit records.

begin;

create index if not exists push_notification_events_pending_expiry_idx
  on private.push_notification_events(expires_at, id)
  where status = 'pending';

create or replace function private.expire_pending_push_notification_events_v1(
  p_limit integer default 1000,
  p_event_id uuid default null
)
returns integer
language plpgsql
security definer
set search_path = private, pg_catalog
set row_security = off
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_limit integer := least(5000, greatest(1, coalesce(p_limit, 1000)));
  v_expired integer;
begin
  with candidates as materialized (
    select event.id
    from private.push_notification_events event
    where event.status = 'pending'
      and event.claimed_at is null
      and event.expires_at <= v_now
      and (p_event_id is null or event.id = p_event_id)
      and not exists (
        select 1
        from private.push_notification_delivery_reservations reservation
        where reservation.event_id = event.id
      )
    order by event.expires_at, event.id
    limit case when p_event_id is null then v_limit else 1 end
    for update skip locked
  ), transitioned as (
    update private.push_notification_events event
    set status = 'expired',
        completed_at = v_now,
        outcome = 'expired_before_claim',
        updated_at = v_now
    from candidates
    where event.id = candidates.id
      and event.status = 'pending'
      and event.claimed_at is null
      and event.expires_at <= v_now
      and not exists (
        select 1
        from private.push_notification_delivery_reservations reservation
        where reservation.event_id = event.id
      )
    returning event.id
  )
  select count(*)::integer into v_expired from transitioned;

  return v_expired;
end;
$$;

revoke all on function private.expire_pending_push_notification_events_v1(integer, uuid)
from public, anon, authenticated, service_role;

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
  if v_event.expires_at <= clock_timestamp() then
    perform private.expire_pending_push_notification_events_v1(1, p_event_id);
    return false;
  end if;

  select * into v_config from private.push_config config where config.id = 1;
  if v_config.webhook_url is null
    or v_config.webhook_url !~ '^https://[^[:space:]]+/functions/v1/push-notifications$'
    or v_config.active_signing_key_id is null
    or v_config.active_signing_key_id !~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$'
    or v_config.active_signing_secret_name is null then
    update private.push_notification_events
    set outcome = 'awaiting_signing_configuration', updated_at = clock_timestamp()
    where id = p_event_id and status = 'pending';
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
    set outcome = 'awaiting_signing_secret', updated_at = clock_timestamp()
    where id = p_event_id and status = 'pending';
    return false;
  end if;

  -- Recheck against wall time while the event row is still locked. Cleanup
  -- and dispatch therefore cannot both win for the same pending event.
  if v_event.expires_at <= clock_timestamp() then
    perform private.expire_pending_push_notification_events_v1(1, p_event_id);
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
          updated_at = clock_timestamp()
      where id = p_event_id and status = 'pending';
      return false;
  end;

  update private.push_notification_events
  set webhook_request_id = v_request_id,
      outcome = 'webhook_dispatched',
      updated_at = clock_timestamp()
  where id = p_event_id and status = 'pending';
  return found;
end;
$$;

revoke all on function private.dispatch_push_notification_event_v1(uuid)
from public, anon, authenticated, service_role;

create or replace function public.rpc_service_claim_push_notification_event_v1(
  p_event_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_catalog
set row_security = off
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_event private.push_notification_events;
  v_global_claims integer;
  v_recipient_claims integer;
  v_blocked boolean := false;
  v_expired integer;
begin
  if auth.role() <> 'service_role' then
    raise exception 'service_role_required' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('push-notification-event:' || p_event_id::text, 0));
  select * into v_event
  from private.push_notification_events event
  where event.id = p_event_id
  for update;

  if v_event.id is null then
    raise exception 'push_notification_event_not_found' using errcode = 'P0002';
  end if;
  if v_event.status <> 'pending' then
    return jsonb_build_object('claimStatus', 'duplicate');
  end if;
  if v_event.expires_at <= v_now then
    v_expired := private.expire_pending_push_notification_events_v1(1, p_event_id);
    return jsonb_build_object(
      'claimStatus', case when v_expired = 1 then 'expired' else 'duplicate' end
    );
  end if;

  if v_event.delivery_kind = 'unicast' then
    if not exists (select 1 from auth.users account where account.id = v_event.recipient_user_id)
      or exists (
        select 1 from public.notification_prefs preference
        where preference.user_id = v_event.recipient_user_id
          and preference.push_enabled = false
      )
      or public.is_quiet_hours(v_event.recipient_user_id) then
      v_blocked := true;
    end if;

    if not v_blocked and v_event.actor_user_id is not null then
      select exists (
        select 1 from public.blocks block
        where (block.blocker_id = v_event.recipient_user_id and block.blocked_id = v_event.actor_user_id)
           or (block.blocker_id = v_event.actor_user_id and block.blocked_id = v_event.recipient_user_id)
      ) into v_blocked;
    end if;

    v_now := clock_timestamp();
    if v_event.expires_at <= v_now then
      v_expired := private.expire_pending_push_notification_events_v1(1, p_event_id);
      return jsonb_build_object(
        'claimStatus', case when v_expired = 1 then 'expired' else 'duplicate' end
      );
    end if;

    if v_blocked then
      update private.push_notification_events
      set status = 'suppressed', completed_at = v_now,
          outcome = 'canonical_authorization_denied', updated_at = v_now
      where id = p_event_id and status = 'pending';
      return jsonb_build_object('claimStatus', 'not_authorized');
    end if;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('push-notification-rate-window', 0));

  select count(*)::integer into v_global_claims
  from private.push_notification_events event
  where event.claimed_at >= v_now - interval '1 minute';
  if v_global_claims >= 300 then
    return jsonb_build_object('claimStatus', 'rate_limited');
  end if;

  if v_event.delivery_kind = 'live_campaign' and exists (
    select 1
    from private.push_notification_events event
    where event.delivery_kind = 'live_campaign'
      and event.claimed_at >= v_now - interval '1 minute'
    offset 4
  ) then
    return jsonb_build_object('claimStatus', 'rate_limited');
  end if;

  if v_event.delivery_kind = 'unicast' then
    select count(*)::integer into v_recipient_claims
    from private.push_notification_events event
    where event.recipient_user_id = v_event.recipient_user_id
      and event.claimed_at >= v_now - interval '1 minute';
    if v_recipient_claims >= 20 then
      return jsonb_build_object('claimStatus', 'rate_limited');
    end if;
  end if;

  -- Make the claim boundary use current wall-clock time, not the function's
  -- initial timestamp. This closes the race where authorization/rate checks
  -- span the event's expiry instant.
  v_now := clock_timestamp();
  if v_event.expires_at <= v_now then
    v_expired := private.expire_pending_push_notification_events_v1(1, p_event_id);
    return jsonb_build_object(
      'claimStatus', case when v_expired = 1 then 'expired' else 'duplicate' end
    );
  end if;

  update private.push_notification_events
  set status = 'processing', claimed_at = v_now, updated_at = v_now
  where id = p_event_id
    and status = 'pending'
    and expires_at > v_now
  returning * into v_event;

  if not found then
    return jsonb_build_object('claimStatus', 'duplicate');
  end if;

  return jsonb_strip_nulls(jsonb_build_object(
    'claimStatus', 'claimed',
    'eventId', v_event.id,
    'deliveryKind', v_event.delivery_kind,
    'recipientUserId', v_event.recipient_user_id,
    'campaignId', v_event.campaign_id,
    'eventType', v_event.event_type,
    'title', v_event.title,
    'body', v_event.body,
    'data', v_event.data
  ));
end;
$$;

revoke all on function public.rpc_service_claim_push_notification_event_v1(uuid)
from public, anon, authenticated;
grant execute on function public.rpc_service_claim_push_notification_event_v1(uuid)
to service_role;

create or replace function private.dispatch_pending_push_notification_events_v1(
  p_limit integer default 100
)
returns integer
language plpgsql
security definer
set search_path = private, pg_catalog
set row_security = off
as $$
declare
  v_event record;
  v_dispatched integer := 0;
  v_limit constant integer := least(100, greatest(1, coalesce(p_limit, 100)));
begin
  -- This sweep is independent of signing and network configuration.
  perform private.expire_pending_push_notification_events_v1(1000, null);

  for v_event in
    select event.id
    from private.push_notification_events event
    where event.status = 'pending'
      and event.claimed_at is null
      and event.expires_at > clock_timestamp()
      and not exists (
        select 1
        from private.push_notification_delivery_reservations reservation
        where reservation.event_id = event.id
      )
      and (
        event.webhook_request_id is null
        or event.updated_at < clock_timestamp() - interval '5 minutes'
      )
    order by event.created_at
    limit v_limit
    for update skip locked
  loop
    if private.dispatch_push_notification_event_v1(v_event.id) then
      v_dispatched := v_dispatched + 1;
    end if;
  end loop;
  return v_dispatched;
end;
$$;

revoke all on function private.dispatch_pending_push_notification_events_v1(integer)
from public, anon, authenticated, service_role;

create or replace function private.prune_push_notification_events_v1()
returns integer
language plpgsql
security definer
set search_path = private, pg_catalog
set row_security = off
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_deleted integer;
begin
  -- Daily fallback if the minute dispatcher was unavailable.
  perform private.expire_pending_push_notification_events_v1(5000, null);

  update private.push_notification_events event
  set status = 'failed',
      completed_at = v_now,
      outcome = 'processing_claim_abandoned',
      updated_at = v_now
  where event.status = 'processing'
    and event.claimed_at < v_now - interval '1 hour';

  with doomed as (
    select event.id
    from private.push_notification_events event
    where event.status in ('delivered','failed','expired','suppressed')
      and event.completed_at < v_now - interval '30 days'
    order by event.completed_at
    limit 5000
    for update skip locked
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

comment on function private.expire_pending_push_notification_events_v1(integer, uuid) is
  'Authoritative idempotent terminal transition for expired, unclaimed and unreserved push events.';

commit;
