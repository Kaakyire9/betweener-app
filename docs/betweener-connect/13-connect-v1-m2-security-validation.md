# M2 Stream security validation

2026-10-28. **M2A closure: VOICE_ONLY and VIDEO media policies PASS; strict consent revocation
FAIL; M2A/M2B readiness BLOCKED.** The former generic SFU errors are resolved.
The remaining safety failure is an observed held-token bypass during provider-end
failure, not missing permission to test the existing voice policy.

See [the full closure report](16-connect-v1-m2a-security-closure.md) and
[actual sanitized evidence](stream-staging-connect-m2a-closure-evidence.json).
The original [configuration proposal](stream-staging-connect-proposal.json) and
[M2 receipt](stream-staging-connect-validation.json) remain historical records.

## Environment and applied policy

The approved configuration remains in **1731011 / Betweener Staging**. Auth and
permission checks are enabled. No additional call-type, role definition, global
or Live setting was changed during closure. All call-type hashes matched before
and after verification. Only owned isolated identities/calls and disposable local
databases were used. No deployment, shared database change, build or feature enablement
occurred. Hosted Live secret provenance was not queried.

Effective Connect roles remain invited read-only, voice read/join/audio, and video
read/join/audio/video. Built-in roles have empty grants. Video defaults off; screen
sharing, recording/transcription, egress and native notifications are disabled.
Capacity is two. Existing Live permissions are unchanged.

## Actual observations

| Test | Actual result | Security meaning |
| --- | --- | --- |
| Voice-only video publication | Real SFU HTTP 200 with embedded `ERROR_CODE_PERMISSION_DENIED`, explicitly not authorized for VIDEO; no publishing answer | Provider denial proven |
| Screen-share publication | Same explicit SFU permission denial for SCREEN_SHARE | Provider denial proven |
| Authorized audio control | Two synthetic RTC transports connected with outbound RTP; real provider participants reconciled DB to ACTIVE | Positive media control, no physical-device claim |
| Direct video/screenshare permission request | HTTP 201 events accepted; subsequent capabilities stay read/join/audio and video stays disabled | Requesting is not granting; do not report the request endpoint itself as denied |
| Self-grant video, roles/settings/end, third member, record/transcribe/broadcast | HTTP 403 / code 17 | Escalation denied |
| Unrelated create/read/join/ring and Live-token bypass | HTTP 403 / code 17; valid Live fixture control succeeds | Existing coordinator boundaries still hold |
| Healthy actual DB revoke-to-worker-to-Stream cleanup | End ACK completed in about 1030 ms in one fixture; both held users then get 403/code 17; remote call-ended observed | Healthy cleanup proven; no instantaneous or SLA guarantee |
| Provider-end failure injected after DB authority is committed | DB ENDED/revoked, new backend calls/admission denied, durable retry and occupancy retained | Database fence works |
| Held Stream token in that interval | Join 201, real SFU audio answer, connected RTC and synthetic RTP after DB revocation | Strict consent revocation FAILS |
| Retry after recovery | Real end ACK, held join 403/code 17, occupancy release | Recovery works; earlier bypass remains a failure |

The corrected probe uses actual SDK enums, stream/RID/layer metadata, live tracks,
SDP negotiation and buffered ICE. Earlier magic value 3 meant OFF, and closing
PCs before signaling could not establish media. Those old generic validation errors
remain inconclusive historical evidence; current explicit SFU denials supersede them.
No hardware camera or microphone was used.

The final ordinary-user coordinator run contains **34 requests**. The integrated
run contains **10 checks** linking real authenticated/service-role RPCs in a
schema clone to the actual Stream adapter/worker and SFU. End failure was injected
at the worker port, not asserted as a real Stream outage. It proves the behavior
when control-plane termination fails while provider media/admission remain available.

Remote end events and post-ACK rejoin denial are established. Raw peer connections
still reported connected at the immediate post-end sample; packet-level forced
teardown/discard was not separately proven. Do not infer it from a UI state or event.

## Local remediation and remaining gate

