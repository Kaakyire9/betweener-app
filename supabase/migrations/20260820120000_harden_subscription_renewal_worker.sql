-- Replace the failing pg_cron -> pg_net -> Edge Function -> PostgREST loop with
-- one bounded, transactionally safe database worker.

create table if not exists public.subscription_renewal_job_runs (
  id uuid primary key default gen_random_uuid(),
  status text not null,
  worker_version text not null default 'v2-direct-db',
  started_at timestamptz not null default timezone('utc'::text, now()),
  completed_at timestamptz,
  result jsonb not null default '{}'::jsonb,
  error_code text,
  error_message text,
  constraint subscription_renewal_job_runs_status_valid
    check (status in ('running', 'succeeded', 'failed', 'skipped'))
);

alter table public.subscription_renewal_job_runs enable row level security;

revoke all on table public.subscription_renewal_job_runs from public, anon, authenticated;
grant select on table public.subscription_renewal_job_runs to service_role;

create index if not exists subscription_renewal_job_runs_started_idx
  on public.subscription_renewal_job_runs (started_at desc);

create index if not exists subscription_renewal_job_runs_failed_idx
  on public.subscription_renewal_job_runs (started_at desc)
  where status = 'failed';

create index if not exists subscriptions_renewal_due_idx
  on public.subscriptions (ends_at, id)
  include (user_id, type, external_environment)
  where is_active = true
    and type in ('SILVER'::public.subscription_type, 'GOLD'::public.subscription_type);

-- Unlike the general-purpose legacy helper, this worker-specific enqueue does
-- not swallow pg_net failures. A real queue failure rolls back the reservation
-- so the next scheduled run can retry it idempotently.
create or replace function private.enqueue_subscription_renewal_push(p_payload jsonb)
returns boolean
language plpgsql
security definer
set search_path = private, public, net, pg_catalog
as $$
declare
  v_webhook_url text;
  v_webhook_secret text;
begin
  select cfg.webhook_url, btrim(cfg.webhook_secret)
    into v_webhook_url, v_webhook_secret
  from private.push_config cfg
  where cfg.id = 1;

  if v_webhook_url is null or v_webhook_secret is null then
    return false;
  end if;

  perform net.http_post(
    url := v_webhook_url,
    body := p_payload,
    params := '{}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-push-secret', v_webhook_secret
    )
  );

  return true;
end;
$$;

revoke all on function private.enqueue_subscription_renewal_push(jsonb)
  from public, anon, authenticated;

