begin;

-- Phase 10F renamed the core host-control implementation while the later
-- Programme Audio wrapper retained the original internal symbol. Restore that
-- private compatibility boundary without duplicating the control logic.
create or replace function public.live_odo_host_music_control_base_10f_v1(
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
  return public.rpc_host_control_live_music_without_always_on_10f_v1(
    p_session_id,
    p_action,
    p_track_id,
    p_playlist_id,
    p_volume,
    p_mood,
    p_idempotency_key
  );
end;
$$;

revoke all on function public.live_odo_host_music_control_base_10f_v1(
  uuid, text, uuid, uuid, numeric, text, uuid
) from public, anon, authenticated, service_role;

comment on function public.live_odo_host_music_control_base_10f_v1(
  uuid, text, uuid, uuid, numeric, text, uuid
) is 'Private compatibility boundary for Programme Audio host controls.';

commit;
