# Connect V1 Media Truth B2 results

Date: 2026-10-29. Experiment: `connect-m2a-media-truth-b2-24`. **The single approved execution is INCONCLUSIVE. Stream rejected call creation with HTTP 400 / code 4; no media phase ran.** The new bounded diagnostics retained references to `video.target_resolution.height` and `video.target_resolution.width`. They did not retain a specific validation rule. M2A and M2B remain BLOCKED.

The independent watchdog hard-deleted the two owned fixture users and verified that the reserved call and both users are absent. The shared call-type hash is unchanged. **The B2 execution allowance is consumed.** There was one creation request, no creation retry and no replacement experiment.

## 1. Owner approval and local preflight

The owner's attachment, `2ec79277-766b-4ebc-bb24-05697a250174/Pasted text.txt`, explicitly authorized one execution of the existing [B2 proposal](stream-staging-connect-media-truth-b2-proposal.json), followed by scoped cleanup. It specified staging application **1731011, Betweener Staging**, at most two owned fixture users and one synthetic VOICE call. Its SHA-256 is `2fc2bbb3a5d6802f23028830fcac15b0e44c35bd3b58f284f51d4cf61600b909`.

The proposal was read and its mandatory SHA-256 verified without modification:

```text
96f72e25ccff1e5aa9d630ec3cf597103479aceb5ec7d4e91a7afbb30a9da0f1
```

[Report 24](24-connect-v1-media-truth-b2-preparation.md) and the [B2 readiness receipt](stream-staging-connect-media-truth-b2-preparation.json) were read. The fresh local check completed at **2026-10-29T16:08:29.636Z** and verified:

- All **61** source, SDK, protocol and package hashes, including exact inventory equality with the prepared source list.
- The canonical readiness SHA-256 `a2ab6347219d76f3c49fd6d69fdd0385887593c0f5cb64264da40bcc658e5e11`, its byte-identical working copy and report 24's recorded hash.
- All **22** recorded preparation artifacts: 15 B2 artifacts and seven historical Stage A artifacts; all **77** protected historical files also matched.
- The unchanged readiness results: **229/229** offline tests and selected local Opus control `COMPLETE`. The earlier local decoder timeout remains retained in report 24.
- A freshly executed offline request-contract check against the installed Stream server SDK **0.7.63**, with zero compiler errors. Its synthetic request hash remains `4cc3c5e123b5bbdddfbcc65a804d62d3963b3d3377effaa138ef3abff0bc2a20`.
- No existing B2 execution directory or consumed B2 experiment lock.

A new approval record was created from that owner instruction, using the actual creation time **16:08:29.623Z** and expiry **17:08:29.623Z**. Its ID is `media-truth-b2-24-02e80d31-a307-4d8d-9019-0cd18ac4b0c1`. It records one execution, two new users maximum, one new call maximum, zero creation retries and zero replacements. The existing authorization guard passed. The original Stage B approval and consumed ledger were not reused or changed.

The unchanged guarded runner was invoked once:

```text
node scripts/test-connect-media-truth-b2.cjs --execute --approval tmp/connect-media-truth-b2-stage-b/owner-approval.json
```

No automatic approval rejection occurred for this launch. The runner exited **1**, reporting `result=INCOMPLETE`, `cleanupErrors=[]` and `phases=[]`. No source repair, manifest regeneration or second launch followed the failure.

## 2. Runtime, provenance and retained evidence

The [B2 evidence receipt](stream-staging-connect-media-truth-b2-evidence.json) retains the approval, fresh local preflight, ownership ledger, original runner evidence, independent cleanup receipt, source inventory and original artifact hashes. Its SHA-256 is:

```text
ff77e3cb8c6bb741e666925405919b027fe9f99e65458a81e942b45ed941b8ab
```

Actual execution reports parent **Node v24.18.0**, provider **Deno 2.5.4** and pinned **Stream server SDK 0.7.63**. The runner's final provenance confirms all **61 prepared hashes unchanged**. Preparation records Chrome **155.0.8059.86**, Playwright **1.64.1** and generated Stream client protocol **1.62.0**; no browser or raw SFU peer started in this execution, so these media runtimes were not exercised against Stream.

Original artifacts are under `tmp/connect-media-truth-b2-execution/`, using stem `approval-media-truth-b2-24-02e80d31-a307-4d8d-9019-0cd18ac4b0c1.json`:

