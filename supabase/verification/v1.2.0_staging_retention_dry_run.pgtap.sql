-- Staging-only authenticated retention dry run.
-- The stored secret is passed database-to-worker and is never selected or logged.

begin;

create extension if not exists pgtap with schema extensions;
set local role postgres;
set search_path = public, extensions, pg_catalog;
select plan(2);

create temporary table staging_retention_request(request_id bigint primary key)
  on commit preserve rows;

insert into staging_retention_request(request_id)
select net.http_post(
  url := configuration.endpoint,
  headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'x-cron-secret', configuration.cron_secret
  ),
  body := jsonb_build_object('execute', false),
  timeout_milliseconds := 55000
)
from public.moderation_evidence_retention_config configuration
where configuration.singleton and configuration.enabled;

commit;

select pg_sleep(8);

begin;
set local role postgres;
set search_path = public, extensions, pg_catalog;

select ok(
  exists (
    select 1
    from net._http_response response
    join staging_retention_request request
      on request.request_id = response.id
    where response.status_code = 200
      and not response.timed_out
      and response.error_msg is null
  ),
  'retention worker accepts the configured staging secret'
);
select ok(
  exists (
    select 1
    from net._http_response response
    join staging_retention_request request
      on request.request_id = response.id
    where response.status_code = 200
      and response.content::jsonb ->> 'dry_run' = 'true'
  ),
  'retention worker performs a non-destructive dry run'
);

select * from finish();

delete from net._http_response response
using staging_retention_request request
where response.id = request.request_id;

commit;
