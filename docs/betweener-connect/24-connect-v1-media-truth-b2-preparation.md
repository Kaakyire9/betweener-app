# Connect V1 Media Truth Stage B2 preparation

Date: 2026-10-29. **B2 is prepared locally. No provider experiment was executed, no owner execution approval was authored, and real calling remains disabled. M2A and M2B remain BLOCKED.**

The corrected request satisfies the installed Stream SDK 0.7.63 contract. This does not establish server acceptance, explain the historical HTTP 400 conclusively, or demonstrate provider media cutoff. Reports [19](19-connect-v1-independent-forensic-audit.md), [20](20-connect-v1-forensic-defect-remediation.md), [21](21-connect-v1-media-truth-preparation.md), [22](22-connect-v1-media-truth-stage-b-results.md) and [23](23-connect-v1-call-creation-400-audit.md) remain unchanged.

## 1. New immutable proposal and corrected request

Proposal: [stream-staging-connect-media-truth-b2-proposal.json](stream-staging-connect-media-truth-b2-proposal.json).

```text
Experiment: connect-m2a-media-truth-b2-24
Application: 1731011 / Betweener Staging
Call type: betweener_connect
Manifest SHA-256:
96f72e25ccff1e5aa9d630ec3cf597103479aceb5ec7d4e91a7afbb30a9da0f1
```

The original manifest remains SHA-256 `7ba4fb47c2a6008c30a19cd19e5edac35729e7165ba3b406b6d71ff86086f957`. It was not edited. The B2 proposal adds the prescribed field:

```json
"frame_recording": {
  "mode": "disabled",
  "capture_interval_in_seconds": 2
}
```

Every other media, safety, permission, resource, timing, observation and cleanup value is preserved. The only other manifest changes are schema version 2, a new experiment ID, an approval-ID prefix and new ownership namespaces. No feature is enabled to satisfy the request contract.

The actual shared builder produces `getOrCreate({ ring:false, notify:false, data:{ created_by_id, members, custom, settings_override } })`. The creator is the first of the two owned members; both membership roles are `connect_voice`. The existing voice-only settings retain camera/video, screensharing, recording modes, transcription/captions, thumbnails, broadcasting and ingress disabled. Maximum participants remains two, with a 60-second per-call session timer.

## 2. Permanent request-contract and schema validation

`scripts/lib/connect-media-truth/request.cjs` is now the single request builder used by the real Deno provider call path and offline validation. It also validates required B2 call/member/marker identifiers and exact request structure.

The B2 parser is closed: it starts from the hash-pinned immutable original template and permits only the explicit B2 changes above. Missing/unknown keys, unexpected schema versions, unsupported values and unreviewed setting changes fail. The interval must be exactly the reviewed value **2**, a stronger constraint than merely being inside the provider's documented interval range. Object key order is immaterial; field values and array contents are not.

`sdk-contract.cjs` compiles the concrete manifest-derived builder output as a contextual `GetOrCreateCallRequest` literal against the installed **public `dist/index.d.ts` of SDK 0.7.63**. The compiler uses strict checking and no `any`/assertion cast in that fixture. The generated source is virtual and emits no files. The package version is checked before validation.

This closes the unchecked-JSON gap from report 23. Runtime parsing establishes the reviewed manifest/identity constraints; concrete compilation independently checks SDK field types, enums and nested required properties. A real pinned-SDK probe also builds the B2 request inside Deno and verifies that its fake-fetch serialized body equals the Node builder output. That probe has network denied, synthetic credentials and narrowly scoped reads. Its synthetic HTTP 400 is an error-path control, not a provider result.

Permanent checks cover all requested negative cases:

