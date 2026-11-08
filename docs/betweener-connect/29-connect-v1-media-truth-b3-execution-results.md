# Connect V1 Media Truth B3 execution results

Date: 2026-10-30. Experiment: `connect-m2a-media-truth-b3-28`. **Executed once. Call creation and bidirectional remote decoder controls passed. No fresh post-timer challenge was decoded. The unchanged classifier returned INCONCLUSIVE for both phases because the transports became unavailable. M2A/M2B remain BLOCKED and real calling remains disabled.**

Both raw peers recorded SFU `callEnded` events near the first ended read, followed by clean signaling-socket closure and eventual PeerConnection failure. Receiving counters became flat, apart from one additional 81-byte packet at receiver B. The later explicit-end acknowledgement cannot establish a separate causal cutoff because those transports had already failed. The runner completed with exit **0**; completion is not a media-security PASS.

The independent watchdog deleted the owned call and hard-deleted both owned fixture users, verified their absence and confirmed the shared call-type hash was unchanged. **The single-use B3 execution allowance is consumed.** There was no creation retry, replacement experiment or source repair.

## 1. Owner approval and immutable manifest

The owner directly answered **“Re-approve the exact B3 experiment”** to the chat question naming staging app **1731011 / Betweener Staging**, this experiment, the exact manifest hash, at most two owned fixture users and one synthetic VOICE call, followed by scoped watchdog cleanup. This resolved the earlier automatic approval-review rejection of the attachment. That rejected submission started no runner process and consumed no execution ledger.

The original owner attachment, `27805878-1a39-463c-9ba8-26cf9b0ecbe4/Pasted text.txt`, has SHA-256 `7431d26cc656bf150dd0a493fe7de42947ca1ba9eb61048490bd9a6bf17d1850`. Its scope and the direct chat instruction were applied together. The [B3 manifest](stream-staging-connect-media-truth-b3-proposal.json) remains unchanged:

```text
1c4a176710972ff9db0baf9473be63ca3662cf7bbaec68cf3ddbfda39f8f3f0f
```

A new approval ID, `media-truth-b3-28-9057a98a-af85-4f30-bf3a-c0ac8671017c`, was created at the actual time **2026-10-30T14:30:03.730Z**, expiring **15:30:03.730Z**. It records the direct chat source, one execution, two users maximum, one call maximum, zero creation retries and zero replacements. The existing approval guard passed. No timestamp was backdated.

The expired, unused attachment approval ID `media-truth-b3-28-83375858-476d-456b-9cb3-4a2dbf2ee091` was not reused. Its record, earlier blocked report/status receipt and rejection remain under `tmp/connect-media-truth-b3-stage-b/`, including `owner-approval-before-chat-reapproval.json`, `report-before-execution.md`, `evidence-before-execution.json` and `blocked-execution.json`. The old status receipt's SHA-256 remains `97270b4bdb46f563022a3b3f26e255d9691d908f8731733285728fd9b6cacc87`. These are historical records superseded by this executed result.

## 2. Fresh readiness, provenance and execution

[Report 28](28-connect-v1-media-truth-b3-preparation.md) and its [canonical readiness receipt](stream-staging-connect-media-truth-b3-preparation.json) were read. Fresh local preflight at **14:30:03.737Z** confirmed:

- Exact manifest hash and readiness SHA-256 `2855b305984a990ef7521d3e229aa1d051e64ee7ca2a25a59afad48593390771`, including byte-identical working readiness.
- All **73** source, SDK, protocol and package hashes, exact source-inventory equality, and all **434** preparation/historical artifact hashes.
- All **403** separately protected historical entries and **290** original workspace entries unchanged, including B1/B2 consumed approvals, locks and ledgers.
- B3 execution state absent, with no previous B3 reservation or consumed experiment lock.
- Fresh pinned public SDK **0.7.63** request-contract compilation with zero errors and numeric constraints PASS. The synthetic request hash remains `35bbb2129e085e63d03aaf21ecd561469acc680661f83c81f0b2acc345097183`.

The unchanged guarded runner was invoked once after direct approval:

