-- Forward-only correction for the already deployed selfie-liveness RPC.
-- The RETURNS TABLE output column `request_id` is also a PL/pgSQL variable, so
-- `on conflict (request_id)` is ambiguous. Targeting the primary-key constraint
-- explicitly preserves the function contract and all validation logic.

do $migration$
declare
  v_signature regprocedure :=
    'public.rpc_submit_selfie_liveness_verification_v2(uuid,uuid,text,jsonb)'::regprocedure;
  v_definition text;
  v_ambiguous_clause constant text := 'on conflict (request_id) do update';
  v_resolved_clause constant text :=
    'on conflict on constraint verification_evidence_retention_pkey do update';
begin
  select pg_get_functiondef(v_signature)
  into v_definition;

  if position(v_resolved_clause in lower(v_definition)) > 0 then
    return;
  end if;

  if position(v_ambiguous_clause in lower(v_definition)) = 0 then
    raise exception
      'Expected request_id conflict clause was not found in %',
      v_signature::text;
  end if;

  v_definition := regexp_replace(
    v_definition,
    'on conflict\s+\(request_id\)\s+do update',
    v_resolved_clause,
    'i'
  );
  execute v_definition;
end;
$migration$;

comment on function public.rpc_submit_selfie_liveness_verification_v2(uuid, uuid, text, jsonb) is
  'Submits challenge-bound on-device liveness evidence and schedules private evidence retention without ambiguous conflict handling.';
