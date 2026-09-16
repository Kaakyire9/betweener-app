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
- Background delivery uses the private push-event outbox and the `push-notifications` Edge Function. It respects `live_reminders` and `live_started`, caps a campaign at 20,000 registered tokens, pages 500 tokens at a time, sends Expo batches of 100 with concurrency 3, and retries failed Live campaigns up to five times.
- Push delivery is binary-version gated per token by one shared compatibility policy used for both campaigns and unicast delivery. `live_rescheduled`, `live_cancelled`, `live_quick_connect_opportunity`, `live_quick_connect_ready`, `live_host_assigned`, `live_host_revoked`, `live_starting_soon`, and `live_now` require at least `LIVE_NOTIFICATIONS_MIN_APP_VERSION`. Older, missing, malformed, or prerelease versions never receive Live deep links; the token record is retained and remains eligible for v1.1.1-compatible notifications.
- The Circles tab listens to a content-free global Live invalidation and shows ongoing Live presence without adding it to the app-icon unread badge.

## Push security boundary

- Mobile and web clients never call `push-notifications`. The function has no CORS response and rejects every method except `POST`.
- The request body is exactly `{ "event_id": "<uuid>" }`, is limited to 160 bytes, and cannot provide a recipient, token, message, deep link, or campaign directly.
- The database signs `<unix_timestamp>.<exact_raw_body>` with HMAC-SHA256. The function uses a timing-safe comparison and rejects timestamps outside 180 seconds.
- `private.push_notification_events` is the canonical, inaccessible outbox. The service-role-only claim RPC locks each event and accepts it only from `pending`, so replayed, concurrent, and completed requests cannot deliver twice.
- The claim rechecks the recipient account, global push preference, quiet hours, and current block state. Live campaigns additionally resolve current session state, app-version eligibility, and Live notification preferences.
- Per-minute claim limits are 300 globally, 20 per unicast recipient, and 5 Live campaigns. A unicast recipient is capped at 10 tokens.
- Authentication failures and volume anomalies are logged by reason and event ID where applicable. Secrets and signatures are never logged.
- `private.expire_pending_push_notification_events_v1` is the only pending-to-expired transition. It atomically locks and terminalizes only expired, unclaimed and unreserved events. The minute dispatcher runs this sweep before delivery selection even when signing is disabled or the webhook is unavailable; daily retention repeats it as a fallback.
- Expired events remain auditable for 30 days after terminalization. Push health reports actionable pending, the two-minute scheduler grace window, terminal expired, processing and stranded pending counts separately, and fails when an expired pending event remains beyond the grace window.

## Dedicated signing secret and rotation

- Generate at least 32 random bytes from a cryptographically secure source. Do not reuse a Supabase key, service-role key, RevenueCat secret, Stream credential, or another Betweener secret.
- Store the same value in two server-only secret stores: Supabase Edge Function secret `PUSH_HMAC_CURRENT_SECRET`, and Supabase Vault under the configured `active_signing_secret_name` (default `push_webhook_hmac_current`). Never place it in a migration, `.env`, client build, command history, log, or ticket.
- Set `PUSH_HMAC_CURRENT_KEY_ID` to the matching non-secret identifier (default `push-v1`). `private.push_config.active_signing_key_id` must match it.
- Rotation is additive: install the new Edge key as current and retain the old key as `PUSH_HMAC_PREVIOUS_*`; set `PUSH_HMAC_PREVIOUS_VALID_UNTIL` to an epoch-seconds deadline; create the new Vault secret; switch the database active key ID/name; wait longer than the 180-second replay window plus the five-minute retry interval; verify no old-key traffic; then remove the previous Edge/Vault key. The function automatically rejects the previous key after its deadline.
- `private.push_config.webhook_secret` is retired and cleared by the hardening migration. `PUSH_WEBHOOK_SECRET` is not read by the function and should be removed only after the new path is verified.

## Approval-gated deployment sequence

Do not deploy this change until the owner approves the exact production results. The safe rollout order avoids either version accepting an unsafe fallback:

1. Add the new current/previous HMAC variables to Edge Function secret storage. The currently deployed function ignores them.
2. Apply the four ordered hardening migrations from `20260914123000` through `20260914126000`. Until the Vault key is configured, producers safely queue canonical events without sending them.
3. Deploy `push-notifications` with its configured `verify_jwt = false`; HMAC remains the application authentication boundary.
4. Create the matching dedicated Vault secret, set the active key ID/name in `private.push_config`, and invoke `private.dispatch_pending_push_notification_events_v1(100)` from a privileged database session.
5. Before migration, run the safe inventory probe; it should report `hardening_schema_present = false`. After the rollout, run both health scripts and approve only when both return `healthy = true`:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/invoke-pinned-supabase.ps1 db query --linked --file supabase/verification/push_notification_event_security_predeployment.sql
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/invoke-pinned-supabase.ps1 db query --linked --file supabase/verification/push_notification_event_security_health.sql
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/invoke-pinned-supabase.ps1 db query --linked --file supabase/verification/live_delegated_host_notifications_health.sql
```

### Expired-pending lifecycle follow-up

This is a separate approval-gated reliability migration after the four HMAC migrations and Edge function v73. It does not redeploy the Edge function or change signing, keys, Vault, the canonical URL, or the legacy Edge secret.

1. Confirm HMAC signing and all push/Live/v1.1.1 health checks are green, migration history has no drift, and no event is `processing` unexpectedly.
2. Apply only `20260914127000_push_notification_expiry_lifecycle.sql`.
3. Do not manually update stranded event status. Allow the existing `push-notification-event-dispatch` minute job to invoke the canonical expiry sweep.
4. After one full cron interval, confirm stranded pending is zero, the known canary `fd671fbd-64bf-481f-93b6-de3256f795e5` is `expired` with outcome `expired_before_claim`, `completed_at` is set, and it still has no reservation or accepted ticket.
5. Re-run expiry regression, replay/idempotency, push security, v1.1.1, Live/delegated-host, migration and database health before declaring the reliability rollout healthy.

If the migration transaction fails, it rolls back atomically. If postdeployment dispatch, HMAC, replay, reservation or compatibility health regresses, disable database signing first using the existing fail-closed procedure, preserve the outbox and reservation ledger, and fix forward with a reviewed additive migration. Do not restore raw-secret authentication or manually delete/retag queued events.

### Safe rollback

1. Stop dispatch first by clearing `private.push_config.active_signing_key_id` and `active_signing_secret_name`; new canonical events remain pending until their bounded expiry.
2. Keep the additive outbox and reservation schema in place. Do not delete queued events or reservation rows during incident response.
3. Keep the HMAC-capable function deployed, or disable its webhook route while fixing forward. Do not redeploy the legacy raw-secret function and never restore the `x-push-secret` path.
4. For a key-rotation-only failure, switch the database signer back to the still-valid previous Vault key while the Edge function still accepts that previous key ID, then investigate before its explicit expiry.
5. Re-enable dispatch only after the security health query returns `healthy = true`; then drain pending events with the bounded dispatcher and confirm event/error volume.

## Required operational checks

- `push-notifications` retains `SUPABASE_SERVICE_ROLE_KEY` only for canonical claim/completion RPCs and token resolution after HMAC authentication.
- JWT verification is intentionally disabled for the database webhook transport. Missing or invalid HMAC configuration fails closed with no fallback credential path.
- `push-notifications` sets `LIVE_NOTIFICATIONS_MIN_APP_VERSION` to the first released binary that supports the Live routes (currently `1.2.0`).
- `LIVE_NOTIFICATIONS_MIN_APP_VERSION` cannot lower the compiled `1.2.0` safety floor. Incompatible-token suppressions use the aggregate reason `incompatible_app_version` without logging tokens or recorded client versions.
- `pg_cron` and the existing push webhook transport remain enabled.
- Test one scheduled Host assignment, one T-15 foreground announcement, one background push, one Live-now Circles badge, a runtime extension, and automatic access expiry after End Live.
