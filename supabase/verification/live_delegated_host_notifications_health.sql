with health as (
  select
    to_regclass('public.live_session_host_assignments') is not null
      as host_assignments_present,
    to_regprocedure('public.rpc_admin_delegate_live_host_v1(uuid,text)') is not null
      and to_regprocedure('public.rpc_admin_revoke_live_host_v1(uuid)') is not null
      and to_regprocedure('public.rpc_extend_live_session_v1(uuid,integer,boolean)') is not null
      as host_management_rpcs_present,
    exists (
      select 1 from pg_indexes
      where schemaname = 'public'
        and indexname = 'live_session_host_assignments_one_active_idx'
        and indexdef ilike '%where (status = ''active''%'
    ) as one_active_host_enforced,
    not has_table_privilege('authenticated', 'public.live_session_host_assignments', 'INSERT')
      and not has_table_privilege('authenticated', 'public.live_session_host_assignments', 'UPDATE')
      and not has_table_privilege('authenticated', 'public.live_session_host_assignments', 'DELETE')
      as host_assignments_direct_writes_denied,
    exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'live_sessions'
        and column_name = 'produced_by_user_id'
    ) and exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'live_sessions'
        and column_name = 'end_policy'
    ) as session_lifecycle_columns_present,
    to_regclass('public.live_notification_campaigns') is not null
      and to_regclass('public.live_in_app_announcements') is not null
      as notification_campaign_tables_present,
    to_regprocedure('public.rpc_service_claim_live_notification_campaign_v1(uuid)') is not null
      and to_regprocedure('public.rpc_service_complete_live_notification_campaign_v1(uuid,boolean,integer,integer,text)') is not null
      as notification_worker_rpcs_present,
    exists (
      select 1 from cron.job
      where jobname = 'live-public-notification-campaigns'
        and active
    ) as notification_clock_present,
    exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public'
        and tablename = 'live_discovery_updates'
    ) and exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public'
        and tablename = 'live_in_app_announcements'
    ) as realtime_surfaces_present
)
select *,
  host_assignments_present
  and host_management_rpcs_present
  and one_active_host_enforced
  and host_assignments_direct_writes_denied
  and session_lifecycle_columns_present
  and notification_campaign_tables_present
  and notification_worker_rpcs_present
  and notification_clock_present
  and realtime_surfaces_present
  as healthy
from health;
