# Connect V1 analytical classifier design review

Date: 2026-10-30. Scope: **independent offline source/evidence review and isolated validation only**. No authenticated Stream request, provider fixture, database access, deployment, Live change or calling enablement occurred.

**Recommendation: A — keep the proposal an offline forensic tool for now.** Its separation of signaling, transport state and received-media observations is technically sound, and its supplementary interpretation of the original B3 receipt is defensible. Its implementation is **not ready for general runtime integration**: independent probes expose missing identity/chronology validation, an invalid fresh-frame attribution, a malformed-event exception and an overly permissive comparison-eligibility flag. Two additional limitations concern coverage annotation and the dataset-specific boundary extractor.

The original **30/30 tests still pass**. The independent review added **22 probes: 14 pass and eight fail their desired validation expectations**, retained explicitly as TODO failures. This is not a green acceptance result. The original proposal, its tests, both historical experiments and all published verdicts remain unchanged.

**B3: SFU termination CORROBORATED; receiver quiescence OBSERVED_WINDOW; historical security verdict INCONCLUSIVE.** Neither supplementary finding establishes universal media cutoff or a consent-revocation security PASS. M2A/M2B remain BLOCKED and real calling remains disabled.

## 1. Proposal summary and reviewed inputs

Reviewed reports [18](18-connect-v1-revocation-boundary-decision.md), [19](19-connect-v1-independent-forensic-audit.md), [28](28-connect-v1-media-truth-b3-preparation.md), [29](29-connect-v1-media-truth-b3-execution-results.md) and [30](30-connect-v1-b3-termination-classifier-audit.md), the complete [isolated proposal](offline-30/termination-analysis-proposal.cjs), its [30 tests](offline-30/termination-analysis.test.cjs), original retained receipts, raw session/measurement source and existing security classifier/matcher.

The proposal calls the unchanged `classifyPhase`, retains that result under `historical`, and emits supplementary `signaling`, `media`, `transport`, `freshProof` and comparison-eligibility fields. It has no provider client and no security-gate writer. A reverse-reference search found no import of it in the inspected experiment/product runtime directories. It is currently an offline artifact.

| Input | Verified SHA-256 |
|---|---|
| Report 18 original `tmp/connect-boundary/provider-results.json` | `8c1d82141a5c5140c94ac2b65e2b09dca42ebbe1f0f8c87b852d6dacdffa501d` |
| B3 original `.evidence.json`, under `tmp/connect-media-truth-b3-execution/approval-media-truth-b3-28-9057a98a-af85-4f30-bf3a-c0ac8671017c.json.evidence.json` | `0dcb9e021be24ae8cebf105938c11155a859013f619892f1663209149d077b55` |
| B3 retained wrapper | `ef7dd20af2b379003132d4ab4d3a2743cbd914a6525db6ef3f13a64425ce11f9` |
| Report 30 | `f65c3ed1273930a7d6b7e0a04cffafb32e7d37313742eb26cca8287cc3f843e1` |
| Isolated proposal | `cac1eaff48317464ca519013596ef2cbad9bb6cf28aeb69ae4b590ed0b6fabc3` |
| Original 30-test source | `fe426d98e312d62f3e865c219c8e35398cc39c52d781ad9e1e763bdb73288b16` |

B3's wrapper deep-equals the original runner receipt. The earlier boundary wrapper equals its original after removing only opaque `calls[].handles`. Both original B3 verdict objects replay exactly. All **73** prepared source hashes and **434** preparation/historical artifact hashes still match. No approval was created, reused or evaluated for execution.

The [review receipt](stream-staging-connect-analytical-classifier-review.json), SHA-256 `51ead55fe711472f0017f53b132f4c964b596578abe782a96b1c632ee916eba7`, records inputs, original replay, supplementary outputs, independent B3 measurements and every counterexample's expected/actual result.

## 2. Taxonomy validation

The proposed **separate evidence axes** are appropriate. They should not become interchangeable states in a single progression toward security PASS.