```text
node scripts/test-connect-media-truth-b3.cjs --execute --approval tmp/connect-media-truth-b3-stage-b/owner-approval.json
```

This launch was accepted. The runner exited **0**, with `status=COMPLETE`, `errors=[]`, two phases and two **INCONCLUSIVE** verdicts. Earlier rejected process creation is not a second experiment execution. No manual provider request or alternative execution route was used.

Actual runtimes were parent **Node v24.18.0**, provider **Deno 2.5.4**, server SDK **0.7.63**, **Chrome 155.0.8059.86** and **Playwright 1.64.1**. The raw SFU harness uses the pinned generated video-client **1.62.0** protocol. Both browser media peers ran here. Final runner provenance and subsequent verification confirm the same 73 prepared hashes. No SDK or software upgrade occurred.

## 3. Retained evidence

The [B3 execution evidence](stream-staging-connect-media-truth-b3-evidence.json) retains the direct approval, local preflight, exclusive ledger/lock, complete unmodified original runner receipt, watchdog receipt, analysis projections, provenance and original artifact hashes. Its SHA-256 is:

```text
ef7dd20af2b379003132d4ab4d3a2743cbd914a6525db6ef3f13a64425ce11f9
```

Original execution files remain under `tmp/connect-media-truth-b3-execution/`, with stem `approval-media-truth-b3-28-9057a98a-af85-4f30-bf3a-c0ac8671017c.json`:

| Artifact | SHA-256 |
|---|---|
| Ownership ledger, stem above | `23dc91a414adc5e4d2feec1e053ac99a7742f8a68310381a50335a7da44dfdad` |
| Stem + `.evidence.json` | `0dcb9e021be24ae8cebf105938c11155a859013f619892f1663209149d077b55` |
| Stem + `.cleanup.json` | `cf5903b200c0c9fff67cf5d98b786f391b20bcd944c4ba569543452ec9044091` |
| Stem + `.cleanup-attempt-1` | `b2fbe2815f16b39f2611755f152d373e79bebfd5f60bfe6e729941ca1f2ce95b` |
| `experiment-once.json` | `eb7292760e99112cf1841e7a42315b0828127b19567007e9a59f4daf783e2dcd` |

The receipt contains synthetic decoded control/challenge data and statistics, with no credentials, JWTs, authorization headers, SDP, raw provider error bodies, hardware capture or personal audio. A recursive key/string scan found no sensitive-key paths or suspicious credential/SDP strings. Nonces below are synthetic measurement payloads, not credentials.

## 4. Actual provider preflight and owned resources

The pinned provider validator checked the actual staging application ID/name, enabled authentication and permission checks, the existing hardened `betweener_connect` type/role policy and disabled notifications. Exact reserved users were absent. The reserved call returned **HTTP 404 / code 16** before mutation. Successful validator operations and HTTP timing are retained; complete raw app/type payloads are not retained.

The canonical `listCallTypes().call_types` baseline hash was:

```text
12e74f5fca79a1dea2b48a8c950bbc3a2189a3ffdf9e04ccb43d28c4e4533a7e
```

The exclusive ledger reserved ownership at **14:30:18.906Z**, before provider mutation:

| Resource | Exact identifier | Outcome |
|---|---|---|
| User A / creator | `mtb3_28_858c8e68-d777-40b5-85b0-9a9985c9bbd6_a` | Created, marker verified, later hard-deleted |
| User B | `mtb3_28_858c8e68-d777-40b5-85b0-9a9985c9bbd6_b` | Created, marker verified, later hard-deleted |
| Call | `92e5a845-e3ea-4456-8571-3e2e6e133d57` | Created once, measured, later deleted |
| CID | `betweener_connect:92e5a845-e3ea-4456-8571-3e2e6e133d57` | Two admitted synthetic peers |
| Marker under `connect_media_truth_b3_28` | `858c8e68-d777-40b5-85b0-9a9985c9bbd6` | Verified before scoped cleanup |

There was one two-user upsert and one call-creation POST, both **HTTP 201**. The creator was the first owned pair member; both membership roles were existing `connect_voice`. No global user role, role definition or shared type was changed.

## 5. Effective settings before token issuance/join

