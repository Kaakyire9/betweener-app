begin;

create table public.circle_media_cleanup_queue (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid references public.circle_media_assets(id) on delete set null,
  bucket_id text not null default 'circle-pulse-media',
  object_path text not null,
  reason text not null,
  status text not null default 'pending',
  attempt_count integer not null default 0,
  next_attempt_at timestamptz not null default timezone('utc', now()),
  processing_started_at timestamptz,
  last_error text,
  deleted_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint circle_media_cleanup_queue_object_unique unique (bucket_id, object_path),
  constraint circle_media_cleanup_queue_bucket_valid check (bucket_id = 'circle-pulse-media'),
  constraint circle_media_cleanup_queue_reason_valid check (reason in ('expired', 'archived', 'abandoned', 'orphaned', 'rejected')),
  constraint circle_media_cleanup_queue_status_valid check (status in ('pending', 'processing', 'deleted', 'dead_letter')),
  constraint circle_media_cleanup_queue_attempts_valid check (attempt_count >= 0)
);

create index circle_media_cleanup_queue_claim_idx
  on public.circle_media_cleanup_queue(status, next_attempt_at, created_at)
  where status = 'pending';

alter table public.circle_media_cleanup_queue enable row level security;
revoke all on table public.circle_media_cleanup_queue from public, anon, authenticated;
grant select, insert, update on table public.circle_media_cleanup_queue to service_role;

create table public.circle_media_lifecycle_runs (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'running' check (status in ('running', 'succeeded', 'failed')),
  scheduled_count integer not null default 0,
  claimed_count integer not null default 0,
  deleted_count integer not null default 0,
  failed_count integer not null default 0,
  error text,
  started_at timestamptz not null default timezone('utc', now()),
  completed_at timestamptz
);

alter table public.circle_media_lifecycle_runs enable row level security;
revoke all on table public.circle_media_lifecycle_runs from public, anon, authenticated;
grant select, insert, update on table public.circle_media_lifecycle_runs to service_role;

create table public.circle_media_lifecycle_config (
  singleton boolean primary key default true check (singleton),
  endpoint text not null,
  cron_secret text not null,
  enabled boolean not null default true,
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.circle_media_lifecycle_config enable row level security;
revoke all on table public.circle_media_lifecycle_config from public, anon, authenticated, service_role;

create or replace function private.circle_media_service_role_required()
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role'
     and current_user not in ('postgres', 'supabase_admin', 'service_role') then
    raise exception 'service_role_required' using errcode = '42501';
  end if;
end;
$$;

create or replace function private.schedule_circle_media_cleanup(p_limit integer default 250)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_scheduled integer := 0;
  v_count integer := 0;
begin
  perform private.circle_media_service_role_required();

  update public.circle_pulse_items item
  set status = 'expired', updated_at = timezone('utc', now())
  from public.circle_media_assets asset
  where item.media_asset_id = asset.id
    and item.status = 'active'
    and asset.status = 'published'
    and asset.expires_at is not null
    and asset.expires_at <= timezone('utc', now());

  update public.circle_media_assets asset
  set status = 'purge_pending',
      purge_after = timezone('utc', now()),
      updated_at = timezone('utc', now())
  where (
      asset.status in ('draft', 'ready')
      and asset.created_at < timezone('utc', now()) - interval '24 hours'
    ) or (
      asset.status = 'quarantined'
      and asset.updated_at < timezone('utc', now()) - interval '7 days'
    );

  insert into public.circle_media_cleanup_queue (asset_id, bucket_id, object_path, reason)
  select asset.id, asset.bucket_id, asset.object_path,
    case
      when asset.status = 'rejected' then 'rejected'
      when asset.archived_at is not null then 'archived'
      else 'abandoned'
    end
  from public.circle_media_assets asset
  where asset.status in ('purge_pending', 'rejected', 'archived')
    and coalesce(asset.purge_after, asset.archived_at, asset.updated_at) <= timezone('utc', now())
    and asset.object_path is not null
  order by coalesce(asset.purge_after, asset.archived_at, asset.updated_at)
  limit greatest(1, least(coalesce(p_limit, 250), 1000))
  on conflict (bucket_id, object_path) do nothing;
  get diagnostics v_count = row_count;
  v_scheduled := v_scheduled + v_count;

  insert into public.circle_media_cleanup_queue (asset_id, bucket_id, object_path, reason)
  select asset.id, asset.bucket_id, asset.poster_object_path,
    case
      when asset.status = 'rejected' then 'rejected'
      when asset.archived_at is not null then 'archived'
      else 'abandoned'
    end
  from public.circle_media_assets asset
  where asset.status in ('purge_pending', 'rejected', 'archived')
    and coalesce(asset.purge_after, asset.archived_at, asset.updated_at) <= timezone('utc', now())
    and asset.poster_object_path is not null
  order by coalesce(asset.purge_after, asset.archived_at, asset.updated_at)
  limit greatest(1, least(coalesce(p_limit, 250), 1000))
  on conflict (bucket_id, object_path) do nothing;
  get diagnostics v_count = row_count;
  v_scheduled := v_scheduled + v_count;

  insert into public.circle_media_cleanup_queue (bucket_id, object_path, reason)
  select object.bucket_id, object.name, 'orphaned'
  from storage.objects object
  where object.bucket_id = 'circle-pulse-media'
    and object.created_at < timezone('utc', now()) - interval '24 hours'
    and not exists (
      select 1
      from public.circle_media_assets asset
      where asset.bucket_id = object.bucket_id
        and (asset.object_path = object.name or asset.poster_object_path = object.name)
    )
  order by object.created_at
  limit greatest(1, least(coalesce(p_limit, 250), 1000))
  on conflict (bucket_id, object_path) do nothing;
  get diagnostics v_count = row_count;
  v_scheduled := v_scheduled + v_count;

  return v_scheduled;
end;
$$;

create or replace function private.claim_circle_media_cleanup(p_limit integer default 100)
returns table(queue_id uuid, asset_id uuid, bucket_id text, object_path text, reason text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.circle_media_service_role_required();
  return query
  with claimable as (
    select queue.id
    from public.circle_media_cleanup_queue queue
    where queue.status = 'pending'
      and queue.next_attempt_at <= timezone('utc', now())
    order by queue.created_at
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 100), 250))
  )
  update public.circle_media_cleanup_queue queue
  set status = 'processing',
      processing_started_at = timezone('utc', now()),
      updated_at = timezone('utc', now())
  from claimable
  where queue.id = claimable.id
  returning queue.id, queue.asset_id, queue.bucket_id, queue.object_path, queue.reason;
