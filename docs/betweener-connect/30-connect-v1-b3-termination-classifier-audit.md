# Connect V1 B3 termination classifier audit

Date: 2026-10-30. Scope: **forensic receipt review, public documentation and isolated offline tests only**. No authenticated provider request, database access, fixture, deployment or calling enablement occurred.

**Decision: the existing classifier is correctly conservative for its predeclared connected-peer cutoff contract, but misses an important analytical distinction.** B3 contains correlated SFU termination signaling, DTLS closure and independently sampled receiver RTP quiescence while the non-cooperative harness remains alive. This is stronger than unexplained ICE failure, and weaker than a causal or universal server-enforcement guarantee. **Both historical B3 phase verdicts remain INCONCLUSIVE.** Report 18's timer result also remains unchanged.

The proposed distinction is descriptive evidence on separate axes, not a second way to award a security PASS. Prefer **OBSERVED_RECEIVER_RTP_QUIESCENCE** over unqualified “media cessation”: it states what was measured without asserting silence on every possible flow, exact packet generation time or provider causality. M2A/M2B remain BLOCKED; real calling remains disabled.

## 1. Evidence, integrity and scope

Read reports [18](18-connect-v1-revocation-boundary-decision.md), [19](19-connect-v1-independent-forensic-audit.md), [21](21-connect-v1-media-truth-preparation.md), [28](28-connect-v1-media-truth-b3-preparation.md) and [29](29-connect-v1-media-truth-b3-execution-results.md), their preparation/execution receipts, the current raw SFU/session/decoder code, and the original classifiers. No historical receipt was regenerated.

| Original input | Verified SHA-256 / observation |
|---|---|
| Report 18 original: `tmp/connect-boundary/provider-results.json` | `8c1d82141a5c5140c94ac2b65e2b09dca42ebbe1f0f8c87b852d6dacdffa501d` |
| Its retained boundary wrapper | `b7ee15e52d422351fe397835759a8ba2ce8cfddb537f09c910682a58682ec3ed`; `experiment.results` equals the original after removing only opaque `calls[].handles` |
| B3 original: `tmp/connect-media-truth-b3-execution/approval-media-truth-b3-28-9057a98a-af85-4f30-bf3a-c0ac8671017c.json.evidence.json` | `0dcb9e021be24ae8cebf105938c11155a859013f619892f1663209149d077b55` |
| B3 retained wrapper | `ef7dd20af2b379003132d4ab4d3a2743cbd914a6525db6ef3f13a64425ce11f9`; embedded runner evidence deep-equals the original |
| Report 29 | `bfa7f220b22d8ee63887a4d90189a8978ef9a51a197b7272e7388ebc317c7513`; unchanged |
| B3 readiness | `2855b305984a990ef7521d3e229aa1d051e64ee7ca2a25a59afad48593390771`; all 73 sources and 434 artifacts still match |

The [audit receipt](stream-staging-connect-b3-termination-classifier-audit.json) contains exact projections, source/input hashes, original-verdict replay, proposed findings and test results. SHA-256: `6a10e4ff3fc68ce0ba1117df824fa5cca1ccbbde76d0c5404e1c5006022dcc66`.

Report 21's original `tmp/connect-media-truth-preparation/local-browser-results.json` and report 28's `tmp/connect-media-truth-b3-preparation/local-control-1/local-browser-results.json` both retain COMPLETE and all five calibration/fresh/negative/delayed controls, with their respective 30/73 source inventories. They are historical local Opus evidence, not additional Stream executions. Report 19 is an investigation of the retained boundary experiment, not another media run. Report 18's full provider suite was INCOMPLETE because the third fixture's restart failed; that does not erase the completed second-call timer observations.

## 2. Exact B3 termination reconstruction

B3 call: `betweener_connect:92e5a845-e3ea-4456-8571-3e2e6e133d57`. Provider session: `d31c081c-6e79-4203-8d1c-6c00a73320da`. A/B bindings are the distinct owned users and raw session IDs retained in `runnerEvidence.peers` and each phase's `bindings`. No session restart or automatic rejoin occurred.

All labels below are **2026-10-30 UTC**. Provider timestamps are provider assertions. Parent monotonic brackets bound commands and observations. Raw SFU events use their Node child's observation clock; RTP last-packet values use the browser stats clock. UTC correlation does not synchronize these origins or establish server-enforcement latency.

