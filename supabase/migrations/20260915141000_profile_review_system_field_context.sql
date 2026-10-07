-- Extend the event-scoped admin review context to the independent trigger that
-- protects server-managed profile lifecycle fields.

begin;

do $migration$
declare
  v_definition text;
  v_patched text;
  v_marker text := $marker$or (session_user = 'postgres' and current_user = 'postgres')
  ) and (
    current_setting('app.profile_guard_write', true) = 'on'$marker$;
  v_replacement text := $replacement$or (session_user = 'postgres' and current_user = 'postgres')
    or (
      current_user = 'postgres'
      and current_setting('app.profile_guard_admin_review_profile_id', true) = new.id::text
    )
  ) and (
    current_setting('app.profile_guard_write', true) = 'on'$replacement$;
begin
  v_definition := pg_get_functiondef(
    'public.profile_guard_protect_system_fields()'::regprocedure
  );
  v_patched := replace(v_definition, v_marker, v_replacement);

  if v_patched = v_definition then
    raise exception 'PROFILE_REVIEW_SYSTEM_CONTEXT_PATCH_TARGET_NOT_FOUND';
  end if;

  execute v_patched;
end;
$migration$;

revoke all on function public.profile_guard_protect_system_fields()
  from public, anon, authenticated;

commit;

notify pgrst, 'reload schema';
