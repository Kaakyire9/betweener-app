# M2 local voice implementation

2026-10-28. **Local voice orchestration and development preview delivered.**
The approved Stream configuration is applied in staging app 1731011. Ordinary-user
coordinator checks pass; corrected SFU probes prove voice video/screenshare denial.
Integrated consent verification reproduces a held-token bypass during provider-end
failure, keeping M2A blocked. Synthetic audio transports and isolated fixtures were
executed and cleaned up. [Document 16](16-connect-v1-m2a-security-closure.md) gives
the current security result and exact additional file inventory.
No application voice call, deployment, build or device test was performed.
This is not an end-to-end calling release.

```text
CONNECT_M2_STREAM_SECURITY = FAIL
CONNECT_M2_VOICE_DOMAIN = PASS
CONNECT_M2_CALL_LIFECYCLE = PASS
CONNECT_M2_VOICE_UI = CONDITIONAL_PASS
CONNECT_M2_AUDIO_ROUTING = NOT_TESTED
CONNECT_M2_IN_APP_RINGING = NOT_TESTED
CONNECT_M2_DEVICE_VALIDATION = BLOCKED
CONNECT_M2_LIVE_ISOLATION = PASS
CONNECT_M3_READY = BLOCKED
```

Domain/lifecycle PASS applies to local automated contracts, including real database
authorization/concurrency. UI CONDITIONAL_PASS covers RN rendering/interactions
and an isolated development preview. It does not certify media, device audio,
OS delivery or reliable app-wide ringing. See [M2A evidence](13-connect-v1-m2-security-validation.md)
and [device plan](15-connect-v1-m2-device-test-plan.md).

## M2 brief revalidation

The reissued M2 brief was reviewed against the existing M0/M1 migrations, RPCs,
adapter, voice modules and retained real-provider evidence. The development
controller, screens and injectable transport already implement the independent
local work; no duplicate call flow was added. A fresh read-only check again
verified app **1731011 / Betweener Staging**, enabled auth/permission checks,
exact Connect policy and unchanged complete type hash. No new provider fixtures
or calls were created. The earlier real SFU/consent receipts remain the provider
test evidence; local reruns do not count as new provider executions.

`CONNECT_M2_STREAM_SECURITY = FAIL` records the demonstrated consent bypass during
provider-end failure. M2A/M2B and device calling stay blocked under the brief's
explicit exit gate. Auth-owned native bindings, an app-wide foreground host,
physical audio routing and two-device execution remain uninstalled/unexecuted.
No EAS build or deployment was attempted.

The review found and repaired a local cleanup acknowledgement bug. Postgres
`rpc_connect_complete_job` returns **false** for a stale lease even when the RPC
request itself succeeds. Both Edge completion callbacks had discarded that
value. They now require literal **true**, so rejected/malformed acknowledgements
cannot report successful processing or completed revocation cleanup. The fixture
bridge applies the same guard to its actual SQL acknowledgement. Provider-end
failure still leaves cleanup pending; this reporting fix cannot close the
separate remote-admission window.

This review modified `supabase/functions/_shared/connect-provider-worker.ts`,
`supabase/functions/connect-provider-worker/index.ts`,
`supabase/functions/connect-revoke-consent/index.ts`,
`scripts/lib/connect-stream-closure-worker.ts`, `scripts/test-connect-revocation.cjs`
and `__tests__/connect-consent-revocation.regression.test.ts`, plus reports 10,
13–16 and [the revalidation receipt](local-m2-revalidation.json). No migration,
native package, Live implementation, shared feature flag or hosting file changed.

Fresh local verification: **82/82** Connect tests, **7/7** UI tests, **15 ACL +
67 integration** cases, **20** revocation database cases/four races, **88** M0
assertions/six races/four HTTP attacks, **91/91** selected baseline, chat
**234/234**, Intent **2/2**. Live remains **504/508** with the same four locations
and `ERR_ASSERTION`/`match` signatures. TypeScript, strict Deno for all four Edge
entrypoints, targeted lint and three isolation checks pass. New actual SQL cases
prove stale completion false is rejected and the owner completion true is accepted.
Disposable DB/REST resources were removed; shared M0/M1/M2A objects and migration
ledger entries remain absent. Full details and log paths are in the receipt.

