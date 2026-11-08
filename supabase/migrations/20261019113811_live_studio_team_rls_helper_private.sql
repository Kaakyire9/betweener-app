begin;

-- Keep the Realtime RLS helper outside the exposed Data API schema. The
-- authenticated role needs EXECUTE for policy evaluation, but it must not be
-- independently addressable as a public RPC.
create or replace function private.live_studio_can_receive_team_updates_v1(
  p_session_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
  select auth.uid() is not null and (
    public.is_admin_user(auth.uid())
    or public.live_studio_is_authorized_v1(p_session_id, auth.uid(), 'view')
  );
$$;

revoke all on function private.live_studio_can_receive_team_updates_v1(uuid)
from public, anon, authenticated;
grant execute on function private.live_studio_can_receive_team_updates_v1(uuid)
to authenticated, service_role;

drop policy if exists live_studio_team_updates_select_authorized
on public.live_studio_team_updates;

create policy live_studio_team_updates_select_authorized
on public.live_studio_team_updates for select to authenticated
using (private.live_studio_can_receive_team_updates_v1(session_id));

drop function public.live_studio_can_receive_team_updates_v1(uuid, uuid);

commit;
