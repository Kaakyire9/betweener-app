-- Close the client-facing backfill grant left by the platform's default
-- function privileges, and restore the helper privilege required by the
-- authenticated profiles SELECT policy.

begin;

revoke all on function public.rpc_backfill_profile_contact_guard(
  integer, uuid, boolean
) from public, anon, authenticated;
grant execute on function public.rpc_backfill_profile_contact_guard(
  integer, uuid, boolean
) to service_role;

revoke all on function public.can_authenticated_user_view_profile(uuid)
from public, anon, authenticated;
grant execute on function public.can_authenticated_user_view_profile(uuid)
to authenticated, service_role;

commit;
