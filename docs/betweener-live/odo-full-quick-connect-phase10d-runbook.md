# Odo Full Quick Connect Autopilot — Phase 10D

## Boundary

Phase 10D gives Odo bounded authority over the Quick Connect segment only.
The existing deterministic AutoMatcher remains the sole authority for who is
eligible and who is paired. Odo may open the pool, wake the matcher, observe
authoritative pairs and rounds, pace private presentation, drain current
connections, and close Quick Connect. It cannot choose participant IDs, read
private decisions, issue RTC credentials, move people on stage, moderate,
create a Match Night match, start/end the Live session, or control music.

The global `full_quick_connect_autopilot_enabled` flag is intentionally
separate from `full_autopilot_enabled`. The latter remains disabled until a
future full-show phase.

## Runtime model

1. The Host explicitly selects **Start Full Quick Connect** in Live Studio.
2. The Host RPC creates durable `preparing` state but does not open the pool.
3. The authenticated Edge wake calls the service-only reconciler.
4. The reconciler acquires a short fenced lease and opens the existing Quick
   Connect control.
5. `live_quick_connect_sync` remains the only matching/lifecycle engine. Odo
   never supplies either member of a pair.
6. Realtime invalidations plus a persisted one-shot `nextWakeAt` drive future
   reconciliation. No always-running mobile timer or AI poll is required.
7. A pair may receive one short private Odo Spark. It is stored on the pairing
   and returned only by the existing pair-participant projection.
8. **Finish Current Connections** changes Quick Connect to `draining`. Active
   pairs finish; no new pair is formed. Odo then closes the segment while the
   Live session remains `live`.
9. **Take Control** immediately fences future work and preserves the current
   Quick Connect control, pair, RTC call, and Live session.

Presentation work still uses the Phase 10C guarded worker. If that worker is
unavailable, matching and round closure continue deterministically and the
Host receives degraded status rather than a broken Live room.

## Deployment

From the linked project root:

```powershell
npx.cmd supabase@latest db push --linked
npx.cmd supabase@latest functions deploy live-odo-autopilot
npx.cmd supabase@latest functions deploy live-odo-full-quick-connect
npx.cmd supabase@latest db query --linked --file supabase/verification/live_odo_phase10d_health.sql
```

Deploy the mobile build only after both migrations and both Edge Functions are
available. The new worker uses the platform Supabase secrets; the existing
presentation worker continues to use `OPENAI_API_KEY` and optional Odo model
overrides.

The health query is read-only. Require `release_blockers = 0` and
`healthy = true` before and after configuration changes.

## Internal rollout configuration

Use a fresh access token for an app admin user. This is the user’s Betweener
Supabase Auth password, not the database password or Supabase Dashboard login.
Never paste an access token, secret key, or password into source control or a
support message.

The Host must already be on the Phase 10C internal allowlist:

```powershell
$allowlistBody = @{
  p_user_id = '<HOST_AUTH_USER_UUID>'
  p_allowed = $true
  p_note = 'Phase 10D internal Host'
} | ConvertTo-Json

$allowlistRequest = @{
  Method = 'Post'
  Uri = "$supabaseUrl/rest/v1/rpc/rpc_admin_set_live_odo_guarded_host_access_v1"
  Headers = $headers
  ContentType = 'application/json'
  Body = $allowlistBody
}

Invoke-RestMethod @allowlistRequest
```

Then enable the separate 10D rollout flag:

```powershell
$fullQuickBody = @{
  p_patch = @{
    fullQuickConnectAutopilotEnabled = $true
    internalOnly = $true
    lowLiquiditySeconds = 45
    maximumRuntimeMinutes = 90
    reconcileSeconds = 15
  }
} | ConvertTo-Json -Depth 5

$fullQuickRequest = @{
  Method = 'Post'
  Uri = "$supabaseUrl/rest/v1/rpc/rpc_admin_update_live_odo_full_quick_connect_v1"
  Headers = $headers
  ContentType = 'application/json'
  Body = $fullQuickBody
}

Invoke-RestMethod @fullQuickRequest
```

Keep the required Phase 10C base configuration enabled:
`odoEnabled=true`, `guardedAutopilotEnabled=true`, and the selected guarded
presentation flags. Keep `fullAutopilotEnabled=false`,
`autopilotEnabled=false`, and `musicEnabled=false`.

Global rollout does not activate a room. Create or open a Live session with
the **Quick Connect** format, open Live Studio → Odo, and explicitly select
**Start Full Quick Connect**.

## Physical-device test script

Use a current mobile build that contains Phase 10D on every test device. The
minimum useful setup is three accounts: one allowlisted Host and two eligible
guests. Four guests are recommended when validating repeated rotations.

1. Create a new Live with the **Quick Connect** format and start the Live.
   Do not use Match Night. **Open to introductions** is a Match Night setting
   and does not enroll a guest in the Quick Connect pool.
2. Before opening the rotation, the Host opens Live Studio → Rotation, selects
   a **3 min** conversation and **1** simultaneous conversation, and leaves the
   rotation closed. Three minutes leaves enough time to observe both the Odo
   Spark and the one-minute time cue.
