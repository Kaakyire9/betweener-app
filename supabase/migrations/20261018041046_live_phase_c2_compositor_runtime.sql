begin;

create or replace function public.rpc_service_get_live_broadcast_snapshot_v1(
  p_session_id uuid,
  p_worker_instance_id uuid,
  p_lease_generation bigint
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  v_now timestamptz := timezone('utc', now());
  v_session public.live_sessions;
  v_program public.live_odo_show_sessions;
  v_runtime public.live_broadcast_runtimes;
  v_configuration public.live_odo_configuration;
  v_sources jsonb := '[]'::jsonb;
begin
  if not public.live_odo_is_service_role() then
    raise exception 'live_odo_service_role_required' using errcode = '42501';
  end if;
  if p_session_id is null or p_worker_instance_id is null
    or p_lease_generation is null or p_lease_generation < 1 then
    raise exception 'live_broadcast_snapshot_invalid' using errcode = '22023';
  end if;

  select * into v_runtime from public.live_broadcast_runtimes
  where session_id = p_session_id
    and worker_instance_id = p_worker_instance_id
    and lease_generation = p_lease_generation
    and lease_expires_at > v_now;
  if v_runtime.session_id is null then
    return jsonb_build_object(
      'available', false,
      'reasonCode', 'broadcast_lease_lost'
    );
  end if;

  select * into v_session from public.live_sessions where id = p_session_id;
  select * into v_program from public.live_odo_show_sessions where session_id = p_session_id;
  select * into v_configuration from public.live_odo_configuration where id = true;
  if v_session.id is null or v_program.session_id is null
    or v_session.provider <> 'stream'
    or v_session.status not in ('backstage', 'live', 'ending')
    or not coalesce(v_configuration.broadcast_compositor_enabled, false)
    or coalesce(v_configuration.circuit_breaker_open, true) then
    return jsonb_build_object(
      'available', false,
      'reasonCode', 'broadcast_session_unavailable'
    );
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', source.id,
    'key', source.source_key,
    'type', source.source_type,
    'role', source.source_role,
    'ownerUserId', source.owner_user_id,
    'providerUserId', source.provider_user_id,
    'hasVideo', source.has_video,
    'hasAudio', source.has_audio,
    'readiness', source.readiness,
    'health', source.health,
    'muted', source.muted,
    'failureReasonCode', source.failure_reason_code,
    'generation', source.generation,
    'version', source.version,
    'lastSeenAt', source.last_seen_at
  ) order by source.source_key), '[]'::jsonb)
  into v_sources
  from public.live_program_sources source
  where source.session_id = p_session_id;

  return jsonb_build_object(
    'available', true,
    'reasonCode', 'broadcast_snapshot_ready',
    'serverNow', v_now,
    'session', jsonb_build_object(
      'id', v_session.id,
      'title', v_session.title,
      'status', v_session.status,
      'version', v_session.version
    ),
    'provider', jsonb_build_object(
      'callType', v_session.provider_call_type,
      'callId', v_session.provider_call_id,
      'userId', v_runtime.output_provider_user_id
    ),
    'program', jsonb_build_object(
      'schemaVersion', 1,
      'sessionId', v_session.id,
      'scene', coalesce(v_program.current_scene, 'host_focus'),
      'targetCanvas', coalesce(v_program.target_canvas, 'landscape_16_9'),
      'sourceAssignments', coalesce(v_program.source_assignments, '{}'::jsonb),
      'transition', coalesce(v_program.program_transition, 'auto'),
      'fallbackScene', coalesce(v_program.fallback_scene, 'host_focus'),
      'programVersion', coalesce(v_program.program_version, 1),
      'showStateVersion', coalesce(v_program.version, 1),
      'controller', jsonb_build_object(
        'source', coalesce(v_program.control_source, 'system'),
        'userId', v_program.control_user_id,
        'instanceId', v_program.controller_instance_id,
        'generation', coalesce(v_program.controller_generation, 1),
        'leaseExpiresAt', v_program.control_lease_expires_at
      ),
      'updatedAt', coalesce(v_program.updated_at, v_session.updated_at)
    ),
    'sources', v_sources,
    'outputs', jsonb_build_object(
      'hls', v_runtime.hls_status <> 'disabled',
      'recording', v_runtime.recording_status <> 'disabled',
      'captions', v_runtime.captions_status <> 'disabled',
      'translationLanguages', case
        when coalesce(v_configuration.broadcast_translation_enabled, false)
          then to_jsonb(v_session.caption_translation_languages)
        else '[]'::jsonb
      end
    )
  );
end;
$$;

revoke all on function public.rpc_service_get_live_broadcast_snapshot_v1(uuid, uuid, bigint)
from public, anon, authenticated;
grant execute on function public.rpc_service_get_live_broadcast_snapshot_v1(uuid, uuid, bigint)
to service_role;

comment on function public.rpc_service_get_live_broadcast_snapshot_v1(uuid, uuid, bigint) is
  'Returns the current public Program and source graph only to the fenced compositor lease owner.';

commit;
