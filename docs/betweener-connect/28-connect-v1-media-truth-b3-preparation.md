# Connect V1 Media Truth B3 preparation

Date: 2026-10-30. **B3 is prepared and validated locally. No provider execution or owner execution approval was created. Real calling remains disabled; M2A and M2B remain BLOCKED.**

The sole settings correction adds the complete 640×480/600000 target resolution to B2's disabled video object. The exact request passes the pinned Stream SDK 0.7.63 contract, independent numeric validation and actual SDK serialization through a network-denied fake transport. This establishes preparation, not server acceptance or media cutoff.

Reports [19](19-connect-v1-independent-forensic-audit.md)–[27](27-live-vs-connect-architecture-comparison.md) and their relevant receipts were reviewed. Their findings remain distinct: local adapter/admission defects were repaired; earlier Connect fixtures established media; B1/B2 creation failed before media; the precise server validation rule and timer/media behavior remain unresolved. This preparation does not repeat the Live architecture audit or modify the product Connect adapter.

## 1. Immutable proposal and exact correction

Proposal: [stream-staging-connect-media-truth-b3-proposal.json](stream-staging-connect-media-truth-b3-proposal.json).

```text
Experiment: connect-m2a-media-truth-b3-28
Application: 1731011 / Betweener Staging
Call type: betweener_connect
Manifest SHA-256:
1c4a176710972ff9db0baf9473be63ca3662cf7bbaec68cf3ddbfda39f8f3f0f
```

The new video subtree is:

```json
"video": {
  "enabled": false,
  "camera_default_on": false,
  "target_resolution": { "width": 640, "height": 480, "bitrate": 600000 }
}
```

The closed B3 manifest derives from the hash-pinned, unchanged B2 proposal. Removing that target-resolution object and restoring schema/experiment/approval/ownership names produces a manifest deeply equal to B2. No timing, confidence, codec, cleanup, resource or permission value changed. The frame interval remains **2**, with frame recording disabled. All other recording modes, transcription/captions, screen sharing, thumbnails, ingress and broadcasting remain disabled; microphone and speaker defaults remain off.

The only non-settings changes are schema version **3**, experiment ID, approval prefix `media-truth-b3-28-`, user prefix `mtb3_28_` and ownership key `connect_media_truth_b3_28`. No actual fixture IDs were allocated. B1/B2 manifests and consumed execution state remain unchanged.

## 2. Machine-readable comparison and request safeguards

The [request comparison](stream-staging-connect-media-truth-b3-request-comparison.json), SHA-256 `7c6276348442848c578bd9d7eff62c1731b13f94cc9ebf73aeb3179b7f5210e7`, retains complete synthetic requests and structural differences against B2, the product adapter and the earlier fixture wrapper. Its exact settings difference from B2 is:

```json
{
  "operation": "add",
  "path": "video.target_resolution",
  "after": { "width": 640, "height": 480, "bitrate": 600000 }
}
```

The full request also uses the new namespace in its synthetic identities/custom marker. Its identity **structure** remains unchanged: first pair member as creator, exactly two existing `connect_voice` membership roles, no third fixture user, no global role assignment, `ring:false` and `notify:false`.

| Reference | Compared behavior / evidence limit |
|---|---|
| Product adapter, `supabase/functions/_shared/connect-stream-adapter.ts:103` | Complete video object matches B3 VOICE exactly. Product provisioning uses a system creator, invited roles and ringing; production acceptance/admission must remain separate. Product source is unchanged. |
| Earlier fixture, `scripts/lib/connect-stream-closure-worker.ts:36` | Actual wrapper expression preserves the complete video object, adds its approved 60-second timer and substitutes a third owned creator. Earlier setup success is retained evidence; this reconstruction is not a historical wire body or immutable run-start source. |
| Rejected B2 request | Actual unchanged builder plus immutable manifest; only the resolution object is added to settings. This is deterministic reconstruction, not recovery of original HTTP bytes. |
| New B3 request | Actual shared builder, closed B3 manifest, strict public SDK declaration check and real SDK fake-fetch output. No server validation result is claimed. |

Implementation boundaries:

- `scripts/lib/connect-media-truth/request.cjs:16` derives the immutable B3 template; line 37 rejects missing, extra or changed values. Line 51 validates profile-specific call/member/marker identities before building the request.
- `sdk-contract.cjs:39` validates the concrete builder result as a contextual public `GetOrCreateCallRequest` literal, without an `any`/assertion cast. It emits no files and verifies installed SDK version 0.7.63.
- `request.cjs:75` adds numeric checks alongside the closed-value contract: finite integers, valid dimensions/frame interval, bounded bitrate, nonnegative duration and positive diagnostic capacity. Exact B3 values remain pinned to cap 2, duration 60, interval 2 and 640×480/600000.
- `request-comparison.cjs:27` extracts the actual adapter/wrapper expressions using the TypeScript AST, without importing their credential-reading/provider modules.

