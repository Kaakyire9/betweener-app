-- Current-location affinity remains a ranking signal, but its copy duplicates
-- the card's visible location row. Only roots and diaspora affinity should be
-- surfaced as editorial copy.
do $$
declare
  v_signature regprocedure := 'public.compute_location_affinities(uuid,uuid[])'::regprocedure;
  v_definition text;
begin
  select pg_get_functiondef(v_signature::oid) into v_definition;

  -- Support both the production baseline and the premium-copy revision.
  v_definition := replace(v_definition, '''Shared connection to '' || scored.city', 'null::text');
  v_definition := replace(v_definition, '''Both in '' || scored.city', 'null::text');
  v_definition := replace(v_definition, '''Same district: '' || scored.locality_district', 'null::text');
  v_definition := replace(v_definition, '''Shared ties to '' || scored.locality_district', 'null::text');
  v_definition := replace(v_definition, '''Shared connection to '' || scored.region', 'null::text');
  v_definition := replace(v_definition, '''Shared ties to '' || scored.region', 'null::text');
  v_definition := replace(v_definition, '''Both connected to '' || scored.current_country', 'null::text');
  v_definition := replace(v_definition, '''Shared ties to '' || scored.current_country', 'null::text');

  v_definition := replace(v_definition, '''You both have a connection to '' || scored.city || ''.''', 'null::text');
  v_definition := replace(v_definition, '''You both share ties to '' || scored.city || ''.''', 'null::text');
  v_definition := replace(v_definition, '''You both have ties to '' || scored.locality_district || ''.''', 'null::text');
  v_definition := replace(v_definition, '''You both share ties to '' || scored.locality_district || ''.''', 'null::text');
  v_definition := replace(v_definition, '''You both have a connection to '' || scored.region || ''.''', 'null::text');
  v_definition := replace(v_definition, '''You both share ties to '' || scored.region || ''.''', 'null::text');
  v_definition := replace(v_definition, '''You both call '' || scored.current_country || '' home.''', 'null::text');
  v_definition := replace(v_definition, '''You both share ties to '' || scored.current_country || ''.''', 'null::text');

  execute v_definition;
end;
$$;