Creation was followed by a successful owned-call GET and the unchanged effective-settings validators before tokens or coordinator joins. `provider.mts:60` applies the production session-settings assertion, exact manifest-subset checks, ownership/binding and voice-role checks; `provider.mts:101` runs that readback after `getOrCreate`. The immutable source and successful operation provide the validation evidence. The full effective settings payload and original HTTP request body were not retained as wire captures.

| Verified approved setting | Effective validation result |
|---|---|
| Exact type/ID, owned marker, pair membership and existing voice roles | PASS |
| Participants 2; duration 60 seconds | PASS; actual session subsequently exposed a 60-second timer |
| Mic/speaker defaults off, earpiece, audio access requests off | PASS |
| Video disabled, camera default off, complete 640×480 / bitrate 600000 | PASS |
| Screen sharing, thumbnails, broadcasting and ingress disabled | PASS |
| Recording, individual/raw/frame recording disabled; frame interval 2 | PASS |
| Transcription and closed captions disabled | PASS |
| Submitted `ring=false`, `notify=false`; shared notifications disabled | Unchanged builder and successful preflight |

Only synthetic 16-FSK audio was published. Supplying resolution did not authorize video publication. The accepted B3 request establishes compatibility for this exact fixture and settings. It does **not** recover the discarded B1 server description or prove the exact B1/B2 validation mechanism described as hypotheses in reports 23/26.

## 6. Bidirectional remote media controls

Both coordinator joins returned **HTTP 201**, and both raw SFU peers joined with distinct user/session bindings. Provider session ID was `d31c081c-6e79-4203-8d1c-6c00a73320da`. Raw session IDs were A `efcf0c7c-f988-42af-8e5e-738f5058d3f0` and B `eef698c0-0595-4235-87c3-0a89d23324df`.

The independently running remote decoders both recognized the phase-0 all-zero control nonce with valid CRC, the opposite sender identity, 48 kHz sampling and a 192000-sample / four-second frame. The receiver was not supplied the expected fresh nonce; matching occurs afterward in the parent.

| Receiver | Remote sender | Browser observation UTC | Confidence / minimum symbol confidence | Calibration receiving bytes / packets |
|---|---|---|---|---|
| A | B / sender 2 | 14:30:42.074 | 0.990117 / 0.947898 | 80026 / 326 |
| B | A / sender 1 | 14:30:42.034 | 0.972524 / 0.790539 | 80658 / 328 |

The parent calibration bracket was **14:30:42.173–42.192Z**. Both publisher/subscriber PeerConnections were connected, AudioContexts running and source peaks 0.25. These are actual provider media controls, distinct from historical Stage A/local Opus preparation results.

## 7. Timer, fresh challenges and signaling timeline

All UTC values below are **2026-10-30**. Parent intervals use parent monotonic clocks. Provider, watchdog and browser monotonic origins are separate; UTC is correlation only. HTTP end labels identify response-header receipt, not server commit. No synchronized cross-host latency guarantee is inferred.

