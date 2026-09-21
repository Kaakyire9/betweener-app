-- Keep the V2 onboarding transaction compatible with the strict V3 guard
-- evidence contract. Completion metadata belongs in the V2 receipt, while the
-- guard receives only the immutable public-text snapshot it permits.

begin;

do $migration$
declare
  v_definition text;
  v_patched text;
  v_marker text := $marker$    p_updates,
    p_expected_updated_at,
    p_evidence_snapshot
  );$marker$;
  v_replacement text := $replacement$    p_updates,
    p_expected_updated_at,
    jsonb_build_object(
      'profile_updates',
      coalesce(p_evidence_snapshot->'profile_updates', '{}'::jsonb)
    )
  );$replacement$;
begin
  v_definition := pg_get_functiondef(
    'public.rpc_service_complete_profile_onboarding_v2(uuid,jsonb,text[],uuid,timestamptz,jsonb)'::regprocedure
  );
  v_patched := replace(v_definition, v_marker, v_replacement);

  if v_patched = v_definition then
    raise exception 'ONBOARDING_V2_EVIDENCE_PATCH_TARGET_NOT_FOUND';
  end if;

  execute v_patched;
end;
$migration$;

revoke all on function public.rpc_service_complete_profile_onboarding_v2(
  uuid, jsonb, text[], uuid, timestamptz, jsonb
) from public, anon, authenticated;
grant execute on function public.rpc_service_complete_profile_onboarding_v2(
  uuid, jsonb, text[], uuid, timestamptz, jsonb
) to service_role;

commit;

notify pgrst, 'reload schema';