SDK types alone accept out-of-range numbers. Independent controls reject dimensions outside 240–3840, fractional/nonfinite values, frame intervals outside 2–60 and bitrate above 6000000. The documentation gives no bitrate minimum; none was invented. The exact closed manifest additionally rejects every unreviewed value, including removal of the optional bitrate. Numeric constraints are based on the public [Stream settings schema](https://getstream.io/video/docs/api/call-types/settings/); these controls do not emulate server validation order.

The new Deno fixture executes the real SDK and actual shared builder with synthetic credentials, `--deny-net` and explicit denial of the credential file. One intercepted POST preserves the exact JSON, false flags, creator/members and settings nesting. Its intentionally synthetic HTTP 400 tests diagnostics, not candidate acceptance. Call-type compatibility is tested against retained settings using the real adapter validators; future effective settings still require an independent provider readback.

## 3. Bounded diagnostic qualification

`provider-diagnostics.cjs:67` adds an opt-in version-2 projection. B3 selects it in `provider.mts:22`; older profiles retain version 1. The independent parent bridge reprojects version 2 using the same finite allowlists.

Alongside canonical field hints, version 2 records only:

```text
origin = message | exception_key
match  = qualified_path | qualified_alias | bare_alias
```

Thus a fully qualified height reference, a Go-style qualified alias and bare `height` no longer become indistinguishable receipts. Only known canonical paths and finite labels survive; original tokens/keys/descriptions are not copied. Version 1 remains available for truthful historical receipt interpretation, including B2's ambiguous dimension hints.

The response clone still has a **32 KiB** cap and **250 ms** deadline; the original remains available to the SDK. Output is bounded to 32 known fields/evidence entries and eight finite rule labels. Unknown fields, raw prose/values, identities, credentials, tokens, headers, SDP, URLs and unbounded bodies are omitted. Capture failure remains explicit. Rule hints remain unassociated hints, not a recovered field-specific validation predicate. Even a future qualified field reference would not alone explain the server's merge/validation mechanism.

## 4. Unchanged measurement, timing and cleanup contract

| Boundary | B3 contract, unchanged from B2 |
|---|---|
| Resources | At most **two new owned users**, **one new VOICE call**, two participants; zero creation retries/replacements; no real users or third creator |
| Synthetic audio | Independent encoder/blind receiver decoder; 128-bit post-trigger nonce, phase/sender tags and CRC32; 16-FSK, 600–2100 Hz, 80 ms symbols, 4000 ms frame, 160 ms guard |
| Trigger ordering | Fresh phase-1 nonce only after first completed GET with `ended=true`; distinct phase-2 nonce only after actual explicit-end ACK |
| Confidence | At least one complete CRC-valid frame; mean symbol confidence ≥0.97 and each symbol ≥0.75 |
| Sampling/cutoff | 250 ms sampling; ≤500 ms IPC bracket; minimum 3500 ms stable tail; full minimum spans 59000/9000 ms |
| Windows | At most 60000 ms after first ended read; at most 10000 ms after backend ACK; cleanup begins by the **180000 ms** reservation deadline |
| Evidence | Provider metadata timing, fresh source scheduling/activity, remote decoded content, per-SSRC RTP/fresh stats, bound identities, SFU events and explicit-end comparison |
| Verdict | Qualified fresh delivery = FAIL for that tested boundary; complete stable observation can yield only OBSERVED_CUTOFF; incomplete evidence = INCONCLUSIVE. No universal PASS. |
| Cleanup | Independent watchdog, parent-exit trigger, owned child closure, marker readback, 60000 ms budget, at most one cleanup-only retry shared across processes |

`codec.cjs`, `browser.cjs`, `evidence.cjs`, `verdict.cjs`, `experiment.cjs`, the raw SFU session/probe/protocol and `watchdog.cjs` are unchanged. No threshold/window adjustment was proposed or required.

Peers intentionally remain open during media measurement. Cleanup starts afterward and is resource hygiene, not cutoff evidence. Receiving counters, ended metadata, an SFU event or API ACK alone cannot establish fresh-content delivery or cessation. The raw harness still does not observe the separate coordinator WebSocket channel.

## 5. Fresh tests and local Opus result

All new output is retained under `tmp/connect-media-truth-b3-preparation/`. Historical receipts were not overwritten.

| Check | Fresh result |
|---|---|
| Existing offline baseline | **255/255 PASS**, `offline-before.log` |
| New B3 closed-schema/request/numeric/identity/diagnostic/approval/ownership/readiness/watchdog tests | **35/35 PASS**, `focused-1.log` |
| Combined final offline regressions | **290/290 PASS**, `offline-corrected.log` |
| Public SDK types and actual SDK fake-fetch serialization | **PASS**; exact request hash `35bbb2129e085e63d03aaf21ecd561469acc680661f83c81f0b2acc345097183`; no external requests |
| Local Opus control | **COMPLETE on one attempt**, all five controls pass; source hashes unchanged throughout |
| App TypeScript | **PASS**, direct `tsc -p tsconfig.json --noEmit`, exit 0 |
| Strict cached Deno | **2/2 PASS**, provider and new SDK fixture; compiler only |
| Targeted ESLint | **PASS**, zero warnings; temporary `.mts` parser extension, root lint configuration unchanged |
| Live / EAS environment isolation | **PASS**, source/config checks only |
| Current Live regression comparison | **509/514 before and after**, same five failures across 60 files |

The combined suite reruns the encoder/decoder, RNG ordering, wrong/old/noisy/partial-content negatives, stale stats, source/decoder liveness, conservative classifier, redaction, single-use ownership and watchdog controls. New B3 tests also reject stale/failed readiness or changed validation artifacts before reservation. Temporary unit reservations use disposable local directories; in-memory unit approval values authorize no external action. No owner approval file or real B3 execution ledger was created.

The actual local control used two Chrome pages, host-only WebRTC with no ICE servers, Opus and synthetic audio. It passed bidirectional blind calibration, fresh post-trigger identification, wrong-nonce rejection, old-audio rejection during a deliberate delay and subsequent delayed fresh identification. The final detection occurred **9546.7623 ms** after its simulated backend trigger, including the deliberate one-second hold, within the unchanged ten-second limit. The full run lasted **24850.871 ms**.

This detection is close to the limit. Later provider transport/decoder behavior can still produce INCONCLUSIVE; this preparation does not guarantee success over Stream. No threshold was reduced, no nonce was supplied to the decoder, and no local retry was needed. The local trigger was simulated, not a provider-ended observation.

Retained intermediate outcomes:

- The first combined run was **289/290** because report-26's regression required every historical B2 source hash to equal current source. B3 deliberately evolves nine of those shared harness files. That assertion now records historical/current hashes for the explicit evolution set, still checks every other recorded input and preserves exact B2 request reconstruction. The old evidence/readiness hashes were not rewritten or represented as current.
- The first TypeScript subprocess wrapper exceeded its 240-second limit. A direct compiler invocation subsequently exited 0. Both outputs are retained. The first Live log-summary helper also needed an ASCII-safe Unicode regex; the completed baseline test output was parsed without rerunning or changing tests.

The five unchanged Live failures concern catalogue auth recovery, screen-only focused Program output, compositor lease refresh, audience Program privacy and standard Room Pulse preview. The Live suite is not fully green. The separate compositor RPC argument mismatch from report 27 was not repaired or re-audited here.

## 6. Provenance and readiness

Canonical [readiness receipt](stream-staging-connect-media-truth-b3-preparation.json), byte-identical to `tmp/connect-media-truth-b3-preparation/readiness.json`:

```text
SHA-256:
2855b305984a990ef7521d3e229aa1d051e64ee7ca2a25a59afad48593390771
```

The receipt freezes **73 source/SDK/protocol/package hashes**, including all harness modules/entrypoints, B3 validator/comparison/tests, all four offline SDK fixtures, production adapter and earlier fixture reference, root package/lock, relevant installed packages, four generated SFU source files and **nine** pinned server-SDK source/distribution/package files. Runtime records Node **24.18.0**, Chrome **155.0.8059.86**, Playwright **1.64.1**, Deno **2.5.4**, server SDK **0.7.63** and video-client protocol **1.62.0**. This does not establish a complete transitive Deno lock or native-build provenance.

There are **434 hashed validation/historical artifacts**. `scripts/test-connect-media-truth.cjs:8` requires the exact current inventory/contract, unexecuted B3 stage, passing control flags, unchanged artifacts and a complete local Opus receipt containing all five controls with the same source inventory. The actual canonical receipt passes this guard. Receipt flags do not authorize execution.

Offline commands, neither of which loads the provider or reads credentials:

```text
node scripts/validate-connect-media-truth-b3.cjs
node scripts/test-connect-media-truth-b3.cjs
```

The B3 execution directory `tmp/connect-media-truth-b3-execution` does not exist. The profile, runner, provider and watchdog all select B3's exact canonical manifest path; arbitrary paths and old namespace approvals fail. B3's future exclusive experiment lock prevents a new approval ID from creating a replacement under the same experiment. Historical B1/B2 readiness is stale relative to the intentionally changed source/inventory; neither was regenerated or reused.

## 7. Required future provider preflight and approval boundary

The following operations are **proposed only**. Before any future execution:

1. Obtain separate explicit owner authorization bound to experiment `connect-m2a-media-truth-b3-28` and the exact manifest hash. Require execution count one, zero replacements, a B3-prefixed approval ID, actual valid timestamps and at most 24-hour validity. Recheck all source/validation hashes before resource reservation.
2. Verify staging application **1731011**, authentication/permission checks enabled, existing `betweener_connect` exact role policy, prohibited features and disabled notification policy. Read/hash shared call types before mutation; perform no shared writes.
3. Reserve fresh identifiers only after authorization. Verify both exact users absent and the call absent; accept call absence only as HTTP 404/code 16. Never reuse a B1/B2 call/user/ledger.
4. Upsert exactly two marked owned users once; verify ownership. Submit at most one creation request. Verify exact call/type/marker/pair, both voice roles and all effective per-call restrictions/limits **before token issuance or joining**. Stop on mismatch, rejection or ambiguous response; no creation retry/replacement.
5. Run positive bidirectional controls before interpreting either media phase. Preserve trigger-gated nonce generation, live source/RTP/decoder instrumentation and held-open measurement peers. Perform the explicit backend-end comparison on the same call; never extend its timer or observation windows.
6. Have the independent watchdog close registered peers, end/delete only the owned call and hard-delete only the two marked identities. Enforce the shared cleanup-attempt budget and verify call 404/code16, users absent and unchanged shared type hash. Unknown ownership or cleanup failure stays visible with exact remaining identifiers; no prefix deletion.

No such provider preflight, owner approval, resource reservation or execution occurred. Preparation stops at this boundary. No Stream application/type/lifecycle/global-role change, Supabase/database access, migration, production operation, deployment, EAS build, OTA or calling enablement is authorized by these artifacts.

## 8. Preservation, remaining risks and declarations

The initial workspace contained **281** modified/untracked files or absences. Exactly **10** existing diagnostic/runner/test files changed intentionally; the other **271** remain unchanged. The mutations add the B3 profile through existing guards, request/schema/numeric validation, provenance, opt-in diagnostics and readiness checks, plus the explained historical test assertion. **Nine files** were added: two entrypoints, comparison module, regression, SDK fixture, proposal, comparison receipt, readiness receipt and this report.

All **403 protected historical files** remain unchanged, including reports 19–27, original proposals/readiness, owner approvals, consumed B1/B2 locks/ledgers/cleanup slots and retained media receipts. Product Connect, Live/Circle/Studio/package work and migrations are preserved, including the already absent unrelated migration. The original boundary receipt remains SHA-256 `8c1d82141a5c5140c94ac2b65e2b09dca42ebbe1f0f8c87b852d6dacdffa501d`; B2 execution evidence remains `ff77e3cb8c6bb741e666925405919b027fe9f99e65458a81e942b45ed941b8ab`.

Remaining risks: server acceptance and effective settings are unverified; historical HTTP 400 rules remain hypotheses; a later media control can miss its narrow decoding window; stats/clock/channel limitations remain; host failure can defeat cleanup; no absolute media lease, timer reset, finite hostile-peer revocation bound or native-device readiness is demonstrated. A setup success would not alone identify the former server rejection rule or resolve media security.

PASS below is scoped to the executed local controls and prepared guard/provenance contracts. It is neither execution authority nor a release approval.

```text
CONNECT_B3_REQUEST_CONTRACT = PASS
CONNECT_B3_OFFLINE_VALIDATION = PASS
CONNECT_B3_OPUS_CONTROLS = PASS
CONNECT_B3_SAFETY_GUARDS = PASS
CONNECT_B3_PROVIDER_PREPARED = PASS
CONNECT_B3_PROVIDER_EXECUTED = NO
CONNECT_M2A_SECURITY_GATE = BLOCKED
CONNECT_M2B_READY = BLOCKED
PROVIDER_WRITES = NONE
PRODUCTION_MODIFICATIONS = NONE
```
