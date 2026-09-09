# Odo Copilot Phase 10B rollout

Phase 10B is Host-controlled. Odo can prepare private suggestions, but only an
authenticated Host can publish one by selecting **Use**. Autopilot and music
remain disabled. The existing `OPENAI_API_KEY` secret is reused by the new Edge
Function; do not create or expose a client-side key.

## Deploy

Run from the repository root against the already linked Supabase project:

```powershell
npx.cmd supabase@latest db push --linked --dry-run
npx.cmd supabase@latest db push --linked
npx.cmd supabase@latest functions deploy live-odo-copilot --use-api
npx.cmd supabase@latest functions list
```

The `20260908110000` completion migration is required after the original 10B
migration. Redeploy `live-odo-copilot` because task-specific generation rules
are bundled into the function. Ship the accompanying app changes through the
normal mobile release/OTA lane before enabling a 10B subfeature for users.

Do not enable Copilot in the same deployment. The migration adds every new
feature flag as `false`.

## Verify the disabled baseline

```powershell
npx.cmd supabase@latest db query --linked --file supabase/verification/live_odo_phase10b_health.sql
npx.cmd supabase@latest db query --linked --file supabase/verification/live_odo_phase10a_health.sql
npx.cmd supabase@latest db query --linked --file supabase/verification/v1.1.1_production_health.sql
```

All three final gates must report `release_blockers = 0` and `healthy = true`.
The 10B configuration result must keep `autopilot_enabled = false` and
`music_enabled = false`.

## Controlled enablement

Use an authenticated admin access token. Start with Conversation Spark only,
using the already-configured Odo pricing map:

```powershell
$headers = @{
  apikey = $anonKey
  Authorization = "Bearer $accessToken"
}

$body = @{
  p_patch = @{
    odoEnabled = $true
    copilotEnabled = $true
    conversationSparkEnabled = $true
    audiencePulseEnabled = $false
    pairNarrationEnabled = $false
    sceneSuggestionsEnabled = $false
    transitionCopyEnabled = $false
    circuitBreakerOpen = $false
  }
} | ConvertTo-Json -Depth 6

Invoke-RestMethod `
  -Method Post `
  -Uri "$supabaseUrl/rest/v1/rpc/rpc_admin_update_live_odo_configuration_v1" `
  -Headers $headers `
  -ContentType "application/json" `
  -Body $body
```

Enable one additional subfeature per observation window. Welcome and closing
copy share the `transitionCopyEnabled` gate. Never set `autopilotEnabled` or
`musicEnabled` during Phase 10B.

## Host smoke test

On a physical iOS device and a physical Android device:

1. Join a live room as its Host and open Live Studio → Odo. A new session must
   initialize without a manual Odo call or `live_odo_state_missing` error.
2. Request one enabled suggestion. Confirm no participant sees it yet.
3. Select **Another**, then **Dismiss**, and confirm neither publishes anything.
4. Request again and select **Use**. Confirm the expected existing projection
   or Host-authored Director event reaches participants exactly once.
5. Let one suggestion expire and change the round/state before using another;
   both uses must be rejected as stale.
6. Repeat with weak connectivity and a provider timeout. A deterministic
   fallback may appear, but there must be no retry or model escalation.
7. Confirm a non-Host cannot read, request, dismiss, regenerate, or use private
   suggestions.
8. With three people on stage, request **Scene**. Confirm Odo offers a different
   predefined scene, then select **Switch** and verify the deterministic stage
   layout changes for the Host and participants.
9. Request **Scene** again when no useful transition exists. Confirm the Host
   sees a clear "no change recommended" message rather than an empty panel.

Then rerun the 10B and 1.1.1 health checks. Inspect aggregates only; do not copy
member context or generated payloads into operational logs. The 10A check is a
shadow-only baseline and is expected to report a configuration blocker while
Copilot is enabled; run it again only after disabling every 10B subfeature.

## Emergency pause

This disables all Copilot surfaces and prevents new calls/uses immediately:

```powershell
$body = @{
  p_patch = @{
    copilotEnabled = $false
    conversationSparkEnabled = $false
    audiencePulseEnabled = $false
    pairNarrationEnabled = $false
    sceneSuggestionsEnabled = $false
    transitionCopyEnabled = $false
    circuitBreakerOpen = $true
  }
} | ConvertTo-Json -Depth 6

Invoke-RestMethod `
  -Method Post `
  -Uri "$supabaseUrl/rest/v1/rpc/rpc_admin_update_live_odo_configuration_v1" `
  -Headers $headers `
  -ContentType "application/json" `
  -Body $body
```

Rerun the 10B and 1.1.1 health checks after the pause. The circuit breaker is
reported as operational state; the Host-controlled/autopilot invariants and
all release-blocker counts must remain healthy.
