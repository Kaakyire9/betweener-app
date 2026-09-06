-- Apply the verified service-JWT trust boundary to final onboarding system
-- fields as well. Function ownership is platform-dependent in production.

create or replace function public.profile_guard_protect_system_fields()
returns trigger
language plpgsql
set search_path = public, pg_catalog, auth
as $$
declare
  v_trusted_write boolean := (
    auth.role() = 'service_role'
    or (session_user = 'postgres' and current_user = 'postgres')
  ) and (
    current_setting('app.profile_guard_write', true) = 'on'
    or current_setting('app.server_managed_update', true) = 'on'
  );
begin
  if not v_trusted_write and (
    new.profile_completed is distinct from old.profile_completed
    or new.identity_status is distinct from old.identity_status
    or new.onboarding_completed_at is distinct from old.onboarding_completed_at
    or new.identity_finalized_at is distinct from old.identity_finalized_at
    or new.profile_moderation_state is distinct from old.profile_moderation_state
  ) then
    raise exception using errcode = '42501', message = 'PROFILE_SYSTEM_FIELD_SERVER_MANAGED';
  end if;
  return new;
end;
$$;
