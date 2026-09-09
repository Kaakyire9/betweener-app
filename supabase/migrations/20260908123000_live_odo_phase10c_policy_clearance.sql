-- A Host must not be able to route around a Safety pause by calling enable or
-- takeover directly. Safety clears the fence first; the Host then explicitly
-- chooses whether to resume Guarded Autopilot.

create or replace function public.live_odo_guarded_policy_pause_fence_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
begin
  if old.autopilot_state = 'paused_by_policy'
    and new.autopilot_state in ('starting','active','recovering','paused_by_host')
    and coalesce(current_setting('app.live_odo_policy_clearance', true), '') <> 'granted'
  then
    raise exception 'live_odo_policy_clearance_required' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists live_odo_guarded_policy_pause_fence
  on public.live_odo_session_state;
create trigger live_odo_guarded_policy_pause_fence
before update of autopilot_state on public.live_odo_session_state
for each row execute function public.live_odo_guarded_policy_pause_fence_v1();

create or replace function public.rpc_service_clear_live_odo_policy_pause_v1(
  p_session_id uuid,
  p_reason_code text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  v_state public.live_odo_session_state;
  v_now timestamptz := timezone('utc', now());
begin
  if not public.live_odo_is_service_role() then
    raise exception 'live_odo_service_role_required' using errcode = '42501';
  end if;
  if p_reason_code !~ '^[a-z][a-z0-9_]{0,79}$' then
    raise exception 'live_odo_invalid_clearance_reason' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(
    'live_odo:' || p_session_id::text, 0
  ));
  select * into v_state from public.live_odo_session_state
  where session_id = p_session_id for update;
  if v_state.session_id is null then
    raise exception 'live_odo_state_missing' using errcode = 'P0002';
  end if;
  if v_state.autopilot_state <> 'paused_by_policy' then
    return jsonb_build_object(
      'cleared', true,
      'changed', false,
      'autopilotState', v_state.autopilot_state,
      'stateVersion', v_state.state_version,
      'leaseGeneration', v_state.lease_generation
    );
  end if;

  perform set_config('app.live_odo_policy_clearance', 'granted', true);
  update public.live_odo_session_state set
    direction_mode = 'manual',
    autopilot_state = 'paused_by_host',
    pause_reason_code = 'host_resume_required',
    lease_owner = null,
    lease_expires_at = null,
    lease_heartbeat_at = null,
    lease_generation = lease_generation + 1,
    state_version = state_version + 1
  where session_id = p_session_id returning * into v_state;
  update public.live_odo_guarded_autopilot_settings set
    taken_over_at = v_now,
    version = version + 1
  where session_id = p_session_id;
  insert into public.live_odo_trace_events(
    session_id, trace_type, reason_code, metadata
  ) values (
    p_session_id,
    'odo_policy_pause_cleared',
    p_reason_code,
    jsonb_build_object(
      'state', 'paused_by_host',
      'stateVersion', v_state.state_version,
      'leaseGeneration', v_state.lease_generation
    )
  );
  return jsonb_build_object(
    'cleared', true,
    'changed', true,
    'autopilotState', 'paused_by_host',
    'stateVersion', v_state.state_version,
    'leaseGeneration', v_state.lease_generation
  );
end;
$$;

revoke all on function public.live_odo_guarded_policy_pause_fence_v1()
  from public, anon, authenticated, service_role;
revoke all on function public.rpc_service_clear_live_odo_policy_pause_v1(uuid,text)
  from public, anon, authenticated;
grant execute on function public.rpc_service_clear_live_odo_policy_pause_v1(uuid,text)
  to service_role;

comment on function public.rpc_service_clear_live_odo_policy_pause_v1(uuid,text) is
  'Clears the Safety fence into manual Host control. It never resumes Odo automatically.';