| UTC | Retained observation |
|---|---|
| **14:30:18.906** | Exclusive ledger reserved; hard deadline 14:33:18.906 |
| **14:30:25.248–26.131** | Startup app GET, HTTP 200; staging identity/checks validator passed |
| **14:30:26.143–26.493** | Parent provider preflight completed, including role policy, absence and shared baseline |
| **14:30:26.517–26.588** | Only two-user upsert POST, HTTP 201; ownership readback completed 26.633 |
| **14:30:26.654–26.714** | Only call-creation POST, HTTP 201 |
| **14:30:26.716–26.753** | Owned-call GET, HTTP 200; effective settings/ownership validator passed |
| **14:30:26.799–26.868 / 26.913–27.042** | A/B coordinator join POSTs, HTTP 201 |
| **14:30:34.078** | Provider-reported session start; timer deadline 14:31:34.078 |
| **14:31:34.828** | Provider-reported call `endedAt` |
| **14:31:35.549** | Last observed not-ended GET completed; still exposed the session |
| **14:31:35.801–35.847** | First ended GET parent bracket; `ended=true`, `session=null`, users empty |
| **14:31:35.813 / 35.814** | A/B raw SFU `callEnded` events, within that parent GET bracket |
| **14:31:35.848** | Fresh phase-1 sender nonces generated after completed ended read |
| **14:31:35.849–35.973** | Source commands; both fresh waveforms scheduled |
| **14:31:35.973–36.000** | First timer-phase statistics bracket |
| **14:31:36.250–36.276** | B's one additional packet first appears in the next statistics sample |
| **14:31:36.817** | Both signaling sockets closed, code 1000, clean=true, reason redacted |
| **14:31:42.641–43.206** | First observed publisher disconnections, B then A |
| **14:31:52.795–53.363** | First observed subscriber failures, B then A |
| **14:32:34.856–34.877** | Final timer-phase statistics bracket |
| **14:32:35.050–35.149** | Explicit-end parent operation, including actual `mark_ended` acknowledgement |
| **14:32:35.092–35.148** | Comparison `mark_ended` POST, HTTP 201 |
| **14:32:35.149** | Separate phase-2 nonces generated after ACK in parent monotonic order |
| **14:32:35.149–35.283** | Post-ACK source commands completed |
| **14:32:35.283–35.309 / 44.270–44.292** | First/final explicit-end statistics brackets |
| **14:32:44.481** | Local media cleanup began, after both measurement windows |
| **14:32:44.920** | Parent experiment completed |
| **14:32:45.169–48.297** | Independent owned-resource watchdog cleanup |

The raw handler records `callEnded` without closing the local PeerConnections (`scripts/lib/connect-stream-sfu-session.cjs:142`). No voluntary leave or local close preceded the observations. The peers were kept open by the harness until its final cleanup; this does not mean the provider kept their transports connected. Only SFU signaling is retained here, not a separate coordinator WebSocket trace.

| Phase | Sender A nonce | Sender B nonce | Remote result |
|---|---|---|---|
| 1, after completed ended GET | `1c6ef03870398c07d56f8fd5910e7994` | `3013828da30101cca5428fccc6543721` | Neither receiver decoded its target |
| 2, after explicit-end ACK | `f04798b8755c927f4ca2d07b3c121fab` | `0ad6075fb39344b72c48bd4993c8eb98` | Neither receiver decoded its target |

There were **zero decoded target-nonce frames at any confidence** in either phase, including no low-confidence target match. Previously decoded phase-0 controls are not fresh challenges. This is a bounded observation of no detected fresh delivery, not proof of universal non-delivery.

## 8. Per-SSRC RTP, source and decoder evidence

Receiver A's inbound SSRC was **2254939872**, stats ID `IT01A2254939872`, track `3afc3793-c6ef-4288-9931-9dbb06da7343`. Receiver B's was **1150319763**, stats ID `IT01A1150319763`, track `20f09eb6-9e4c-4daa-90b7-1ba55f8a862b`. These receiver-track/SSRC bindings remained stable relative to the positive controls. Full per-sample RTP, stats timestamps, jitter-buffer/audio and connection-state fields remain in the original receipt.

| Measurement, first → final sample | Timer phase | Explicit-end phase |
|---|---|---|
| Receiver A bytes / packets | 744192 / 3008 → same | 744192 / 3008 → same |
| Receiver B bytes / packets | 745579 / 3020 → 745660 / 3021 | 745660 / 3021 → same |
| Sender A local outbound bytes / packets | 241270 / 3038 → 474920 / 5982 | 476701 / 6003 → 512292 / 6453 |
| Sender B local outbound bytes / packets | 241277 / 3038 → 475321 / 5982 | 477035 / 6003 → 512706 / 6453 |
| Each decoder chunks / samples | 1420 / 2908160 → 2800 / 5734400 | 2810 / 5754880 → 3021 / 6187008 |
| AudioContext / source peak | Running / 0.25 | Running / 0.25 |
| Tail PeerConnection state | Failed/unavailable | Already failed throughout |

The one 81-byte packet's content and generation time are **UNKNOWN**; it is not evidence of a fresh nonce. Last-packet browser timestamps correspond to approximately **14:31:35.812625Z** for A and **14:31:35.994378Z** for B. Their position relative to parent/provider UTC labels cannot establish precise wire-delivery or enforcement latency.

