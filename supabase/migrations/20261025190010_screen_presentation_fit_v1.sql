-- Adaptive Stage Engine 2.0: Screen Presentation Fit V1.
-- Feature switches remain false by default; no production enablement is performed here.

begin;

alter table public.live_odo_configuration
  add column if not exists screen_fit_v1_enabled boolean not null default false,
  add column if not exists screen_fit_lab_enabled boolean not null default false;

alter table public.live_odo_show_sessions
  add column if not exists screen_fit_mode text not null default 'auto';

alter table public.live_odo_show_sessions
  drop constraint if exists live_odo_show_screen_fit_mode_check;
alter table public.live_odo_show_sessions
  add constraint live_odo_show_screen_fit_mode_check
  check (screen_fit_mode in ('auto', 'fit', 'fill'));

create or replace function private.live_program_enrich_screen_sources_v1(
  p_sources jsonb
)
returns jsonb
language sql
stable
security invoker
set search_path = public, private, pg_catalog
as $$
  select coalesce(jsonb_agg(
    item.value || case when item.value ->> 'type' = 'screen_share' then jsonb_build_object(
      'sourceWidth', source.safe_metadata -> 'sourceWidth',
      'sourceHeight', source.safe_metadata -> 'sourceHeight',
      'sourceAspectRatio', source.safe_metadata -> 'sourceAspectRatio',
      'contentMode', coalesce(source.safe_metadata ->> 'contentMode', 'unknown')
    ) else '{}'::jsonb end
    order by item.ordinality
  ), '[]'::jsonb)
  from jsonb_array_elements(coalesce(p_sources, '[]'::jsonb))
    with ordinality as item(value, ordinality)
  left join public.live_program_sources source
    on source.id = case when item.value ->> 'id' ~
      '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      then (item.value ->> 'id')::uuid else null end;
$$;

revoke all on function private.live_program_enrich_screen_sources_v1(jsonb)
from public, anon, authenticated, service_role;