| Observation | Defensible meaning | What it does not establish |
|---|---|---|
| Provider-ended metadata | A completed authenticated GET returned call-ended state | Packet cessation, session transport destruction or consent revocation at every media endpoint |
| SFU `callEnded` | An end indication was decoded on a particular bound authenticated session path | That every flow stopped, exact termination cause or a universal enforcement contract |
| DTLS `closed` | That local transport row reports its secure transport closed | Exact initiator, server forwarding time or all-session revocation |
| ICE disconnected / failed | Observed connectivity state for that layer | Whether authorization changed or which operation caused the loss |
| Aggregate PeerConnection state | Browser aggregation of connection-layer states | A direct measurement of media delivery or a guarantee that DTLS is usable |
| Flat inbound RTP counters | No further reported bytes/packets on the identified streams during a validated measured interval | Source generation age, absence of unmeasured flows or indefinite future silence |
| Qualified post-trigger nonce | Independently decoded fresh content, provided its identity and chronology are valid | Every kind of post-end media behavior or a general provider guarantee |
| Voluntary local cleanup | This harness stopped its own resources | Server-enforced cutoff against non-cooperative clients |
| Explicit backend-end ACK | The provider acknowledged that operation | That a later negative observation was caused by it, especially if media was already unavailable |

One clarification strengthens Report 30: aggregate `connected` with closed DTLS is **not necessarily an inconsistent snapshot**. The WebRTC aggregate-state definition permits connected or closed DTLS transports in that state. Asynchronous collection is another timing limit, but need not be invoked to explain B3's combination. Requiring connected DTLS/usable ICE for a proposed *healthy connected-peer* observation is a stricter analytical condition, not a redefinition of the browser enum. [W3C connection-state definitions](https://www.w3.org/TR/webrtc/#dom-rtcpeerconnectionstate).

