# Live-scoped Host operations

Betweener Live creation remains closed. An internal admin can hand one scheduled Live to an active user by exact `@username`; this does not grant global admin or Live-creation permission.

## Product workflow

1. Create and publish the Live as an approved internal producer.
2. Open **Live Studio > Session** before the Live begins.
3. Enter the trusted Host's exact `@username` and choose **Assign**.
4. The Host receives a notification and gains App Host controls plus Betweener Studio access for that Live.
5. During the Live, the Host can add 30 or 60 minutes, or choose **Keep open** for a manual end.
6. End Live normally. The assignment expires and the original producer is restored automatically.

Host replacement and revocation are deliberately locked after the Live begins so a handoff cannot destabilize an active media stage.

## Notification policy

- Public `global`, `match_night`, `diaspora`, and `special_event` sessions create durable campaigns at about T-15 minutes and when the room goes Live.
- Circle and other private contexts never enter the all-user campaign.
- Foreground users receive a Realtime in-app announcement.
- Background delivery uses the existing `push-notifications` Edge Function, respects `live_reminders` and `live_started`, pages tokens, sends Expo batches of 100, and retries failed campaigns up to five times.
- Push delivery is binary-version gated by `LIVE_NOTIFICATIONS_MIN_APP_VERSION`. Tokens with an older, missing, or invalid app version never receive Live deep links.
- The Circles tab listens to a content-free global Live invalidation and shows ongoing Live presence without adding it to the app-icon unread badge.

## Deployment

```powershell
npx.cmd supabase@latest functions deploy push-notifications --project-ref jbyblhithbqwojhwlenv
npx.cmd supabase@latest db push --linked
npx.cmd supabase@latest db query --linked --file supabase/verification/live_delegated_host_notifications_health.sql
```

Deploy the backward-compatible Edge Function first, then the database migrations. This prevents the new scheduler from reaching an older function during rollout. A healthy verification result must report `healthy = true`.

## Required operational checks

- `push-notifications` retains `SUPABASE_SERVICE_ROLE_KEY` and the same `PUSH_WEBHOOK_SECRET` used by `private.send_push_webhook`.
- `push-notifications` sets `LIVE_NOTIFICATIONS_MIN_APP_VERSION` to the first released binary that supports the Live routes (currently `1.2.0`).
- `pg_cron` and the existing push webhook transport remain enabled.
- Test one scheduled Host assignment, one T-15 foreground announcement, one background push, one Live-now Circles badge, a runtime extension, and automatic access expiry after End Live.
