-- Betweener Live Phase 10G.1/10G.8: closed-beta Studio authorization,
-- session discovery and one safe operational snapshot.

begin;

create or replace function public.live_studio_is_authorized_v1(
  p_session_id uuid,
  p_user_id uuid,
  p_capability text default 'view'
)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  v_config public.live_odo_configuration;
  v_access public.live_studio_access;
  v_role_allowed boolean := false;
  v_rollout_allowed boolean := false;
begin
  if p_session_id is null or p_user_id is null
    or p_capability not in ('view','control','publish','screen_share','external_audio','moderate') then
    return false;
  end if;
  select * into v_config from public.live_odo_configuration where id = true;
  if not coalesce(v_config.betweener_studio_enabled, false)
    or not coalesce(v_config.studio_session_discovery_enabled, false) then
    return false;
  end if;
  v_role_allowed := public.is_admin_user(p_user_id)
    or public.has_live_capability(p_session_id, 'live.view_host_console', p_user_id)
    or exists (
      select 1 from public.live_sessions session
      where session.id = p_session_id and session.created_by_user_id = p_user_id
    );
  if not v_role_allowed then return false; end if;

  select * into v_access from public.live_studio_access access
  where access.user_id = p_user_id
    and access.allowed
    and (access.expires_at is null or access.expires_at > timezone('utc', now()));
  v_rollout_allowed := not coalesce(v_config.studio_closed_beta, true)
    or v_access.user_id is not null;
  if not v_rollout_allowed then return false; end if;

  return case p_capability
    when 'view' then coalesce(v_access.can_view, not v_config.studio_closed_beta)
    when 'control' then v_config.betweener_studio_control_enabled
      and coalesce(v_access.can_control, not v_config.studio_closed_beta)
    when 'publish' then v_config.studio_media_publishing_enabled
      and coalesce(v_access.can_publish, not v_config.studio_closed_beta)
      and (public.has_live_capability(p_session_id, 'live.publish', p_user_id)
        or public.is_admin_user(p_user_id))
    when 'screen_share' then v_config.screen_share_enabled
      and coalesce(v_access.can_screen_share, not v_config.studio_closed_beta)
    when 'external_audio' then v_config.studio_external_audio_enabled
      and coalesce(v_access.can_use_external_audio, not v_config.studio_closed_beta)
    when 'moderate' then coalesce(v_access.can_moderate, not v_config.studio_closed_beta)
      and (public.has_live_capability(p_session_id, 'live.view_safety_console', p_user_id)
        or public.is_admin_user(p_user_id))
    else false
  end;
end;
$$;

revoke all on function public.live_studio_is_authorized_v1(uuid, uuid, text)
from public, anon, authenticated, service_role;

create or replace function public.rpc_admin_set_live_studio_access_v1(
  p_user_id uuid,
  p_allowed boolean,
  p_capabilities jsonb default '{}'::jsonb,
  p_note text default null,
  p_expires_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare v_access public.live_studio_access;
begin
  if auth.uid() is null or not public.is_admin_user(auth.uid()) then
    raise exception 'live_studio_admin_required' using errcode = '42501';
  end if;
  if p_user_id is null or p_allowed is null
    or jsonb_typeof(coalesce(p_capabilities, '{}'::jsonb)) <> 'object'
    or octet_length(coalesce(p_capabilities, '{}'::jsonb)::text) > 512
    or (p_note is not null and char_length(p_note) > 240)
    or (p_expires_at is not null and p_expires_at <= timezone('utc', now())) then
    raise exception 'live_studio_access_invalid' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_object_keys(coalesce(p_capabilities, '{}'::jsonb)) key
    where key not in ('view','control','publish','screenShare','externalAudio','moderate')
  ) then
    raise exception 'live_studio_capability_invalid' using errcode = '22023';
  end if;
  insert into public.live_studio_access(
    user_id, allowed, can_view, can_control, can_publish, can_screen_share,
    can_use_external_audio, can_moderate, note, expires_at, created_by_user_id
  ) values (
    p_user_id, p_allowed,
    case when p_allowed then coalesce((p_capabilities ->> 'view')::boolean, true) else false end,
    case when p_allowed then coalesce((p_capabilities ->> 'control')::boolean, false) else false end,
    case when p_allowed then coalesce((p_capabilities ->> 'publish')::boolean, false) else false end,
    case when p_allowed then coalesce((p_capabilities ->> 'screenShare')::boolean, false) else false end,
    case when p_allowed then coalesce((p_capabilities ->> 'externalAudio')::boolean, false) else false end,
    case when p_allowed then coalesce((p_capabilities ->> 'moderate')::boolean, false) else false end,
    nullif(btrim(p_note), ''), p_expires_at, auth.uid()
  ) on conflict (user_id) do update set
    allowed = excluded.allowed,
    can_view = excluded.can_view,
    can_control = excluded.can_control,
    can_publish = excluded.can_publish,
    can_screen_share = excluded.can_screen_share,
    can_use_external_audio = excluded.can_use_external_audio,
    can_moderate = excluded.can_moderate,
    note = excluded.note,
    expires_at = excluded.expires_at,
    created_by_user_id = auth.uid()
  returning * into v_access;
  return jsonb_build_object(
    'userId', v_access.user_id,
    'allowed', v_access.allowed,
    'canView', v_access.can_view,
    'canControl', v_access.can_control,
    'canPublish', v_access.can_publish,
    'canScreenShare', v_access.can_screen_share,
    'canUseExternalAudio', v_access.can_use_external_audio,
    'canModerate', v_access.can_moderate,
    'expiresAt', v_access.expires_at
  );
