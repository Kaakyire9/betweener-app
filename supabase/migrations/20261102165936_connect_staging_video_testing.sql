-- Staging video activation prerequisite. Does not activate any gate or add budget.
-- Relationship, recipient media consent, admission fences and production denial
-- remain authoritative. Open staging testing is not a consent bypass.
begin;

alter table private.connect_config
  drop constraint connect_open_testing_staging_voice_only,
  add constraint connect_open_testing_staging_only
    check (not staging_open_testing or environment = 'staging');

commit;
