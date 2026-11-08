-- Read only; run only against the approved staging project. Never select headers/Vault values.
select d.request_id,d.dispatched_at,r.status_code,r.timed_out,
  (r.error_msg is not null) as transport_error,
  case when r.content is json object then (r.content::jsonb)->>'processed' end as processed,
  case when r.content is json object then (r.content::jsonb)->>'success' end as job_success,
  (r.id is null and d.dispatched_at<clock_timestamp()-interval '30 seconds') as response_overdue
from private.connect_staging_worker_dispatches d
left join net._http_response r on r.id=d.request_id
order by d.dispatched_at desc limit 12;

select operation,status,count(*) as jobs,min(available_at) as next_due,
  min(lease_until) filter(where status='working') as oldest_lease
from private.connect_provider_jobs where status<>'done' group by operation,status;

select jobid,jobname,schedule,active from cron.job where jobname='connect-staging-provider-worker';
select j.status,j.start_time,j.end_time
from cron.job_run_details j join cron.job c on c.jobid=j.jobid
where c.jobname='connect-staging-provider-worker' order by j.start_time desc limit 12;
