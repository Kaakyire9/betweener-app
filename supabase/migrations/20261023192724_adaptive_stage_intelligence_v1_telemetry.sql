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
  if auth.uid() is null then
    raise exception 'adaptive_stage_diagnostic_forbidden' using errcode = '42501';
  end if;
  if p_event_name like 'stage_%' then
    if not public.live_studio_is_authorized_v1(p_session_id, auth.uid(), 'view') then
      raise exception 'adaptive_stage_diagnostic_forbidden' using errcode = '42501';
    end if;
  elsif not (
    public.can_view_live_session(p_session_id, auth.uid())
    or public.live_studio_is_authorized_v1(p_session_id, auth.uid(), 'view')
  ) then
    raise exception 'adaptive_stage_diagnostic_forbidden' using errcode = '42501';
  end if;
  select flags.diagnostics_enabled and (
    flags.shadow_enabled
    or (
      flags.adaptive_stage_m2_enabled
      and flags.adaptive_stage_m2_stage_intelligence_enabled
    )
  ) into v_enabled
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
    'adaptive_stage_v2_plan_generation_error',
    'stage_recommendations_generated',
    'stage_recommendation_previewed',
    'stage_recommendation_accepted',
    'stage_recommendation_ignored',
    'stage_manual_scene_selected',
    'stage_hold_current_recommended'
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

comment on function public.rpc_record_adaptive_stage_v2_diagnostic_v1(
  uuid, text, jsonb
) is 'Records privacy-safe Adaptive Stage and Stage Intelligence diagnostics for authorized Live viewers.';

commit;
