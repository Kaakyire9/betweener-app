-- Restore the public Live notification campaign clock after an operational pause.
-- Safe to run repeatedly: it schedules only when the named job is absent.

do $$
begin
  if not exists (
    select 1
    from cron.job
    where jobname = 'live-public-notification-campaigns'
  ) then
    perform cron.schedule(
      'live-public-notification-campaigns',
      '* * * * *',
      'select public.enqueue_live_notification_campaigns_v1();'
    );
  end if;
end;
$$;

select exists (
  select 1
  from cron.job
  where jobname = 'live-public-notification-campaigns'
) as notification_clock_present;
