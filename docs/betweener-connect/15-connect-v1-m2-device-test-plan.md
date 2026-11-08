# M2 Android / iPhone voice test plan

2026-10-28. **NOT EXECUTED. Device validation is BLOCKED by the M2A provider gate.**
No EAS build, TestFlight/Play deployment, OTA, application call or physical audio
test was started. Approved isolated coordinator/SFU signaling probes in document
13 do not satisfy this device plan.

The reissued M2 brief was reviewed without starting device execution. Current
Stream security is **FAIL** because held-token access during provider-end failure
remains proven. VOICE_ONLY/VIDEO policy checks and local cleanup acknowledgement
hardening do not satisfy the revocation gate. All scenarios below remain
unexecuted; see [the local revalidation receipt](local-m2-revalidation.json).

## Prerequisites

1. The scoped provider proposal is approved and applied. Resolve the proven
   outage revocation failure in document 16 before
   recording a passing M2A matrix. Keep all production flags off; verify the
   provider application ID on every environment.
2. Use two isolated test accounts with distinct Auth/profile/Stream identities,
   explicit availability and either two verified relationship decisions or a
   recipient-approved voice-only Intent grant. No real-user invitations. Existing
   shared app databases cannot be modified under this brief; use an isolated local
   backend reachable by both devices, or obtain separate authorization before any
   additional environment/account provisioning.
3. Install the real Auth-owned Stream lease/refresh factory and foreground host
   only after the security gate. Verify Live/Connect media ownership exclusion,
   account switching and logout teardown. The development preview alone is not
   a device calling implementation.
4. Device A: Android, model/OS/build recorded by tester. Device B: iPhone,
   model/OS/build recorded by tester. Use supported existing development binaries
   only after confirming native module/version compatibility. These M2 changes add
   no native plugin/package/configuration; no new binary was generated. If native
   changes/builds become necessary, obtain explicit build authorization first.
5. Record actual app variant, backend identity, Stream app ID, build IDs, network,
   test account aliases, opaque call UUIDs, expected consent and provider read-back.
   Do not record tokens, secrets, phone numbers or audio/video content.

## Required two-device scenarios

| # | Scenario / expected result | Actual result |
| --- | --- | --- |
| 1 | Android A calls iPhone B; one UUID, outgoing UI, in-app incoming invitation on B | NOT_TESTED |
| 2 | B answers; only winning device admitted; CONNECTING before both-party evidence | NOT_TESTED |
| 3 | Both hear each other; ACTIVE and connected duration follow real media evidence | NOT_TESTED |
| 4 | A mutes/unmutes; remote audio follows control; no camera permission requested | NOT_TESTED |
| 5 | B chooses actual available phone/speaker routes; connect/disconnect Bluetooth/headset and record native device IDs | NOT_TESTED |
| 6 | A hangs up; both UIs terminate, microphone indicators/tracks stop, provider ends and occupancy releases after ACK | NOT_TESTED |
| 7 | B calls A; reverse direction obeys its own eligibility/grant, unique UUID | NOT_TESTED |
| 8 | A declines; no media/capture; caller sees terminal result, no resurrected ring | NOT_TESTED |
| 9 | A calls while B is busy; deterministic busy outcome, no second provider session | NOT_TESTED |
| 10 | One device loses internet temporarily; bounded RECONNECTING, same call, recovery or safe timeout | NOT_TESTED |

## Additional safety and lifecycle cases

- Permission already granted, denied, permanently denied, Settings recovery;
  start/accept must not ring/join after permission denial. No camera prompt.
- Caller repeatedly taps; simultaneous A→B/B→A; answer on a second signed-in device;
  cancellation versus acceptance; accept during expiry; duplicate/delayed events.
- Revoke the voice grant or block while ACTIVE. Record backend fencing, actual
  provider cleanup/member denial and held-token behavior separately. A backend
  denial alone is not proof that a direct Stream join is denied.
- Logout while outgoing/incoming/connecting/active; switch account; unmount route;
  confirm no old account refresh, dangling subscription or microphone capture.
- Incoming phone/audio-focus interruption; background/foreground and device lock;
  observe actual OS audio behavior. Current local policy mutes on inactive/background
  and requires explicit unmute on return. No background/lock reliability is claimed.
- Server worker unavailable, create response lost, lease retry and late provider
  creation after cancel; verify durable compensation and eventual cleanup.
- Live stage / Quick Connect before and after voice; no duplicate native client,
  microphone ownership conflict, logout, push-handler duplication or role changes.

For each case record timestamp, expected/actual UI, provider response codes,
server state/version, microphone indicator/track status, audio route and cleanup
acknowledgment. Mark FAIL for an observed failure, BLOCKED for an unmet prerequisite,
and NOT_TESTED for an unexecuted scenario. Never infer PASS from a mock or source review.

## Limits and stop criteria

Stop on unauthorized creation/join/member or role changes, voice-to-video bypass,
consent bypass, terminal resurrection, orphan capture, wrong environment, or any
new Live regression. Retain sanitized evidence and keep provider calling gated.
This plan does not claim terminated-app or lock-screen ringing. Native incoming
support, notification provisioning and final cinematic work remain future milestones.
