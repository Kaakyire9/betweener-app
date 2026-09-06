-- Released clients update profiles with INSERT ... ON CONFLICT DO UPDATE.
-- PostgreSQL runs BEFORE INSERT triggers before conflict resolution, so an
-- existing completed profile must be recognized without weakening the UPDATE
-- trigger that evaluates the final merged row.

begin;

do $migration$
declare
  v_definition text;
  v_patched text;
begin
  select pg_get_functiondef(
    'public.profile_guard_prevent_direct_public_text_write()'::regprocedure
  ) into v_definition;

  v_patched := replace(
    v_definition,
    'if v_public_content_changed and (v_legacy_onboarding or v_legacy_profile_edit) then',
    $patch$if v_public_content_changed and (
    v_legacy_onboarding
    or v_legacy_profile_edit
    or (
      tg_op = 'INSERT'
      and auth.role() = 'authenticated'
      and auth.uid() is not null
      and new.user_id = auth.uid()
      and exists (
        select 1
        from public.profiles existing_profile
        where existing_profile.user_id = auth.uid()
          and coalesce(existing_profile.profile_completed, false)
          and existing_profile.identity_status = 'active'
      )
    )
  ) then$patch$
  );

  if v_patched = v_definition then
    raise exception 'PROFILE_GUARD_LEGACY_UPSERT_PATCH_TARGET_NOT_FOUND';
  end if;
  execute v_patched;
end;
$migration$;

revoke all on function public.profile_guard_prevent_direct_public_text_write()
from public, anon, authenticated;

commit;