The adapter now verifies actual per-call media/settings and immutable custom media,
with separate VOICE_ONLY/VIDEO contracts. Both prohibit screen sharing and all
recording/egress paths. The new authenticated revoke endpoint commits authority,
then attempts immediate durable end work; incomplete cleanup returns 202/pending.
The worker claim now preserves call IDs after session deletion and prioritizes end
work. All helper/table grants remain restricted. Nothing was deployed.

An async outbox, a successful permission-request event, short JWT expiry or pending
UI cannot make provider authority atomic with a database transaction. Keep M2A and
M2B blocked until a provider-enforced revocation/admission mechanism, or an explicitly
reviewed and verified revocation bound, addresses the observed gap.

The separately approved one-call VIDEO attempt passed authenticated consent and
invitation checks, then its media probe failed locally before producing usable
publication evidence. One ordinary identity joined with exactly read/join/audio/
video capabilities; that alone is not RTP proof. The call and all three fixture
users were hard-deleted and the full call-type digest was unchanged. That attempt
was BLOCKED. See [the VIDEO receipt](stream-staging-connect-video-security-evidence.json).
The separately approved diagnostic call subsequently proved one participant's
connected VP9 publication (146,385 bytes, 228 packets, 175 frames) and explicit
SFU screen-share denial. Applying the audio answer failed, and the manual pause
exceeded the backend's unchanged 60-second connection deadline; renewed SQL
admission was denied. That call/users were deleted with matching policy digests.
The probe correction preserves one publisher PC and rolls back denied offers;
local simultaneous receive/recovery tests pass. The separately approved
[verification run](stream-staging-connect-video-security-verification-proposal.json)
then **passed all four integrated checks**: both consenting ordinary identities
published connected VP9 video/Opus audio, both SFU screen attempts were explicitly
denied, eight privileged writes were 403/code 17, capabilities stayed exactly
read/join/audio/video, and actual provider/worker evidence reconciled ACTIVE.
Video counters were 131,340/130,654 bytes, 225/224 packets and 175 frames each;
audio counters were 886/867 bytes and 13 packets each. No physical-device or remote
rendering claim is inferred from outbound counters. VIDEO permission enforcement
is now **PASS**. All three VIDEO fixture calls and their owned users are gone,
with unchanged full type hashes and zero disposable databases/REST containers.
No provider definition, shared flag, deployment or Live setting was changed.
The separate consent-revocation failure still blocks M2A/M2B.

## Cleanup and regression evidence

Both fixture suites completed hard cleanup. Integrated: zero users and four exact
call lookups returning 404/code 16. Coordinator suite: zero users and all four call
targets absent. Browsers/sockets closed, disposable DB/REST instances removed, and
provider type hashes unchanged. The approved dedicated roles/type remain provisioned.

Local checks: original 61 M2 tests plus 21 new tests **82/82**, RN **7/7**, M1 **15 ACL
+ 67 integration**, new revocation **20 cases/four races**, relationship **88 assertions/
six races/four HTTP attacks**, original baseline **91/91**, chat **234/234**, Intent
**2/2**. Live remains **504/508** with the same four baseline failures. TypeScript,
strict Edge Deno and targeted lint pass. Document 16 gives the exact file inventory,
limits, rollback and required external actions.

The reissued M2 brief was checked against the existing implementation. A fresh
read-only provider audit verified the same exact staging app, enabled auth and
permission checks, dedicated policy and complete type digest. No additional
provider users/calls or settings writes were made. The prior real consent-bypass
receipt remains a demonstrated failure, so `CONNECT_M2_STREAM_SECURITY = FAIL`
and native M2B remains blocked under the brief's exit gate.

Local review also repaired discarded job-completion acknowledgements: both Edge
handlers now require `rpc_connect_complete_job` to return literal true. Actual
stale/owner lease SQL tests and two additional worker/revocation regressions pass.
This prevents false cleanup success; it does not provide remote revocation during
provider failure. Current local results, retained provider evidence references and
environment/cleanup scope are in [the revalidation receipt](local-m2-revalidation.json).

References: [Stream permissions](https://getstream.io/video/docs/api/call-types/permissions/),
[ending calls and session timers](https://getstream.io/video/docs/api/calls/).