| Event | Retained time / bracket | What the time means |
|---|---|---|
| Provider session start | **14:30:34.078** | Final provider `session.started_at`, not call creation |
| Configured deadline | **14:31:34.078** | Provider `timer_ends_at`, exactly 60 seconds after final session start |
| Provider call ended | **14:31:34.828** | Returned `ended_at`; not measured last forwarding time |
| Last observed not-ended GET | Completed **14:31:35.549** | Returned a non-ended call/session despite the later-reported earlier end timestamp |
| First completed ended GET | Parent **14:31:35.801–35.847**; HTTP headers **35.846** | Returned `ended=true`, `session=null`, users empty; phase-1 trigger at parent completion |
| First SFU `callEnded`, A / B | **14:31:35.813 / 35.814** | Raw child dispatch observation, not SFU generation time; both first captured by parent **36.000** |
| Fresh phase-1 nonces | Both generated **14:31:35.848** | Parent monotonic order is after completed ended GET |
| Source commands | Parent **14:31:35.849–35.973** | New synthetic source scheduling; not wire-transmission time |
| First phase-1 stats | Parent **14:31:35.973–36.000** | A 744192 bytes / 3008 packets; B 745579 / 3020 |
| First observed closed DTLS | A subscriber and both publishers: **35.973–36.000**; B subscriber: **36.250–36.276** | Stats report DTLS closed while aggregate PC and ICE still report connected |
| Last observed B receiving increment | Parent **14:31:36.250–36.276**, following **35.973–36.000** | B reaches 745660 / 3021: **+81 bytes / one packet**; no further increment |
| Signaling WebSocket close, both | **14:31:36.817** | Observed code 1000, clean=true; unfamiliar reason text remains redacted |
| Last sample with all aggregate PCs connected | Parent **14:31:42.366–42.391** | Does **not** mean DTLS remained usable; it was already reported closed |
| Final phase-1 stats | Parent **14:32:34.856–34.877** | 217 samples; 59029.8796 ms from trigger; receiving totals flat as above |
| Explicit backend-end comparison | Parent **14:32:35.050–35.149**; `mark_ended` HTTP **35.092–35.148**, status 201 | Actual API acknowledgement on the same already-ended call |
| Fresh phase-2 nonces | **14:32:35.149**, after ACK by parent monotonic ordering | Separate targets; not reuse of phase 1 |
| Phase-2 measurement | First **14:32:35.283–35.309**, final **44.270–44.292** | 34 samples; 9142.8897 ms from ACK; transports already failed throughout |
| Voluntary local cleanup | Began **14:32:44.481** | After both observation windows; cannot explain their earlier cessation |

Actual aggregate state transitions were sampled, not recorded by instantaneous state-change callbacks:

| Peer / transport | Last connected sample | First disconnected sample | First failed sample |
|---|---|---|---|
| A publisher | 14:31:42.914–42.935 | **14:31:43.186–43.206** | 14:31:53.068–53.088 |
| B publisher | 14:31:42.366–42.391 | **14:31:42.641–42.662** | 14:31:52.515–52.543 |
| A subscriber | 14:31:43.186–43.206 | 14:31:43.456–43.474 | **14:31:53.340–53.363** |
| B subscriber | 14:31:42.641–42.662 | 14:31:42.914–42.935 | **14:31:52.795–52.818** |

These bracket the first observations of the new state; transitions can occur between polls or within a bracket. The later failed label is not the first possible media-stop time. At the final tail, all four transport rows report DTLS `closed`, ICE `failed`, no selected candidate pair; the aggregate PC reports `failed` while its separate `iceConnectionState` property is `disconnected`. The collector reads these asynchronously and preserves the layers separately; do not normalize them into an invented atomic transport transition.

### Receiving and fresh-content times

A's inbound SSRC **2254939872**, stats ID `IT01A2254939872`, stays at **744192 / 3008** throughout phase 1. Its last-packet timestamp is **1793370695812.625**, approximately **14:31:35.812625Z** on the browser clock. The latest *observed cumulative growth* for A is only bounded by the earlier calibration snapshot and first phase-1 snapshot: the harness did not continuously poll RTP during its metadata-wait loop. The last-packet field gives a finer receiver-reported arrival label, not packet-generation time.