end;
$$;

create or replace function private.complete_circle_media_cleanup(p_queue_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_asset_id uuid;
begin
  perform private.circle_media_service_role_required();
  update public.circle_media_cleanup_queue
  set status = 'deleted',
      deleted_at = timezone('utc', now()),
      processing_started_at = null,
      last_error = null,
      updated_at = timezone('utc', now())
  where id = p_queue_id and status = 'processing'
  returning asset_id into v_asset_id;
  if not found then return false; end if;

  if v_asset_id is not null and not exists (
    select 1 from public.circle_media_cleanup_queue queue
    where queue.asset_id = v_asset_id and queue.status <> 'deleted'
  ) then
    update public.circle_media_assets
    set status = 'deleted', deleted_at = timezone('utc', now()), updated_at = timezone('utc', now())
    where id = v_asset_id;
  end if;
  return true;
end;
$$;

create or replace function private.fail_circle_media_cleanup(p_queue_id uuid, p_error text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_attempts integer;
  v_status text;
begin
  perform private.circle_media_service_role_required();
  update public.circle_media_cleanup_queue
  set attempt_count = attempt_count + 1,
      status = case when attempt_count + 1 >= 5 then 'dead_letter' else 'pending' end,
      next_attempt_at = timezone('utc', now()) + make_interval(mins => least(60, (attempt_count + 1) * 5)),
      processing_started_at = null,
      last_error = left(coalesce(p_error, 'delete_failed'), 500),
      updated_at = timezone('utc', now())
  where id = p_queue_id and status = 'processing'
  returning attempt_count, status into v_attempts, v_status;
  if v_attempts is null then return 'not_found'; end if;
  return v_status;
end;
$$;

create or replace function public.rpc_service_schedule_circle_media_cleanup(p_limit integer default 250)
returns integer language sql security definer set search_path = ''
as $$ select private.schedule_circle_media_cleanup(p_limit); $$;

create or replace function public.rpc_service_claim_circle_media_cleanup(p_limit integer default 100)
returns table(queue_id uuid, asset_id uuid, bucket_id text, object_path text, reason text)
language sql security definer set search_path = ''
as $$ select * from private.claim_circle_media_cleanup(p_limit); $$;

create or replace function public.rpc_service_complete_circle_media_cleanup(p_queue_id uuid)
returns boolean language sql security definer set search_path = ''
as $$ select private.complete_circle_media_cleanup(p_queue_id); $$;

create or replace function public.rpc_service_fail_circle_media_cleanup(p_queue_id uuid, p_error text)
returns text language sql security definer set search_path = ''
as $$ select private.fail_circle_media_cleanup(p_queue_id, p_error); $$;

create or replace function public.invoke_circle_media_lifecycle_worker()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_config public.circle_media_lifecycle_config%rowtype;
  v_request_id bigint;
begin
  select * into v_config
  from public.circle_media_lifecycle_config config
  where config.singleton and config.enabled;
  if v_config.endpoint is null then return null; end if;
  if to_regprocedure('net.http_post(text,jsonb,jsonb,jsonb,integer)') is null then
    raise exception 'pg_net_http_post_unavailable' using errcode = '55000';
  end if;
  execute 'select net.http_post(url := $1, headers := $2, body := $3, timeout_milliseconds := 55000)'
    into v_request_id
    using v_config.endpoint,
      jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', v_config.cron_secret),
      '{}'::jsonb;
  return v_request_id;
end;
$$;

create or replace function public.configure_circle_media_lifecycle_worker(p_endpoint text, p_cron_secret text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job_id bigint;
begin
  perform private.circle_media_service_role_required();
  if p_endpoint !~ '^https://[A-Za-z0-9.-]+/functions/v1/circle-media-lifecycle$'
     or char_length(coalesce(p_cron_secret, '')) < 32 then
    raise exception 'invalid_circle_media_lifecycle_configuration' using errcode = '22023';
  end if;
  if to_regprocedure('cron.schedule(text,text,text)') is null then
    raise exception 'pg_cron_unavailable' using errcode = '55000';
  end if;

  insert into public.circle_media_lifecycle_config(singleton, endpoint, cron_secret, enabled)
  values (true, p_endpoint, p_cron_secret, true)
  on conflict (singleton) do update
  set endpoint = excluded.endpoint,
      cron_secret = excluded.cron_secret,
      enabled = true,
      updated_at = timezone('utc', now());

  select jobid into v_job_id from cron.job where jobname = 'circle-media-lifecycle' limit 1;
  if v_job_id is not null then perform cron.unschedule(v_job_id); end if;
  perform cron.schedule(
    'circle-media-lifecycle',
    '*/15 * * * *',
    'select public.invoke_circle_media_lifecycle_worker();'
  );
  return true;
end;
$$;

revoke all on function private.circle_media_service_role_required() from public, anon, authenticated;
revoke all on function private.schedule_circle_media_cleanup(integer) from public, anon, authenticated;
revoke all on function private.claim_circle_media_cleanup(integer) from public, anon, authenticated;
revoke all on function private.complete_circle_media_cleanup(uuid) from public, anon, authenticated;
revoke all on function private.fail_circle_media_cleanup(uuid, text) from public, anon, authenticated;
grant execute on function private.circle_media_service_role_required() to service_role;
grant execute on function private.schedule_circle_media_cleanup(integer) to service_role;
grant execute on function private.claim_circle_media_cleanup(integer) to service_role;
grant execute on function private.complete_circle_media_cleanup(uuid) to service_role;
grant execute on function private.fail_circle_media_cleanup(uuid, text) to service_role;

revoke all on function public.rpc_service_schedule_circle_media_cleanup(integer) from public, anon, authenticated;
revoke all on function public.rpc_service_claim_circle_media_cleanup(integer) from public, anon, authenticated;
revoke all on function public.rpc_service_complete_circle_media_cleanup(uuid) from public, anon, authenticated;
revoke all on function public.rpc_service_fail_circle_media_cleanup(uuid, text) from public, anon, authenticated;
revoke all on function public.invoke_circle_media_lifecycle_worker() from public, anon, authenticated;
revoke all on function public.configure_circle_media_lifecycle_worker(text, text) from public, anon, authenticated;
grant execute on function public.rpc_service_schedule_circle_media_cleanup(integer) to service_role;
grant execute on function public.rpc_service_claim_circle_media_cleanup(integer) to service_role;
grant execute on function public.rpc_service_complete_circle_media_cleanup(uuid) to service_role;
grant execute on function public.rpc_service_fail_circle_media_cleanup(uuid, text) to service_role;
grant execute on function public.invoke_circle_media_lifecycle_worker() to service_role;
grant execute on function public.configure_circle_media_lifecycle_worker(text, text) to service_role;

commit;
