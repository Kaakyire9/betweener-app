begin;

-- A validated attachment becomes immutable once canonical metadata references
-- its storage object. Upload resumption remains allowed before finalisation;
-- service_role cleanup continues to bypass storage RLS.
create or replace function public.is_chat_attachment_object_mutable(
  p_bucket_id text,
  p_storage_path text,
  p_sender_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select
    p_sender_id is not null
    and p_bucket_id in ('chat-media', 'voice-messages')
    and (storage.foldername(p_storage_path))[1] = p_sender_id::text
    and not exists (
      select 1
      from public.message_attachments attachment_row
      where attachment_row.bucket_id = p_bucket_id
        and attachment_row.storage_path = p_storage_path
        and attachment_row.lifecycle_status in ('ready', 'quarantined', 'expired')
    );
$$;

revoke all on function public.is_chat_attachment_object_mutable(text, text, uuid)
  from public, anon;
grant execute on function public.is_chat_attachment_object_mutable(text, text, uuid)
  to authenticated, service_role;

drop policy if exists "Chat senders can update media" on storage.objects;
create policy "Chat senders can update unfinalized media"
on storage.objects
for update
to authenticated
using (
  public.can_access_chat_storage_object(bucket_id, name, auth.uid())
  and public.is_chat_attachment_object_mutable(bucket_id, name, auth.uid())
)
with check (
  public.can_access_chat_storage_object(bucket_id, name, auth.uid())
  and public.is_chat_attachment_object_mutable(bucket_id, name, auth.uid())
);

-- Clients cancel through the server-owned cancellation RPC. Direct deletion
-- would otherwise permit a sender to remove a finalised recipient-visible file.
drop policy if exists "Chat senders can delete media" on storage.objects;

-- Persist the exact accepted finalisation request before message creation.
-- This is the database idempotency boundary for both single and batch flows.
create table if not exists public.chat_attachment_finalization_keys (
  sender_id uuid not null,
  client_message_id text not null,
  request_payload jsonb not null,
  created_at timestamptz not null default timezone('utc', now()),
  last_replayed_at timestamptz,
  primary key (sender_id, client_message_id),
  constraint chat_attachment_finalization_key_client_id_valid check (
    char_length(client_message_id) between 1 and 160
    and client_message_id ~ '^[A-Za-z0-9._-]+$'
  )
);

alter table public.chat_attachment_finalization_keys enable row level security;
revoke all on table public.chat_attachment_finalization_keys from public, anon, authenticated;
revoke all on table public.chat_attachment_finalization_keys from service_role;
grant select, insert, update on table public.chat_attachment_finalization_keys to service_role;

create or replace function public.rpc_claim_chat_attachment_finalization(
  p_sender_id uuid,
  p_client_message_id text,
  p_request_payload jsonb
)
returns text
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_existing jsonb;
begin
  if auth.role() <> 'service_role' then
    raise exception using errcode = '42501', message = 'service_role_required';
  end if;
  if p_sender_id is null
     or nullif(btrim(coalesce(p_client_message_id, '')), '') is null
     or char_length(p_client_message_id) > 160
     or p_client_message_id !~ '^[A-Za-z0-9._-]+$'
     or p_request_payload is null
     or jsonb_typeof(p_request_payload) <> 'object' then
    raise exception using errcode = '22023', message = 'invalid_attachment_finalization_key';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(p_sender_id::text || ':' || p_client_message_id, 0)
  );

  select key_row.request_payload
  into v_existing
  from public.chat_attachment_finalization_keys key_row
  where key_row.sender_id = p_sender_id
    and key_row.client_message_id = p_client_message_id
  for update;

  if v_existing is null then
    insert into public.chat_attachment_finalization_keys (
      sender_id, client_message_id, request_payload
    ) values (
      p_sender_id, p_client_message_id, p_request_payload
    );
    return 'claimed';
  end if;

  if v_existing is distinct from p_request_payload then
    raise exception using errcode = '22023', message = 'attachment_idempotency_conflict';
  end if;

  update public.chat_attachment_finalization_keys
  set last_replayed_at = timezone('utc', now())
  where sender_id = p_sender_id
    and client_message_id = p_client_message_id;
  return 'replay';
end;
$$;

