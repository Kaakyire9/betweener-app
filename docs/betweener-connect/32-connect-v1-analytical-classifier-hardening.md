# Connect V1 offline analytical classifier hardening

Date: 2026-10-30. Scope: **separate offline implementation, immutable receipt replay and isolated validation**. All eight unmet Report 31 expectations are repaired in `offline-32/`. The hardened suite passes **84/84 ordinary tests, zero TODOs**. The original Report 30 proposal, Report 31 probes, Media Truth security classifier and historical verdicts are unchanged.

**B3 still has historical security verdict INCONCLUSIVE in both phases.** Supplementary replay corroborates timer-associated SFU signaling and bounded receiver quiescence. Report 18 still records post-ended RTP growth and its original timer failure. Neither result establishes universal cutoff or a consent-revocation security PASS. M2A/M2B remain BLOCKED; real calling remains disabled.

The [hardening receipt](stream-staging-connect-analytical-classifier-hardening.json) records source hashes, before/after counterexamples, structured historical projections, validation logs and preservation results. SHA-256:

```text
164fa0914dcfeb1b4616ec96bfd889bc71d9ea6c4a9bffc30c5f6a6931fb6afb
```

## 1. Baseline and evidence integrity

Reviewed reports [18](18-connect-v1-revocation-boundary-decision.md), [19](19-connect-v1-independent-forensic-audit.md), [28](28-connect-v1-media-truth-b3-preparation.md), [29](29-connect-v1-media-truth-b3-execution-results.md), [30](30-connect-v1-b3-termination-classifier-audit.md) and [31](31-connect-v1-analytical-classifier-review.md); the original proposal/tests and independent probes; original B3/boundary receipts; and the actual security classifier, evidence matcher, experiment, browser/audio collector and raw SFU session contracts.

Before implementation, all **73 B3 prepared sources, 434 preparation/historical artifacts and 17 review input records** matched their expected hashes. The workspace snapshot captured **312 existing files/absences**, including unrelated dirty work. These checks were repeated after implementation. The 524 protected records include overlapping references; they are not 524 unique files.

| Preserved input | Verified SHA-256 |
|---|---|
| `offline-30/termination-analysis-proposal.cjs` | `cac1eaff48317464ca519013596ef2cbad9bb6cf28aeb69ae4b590ed0b6fabc3` |
| `offline-30/termination-analysis.test.cjs` | `fe426d98e312d62f3e865c219c8e35398cc39c52d781ad9e1e763bdb73288b16` |
| `offline-31/analytical-classifier-review.test.cjs` | `18a3178787dda3a40178dfa4e0bcadc3b815fb3db3e71b34a1d41d1335a73954` |
| `scripts/lib/connect-media-truth/verdict.cjs` | `da310d7ef131d7df75cf058f152f3cbcd7b1c5d50554ece8094ba96aa09eba2a` |
| Original B3 `.evidence.json`, approval stem `media-truth-b3-28-9057a98a-af85-4f30-bf3a-c0ac8671017c` | `0dcb9e021be24ae8cebf105938c11155a859013f619892f1663209149d077b55` |
| `tmp/connect-boundary/provider-results.json` | `8c1d82141a5c5140c94ac2b65e2b09dca42ebbe1f0f8c87b852d6dacdffa501d` |

The B3 canonical evidence wrapper remains `ef7dd20af2b379003132d4ab4d3a2743cbd914a6525db6ef3f13a64425ce11f9`; Report 31's receipt remains `51ead55fe711472f0017f53b132f4c964b596578abe782a96b1c632ee916eba7`. The original B3 lock, ledger, cleanup records and consumed approval are preserved. Readiness's existing **read-only** hash/inventory/artifact guard still passes; no runner launch, reservation or execution authorization followed it.

## 2. Repair matrix and before/after counterexamples

The unchanged original review still reproduces its eight TODO failures against Report 30. The new [ported review](offline-32/ported-review.test.cjs), lines 120 onward, retains those eight desired assertions as **ordinary tests against the hardened implementation**. None was removed, skipped, weakened or treated as an accepted TODO.

