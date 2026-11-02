begin;

create or replace function public.rpc_record_adaptive_stage_v2_diagnostic_v1(
  p_session_id uuid,
  p_event_name text,
  p_safe_details jsonb default '{}'::jsonb
)
returns boolean
language plpgsql
security definer
set search_path = public, private, pg_catalog
set row_security = off
as $$
declare
  v_enabled boolean := false;
begin
  if auth.uid() is null or not (
    public.can_view_live_session(p_session_id, auth.uid())
    or public.live_studio_is_authorized_v1(p_session_id, auth.uid(), 'view')
  ) then
    raise exception 'adaptive_stage_diagnostic_forbidden' using errcode = '42501';
  end if;
  select flags.shadow_enabled and flags.diagnostics_enabled into v_enabled
  from private.adaptive_stage_v2_flags flags where flags.id = true;
  if not coalesce(v_enabled, false) then return false; end if;
  if p_event_name not in (
    'adaptive_stage_v2_shadow_plan_generated',
    'adaptive_stage_v2_shadow_match',
    'adaptive_stage_v2_shadow_divergence',
    'adaptive_stage_v2_invalid_assignment_rejected',
    'adaptive_stage_v2_manifest_mismatch',
    'adaptive_stage_v2_source_identity_missing',
    'adaptive_stage_v2_arbitrary_fallback_prevented',
    'adaptive_stage_v2_plan_generation_error'
  ) or jsonb_typeof(p_safe_details) <> 'object'
    or octet_length(p_safe_details::text) > 4096 then
    raise exception 'adaptive_stage_diagnostic_invalid' using errcode = '22023';
  end if;
  insert into private.adaptive_stage_v2_diagnostics(session_id, event_name, safe_details)
  values (p_session_id, p_event_name, p_safe_details);
  return true;
end;
$$;

revoke all on function public.rpc_record_adaptive_stage_v2_diagnostic_v1(
  uuid, text, jsonb
) from public, anon;
grant execute on function public.rpc_record_adaptive_stage_v2_diagnostic_v1(
  uuid, text, jsonb
) to authenticated, service_role;

create or replace function public.rpc_service_record_adaptive_stage_v2_diagnostic_v1(
  p_session_id uuid,
  p_worker_instance_id uuid,
  p_lease_generation bigint,
  p_event_name text,
  p_safe_details jsonb default '{}'::jsonb
)
returns boolean
language plpgsql
security definer
set search_path = public, private, pg_catalog
set row_security = off
as $$
declare
  v_enabled boolean := false;
begin
  if p_session_id is null or p_worker_instance_id is null
    or p_lease_generation is null or p_lease_generation < 1 then
    raise exception 'adaptive_stage_diagnostic_invalid' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.live_broadcast_runtimes runtime
    where runtime.session_id = p_session_id
      and runtime.worker_instance_id = p_worker_instance_id
      and runtime.lease_generation = p_lease_generation
      and runtime.lease_expires_at > timezone('utc', now())
  ) then
    raise exception 'adaptive_stage_diagnostic_lease_stale' using errcode = '42501';
  end if;
  select flags.shadow_enabled and flags.diagnostics_enabled into v_enabled
  from private.adaptive_stage_v2_flags flags where flags.id = true;
  if not coalesce(v_enabled, false) then return false; end if;
  if p_event_name not in (
    'adaptive_stage_v2_shadow_plan_generated',
    'adaptive_stage_v2_shadow_match',
    'adaptive_stage_v2_shadow_divergence',
    'adaptive_stage_v2_invalid_assignment_rejected',
    'adaptive_stage_v2_manifest_mismatch',
    'adaptive_stage_v2_source_identity_missing',
    'adaptive_stage_v2_arbitrary_fallback_prevented',
    'adaptive_stage_v2_plan_generation_error'
  ) or jsonb_typeof(p_safe_details) <> 'object'
    or octet_length(p_safe_details::text) > 4096 then
    raise exception 'adaptive_stage_diagnostic_invalid' using errcode = '22023';
  end if;
  insert into private.adaptive_stage_v2_diagnostics(session_id, event_name, safe_details)
  values (
    p_session_id,
    p_event_name,
    p_safe_details || jsonb_build_object('renderer_source', 'compositor')
  );
  return true;
end;
$$;

revoke all on function public.rpc_service_record_adaptive_stage_v2_diagnostic_v1(
  uuid, uuid, bigint, text, jsonb
) from public, anon, authenticated;
grant execute on function public.rpc_service_record_adaptive_stage_v2_diagnostic_v1(
  uuid, uuid, bigint, text, jsonb
) to service_role;

comment on function public.rpc_service_record_adaptive_stage_v2_diagnostic_v1(
  uuid, uuid, bigint, text, jsonb
) is 'Records redacted compositor shadow telemetry only for the current fenced worker lease.';

commit;
