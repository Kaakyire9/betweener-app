\if :{?viewer_user_id}
\else
  \echo 'Missing required psql variable: viewer_user_id'
  \quit 1
\endif

\if :{?viewer_profile_id}
\else
  \echo 'Missing required psql variable: viewer_profile_id'
  \quit 1
\endif

\if :{?candidate_profile_id_1}
\else
  \echo 'Missing required psql variable: candidate_profile_id_1'
  \quit 1
\endif

\if :{?candidate_profile_id_2}
\else
  \echo 'Missing required psql variable: candidate_profile_id_2'
  \quit 1
\endif

begin;

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', :'viewer_user_id',
    'role', 'authenticated'
  )::text,
  true
);
select set_config('request.jwt.claim.sub', :'viewer_user_id', true);

\echo ''
\echo '1) get_vibes_recommendations_v3(for_you)'
explain (analyze, buffers, verbose)
select *
from public.get_vibes_recommendations_v3(
  :'viewer_profile_id'::uuid,
  'for_you',
  30,
  30
);

\echo ''
\echo '2) get_vibes_recommendations_v3(nearby)'
explain (analyze, buffers, verbose)
select *
from public.get_vibes_recommendations_v3(
  :'viewer_profile_id'::uuid,
  'nearby',
  30,
  30
);

\echo ''
\echo '3) get_vibes_recommendations_v3(active_now)'
explain (analyze, buffers, verbose)
select *
from public.get_vibes_recommendations_v3(
  :'viewer_profile_id'::uuid,
  'active_now',
  30,
  30
);

\echo ''
\echo '4) rpc_get_profile_card_context'
explain (analyze, buffers, verbose)
select *
from public.rpc_get_profile_card_context(
  array[
    :'candidate_profile_id_1'::uuid,
    :'candidate_profile_id_2'::uuid
  ],
  false
);

\echo ''
\echo '5) rpc_process_vibes_v4_jobs'
explain (analyze, buffers, verbose)
select public.rpc_process_vibes_v4_jobs(
  500,
  250,
  150,
  interval '30 minutes',
  interval '6 hours',
  interval '6 hours'
);

rollback;