| Expectation | Original counterexample result | Hardened result and repair |
|---|---|---|
| **AR-1: distinct identities** | Duplicate raw-session bindings produced receiver quiescence | **INCONCLUSIVE.** One identity policy validates call/CID/provider session, distinct user/raw-session associations, sender/receiver tags, tracks, stats row IDs, SSRCs and browser epochs before either positive or negative corroboration. A contradictory supplied ended-session ID is rejected; an ended read may legitimately omit the session. |
| **AR-2: chronology** | Same child's `callEnded` preceding its own join produced quiescence | **INCONCLUSIVE.** Require valid session provenance and one join ACK, then ordered exact events within that child's clock/history. Delayed ended GET remains valid; the SFU event need not follow it. |
| **AR-3: fresh PCM** | Relabelled control PCM became fresh media | **No fresh proof.** Require a pre-trigger baseline, a post-transmission receiver anchor, actual PCM interval and compatible sample/worklet/browser clocks, plus nonce/CRC/phase/sender/confidence checks. Reject reassigned intervals and stale/future observations. |
| **AR-4: malformed events** | Missing stamp followed by a valid event threw `TypeError` | **No throw; INCONCLUSIVE with structured INVALID reasons.** Validate the exact event objects, arrays, cumulative histories, duplicates and contradictions. No unqualified second selection or event substitution. |
| **AR-5a: future prior sample** | `ELIGIBLE_FOR_REVIEW` | **UNAVAILABLE.** Require a recent pre-intervention sample pair, same binding, valid parent chronology and measured source/receiver progress. Future evidence is invalid. |
| **AR-5b: absent ACK** | `ELIGIBLE_FOR_REVIEW` | **UNAVAILABLE.** Require verified successful same-call/session ACK within the intervention bracket. Earlier failure or SFU termination also prevents causal comparison. |
| **AR-6: actual coverage** | Cropped tail retained `fullWindow=true` | **`fullWindow=false`.** Preserve the runner claim separately; calculate observed start, elapsed time, sample span, gaps, tail span, freshness and liveness. |
| **AR-7: boundary extraction** | Flat synthetic counters inherited growth and historical FAIL | **`NO_POST_END_RTP_GROWTH_OBSERVED`.** Generic extraction calculates measured deltas and never attests a historical verdict. Only the exact pinned Report 18 bytes receive their retained historical FAIL annotation. |

Positive synthetic fixtures in the port received explicit reviewed-harness context and coherent worklet/trigger links required by v2. Their expected decisions and original confidence/duration requirements were retained. They are decision-boundary fixtures, not new physical audio measurements.

## 3. Exact file changes and integration boundary

Only these **ten isolated source/test files**, this report and its JSON receipt were added:

| New file under `docs/betweener-connect/offline-32/` | Responsibility |
|---|---|
| [contract.ts](offline-32/contract.ts), `:7`, `:19`, `:65` | Versioned facts, bounded input helpers, explicit profile and participant/context types |
| [validation.ts](offline-32/validation.ts), `:4`, `:47`, `:67`, `:94` | Call/session/participant binding, triggers, per-snapshot identity, live stats and earlier positive controls |
| [signaling.ts](offline-32/signaling.ts), `:5` | Exact SFU event selection and cumulative history validation |
| [media.ts](offline-32/media.ts), `:5`, `:31`, `:112` | Transmission provenance, measured coverage and fresh PCM qualification |
| [comparison.ts](offline-32/comparison.ts), `:5` | ACK/pre-intervention eligibility and comparison completion |
| [analysis.ts](offline-32/analysis.ts), `:19`, `:83` | Independent analytical axes and generic measured boundary projection |
| [receipts.ts](offline-32/receipts.ts), `:12`, `:42`, `:50` | Explicit context extraction and exact-hash historical replay |
| [test-fixtures.cjs](offline-32/test-fixtures.cjs) | In-memory historical copies and coherent synthetic decision fixtures |
| [ported-review.test.cjs](offline-32/ported-review.test.cjs) | All 22 independent review expectations, ordinary assertions |
| [hardening.test.cjs](offline-32/hardening.test.cjs) | 62 additional adversarial, historical and comparison regressions |

