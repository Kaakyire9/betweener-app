-- Keep the Guarded Autopilot worker on its narrow service RPC boundary. Edge
-- Functions must not acquire direct mutation privileges on policy state.

revoke all on table
  public.live_odo_guarded_autopilot_host_allowlist,
  public.live_odo_guarded_autopilot_settings,
  public.live_odo_guarded_autopilot_events,
  public.live_odo_guarded_autopilot_actions
from service_role;

revoke insert, update, delete on table
  public.live_odo_guarded_autopilot_updates
from service_role;