create or replace function public.rpc_process_subscription_renewal_jobs(
  p_first_remind_before interval default '7 days'::interval,
  p_final_remind_before interval default '24 hours'::interval,
  p_include_sandbox boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
declare
  v_run_id uuid := gen_random_uuid();
  v_started_at timestamptz := clock_timestamp();
  v_now timestamptz := timezone('utc'::text, now());
  v_batch_limit constant integer := 250;
  v_reserved integer := 0;
  v_inbox_created integer := 0;
  v_push_scheduled integer := 0;
  v_has_inbox_items boolean := to_regclass('public.inbox_items') is not null;
  v_result jsonb;
  v_error_code text;
  v_error_message text;
begin
  if p_first_remind_before is null
    or p_final_remind_before is null
    or p_first_remind_before <= p_final_remind_before
    or p_final_remind_before <= interval '0 seconds'
  then
    raise exception 'invalid_reminder_window' using errcode = '22023';
  end if;

  -- Only one renewal worker may reserve/deliver reminders at a time. The lock
  -- is transaction scoped, so crashes and cancelled sessions release it.
  if not pg_try_advisory_xact_lock(
    hashtextextended('betweener:subscription-renewal-worker:v2', 0)
  ) then
    v_result := jsonb_build_object(
      'status', 'skipped',
      'reason', 'worker_already_running',
      'run_id', v_run_id,
      'worker_version', 'v2-direct-db'
    );

    insert into public.subscription_renewal_job_runs (
      id, status, started_at, completed_at, result
    ) values (
      v_run_id, 'skipped', v_started_at, clock_timestamp(), v_result
    );

    return v_result;
  end if;

  insert into public.subscription_renewal_job_runs (id, status, started_at)
  values (v_run_id, 'running', v_started_at);

  begin
    -- Reserve only a bounded set. The existing database uniqueness constraint
    -- remains the source of truth for duplicate suppression.
    with candidates as materialized (
      select
        s.id as subscription_id,
        s.user_id,
        s.type,
        s.ends_at,
        case
          when (s.ends_at - v_now) <= p_final_remind_before then 'renewal_24h'
          else 'renewal_7d'
        end as kind
      from public.subscriptions s
      where s.is_active = true
        and s.type in ('SILVER', 'GOLD')
        and s.ends_at > v_now
        and (s.ends_at - v_now) <= p_first_remind_before
        and (
          coalesce(p_include_sandbox, false)
          or upper(coalesce(s.external_environment, '')) <> 'SANDBOX'
        )
        and not exists (
          select 1
          from public.subscription_renewal_nudges n
          where n.subscription_id = s.id
            and n.user_id = s.user_id
            and n.kind = case
              when (s.ends_at - v_now) <= p_final_remind_before then 'renewal_24h'
              else 'renewal_7d'
            end
            and n.ends_at = s.ends_at
        )
      order by s.ends_at asc, s.id asc
      limit v_batch_limit
    ),
    reserved as (
      insert into public.subscription_renewal_nudges (
        user_id,
        subscription_id,
        kind,
        ends_at,
        metadata
      )
      select
        c.user_id,
        c.subscription_id,
        c.kind,
        c.ends_at,
        jsonb_build_object(
          'subscription_type', c.type,
          'ends_at', c.ends_at,
          'run_id', v_run_id,
          'worker_version', 'v2-direct-db'
        )
      from candidates c
      on conflict (user_id, subscription_id, kind, ends_at) do nothing
      returning id
    )
    select count(*)::integer into v_reserved from reserved;

    if v_has_inbox_items and v_reserved > 0 then
      insert into public.inbox_items (
        user_id,
        type,
        actor_id,
        entity_id,
        entity_type,
        title,
        body,
        action_required,
        metadata
      )
      select
        n.user_id,
        'SYSTEM',
        null,
        n.subscription_id,
        'subscription_renewal',
        case
          when n.kind = 'renewal_24h' then s.type::text || ' renews within 24 hours'
          else s.type::text || ' renews soon'
        end,
        case
          when n.kind = 'renewal_24h'
            then 'Your ' || lower(s.type::text) || ' plan renews within 24 hours. Review or change it now to keep your premium signals uninterrupted.'
          else 'Your ' || lower(s.type::text) || ' plan renews in the next 7 days. Review it now so your premium visibility stays uninterrupted.'
        end,
        true,
        jsonb_build_object(
          'type', 'subscription_renewal',
          'kind', n.kind,
          'plan', s.type,
          'ends_at', n.ends_at,
          'route', '/premium-plans'
        )
      from public.subscription_renewal_nudges n
      join public.subscriptions s on s.id = n.subscription_id
      left join lateral (
        select np.inapp_enabled
        from public.notification_prefs np
        where np.user_id = n.user_id
        order by np.updated_at desc, np.id desc
        limit 1
      ) prefs on true
      where n.metadata->>'run_id' = v_run_id::text
        and coalesce(prefs.inapp_enabled, true) = true;

      get diagnostics v_inbox_created = row_count;
    end if;

    if v_reserved > 0 then
      select count(*)::integer
        into v_push_scheduled
      from (
        select private.enqueue_subscription_renewal_push(
        jsonb_build_object(
          'user_id', n.user_id,
          'title', case
            when n.kind = 'renewal_24h' then s.type::text || ' renews within 24 hours'
            else s.type::text || ' renews soon'
          end,
          'body', case
            when n.kind = 'renewal_24h'
              then 'Your ' || lower(s.type::text) || ' plan renews within 24 hours. Review or change it now to keep your premium signals uninterrupted.'
            else 'Your ' || lower(s.type::text) || ' plan renews in the next 7 days. Review it now so your premium visibility stays uninterrupted.'
          end,
          'data', jsonb_build_object(
            'type', 'subscription_renewal',
            'kind', n.kind,
            'plan', s.type,
            'ends_at', n.ends_at,
            'route', '/premium-plans'
          )
          )
        ) as queued
        from public.subscription_renewal_nudges n
        join public.subscriptions s on s.id = n.subscription_id
        left join lateral (
          select np.push_enabled
          from public.notification_prefs np
          where np.user_id = n.user_id
          order by np.updated_at desc, np.id desc
          limit 1
        ) prefs on true
        where n.metadata->>'run_id' = v_run_id::text
          and coalesce(prefs.push_enabled, true) = true
          and public.is_quiet_hours(n.user_id) = false
      ) queued_pushes
      where queued_pushes.queued = true;
    end if;

    v_result := jsonb_build_object(
      'status', 'succeeded',
      'run_id', v_run_id,
      'worker_version', 'v2-direct-db',
      'batch_limit', v_batch_limit,
      'nudges_reserved', v_reserved,
      'inbox_created', v_inbox_created,
      'push_scheduled', v_push_scheduled,
      'duration_ms', round(extract(epoch from (clock_timestamp() - v_started_at)) * 1000)
    );

    update public.subscription_renewal_job_runs
    set status = 'succeeded',
        completed_at = clock_timestamp(),
        result = v_result
    where id = v_run_id;

    -- The ledger is operational history, not permanent product data.
    delete from public.subscription_renewal_job_runs
    where started_at < v_now - interval '90 days';

    return v_result;
  exception
    when others then
      get stacked diagnostics
        v_error_code = returned_sqlstate,
        v_error_message = message_text;

      v_result := jsonb_build_object(
        'status', 'failed',
        'run_id', v_run_id,
        'worker_version', 'v2-direct-db',
        'error_code', v_error_code,
        'error_message', left(coalesce(v_error_message, 'unknown_error'), 500),
        'duration_ms', round(extract(epoch from (clock_timestamp() - v_started_at)) * 1000)
      );

      update public.subscription_renewal_job_runs
      set status = 'failed',
          completed_at = clock_timestamp(),
          result = v_result,
          error_code = v_error_code,
          error_message = left(coalesce(v_error_message, 'unknown_error'), 500)
      where id = v_run_id;

      return v_result;
  end;
end;
$$;

revoke all on function public.rpc_process_subscription_renewal_jobs(interval, interval, boolean)
  from public, anon, authenticated;
grant execute on function public.rpc_process_subscription_renewal_jobs(interval, interval, boolean)
  to service_role;

-- The old job called an Edge Function through pg_net every 15 minutes. Replace
-- it with a direct hourly database call; renewal windows are measured in days.
do $$
declare
  v_job_id bigint;
begin
  if to_regprocedure('cron.schedule(text,text,text)') is null then
    raise notice 'pg_cron is unavailable; subscription renewal worker was not scheduled';
    return;
  end if;

  for v_job_id in
    select jobid
    from cron.job
    where jobname in (
      'subscription-renewal-jobs-every-15m',
      'subscription-renewal-jobs-hourly'
    )
  loop
    perform cron.unschedule(v_job_id);
  end loop;

  perform cron.schedule(
    'subscription-renewal-jobs-hourly',
    '7 * * * *',
    'select public.rpc_process_subscription_renewal_jobs();'
  );
end;
$$;