create or replace function public.rpc_get_live_studio_snapshot_v2(p_session_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, private, pg_catalog
set row_security = off
as $$
declare v_snapshot jsonb; v_fit text;
begin
  v_snapshot := public.rpc_get_live_studio_snapshot_v1(p_session_id);
  select coalesce(screen_fit_mode, 'auto') into v_fit
  from public.live_odo_show_sessions where session_id = p_session_id;
  v_snapshot := jsonb_set(v_snapshot, '{program,screenFitMode}', to_jsonb(v_fit), true);
  return jsonb_set(v_snapshot, '{sources}',
    private.live_program_enrich_screen_sources_v1(v_snapshot -> 'sources'), true);
end;
$$;

revoke all on function public.rpc_get_live_studio_snapshot_v2(uuid) from public, anon;
grant execute on function public.rpc_get_live_studio_snapshot_v2(uuid)
to authenticated, service_role;

create or replace function public.rpc_get_live_program_snapshot_v3(p_session_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, private, pg_catalog
set row_security = off
as $$
declare v_snapshot jsonb; v_fit text;
begin
  v_snapshot := public.rpc_get_live_program_snapshot_v2(p_session_id);
  select coalesce(screen_fit_mode, 'auto') into v_fit
  from public.live_odo_show_sessions where session_id = p_session_id;
  v_snapshot := jsonb_set(v_snapshot, '{program,screenFitMode}', to_jsonb(v_fit), true);
  return jsonb_set(v_snapshot, '{sources}',
    private.live_program_enrich_screen_sources_v1(v_snapshot -> 'sources'), true);
end;
$$;

revoke all on function public.rpc_get_live_program_snapshot_v3(uuid) from public, anon;
grant execute on function public.rpc_get_live_program_snapshot_v3(uuid) to authenticated;

create or replace function public.rpc_service_get_live_broadcast_snapshot_v2(
  p_session_id uuid,
  p_worker_instance_id uuid,
  p_expected_lease_generation bigint
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, private, pg_catalog
set row_security = off
as $$
declare v_snapshot jsonb; v_fit text;
begin
  v_snapshot := public.rpc_service_get_live_broadcast_snapshot_v1(
    p_session_id, p_worker_instance_id, p_expected_lease_generation
  );
  if coalesce((v_snapshot ->> 'available')::boolean, false) is not true then
    return v_snapshot;
  end if;
  select coalesce(screen_fit_mode, 'auto') into v_fit
  from public.live_odo_show_sessions where session_id = p_session_id;
  v_snapshot := jsonb_set(v_snapshot, '{program,screenFitMode}', to_jsonb(v_fit), true);
  return jsonb_set(v_snapshot, '{sources}',
    private.live_program_enrich_screen_sources_v1(v_snapshot -> 'sources'), true);
end;
$$;

revoke all on function public.rpc_service_get_live_broadcast_snapshot_v2(uuid, uuid, bigint)
from public, anon, authenticated;
grant execute on function public.rpc_service_get_live_broadcast_snapshot_v2(uuid, uuid, bigint)
to service_role;

create or replace function public.rpc_studio_upsert_live_program_source_v2(
  p_session_id uuid,
  p_source_key text,
  p_source_type text,
  p_source_role text,
  p_provider_user_id text,
  p_has_video boolean,
  p_has_audio boolean,
  p_readiness text,
  p_health text,
  p_muted boolean default false,
  p_failure_reason_code text default null,
  p_source_width integer default null,
  p_source_height integer default null,
  p_content_mode text default 'unknown'
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare v_result jsonb; v_metadata jsonb;
begin
  if not coalesce((select screen_fit_v1_enabled
    from public.live_odo_configuration where id = true), false) then
    raise exception 'screen_fit_v1_disabled' using errcode = '42501';
  end if;
  if p_content_mode not in ('unknown', 'document', 'presentation', 'media', 'demo')
    or ((p_source_width is null) <> (p_source_height is null))
    or (p_source_width is not null and p_source_width not between 1 and 16384)
    or (p_source_height is not null and p_source_height not between 1 and 16384)
    or (p_source_type <> 'screen_share' and (
      p_source_width is not null or p_source_height is not null or p_content_mode <> 'unknown'
    )) then
    raise exception 'live_studio_screen_metadata_invalid' using errcode = '22023';
  end if;

  v_result := public.rpc_studio_upsert_live_program_source_v1(
    p_session_id, p_source_key, p_source_type, p_source_role, p_provider_user_id,
    p_has_video, p_has_audio, p_readiness, p_health, p_muted, p_failure_reason_code
  );

  if p_source_type = 'screen_share' then
    v_metadata := jsonb_build_object(
      'sourceWidth', p_source_width,
      'sourceHeight', p_source_height,
      'sourceAspectRatio', case when p_source_width is not null and p_source_height is not null
        then round((p_source_width::numeric / p_source_height::numeric), 6) else null end,
      'contentMode', p_content_mode
    );
    update public.live_program_sources set
      safe_metadata = v_metadata,
      version = version + 1
    where session_id = p_session_id
      and source_key = p_source_key
      and source_type = 'screen_share'
      and owner_user_id = auth.uid()
      and safe_metadata is distinct from v_metadata;
  end if;
  return v_result;
end;
$$;

revoke all on function public.rpc_studio_upsert_live_program_source_v2(
  uuid, text, text, text, text, boolean, boolean, text, text, boolean, text,
  integer, integer, text
) from public, anon;
grant execute on function public.rpc_studio_upsert_live_program_source_v2(
  uuid, text, text, text, text, boolean, boolean, text, text, boolean, text,
  integer, integer, text
) to authenticated, service_role;

create or replace function public.rpc_studio_take_live_program_v4(
  p_session_id uuid,
  p_controller_instance_id uuid,
  p_expected_controller_generation bigint,
  p_expected_program_version bigint,
  p_expected_source_graph_version bigint,
  p_manifest_version text,
  p_command_id uuid,
  p_scene text,
  p_target_canvas text,
  p_source_assignments jsonb,
  p_screen_fit_mode text default 'auto',
  p_transition text default 'auto',
  p_shadow_plan_hash text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_catalog
set row_security = off
as $$
declare v_result jsonb; v_reason text; v_has_screen boolean;
begin
  if not coalesce((select screen_fit_v1_enabled
    from public.live_odo_configuration where id = true), false) then
    raise exception 'screen_fit_v1_disabled' using errcode = '42501';
  end if;
  if p_screen_fit_mode not in ('auto', 'fit', 'fill') then
    raise exception 'live_studio_screen_fit_invalid' using errcode = '22023';
  end if;
  select exists (
    select 1 from jsonb_each_text(coalesce(p_source_assignments, '{}'::jsonb)) assigned
    join public.live_program_sources source
      on source.session_id = p_session_id and source.source_key = assigned.value
    where source.source_type = 'screen_share'
  ) into v_has_screen;
  if p_screen_fit_mode <> 'auto' and not v_has_screen then
    raise exception 'live_studio_screen_fit_source_required' using errcode = '22023';
  end if;

  v_result := public.rpc_studio_take_live_program_v3(
    p_session_id, p_controller_instance_id, p_expected_controller_generation,
    p_expected_program_version, p_expected_source_graph_version, p_manifest_version,
    p_command_id, p_scene, p_target_canvas, p_source_assignments, p_transition,
    p_shadow_plan_hash
  );
  v_reason := v_result ->> 'reasonCode';
  if coalesce((v_result ->> 'applied')::boolean, false)
    and v_reason in ('studio_program_take', 'studio_program_cut') then
    update public.live_odo_show_sessions set
      previous_program_state = previous_program_state || jsonb_build_object(
        'screenFitMode', screen_fit_mode
      ),
      screen_fit_mode = p_screen_fit_mode
    where session_id = p_session_id;
    return public.live_program_command_result_v1(true, v_reason, p_session_id)
      || jsonb_build_object('snapshot', public.rpc_get_live_studio_snapshot_v2(p_session_id));
  end if;
  return v_result;
end;
$$;

revoke all on function public.rpc_studio_take_live_program_v4(
  uuid, uuid, bigint, bigint, bigint, text, uuid, text, text, jsonb, text, text, text
) from public, anon;
grant execute on function public.rpc_studio_take_live_program_v4(
  uuid, uuid, bigint, bigint, bigint, text, uuid, text, text, jsonb, text, text, text
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
declare v_enabled boolean := false;
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
    'adaptive_stage_v2_plan_generation_error',
    'screen_presentation_fit_resolved'
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

commit;
