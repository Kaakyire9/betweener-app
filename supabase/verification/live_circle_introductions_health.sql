with checks as (
  select
    regexp_replace(
      pg_get_functiondef(
        'public.rpc_create_live_match_round(uuid,uuid,uuid,uuid)'::regprocedure
      ),
      '\s+',
      '',
      'g'
    ) ilike '%formatnotin(''hosted_match_night'',''circle_live'')%'
      as circle_format_allowed,
    pg_get_functiondef(
      'public.rpc_set_live_introduction_availability(uuid,boolean)'::regprocedure
    ) ilike '%on_stage%'
      as on_stage_consent_allowed,
    has_function_privilege(
      'authenticated',
      'public.rpc_create_live_match_round(uuid,uuid,uuid,uuid)',
      'execute'
    ) as authenticated_execute_present,
    not has_function_privilege(
      'anon',
      'public.rpc_create_live_match_round(uuid,uuid,uuid,uuid)',
      'execute'
    ) as anonymous_execute_denied
)
select
  *,
  circle_format_allowed
    and on_stage_consent_allowed
    and authenticated_execute_present
    and anonymous_execute_denied as healthy
from checks;
