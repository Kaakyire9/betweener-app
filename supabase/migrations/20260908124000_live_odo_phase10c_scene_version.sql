-- Scene changes are authoritative Director state. Ensure every real scene
-- transition advances the state fence even when an older caller only updates
-- current_scene.

create or replace function public.live_odo_scene_version_fence_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
begin
  if new.current_scene is distinct from old.current_scene
    and new.state_version = old.state_version
  then
    new.state_version := old.state_version + 1;
  end if;
  return new;
end;
$$;

drop trigger if exists live_odo_scene_version_fence
  on public.live_odo_session_state;
create trigger live_odo_scene_version_fence
before update of current_scene on public.live_odo_session_state
for each row execute function public.live_odo_scene_version_fence_v1();

revoke all on function public.live_odo_scene_version_fence_v1()
  from public, anon, authenticated, service_role;
