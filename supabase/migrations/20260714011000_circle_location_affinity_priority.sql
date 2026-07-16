-- Prefer genuinely local circles over broad country matches. Rebuild the two
-- established ranking functions from their deployed definitions so their
-- contracts and all non-location ranking signals remain unchanged.
do $$
declare
  v_signature regprocedure;
  v_definition text;
begin
  foreach v_signature in array array[
    'public.get_circle_location_affinities(uuid,uuid[],text)'::regprocedure,
    'public.get_ranked_circles_for_profile(uuid,text,integer)'::regprocedure
  ] loop
    select pg_get_functiondef(v_signature::oid) into v_definition;

    if position('when scoped.same_city then 30' in v_definition) = 0
       or position('when scoped.same_region then 16' in v_definition) = 0
       or position('when scoped.same_country then 35' in v_definition) = 0 then
      raise exception 'Unexpected location ranking definition for %', v_signature;
    end if;

    v_definition := replace(v_definition, 'when scoped.same_city then 30', 'when scoped.same_city then 40');
    v_definition := replace(v_definition, 'when scoped.same_region then 16', 'when scoped.same_region then 24');
    v_definition := replace(v_definition, 'when scoped.same_country then 35', 'when scoped.same_country then 14');
    execute v_definition;
  end loop;
end;
$$;
