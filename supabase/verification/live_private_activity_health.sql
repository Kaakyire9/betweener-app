with checks as (
  select
    to_regprocedure('public.rpc_get_live_private_activity_v1(uuid)') is not null as activity_rpc_present,
    has_function_privilege('anon', 'public.rpc_get_live_private_activity_v1(uuid)', 'EXECUTE') = false as anonymous_denied,
    has_function_privilege('authenticated', 'public.rpc_get_live_private_activity_v1(uuid)', 'EXECUTE') as authenticated_allowed
)
select
  checks.*,
  checks.activity_rpc_present
    and checks.anonymous_denied
    and checks.authenticated_allowed as healthy
from checks;