The implementation imports **no legacy classifier or reason-string matcher**. Only a test imports the existing security classifier to verify historical verdict equality. There is no runtime dependency on `offline-32`, provider client, credential reader, approval consumer or gate writer. Local logs, snapshots and a receipt-assembly helper live under ignored `tmp/connect-analytical-hardening-32/`.

## 4. Updated evidence contract

### Explicit facts and independent axes

`analysePhase(input, context)` accepts unknown input and emits schema version **2**, `proposalOnly=true`, `universalSecurityPass=false` and `securityGateAuthority=NONE`. Its facts are `identity`, `chronology`, `controls`, `coverage`, `receiver`, `source`, `freshContent`, `sfuEvent`, `transport` and `comparison`. Each has **VALID / MISSING / INVALID**, with finite structured reason codes and peer/sample references. Missing evidence is not automatically a contradictory observation. Malformed input returns bounded incomplete/invalid output rather than an exception.

VALID means that the applicable consistency checks passed. For example, `freshContent.status=VALID` with `freshProof=[]` means no contradictory target evidence was found; it does **not** mean fresh media was delivered. A phase-one comparison fact with status VALID is paired with `comparison.status=NOT_APPLICABLE`, not an ACK claim.

Provider metadata, per-peer SFU history, DTLS, ICE, aggregate PC state, receive counters, fresh decoded content and local cleanup remain separate axes. `OBSERVED_SFU_TERMINATION` requires corroborated same-session histories; it does not establish media cessation. `OBSERVED_RECEIVER_RTP_QUIESCENCE` additionally requires valid controls, current independent receiver statistics/decoder clocks, active local sources, flat tail and clean correlated signaling closure. The connected-peer category requires healthy DTLS/ICE and aggregate state throughout the tail. A closed PC or DTLS state alone supplies neither negative category.

Inputs are bounded to 4,096 samples, 2,048 events per history and 256 decoded frames per receiver snapshot. Structured issues are deduplicated and capped at 256. Repeated cumulative histories across snapshots are expected; duplicate event/frame observations **within one snapshot**, changed history prefixes and contradictory reused PCM intervals are rejected.

### Identity and time provenance

The same identity checks apply before qualified fresh-content proof and receiver-quiescence corroboration. Earlier calibrated tracks and RTP identities remain stable across the measured snapshots. Two array entries are not accepted as independent participants merely because both counters exist. The offline v2 profile conservatively requires distinct expected inbound associations, including SSRCs; legitimate collisions or track replacement require a separately designed association contract.

Ordering uses parent monotonic stamps for parent IPC/interventions, each child's own event sequence for SFU chronology, and each browser's unchanged time origin/audio sample clock for PCM. UTC order checks are within the same recorded domain; UTC across child/provider/parent clocks remains correlation only. Unknown provider offset is not converted into a latency or enforcement bound. The extractor requires an explicit reviewed authenticated/non-cooperative harness declaration; generic extraction defaults both declarations to false. Exact B3 replay supplies them only after identifying the pinned historical dataset and its reviewed source path.

### Fresh audio qualification

The containing snapshot's later fetch time is insufficient. A target must be generated after the trigger, linked to the correct source's completed transmission, and decoded on the opposite calibrated receiver with the expected nonce, phase, sender and retained CRC-valid assertion. The original **mean confidence >=0.97**, **minimum symbol confidence >=0.75** and **3.99–4.01-second frame** limits remain. Impossible confidence values are invalid.

The receiver must have a pre-trigger PCM baseline and a valid receiver snapshot whose **parent `before` is after the source transmission's parent completion**. That latter snapshot is the conservative anchor. The decoded PCM interval must follow both baseline and anchor, end within the observed decoder samples, and agree with its own browser epoch, observation clock and calibrated sample rate. The inspected collector emits fixed **2,048-sample** batches; sample/chunk equality and a one-batch worklet bound are checked. No parent monotonic number is compared directly with a browser or child monotonic number.

An interval already decoded as control cannot be reassigned a target payload. A stale worklet frame, inconsistent observation epoch/time, duplicate target record or out-of-order parent capture cannot qualify. An early physical delivery whose PCM start cannot be bounded beyond the anchor remains **MISSING**, not disproved. A genuinely qualified earlier proof remains `FRESH_MEDIA_AFTER_END` when a later negative window or process completion becomes incomplete. Its bound observations must have valid identities; a later contradictory reassignment of that same PCM interval invalidates the proof.

