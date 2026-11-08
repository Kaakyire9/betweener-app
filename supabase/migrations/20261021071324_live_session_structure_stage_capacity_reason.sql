-- Allow the six-person panel capacity RPC to publish a content-free
-- Live structure invalidation after changing maximum_publishers.

begin;

alter table public.live_session_structure_updates
  drop constraint if exists live_session_structure_updates_reason_valid;

alter table public.live_session_structure_updates
  add constraint live_session_structure_updates_reason_valid check (
    reason in ('session_structure', 'stage_intake', 'stage_capacity')
  );

commit;