| Artifact | SHA-256 |
|---|---|
| Ownership ledger, stem above | `4a91610b4362126cdb46822f91ff36c41a83838963d0e7c3f8db6cbba524ba74` |
| Stem + `.evidence.json` | `7d4d381434229ea807d50b8acf38282864f172c83ea227842345ceec86b06ff5` |
| Stem + `.cleanup.json` | `b9213f2992ffbb38289bbd4a79a4da7852463d07bd8ff66680248455907b9c77` |
| Stem + `.cleanup-attempt-1` | `519e701f1e754a3ca7686562f05cf48d6a87bfe72609c3830079984e9da8f879` |
| `experiment-once.json` | `d7dab21508f79b717edd0800e329e8ef612c00ead2407173c69c2bbd3120625c` |

The exclusive experiment lock and ownership ledger remain present. There is one cleanup slot, no second cleanup slot and no emergency-cleanup receipt. The sanitized receipt contains no JWT, credential, authorization header, SDP, raw provider error body or personal audio. The new field hints are a projection of the actual failed provider response, not a synthetic error fixture.

## 3. Provider preflight, ownership and call creation

The source-hashed provider validator completed its real-provider preflight before mutation. It verified application ID **1731011**, name **Betweener Staging**, authentication and permission checks enabled, existing `betweener_connect` type and required role policy, and notifications disabled. The exact reserved identities were absent and the reserved call returned **HTTP 404 / code 16**. The receipt retains successful validator operations and request timings rather than full app/type payloads.

The preflight baseline hash of canonical `listCallTypes().call_types` was:

```text
12e74f5fca79a1dea2b48a8c950bbc3a2189a3ffdf9e04ccb43d28c4e4533a7e
```

The exclusive ledger registered ownership at **16:08:46.145Z**, before provider writes:

| Resource | Exact owned identifier | Actual outcome |
|---|---|---|
| Fixture user A / intended creator | `mtb2_24_74c2840a-b105-446f-a29a-296e7aea29cd_a` | Created, ownership readback passed, then hard-deleted |
| Fixture user B | `mtb2_24_74c2840a-b105-446f-a29a-296e7aea29cd_b` | Created, ownership readback passed, then hard-deleted |
| Reserved call | `2ac9b810-83bd-4f9a-9449-a54542fc0545` | One creation POST rejected; subsequent reads confirm absent |
| Intended CID | `betweener_connect:2ac9b810-83bd-4f9a-9449-a54542fc0545` | No admission or media session |
| Custom ownership marker | `74c2840a-b105-446f-a29a-296e7aea29cd` | Scoped to these fixture resources under `connect_media_truth_b2_24` |

There was one two-user upsert and one call-creation POST. The first fixture member was the intended creator, both intended membership roles were existing `connect_voice`, and no global user role or role definition was changed. The creation POST returned **HTTP 400 / code 4**. Creation was not acknowledged as successful, and cleanup found no call.

### Submitted settings versus effective settings

The prepared provider used the unchanged shared request builder and exact approved overrides. The submitted settings included:

| Group | Submitted restriction | Effective readback |
|---|---|---|
| Limits | Two participants, 60-second session duration | Unavailable: creation rejected |
| Audio | Synthetic source only; mic default off; earpiece; speaker default off; access requests off | Unavailable |
| Video / screen sharing | Video and camera default off; screen sharing off | Unavailable |
| Recording / transcription | Recording, individual/raw/frame recording, transcription and closed captions disabled | Unavailable |
| Frame interval | `capture_interval_in_seconds=2`, with frame mode still disabled | Unavailable |
| Other capture/output | Broadcasting, ingress and thumbnails disabled | Unavailable |
| Notifications | `ring=false`, `notify=false` | Unavailable; shared notifications preflight passed |

The request omitted the optional SDK `video.target_resolution` object, as specified by the unchanged manifest. No setting was added or relaxed in response to the server error. There is **no successful effective-call-settings readback** and no evidence that a 60-second provider timer was installed on an actual call.

## 4. Execution and cleanup timeline

All times below are **2026-10-29 UTC**. HTTP end times identify response-header receipt; they are not invented provider commit timestamps. Parent, provider and watchdog monotonic clocks have different origins and are retained separately.