`OBSERVED_RECEIVER_RTP_QUIESCENCE` is preferable to unqualified “media cessation.” Keep its receiver IDs, SSRC/track bindings and actual measured interval beside the label. Stats-generation time and last-packet reception time remain different clocks/measurements; neither identifies sender generation or server enforcement time. [W3C WebRTC statistics](https://www.w3.org/TR/webrtc-stats/).

## 3. Independent assessment of the original 30 tests

The original tests are useful decision examples. They cover ordinary missing-event/network loss, voluntary close, process failure, stale stats, source/decoder/SSRC deficiencies, fresh-target precedence, incomplete windows, event/close reversal, lower-layer state and both pinned historical receipts. They explicitly keep `universalSecurityPass=false` and leave historical verdicts intact. Freshly rerunning them returned **30/30 PASS**, exit 0.

They do **not** establish general avoidance of false supplementary findings:

- Most cases share one synthetic fixture and mutate one field. Its sparse times include a gap from 4000 to 55000 ms; it cannot validate continuous sampling coverage merely because it ends at the right time.
- Authentication/non-cooperation/process health are supplied as reviewed context booleans. These are assumptions, not independent cryptographic/session-identity verification performed by the classifier.
- Reversed end/close ordering is tested, but an end timestamp preceding its own join acknowledgement is not. Missing/duplicated event selection is also untested.
- Fresh-frame cases construct decoded records with a valid-CRC flag; they do not test that the record occupies a post-trigger PCM interval or has temporally valid receiver provenance.
- The original B3 phase-2 test correctly supplies its preceding failed snapshot. It does not test a future/stale supplied snapshot or an absent ACK against `explicitEndCausalComparison`.
- The historical-boundary test pins one correct dataset. It does not establish that the boundary projection classifies other datasets correctly.

These are primarily **input/provenance validation gaps in a reusable analytical tool**, not evidence that the frozen raw harness generated bad receipts or that its blind audio decoder actually misidentified a nonce. Report 30 already describes the model as unsuitable as a production input validator. That limitation must remain an enforced integration boundary, rather than an implicit promise that every caller will prevalidate everything correctly.

The test-quality declaration is **CONDITIONAL_PASS**: the existing examples and historical checks are meaningful, but their coverage is insufficient for general diagnostic integration or a “no false positives” claim. No finite fixture set proves a universal false-positive bound.

## 4. Confirmed defects and scope limits

New [independent tests](offline-31/analytical-classifier-review.test.cjs) operate on in-memory copies of the immutable originals. No altered experiment receipt was written. Each unmet desired validation expectation is kept visibly failing under TODO; no implementation was patched to make it pass.

| ID / proposal source | Reproduced behavior | Required direction before general reuse |
|---|---|---|
| **AR-1 — `analysePhase:63–88`** | Assigning both bindings the same raw-session ID still yields receiver quiescence/correlated loss. The positive-proof helper checks duplicate raw IDs, but the negative route delegates to a legacy check that does not. | Validate the pair's distinct user/session/track associations before corroborating independent receiver evidence. Do not use one validity policy for positive proof and a weaker one for negative corroboration. |
| **AR-2 — `signalEvidence:44–61`** | Setting an end event earlier than that same child's `joinResponse` still yields corroborated loss/quiescence. Only end-versus-close ordering and first-capture indices are checked. | Validate event provenance and chronology within its session/clock epoch, including join/control history and first capture. An event may legitimately precede a delayed ended GET; do not require the event to occur after that GET. |
| **AR-3 — `freshProof:17–41`** | A matching target attached to the earlier control's already-decoded PCM interval is accepted as `FRESH_MEDIA_AFTER_END` because its containing snapshot was fetched later. Its old receiver observation/sample interval is ignored. | Bind decoded content to valid per-track PCM/sample-clock provenance and a pre-trigger baseline, with explicit parent/browser clock bounds. Do not compare unrelated monotonic origins directly. Preserve genuinely valid earlier fresh proof when a later window fails. |
| **AR-4 — `signalEvidence:47–57`** | A malformed first `callEnded` followed by a valid one throws `TypeError`: `findIndex` selects a snapshot using a qualified predicate, then `find` selects its first unqualified event. | Select the exact validated event, validate arrays/stamps and return explicit incomplete evidence instead of throwing or silently accepting a different record. |
| **AR-5a/b — `explicitEndCausalComparison:101–102`** | A future-dated “prior” healthy snapshot returns `ELIGIBLE_FOR_REVIEW`. So does an absent backend ACK when a healthy prior snapshot is supplied. | Require an actual ACK and temporally valid, sufficiently recent pre-intervention media evidence. A healthy-looking PC snapshot alone is not an active remote-content control. Eligibility remains weaker than demonstrated causality. |
| **AR-6 — `fullWindow:101`** | After cropping a synthetic healthy trace to its final tail, `fullWindow` still echoes the input's true completion flag. | Separate the runner's completion assertion from measured capture span and coverage/gaps. This is an annotation/coverage-contract limitation, not proof that B3 violated its original thresholds. Any new coverage threshold requires separate review/preparation. |
| **AR-7 — `analyseBoundary:105–116`** | A synthetic boundary dataset with zero post-ended growth still receives the hard-coded `POST_END_RTP_GROWTH_CONTENT_AGE_UNKNOWN` label and historical timer FAIL. | Keep this a hash-bound Report 18 extractor, or derive findings from measured deltas and retain the original verdict from its own identified receipt. Do not promote a dataset-specific projection into generic classification. |

AR-3 deliberately constructs a contradictory serialized record while retaining its old `crcValid` flag. It demonstrates acceptance of inconsistent evidence, **not** a real physical decoder false positive, a successful attack on 128-bit challenge generation or actual fresh delivery in B3. AR-1/2/4 likewise concern contradictory or malformed inputs that are absent from the reviewed original. AR-5 is a misleading eligibility annotation, not an existing causal-cutoff PASS. AR-6/7 are narrower generalization limits, not defects in the actual pinned historical measurements.

A further architectural concern is coupling `usableNegative` to the legacy reason-string list: “only `transport_closed_or_unavailable`” acts as an implicit certificate that all other conditions passed. A future validated evidence model should expose structured validity facts and versions, with the historical verdict displayed separately. Do not copy or weaken the existing security classifier merely to supply those facts.

## 5. Independent validation results

Commands:

```text
node --test docs/betweener-connect/offline-30/termination-analysis.test.cjs
node --test --test-reporter=tap docs/betweener-connect/offline-31/analytical-classifier-review.test.cjs
node --check docs/betweener-connect/offline-31/analytical-classifier-review.test.cjs
```

| Check | Fresh outcome |
|---|---|
| Original proposal tests, unchanged | **30 passed / 30**, exit 0 |
| Independent supported-behavior checks | **14 passed** |
| Independent unmet desired validation expectations | **8 TODO failures**, AR-1–4, AR-5a/b, AR-6/7 |
| New test source syntax | PASS |
| Historical B3 security verdict replay | Both exact original INCONCLUSIVE objects match |
| Original file-byte equality | PASS before/after testing |

**The independent runner's exit 0 is not classifier acceptance:** Node excludes TODO failures from the ordinary failure exit status. The final log contains eight `not ok ... # TODO` results. `tmp/connect-analytical-review-31/probes-FSHxuy/independent-probes.json` records `unmetDesiredSafetyExpectations=8`. These were not repaired, suppressed or counted as passing expectations.

The 14 supported checks independently cover actual B3 bindings/events/tail, earlier measured increments, missing SFU events/unrelated loss, closed DTLS with aggregate connected state, sustained reception despite events, a synthetic temporally later target, frozen stats, out-of-order parent brackets, an incomplete window, delayed metadata completion, explicit end after existing failure, voluntary disconnect and absence of security-gate/universal-success output.

Selected logs are `original-30-tests.log` and `independent-tests-final.log` under `tmp/connect-analytical-review-31/`; the initial independent run remains retained. The final run followed a stronger malformed-event expectation and exclusive per-run probe output. It has the same 14 passing checks and eight unmet expectations; the proposal was unchanged. These tests exercise analytical decisions and contradictory-input handling. No new browser media, packet capture, network-fault injection, SDK provider session, SQL driver, native-device test or app build ran. The historical Opus and 290-test preparation results were not rerun or represented as new validation.

## 6. Historical B3 interpretation

The original B3 receipt does **not** contain the counterexamples above. Independent checks establish two distinct user/raw-session bindings, join-before-end-before-close ordering within each child's clock, current per-SSRC receiver tail timestamps, stable row identities/counters, no target frame, and cleanup beginning after measurement. Its wrapper and raw receipt match exactly; frozen source hashes support the reviewed authenticated/non-cooperative session path.

| Retained B3 observation, 2026-10-30 UTC | Supplementary conclusion / limit |
|---|---|
| Session start **14:30:34.078**, timer deadline **14:31:34.078**, call `ended_at` **14:31:34.828** | Provider-reported timing, not packet-enforcement times |
| First ended GET completed **14:31:35.847**; SFU end dispatches A/B **35.813 / 35.814** | Corroborated end signaling near the metadata observation; cross-clock UTC correlation does not establish an exact causal latency |
| First observed closed DTLS: A subscriber/both publishers in parent **35.973–36.000**, B subscriber **36.250–36.276** | Lower-layer shutdown is observed before later aggregate failure; no exact close initiator or SFU reason retained |
| Clean WSS closure both **14:31:36.817**, code 1000 | Corroboration of the termination sequence; not independently media proof |
| A **744192 bytes / 3008 packets** flat; B **745579 / 3020→745660 / 3021**, then flat | B has one extra 81-byte packet of unknown content/age, followed by receiver quiescence |
| Both aggregate PCs still connected in last common bracket **14:31:42.366–42.391**, later subscribers failed B **52.795–52.818**, A **53.340–53.363** | Aggregate state must not be substituted for usable DTLS or a packet-stop timestamp |
| Phase 1 **217 samples / 59029.8796 ms**, first-sample offset **125.2299 ms**, maximum inter-sample gap **268.9369 ms** | Actual trace has ongoing polling; it is not the sparse/cropped coverage counterexample |
| Fresh challenges generated after ended read; zero decoded target frames; independent earlier controls passed | No observed fresh challenge delivery; not universal non-delivery |
| Explicit `mark_ended` ACK completed **14:32:35.149**, after failed transports | API acknowledgement only; independent explicit-end effect remains unavailable |
| Local cleanup starts **14:32:44.481** | Does not explain earlier media loss; raw clients did not voluntarily terminate on the SFU event |

The requested aliases are defensible as **supplementary reviewed statements**:

```text
SFU_TERMINATION_OBSERVED
RECEIVER_QUIESCENCE_OBSERVED_WINDOW
```

They correspond to the proposal's `OBSERVED_SFU_TERMINATION` and `OBSERVED_RECEIVER_RTP_QUIESCENCE`; the code's enum names were not changed. Corroboration is scoped to the source-reviewed authenticated session path, not a separately signed provider-internal attestation. Receiver quiescence means the measured bound streams and retained stable tail, not every flow or an unlimited interval.

Neither `UNIVERSAL_MEDIA_CUTOFF_VERIFIED` nor `CONSENT_REVOCATION_SECURITY_PASS` follows. B3 is not a consent-revocation experiment: it did not perform a database revoke or suppress backend termination. Its original **INCONCLUSIVE** verdict is preserved, including phase 2's pre-existing transport failure. Repeated cumulative phase-1 events in phase 2 are not new end acknowledgements or new termination signals.

## 7. Earlier timer comparison and remaining divergence

| Measured condition | Report 18 active timer call | B3 |
|---|---|---|
| SFU event delivery | No `callEnded` flag in retained timer samples; normal-end control detected it | Typed end events on both raw session paths |
| DTLS | Not retained by the original aggregate collector | Closed in early post-ended samples |
| ICE | Separate ICE layer not retained; aggregate connected does not reconstruct it | Subsequent transport rows report ICE failed; aggregate ICE property reported disconnected in final snapshots |
| Received RTP | Post-ended A **+25956 bytes / +103 packets**, B **+26208 / +104** | One early B packet, otherwise flat receiving totals |
| Session/call ending | Final session timer start **06:38:45.198**, deadline **06:39:45.198**, call ended **06:39:46.823**; session absent on ended reads | Final start/deadline above; session absent on ended read |
| Exact session-ended/SFU-enforcement time | Not established by absent session or call-ended timestamp | Also not established; separate local SFU/DTLS observations provide stronger corroboration |
| Raw peer behavior | Measured peers intentionally ignored end cleanup | Same non-cooperative design; no local cleanup until measurement finished |
| Instrumentation | Aggregate counters, driver labels before awaiting stats, no content nonce or last-packet timestamp; no immutable run-start harness hash | Per-SSRC clocks/transport rows, independent decoder, new nonces, parent IPC brackets and typed event history |
| Observation/intervention | Roughly two seconds between last two ended labels; forced backend recovery censored eventual timer-only behavior | Approximately 59 seconds after ended GET, then an already-censored explicit-end comparison |

Report 18's `sessionEnded=false` alongside `session=null` was a serializer convention, not proof of a still-active session. Its `sampledAt` label follows provider GET and precedes stats completion. Its growing counters establish continued reported reception, but do not establish when those packets were generated. B3's last-packet values likewise describe receiver-reported arrival, not source generation.

**Ruled out within the inspected/measured scope:** metadata and receiving cutoff are interchangeable; positive sender counters alone prove remote delivery; B3's voluntary final cleanup caused its preceding quiet interval; React Native/Live ownership caused these raw-process observations; pure speaker playback alone explains increasing inbound reception counters. The inspected aggregate collector recomputes totals, so a simple prior-total accumulation bug is not supported. The earlier timer-only “received SFU end but deliberately ignored it” explanation is contradicted by its retained flags, subject to that older capture path's completeness.

**Still unverified:** differing provider timer-to-SFU execution/delivery, race or transient behavior; session/coordinator interactions, including the earlier held coordinator rejoin; effects of more explicit B3 settings/member-creation choices; earlier queued/retransmitted traffic or delayed statistics; runtime/protocol/instrumentation differences lacking an immutable old harness baseline; and unrelated common network loss near B3's termination. Same app/type and matching shared call-type hashes reduce a simple shared-policy-change explanation but do not attest all provider state or internal behavior.

There is no evidence identifying a provider fix, a specific SFU defect, lifecycle-mode change, region/shard cause or browser bug. DTLS/ICE *measurement availability* differs; a measured difference in those layers' actual earlier states cannot be claimed where those fields were absent. Preserve both historical outcomes.

## 8. Recommended integration boundary

| Option | Recommendation |
|---|---|
| **A — offline forensic tool** | **Use now**, on hash-verified known receipts with explicit manual validation of identity/chronology and scope. Keep the reviewed version frozen; report its known limitations. |
| **B — supplemental diagnostic** | Suitable future direction only after separately authorized offline hardening and another review. It must consume validated finalized evidence, emit versioned supplementary facts/quality/reasons and retain the parent receipt hash. |
| **C — replace existing classification** | **Not justified.** The original connected-peer contract and historical verdict remain independent. No supplementary label may be mapped automatically to security PASS or an enabled gate. |

For a future B design, keep the diagnostic out of admission, token issuance, termination, watchdog and cleanup decisions. It should not control observation windows, retries, resource allocation or security-gate state. Preserve the existing security verdict as its own field. Separate provider metadata, SFU events, DTLS, ICE, aggregate state, RTP/content facts and local actions rather than promoting one layer's state into another.

Validation must bind call/user/raw-session/receiver/SSRC identities and clock epochs, select exact qualified events, tolerate malformed input by returning explicit incomplete evidence, validate actual comparison ACK/preconditions, and distinguish runner completion from sampled coverage. Fresh positive proof needs its own valid provenance; do not erase it merely because a later negative window is incomplete. The boundary-specific historical extractor should stay explicitly pinned or be redesigned before general reuse.

Runtime integration remains **NOT_AUTHORISED**. These recommendations neither implement it nor request a provider execution.

## 9. Residual risks and minimum next action

The minimum next action is a **separate offline hardening change** addressing AR-1–5 and clarifying AR-6/7, then converting the eight TODO expectations into ordinary passing tests and repeating independent review. Preserve confidence, duration, clock-uncertainty, identity and adversarial non-cooperation requirements. Do not change thresholds to obtain a more favorable finding. No provider run is necessary for this work.

Even a corrected supplemental tool would not resolve exact server enforcement time, all-session revocation, an immutable absolute lease, restart/rejoin resistance, provider fault independence, a finite product consent-revocation bound or native-device ownership. Earlier positive controls plus source/decoder liveness strengthen a bounded observation; callbacks can continue processing concealment/silence, and sender accounting can advance with closed DTLS. Neither substitutes for independent received content.

The independent explicit-end experiment remains only a future proposal from Report 30. Its necessity and separate owner approval must be assessed after offline review; no new fixture is needed to prove the classifier defects found here. Consumed B3 approvals/ledgers remain consumed.

## 10. Preservation and declarations

All **309 original workspace files/absences** and **507 source/artifact records** remain unchanged, including the original classifier, Report 30 proposal/tests/receipt, earlier reports/evidence, all 73 B3 source hashes, 434 preparation/historical artifacts and consumed execution records. The B3 lock/ledger and cleanup artifacts remain intact. No unrelated Live/Circle/package/migration work was modified.

Only this report, the new review receipt and one isolated independent test file were added to the repository. Ignored local files retain snapshots and test/probe logs. No proposal repair, runtime integration, authenticated API request, provider user/call creation, shared configuration change, database operation, deployment or calling enablement occurred. Public W3C documentation was consulted; no authenticated provider service was contacted.

```text
CONNECT_ANALYTICAL_CLASSIFIER_REVIEW = PASS
CONNECT_CLASSIFIER_TEST_QUALITY = CONDITIONAL_PASS
CONNECT_B3_SFU_TERMINATION = CORROBORATED
CONNECT_B3_RECEIVER_QUIESCENCE = OBSERVED_WINDOW
CONNECT_HISTORICAL_B3_VERDICT = INCONCLUSIVE
CONNECT_RUNTIME_INTEGRATION = NOT_AUTHORISED
CONNECT_M2A_SECURITY_GATE = BLOCKED
CONNECT_M2B_READY = BLOCKED
PROVIDER_WRITES = NONE
PRODUCTION_MODIFICATIONS = NONE
```

Review PASS means this review was completed, **not that the proposed implementation passed general acceptance**. Test quality remains conditional on fixing the recorded gaps. Corroborated/window observations are supplementary findings on this immutable B3 receipt, not enforceable security guarantees. Keep real calling disabled.
