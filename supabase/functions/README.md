// This file helps VS Code understand that this is a Deno project
// Add this to suppress TypeScript errors in Supabase Edge Functions

// @ts-nocheck
// This is a Deno Edge Function - TypeScript errors are expected in VS Code

RevenueCat webhook function

- Function name: `revenuecat-webhook`
- `config.toml`: `verify_jwt = false`
- Required secrets:
  - `SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `REVENUECAT_WEBHOOK_AUTH`
  - `REVENUECAT_SECRET_API_KEY`
- Optional secrets:
  - `REVENUECAT_SILVER_ENTITLEMENT`
  - `REVENUECAT_GOLD_ENTITLEMENT`
  - `REVENUECAT_SILVER_PRODUCT`
  - `REVENUECAT_GOLD_PRODUCT`
  - `REVENUECAT_SYNC_SANDBOX`
  - `REVENUECAT_API_BASE`

Preferred auth:
- Set the RevenueCat webhook Authorization header to the exact value of `REVENUECAT_WEBHOOK_AUTH`.

Supabase gateway fallback:
- If Supabase rejects the incoming `Authorization` header before the function runs, leave RevenueCat's Authorization header empty and append `?webhook_secret=YOUR_VALUE` to the webhook URL instead.
