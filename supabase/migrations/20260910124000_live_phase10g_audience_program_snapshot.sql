-- Betweener Live Phase 10G.8: audience-safe authoritative Program snapshot.
-- Private matching inputs, Private Spark data and producer access are omitted.

begin;

create or replace function public.rpc_get_live_program_snapshot_v2(p_session_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  v_legacy jsonb;
  v_session public.live_sessions;
  v_show public.live_odo_show_sessions;
  v_sources jsonb := '[]'::jsonb;
begin
  if auth.uid() is null or not exists (
    select 1 from public.live_participants participant
    where participant.session_id = p_session_id
      and participant.user_id = auth.uid()
      and participant.state not in ('left','removed','banned')
  ) then
    raise exception 'live_participant_required' using errcode = '42501';
  end if;

  select * into v_session from public.live_sessions where id = p_session_id;
  if v_session.id is null then
    raise exception 'live_session_not_found' using errcode = 'P0002';
  end if;
  select * into v_show from public.live_odo_show_sessions where session_id = p_session_id;
  v_legacy := public.live_odo_show_snapshot_v1(p_session_id, auth.uid());

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', source.id,
    'key', source.source_key,
    'type', source.source_type,
    'role', source.source_role,
    'ownerUserId', null,
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
  ) order by source.source_key), '[]'::jsonb) into v_sources
  from public.live_program_sources source
  where source.session_id = p_session_id;

  return jsonb_build_object(
    'schemaVersion', 2,
    'sessionId', p_session_id,
    'enabled', coalesce((v_legacy ->> 'enabled')::boolean, false),
    'showState', coalesce(v_legacy ->> 'showState', 'opening'),
    'currentScene', coalesce(v_show.current_scene, v_legacy ->> 'currentScene', 'host_focus'),
    'energyMode', coalesce(v_legacy ->> 'energyMode', 'calm'),
    'programSource', coalesce(v_show.program_source, v_legacy ->> 'programSource', 'mobile'),
    'stateVersion', coalesce(v_show.version, 0),
    'nextWakeAt', v_show.next_wake_at,
    'music', v_legacy -> 'music',
    'program', jsonb_build_object(
      'schemaVersion', 1,
      'sessionId', p_session_id,
      'scene', coalesce(v_show.current_scene, 'host_focus'),
      'targetCanvas', coalesce(v_show.target_canvas, 'portrait_9_16'),
      'sourceAssignments', coalesce(v_show.source_assignments, '{}'::jsonb),
      'transition', coalesce(v_show.program_transition, 'auto'),
      'fallbackScene', coalesce(v_show.fallback_scene, 'host_focus'),
      'programVersion', coalesce(v_show.program_version, 1),
      'showStateVersion', coalesce(v_show.version, 1),
      'controller', jsonb_build_object(
        'source', coalesce(v_show.control_source,
          case when v_session.ownership_type = 'system' then 'system' else 'mobile_host' end),
        'userId', null,
        'instanceId', null,
        'generation', coalesce(v_show.controller_generation, 1),
        'leaseExpiresAt', case when v_show.control_source = 'studio_host'
          then v_show.control_lease_expires_at else null end
      ),
      'updatedAt', coalesce(v_show.updated_at, v_session.updated_at)
    ),
    'sources', v_sources
  );
end;
$$;

revoke all on function public.rpc_get_live_program_snapshot_v2(uuid) from public, anon;
grant execute on function public.rpc_get_live_program_snapshot_v2(uuid) to authenticated;

comment on function public.rpc_get_live_program_snapshot_v2(uuid) is
  'Audience-safe Phase 10G Program output; excludes Studio access and private matching state.';

commit;