| Case | Result |
|---|---|
| Missing frame interval | Parser and SDK declaration check reject |
| Disabled frame recording plus interval 2 | Shared builder and public SDK contract pass |
| Invalid interval: 0, negative, 61, fractional, string or null | Closed parser rejects before provider work |
| Unsupported audio/recording/transcription enums or member role | Parser rejects; independent SDK check also detects unsupported SDK enums |
| Missing required nested audio default or recording/frame mode | Parser rejects; SDK nested-field negatives fail |
| Settings at the wrong request/manifest level | Exact schema/request validation rejects; SDK excess-field check fails |
| Incorrect member object | Domain validator and SDK required-member check reject |
| Missing/empty/duplicate identifiers or wrong experiment | Runtime builder rejects, including identifiers that the generic SDK permits to be optional |
| Unknown root/nested keys or schema version | Closed parser rejects |

Validation and proposal-only commands, with no provider access:

```text
node scripts/validate-connect-media-truth-b2.cjs
node scripts/test-connect-media-truth-b2.cjs
```

## 3. Execution guard, ownership and cleanup preparation

B2 uses a closed profile with a distinct canonical manifest/readiness pair. That exact manifest path is passed through the parent, provider process, independent watchdog and emergency cleanup path. Arbitrary manifest paths are rejected. The original entrypoint remains available for historical inspection; B2 uses the new entrypoint above.

| Boundary | Prepared B2 behavior |
|---|---|
| Approval IDs | Prefix `media-truth-b2-24-`; a future approval must bind the new experiment/hash, count one execution and allow zero replacements |
| Approval validity | Explicit execution flag, valid actor/ID, actual timestamps and at most 24-hour validity; no B2 owner approval record currently exists |
| Readiness | Canonical B2 receipt must be prepared, unexecuted, contract-matched and match the complete current source inventory before any reservation/provider factory |
| Execution directory | `tmp/connect-media-truth-b2-execution`; **not created during preparation** |
| Experiment consumption | Exclusive `experiment-once.json` plus exclusive approval ledger; another approval ID cannot allocate a replacement under the same experiment |
| User IDs | New prefix `mtb2_24_`, fresh UUID marker and distinct `_a` / `_b` identities, allocated only after future authorization |
| Ownership custom key | `connect_media_truth_b2_24`, distinct from the old `connect_media_truth_21` |
| Call | Fresh reserved UUID, existing `betweener_connect`; first of the owned members is creator; no third fixture identity |
| Readback | Both exact identities absent before creation; marker and exact two distinct members checked before treating the call/users as owned |
| Deadline | 180 seconds from reservation; B2 ledgers cannot extend that deadline |
| Cleanup | Same independent watchdog and parent-disconnect trigger; 60-second budget, bounded two-slot cleanup-only attempt ledger, ownership checks before deletion |

Duplicate member entries cannot satisfy the pair ownership check. A name prefix alone never permits deletion. Cleanup closes only registered owned peers/processes, ends/deletes only the owned call, hard-deletes only the two marked fixture identities and verifies call 404/code16, users absent and unchanged shared call-type hash. Local ledgers and the experiment-consumption lock remain retained after cleanup. Cleanup is not media-cutoff evidence.

Temporary unit-test approvals/ledgers are labeled offline-unit-test, use disposable local directories and are removed. They do not authorize a real provider run. The previous consumed Stage B ledger and its approval record were neither reissued nor modified.

## 4. Safe diagnostics

The bounded diagnostics from report 23 are retained. They preserve HTTP status, provider code, known schema-path projections, finite rule hints and capture state; they now also include a bounded category and operation stage such as `input_error` / `create_call`. Request/response timing remains distinct from those diagnostic fields.

Raw provider prose/values, credentials, tokens, authorization headers, personal data, SDP, sensitive URLs and unknown response fields are omitted. Error capture still uses a response clone, 32 KiB cap and 250 ms bound. The parent bridge independently projects known diagnostics and stages. Unknown formats remain visibly unavailable rather than guessed. Product authentication and product-facing error behavior are unchanged.

`CONNECT_B2_DIAGNOSTICS=PASS` means the required bounded fields and redaction behavior pass local tests. It does not upgrade report 23's conditional ability to explain every possible provider response; the historical description remains unrecoverable.

## 5. Fresh offline controls and source provenance

