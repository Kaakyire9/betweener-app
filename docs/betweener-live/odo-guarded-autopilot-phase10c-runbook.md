# Odo Guarded Autopilot — Phase 10C

## 10B → 10C audit

1. **Ready systems:** Phase 10B already provides Host capability checks, safe
   context construction, Luna-first routing, Content Gate validation,
   deterministic fallback, short database transactions around inference,
   immutable action IDs, fresh-state Host-use checks, ordered Director events,
   Realtime invalidation, cost telemetry, and immediate lease fencing.
2. **10B blocker:** none. The broad Phase 10A action vocabulary is unsuitable
   for automatic execution, so 10C uses a separate policy path and does not
   loosen it.
3. **State:** `direction_mode=autopilot` plus
   `autopilot_state=starting|active|paused_by_host|paused_by_policy`. Per-session
   settings and pacing state live in `live_odo_guarded_autopilot_settings`.
4. **Risk tiers:** Tier 0 has no visible effect, Tier 1 changes presentation,
   Tier 2 changes bounded engagement, and Tier 3 changes product truth.
5. **Automatic whitelist:** `NO_ACTION`, `WAIT`, `SESSION_NARRATION`,
   `ANNOUNCE_EXISTING_PAIR`, `REQUEST_SCENE`, `SHOW_CONVERSATION_SPARK`,
   `SHOW_AUDIENCE_PULSE`, `SHOW_INTERMISSION`, `TIME_CUE`, and
   `TRANSITION_COPY`.
6. **Human/deterministic only:** pool control, pair selection/creation, round
   transitions, stage/participant movement, moderation, consent, Private
   Spark, match creation, RTC/token operations, recording, session start/end,
   and all unknown actions.
7. **Director loop:** authoritative database transitions enqueue content-free,
   idempotent events. A Realtime invalidation wakes one Host-authorized Edge
   worker. No repeating AI poll is used.
8. **Throttling:** server-configured visible-action density, narration pacing,
   scene dwell/suppression, Spark-per-round, Pulse cooldown, and event TTLs are
   rechecked in the execution transaction.
9. **Scenes:** only predefined scene keys are accepted. The state trigger marks
   non-Odo scene changes as Host overrides and starts a suppression window.
10. **Narration:** the event identifies an already-authorized pair; safe context
    is generated server-side; Luna may draft short copy; Content Gate or a
    deterministic message is used before the fresh execution gate.
11. **Conversation Spark:** an active existing hosted round may receive one
    bounded, grounded Spark after the configured introduction delay.
12. **Audience Pulse:** the server selects an enabled template; sufficient
    audience, no active poll, cooldown, and per-session flags are mandatory.
13. **Intermission/Odo stage:** presentation-only events may select `odo_stage`
    or `music_intermission_visual_only`; no audio or music control is exposed.
14. **Take Control:** the existing Host RPC is extended to disable the session,
    increment the lease generation, clear the lease, reject pending work, and
    preserve matcher/RTC truth.
15. **Resume:** Host authorization and rollout are rechecked, stale work is
    invalidated, state becomes `starting`, and a fresh server event activates it.
16. **Safety pause:** the service-only policy RPC also rejects pending 10C work;
    only a Host can request a later resume.
17. **Degraded mode:** budget/provider failures select deterministic content or
    `WAIT`/`NO_ACTION`; Live, AutoMatcher, and RTC continue independently.
18. **Budgets:** existing call/token budgets remain authoritative, with an
    additional rolling automatic-intervention ceiling and feature cooldowns.
19. **Lease:** Odo acquires a short lease when claiming an event. The action
    persists its generation/version/TTL; the execute transaction revalidates all
    four before mutation.
20. **Studio:** status, event, scene, and last-action projections are
    presentation-independent and use the existing ordered Director protocol.
21. **Server changes:** one additive migration, one narrow Edge worker, three
    Host RPCs (enable/resume/takeover or clock signal), and service-only
    claim/complete/fail RPCs.
22. **Mobile changes:** guarded-autopilot contracts/validation/hook, repository
    methods, compact Studio controls, and participant-safe event rendering.