Rollback of this review is confined to the acknowledgement guard and its two Edge
callbacks/test bridge. Removing the guard restores the former false-success risk;
it does not change consent authority. Keep M0/M1, pending cleanup work and the M2A
gate intact. No external rollback is needed because nothing was deployed.

## New and modified files

| File | Change |
| --- | --- |
| `features/connect/voice/voice-types.ts` | Typed voice API, credential, audio route, permission and presentation contracts |
| `features/connect/voice/voice-controller.ts` | Single-owner orchestration, incoming hints, start/accept/decline/cancel/end, mute/routes, polling, deadlines, recovery and logout cleanup |
| `features/connect/media/stream-voice-transport.ts` | Injectable existing-call/lease adapter; capture cleanup, no camera enable, no client creation, refresh identity checks and retired-call rejection |
| `features/connect/media/microphone-permission.ts` | Contextual permission resolution with denied/permanently-denied outcomes |
| `features/connect/media/native-microphone-permission.ts` | Existing Expo Audio permission APIs; no recording/audio-session start |
| `features/connect/data/voice-service.ts` | Existing M1 RPC transport plus authenticated credential invocation/validation; inert until called |
| `features/connect/components/VoiceCallScreen.tsx` | Outgoing/incoming/active/reconnecting/terminal UI, avatar/name, honest connected duration and Settings guidance |
| `features/connect/components/VoiceCallControls.tsx` | Accessible answer/decline/mute/output/end controls; outputs only from transport capabilities |
| `features/connect/voice/voice-preview.ts` | Isolated fake API/media fixture with unique IDs, no provider/native capture |
| `app/connect/voice-preview.tsx` | `__DEV__` preview route and lab controls; production redirects away; effect replay-safe ownership |
| `scripts/audit-connect-stream.ts` | Read-only real staging provider metadata/config audit, sanitized output only |
| `scripts/configure-connect-stream-staging.ts` | Approved scoped role/type provisioning, before/after isolation hashes and readback |
| `scripts/test-connect-stream-staging.ts` | Ordinary-user coordinator probes, optional direct SFU probe and exact fixture cleanup |
| `scripts/lib/connect-stream-audit.ts`, `connect-stream-sfu-probe.cjs`, `connect-stream-verdict.ts` | Secret-safe staging guard, synthetic media signaling and fail-closed evidence review |
| `supabase/functions/_shared/connect-stream-adapter.ts` | Actual `call_member` ID, app/global checks, normalized empty-role readback, valid video overrides and token issue-time tolerance with fixed expiry |
| `supabase/functions/_shared/connect-edge.ts` | Explicit `CONNECT_STREAM_APP_ID` binding |
| `supabase/functions/connect-credentials/index.ts` | Includes server-derived media in credential response for voice-only validation |
| `__tests__/connect-foundation.regression.test.ts` | 21 foundation cases including app checks, provider readback, valid disabled-video settings and exact token expiry |
| `__tests__/connect-stream-evidence.regression.test.ts` | Four offline evidence-review regressions; these do not claim new provider executions |
| `__tests__/connect-voice.regression.test.ts` | Voice/controller/permission/transport adversarial and lifecycle tests |
| `__tests__/connect-voice.interaction.test.tsx` | RN controls and integrated preview/controller interactions |
| `scripts/test-connect-security.cjs` | Retains M1 cases; adds a real accept/cancel race and ACTIVE-call blocking/cleanup |
| Documents 10, 12–15, `stream-staging-connect-proposal.json`, `stream-staging-connect-validation.json` | Frozen approval proposal, applied configuration receipt, actual responses, current gates and device plan |

No M0 source/migration, existing Live/Quick Connect/Odo/chat/Intent/Auth/push/native
implementation, package manifest, dependency lockfile, app environment file or
hosting file was modified. M1's database migration remains unchanged. No new M2
migration is needed for this local boundary work.

## Orchestration and consent

The controller receives authenticated identity, the existing M1 API, a permission
resolver, peer-presentation resolver and a leased transport through narrow ports.
It does not authorize calls from UI flags, accepted match labels or sender preferences.
M1 remains the sole source of relationship/consent eligibility, UUIDs, occupancy,
versions, grant direction/media, account/block checks and terminal outcomes.

