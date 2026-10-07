# Database capacity hardening rollout

These changes are for Betweener 1.2.0. Keep production 1.1.1 compatible and
deploy database changes before the 1.2.0 client.

## Staging order

1. Apply migrations in timestamp order:
   - `20260926110000_user_scoped_chat_broadcast.sql`
   - `20260926111000_recommendation_intent_query_indexes.sql`
   - `20260926112000_cache_intent_suggested_moves.sql`
   - `20260926113000_database_capacity_monitoring.sql`
2. Deploy the program-audio worker with its existing active poll setting and
   the new 15–30 second idle range.
3. Start the staging app and test incoming, outgoing, edited, deleted, and
   system chat messages on two devices. Background and foreground each device.
4. Open and leave Dashboard, Vibes, Chat list, and a thread. Confirm Realtime
   channel counts fall after leaving the relevant screen.
5. Run `supabase/verification/production_capacity_and_storage_health.sql`
   against staging. Confirm there are no idle-in-transaction connections and
   that capacity samples appear once per minute.

## Production order

Production requires separate approval. Apply the same four migrations first,
then deploy the worker, then ship the 1.2.0 client. The Broadcast migration is
additive: 1.1.1 can continue using Postgres Changes until its retirement gate.

Do not remove `messages` or `system_messages` from the `supabase_realtime`
publication while 1.1.1 remains supported.

## Rollback

- The mobile client can fall back to the existing catch-up fetches if its
  Broadcast channel is unavailable.
- The Broadcast triggers and Realtime policy can be removed without changing
  chat rows.
- Stop the `database-capacity-monitor-v1` cron job to pause sampling; preserve
  the recorded samples and alerts for incident review.
- Restore the previous worker image to return to fixed polling.

## Storage spike investigation

Use the verification report at the timestamp of the spike. Compare Storage
object creation by bucket with content-moderation, attachment-finalization,
and cron workload in the same five-minute window. In Logs Explorer, select
Storage and Edge Functions, use that window plus five minutes on each side,
and group by route/function, response status, and latency. Object counts alone
establish correlation, not cause; downloads and failed requests exist only in
the service logs.
