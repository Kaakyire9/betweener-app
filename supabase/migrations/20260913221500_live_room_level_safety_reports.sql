begin;

-- A report with no target identifies the Live room itself. Participant reports
-- use target_user_id; comment reports use both target columns. Direct table
-- writes remain revoked, so all three shapes still pass through the guarded RPC.
alter table public.live_reports
  drop constraint if exists live_reports_target_valid;

alter table public.live_reports
  drop constraint if exists live_reports_target_consistent;

alter table public.live_reports
  add constraint live_reports_target_consistent check (
    target_comment_id is null or target_user_id is not null
  );

commit;