Start requests microphone access before sending a call command. Repeated taps
share one promise; an ambiguous failure retains its idempotency key. A late create
response after cancel/logout is terminated on the server without joining audio.
Incoming history/events are hints: re-read the participant-scoped canonical session
before rendering an invitation. Accept rechecks permission and uses the current
version/device. A competing-device response dismisses local UI without ending the
winning device's call. Cancel/accept conflicts reload once and end the winning
state safely. Ending always stops local capture before network cleanup.

Matched and pre-match voice requests use the existing proof/grant contracts.
No broad Intent UI change was made. The voice transport validates media, user,
API key, call type/CID and expiration on initial credentials and refresh. It joins
with `create:false` only, disables camera/capture before joining, never enables a
camera and retires the call ID after leave. A subsequent session requires a new
server ID. No WebRTC package, singleton, Firebase handler or push bootstrap was added.

**The real Auth-owned Stream lease/token-provider factory is deliberately not
installed while M2A is blocked.** Live currently retains its first call-scoped
token provider. Supplying that provider to Connect would violate the audited
refresh model. The injected adapter is tested with fakes; it does not pretend that
Live's current singleton has already been refactored. No second native client or
provider competes with Live.

## Lifecycle, microphone and foreground behavior

RINGING and CONNECTING are distinct. A joined local SDK state alone cannot render
ACTIVE: the canonical server session must also be ACTIVE. Connected duration uses
server connection evidence and never starts from an invitation acceptance. Remote
terminal state stops capture; stale snapshots/events cannot revive presentation.
SDK reconnect/migration states drive RECONNECTING without creating another call
or implementing a second RTC retry engine. Recovery is bounded to 30 seconds;
server setup/ringing deadlines also bound local UI when polling is offline.

Foreground invitation polling is five seconds; an owned call refreshes every two
seconds, with overlap guards. These use existing participant-only M1 APIs and stay
within their initial read limits. No always-mounted real incoming host is installed
in the app before the provider gate. M2's NOT_TESTED ringing declaration reflects
that missing runtime integration, not just missing push support.

Permission handling distinguishes granted, denied and permanently denied; Settings
is offered for the latter. Expo Audio is used only to resolve microphone permission.
Audio devices are capability-driven ports: earpiece/speaker/Bluetooth/wired controls
appear only when reported. The actual SDK audio-device binding and hardware behavior
remain unvalidated. The installed SDK exposes native device IDs via
`callManager.audioDevices`; a future real binding must preserve those identities
and test route/focus changes rather than assume a speaker toggle covers Bluetooth.

Background/inactive preview transitions mute publishing and never automatically
restart the microphone on return. Background polling pauses. This is a conservative
local policy, not a claim of background/locked-call reliability. Native audio focus,
phone interruptions, lock screen and physical Bluetooth routing remain NOT_TESTED.
Logout/unmount fences asynchronous work, unsubscribes/releases transport leases
and best-effort cancels/ends the owned server call. If offline, the existing server
deadline/worker remains responsible for remote cleanup; no instantaneous network
termination guarantee is claimed.

## Development preview

Open `/connect/voice-preview` through the current local Metro development app.
It imports only fake API/audio data. It does not import the real voice service,
load Stream native modules, access credentials, query real profiles or capture a
microphone. Production rejects the route. Lab controls simulate outgoing/incoming,
peer answer, confirmed media, reconnect/recovery, remote hang-up and permission
denial. The participant UI uses Betweener theme tokens/Manrope, static teal/violet
treatment and accessible controls; no final Aura animation or video work was added.

The route is prepared and its screen/controller interactions are tested in Jest.
No actual on-device route session or visual/device PASS is asserted.

## Validation

