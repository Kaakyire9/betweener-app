// This file helps VS Code understand that this is a Deno project
// Add this to suppress TypeScript errors in Supabase Edge Functions

// @ts-nocheck
// This is a Deno Edge Function - TypeScript errors are expected in VS Code

Shared Supabase credentials

- Low-privilege or user-scoped clients use `SUPABASE_PUBLISHABLE_KEYS` through
  `_shared/supabase-public-key.ts` (the injected `default` publishable key).
- Privileged clients use `SUPABASE_SECRET_KEYS` through
  `_shared/supabase-admin-key.ts` (the injected `default` secret key).
- Do not use publishable keys as bearer tokens. Forward only a real user access
  token in `Authorization` for user-scoped clients.

RevenueCat webhook function

- Function name: `revenuecat-webhook`
- `config.toml`: `verify_jwt = false`
- Required Supabase environment:
  - `SUPABASE_URL`
  - `SUPABASE_SECRET_KEYS` (injected automatically; the `default` secret key is used)
  - optional `BETWEENER_SUPABASE_SECRET_KEY` for an explicit server-only key
  - `REVENUECAT_WEBHOOK_AUTH`
  - `REVENUECAT_SECRET_API_KEY`
- Optional secrets:
  - `REVENUECAT_V1_SECRET_API_KEY` (preferred future V1 name; falls back to `REVENUECAT_SECRET_API_KEY`)
  - `REVENUECAT_WEBHOOK_SIGNING_SECRET` (when set, HMAC becomes mandatory)
  - `REVENUECAT_WEBHOOK_SIGNATURE_TOLERANCE_SECONDS` (defaults to 300, clamped to 30-900)
  - `REVENUECAT_SILVER_PRODUCT`
  - `REVENUECAT_GOLD_PRODUCT`
  - `REVENUECAT_SYNC_SANDBOX`
  - `REVENUECAT_API_BASE`

Preferred auth:
- Set the RevenueCat webhook Authorization header to the exact value of `REVENUECAT_WEBHOOK_AUTH`.
- Keep Authorization enabled when HMAC signing is introduced.
- HMAC verification uses `X-RevenueCat-Webhook-Signature: t=<unix_timestamp>,v1=<hmac_sha256_hex>` over the exact raw bytes of `<timestamp>.<request_body>`.
- Do not set `REVENUECAT_WEBHOOK_SIGNING_SECRET` until the RevenueCat integration signing secret has been copied securely; once set, unsigned or invalid requests fail closed.

Supabase gateway fallback:
- If Supabase rejects the incoming `Authorization` header before the function runs, leave RevenueCat's Authorization header empty and append `?webhook_secret=YOUR_VALUE` to the webhook URL instead.

RevenueCat V2 economy foundation

- Future Sparks functions must use only `REVENUECAT_PROJECT_ID` and `REVENUECAT_V2_SECRET_API_KEY` through `_shared/economy-config.ts`.
- Existing subscription webhook/backfill functions remain V1 and must not read `REVENUECAT_V2_SECRET_API_KEY`.
- All economy mutations must call `rpc_service_assert_economy_feature_enabled_v1` before acting.
- Phase B performs no RevenueCat V2 currency debit or credit.

Global locality search function

- Function name: `search-global-localities`
- Required secret: `GEONAMES_USERNAME`
- Register and enable a production GeoNames web-service account; never use the `demo` account.
- The function country-filters populated places and caches canonical results in `public.global_localities`.
- Deploy after migration `20260712_02_global_localities.sql`.