| UTC time | Retained observation |
|---|---|
| **16:08:29.623** | New owner approval created; expiry one hour later |
| **16:08:29.636** | Local manifest/readiness/source/artifact/contract validation completed |
| **16:08:46.145** | Exclusive B2 ownership ledger reserved; hard deadline 16:11:46.145 |
| **16:08:46.677-46.798** | Provider startup app GET, HTTP 200; staging identity/checks validator passed |
| **16:08:46.813-47.057** | Parent provider-preflight operation, successful |
| **16:08:46.951-46.969** | Reserved call GET, HTTP 404 / code 16, accepted as absence |
| **16:08:47.063-47.126** | Parent create-users operation, successful, including ownership readback |
| **16:08:47.074-47.106** | Single two-user upsert POST, HTTP 201 |
| **16:08:47.107-47.124** | Fixture user query, HTTP 200; both owned markers verified |
| **16:08:47.129-47.160** | Parent create-call operation, unsuccessful |
| **16:08:47.143-47.155** | Only call-creation POST, HTTP 400 / code 4 |
| **16:08:47.158** | Provider error decoding completed; bounded field hints retained |
| **16:08:47.160** | Experiment stopped; local cleanup/completion recorded; no peers existed |
| **16:08:47.221** | Independent watchdog cleanup started, reason `experiment-finally` |
| **16:08:47.751-47.849** | Cleanup call GET, HTTP 404 / code 16; no call end/delete required |
| **16:08:47.854-47.873** | Owned-user query; ownership checked before deletion |
| **16:08:47.874-47.912** | Hard-delete request for the exact two fixture identities, HTTP 201 |
| **16:08:47.913-48.507** | Owned deletion-task polling; completion verified |
| **16:08:48.507-48.523** | Final call GET, HTTP 404 / code 16 |
| **16:08:48.524-48.542** | Final owned-user query, HTTP 200; zero owned users remain |
| **16:08:48.542-48.564** | Shared call-type readback, HTTP 200; canonical hash unchanged |
| **16:08:48.641** | Watchdog cleanup completed, no errors |

Cleanup completed **2.496 seconds after reservation**, well before the 180-second hard deadline. Its recorded watchdog monotonic duration was approximately **1.421 seconds**, within the 60-second cleanup budget. No observation window began or was extended.

## 5. Media controls, timer, nonce, RTP, SFU and explicit-end evidence

| Required measurement | Actual B2 execution evidence |
|---|---|
| Positive bidirectional synthetic audio / blind decoder calibration | **NOT RUN**. Historical local Opus controls are preparation evidence only |
| Coordinator admission / raw SFU join acknowledgement | **NONE**; call creation failed first |
| Provider session ID, session start or timer deadline | **NONE** |
| First completed GET with `ended=true` | **NONE** |
| Fresh post-ended nonce generation and scheduling | **NONE**; no timer trigger existed |
| Independently decoded remote nonce | **NO MEASUREMENT**; absence of a measurement does not establish non-delivery |
| Per-receiver / per-SSRC RTP, stats timestamps, jitter buffer or decoder liveness | **NONE for either receiver**; no receiver was created |
| SFU events, end signaling, socket reasons or connected peer state | **NONE**; no raw peer started |
| Explicit backend `mark_ended` comparison and ACK | **NOT SENT**; no owned call existed |
| Separate post-ACK challenge / ten-second comparison window | **NOT RUN** |
| Timer versus explicit-end cutoff interval | **INCONCLUSIVE**; both phases absent |

The original runner records `peers=[]` and `phases=[]`. The classifier source was unchanged; there was no phase receipt to classify as FAIL or OBSERVED_CUTOFF. The overall diagnostic is INCONCLUSIVE because setup failed. No sending/receiving statistics, media-security failure or successful cutoff can be inferred from this execution.

## 6. Actual validation error and remaining uncertainty

The error crossed the provider and JSON-child boundaries with these safe fields intact:

```json
{
  "status": 400,
  "code": 4,
  "category": "input_error",
  "stage": "create_call",
  "capture": "parsed",
  "fields": [
    "data.settings_override.video.target_resolution.height",
    "data.settings_override.video.target_resolution.width"
  ],
  "ruleHints": [],
  "textOmitted": true
}
```

The parent reason is `child_operation_failed`; the provider reason is `provider_operation_failed`. These generic labels do not erase the separately retained status/code, operation stage, projected field hints or request timing. The response was parsed by the bounded diagnostic capture; this was not a capture timeout or an offline synthetic response.

**Confirmed:** the corrected B2 request passed the pinned public SDK contract, but the actual server rejected its creation request and the diagnostic projection recognized height/width field references. **Unknown:** the precise validation predicate, rejected values, conditional/default-resolution rule and whether these references enumerate every server objection. `ruleHints=[]` must not be relabeled as a required/minimum/range error. The projector normalizes recognized field names and aliases; the retained paths are safe field hints rather than a verbatim provider assertion.

