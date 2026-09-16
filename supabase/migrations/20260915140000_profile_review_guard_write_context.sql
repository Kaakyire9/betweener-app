-- Let the authenticated admin review RPC perform its narrowly scoped,
-- server-owned profile state transition without weakening direct profile writes.

begin;

do $migration$
declare
  v_definition text;
  v_patched text;
  v_marker text := $marker$or (session_user = 'postgres' and current_user = 'postgres')
  ) and current_setting('app.profile_guard_write', true) = 'on'$marker$;
  v_replacement text := $replacement$or (session_user = 'postgres' and current_user = 'postgres')
    or (
      current_user = 'postgres'
      and current_setting('app.profile_guard_admin_review_profile_id', true) = new.id::text
    )
  ) and current_setting('app.profile_guard_write', true) = 'on'$replacement$;
begin
  v_definition := pg_get_functiondef(
    'public.profile_guard_prevent_direct_public_text_write()'::regprocedure
  );
  v_patched := replace(v_definition, v_marker, v_replacement);

  if v_patched = v_definition then
    raise exception 'PROFILE_GUARD_ADMIN_CONTEXT_PATCH_TARGET_NOT_FOUND';
  end if;

  execute v_patched;
end;
$migration$;

do $migration$
declare
  v_definition text;
  v_patched text;
  v_marker text := $marker$perform set_config('app.profile_guard_write', 'on', true);
  update public.profiles$marker$;
  v_replacement text := $replacement$perform set_config(
    'app.profile_guard_admin_review_profile_id',
    v_event.profile_id::text,
    true
  );
  perform set_config('app.profile_guard_write', 'on', true);
  update public.profiles$replacement$;
begin
  v_definition := pg_get_functiondef(
    'public.rpc_admin_resolve_profile_guard_review(uuid,text,text,text)'::regprocedure
  );
  v_patched := replace(v_definition, v_marker, v_replacement);

  if v_patched = v_definition then
    raise exception 'PROFILE_REVIEW_ADMIN_CONTEXT_PATCH_TARGET_NOT_FOUND';
  end if;

  execute v_patched;
end;
$migration$;

revoke all on function public.profile_guard_prevent_direct_public_text_write()
  from public, anon, authenticated;
revoke all on function public.rpc_admin_resolve_profile_guard_review(uuid, text, text, text)
  from public, anon;
grant execute on function public.rpc_admin_resolve_profile_guard_review(uuid, text, text, text)
  to authenticated;

commit;

notify pgrst, 'reload schema';
