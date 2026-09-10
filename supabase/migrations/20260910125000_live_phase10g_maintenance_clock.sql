-- Betweener Live Phase 10G.11: put Studio lease/source recovery on the
-- existing database-owned maintenance clock as well as event-driven wakes.

begin;

alter function public.run_live_maintenance()
rename to run_live_maintenance_without_studio_10g_v1;

revoke all on function public.run_live_maintenance_without_studio_10g_v1()
from public, anon, authenticated;

create or replace function public.run_live_maintenance()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  v_base jsonb;
  v_studio jsonb;
  v_failures integer := 0;
begin
  if current_user <> 'postgres' and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'live_maintenance_forbidden' using errcode = '42501';
  end if;
  v_base := public.run_live_maintenance_without_studio_10g_v1();
  if v_base ->> 'status' = 'skipped_locked' then return v_base; end if;
  perform set_config('request.jwt.claim.role', 'service_role', true);
  begin
    v_studio := public.rpc_service_maintain_live_studio_program_v1(100);
  exception when others then
    v_failures := 1;
    v_studio := jsonb_build_object('maintained', false, 'reasonCode', 'studio_maintenance_failed');
    insert into public.live_maintenance_failures(task_name, sqlstate, error_message)
    values ('studio_program', sqlstate, left(sqlerrm, 500));
  end;
  return v_base || jsonb_build_object(
    'studioProgram', v_studio,
    'studioFailures', v_failures
  );
end;
$$;

revoke all on function public.run_live_maintenance() from public, anon, authenticated;
grant execute on function public.run_live_maintenance() to service_role;

commit;