Adding the frame interval was therefore insufficient to obtain server acceptance for this exact B2 request. This does not prove which rule caused the earlier Stage B HTTP 400: its descriptive error was discarded. The historical root-cause hypothesis in report 23 remains unconfirmed. No live provider validation of an alternative request, runtime source fix or automatic request adjustment occurred here.

The fresh-audio question remains unanswered. This run establishes no media cutoff interval, finite revocation latency, absolute SFU lease, timer-reset behavior, provider-internal media root cause or native calling readiness.

## 7. Cleanup, configuration isolation and preservation

The executed independent watchdog receipt reports:

```json
{
  "errors": [],
  "callAbsent": true,
  "usersAbsent": true,
  "sharedUnchanged": true,
  "afterHash": "12e74f5fca79a1dea2b48a8c950bbc3a2189a3ffdf9e04ccb43d28c4e4533a7e"
}
```

Cleanup used one owned-resource attempt with ownership readback before deleting the exact two users. The call was absent, so no end/delete operation was necessary. No prefix-based deletion, cleanup retry, emergency cleanup or additional fixture occurred. No owned call or fixture identity remained at the final verification. The successful provider mutations were creation and deletion of the two fixture identities; the call-creation request was rejected.

`CONNECT_B2_SHARED_CONFIG=UNCHANGED` is scoped to the matching before/after canonical `listCallTypes().call_types` hash. This comparison includes the listed Live call-type settings. No shared type, role, Live or global settings write was made. It is not a full post-run attestation of every app-global setting or concurrent external activity. The Live source baseline is also unchanged; no fresh full Live regression or device run was performed for this execution-only task.

All **271 baseline workspace entries** remain unchanged, including the pre-existing deleted migration, unrelated Live/Circle/Studio/package work, report 24, readiness and proposal. All **77 protected historical entries** remain unchanged, including the consumed original Stage B ledger and approval. All **61 prepared source hashes** and the recorded preparation artifacts still match. The original boundary receipt remains SHA-256 `8c1d82141a5c5140c94ac2b65e2b09dca42ebbe1f0f8c87b852d6dacdffa501d`.

The only new repository artifacts are this report and the sanitized B2 evidence receipt. New ignored local files retain the approval, preflight, workspace snapshot, execution log, single-use lock, owned-resource ledger and cleanup evidence. No executable source, manifest, historical report, migration or existing evidence was edited. The B2 lock and consumed ledger remain intact.

No Supabase access, database change, deployment, build, OTA, production change, native-device validation or calling enablement occurred. Existing source and tests were unchanged; the execution preflight revalidated their recorded hashes and freshly ran the offline SDK contract check. The 229-test result and local Opus results remain preparation results, not newly rerun media/security tests. Cleanup success and configuration equality are resource/isolation evidence, not media-cutoff evidence.

## 8. Next engineering action and final declarations

The minimum next action is a separate **offline** investigation of the actual server field hints against the pinned request and documented video-resolution/default semantics, including how disabled video is validated. Any proposed request change should receive refreshed contract, serialization, safety and preparation checks. Do not strip disabled-capability settings or claim that one guessed resolution would succeed. No such repair was performed under this execution authorization.

A future real-provider experiment requires a new reviewed manifest/preparation and separate explicit owner approval. The consumed B2 lock and ledger must not be reset, deleted or reused. This setup result does not justify advancing either security gate.

```text
CONNECT_B2_EXPERIMENT = INCONCLUSIVE
CONNECT_B2_CALL_CREATION = FAIL
CONNECT_B2_FRESH_MEDIA_AFTER_END = INCONCLUSIVE
CONNECT_B2_EXPLICIT_END_CUTOFF = INCONCLUSIVE
CONNECT_B2_CLEANUP = PASS
CONNECT_B2_SHARED_CONFIG = UNCHANGED
CONNECT_M2A_SECURITY_GATE = BLOCKED
CONNECT_M2B_READY = BLOCKED
PRODUCTION_MODIFICATIONS = NONE
```

`CONNECT_B2_CALL_CREATION=FAIL` describes the rejected setup request, not an observed media-permission bypass. PASS is scoped to executed cleanup and provider absence checks. **EXPERIMENT_EXECUTIONS=1; CALL_CREATION_REQUESTS=1; CREATION_RETRIES=0; REPLACEMENT_EXPERIMENTS=0; MEDIA_PHASES_EXECUTED=0.**
