-- Keep publication-control timestamps timezone-aware. `timezone('utc', now())`
-- returns timestamp without time zone; JavaScript engines parse that as local
-- time, which shifts the backstage countdown during daylight-saving time.
create or replace function public.live_publication_control_snapshot_v1(
  p_session_id uuid,
  p_user_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  v_session public.live_sessions;
  v_is_studio_publisher boolean := false;
  v_has_start_capability boolean := false;
  v_aal text := coalesce(auth.jwt() ->> 'aal', 'aal1');
begin
  select * into v_session
  from public.live_sessions session
  where session.id = p_session_id;

  if v_session.id is null then
    raise exception 'live_session_not_found' using errcode = 'P0002';
  end if;
  if p_user_id is null or (
    not public.can_view_live_session(p_session_id, p_user_id)
    and not public.live_studio_is_authorized_v1(p_session_id, p_user_id, 'view')
  ) then
    raise exception 'live_session_forbidden' using errcode = '42501';
  end if;

  v_has_start_capability := public.has_live_capability(
    p_session_id,
    'live.start_session',
    p_user_id
  );
  v_is_studio_publisher := public.live_studio_is_authorized_v1(
    p_session_id,
    p_user_id,
    'publish'
  );

  return jsonb_build_object(
    'schemaVersion', 1,
    'serverNow', now(),
    'sessionId', v_session.id,
    'status', v_session.status,
    'version', v_session.version,
    'scheduledStart', v_session.scheduled_start,
    'startWindowClosesAt', case
      when v_session.scheduled_start is null then null
      else v_session.scheduled_start + interval '30 minutes'
    end,
    'broadcastAuthority', v_session.broadcast_authority,
    'currentAal', v_aal,
    'canOpenBackstage', (
      v_has_start_capability
      or (v_session.broadcast_authority = 'studio_producer' and v_is_studio_publisher)
    ),
    'canStart', case
      when v_session.broadcast_authority = 'studio_producer' then v_is_studio_publisher
      else v_has_start_capability
    end,
    'canSetAuthority', (
      v_is_studio_publisher
      or v_session.created_by_user_id = p_user_id
      or public.is_admin_user(p_user_id)
    ),
    'requiresStepUp', v_aal <> 'aal2' and case
      when v_session.broadcast_authority = 'studio_producer' then v_is_studio_publisher
      else v_has_start_capability
    end,
    'controlSurface', case
      when v_session.broadcast_authority = 'studio_producer' then 'studio'
      else 'mobile'
    end
  );
end;
$$;

comment on function public.live_publication_control_snapshot_v1(uuid, uuid) is
  'Returns the server-authoritative Live publication state with timezone-aware timestamps.';