The new [readiness receipt](stream-staging-connect-media-truth-b2-preparation.json) has SHA-256 `a2ab6347219d76f3c49fd6d69fdd0385887593c0f5cb64264da40bcc658e5e11`. Its working copy is `tmp/connect-media-truth-b2-preparation/readiness.json`; the bytes match. It records **61 source/protocol/package hashes**, covering the runtime modules, entrypoints, validator, relevant regressions/fixture, original/new manifests, installed SFU generated protocol, root package/lock, client/Playwright/TypeScript packages and eight pinned server-SDK package/source/distribution files.

Fresh runtime: Node **24.18.0**, Chrome **155.0.8059.86**, Playwright **1.64.1**, Deno **2.5.4**, server SDK **0.7.63** and video-client protocol **1.62.0**. This is not a complete transitive Deno lock or native-build attestation.

| Check | Fresh result |
|---|---|
| New B2 contract/schema/identity/approval/ownership/watchdog/diagnostic tests | **36/36 PASS** |
| Existing report-23 diagnostic and request regressions | **21/21 PASS** |
| Earlier Connect/media/relationship offline regressions | **172/172 PASS** |
| Final combined offline run | **229/229 PASS**, `offline-preservation-final.log` |
| Public SDK contract and Node/Deno builder/serialization parity | **PASS**; fake transport, network denied |
| Strict Deno check | **2/2 PASS**, provider module and offline SDK fixture, compiler only |
| Expo TypeScript | **PASS**, `tsc -p tsconfig.json --noEmit` |
| Targeted ESLint, including `.mts` | **PASS**, zero warnings |
| Live environment isolation / EAS project isolation | **PASS** |
| Live regressions | **504/508**, the same four failing names/counts as the retained baseline |

All controls requested by the brief were rerun: synthetic encoder/blind decoder, local Opus transport, verdict classifier, redaction, watchdog, ownership/single-use guards and relevant Connect regressions. Tests write unique per-run artifact directories; the local media runner refuses existing receipt paths before opening Chrome and writes receipts exclusively. No historical test receipt was overwritten.

### Actual local Opus attempts

Both attempts used two local Chrome pages, host-only WebRTC with no ICE servers, generated 16-FSK audio and silent remote analysis. No microphone/camera, authenticated Stream connection or database was used. All media/codec/matching/classifier code, confidence thresholds and observation windows remain unchanged.

| Attempt | Result | Meaning |
|---|---|---|
| `local-control-1` | **INCOMPLETE**, delayed phase-2 `local_decode_timeout` | Calibration, phase-1 fresh identification and wrong/previous-audio negatives passed. Both peers kept receiving, but no CRC-valid phase-2 frame was identified before timeout. Original receipt retained |
| `local-control-2` | **COMPLETE**, all five controls pass | Bidirectional calibration/fresh identification, wrong nonce rejection, old audio rejection during deliberate delay, then delayed fresh identification in both directions |

The selected second run identified delayed fresh audio **5,420.5181 ms after its simulated trigger**, including the deliberate one-second delivery delay, within the unchanged ten-second comparison limit. Its 61 hashes match the final preparation before and after execution. The first attempt has its own unchanged-during-run inventory; subsequent test-only artifact-preservation refinements are recorded by the final inventory.

The timeout is not hidden or relabeled. A completed local control proves that path under its measured conditions; it does not guarantee decoder success on every run or over Stream. A future provider fixture must pass its own positive controls and must report INCONCLUSIVE on missing/weak decoding, stats or timing. No threshold was lowered to make preparation pass.

The unchanged Live failures are: catalogue auth recovery, focused screen-only Program output, audience Program privacy, and the standard Room Pulse preview. Live isolation PASS means no new demonstrated regression and preserved Live sources/settings; it is not a fully green Live suite or device validation.

## 6. Exact proposed external operations, not executed

The linked manifest is the authoritative bounded proposal. After separate owner authorization only:

