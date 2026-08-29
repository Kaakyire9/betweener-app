import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(
  new URL(
    '../supabase/migrations/20260820120000_harden_subscription_renewal_worker.sql',
    import.meta.url,
  ),
  'utf8',
);

const workerBody =
  migration.match(
    /create or replace function public\.rpc_process_subscription_renewal_jobs[\s\S]+?\n\$\$;/i,
  )?.[0] ?? '';

test('renewal worker is direct, bounded, non-overlapping and temp-table free', () => {
  assert.match(workerBody, /pg_try_advisory_xact_lock/i);
  assert.match(workerBody, /v_batch_limit constant integer := 250/i);
  assert.match(workerBody, /limit v_batch_limit/i);
  assert.doesNotMatch(workerBody, /create temporary table/i);
  assert.doesNotMatch(workerBody, /truncate table pg_temp/i);
});

test('renewal reservations remain database-idempotent and identify one atomic run', () => {
  assert.match(
    workerBody,
    /on conflict \(user_id, subscription_id, kind, ends_at\) do nothing/i,
  );
  assert.match(workerBody, /'run_id', v_run_id/i);
  assert.match(workerBody, /n\.metadata->>'run_id' = v_run_id::text/i);
});

test('renewal preference lookup cannot multiply deliveries when legacy rows duplicate', () => {
  assert.match(workerBody, /left join lateral/i);
  assert.match(workerBody, /order by np\.updated_at desc, np\.id desc/i);
  assert.match(workerBody, /limit 1/i);
});

test('renewal execution is server-only and emits durable run diagnostics', () => {
  assert.match(migration, /subscription_renewal_job_runs/i);
  assert.match(migration, /enable row level security/i);
  assert.match(
    migration,
    /revoke all on function[\s\S]+from public, anon, authenticated/i,
  );
  assert.match(migration, /grant execute on function[\s\S]+to service_role/i);
});

test('push queue failures are not swallowed after a reminder is reserved', () => {
  const enqueueBody =
    migration.match(
      /create or replace function private\.enqueue_subscription_renewal_push[\s\S]+?\n\$\$;/i,
    )?.[0] ?? '';

  assert.match(enqueueBody, /perform net\.http_post/i);
  assert.doesNotMatch(enqueueBody, /exception\s+when others/i);
  assert.match(workerBody, /private\.enqueue_subscription_renewal_push/i);
  assert.doesNotMatch(workerBody, /private\.send_push_webhook/i);
});

test('cron invokes the database directly and no longer calls pg_net or the Edge Function', () => {
  const scheduleBlock = migration.match(/do \$\$[\s\S]+?\n\$\$;/i)?.[0] ?? '';
  assert.match(scheduleBlock, /subscription-renewal-jobs-hourly/i);
  assert.match(scheduleBlock, /'7 \* \* \* \*'/i);
  assert.match(scheduleBlock, /select public\.rpc_process_subscription_renewal_jobs\(\);/i);
  assert.doesNotMatch(scheduleBlock, /net\.http_post/i);
  assert.doesNotMatch(scheduleBlock, /functions\/v1\/subscription-renewal-jobs/i);
});
