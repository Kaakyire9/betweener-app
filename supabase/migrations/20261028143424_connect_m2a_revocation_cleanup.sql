-- Local-only M2A remediation. Preserve M0/M1 authority and the durable outbox.
begin;

create or replace function public.rpc_connect_claim_job() returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare j private.connect_provider_jobs;
begin
  select * into j from private.connect_provider_jobs where status<>'done' and available_at<=clock_timestamp()
    and (lease_until is null or lease_until<clock_timestamp())
    order by (operation='end') desc,available_at,call_id for update skip locked limit 1;
  if j.call_id is null then return null; end if;
  update private.connect_provider_jobs set status='working',attempts=attempts+1,lease=gen_random_uuid(),lease_until=clock_timestamp()+interval '60 seconds'
    where call_id=j.call_id and operation=j.operation returning * into j;
  -- The job, rather than a possibly deleted session, owns the provider identity.
  return jsonb_build_object('call_id',j.call_id,'operation',j.operation,'lease',j.lease,'attempts',j.attempts);
end $$;

create function public.rpc_connect_revoke_consent(p_grant uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare ids jsonb; n integer;
begin
  -- Existing RPC authenticates the actor, serializes the pair and commits revoked
  -- authority/terminal state/outbox together. This wrapper preserves that contract.
  perform public.rpc_connect_revoke_grant(p_grant);
  select count(*) into n from private.connect_sessions s join private.connect_provider_jobs j on j.call_id=s.id
    where s.grant_id=p_grant and j.operation='end' and j.status<>'done';
  select coalesce(jsonb_agg(id),'[]'::jsonb) into ids from (
    select s.id from private.connect_sessions s join private.connect_provider_jobs j on j.call_id=s.id
    where s.grant_id=p_grant and j.operation='end' and j.status<>'done' order by s.id limit 20
  ) x;
  return jsonb_build_object('revoked',true,'calls',ids,'pending_count',n);
end $$;

create function public.rpc_connect_claim_end(p_call uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare j private.connect_provider_jobs;
begin
  select * into j from private.connect_provider_jobs where call_id=p_call and operation='end'
    and status<>'done' and available_at<=clock_timestamp() and (lease_until is null or lease_until<clock_timestamp())
    for update skip locked;
  if j.call_id is null then return null; end if;
  update private.connect_provider_jobs set status='working',attempts=attempts+1,lease=gen_random_uuid(),lease_until=clock_timestamp()+interval '60 seconds'
    where call_id=j.call_id and operation='end' returning * into j;
  return jsonb_build_object('call_id',j.call_id,'operation','end','lease',j.lease,'attempts',j.attempts);
end $$;

revoke all on function public.rpc_connect_claim_end(uuid) from public,anon,authenticated,service_role;
grant execute on function public.rpc_connect_claim_end(uuid) to service_role;
revoke all on function public.rpc_connect_revoke_consent(uuid) from public,anon,authenticated,service_role;
grant execute on function public.rpc_connect_revoke_consent(uuid) to authenticated;
commit;
