# Connect V1 Operation Media Truth — Stage A preparation

Date: 2026-10-29. **Stage A is prepared and validated locally. The provider experiment was not executed. M2A and M2B remain BLOCKED, and real calling remains disabled.**

This work prepares a content-based test of whether audio generated after timer-ended metadata reaches another participant. It does not resolve the provider behaviour documented in reports [18](18-connect-v1-revocation-boundary-decision.md), [19](19-connect-v1-independent-forensic-audit.md) and [20](20-connect-v1-forensic-defect-remediation.md). No Stream application requests, fixture creation, provider cleanup, database access, migration, deployment, build, OTA or native-device testing occurred.

The exact proposed scope is in [the execution manifest](stream-staging-connect-media-truth-proposal.json). Its SHA-256 is `7ba4fb47c2a6008c30a19cd19e5edac35729e7165ba3b406b6d71ff86086f957`. The [preparation receipt](stream-staging-connect-media-truth-preparation.json) records current source hashes, runtime versions, validation and preservation results. Neither file grants execution approval.

## 1. Instrumentation architecture

The new code is isolated under `scripts/lib/connect-media-truth/`. Product screens, native ownership, relationship authority, AD-1/DB-1 repairs, migrations and Live code are unchanged.

| Component | Responsibility |
|---|---|
| `codec.cjs` | Browser-serializable synthetic modem and blind streaming decoder; bounded sample buffer |
| `browser.cjs` | Synthetic AudioContext source, silent remote playout, AudioWorklet PCM capture and detailed RTCStats collection |
| `evidence.cjs`; `verdict.cjs` | Trigger-gated challenges, exact decoded-payload matching, clock model and conservative verdicts |
| `experiment.cjs` | Injected provider/peer orchestration; same-call timer and explicit-end phases |
| `approval.cjs`; `scope.cjs` | Manifest-bound expiring approval, single-use resource reservation and ownership checks |
| `process.cjs` | Bounded JSON child bridge; failed or closed children cannot be reused; typed errors retained |
| `provider.mts`; `provider-process.cjs` | Future Deno/Stream diagnostic port, pinned SDK, bounded API calls and scoped cleanup |
| `watchdog.cjs` | Separate-process deadline and parent-disconnect cleanup |
| `provenance.cjs` | Runtime/harness/protocol/package hashes |
| `scripts/test-connect-media-truth.cjs` | Proposal-only default; guarded future execution entrypoint |
| `scripts/test-connect-media-truth-local.cjs` | Local browser/WebRTC/Opus controls without provider or database access |

The existing raw SFU session gains an opt-in `mediaTruth` mode. Its ordinary synthetic-offer behaviour remains available. This mode installs the new audio source, attaches a remote PCM consumer before negotiation, records detailed stats/events and accepts explicit source-change commands. An SFU end event records evidence and does **not** close either PeerConnection during measurement. The JSON probe now accepts explicit `stats`, `subscribe`, `transmit` and `close` operations and rejects unknown commands.

## 2. Fresh audio protocol and receiver independence

The transmitter generates a 128-bit cryptographically random nonce only after validating a completed trigger. Timer phase 1 requires the first completed GET returning `ended=true`; comparison phase 2 requires an actual backend-end acknowledgement. All-zero calibration and previously used challenges are rejected. A collision fails the run rather than silently generating a replacement. Fixture UUID allocation is separate from challenge generation.

Each frame contains:

```text
0xD391 | version 1 | phase | sender tag | 16-byte nonce | CRC32
   2         1         1         1             16          4 bytes
```

The 25 bytes become 50 four-bit symbols. Sixteen tones, 600–2100 Hz in 100 Hz steps, encode the symbols at 80 ms each. A complete frame lasts four seconds, followed by a 160 ms guard. The source loops while the publisher remains active. Phase and sender are part of the checked payload.