### Explicit-end comparison

Eligibility requires a successful verified ACK, matching call/session, a valid recent prior sample pair, healthy layers, receiver packet/counter progress, decoder/source progress and ordered captured history without earlier transport loss or SFU termination. A future-dated sample or ACK cannot qualify. Missing ACK, stale evidence and absent remote progress have explicit reasons.

`ELIGIBLE_FOR_COMPARISON` is distinct from `COMPARISON_COMPLETED`. Completion additionally requires the independently validated post-intervention window. Even a synthetic eligible, completed arm with new SFU signaling and quiescence yields only `CORROBORATED_TEMPORAL_ASSOCIATION_ONLY`; **`causalProof` remains false**. Polling completion without eligibility never becomes a completed comparison. A fresh-content finding remains independently reportable even if a causal comparison is unavailable.

### Coverage profile: original versus new limits

The original 59–60-second timer and 9–10-second comparison windows, 500-ms IPC bracket, 2-second transmission bracket, 5-second tail, >=3 tail samples, >=3.5-second stable span, advancing publishers/decoder and >=0.01 source activity spanning >=3 seconds are retained. Intentional silent modem guard intervals do not require every instantaneous source meter sample to exceed 0.01.

The following are **new, stricter offline v2 profile limits**, explicitly separate from the historical runner contract:

| New analytical check | Limit |
|---|---|
| First capture starts after trigger | At most 2,000 ms |
| Gap from previous sample completion to next sample start | At most 1,000 ms |
| Pre-intervention prior snapshot age | At most 1,000 ms |
| RTP stats age relative to its own browser clock | At most 500 ms; greater than 1 ms into that clock's future is invalid |

These limits prevent cropped/sparse/frozen evidence from borrowing the runner's completion claim. They are not retrospectively installed experiment thresholds or physical guarantees of uninterrupted traffic monitoring. `runnerWindowComplete`, actual start/end brackets, trigger-to-final elapsed time, captured sample span, maximum gap and stable-tail span are reported separately. A future recorder/profile must review these limits rather than silently loosen them.

## 5. Original historical receipt replay

### B3

Exact-hash replay returns both original security verdict objects unchanged, including `transport_closed_or_unavailable`. Timer analysis has valid identity/control/chronology/receiver/source/event facts and the following supplementary observations:

| Original measured evidence | Hardened interpretation |
|---|---|
| Provider session start `14:30:34.078Z`, configured deadline `14:31:34.078Z`, retained provider ended time `14:31:34.828Z` | Provider timestamps; no invented server enforcement time |
| First completed ended GET `14:31:35.847Z`; SFU end events `14:31:35.813Z` / `.814Z`; clean socket closures `14:31:36.817Z` | Same-child join/end/close order is valid; events preceding the completed GET are legitimate |
| Timer: **217 samples**, first bracket `14:31:35.973–36.000Z`, final bracket `14:32:34.856–34.877Z` | Trigger-to-final **59,029.8796 ms**; actual sample span **58,904.6497 ms**; start delay **125.2299 ms**; maximum gap **268.9369 ms** |
| Final stable tail span **4,864.5828 ms** | Passes original stable-tail contract and the separate v2 coverage profile |
| Receiver A **744192 bytes / 3008 packets**, flat; B **745579/3020 -> 745660/3021**, then flat | One early **81-byte / one-packet** increment is preserved; the final tail is quiescent. No generation-age conclusion |
| Retained last-packet fields **1793370695812.625** / **1793370695994.378** | Receiver-browser statistics timestamps, not provider packet-generation or enforcement timestamps |
| DTLS closed, then later ICE/aggregate disconnection/failure; local source/decoder telemetry continued; no target frames | `OBSERVED_SFU_TERMINATION` and `OBSERVED_RECEIVER_RTP_QUIESCENCE`, **not** healthy connected-peer cutoff or a security PASS |
| Explicit backend ACK `14:32:35.149Z`, after the earlier loss | Comparison **UNAVAILABLE**: earlier termination/failure and no valid recent remote progress |
| Phase two **34 samples / 9,142.8897 ms** from its trigger; local cleanup starts `14:32:44.481Z` | Completed polling does not repair the invalid causal comparison. Both original phase verdicts remain **INCONCLUSIVE** |

