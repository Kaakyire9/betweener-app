-- Give moderators a receive-only Stream participant for the authoritative
-- Program monitor. Existing producer admission remains delegated to v1.

begin;

create or replace function public.rpc_get_live_studio_media_admission_v2(
  p_session_id uuid,
  p_controller_instance_id uuid,
  p_source_kind text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  v_session public.live_sessions;
  v_provider_user_id text;
begin
  if not public.live_studio_has_aal2_v1() then
    raise exception 'live_studio_step_up_required' using errcode = '42501';
  end if;

  if p_source_kind <> 'program_monitor' then
    return public.rpc_get_live_studio_media_admission_v1(
      p_session_id, p_controller_instance_id, p_source_kind
    );
  end if;

  if auth.uid() is null
    or not public.live_studio_is_authorized_v1(
      p_session_id, auth.uid(), 'moderate'
    ) then
    raise exception 'live_studio_monitor_forbidden' using errcode = '42501';
  end if;
  if p_controller_instance_id is null then
    raise exception 'live_studio_media_invalid' using errcode = '22023';
  end if;

  select * into v_session
  from public.live_sessions
  where id = p_session_id;

  if v_session.id is null
    or v_session.status not in ('backstage', 'live', 'ending')
    or v_session.provider <> 'stream' then
    raise exception 'live_studio_media_session_unavailable' using errcode = '42501';
  end if;

  v_provider_user_id := 'studio-' || replace(auth.uid()::text, '-', '')
    || '-' || left(replace(p_controller_instance_id::text, '-', ''), 8)
    || '-program-monitor';

  return jsonb_build_object(
    'schemaVersion', 1,
    'sessionId', v_session.id,
    'userId', auth.uid(),
    'providerUserId', v_provider_user_id,
    'provider', v_session.provider,
    'providerCallType', v_session.provider_call_type,
    'providerCallId', v_session.provider_call_id,
    'maximumParticipants', v_session.maximum_participants,
    'sourceKind', 'program_monitor',
    'canSendAudio', false,
    'canSendVideo', false,
    'canScreenShare', false,
    'canScreenShareAudio', false
  );
end;
$$;

revoke all on function public.rpc_get_live_studio_media_admission_v2(uuid, uuid, text)
from public, anon;
grant execute on function public.rpc_get_live_studio_media_admission_v2(uuid, uuid, text)
to authenticated, service_role;

commit;
