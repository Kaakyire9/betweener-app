with checks as (
  select
    to_regprocedure('public.rpc_report_live_content(uuid,uuid,text,text,uuid,uuid)') is not null
      as report_rpc_present,
    exists (
      select 1
      from pg_constraint
      where conrelid = 'public.live_reports'::regclass
        and conname = 'live_reports_target_consistent'
        and pg_get_constraintdef(oid) ilike '%target_comment_id is null%target_user_id is not null%'
    ) as room_report_shape_present,
    not exists (
      select 1
      from pg_constraint
      where conrelid = 'public.live_reports'::regclass
        and conname = 'live_reports_target_valid'
    ) as legacy_target_constraint_removed,
    not has_table_privilege('authenticated', 'public.live_reports', 'insert')
      as direct_client_insert_denied
)
select
  *,
  report_rpc_present
    and room_report_shape_present
    and legacy_target_constraint_removed
    and direct_client_insert_denied as healthy
from checks;
