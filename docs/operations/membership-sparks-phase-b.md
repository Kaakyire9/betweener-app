# Membership + Sparks Phase B operations

Phase B creates membership authority, identity, policy, feature-flag, audit and database foundations. It does not perform RevenueCat V2 virtual-currency mutations.

## Authority boundaries

- RevenueCat exact `gold`/`silver` entitlements are authoritative in staging.
- `public.subscriptions` remains a mirror/cache. Staging never promotes membership from that mirror alone.
- Production keeps its existing higher-tier compatibility behavior until a separately approved migration.
- RevenueCat remains authoritative for `SPK`; there is no local wallet-balance column.
- Economy prices and feature flags are server-maintained and are not writable by authenticated clients.

## RevenueCat secrets

- Existing V1 functions prefer `REVENUECAT_V1_SECRET_API_KEY` when present and otherwise use `REVENUECAT_SECRET_API_KEY`.
- Future V2 economy functions use only `REVENUECAT_PROJECT_ID` and `REVENUECAT_V2_SECRET_API_KEY`.
- Do not remove `REVENUECAT_SECRET_API_KEY` until the V1 transition has been deployed and verified.

## HMAC activation after deployment

Keep the existing Authorization header configured throughout the migration.

1. Deploy the tested `revenuecat-webhook` implementation with `REVENUECAT_WEBHOOK_SIGNING_SECRET` still unset.
2. In RevenueCat, open **Betweener Staging → Integrations → Webhooks → the staging Supabase webhook**.
3. Toggle **HMAC webhook signing** on.
4. Copy the signing secret immediately; RevenueCat shows it only at creation or rotation.
5. Set that exact value as the staging Supabase secret `REVENUECAT_WEBHOOK_SIGNING_SECRET`.
6. Leave `REVENUECAT_WEBHOOK_SIGNATURE_TOLERANCE_SECONDS` unset for the 300-second default unless clock-skew evidence requires a change.
7. Send a RevenueCat dashboard test event and require HTTP 200.
8. Send or replay an unsigned/invalid fixture directly and require HTTP 401.

Once the Supabase signing secret exists, the function requires a valid `X-RevenueCat-Webhook-Signature` and also retains the existing Authorization check. Rotating the RevenueCat secret invalidates the old secret immediately; update Supabase during the same controlled operation.

## Deferred work

- Real SPK debit, credit and compensation calls
- Membership grants and allowance consumption
- Match Night, Profile Boost and Super Spark charging
- Android RevenueCat isolation
- Stream staging isolation required before Match Night/Live financial rollout
