begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions, pg_catalog;
set local role postgres;
select extensions.plan(8);

select extensions.has_function(
  'public',
  'get_vibes_recommendations_v3',
  array['uuid', 'text', 'integer', 'integer'],
  'V3 recommendation boundary exists'
);

select extensions.ok(
  pg_get_functiondef(
    'public.get_vibes_recommendations_v3(uuid,text,integer,integer)'::regprocedure
  ) like '%is_romantically_eligible%',
  'V3 candidate source composes canonical romantic eligibility'
);

select extensions.ok(
  pg_get_functiondef(
    'public.get_vibes_recommendations_v5(uuid,text,integer,integer)'::regprocedure
  ) like '%get_vibes_recommendations_v3%',
  'V5 consumes the filtered V3 candidate source'
);

select extensions.has_function(
  'public',
  'get_vibes_recommendations_v5_3',
  array['uuid', 'text', 'integer', 'integer', 'uuid', 'uuid', 'integer'],
  'V5.3 public recommendation boundary exists'
);

select extensions.ok(
  pg_get_functiondef(
    'public.get_vibes_recommendations_v5_3(uuid,text,integer,integer,uuid,uuid,integer)'::regprocedure
  ) like '%is_romantically_eligible%',
  'V5.3 public boundary fails closed on canonical romantic eligibility'
);

select extensions.ok(
  to_regprocedure(
    'public.get_vibes_recommendations_v5_3_unfiltered(uuid,text,integer,integer,uuid,uuid,integer)'
  ) is not null,
  'original V5.3 implementation remains installed behind the boundary'
);

select extensions.ok(
  not has_function_privilege(
    'authenticated',
    'public.get_vibes_recommendations_v5_3_unfiltered(uuid,text,integer,integer,uuid,uuid,integer)',
    'EXECUTE'
  ),
  'authenticated clients cannot bypass the V5.3 eligibility boundary'
);

select extensions.ok(
  has_function_privilege(
    'authenticated',
    'public.get_vibes_recommendations_v5_3(uuid,text,integer,integer,uuid,uuid,integer)',
    'EXECUTE'
  ),
  'authenticated clients retain the deployed V5.3 RPC contract'
);

select * from extensions.finish();
rollback;