The remote decoder receives PCM and protocol constants. **It never receives the expected remote nonce.** Five symbol-alignment lanes measure frequency energy in the central 60% of each symbol. The decoder reconstructs a complete frame, checks its header and CRC and reports the decoded nonce, phase, sender, sample interval and confidence. The parent compares that independent result with its challenge afterward.

One complete frame is sufficient only when the exact 128-bit nonce, phase and remote sender match; CRC is valid; frame duration is consistent with the sample rate; mean spectral dominance is at least 0.97; and every symbol scores at least 0.75. These scores describe spectral separation, not a probability of correctness. Weak CRC-valid candidates are retained and cannot establish a cutoff. An independently qualified complete identification establishes fresh delivery even if another alignment produces a weak duplicate.

Early offline versions used faster two-/four-tone symbols and required two complete repeats. Opus controls exposed unreliable decoding and missed ten-second comparison windows. The final slower sixteen-tone frame and complete-frame rule address that diagnostic limitation. Partial frames, a repeated alignment, guessed patterns, noise, wrong nonces and old audio are not fresh-delivery evidence. No false identification occurred in the executed negative controls; finite tests do not prove a mathematical zero false-positive probability. CRC is an integrity check, not an authentication primitive.

No microphone, camera or personal audio is used. An audio element activates Chrome's remote playout path; its output is rerouted into a graph with zero output gain, and the AudioWorklet outputs silence. Only synthetic remote PCM is analysed. The Web Audio specification defines media-stream sources, resampling and worklet processing; those mechanisms alone do not prove that a particular remote source decoded successfully. [Web Audio API](https://www.w3.org/TR/webaudio/).

## 3. Timing and evidence model

Parent `performance.now()` timestamps determine local ordering and intervals. UTC accompanies each stamp for correlation. Browser `performance.now()`, `performance.timeOrigin`, AudioContext time, sample rate and worklet frame counters remain separate fields. Parent timestamps bracket each IPC request and response; they are not an assertion that two browsers sampled simultaneously.

The source records generation time, scheduling time and the observation that its render clock passed the scheduled start. **This is not an RTP packet transmission timestamp.** Receiver records identify the receiving peer/track, decoded payload, confidence, sample interval, worklet frame and browser observation time. Their arrival at the parent is bounded by that sample's IPC bracket. Provider clock offset remains **UNKNOWN**; no cross-host latency SLA is inferred.

The future Deno port timestamps individual HTTP requests and response-header receipt, plus decoded-command completion. Routes are reduced to safe operation labels; headers, query strings, request bodies, JWTs and SDP are not logged. Parent operation brackets are retained separately from the Deno process's monotonic origin. Backend `mark_ended` timing, timer-ended metadata, SFU events, local closure and receiving cessation have distinct fields.

Representative receipt structure:

```text
provenance: manifest hash, source hashes, actual browser/Node/Deno/SDK runtime
operations[]: operation, parent start/completion, provider HTTP timing/status
metadata[]: owned call/CID, provider session/start/end/deadline, GET bracket
phases[]:
  trigger; fresh targets; source scheduling receipts; calibration controls
  bindings: sender tag -> owned user -> raw SFU session
  samples[]: parent bracket; independent peer snapshots; sanitized signaling
  windowComplete; errors; verdict
localCleanupStarted; independent cleanup receipt; remaining owned identifiers
```

Each fresh stats call preserves per-SSRC ID, track identifier, raw RTCStats timestamp, bytes/packets, supported last-packet timestamp, jitter-buffer measures and audio-energy fields. Publisher counters, ICE/gathering/signaling/PeerConnection states and DTLS transport state are recorded. Unsupported fields remain `null`. Track identifiers can be resolved through media-source rows for outbound audio. Candidate addresses and SDP are excluded.

All typed SFU events are timestamped, including nested error codes. Socket close code, clean-close flag and a sanitized reason are retained; unfamiliar reason text is redacted and hashed. The harness observes the SFU channel, **not** the separate coordinator WebSocket channel. Limits and decode/transport errors make telemetry incomplete rather than silently discarding them.