23. **Security/privacy:** queue rows and action envelopes are never client
    writable; no raw ballots, consent, private audio/video, or unrestricted
    profile text enter Realtime or action payloads.
24. **Testing:** SQL policy tests, static boundary regression tests, domain and
    Content Gate tests, provider/timeout/fencing cases, and full Live regression.
25. **Slices:** state/control → policy/queue → worker/narration → scenes → Spark
    and Pulse → intermission/time cues → takeover/degraded mode → health/QA.

## Rollout

The migration ships every global automatic flag disabled and keeps
`full_autopilot_enabled=false`. Enable only for an allowlisted internal Host,
then explicitly enable it for each Live session in Studio.

Required deployment order:

1. Apply all Phase 10C migrations (`120000` through `130000`). The `130000`
   runtime reconciliation migration is required: it wakes already-live rooms,
   projects the current authoritative stage into a safe predefined scene, and
   queues `pair_forming` when a Hosted Match Night introduction begins.
2. Deploy `live-odo-autopilot`.
3. Deploy the mobile build.
4. Configure the internal Host allowlist and guarded global flags.
5. Run `live_odo_phase10c_health.sql`; require zero blockers.
6. Validate Take Control, reconnect, network switching, Quick Connect RTC,
   automatic scenes, Spark, Pulse, and reduced motion on physical iPhone and
   Android before expanding rollout.

Commands from the linked project root:

```powershell
npx.cmd supabase@latest db push --linked
npx.cmd supabase@latest functions deploy live-odo-autopilot
npx.cmd supabase@latest db query --linked --file supabase/verification/live_odo_phase10c_health.sql
```

The Edge Function uses the platform-provided Supabase secrets plus the existing
`OPENAI_API_KEY`. `ODO_LUNA_MODEL` remains optional and uses the existing router
default when absent.

With a fresh authenticated admin access token in `$headers`, allowlist the
specific Host user UUID first:

```powershell
$allowlistBody = @{
  p_user_id = '<HOST_AUTH_USER_UUID>'
  p_allowed = $true
  p_note = 'Phase 10C internal Host'
} | ConvertTo-Json

Invoke-RestMethod -Method Post `
  -Uri "$supabaseUrl/rest/v1/rpc/rpc_admin_set_live_odo_guarded_host_access_v1" `
  -Headers $headers -ContentType 'application/json' -Body $allowlistBody
```

Then enable only the guarded presentation features intended for the internal
rollout. Audience Pulse starts disabled deliberately:

```powershell
$rolloutBody = @{
  p_patch = @{
    guardedAutopilotEnabled = $true
    autoNarrationEnabled = $true
    autoSceneEnabled = $true
    autoSparkEnabled = $true
    autoAudiencePulseEnabled = $false
    autoIntermissionEnabled = $true
    internalOnly = $true
  }
} | ConvertTo-Json -Depth 5

Invoke-RestMethod -Method Post `
  -Uri "$supabaseUrl/rest/v1/rpc/rpc_admin_update_live_odo_guarded_autopilot_v1" `
  -Headers $headers -ContentType 'application/json' -Body $rolloutBody
```

Keep the Phase 10B base flags `odoEnabled=true`, `shadowMode=true`, and the
required feature flags enabled. Keep legacy `autopilotEnabled=false`,
`fullAutopilotEnabled=false`, and `musicEnabled=false`. Finally, the Host must
open the Odo tab and intentionally select **Enable Guarded Autopilot** for each
active Live session. Global rollout flags alone never activate a session.

If Safety pauses Odo, the Safety service must call
`rpc_service_clear_live_odo_policy_pause_v1` before the Host can choose
**Resume Odo**. Clearance leaves the room in manual Host control and never
reactivates Odo automatically.

## Rollback

Set `guardedAutopilotEnabled=false` or `circuitBreakerOpen=true`. Existing
active sessions fail closed on their next claim; for an immediate per-session
stop, press **Take Control**. These operations do not end the session, alter a
pair, or disconnect RTC.
