-- Harden the server-to-server push boundary with a private canonical outbox,
-- raw-body HMAC signing, replay protection and bounded delivery claims.

begin;

create table private.push_notification_events (
  id uuid primary key default gen_random_uuid(),
  delivery_kind text not null,
  recipient_user_id uuid,
  actor_user_id uuid,
  campaign_id uuid references public.live_notification_campaigns(id) on delete cascade,
  event_type text not null,
  title text,
  body text,
  data jsonb not null default '{}'::jsonb,
  idempotency_key text not null unique,
  status text not null default 'pending',
  claimed_at timestamptz,
  completed_at timestamptz,
  expires_at timestamptz not null,
  webhook_request_id bigint,
  recipient_count integer not null default 0,
  accepted_ticket_count integer not null default 0,
  outcome text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint push_notification_events_delivery_kind_valid
    check (delivery_kind in ('unicast','live_campaign')),
  constraint push_notification_events_status_valid
    check (status in ('pending','processing','delivered','failed','expired','suppressed')),
  constraint push_notification_events_shape_valid check (
    (delivery_kind = 'unicast'
      and recipient_user_id is not null
      and campaign_id is null
      and title is not null
      and body is not null)
    or
    (delivery_kind = 'live_campaign'
      and recipient_user_id is null
      and campaign_id is not null
      and title is null
      and body is null)
  ),
  constraint push_notification_events_event_type_valid
    check (event_type ~ '^[a-z][a-z0-9_]{0,63}$'),
  constraint push_notification_events_title_valid
    check (title is null or char_length(title) between 1 and 120),
  constraint push_notification_events_body_valid
    check (body is null or char_length(body) between 1 and 500),
  constraint push_notification_events_data_valid
    check (jsonb_typeof(data) = 'object' and octet_length(data::text) <= 4096),
  constraint push_notification_events_counts_valid
    check (recipient_count >= 0 and accepted_ticket_count >= 0),
  constraint push_notification_events_expiry_valid
    check (expires_at > created_at)
);

create index push_notification_events_claim_idx
  on private.push_notification_events(status, created_at)
  where status in ('pending','processing');

create index push_notification_events_recipient_volume_idx
  on private.push_notification_events(recipient_user_id, claimed_at desc)
  where claimed_at is not null;

create index push_notification_events_retention_idx
  on private.push_notification_events(completed_at)
  where status in ('delivered','failed','expired','suppressed');

revoke all on table private.push_notification_events from public, anon, authenticated, service_role;

alter table private.push_config
  add column if not exists active_signing_key_id text,
  add column if not exists active_signing_secret_name text,
  add column if not exists previous_signing_key_id text,
  add column if not exists previous_signing_secret_name text,
  add column if not exists previous_signing_valid_until timestamptz;

update private.push_config
set active_signing_key_id = coalesce(nullif(btrim(active_signing_key_id), ''), 'push-v1'),
    active_signing_secret_name = coalesce(
      nullif(btrim(active_signing_secret_name), ''),
      'push_webhook_hmac_current'
    ),
    webhook_secret = null
where id = 1;

revoke all on table private.push_config from public, anon, authenticated, service_role;

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

create or replace function private.send_push_webhook(payload jsonb)
returns void
language plpgsql
security definer
set search_path = private, public, net, vault, extensions, pg_catalog
set row_security = off
as $$
declare
  v_event_id uuid;
  v_delivery_kind text;
  v_recipient_user_id uuid;
  v_actor_user_id uuid;
  v_campaign_id uuid;
  v_campaign_attempt integer;
  v_event_type text;
  v_title text;
  v_body_text text;
  v_data jsonb;
  v_idempotency_key text;