Inbound counters describe received RTP, not decoded content generation time or speaker playback. Browser APIs used here do not expose a complete packet capture, RTP sequence numbers or a universal packet-generation timestamp. [W3C WebRTC statistics](https://www.w3.org/TR/webrtc-stats/).

## 4. Verdict contract

There is no universal `PASS` verdict.

| Verdict | Required evidence |
|---|---|
| `FAIL` | Valid post-trigger generation/source receipt, calibrated remote decoder, bound identities, usable timing/stats and a complete qualified remote frame matching the new challenge |
| `INCONCLUSIVE` | Missing/invalid controls, timing or stats; weak identification without qualified proof; counters alone; process/decoder errors; telemetry truncation; deadline; incomplete window or cleanup failure |
| `OBSERVED_CUTOFF` | Valid controls; no qualified fresh identification; full predeclared observation window; fresh stable receiver rows with unchanged SSRC/track binding; advancing publishers; live decoder heartbeat and open connected peers |

The nominal windows are 60 seconds after first ended GET and 10 seconds after explicit end ACK. The manifest predeclares minimum completed observation spans of 59 and 9 seconds, with the last IPC completion inside the respective maximum. A cutoff requires at least three current samples covering a minimum 3.5-second stable tail within the final five seconds. It reports that measured stable interval and never claims every transport closed or an unlimited future guarantee.

Every sample bracket must be valid, ordered and at most 500 ms. Timestamped counters must advance in freshness even when their received totals plateau. The publisher must still have the correct challenge scheduled, with nonzero source-meter samples spanning at least three seconds of the measured tail. Reused/frozen rows, changed SSRCs, silence at the synthetic source, stopped publishers, closed peers or a frozen decoder cannot produce cutoff. A full fresh-content proof can establish `FAIL` before a window completes; an incomplete window cannot establish `OBSERVED_CUTOFF`.

Timer metadata, API ACK and an SFU end event alone never establish receiving cessation. Local closure occurs after measurement and is excluded from cutoff evidence. Cleanup failures remain visible and prevent a successful cutoff classification. An earlier completed phase is not retroactively relabelled as a successful later phase.

## 5. Offline validation

New results are under `tmp/connect-media-truth-preparation/`. Historical receipts were not regenerated.

| Check | Fresh result |
|---|---|
| New diagnostic unit/process tests | **52/52 PASS** |
| Existing Connect and relationship command regressions | **120/120 PASS** |
| Combined final offline run | **172/172 PASS**, `offline-final.log` |
| Final local browser control | **COMPLETE**: both directions calibrate, identify fresh challenges, reject wrong/previous audio, and identify a deliberately delayed new challenge within ten seconds |
| Local receipt replay through current classifier | Expected **FAIL for the simulated fresh-delivery control**; this is not a Stream result |
| Existing synthetic offer/publisher/subscriber control | **PASS** outside the sandbox; `legacy-browser-control.log` |
| Expo TypeScript, no emit | **PASS**, `typescript-final.log` |
| Strict Deno provider module check | **PASS**, compiler only; no module execution or provider access |
| Targeted ESLint | **PASS**, zero warnings, including `.mts` through a temporary extension of the existing TypeScript lint configuration |
| Live regression suite | **504/508**, exactly the four documented baseline failures; no Live file changed |

The local browser run uses two pages with distinct PeerConnections, synthetic sources and remote audio tracks, negotiating Opus. It uses this host's candidates only, with no ICE servers. A local-only candidate translation avoids Windows multicast-DNS dependence; addresses are not written to receipts. Playwright fulfils the localhost document in-process. Browser control required execution outside the filesystem/network sandbox for local UDP; no provider or database access was added to the test.

Validated runtime: Node **24.18.0**, Chrome **155.0.8059.86**, Playwright **1.64.1**. The future raw protocol uses the installed video-client **1.62.0** generated sources, hashed with the harness. Server SDK is pinned to **0.7.63**, with cached Deno **2.5.4**. This is not a complete transitive Deno dependency-lock attestation.

The final local receipt records 30 source/package/protocol hashes and verifies that they did not change during its run. Current preparation hashes are recorded separately after the final approval/IPC/provider safety checks. The modem, audio instrumentation, challenge/matching code and local runner still match the final local receipt. Earlier failed calibration and comparison attempts remain in dated local receipts; they were not converted into successful runs. Repeated completed final controls are retained as well.

The permanent tests cover all fifteen requested categories: post-trigger RNG; no early RNG; correct remote decoding; wrong payload; noise; previous audio; counters without content; missing controls; decoder failure; clock uncertainty; timer metadata alone; ACK alone; process errors; visible cleanup errors; and expired approval. Additional cases cover sample rates, attenuation/delivery delay, partial frames, invalid CRC/low confidence, stale stats, SSRC/track changes, closed-child reuse, typed denial codes, bounded child waits, actual collector field handling, duplicate reservation and independent watchdog deadline/disconnect behaviour.

The watchdog subprocess tests deliberately use unproved ownership and verify refusal plus visible failure receipts. Simulated provider orchestration verifies one creation, no replacement after lost ACK, same-call explicit end, held-open measurement peers and teardown. **Actual Stream cleanup and API interoperability were not exercised.**

Live's four failing names match report 20:

- Live catalogue waits for real auth and reloads after auth recovery.
- Screen-only Program output follows the selected canvas and offers a focused view.
- Audience Program output exposes no Studio access or private matching data.
- Standard Room Pulse keeps a curated, readable note preview.

## 6. Exact future provider-write scope

**Separate explicit execution approval is still required. No valid execution approval was authored.** The runner defaults to proposal mode and loads no provider client or credentials in that mode.

| Boundary | Proposed scope |
|---|---|
| Application | **1731011, Betweener Staging**; verify identity, auth/permission checks and policy before mutation |
| Shared configuration | Existing `betweener_connect` and roles; read/hash only; no global, Live, role-definition or call-type writes |
| Identities | At most **two new owned fixture users**, absent before creation, with unique reserved IDs and ownership markers; no real users or third creator |
| Call | Exactly one possible new VOICE call with reserved UUID; creator is the first fixture member; both use existing `connect_voice` membership |
| Per-call overrides | Maximum two participants; `max_duration_seconds=60`; video/camera off; screen sharing, recording modes, transcription/captions, thumbnails, ingress and broadcasting off; existing deny settings verified on readback |
| Notifications | `ring=false`, `notify=false`; existing notification policy must already be disabled |
| Media | Synthetic audio only; no microphone, camera, screen or personal content |
| Comparison | First completed ended GET triggers fresh phase 1; afterward one actual `mark_ended` on the **same call** triggers fresh phase 2; raw peers stay open during both measurements |
| Limits | Up to **60 seconds** after ended GET; up to **10 seconds** after end ACK; cleanup starts by the **180-second** experiment deadline |
| Creation retry | **None**; no replacement users/call or automatic restart after an ambiguous creation response |
| Cleanup | End/delete only the owned call and delete only the two marked owned identities; verify 404/code16, users absent and unchanged shared call-type hash; at most one cleanup-only retry across processes |
| Excluded | Supabase/database access, migrations, Live changes, global role/token revocation, deployment, build, OTA and calling enablement |

Fixture credentials are ordinary diagnostic user JWTs, held in private control pipes/memory; they are not a media lease. No credentials, authorization headers, SDP or SFU server URLs are written to receipts. Hard user deletion uses the SDK-required message/conversation deletion flags for these newly owned identities; no chat resources are created by the diagnostic, and no call-cascade deletion flag is used.

## 7. Approval, ownership and cleanup

Execution requires `--execute`, an explicit external approval record bound to the exact manifest hash, an approval ID/actor, valid timestamps and an expiry no more than 24 hours after approval. Expired, future-dated, malformed or mismatched approval is rejected before the provider factory/credential read. The readiness receipt must be PASS and all preparation source hashes must still match. A new approval cannot silently bypass failed local preparation.

An exclusive single-use approval ledger reserves the call/user IDs and marker before any provider mutation. Preflight must show both identities and the call absent. Attempted creation is persisted before dispatch, so a lost ACK leaves a cleanup obligation. Duplicate creation commands are rejected. An already consumed approval cannot allocate replacement resources.

The separate watchdog starts before provider work. Its own timer initiates cleanup by the total deadline; parent disconnect also triggers cleanup. Only explicitly registered experiment child processes may be terminated. It stops writers, revalidates the ledger/approval and checks provider ownership markers before deleting anything. A name prefix alone never authorizes deletion. Unknown ownership fails closed and leaves the identifiers for review.

Cleanup has a bounded budget and an exclusive two-slot attempt ledger shared by the watchdog and any emergency parent cleanup. An expired approval can authorize cleanup of its already reserved/attempted owned resources, not new creation. Successful absence checks and the unchanged shared hash are recorded separately from media evidence. Failure stays visible in `.cleanup.json`/`.emergency-cleanup.json` and the execution ledger. Do not recover by rerunning fixture creation or deleting resources by prefix.

If the watchdog fails, the parent aborts further experiment work and attempts only the same scoped cleanup within the remaining attempt budget. An independent process is not an independent host: host failure can still prevent cleanup. Recovery must use the exact retained IDs, verify markers and report remaining resources; no claim of guaranteed cleanup through host failure is made.

## 8. Preservation and remaining limits

Of **234 baseline modified/untracked entries**, **232 retain their original contents or absence**. The baseline already included one deleted, unrelated Adaptive Stage telemetry migration; it remains absent and was not restored or deleted by this work. The two intentional existing-file changes are the SFU session and probe. Reports 18–20, retained proposals/receipts, the AD-1/DB-1 repairs and historical Connect migrations are preserved. Unrelated Live, Circle, Studio and package work is unchanged. The original boundary receipt still hashes to `8c1d82141a5c5140c94ac2b65e2b09dca42ebbe1f0f8c87b852d6dacdffa501d`.

Preparation demonstrates local encoding, actual Opus transport/remote identification, conservative classification and safety gates. It does not establish Stream timer cutoff, provider-side internal causality, all-session termination, timer reset behaviour, an absolute media lease or a release revocation-latency guarantee. Browser loss, resampling, playout changes or protocol failures can still make a future test inconclusive; its positive controls and strict receipt checks must run again.

The future port must perform its own staging identity/policy/settings readback before creating anything. API/cleanup compatibility remains externally unverified until a separately approved run. No physical device, native audio focus, incoming-call owner or product calling integration was validated. Nothing in this preparation advances M2B or enables calling.

## 9. Stage A declarations

PASS is scoped to preparation and executed local controls. Conditional stats capture means optional browser fields, coordinator-channel coverage and actual provider telemetry remain limited as described above.

```text
CONNECT_FRESH_AUDIO_ENCODER = PASS
CONNECT_REMOTE_NONCE_DECODER = PASS
CONNECT_MEDIA_STATS_CAPTURE = CONDITIONAL_PASS
CONNECT_EXPERIMENT_CLASSIFIER = PASS
CONNECT_OFFLINE_CONTROLS = PASS
CONNECT_PROVIDER_TEST_PREPARED = PASS
CONNECT_PROVIDER_TEST_EXECUTED = NO
CONNECT_M2A_SECURITY_GATE = BLOCKED
CONNECT_M2B_READY = BLOCKED
PROVIDER_WRITES = NONE
SHARED_DATABASE_MODIFICATIONS = NONE
PRODUCTION_MODIFICATIONS = NONE
```

Stage A stops here. Provider execution awaits separate explicit approval of the linked manifest; no approval question or external experiment is initiated by this report.