end;
$$;

revoke all on function public.rpc_admin_set_live_studio_access_v1(
  uuid, boolean, jsonb, text, timestamptz
) from public, anon;
grant execute on function public.rpc_admin_set_live_studio_access_v1(
  uuid, boolean, jsonb, text, timestamptz
) to authenticated, service_role;

create or replace function public.rpc_admin_update_live_studio_configuration_v1(
  p_patch jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare v_config public.live_odo_configuration;
begin
  if auth.uid() is null or not public.is_admin_user(auth.uid()) then
    raise exception 'live_studio_admin_required' using errcode = '42501';
  end if;
  if jsonb_typeof(p_patch) <> 'object' or octet_length(p_patch::text) > 2048
    or exists (
      select 1 from jsonb_object_keys(p_patch) key where key not in (
        'studioEnabled','studioControlEnabled','sessionDiscoveryEnabled',
        'mediaPublishingEnabled','screenShareEnabled','screenAudioEnabled',
        'externalAudioEnabled','closedBeta','controllerLeaseSeconds',
        'controllerGraceSeconds'
      )
    ) then
    raise exception 'live_studio_configuration_invalid' using errcode = '22023';
  end if;
  update public.live_odo_configuration set
    betweener_studio_enabled = case when p_patch ? 'studioEnabled'
      then (p_patch ->> 'studioEnabled')::boolean else betweener_studio_enabled end,
    betweener_studio_control_enabled = case when p_patch ? 'studioControlEnabled'
      then (p_patch ->> 'studioControlEnabled')::boolean else betweener_studio_control_enabled end,
    studio_session_discovery_enabled = case when p_patch ? 'sessionDiscoveryEnabled'
      then (p_patch ->> 'sessionDiscoveryEnabled')::boolean else studio_session_discovery_enabled end,
    studio_media_publishing_enabled = case when p_patch ? 'mediaPublishingEnabled'
      then (p_patch ->> 'mediaPublishingEnabled')::boolean else studio_media_publishing_enabled end,
    screen_share_enabled = case when p_patch ? 'screenShareEnabled'
      then (p_patch ->> 'screenShareEnabled')::boolean else screen_share_enabled end,
    studio_screen_audio_enabled = case when p_patch ? 'screenAudioEnabled'
      then (p_patch ->> 'screenAudioEnabled')::boolean else studio_screen_audio_enabled end,
    studio_external_audio_enabled = case when p_patch ? 'externalAudioEnabled'
      then (p_patch ->> 'externalAudioEnabled')::boolean else studio_external_audio_enabled end,
    studio_closed_beta = case when p_patch ? 'closedBeta'
      then (p_patch ->> 'closedBeta')::boolean else studio_closed_beta end,
    studio_controller_lease_seconds = case when p_patch ? 'controllerLeaseSeconds'
      then (p_patch ->> 'controllerLeaseSeconds')::integer else studio_controller_lease_seconds end,
    studio_controller_grace_seconds = case when p_patch ? 'controllerGraceSeconds'
      then (p_patch ->> 'controllerGraceSeconds')::integer else studio_controller_grace_seconds end
  where id = true returning * into v_config;
  return jsonb_build_object(
    'studioEnabled', v_config.betweener_studio_enabled,
    'studioControlEnabled', v_config.betweener_studio_control_enabled,
    'sessionDiscoveryEnabled', v_config.studio_session_discovery_enabled,
    'mediaPublishingEnabled', v_config.studio_media_publishing_enabled,
    'screenShareEnabled', v_config.screen_share_enabled,
    'screenAudioEnabled', v_config.studio_screen_audio_enabled,
    'externalAudioEnabled', v_config.studio_external_audio_enabled,
    'closedBeta', v_config.studio_closed_beta,
    'controllerLeaseSeconds', v_config.studio_controller_lease_seconds,
    'controllerGraceSeconds', v_config.studio_controller_grace_seconds
  );
end;
$$;

revoke all on function public.rpc_admin_update_live_studio_configuration_v1(jsonb)
from public, anon;
grant execute on function public.rpc_admin_update_live_studio_configuration_v1(jsonb)
to authenticated, service_role;

create or replace function public.rpc_list_live_studio_control_sessions_v1(
  p_limit integer default 30
)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
  select coalesce(jsonb_agg(entry order by sort_order, sort_time), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'id', session.id,
      'title', session.title,
      'status', session.status,
      'ownershipType', session.ownership_type,
      'systemSessionKind', session.system_session_kind,
      'scheduledStart', session.scheduled_start,
      'startedAt', session.started_at,
      'participantCount', (
        select count(*)::integer from public.live_participants participant
        where participant.session_id = session.id
          and participant.state not in ('left','removed','banned')
      ),
      'controllerSource', coalesce(show_session.control_source,
        case when session.ownership_type = 'system' then 'system' else 'mobile_host' end),
      'controllerLeaseExpiresAt', show_session.control_lease_expires_at,
      'programScene', coalesce(show_session.current_scene, 'host_focus'),
      'programVersion', coalesce(show_session.program_version, 1),
      'health', case
        when session.status in ('ended','cancelled') then 'unavailable'
        when show_session.control_source = 'studio_host'
          and show_session.control_lease_expires_at <= timezone('utc', now()) then 'degraded'
        else 'healthy' end
    ) entry,
    case when session.status in ('live','ending') then 0
      when session.status = 'backstage' then 1 else 2 end sort_order,
    coalesce(session.started_at, session.scheduled_start, session.created_at) sort_time
    from public.live_sessions session
    left join public.live_odo_show_sessions show_session on show_session.session_id = session.id
    where auth.uid() is not null
      and session.status in ('scheduled','waiting_for_quorum','confirmed','backstage','live','ending')
      and public.live_studio_is_authorized_v1(session.id, auth.uid(), 'view')
    order by sort_order, sort_time
    limit greatest(1, least(coalesce(p_limit, 30), 60))
  ) visible;
