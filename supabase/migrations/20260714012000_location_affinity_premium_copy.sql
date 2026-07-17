-- Give every consumer of profile location affinity the same concise,
-- editorial copy used by the Vibes client.
do $$
declare
  v_signature regprocedure := 'public.compute_location_affinities(uuid,uuid[])'::regprocedure;
  v_definition text;
begin
  select pg_get_functiondef(v_signature::oid) into v_definition;

  if position('''Shared connection to '' || scored.region' in v_definition) = 0 then
    raise exception 'Unexpected location affinity definition for %', v_signature;
  end if;

  v_definition := replace(v_definition, '''Diaspora bridge to '' || scored.roots_locality', '''Diaspora link through '' || scored.roots_locality');
  v_definition := replace(v_definition, '''Shared roots around '' || scored.roots_locality', '''Shared roots in '' || scored.roots_locality');
  v_definition := replace(v_definition, '''Shared connection to '' || scored.city', 'null::text');
  v_definition := replace(v_definition, '''Same district: '' || scored.locality_district', 'null::text');
  v_definition := replace(v_definition, '''Shared connection to '' || scored.region', 'null::text');
  v_definition := replace(v_definition, '''Both connected to '' || scored.current_country', 'null::text');

  v_definition := replace(v_definition, '''You share a diaspora bridge through '' || scored.roots_locality || ''.''', '''Your stories connect through '' || scored.roots_locality || ''.''');
  v_definition := replace(v_definition, '''You share roots around '' || scored.roots_locality || ''.''', '''Your stories share roots in '' || scored.roots_locality || ''.''');
  v_definition := replace(v_definition, '''You both have a connection to '' || scored.city || ''.''', 'null::text');
  v_definition := replace(v_definition, '''There''''s a shared roots connection in '' || scored.roots_region || ''.''', '''Your stories share roots in '' || scored.roots_region || ''.''');
  v_definition := replace(v_definition, '''You both have ties to '' || scored.locality_district || ''.''', 'null::text');
  v_definition := replace(v_definition, '''You both have a connection to '' || scored.region || ''.''', 'null::text');
  v_definition := replace(v_definition, '''You both call '' || scored.current_country || '' home.''', 'null::text');

  execute v_definition;
end;
$$;