| Check | Actual result |
| --- | --- |
| Original M1 foundation tests + provider compatibility/identity guards | **21/21 PASS** |
| Offline provider evidence-review regressions | **4/4 PASS**; generic SFU/invalid-token errors cannot become authorization PASS |
| M2A revocation/policy and closure-review tests | **21/21 PASS**, total Connect tests **82/82** after acknowledgement hardening |
| New voice/permission/transport/controller tests | **36/36 PASS**, controlled fakes |
| New RN UI/controller interaction tests | **7/7 PASS** |
| M1 ACL/RLS assertions | **15/15 PASS**, local database |
| Connect integration | **67/67 PASS**, includes six true separate-connection races and six loopback HTTP attacks |
| M0 relationship assertions with Connect installed | **88/88 PASS** |
| Original selected regression baseline | **91/91 PASS** |
| Chat / suggested Intent logic | **234/234**, **2/2 PASS** |
| Full Live suite | **504/508**, same four baseline failures; locations and assertion operators compared |
| App TypeScript / strict Edge Deno / targeted lint | PASS |
| Live, EAS and Android isolation checks | PASS, local configuration only |
| Actual provider configuration | Approved roles/type applied and read back; existing seven types unchanged |
| A–J ordinary-user Stream matrix | **34 requests**, including accepted permission-request events with unchanged capabilities; see document 16 |
| Actual SFU transport | Two connected synthetic audio publishers; video/screenshare explicitly denied; strict outage revocation FAIL |
| Native routing, heard audio, two-device calling | **NOT_TESTED / BLOCKED** |

The first cold UI test run timed out at the repository's five-second per-test
limit while compilation/checks were running. An unchanged rerun passed all seven;
the timeout was not increased and no assertion was weakened.

The existing failures remain the same `ERR_ASSERTION` / `match` failures:
`live-auth-recovery.regression.test.ts:121`, `live-fullscreen-stage.regression.test.ts:229`,
`live-phase10g-studio-database.regression.test.ts:271` and `live-room-safety.regression.test.ts:96`.
No unrelated Live test or implementation was edited to change these outcomes.
Logs are under ignored `tmp/connect-m2/`; Edge check copies remain in `tmp/connect-m1/edge/`.

Key commands:

```powershell
node --no-warnings=MODULE_TYPELESS_PACKAGE_JSON --experimental-strip-types --test __tests__/connect-foundation.regression.test.ts __tests__/connect-voice.regression.test.ts __tests__/connect-stream-evidence.regression.test.ts __tests__/connect-consent-revocation.regression.test.ts __tests__/connect-security-closure.regression.test.ts
node --no-deprecation ./node_modules/jest/bin/jest.js --runInBand --config jest.config.js __tests__/connect-voice.interaction.test.tsx
node scripts/test-connect-security.cjs
node scripts/test-connect-revocation.cjs
node scripts/test-relationship-security.cjs
node scripts/prepare-connect-edge-check.cjs
npm.cmd exec --yes --package=deno@2.5.4 -- deno check --no-lock --config tmp/connect-m1/edge/deno.json tmp/connect-m1/edge/connect-credentials/index.ts tmp/connect-m1/edge/connect-provider-worker/index.ts tmp/connect-m1/edge/connect-revoke-consent/index.ts tmp/connect-m1/edge/connect-webhook/index.ts
npm.cmd run typecheck
npm.cmd run test:chat-logic
npm.cmd run test:intent-logic
npm.cmd run test:live-logic
npm.cmd run verify:live-isolation
npm.cmd run verify:eas-project-isolation
npm.cmd run verify:android-variant
```

## Remaining gates and rollback

Provider configuration approval, coordinator testing and voice media denials are
complete for app 1731011. Resolve the proven strict revocation failure before any
native calling. Separately approved VIDEO verification now proves both consenting
users' VP9/Opus RTP, screen-share and privileged-action denial, and actual worker
ACTIVE reconciliation. All three VIDEO attempts were cleaned up. The consent
revocation failure still blocks M2A/M2B; see document 16 and the VIDEO receipt.
Keep native calling disabled until the gate passes, then install the
Auth-owned client factory/incoming host and execute the device plan. M3 remains
blocked until secure real voice execution is demonstrated.

M0 proof/consent, M1 private tables/API flags and server cleanup remain preserved.
Rollback this local M2 work by removing the development route/new voice modules
and reverting only M2 edits; preserve M0/M1, unrelated work and the observed provider
evidence. Do not restore the wrong provider role spelling or weaken app checks.
No application deployment needs rollback. The approved dedicated provider type
and three roles remain present. Any later provider rollback must first drain
fixture calls, delete only isolated users/calls, and verify dedicated roles/type
are unused; never modify Live/global roles as a compatibility shortcut.