$$;

revoke all on function public.rpc_list_live_studio_control_sessions_v1(integer)
from public, anon;
grant execute on function public.rpc_list_live_studio_control_sessions_v1(integer)
to authenticated, service_role;

create or replace function public.rpc_get_live_studio_snapshot_v1(p_session_id uuid)
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
  v_show public.live_odo_show_sessions;
  v_odo public.live_odo_session_state;
  v_quick public.live_quick_connect_controls;
  v_music public.live_music_session_state;
  v_config public.live_odo_configuration;
  v_pool integer := 0;
  v_eligible integer := 0;
  v_active integer := 0;
  v_completed integer := 0;
  v_reconnecting integer := 0;
  v_holds integer := 0;
  v_sources jsonb := '[]'::jsonb;
begin
  if auth.uid() is null
    or not public.live_studio_is_authorized_v1(p_session_id, auth.uid(), 'view') then
    raise exception 'live_studio_snapshot_forbidden' using errcode = '42501';
  end if;
  select * into v_session from public.live_sessions where id = p_session_id;
  if v_session.id is null then
    raise exception 'live_session_not_found' using errcode = 'P0002';
  end if;
  select * into v_show from public.live_odo_show_sessions where session_id = p_session_id;
  select * into v_odo from public.live_odo_session_state where session_id = p_session_id;
  select * into v_quick from public.live_quick_connect_controls where session_id = p_session_id;
  select * into v_music from public.live_music_session_state where session_id = p_session_id;
  select * into v_config from public.live_odo_configuration where id = true;

  select count(*)::integer into v_pool from public.live_quick_connect_participants participant
  where participant.session_id = p_session_id and participant.state = 'waiting'
    and participant.connection_state = 'connected'
    and participant.last_seen_at >= v_now - interval '45 seconds';
  v_eligible := public.live_odo_full_quick_eligible_pairs_v1(p_session_id);
  select count(*)::integer into v_active from public.live_quick_connect_pairings pairing
  where pairing.session_id = p_session_id and pairing.state in ('active','reconnect_grace');
  select count(*)::integer into v_completed from public.live_quick_connect_rounds round_row
  where round_row.session_id = p_session_id and round_row.state = 'completed';
  select count(*)::integer into v_reconnecting from public.live_quick_connect_pairings pairing
  where pairing.session_id = p_session_id and pairing.state = 'reconnect_grace';
  select count(*)::integer into v_holds from public.live_participants participant
  where participant.session_id = p_session_id
    and participant.state not in ('left','removed','banned')
    and public.live_quick_connect_has_active_safety_hold(participant.user_id);
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
  ) order by source.source_key), '[]'::jsonb) into v_sources
  from public.live_program_sources source where source.session_id = p_session_id;

  return jsonb_build_object(
    'schemaVersion', 1,
    'serverNow', v_now,
    'access', jsonb_build_object(
      'canView', true,
      'canControl', public.live_studio_is_authorized_v1(p_session_id, auth.uid(), 'control'),
      'canPublish', public.live_studio_is_authorized_v1(p_session_id, auth.uid(), 'publish'),
      'canScreenShare', public.live_studio_is_authorized_v1(p_session_id, auth.uid(), 'screen_share'),
      'canUseExternalAudio', public.live_studio_is_authorized_v1(p_session_id, auth.uid(), 'external_audio'),
      'canModerate', public.live_studio_is_authorized_v1(p_session_id, auth.uid(), 'moderate')
    ),
    'session', jsonb_build_object(
      'id', v_session.id, 'title', v_session.title, 'status', v_session.status,
      'version', v_session.version,
      'ownershipType', v_session.ownership_type,
      'systemSessionKind', v_session.system_session_kind
    ),
    'program', jsonb_build_object(
      'schemaVersion', 1,
      'sessionId', v_session.id,
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
        'userId', v_show.control_user_id,
        'instanceId', v_show.controller_instance_id,
        'generation', coalesce(v_show.controller_generation, 1),
        'leaseExpiresAt', v_show.control_lease_expires_at
      ),
      'updatedAt', coalesce(v_show.updated_at, v_session.updated_at)
    ),
    'sources', v_sources,
    'show', jsonb_build_object(
      'enabled', coalesce(v_show.enabled, false),
      'state', coalesce(v_show.show_state, 'opening'),
      'energyMode', coalesce(v_show.energy_mode, 'calm'),
      'nextWakeAt', v_show.next_wake_at,
      'reasonCode', v_show.last_reason_code
    ),
    'quickConnect', jsonb_build_object(
      'state', coalesce(v_quick.state, 'closed'),
      'poolCount', v_pool, 'eligiblePairCount', v_eligible,
      'activePairCount', v_active, 'completedRoundCount', v_completed,
      'reconnectingCount', v_reconnecting
    ),
    'odo', jsonb_build_object(
      'state', coalesce(v_odo.autopilot_state, 'off'),
      'nextWakeAt', v_show.next_wake_at,
      'healthy', coalesce(v_odo.autopilot_state, 'off') <> 'paused_by_policy'
        and not coalesce(v_config.circuit_breaker_open, false)
    ),
    'music', jsonb_build_object(
      'enabled', coalesce(v_config.music_enabled, false),
      'status', coalesce(v_music.status, 'stopped'),
      'trackId', v_music.track_id, 'playlistId', v_music.playlist_id,
      'mood', v_music.mood, 'volume', coalesce(v_music.effective_volume, 0),
      'stateVersion', coalesce(v_music.version, 0)
    ),
    'audiencePulse', jsonb_build_object(
      'open', exists (select 1 from public.live_audience_polls poll
        where poll.session_id = p_session_id and poll.state = 'open')
    ),
    'safety', jsonb_build_object(
      'status', case when v_holds = 0 then 'healthy' else 'degraded' end,
      'activeHoldCount', v_holds
    )
  );
end;
$$;

revoke all on function public.rpc_get_live_studio_snapshot_v1(uuid) from public, anon;
grant execute on function public.rpc_get_live_studio_snapshot_v1(uuid)
to authenticated, service_role;

drop policy if exists live_program_source_updates_participant_select
on public.live_program_source_updates;
create policy live_program_source_updates_studio_or_participant_select
on public.live_program_source_updates for select to authenticated
using (
  public.live_studio_is_authorized_v1(session_id, auth.uid(), 'view')
  or exists (
    select 1 from public.live_participants participant
    where participant.session_id = live_program_source_updates.session_id
      and participant.user_id = auth.uid()
      and participant.state not in ('left','removed','banned')
  )
);

commit;