Source scheduling, active waveform peaks, advancing local outbound accounting and decoder worklet liveness continued. When transports have failed, those local counters do not prove SFU receipt or remote publication. Decoder callbacks can continue processing silence; callback growth is not received fresh content. Increasing stats timestamps with flat byte/packet counts distinguish fresh polling from a frozen statistics snapshot.

## 9. Explicit backend-end comparison, formal verdict and limits

The same owned call was read and `mark_ended` acknowledged with **HTTP 201**. The separate challenge was generated afterward. No new call, replacement session or timer reset was requested. However, both peers' publisher/subscriber transports had already failed before this operation. The post-ACK negative observation therefore **cannot isolate an effect caused by explicit backend end**.

| Requirement | Timer phase | Explicit-end phase |
|---|---|---|
| Valid trigger, independent controls, fresh generation/scheduling and bindings | PASS | PASS |
| Samples / final interval from trigger | 217 / 59029.8796 ms | 34 / 9142.8897 ms |
| Maximum parent sampling bracket | 58.1767 ms | 32.6757 ms |
| Complete approved window; stable tail / source / decoder evidence | PASS | PASS |
| Tail transports remain connected | **FAIL** | **FAIL** |
| Unchanged classifier verdict | **INCONCLUSIVE** | **INCONCLUSIVE** |

Each phase's retained reason list contains `transport_closed_or_unavailable` twice, once per peer. The existing classifier (`scripts/lib/connect-media-truth/verdict.cjs`) requires connected publisher/subscriber transports throughout the stable tail before returning OBSERVED_CUTOFF. Offline replay reproduces both original verdicts exactly. No classifier, threshold, window or source was modified to change the outcome.

There was no provider operation error, process failure, decoder-control failure, telemetry truncation or deadline overrun. Expected preflight/final 404 / code 16 responses establish scoped absence. Version-2 bounded diagnostics remained in place; no raw error was logged. The unresolved measurement condition is transport availability, plus the resulting loss of an independent explicit-end comparison.

This run observed SFU end signaling and flat reception rather than the sustained post-ended counter growth discussed in [report 18](18-connect-v1-revocation-boundary-decision.md). It does not reproduce that historical observation. It also does not prove its cause, identify a provider-internal repair, establish finite adversarial revocation latency, demonstrate an absolute SFU lease or validate native calling. The valid timer-ended metadata and SFU event are separate observations; an exact causal/latency guarantee cannot be inferred from their UTC correlation.

## 10. Executed watchdog cleanup and shared configuration

Cleanup ran independently with reason `experiment-finally`, using one cleanup slot and no retry or emergency cleanup. It verified ownership, idempotently marked the call ended, deleted it, waited for the deletion task, verified both user markers, hard-deleted the exact pair and waited for that task. Task polling is completion verification, not a resource-creation retry.

| UTC | Cleanup evidence |
|---|---|
| **14:32:45.738–45.849** | Owned-call GET, HTTP 200; ownership verified |
| **14:32:45.851–45.892 / 45.893–45.930** | Cleanup `mark_ended` and call deletion, HTTP 201 |
| **14:32:46.555** | Call deletion-task completion verified |
| **14:32:46.556–46.574** | Exact owned-user query, HTTP 200; markers checked |
| **14:32:46.575–46.597** | Owned-user hard-delete request, HTTP 201 |
| **14:32:48.174** | User deletion-task completion verified |
| **14:32:48.175–48.189** | Final owned-call GET, HTTP 404 / code 16 |
| **14:32:48.195–48.209** | Final user query, HTTP 200; no owned users remain |
| **14:32:48.209–48.225** | Shared call-type readback, HTTP 200; baseline hash matches |
| **14:32:48.297** | Watchdog complete, `errors=[]` |

The cleanup receipt records `callAbsent=true`, `usersAbsent=true`, `sharedUnchanged=true`. Its final shared hash is exactly `12e74f5fca79a1dea2b48a8c950bbc3a2189a3ffdf9e04ccb43d28c4e4533a7e`. No prefix-based or broad deletion occurred. The comparison-phase `mark_ended` and cleanup's idempotent end are separate approved operations on the same owned call, not two creations.

