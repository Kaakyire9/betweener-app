-- Read-only production capacity and Storage correlation report.
-- Run after 20260926113000. No member content or raw identifiers are returned.

-- 1. Current connection headroom.
with limits as (
  select current_setting('max_connections')::integer as maximum,
    current_setting('superuser_reserved_connections')::integer as reserved
), usage as (
  select count(*)::integer as connections
  from pg_stat_activity
  where backend_type = 'client backend'
)
select usage.connections, limits.maximum, limits.reserved,
  limits.maximum - limits.reserved as usable,
  limits.maximum - limits.reserved - usage.connections as available,
  round(100.0 * usage.connections / greatest(limits.maximum - limits.reserved, 1), 1)
    as utilization_percent
from limits, usage;

-- 2. Connections by service and state. `idle in transaction` must be zero.
select coalesce(nullif(activity.application_name, ''), '(unknown)') as application,
  coalesce(activity.usename, '(unknown)') as database_role,
  activity.state,
  activity.wait_event_type,
  activity.wait_event,
  count(*)::integer as connections,
  max(now() - activity.state_change) as longest_in_state
from pg_stat_activity activity
where activity.backend_type = 'client backend'
group by activity.application_name, activity.usename, activity.state,
  activity.wait_event_type, activity.wait_event
order by connections desc, application;

-- 3. Capacity transitions recorded by the monitor.
select sample.sampled_at, sample.connections, sample.usable_connections,
  sample.utilization_percent, sample.level, sample.by_application
from public.database_capacity_samples sample
where sample.sampled_at >= now() - interval '24 hours'
order by sample.sampled_at desc
limit 1440;

-- 4. Storage object churn by bucket and five-minute window. This correlates a Storage API
-- connection spike with profile/chat moderation or ordinary member uploads.
select date_bin('5 minutes', object_row.created_at, timestamptz '2000-01-01') as window_start,
  object_row.bucket_id,
  count(*)::integer as objects_created,
  count(*) filter (
    where object_row.updated_at > object_row.created_at + interval '5 seconds'
  )::integer as objects_updated_after_creation
from storage.objects object_row
where object_row.created_at >= now() - interval '24 hours'
group by date_bin('5 minutes', object_row.created_at, timestamptz '2000-01-01'), object_row.bucket_id
order by window_start desc, objects_created desc;

-- 5. Edge-backed moderation/finalization workload by five-minute window. Counts only.
select date_bin('5 minutes', event_row.created_at, timestamptz '2000-01-01') as window_start,
  'content_moderation'::text as workload,
  event_row.content_type as subtype,
  event_row.status,
  count(*)::integer as operations
from public.content_moderation_events event_row
where event_row.created_at >= now() - interval '24 hours'
group by date_bin('5 minutes', event_row.created_at, timestamptz '2000-01-01'),
  event_row.content_type, event_row.status
union all
select date_bin('5 minutes', finalization.created_at, timestamptz '2000-01-01'),
  'chat_attachment_finalization',
  coalesce(finalization.status, 'unknown'),
  coalesce(finalization.status, 'unknown'),
  count(*)::integer
from public.chat_attachment_finalization_keys finalization
where finalization.created_at >= now() - interval '24 hours'
group by date_bin('5 minutes', finalization.created_at, timestamptz '2000-01-01'),
  finalization.status
order by window_start desc, workload, subtype;

-- 6. Scheduled jobs that can invoke Edge/Storage work.
select run.jobid, job.jobname, run.status,
  date_trunc('minute', run.start_time) as started_minute,
  round(extract(epoch from (coalesce(run.end_time, now()) - run.start_time))::numeric, 1)
    as duration_seconds,
  left(coalesce(run.return_message, ''), 240) as result
from cron.job_run_details run
join cron.job job on job.jobid = run.jobid
where run.start_time >= now() - interval '24 hours'
order by run.start_time desc
limit 500;

-- 7. High-call database statements since pg_stat_statements was reset.
select query_stats.calls,
  round(query_stats.mean_exec_time::numeric, 2) as mean_ms,
  round(query_stats.total_exec_time::numeric, 2) as total_ms,
  query_stats.rows,
  left(regexp_replace(query_stats.query, '\s+', ' ', 'g'), 220) as query_shape
from pg_stat_statements query_stats
order by query_stats.total_exec_time desc
limit 30;
