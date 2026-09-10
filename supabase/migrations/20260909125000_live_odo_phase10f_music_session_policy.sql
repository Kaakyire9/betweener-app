-- Betweener Live Phase 10F: keep the Always-On music rollout switch effective
-- without changing music behavior in human-created Lives.

begin;

create or replace function public.live_odo_always_on_music_allowed_v1(p_session_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
  select not public.live_is_odo_always_on_session_v1(p_session_id)
    or coalesce((select configuration.music_enabled
      from public.live_odo_always_on_configuration configuration
      where configuration.id = true), false);
$$;

revoke all on function public.live_odo_always_on_music_allowed_v1(uuid)
from public, anon, authenticated, service_role;

alter function public.rpc_service_reconcile_live_odo_show_v1(uuid, uuid, uuid)
rename to live_odo_reconcile_show_base_10f_v1;

revoke all on function public.live_odo_reconcile_show_base_10f_v1(
  uuid, uuid, uuid
) from public, anon, authenticated, service_role;

create or replace function public.rpc_service_reconcile_live_odo_show_v1(
  p_session_id uuid,
  p_requested_by_user_id uuid,
  p_lease_owner uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare v_result jsonb;
begin
  if not public.live_odo_is_service_role() then
    raise exception 'live_odo_service_role_required' using errcode = '42501';
  end if;
  v_result := public.live_odo_reconcile_show_base_10f_v1(
    p_session_id, p_requested_by_user_id, p_lease_owner
  );
  if not public.live_odo_always_on_music_allowed_v1(p_session_id) then
    update public.live_music_session_state set
      status = 'stopped', track_id = null, playlist_id = null,
      effective_volume = 0, program_started_at = null,
      playback_offset_seconds = 0, control_source = 'system',
      last_action = 'stop', last_reason_code = 'always_on_music_disabled',
      version = version + 1
    where session_id = p_session_id
      and (status <> 'stopped' or track_id is not null or playlist_id is not null);
    v_result := v_result || jsonb_build_object(
      'alwaysOnMusicSuppressed', true,
      'musicReasonCode', 'always_on_music_disabled'
    );
  end if;
  return v_result;
end;
$$;

revoke all on function public.rpc_service_reconcile_live_odo_show_v1(uuid, uuid, uuid)
from public, anon, authenticated;
grant execute on function public.rpc_service_reconcile_live_odo_show_v1(uuid, uuid, uuid)
to service_role;

alter function public.rpc_service_get_live_music_playback_v1(uuid, uuid)
rename to live_odo_get_music_playback_base_10f_v1;

revoke all on function public.live_odo_get_music_playback_base_10f_v1(
  uuid, uuid
) from public, anon, authenticated, service_role;

create or replace function public.rpc_service_get_live_music_playback_v1(
  p_session_id uuid,
  p_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
begin
  if not public.live_odo_is_service_role() then
    raise exception 'live_odo_service_role_required' using errcode = '42501';
  end if;
  if not public.live_odo_always_on_music_allowed_v1(p_session_id) then
    return jsonb_build_object('allowed', false,
      'reasonCode', 'always_on_music_disabled');
  end if;
  return public.live_odo_get_music_playback_base_10f_v1(
    p_session_id, p_user_id
  );
end;
$$;

revoke all on function public.rpc_service_get_live_music_playback_v1(uuid, uuid)
from public, anon, authenticated;
grant execute on function public.rpc_service_get_live_music_playback_v1(uuid, uuid)
to service_role;

alter function public.rpc_host_control_live_music_v1(
  uuid, text, uuid, uuid, numeric, text, uuid
)
rename to live_odo_host_music_control_base_10f_v1;

revoke all on function public.live_odo_host_music_control_base_10f_v1(
  uuid, text, uuid, uuid, numeric, text, uuid
) from public, anon, authenticated, service_role;

create or replace function public.rpc_host_control_live_music_v1(
  p_session_id uuid,
  p_action text,
  p_track_id uuid default null,
  p_playlist_id uuid default null,
  p_volume numeric default null,
  p_mood text default null,
  p_idempotency_key uuid default gen_random_uuid()
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
begin
  if auth.uid() is null
    or not public.live_odo_show_host_allowed_v1(p_session_id, auth.uid()) then
    raise exception 'live_music_control_forbidden' using errcode = '42501';
  end if;
  if p_action <> 'stop'
    and not public.live_odo_always_on_music_allowed_v1(p_session_id) then
    return jsonb_build_object('applied', false,
      'reasonCode', 'always_on_music_disabled');
  end if;
  return public.live_odo_host_music_control_base_10f_v1(
    p_session_id, p_action, p_track_id, p_playlist_id, p_volume, p_mood,
    p_idempotency_key
  );
end;
$$;

revoke all on function public.rpc_host_control_live_music_v1(
  uuid, text, uuid, uuid, numeric, text, uuid
) from public, anon;
grant execute on function public.rpc_host_control_live_music_v1(
  uuid, text, uuid, uuid, numeric, text, uuid
) to authenticated, service_role;

commit;
