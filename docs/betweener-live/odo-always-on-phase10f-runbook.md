# Odo Always-On Quick Connect - Phase 10F runbook

Phase 10F forms temporary, system-owned Quick Connect Lives from explicit private availability. Online presence is only freshness evidence. It never opts a member in.

## Safety state at deploy

The migration defaults are inert:

- availability, invitations, session creation, Odo start, music, and automatic ending are off;
- the circuit breaker is open;
- access is internal-only;
- safety coverage is `selected_test_cohort`;
- verified users are required.

Do not enable all stages at once. Physical-device acceptance is required between stages.

## Deploy

```powershell
npx.cmd supabase@latest db push --linked
npx.cmd supabase@latest functions deploy live-odo-always-on-quick-connect
npx.cmd supabase@latest db query --linked --file supabase/verification/live_odo_phase10f_health.sql
```

The health result must finish with `release_blockers = 0` and `healthy = true`.

The Edge Function requires the existing project secrets:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `STREAM_VIDEO_API_KEY`
- `STREAM_VIDEO_API_SECRET`

Schedule a service-authenticated POST to `live-odo-always-on-quick-connect` every minute using the platform scheduler. Keep the service-role bearer in the platform secret store, never in SQL, source control, a mobile build, or a browser. The existing database maintenance clock handles expiry/detection/lifecycle; the Edge schedule handles Stream creation and provider cleanup.

## Authenticate as an internal admin

```powershell
$loginBody = @{
  email = $adminEmail
  password = $adminPassword
} | ConvertTo-Json

$authRequest = @{
  Method = 'Post'
  Uri = "$supabaseUrl/auth/v1/token?grant_type=password"
  Headers = @{ apikey = $anonKey }
  ContentType = 'application/json'
  Body = $loginBody
}

$auth = Invoke-RestMethod @authRequest
$headers = @{
  apikey = $anonKey
  Authorization = "Bearer $($auth.access_token)"
}
```

## Allowlist the closed-beta members

Repeat for each verified test account. Use an expiry for temporary access.

```powershell
$accessBody = @{
  p_user_id = 'USER_UUID'
  p_allowed = $true
  p_note = 'Phase 10F closed beta'
  p_expires_at = $null
} | ConvertTo-Json

$accessRequest = @{
  Method = 'Post'
  Uri = "$supabaseUrl/rest/v1/rpc/rpc_admin_set_live_odo_always_on_access_v1"
  Headers = $headers
  ContentType = 'application/json'
  Body = $accessBody
}

Invoke-RestMethod @accessRequest
```

The members must also be compatible under the existing Quick Connect rules and must have no block, safety hold, active Live, active Private Spark, recent-pair restriction, quiet-hours restriction, or invitation cooldown.

## Staged rollout

Use this helper for each patch:

```powershell
function Set-AlwaysOnConfiguration([hashtable]$Patch) {
  $request = @{
    Method = 'Post'
    Uri = "$supabaseUrl/rest/v1/rpc/rpc_admin_update_live_odo_always_on_v1"
    Headers = $headers
    ContentType = 'application/json'
    Body = @{ p_patch = $Patch } | ConvertTo-Json -Depth 8
  }
  Invoke-RestMethod @request
}
```

1. Shadow detection only:

```powershell
Set-AlwaysOnConfiguration @{
  availabilityEnabled = $true
  shadowDetectionEnabled = $true
  circuitBreakerOpen = $false
  internalOnly = $true
  safetyCoverageMode = 'selected_test_cohort'
  verifiedUsersOnly = $true
  allowedMarkets = @('internal')
}
```

Confirm that shadow opportunities have counts only, create no invitations, and create no Live/Stream resource.

2. Controlled invitations:

```powershell
Set-AlwaysOnConfiguration @{ invitationsEnabled = $true }
```

Confirm accept, Not now, Not tonight, withdraw, expiry, notification preference, quiet hours, and daily fatigue limits.

3. System session creation:

```powershell
Set-AlwaysOnConfiguration @{ systemSessionCreationEnabled = $true }
```

Confirm exactly one system-owned Live and one Stream call per accepted pairable opportunity. Creator user/profile IDs must remain null.

4. Odo initial control and automatic lifecycle:

```powershell
Set-AlwaysOnConfiguration @{
  odoStartEnabled = $true
  automaticEndingEnabled = $true
}
```

The existing Phase 10A-E flags for Odo, guarded autopilot, Full Quick Connect, and Show Director must already be healthy. Music remains optional and separately gated:

```powershell
Set-AlwaysOnConfiguration @{ musicEnabled = $true }
```

## Physical-device acceptance

Use at least three allowlisted, verified accounts on separate physical devices.

1. Confirm a merely online account sees no availability state and receives no invitation.
2. On two pairable accounts, choose 15 or 30 minutes in the Live lobby.
3. Confirm availability is private and expires at the displayed server deadline.
4. Confirm an invitation reveals no roster, compatibility graph, or other response.
5. Accept on one device and choose Not now on the other. Confirm no Live or Stream call starts and the cooldown cannot be bypassed.
6. Re-enable after cooldown, form another opportunity, and accept on both devices.
7. Confirm the forming screen remains private while the Stream resource is prepared.
8. Enter the new Live. Confirm camera and microphone are still off until each member chooses otherwise.
9. Confirm neither acceptance nor room entry automatically joins the Quick Connect pool. Join the pool explicitly on both devices.
10. Confirm the existing AutoMatcher creates the private round and Odo directs the public programme without choosing the pair.
11. Confirm Room Pulse remains interactive for waiting members.
12. Apply a safety hold or enter another Live during formation. Confirm launch fails closed.
13. Test an RTC creation failure. Confirm bounded retries and no second Live session.
14. Let the room become empty/low-liquidity and test maximum runtime. Active private rounds must drain before ending.
15. Confirm the Stream call ends and cleanup is acknowledged.
16. As an allowlisted internal admin, call the existing Odo takeover and resume operations. RTC, matcher, music, and Show Director state must not be rebuilt.
17. Run the health query again and retain screenshots/log IDs in the release record.

Phase 10F is not complete for production rollout until this device matrix passes. Automated checks cannot certify camera, microphone, notification delivery, background wake behavior, or provider teardown on real devices.

## Diagnostics

```powershell
npm.cmd run typecheck
npm.cmd run lint -- --max-warnings=0
npm.cmd run test:live-phase10f
npm.cmd run test:live-logic
npx.cmd expo-doctor
```

Read-safe operational SQL:

```sql
select state, shadow_only, count(*)
from public.live_quick_connect_opportunities
where created_at >= now() - interval '24 hours'
group by state, shadow_only order by state, shadow_only;

select lifecycle_state, count(*)
from public.live_odo_always_on_sessions
group by lifecycle_state order by lifecycle_state;
```

For an authorized admin/Studio service, use `rpc_get_live_odo_system_program_snapshot_v1(session_id)`. It returns aggregate programme state, not a roster, graph, ballot, prompt, transcript, or private decision.

## Emergency rollback

This atomic patch satisfies the configuration dependency constraint while stopping new formation:

```powershell
Set-AlwaysOnConfiguration @{
  musicEnabled = $false
  automaticEndingEnabled = $false
  odoStartEnabled = $false
  systemSessionCreationEnabled = $false
  invitationsEnabled = $false
  shadowDetectionEnabled = $false
  availabilityEnabled = $false
  circuitBreakerOpen = $true
}
```

Existing active system Lives enter deterministic draining through maintenance. Do not delete session, opportunity, reservation, or Stream rows manually.