begin
  if payload is null or jsonb_typeof(payload) <> 'object' then
    raise exception 'push_event_payload_invalid' using errcode = '22023';
  end if;

  if payload ? 'campaign_id' then
    if (payload - array['campaign_id']::text[]) <> '{}'::jsonb
      or coalesce(payload->>'campaign_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
      raise exception 'push_campaign_envelope_invalid' using errcode = '22023';
    end if;

    v_delivery_kind := 'live_campaign';
    v_campaign_id := (payload->>'campaign_id')::uuid;
    select campaign.attempt_count
      into v_campaign_attempt
    from public.live_notification_campaigns campaign
    where campaign.id = v_campaign_id;
    if not found then
      raise exception 'push_campaign_not_found' using errcode = 'P0002';
    end if;
    v_event_type := 'live_campaign';
    v_data := '{}'::jsonb;
    v_idempotency_key := encode(
      extensions.digest(
        convert_to('live_campaign:' || v_campaign_id::text || ':' || v_campaign_attempt::text, 'utf8'),
        'sha256'
      ),
      'hex'
    );
  else
    if not (payload ?& array['user_id','title','body','data'])
      or (payload - array['user_id','title','body','data']::text[]) <> '{}'::jsonb
      or coalesce(payload->>'user_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      or jsonb_typeof(payload->'data') <> 'object' then
      raise exception 'push_unicast_envelope_invalid' using errcode = '22023';
    end if;

    v_delivery_kind := 'unicast';
    v_recipient_user_id := (payload->>'user_id')::uuid;
    if not exists (select 1 from auth.users account where account.id = v_recipient_user_id) then
      select profile.user_id
        into v_recipient_user_id
      from public.profiles profile
      where profile.id = (payload->>'user_id')::uuid
      limit 1;
    end if;
    if v_recipient_user_id is null
      or not exists (select 1 from auth.users account where account.id = v_recipient_user_id) then
      raise exception 'push_recipient_not_found' using errcode = 'P0002';
    end if;

    v_title := nullif(btrim(payload->>'title'), '');
    v_body_text := nullif(btrim(payload->>'body'), '');
    v_data := payload->'data';
    v_event_type := nullif(btrim(v_data->>'type'), '');
    if v_title is null or char_length(v_title) > 120
      or v_body_text is null or char_length(v_body_text) > 500
      or octet_length(v_data::text) > 4096
      or v_event_type is null
      or v_event_type !~ '^[a-z][a-z0-9_]{0,63}$' then
      raise exception 'push_content_invalid' using errcode = '22023';
    end if;

    begin
      v_actor_user_id := coalesce(
        nullif(v_data->>'peer_user_id', '')::uuid,
        nullif(v_data->>'actor_user_id', '')::uuid,
        nullif(v_data->>'poster_user_id', '')::uuid,
        nullif(v_data->>'reactor_id', '')::uuid
      );
    exception when invalid_text_representation then
      v_actor_user_id := null;
    end;

    v_idempotency_key := encode(
      extensions.digest(convert_to(payload::text, 'utf8'), 'sha256'),
      'hex'
    );
  end if;

  insert into private.push_notification_events(
    delivery_kind,
    recipient_user_id,
    actor_user_id,
    campaign_id,
    event_type,
    title,
    body,
    data,
    idempotency_key,
    expires_at
  )
  values (
    v_delivery_kind,
    v_recipient_user_id,
    v_actor_user_id,
    v_campaign_id,
    v_event_type,
    v_title,
    v_body_text,
    v_data,
    v_idempotency_key,
    timezone('utc', now()) + case
      when v_delivery_kind = 'live_campaign' then interval '30 minutes'
      else interval '10 minutes'
    end
  )
  on conflict(idempotency_key) do nothing
  returning id into v_event_id;

  -- Repeated producers resolve to the same immutable event and never enqueue twice.
  if v_event_id is null then
    return;
  end if;

  perform private.dispatch_push_notification_event_v1(v_event_id);
end;
$$;

revoke all on function private.send_push_webhook(jsonb)
from public, anon, authenticated, service_role;

create or replace function private.enqueue_subscription_renewal_push(p_payload jsonb)
returns boolean
language plpgsql
security definer
set search_path = private, public, pg_catalog
set row_security = off
as $$
begin
  perform private.send_push_webhook(p_payload);
  return true;
end;
$$;

revoke all on function private.enqueue_subscription_renewal_push(jsonb)
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
  v_now timestamptz := timezone('utc', now());
  v_event private.push_notification_events;
  v_global_claims integer;
  v_recipient_claims integer;
  v_blocked boolean := false;
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
    update private.push_notification_events
    set status = 'expired', completed_at = v_now, outcome = 'request_expired', updated_at = v_now
    where id = p_event_id;
    return jsonb_build_object('claimStatus', 'expired');
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

    if v_blocked then
      update private.push_notification_events
      set status = 'suppressed', completed_at = v_now,
          outcome = 'canonical_authorization_denied', updated_at = v_now
      where id = p_event_id;
      return jsonb_build_object('claimStatus', 'not_authorized');
    end if;
  end if;

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

  update private.push_notification_events
  set status = 'processing', claimed_at = v_now, updated_at = v_now
  where id = p_event_id
  returning * into v_event;

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

create or replace function public.rpc_service_complete_push_notification_event_v1(
  p_event_id uuid,
  p_succeeded boolean,
  p_recipient_count integer default 0,
  p_accepted_ticket_count integer default 0,
  p_outcome text default null
)
returns boolean
language plpgsql
security definer
set search_path = public, private, pg_catalog
set row_security = off
as $$
declare
  v_updated integer;
begin
  if auth.role() <> 'service_role' then
    raise exception 'service_role_required' using errcode = '42501';
  end if;
  if p_recipient_count < 0 or p_recipient_count > 20000
    or p_accepted_ticket_count < 0 or p_accepted_ticket_count > 20000 then
    raise exception 'push_delivery_counts_invalid' using errcode = '22023';
  end if;

  update private.push_notification_events
  set status = case when p_succeeded then 'delivered' else 'failed' end,
      completed_at = timezone('utc', now()),
      recipient_count = p_recipient_count,
      accepted_ticket_count = p_accepted_ticket_count,
      outcome = left(coalesce(nullif(btrim(p_outcome), ''), case
        when p_succeeded then 'delivered'
        else 'delivery_failed'
      end), 160),
      updated_at = timezone('utc', now())
  where id = p_event_id
    and status = 'processing';
  get diagnostics v_updated = row_count;
  return v_updated = 1;
end;
$$;

revoke all on function public.rpc_service_claim_push_notification_event_v1(uuid),
  public.rpc_service_complete_push_notification_event_v1(uuid, boolean, integer, integer, text)
from public, anon, authenticated;

grant execute on function public.rpc_service_claim_push_notification_event_v1(uuid),
  public.rpc_service_complete_push_notification_event_v1(uuid, boolean, integer, integer, text)
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
  for v_event in
    select event.id
    from private.push_notification_events event
    where event.status = 'pending'
      and event.expires_at > timezone('utc', now())
      and (
        event.webhook_request_id is null
        or event.updated_at < timezone('utc', now()) - interval '5 minutes'
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
  v_deleted integer;
begin
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

do $$
declare
  v_job record;
begin
  if to_regprocedure('cron.schedule(text,text,text)') is null then
    raise notice 'pg_cron unavailable; push event dispatch and retention must be invoked externally.';
    return;
  end if;
  for v_job in select jobid from cron.job where jobname = 'push-notification-event-dispatch'
  loop
    perform cron.unschedule(v_job.jobid);
  end loop;
  for v_job in select jobid from cron.job where jobname = 'push-notification-event-retention'
  loop
    perform cron.unschedule(v_job.jobid);
  end loop;
  perform cron.schedule(
    'push-notification-event-dispatch',
    '* * * * *',
    'select private.dispatch_pending_push_notification_events_v1(100);'
  );
  perform cron.schedule(
    'push-notification-event-retention',
    '17 3 * * *',
    'select private.prune_push_notification_events_v1();'
  );
end;
$$;

comment on table private.push_notification_events is
  'Private immutable push outbox. The Edge Function accepts only its event ID and claims it at most once.';
comment on function private.send_push_webhook(jsonb) is
  'Internal producer adapter that validates canonical server payloads and signs an event-ID-only webhook using a Vault secret.';

commit;
