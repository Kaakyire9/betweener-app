begin;

do $$
declare
  v_clone regprocedure := to_regprocedure(
    'public.relationship_gist_ai_clone_provenance()'
  );
  v_review_gate regprocedure := to_regprocedure(
    'public.relationship_gist_ai_enforce_review_gate()'
  );
begin
  if v_clone is null then
    raise exception 'missing exact function public.relationship_gist_ai_clone_provenance()';
  end if;

  if v_review_gate is null then
    raise exception 'missing exact function public.relationship_gist_ai_enforce_review_gate()';
  end if;
end;
$$;

revoke all privileges
  on function public.relationship_gist_ai_clone_provenance()
  from public, anon, authenticated, service_role;

revoke all privileges
  on function public.relationship_gist_ai_enforce_review_gate()
  from public, anon, authenticated, service_role;

do $$
declare
  v_clone regprocedure :=
    'public.relationship_gist_ai_clone_provenance()'::regprocedure;
  v_review_gate regprocedure :=
    'public.relationship_gist_ai_enforce_review_gate()'::regprocedure;
  v_role name;
begin
  if exists (
    select 1
    from pg_catalog.pg_proc function_definition
    cross join lateral pg_catalog.aclexplode(
      coalesce(
        function_definition.proacl,
        pg_catalog.acldefault('f', function_definition.proowner)
      )
    ) function_acl
    where function_definition.oid in (v_clone::oid, v_review_gate::oid)
      and function_acl.grantee = 0
      and function_acl.privilege_type = 'EXECUTE'
  ) then
    raise exception 'PUBLIC retains EXECUTE on a hardened Gist trigger function';
  end if;

  foreach v_role in array array['anon'::name, 'authenticated'::name, 'service_role'::name]
  loop
    if pg_catalog.has_function_privilege(v_role, v_clone::oid, 'EXECUTE') then
      raise exception '% retains EXECUTE on %', v_role, v_clone::text;
    end if;

    if pg_catalog.has_function_privilege(v_role, v_review_gate::oid, 'EXECUTE') then
      raise exception '% retains EXECUTE on %', v_role, v_review_gate::text;
    end if;
  end loop;

  if not exists (
    select 1
    from pg_catalog.pg_trigger trigger_definition
    where trigger_definition.tgname = 'relationship_gist_ai_clone_provenance_trigger'
      and trigger_definition.tgrelid = 'public.relationship_gist_revisions'::regclass
      and trigger_definition.tgfoid = v_clone::oid
      and not trigger_definition.tgisinternal
      and trigger_definition.tgenabled <> 'D'
  ) then
    raise exception 'Gist provenance trigger is missing, disabled, or rebound';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_trigger trigger_definition
    where trigger_definition.tgname = 'relationship_gist_ai_review_gate_trigger'
      and trigger_definition.tgrelid = 'public.relationship_gist_revisions'::regclass
      and trigger_definition.tgfoid = v_review_gate::oid
      and not trigger_definition.tgisinternal
      and trigger_definition.tgenabled <> 'D'
  ) then
    raise exception 'Gist review-gate trigger is missing, disabled, or rebound';
  end if;
end;
$$;

commit;
