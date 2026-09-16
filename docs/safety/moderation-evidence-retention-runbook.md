# Moderation evidence retention runbook

Use this procedure in staging first. Production remains unchanged until the
v1.2 release window.

## Configure

1. Generate a cryptographically random secret of at least 32 characters and
   store it in the approved secret manager. Never commit it or paste it into a
   ticket, chat, screenshot, or this repository.
2. Apply migrations through `20260915130000`.
3. Set the Edge Function secret:

   ```powershell
   supabase secrets set MODERATION_RETENTION_SECRET --project-ref YOUR_PROJECT_REF
   ```

4. Deploy the worker. `verify_jwt=false` is intentional because the database
   cron authenticates with the secret header:

   ```powershell
   supabase functions deploy moderation-evidence-retention --no-verify-jwt --project-ref YOUR_PROJECT_REF
   ```

5. Configure the database scheduler with the same secret:

   ```sql
   select public.configure_moderation_evidence_retention_worker(
     'https://YOUR_PROJECT_REF.supabase.co/functions/v1/moderation-evidence-retention',
     'THE_SAME_SECRET_FROM_THE_SECRET_MANAGER'
   );
   ```

The job runs daily at 03:17 UTC. The worker retains unresolved review evidence,
claims eligible rows atomically, retries stale claims, and dead-letters an item
after eight failed attempts.

## Validate

Invoke the endpoint first with `{ "execute": false }`, then once with
`{ "execute": true }`. Both requests must include `x-cron-secret`. Run
`v1.2.0_solicitation_guard_health.sql` and confirm:

- `retention_configured` and `retention_scheduled` are true;
- `stuck_runs` and `runs_with_dead_letters` are zero; and
- the final `retention_healthy` value is true.

## Rotate the secret

Set the new Edge Function secret first, then immediately call the configuration
function with the same new value. Run a dry run to verify authentication.

## Emergency stop

```sql
select public.disable_moderation_evidence_retention_worker();
```

This disables the stored configuration and removes the cron job. It does not
delete evidence or alter pending reviews. Investigate failed run records before
reconfiguring the worker.