No qualified post-ended fresh nonce is observed. That is a bounded observation with working earlier controls and current statistics; it is not proof of impossibility in every session. The phase-two signaling output identifies the **same earlier events already present at its baseline**, not a new termination attributed to explicit end.

### Report 18 and divergence

Pinned replay derives **25,956/26,208 additional received bytes and 103/104 packets after ended metadata**, preserves `POST_END_RTP_GROWTH_CONTENT_AGE_UNKNOWN`, and retains the original timer **FAIL**. No fresh nonce, exact packet generation age or timer-only cutoff bound can be recovered from that older instrumentation. Its generic projection labels identity scope as array-order evidence, not independently attested modern per-SSRC associations.

The measured difference remains: Report 18 has growing received counters without an observed SFU end flag; B3 has both end events, clean signaling closure, essentially flat receiving counters and later failed transports. Report 18 lacks B3's complete per-layer, per-SSRC, PCM/nonce and bracketed coverage telemetry. A classifier defect cannot explain the raw counter/event difference; source waveform liveness alone also cannot explain away B3's flat remote counters. Instrumentation/timing, session or request differences and provider behavior remain competing unverified explanations. There is no new provider-internal cause or universal lifecycle conclusion. Both historical findings are preserved.

## 6. Fresh validation results

Logs are under `tmp/connect-analytical-hardening-32/`. Final results:

| Check | Result |
|---|---|
| Original Report 30 tests, unchanged | **30/30 PASS**, `original-30.log` |
| Original Report 31 probes against original proposal | **14 ordinary passes + eight reproduced TODO failures**, `original-22.log`; excluded from green acceptance |
| All 22 review expectations ported against v2 | **22/22 ordinary PASS**, no TODO |
| Additional permanent hardening regressions | **62/62 PASS** |
| Combined hardened suite | **84/84 PASS**, zero fail/skip/cancel/TODO, `hardened-final.log` |
| Original Connect/Media Truth/relationship offline suite, all 17 prepared test files | **290/290 PASS**, `media-truth-offline.log` |
| Ordinary acceptance checks above, excluding original review TODO run | **404 PASS = 30 + 84 + 290**; overlapping behavioral coverage is not 404 independent experiments |
| Strict TypeScript, all new modules via `receipts.ts` | **PASS**, `typescript-final.log` |
| App `tsc -p tsconfig.json --noEmit` | **PASS**, `app-typescript.log` |
| Deno 2.5.4 strict checks: new entry point, unchanged provider, existing B3 fake-SDK fixture | **3/3 PASS**, `deno-final.log`; existing config, `--no-remote --no-lock --deny-import`, compilation only |
| Targeted ESLint, ten new sources/tests | **PASS**, zero warnings, `lint-final.log`; repository lint config unchanged |
| Current `npm.cmd run test:live-logic`, before and after | **504/508 PASS, same four failures**, zero TODO; same failure names |
| Local Live and EAS environment isolation scripts | **PASS / PASS**, local configuration checks only |

Adversarial cases include duplicate/blank identities, changed call/session/track/SSRC, delayed metadata, end-before-join, missing/malformed/duplicate/regressed events, relabelled/stale/future PCM, wrong rate/CRC/confidence, replayed nonces, frozen/reset stats, sparse/cropped/duplicate samples, source silence, missing/future/stale/wrong-call ACK evidence, earlier transport loss, incomplete comparisons and both exact-hash historical receipts. Coherent positive controls distinguish eligibility, completion and temporal association. Qualified fresh evidence survives later incomplete measurement; malformed negatives never become universal success.

The unchanged Live failures are: `Live catalogue waits for real auth and reloads after auth recovery`; `screen-only Program output follows the selected canvas and offers a focused view`; `audience Program output exposes no Studio access or private matching data`; `standard Room Pulse keeps a curated, readable note preview`. This fresh package-script suite is **508 tests**, not the earlier manually expanded 514-test suite. No Live repair was attempted.