1. Verify staging app 1731011, auth/permission checks, existing dedicated type/roles, disabled notification policy and shared call-type baseline hash. Verify the two reserved identities and call are absent.
2. Upsert exactly two new marked fixture users once; verify ownership. Send at most one `getOrCreate` for the owned VOICE call using the corrected per-call overrides. Verify exact members/roles/marker/effective settings. No creation retry or replacement is permitted, including after an ambiguous response.
3. Issue ordinary diagnostic JWTs only for the two owned identities, perform coordinator/SFU admission and subscription, and publish synthetic FSK audio. No real user/global role change or hardware capture occurs.
4. Establish positive bidirectional decoding, poll owned metadata and, only after the first completed timer-ended GET, generate fresh 128-bit challenges. Keep raw peers open for the existing at-most-60-second timer observation window.
5. Send one explicit backend `mark_ended` comparison operation on the same call. Only after its ACK generate separate challenges and observe up to ten seconds while peers remain open. End events/metadata alone are not cutoff proof.
6. Start scoped watchdog cleanup by the 180-second total deadline, within its 60-second budget. Cleanup may issue idempotent end/delete on the same owned call and delete only the two owned users, then verify absence and unchanged shared type hash. It never allocates a replacement.

The same classifier remains: qualified fresh post-trigger content is FAIL for that tested boundary; a fully supported stable observation can yield only OBSERVED_CUTOFF; incomplete evidence is INCONCLUSIVE. There is no universal security PASS and no automatic readiness-gate advancement.

No authenticated provider preflight or shared-setting readback occurred in this preparation. Previously retained configuration is not claimed as current remote attestation. A new provider run must perform its own checks.

## 7. Preservation, uncertainties and approval boundary

Of **262 baseline files/absences**, **250 are unchanged**. Twelve existing diagnostic/runner/test files changed to share and validate the request, select the profile through all child/cleanup paths, retain stage/category diagnostics, preserve evidence paths and capture complete provenance. Nine new artifacts comprise three modules, two entrypoints, one regression file, proposal, readiness receipt and this report. No product source, SQL, SDK/package version, Live/Circle/Studio work or historical report was changed.

All **77 protected historical files** and all **seven hashed Stage A artifacts** remain unchanged, including the old manifest, consumed ledger/cleanup slot, owner approval, reports 19-23, Stage B/22A evidence and historical readiness. The original boundary receipt remains SHA-256 `8c1d82141a5c5140c94ac2b65e2b09dca42ebbe1f0f8c87b852d6dacdffa501d`. No provider resources or B2 execution state were created; no shared Supabase database was accessed.

Remaining uncertainties: actual server acceptance/effective readback of the corrected request, the exact historical HTTP 400 rule, timer-to-media enforcement, session restart semantics, provider/event timing, real native/device lifecycle and control-plane failure revocation. Type validity is not server semantic acceptance; local FSK delivery is not provider enforcement. The first local timeout also demonstrates that a later fixture can still be inconclusive even with this preparation.

**Stop here for owner review.** This instruction authorized preparation only. Execution requires a new explicit owner approval record bound to the B2 experiment/hash, its new ID namespace and one-use limits, followed by the guarded B2 entrypoint with both execution and approval-file arguments. No such owner approval was created or requested, and no provider factory was run. Reusing the previous approval, ledger, call or identities is excluded. No deployment, build, OTA, production modification or calling enablement occurred.

## 8. Final declarations

PASS below is scoped to the reviewed request contract and executed local controls, with the retained limitations above.

```text
CONNECT_B2_REQUEST_CONTRACT = PASS
CONNECT_B2_OFFLINE_CONTROLS = PASS
CONNECT_B2_DIAGNOSTICS = PASS
CONNECT_B2_PROVIDER_TEST_PREPARED = PASS
CONNECT_B2_PROVIDER_TEST_EXECUTED = NO
CONNECT_M2A_SECURITY_GATE = BLOCKED
CONNECT_M2B_READY = BLOCKED
PROVIDER_WRITES = NONE
PRODUCTION_MODIFICATIONS = NONE
```