B's SSRC **1150319763**, ID `IT01A1150319763`, advances once from **745579 / 3020** to **745660 / 3021**, then stays flat. Its final last-packet value is **1793370695994.378**, approximately **14:31:35.994378Z**. Do not substitute the later parent sampling time **36.250–36.276** as the packet's arrival or generation time. Its contents, retransmission status and generation age are unknown.

Phase-1 targets were A `1c6ef03870398c07d56f8fd5910e7994` and B `3013828da30101cca5428fccc6543721`. Phase-2 targets were A `f04798b8755c927f4ca2d07b3c121fab` and B `0ad6075fb39344b72c48bd4993c8eb98`. Neither independent receiver decoded any target frame at any confidence in either phase. Both earlier four-second, CRC-valid opposite-sender control frames passed confidence thresholds. Exact generation, scheduling and sampling brackets are retained under `phaseStats` in the audit receipt.

## 3. What the SFU event and transport closure establish

The raw session validates provider-returned HTTPS/WSS host suffixes, authenticates the coordinator/SFU join, decodes `SfuEvent`, and binds each socket to its owned CID/user/raw-session context (`scripts/lib/connect-stream-sfu-session.cjs:79`, `:111`, `:125`). This supports **an event observed on the authenticated session path**, not a separately signed attestation proving the provider's entire internal state.

At `:142`, `callEnded` sets evidence flags only. Socket closure records a sanitized event at `:112`; it does not call local cleanup. The harness's explicit close at `:73` runs after measurement through `scripts/lib/connect-media-truth/experiment.cjs`'s final cleanup. There is no official `Call` object or normal SDK event handler driving the raw peers. Current installed `node_modules/@stream-io/video-client/src/events/call.ts:37` ordinarily calls `leave()` for SFU end; that cooperative behavior was bypassed deliberately in both experiments.

**Important retained-field limit:** generated protocol `events.ts:909` has `CallEnded.reason`, with enums in `models.ts:1209`. The raw logger retained the event type/time but not that reason payload. It cannot establish whether the SFU labeled this ENDED, SESSION_ENDED, KICKED or another reason. “Timer-associated termination” is supported by timing and no prior explicit end; a precise server reason or root cause is not retained. The socket's clean-close flag also does not independently prove why it closed or a universal remote enforcement action.