revoke all on function public.rpc_claim_chat_attachment_finalization(uuid, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.rpc_claim_chat_attachment_finalization(uuid, text, jsonb)
  to service_role;

-- The atomic claim function created by the view-once foundation consumes the
-- receipt before any reusable signed URL is released. Keep the split protocol
-- inaccessible so two devices cannot both prepare the same object.
revoke all on function public.rpc_prepare_view_once_attachment(uuid)
  from public, anon, authenticated;
revoke all on function public.rpc_complete_view_once_attachment(uuid)
  from public, anon, authenticated;

-- Cleanup failures that exhaust retry policy must be observable instead of
-- remaining indistinguishable from transient failures forever.
alter table public.chat_attachment_cleanup_queue
  drop constraint if exists chat_attachment_cleanup_status_valid;
alter table public.chat_attachment_cleanup_queue
  add constraint chat_attachment_cleanup_status_valid check (
    status in ('scheduled', 'processing', 'failed', 'dead_letter', 'deleted')
  );

create index if not exists chat_attachment_cleanup_dead_letter_idx
  on public.chat_attachment_cleanup_queue(updated_at, id)
  where status = 'dead_letter';

create or replace function public.rpc_fail_chat_attachment_cleanup(
  p_queue_id bigint,
  p_error text
)
returns text
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_status text;
begin
  if auth.role() <> 'service_role' then
    raise exception using errcode = '42501', message = 'service_role_required';
  end if;

  update public.chat_attachment_cleanup_queue queue_row
  set status = case when queue_row.attempts >= 12 then 'dead_letter' else 'failed' end,
      processing_started_at = null,
      last_error = left(coalesce(p_error, 'delete_failed'), 500),
      updated_at = timezone('utc', now())
  where queue_row.id = p_queue_id
    and queue_row.status = 'processing'
  returning status into v_status;

  return v_status;
end;
$$;

revoke all on function public.rpc_fail_chat_attachment_cleanup(bigint, text)
  from public, anon, authenticated;
grant execute on function public.rpc_fail_chat_attachment_cleanup(bigint, text)
  to service_role;

create table if not exists public.chat_attachment_retention_runs (
  id bigint generated by default as identity primary key,
  started_at timestamptz not null default timezone('utc', now()),
  completed_at timestamptz,
  scheduled_count integer not null default 0,
  claimed_count integer not null default 0,
  deleted_count integer not null default 0,
  failed_count integer not null default 0,
  dead_letter_count integer not null default 0,
  status text not null default 'running',
  error text,
  constraint chat_attachment_retention_run_status_valid check (
    status in ('running', 'succeeded', 'failed')
  )
);

create index if not exists chat_attachment_retention_runs_started_idx
  on public.chat_attachment_retention_runs(started_at desc);
alter table public.chat_attachment_retention_runs enable row level security;
revoke all on table public.chat_attachment_retention_runs from public, anon, authenticated;
revoke all on table public.chat_attachment_retention_runs from service_role;
grant select, insert, update on table public.chat_attachment_retention_runs to service_role;

comment on table public.chat_attachment_finalization_keys is
  'Database idempotency boundary: a sender/client-message key may represent exactly one canonical finalisation payload.';
comment on table public.chat_attachment_retention_runs is
  'Durable operational history for the server-owned attachment retention worker.';

create table if not exists public.chat_attachment_retention_config (
  singleton boolean primary key default true check (singleton),
  endpoint text not null,
  cron_secret text not null,
  enabled boolean not null default true,
  updated_at timestamptz not null default timezone('utc', now())
);
alter table public.chat_attachment_retention_config enable row level security;
revoke all on table public.chat_attachment_retention_config from public, anon, authenticated, service_role;

create or replace function public.invoke_chat_attachment_retention_worker()
returns bigint
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_config public.chat_attachment_retention_config%rowtype;
  v_request_id bigint;
begin
  select * into v_config
  from public.chat_attachment_retention_config
  where singleton and enabled;
  if v_config.endpoint is null then return null; end if;
  if to_regprocedure('net.http_post(text,jsonb,jsonb,jsonb,integer)') is null then
    raise exception using errcode = '55000', message = 'pg_net_http_post_unavailable';
  end if;
  execute 'select net.http_post(url := $1, headers := $2, body := $3, timeout_milliseconds := 55000)'
    into v_request_id
    using v_config.endpoint,
      jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', v_config.cron_secret),
      '{}'::jsonb;
  return v_request_id;
end;
$$;
revoke all on function public.invoke_chat_attachment_retention_worker()
  from public, anon, authenticated;
grant execute on function public.invoke_chat_attachment_retention_worker() to service_role;

create or replace function public.configure_chat_attachment_retention_worker(
  p_endpoint text,
  p_cron_secret text
)
returns boolean
language plpgsql
security definer
set search_path = public, cron, pg_catalog
as $$
declare
  v_job_id bigint;
begin
  if current_user not in ('postgres', 'supabase_admin') and auth.role() <> 'service_role' then
    raise exception using errcode = '42501', message = 'service_role_required';
  end if;
  if p_endpoint !~ '^https://[A-Za-z0-9.-]+/functions/v1/chat-attachment-retention$'
     or char_length(coalesce(p_cron_secret, '')) < 32 then
    raise exception using errcode = '22023', message = 'invalid_retention_worker_configuration';
  end if;
  if to_regprocedure('cron.schedule(text,text,text)') is null then
    raise exception using errcode = '55000', message = 'pg_cron_unavailable';
  end if;

  insert into public.chat_attachment_retention_config (singleton, endpoint, cron_secret, enabled)
  values (true, p_endpoint, p_cron_secret, true)
  on conflict (singleton) do update
    set endpoint = excluded.endpoint, cron_secret = excluded.cron_secret,
        enabled = true, updated_at = timezone('utc', now());

  select jobid into v_job_id from cron.job
  where jobname = 'chat-attachment-retention' limit 1;
  if v_job_id is not null then perform cron.unschedule(v_job_id); end if;
  perform cron.schedule(
    'chat-attachment-retention', '*/5 * * * *',
    'select public.invoke_chat_attachment_retention_worker();'
  );
  return true;
end;
$$;
revoke all on function public.configure_chat_attachment_retention_worker(text, text)
  from public, anon, authenticated;
grant execute on function public.configure_chat_attachment_retention_worker(text, text)
  to service_role;

commit;
