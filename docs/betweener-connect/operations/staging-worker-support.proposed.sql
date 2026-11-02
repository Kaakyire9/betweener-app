-- PROPOSAL ONLY. Never auto-apply or include in a broad migration push.
-- Target fence in the approved installer: betweener-staging / xsgzxadwuxuziubglvps.
-- Requires existing pg_net + Vault. No job, secret, gate or budget is created here.
begin;
create table private.connect_staging_worker_dispatches (
  request_id bigint primary key,
  dispatched_at timestamptz not null default clock_timestamp()
);
alter table private.connect_staging_worker_dispatches enable row level security;
revoke all on private.connect_staging_worker_dispatches from public,anon,authenticated,service_role;

create function private.connect_dispatch_staging_worker() returns bigint
language plpgsql security definer set search_path=pg_catalog as $$
declare v_secret text; v_request bigint;
begin
  if not exists(select 1 from private.connect_config where singleton and environment in ('unconfigured','staging')) then
    raise exception 'connect_worker_environment_invalid';
  end if;
  if not pg_try_advisory_xact_lock(hashtextextended('connect-staging-worker-dispatch',0)) then return null; end if;
  -- Avoid a request pile-up. A timed-out request is not proof its Edge execution stopped.
  if exists(select 1 from private.connect_staging_worker_dispatches d
    where d.dispatched_at>clock_timestamp()-interval '20 seconds'
      and not exists(select 1 from net._http_response r where r.id=d.request_id)) then return null; end if;
  select decrypted_secret into strict v_secret from vault.decrypted_secrets where name='connect_staging_worker_secret';
  if v_secret !~ '^[0-9a-f]{64}$' then raise exception 'connect_worker_secret_invalid'; end if;
  v_request:=net.http_post(
    url:='https://xsgzxadwuxuziubglvps.supabase.co/functions/v1/connect-provider-worker',
    body:='{}'::jsonb,
    headers:=jsonb_build_object('Content-Type','application/json','x-connect-worker-secret',v_secret),
    timeout_milliseconds:=20000);
  insert into private.connect_staging_worker_dispatches(request_id) values(v_request);
  delete from private.connect_staging_worker_dispatches where dispatched_at<clock_timestamp()-interval '24 hours';
  return v_request;
exception when others then
  -- Do not echo HTTP headers, Vault data, provider payloads or dynamic SQL errors.
  raise exception 'connect_worker_dispatch_unavailable';
end $$;
revoke all on function private.connect_dispatch_staging_worker() from public,anon,authenticated,service_role;
commit;