The WebRTC standard defines aggregate failed/disconnected states in terms of ICE/DTLS state, not an authorization decision. A closed DTLS transport and later failed PC are consistent with remote transport teardown; absent packet/server traces they do not identify the exact initiator or server enforcement instant. [W3C WebRTC state definitions](https://www.w3.org/TR/webrtc/#dom-rtcpeerconnectionstate).

## 4. Report 18 versus B3

| Dimension | Report 18 active timer fixture, 2026-10-29 | B3, 2026-10-30 |
|---|---|---|
| App/type; timer | 1731011 / `betweener_connect`; effective limit 60 | Same; effective limit 60 |
| Final start / deadline | 06:38:45.198 / 06:39:45.198 | 14:30:34.078 / 14:31:34.078 |
| Provider ended timestamp | 06:39:46.823 | 14:31:34.828 |
| First ended observation | Driver label 06:39:49.371 | Completed parent bracket 14:31:35.847 |
| Last two post-ended receiving samples | A 784410→810366 bytes, 3112→3215 packets; B 783907→810115, 3110→3214 | A flat; B one early +81-byte packet, then flat for the remaining window |
| SFU end indication | Both flags false through final timer sample | Both typed events retained, then clean WSS closure |
| Media state | Publisher/subscriber aggregate states connected in final samples; lower-layer detail unavailable | Early closed DTLS; later aggregate disconnect/failure |
| Fresh-content instrumentation | Continuous synthetic tone; aggregate receive counters; no post-ended nonce | Blind remote FSK decoder, fresh 128-bit targets, per-SSRC timestamps and stats |
| Observation length | Final ended labels 06:39:49.371 / 51.428; then explicit recovery censored timer-only observation | Approximately 59 seconds after ended read before explicit end |
| Application intervention before expiry | DB revoke with local `.end()` exception before HTTP; held coordinator join; pending end obligation | Provider-only diagnostic; no DB revoke or failed-end injection |
| Historical conclusion | Timer fallback FAIL for tested receiving cutoff; suite INCOMPLETE on third-call restart | Both formal media phases INCONCLUSIVE; no fresh target observed |

Report 18's `sampledAt` is created **after awaiting provider GET and before awaiting stats**, at `scripts/test-connect-revocation-boundary.cjs:150`. It is not a completed stats bracket. Original message IDs 101/102/103/104 are IPC response IDs, not stable RTCStats IDs. There is no per-SSRC timestamp or last-packet capture in that original aggregate path. Its **+25956/+26208 bytes and +103/+104 packets** establish continued reported reception after ended reads; they cannot prove that the source generated those packets after the read. Report 19 already preserves that distinction. No post-recovery receiver sample was retained for that second call.

The normal backend-end control in Report 18 remains useful: five samples at labels 06:38:26.064–30.136 retained SFU end flags and fixed **76197/76828 bytes**, while local sender counts advanced. Its brief connected observation does not establish that transports would remain connected indefinitely. Comparing that roughly four-second window with B3's eventual failure nearly a minute later is not a controlled test of different permanent connection lifetimes.

Stream documents a session-based duration limit and participant removal at expiry; it does not establish a fault-independent absolute consent lease or packet-cutoff SLA here. It separately distinguishes reusable call IDs, sessions and explicit call end. Neither retained run proves the custom type's current lifecycle mode changed. [Session timers](https://getstream.io/video/docs/javascript/ui-cookbook/session-timers/), [call lifecycle](https://getstream.io/video/docs/api/call-lifecycle/).

## 5. Ranked explanations for the divergence

These hypotheses can overlap. There is no controlled A/B intervention or server trace identifying a cause.

| Rank | Hypothesis | Support, contrary evidence and minimum discriminator |
|---|---|---|
| 1 | Different delivery/execution of the provider's timer-to-SFU termination path | Best fit to the actual difference: earlier metadata-only end with reception growth; B3 both SFU events, DTLS closure and quiescence. This does not prove a provider fix, race, deployment or regional issue. Need provider-side event/session traces or a precise contract; no such trace was obtained or support message sent. |
| 2 | Session/lifecycle or coordinator interaction changed the path | Report 18 performed an extra held coordinator join after revoked DB state; B3 joined once per peer and had no failed-end workflow. Both final session IDs/deadlines were stable within their measurements. No actual restart succeeded in the earlier third call, and its broken probe cannot explain the second call. Need original session/coordinator trace; do not infer a lifecycle-mode change from distinct sessions. |
| 3 | Request/member differences selected different server behavior | B3 explicitly supplies more disabled feature objects, frame interval 2 and full resolution; earlier fixtures inherited most defaults, used a third creator and initially invited members promoted after admission. Both obtained real media, and both shared type hashes equal `12e74f5fca79a1dea2b48a8c950bbc3a2189a3ffdf9e04ccb43d28c4e4533a7e`. No demonstrated setting explains the divergence. A controlled request comparison or provider trace would be needed; do not change policy speculatively. |
| 4 | Instrumentation/protocol/runtime or sampling differences | B3 has longer observation, typed event history, per-SSRC clocks, PCM decoding and an FSK source; the earlier path used aggregate counters and a tone. Earlier normal-end event detection worked, and the inspected receive collector recomputes totals without accumulating old snapshots. No immutable Report 18 run-start harness hash establishes byte-identical old code. Pinned server SDK 0.7.63 and generated protocol 1.62.0 are inspected; no demonstrated version incompatibility explains the completed timer path. |
| 5 | Earlier queued/retransmitted RTP or delayed stats obscured eventual cessation | Plausible for continued counter growth without nonce/arrival attribution. It cannot be reduced to already-buffered speaker playback: the metric is reception, not playout. Earlier sampling ended before a timer-only plateau, so a later cessation remains unknown. Need source-fresh content or packet attribution from that run, which cannot now be reconstructed. |
| 6 | Unrelated common network/browser loss happened near B3's end | Cannot be excluded without independent network/server telemetry. Both authenticated end events, paired clean WSS close, early closed DTLS and running source/decoder processes make generic unexplained ICE loss a poorer account of the full observation. A PC failure alone would not provide that evidence. |

Voluntary raw-client cleanup is contradicted by the measured ordering and frozen handler source. Native Live/Connect SDK ownership is absent from these raw processes and cannot explain these provider-only results. B3 establishes no provider-wide behavioral change, no historical 400 root cause and no reproducible upper exposure bound.

## 6. Existing classifier audit

`scripts/lib/connect-media-truth/verdict.cjs` remains byte-identical to B3 preparation:

- Lines **12–47** require a valid trigger, clock uncertainty, controls, bindings, fresh target/scheduling, complete usable sample fields and no process/cleanup failures.
- Lines **49–60** detect a qualified remote target before the final cutoff checks. A matched fresh frame already outranks the later transport-tail rejection.
- Lines **61–86** require the original full window, stable final tail, live decoder/source, advancing publishers and receiver-row/track identity. Line **84** requires both aggregate PC states connected throughout that tail, else `transport_closed_or_unavailable`.
- It does not inspect `samples[].signaling`, typed SFU events, socket ordering, explicit pre-ACK media viability or captured DTLS/ICE transport rows.

Both original B3 phase reason lists contain **only two `transport_closed_or_unavailable` entries**, one per peer. Replay returns both exact historical verdict objects. This is faithful execution of Report 21's specified contract, not evidence corruption or an arithmetic bug. Removing line 84 would incorrectly admit unrelated transport failures and voluntary closures; it is not the proposed repair.

There are two distinct design gaps:

1. The summary collapses SFU-signaled session termination and unexplained loss into the same final enum. Preserve INCONCLUSIVE but expose signaling, receiving and transport observations separately.
2. Aggregate `connectionState=connected` alone is insufficient to describe a usable connected media path. B3's first samples already show closed DTLS. The proposed connected-peer category also checks lower-layer state. This strengthens that category rather than weakening it.

A separate synthetic counterexample shows that the early return at line 48 can hide a valid earlier fresh-content identification when a later process error makes the overall receipt incomplete. Future design should preserve independently validated positive proof as an evidence axis even when the overall run remains incomplete. This did not affect B3: it contains no fresh target frame. It does not authorize changing any historical verdict.

## 7. Proposed taxonomy and compound evidence

Use **multiple axes**, since end signaling and fresh media can coexist. No finding implies a universal provider guarantee.

| Requested category / recommended name | Required meaning |
|---|---|
| `OBSERVED_SFU_TERMINATION` | Typed end event on each bound authenticated SFU session path, valid event/capture timestamps and identity context. Signal observation only; never implies stopped forwarding. Reason remains unknown when not retained. |
| `OBSERVED_MEDIA_CESSATION` → **`OBSERVED_RECEIVER_RTP_QUIESCENCE`** | Earlier independent media controls; fresh post-trigger source scheduling; full predeclared window; current per-SSRC/track-bound flat receiving tail; live source/decoder instrumentation; no qualified fresh target; no voluntary cleanup or failed measurement process. For the closed-transport branch, also require correlated SFU events and clean socket closure before observed aggregate PC failure. Describes these receivers/flows/window, not a causal security cutoff. |
| `OBSERVED_CUTOFF_WITH_CONNECTED_PEERS` | Original complete negative requirements plus usable connected PC, DTLS and ICE layers in the stable tail. Preserve original timing/confidence/identity requirements. No server mechanism or all-session guarantee follows. |
| `INCONCLUSIVE_TRANSPORT_FAILURE` | Loss lacking sufficient trusted signaling/ordering or usable measurement. Preserve specific subreasons for unrelated/unknown ICE, browser/process loss, voluntary close and transport unavailability before the trigger. |
| `FRESH_MEDIA_AFTER_END` | Independently decoded qualified random post-trigger target, correct opposite sender/track identity, CRC, duration/confidence and valid generation/transmission/observation ordering. Overrides a negative quiescence claim even if end signaling also exists. Incomplete later observations do not erase an already valid proof. |
| Additional `POST_END_RTP_GROWTH_CONTENT_AGE_UNKNOWN` | Increasing receiver counters after ended metadata without fresh-content attribution, as in Report 18. Neither silence nor proved fresh generation. |

Mapping A–F: **A** unrelated network loss → uncorroborated transport failure; **B** browser/process failure → unusable negative measurement; **C** voluntary disconnect → contaminated cutoff observation; **D** authenticated SFU termination plus corroborated closure/quiescence → observed signaling and bounded receiver quiescence, causal attribution unresolved; **E** metadata end without SFU termination → metadata only, then classify measured receiving separately; **F** failure before ended evidence → pre-existing loss, no causal end comparison.

The separate [proposal module](offline-30/termination-analysis-proposal.cjs) and [tests](offline-30/termination-analysis.test.cjs) implement this offline decision model. They import only the existing pure classifier/matcher, never the provider. Source-reviewed context explicitly records authenticated-session-path and non-cooperative-harness assumptions; these are not inferred from a bare event name or claimed to be independently signed evidence. The model is not a production input validator and is not installed in any runner.

On the original B3 phase 1 it adds observed signaling, receiver quiescence and correlated transport loss, while retaining historical INCONCLUSIVE. Phase 2 reports transport unavailable before its trigger and no usable causal comparison. Old phase-1 SFU events appearing again in cumulative phase-2 history are **not** new evidence of the later end operation.

## 8. Packet, PCM and statistics limits

W3C distinguishes the local statistics-generation timestamp from the receiver's last-packet timestamp. Reception counters include retransmissions; they are not source generation times. Stats objects may remain available after closure, and caching is permitted under specified update rules. Fresh calls and increasing timestamps reduce stale-snapshot ambiguity but do not turn a dead transport's local accounting into proof of SFU receipt. [W3C WebRTC statistics](https://www.w3.org/TR/webrtc-stats/).

In B3, A's `jitterBufferEmittedCount` is **2889600→2889600**; B's is **2895360→2901120** across phase 1. `concealedSamples` grows A **4704→2831520**, B **2029→2821805**; final `audioLevel` is zero. This is consistent with a short buffered tail followed by concealment/silence, not sustained received audio. No claim identifies which individual samples were authentic remote content solely from those aggregates.

Decoder callbacks/chunks continue because the AudioContext/worklet remains active. They can process silence or concealment. Local outbound counters also continue after closed DTLS; they are not evidence of packets reaching the SFU. Neither fact substitutes for remote nonce detection. The single late B packet defeats an instantaneous-zero-packets claim but does not defeat a later measured flat tail. It must not be labeled a fresh challenge, a security bypass or an exact enforcement slack.

No complete packet capture, RTP sequence trace, sender packet-generation timestamp, SFU forwarding trace, separate coordinator WebSocket history or exact `CallEnded.reason` was retained. There is no defensible millisecond server-cutoff estimate or universal non-delivery proof.

## 9. Explicit-end comparison and minimum future experiment

B3's `mark_ended` ACK proves that the API accepted the operation on the same owned call. Its subsequent samples prove that already-stopped receiving did not resume during that window. They cannot show that explicit end **caused** earlier cessation, quantify its additional effect or compare its latency with timer termination. Both media transports had failed before the ACK; fresh local counters cannot restore a missing live control arm.

**No provider experiment is necessary to review or correct the analytical design.** Use these immutable receipts and offline cases first.

If an independent explicit-end measurement is later necessary, the minimum additional scope is **one separately approved fresh call and at most two newly owned synthetic identities/peers**, using a fresh namespace, the same hardened type/settings and no retries. Establish new remote controls and fresh content while all transport layers are usable; invoke explicit end early enough that its entire post-ACK window finishes before the configured timer deadline. Verify that deadline margin from actual session metadata; abort comparison on insufficient margin or pre-existing failure. Keep raw peers non-cooperative and measure after a new ACK-gated challenge. Do not reuse deleted B3 identities or its consumed approval. Do not implement, allocate or run this proposal now.

A future adaptive timer-first diagnostic should attempt its same-call end comparison only if a current pre-ACK remote control and usable transports establish that there is still media to terminate. If timer termination has already stopped the path, record **comparison unavailable** and finish cleanup; do not create a replacement automatically. Even a later stop after explicit end can overlap delayed timer enforcement, so it is a temporal association, not a clean timer-independent causal test. One irreversible session cannot supply two independent destructive interventions after the first has removed the outcome. Reusing an ended ID or resetting the timer would change the experiment. A new matched two-arm comparison is justified only if that distinct question is required and separately authorized.

## 10. Focused offline adversarial results

Command: `node --test docs/betweener-connect/offline-30/termination-analysis.test.cjs`. Final result: **30/30 PASS**, zero failures, exit 0; new proposal syntax check PASS. Log: `tmp/connect-termination-audit-30/focused-final-2.log`. The first isolated version passed 27/27; lower-layer and event-order cases were then added, and the final 30-case run followed the final proposal edit. Earlier logs remain retained.

| Cases | Observed offline behavior |
|---|---|
| Original B3; original Report 18 | Both original B3 verdicts replay unchanged; separate axes distinguish B3 quiescence from earlier unknown-age RTP growth |
| Clean signaled termination; unrelated ICE; browser/process failure; voluntary close/local cleanup | Only compound signaled evidence yields the descriptive quiescence category; contaminated negatives remain inconclusive |
| Stale stats; missing UTC/trigger; inverted brackets; incomplete window | Cannot establish cessation |
| Sender continues locally; SFU event without cutoff; cutoff without SFU event | Local sending/event alone insufficient; connected healthy negative evidence remains separately expressible |
| Early late packet; packet during final tail | First permits only later quiescence; second invalidates the stable tail |
| Fresh nonce despite metadata/events; incomplete window/later process failure | Valid fresh proof is preserved independently; no artificial negative PASS |
| Invalid CRC/sender/old nonce/weak confidence; missing controls/source/SSRC | Cannot establish qualified fresh proof or valid negative observation |
| Failure before trigger; event after failure; reversed event/close order | No attributed end-causal finding |
| Aggregate connected with closed DTLS; missing lower-layer stats | Cannot establish the proposed healthy connected-peer cutoff category |

Synthetic cases test decision boundaries, not a reconstructed provider implementation. No new browser media, network fault injection, SDK session, SQL driver, app build or native-device test ran. No owner approval or fixture reservation was authored. Tests read originals and use in-memory synthetic receipts; their input bytes are checked unchanged.

## 11. Engineering recommendation and preservation

Review the sidecar findings and taxonomy before any runtime integration. Keep the old verdict and new evidence axes separate in any future report. If implementation is later approved, add explicit pre-trigger media viability for comparisons, finite SFU reason capture, lower-layer state checks and timestamped local close/process/decoder health evidence. State-change callbacks would narrow observation gaps; they would still not reveal server packet generation or enforcement time. Do not add event-triggered client cleanup to the adversarial measurement.

The baseline contained **305 existing workspace files/absences**, including unrelated Circle/Live/package/migration work. They remain unchanged. All **507 prepared source/artifact records** (73 + 434), original B3 evidence/cleanup/lock/ledger, earlier boundary evidence and B1/B2 approvals/ledgers are preserved. This report, its audit receipt and two explicitly isolated proposal/test files are the only new repository artifacts. Ignored local files retain snapshots, extraction and test logs. The original classifier, approved B3 manifest/readiness and previously published verdicts were not edited.

The remaining security gap is unchanged: one observed timer-associated termination does not establish fault-independent bounded revocation, all-session enforcement, an immutable absolute lease, restart/rejoin resistance or native readiness. There is no evidence-supported provider-wide root cause for the divergence. Cleanup success is retained historical resource evidence, not new authenticated absence attestation. B3's execution allowance remains consumed; no ledger was reset or reused.

## 12. Final declarations

```text
CONNECT_B3_EVIDENCE_REVIEW = PASS
CONNECT_TIMER_SFU_TERMINATION = OBSERVED
CONNECT_TIMER_MEDIA_CESSATION = OBSERVED_WINDOW
CONNECT_CLASSIFIER_DESIGN = READY
CONNECT_HISTORICAL_B3_VERDICT = INCONCLUSIVE
CONNECT_M2A_SECURITY_GATE = BLOCKED
CONNECT_M2B_READY = BLOCKED
PROVIDER_WRITES = NONE
PRODUCTION_MODIFICATIONS = NONE
```

OBSERVED_WINDOW is scoped to these two measured receiver streams, valid controls, no fresh target detection and the retained flat tail; it does not attribute an exact server-enforced cutoff. READY means a separately tested analytical proposal suitable for review, not an installed classifier, execution approval or security release. **Provider requests, new calls and new identities in this audit: zero.**