3. The Host opens Live Studio → Odo and selects **Start Full Quick Connect**,
   then confirms **Start Odo**. Expect the Odo status to move from `READY` to
   `RUNNING` and the existing Quick Connect control to open automatically.
4. On each guest account, select **Join pool**, choose a private connection
   intention, then select **Confirm & join**. Both guests must remain connected
   and eligible.
5. On the Host Odo card, expect `Pool` to reach at least 2 and `Eligible pairs`
   to reach at least 1. The existing deterministic AutoMatcher must create the
   pair; Odo must never ask the Host to choose participant identities.
6. Both paired guests should enter the same private Quick Connect round. The
   Host and unpaired members remain in the main Live and must not see private
   round content or private choices.
7. After the configured Spark delay (45 seconds in the recommended rollout),
   both members of the active pair should see one pair-scoped Odo Spark. The
   Host and main room must not see the Spark body. A round needs more than 90
   seconds remaining when it starts for this Spark to be eligible.
8. At approximately one minute remaining, verify that the pair receives the
   time cue once. Let the authoritative round timer finish, complete the normal
   private outcome flow, and verify that both guests return to the Live.
9. With four guests, keep eligible guests opted in and confirm that another
   legal pair forms without a Host action. A completed pair must not be
   duplicated by an Odo wake or app refresh.
10. Run the low-liquidity case with only one eligible pool member. After the
    configured 45 seconds, expect calm waiting status and no forced pair,
    identity disclosure, or rejection disclosure.
11. During an active pair, select **Take Control**. The current private call
    must remain connected, but Odo must stop scheduling future work. Select
    **Resume Odo** and confirm reconciliation does not create a duplicate pair,
    timer, or notice.
12. During another active pair, select **Finish Current Connections**. The
    current pair must finish normally, no new pair may form, Quick Connect must
    close, and the parent Live must remain live.
13. While Odo is running, background and foreground the Host app and switch
    networks once. The restored Odo card and Quick Connect surfaces must show
    the authoritative current state without duplicating actions.
14. End the test and rerun the Phase 10D production health query. Require
    `release_blockers = 0` and `healthy = true`.

## Physical-device acceptance

Validate on current physical iPhone and Android builds:

- An allowlisted Host sees 10D only in a live Quick Connect room.
- Starting 10D opens the Quick Connect pool without another Host action.
- Two eligible, opted-in, connected members are paired by the existing
  AutoMatcher; Odo never exposes or accepts participant selection.
- The pair can connect, reconnect, complete the round, submit private outcomes,
  and return through the existing Quick Connect flow.
- A pair-scoped Odo Spark is visible only inside that pair’s private round.
- Low liquidity shows calm public status without revealing who is waiting.
- Network switching and an app background/foreground cycle recover from the
  durable snapshot and do not create duplicate pairs or actions.
- **Take Control** stops future Odo work immediately without disconnecting the
  active pair or ending Live.
- **Resume Full Quick Connect** requires a deliberate Host tap.
- **Finish Current Connections** permits active pairs to finish, prevents new
  pairs, closes Quick Connect, and leaves the main Live session running.
- Reduced motion, VoiceOver/TalkBack labels, safe areas, and Dynamic Type remain
  usable in Host and participant surfaces.

Also run:

```powershell
npm.cmd run test:live-phase10d
npm.cmd run typecheck
npx.cmd supabase test db supabase/tests/live_odo_phase10d.sql
npx.cmd supabase@latest db query --linked --file supabase/verification/live_odo_phase10d_health.sql
```

## Monitoring

Monitor the content-free groups in the health query:

- lifecycle/orchestration state versus Quick Connect control state;
- stale `next_wake_at` values and expired leases;
- action counts by type/reason/status;
- allowlist drift;
- private Spark content appearing in Director events (must remain zero);
- any 10D session that changes the parent Live status (must remain zero).

The action ledger contains IDs, versions, counts, action types, and reason
codes. It must not contain private decisions, prompts, transcript/audio/video,
or unrestricted profile text.

## Safety and rollback

For a single room, select **Take Control**. This is immediate and preserves the
current pair.

For a global emergency pause, set `circuitBreakerOpen=true` through the existing
Odo admin configuration RPC. The next wake moves active 10D rooms to
`paused_by_policy`, disables presentation Autopilot, clears the lease, and
returns control to the Host. Safety must call
`rpc_service_clear_live_odo_policy_pause_v1`; the Host must then explicitly
select **Resume Full Quick Connect**.

For a staged rollback without opening the global circuit breaker:

```powershell
$rollbackBody = @{
  p_patch = @{
    fullQuickConnectAutopilotEnabled = $false
  }
} | ConvertTo-Json -Depth 4

$rollbackRequest = @{
  Method = 'Post'
  Uri = "$supabaseUrl/rest/v1/rpc/rpc_admin_update_live_odo_full_quick_connect_v1"
  Headers = $headers
  ContentType = 'application/json'
  Body = $rollbackBody
}

Invoke-RestMethod @rollbackRequest
```

Disabling the global flag fences a running session on its next wake. Use
**Take Control** first when an immediate per-room stop is required. Neither
path ends Live, selects a pair, changes private outcomes, or controls RTC.