Cleanup began about **146.263 seconds** after reservation and completed **149.391 seconds** after reservation, before the **14:33:18.906Z** hard deadline. Watchdog monotonic duration was **3127.9326 ms**, within its 60-second budget. The 60/10-second phase limits and 180-second experiment limit were respected without extensions.

Shared equality is scoped to canonical `listCallTypes().call_types`, including the listed Live type configuration. It is not an attestation of every app-global setting or concurrent external activity. No shared type, role or global setting write was issued. Cleanup and configuration PASS are resource/isolation findings, not media-enforcement evidence.

## 11. Preservation and remaining engineering action

Post-execution verification confirmed **290/290 original workspace entries unchanged**, **73/73 prepared source hashes unchanged** and **434/434 readiness/historical artifacts matching**, including the **403** separately protected historical entries. The original boundary receipt remains `8c1d82141a5c5140c94ac2b65e2b09dca42ebbe1f0f8c87b852d6dacdffa501d`; B2 execution evidence remains `ff77e3cb8c6bb741e666925405919b027fe9f99e65458a81e942b45ed941b8ab`.

Only this report and the B3 evidence receipt were added/updated as repository deliverables; ignored local files preserve approval, rejected-launch history, preflight, execution, analysis and verification. No executable source, manifest, readiness receipt, earlier report/evidence, unrelated Live/Circle/Studio/package work or migration was changed. The pre-existing absent migration remains absent. B1/B2 consumed ledgers are untouched. **B3's exclusive experiment lock and consumed ownership ledger remain present; do not reset, delete or reuse them.**

Fresh execution validation comprised hash/inventory checks, the pinned SDK contract, the actual bounded experiment and read-only receipt/classifier replay. The historical **290/290 offline preparation tests**, local Opus controls and **509/514 Live baseline with five failures** were not rerun here. No new test suite was needed for unchanged execution source. Live isolation is limited to unchanged sources/configuration and no shared writes; no full Live/device regression is claimed.

The minimum next action is **offline review of the classifier and experiment design using this retained receipt**: distinguish SFU-signaled transport termination from unrelated loss while preserving conservative evidence requirements, and explicitly handle an unavailable backend-end comparison after timer termination has already disconnected the peers. Add focused offline cases before making any narrowly reviewed change. Do not relabel this historical result or weaken thresholds merely to obtain OBSERVED_CUTOFF.

No further provider run is needed to inspect these artifacts. Any changed harness requires fresh preparation/provenance; any later provider execution requires a new concrete reviewed proposal and separate explicit owner authorization. No additional run or repair is authorized by this consumed allowance. Successful B3 setup alone does not close media revocation, consent-loss enforcement or native ownership requirements. Keep real calling disabled.

No Supabase/database access, production change, migration, deployment, app/EAS build, OTA publication, native-device validation or calling enablement occurred.

## 12. Final declarations

```text
CONNECT_B3_EXPERIMENT = INCONCLUSIVE
CONNECT_B3_CALL_CREATION = PASS
CONNECT_B3_FRESH_AUDIO_AFTER_TIMER = NOT_OBSERVED
CONNECT_B3_EXPLICIT_END_CUTOFF = INCONCLUSIVE
CONNECT_B3_PROVIDER_CLEANUP = PASS
CONNECT_B3_SHARED_CONFIG = UNCHANGED
CONNECT_M2A_SECURITY_GATE = BLOCKED
CONNECT_M2B_READY = BLOCKED
PRODUCTION_MODIFICATIONS = NONE
```

NOT_OBSERVED means no fresh target was decoded in this bounded measurement. The formal INCONCLUSIVE results and the explicit-end causal limit remain intact. **EXPERIMENT_EXECUTIONS=1; CALL_CREATION_REQUESTS=1; CREATION_RETRIES=0; REPLACEMENT_EXPERIMENTS=0; MEDIA_PHASES_EXECUTED=2; CLEANUP_ATTEMPTS=1.**