Initial strict CLI checks needed TypeScript's `--ignoreConfig`, explicit Node types and numeric default-parameter annotations. The initial Deno invocation omitted the existing cached-SDK config and failed dependency resolution; adding that existing config fixed compilation without installation. Initial targeted lint found one unused new-test parameter and a missing explicit `node:buffer` import; both were corrected in the new test. Those logs remain retained. Final results follow the last implementation/test edit. No original expectation or security threshold was weakened to pass them.

Reproduce the hardened suite from the repository root:

```powershell
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test docs/betweener-connect/offline-32/ported-review.test.cjs docs/betweener-connect/offline-32/hardening.test.cjs
```

Tests read immutable local inputs and mutate only in-memory copies. Their exclusive local output directory records all eight expected/actual counterexamples; `unmetDesiredSafetyExpectations=0`. Fake-transport SDK tests in the existing suite remain serialization/diagnostic tests, not provider acceptance or enforcement tests. No fresh browser media, network-fault injection, native/device run or app build was performed.

## 7. Remaining limitations and engineering decision

The tool verifies consistency **given a reviewed recorder and provenance**. Hash matching identifies historical bytes; it does not cryptographically authenticate a provider event. Generic callers must supply reviewed harness provenance explicitly. A coherently forged complete trace is outside this validator's authentication capability. Retained CRC/confidence values are assertions from the source-hashed blind decoder; the original PCM is not retained for independent re-decoding. No additional measurements were invented.

The conservative PCM anchor can miss proof of very early fresh delivery; missing proof remains inconclusive. Fresh stats timestamps and advancing decoder callbacks mitigate stale observation, but cannot turn software counters into wire capture. Flat tails do not identify exact cessation, the age of a late packet, hidden receiver paths or all sessions/devices. Explicit-end temporal association cannot exclude every concurrent network/provider event. The earlier revocation-information gap when no end operation reaches Stream remains unresolved.

**Keep v2 as an offline forensic tool (option A).** It is suitable for a subsequent independent review and could later become a separately labeled diagnostic (option B). It must not replace the existing security classifier, authorize a fixture, loosen a threshold or change M2A/M2B automatically. Runtime integration is **NOT AUTHORISED**. Preserve raw non-cooperative peers' ability to ignore local cleanup and require independent remote evidence.

The minimum next engineering action is review of this explicit v2 contract and its regression cases. **No provider experiment is needed to validate these repairs.** A later experiment would require its own reviewed design and authorization; an explicit-end comparison must be armed only while same-session remote media and transports are demonstrably viable, before any earlier timer termination contaminates it. This work implements no such experiment and requests no execution approval.

All **312 baseline entries and 524 protected records remain unchanged**, including all 73 prepared sources and 434 artifacts. Historical readiness, original classifiers/reports/receipts and consumed approvals/ledgers were neither refreshed nor reset. No provider APIs, Stream configuration writes, Supabase/shared database access, Live modification, production modification, native integration, deployment, build, OTA or calling enablement occurred.

## 8. Declarations

```text
CONNECT_ANALYTICAL_IDENTITY = PASS
CONNECT_ANALYTICAL_CHRONOLOGY = PASS
CONNECT_FRESH_FRAME_PROVENANCE = PASS
CONNECT_ANALYTICAL_EVENT_HANDLING = PASS
CONNECT_COMPARISON_VALIDATION = PASS
CONNECT_OBSERVATION_COVERAGE = PASS
CONNECT_HISTORICAL_REPLAY = PASS
CONNECT_OFFLINE_HARDENING = PASS
CONNECT_RUNTIME_INTEGRATION = NOT_AUTHORISED
CONNECT_M2A_SECURITY_GATE = BLOCKED
CONNECT_M2B_READY = BLOCKED
PROVIDER_WRITES = NONE
PRODUCTION_MODIFICATIONS = NONE
```

PASS is scoped to the separate offline contract, counterexamples and immutable replay. **Historical B3 remains INCONCLUSIVE; Report 18's original failure remains recorded.** No universal media-cutoff or consent-revocation security PASS is declared.
