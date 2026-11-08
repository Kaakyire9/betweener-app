with checks as (
  select
    to_regclass('public.live_reaction_totals') is not null
      as aggregate_table_present,
    to_regprocedure('public.rpc_get_live_reaction_summary(uuid)') is not null
      as summary_rpc_present,
    exists (
      select 1
      from pg_trigger
      where tgrelid = 'public.live_reactions'::regclass
        and tgname = 'live_reactions_project_total'
        and not tgisinternal
        and tgenabled <> 'D'
    ) as projection_trigger_enabled,
    pg_get_function_result('public.rpc_create_live_reaction(uuid,uuid,text)'::regprocedure) = 'jsonb'
      as reaction_receipt_is_json,
    pg_get_functiondef('public.rpc_create_live_reaction(uuid,uuid,text)'::regprocedure)
      ilike '%live_reaction_summary_payload%'
      as receipt_contains_summary,
    not has_table_privilege('authenticated', 'public.live_reactions', 'SELECT')
      as individual_reactions_private,
    not has_table_privilege('authenticated', 'public.live_reaction_totals', 'SELECT')
      as aggregate_table_rpc_only
)
select
  *,
  aggregate_table_present
    and summary_rpc_present
    and projection_trigger_enabled
    and reaction_receipt_is_json
    and receipt_contains_summary
    and individual_reactions_private
    and aggregate_table_rpc_only as healthy
from checks;
