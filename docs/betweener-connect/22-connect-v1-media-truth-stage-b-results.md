# Connect V1 Media Truth Stage B results

Date: 2026-10-29. Experiment: `connect-m2a-media-truth-21`. **The single approved execution returned INCOMPLETE: Stream rejected call creation with HTTP 400 / provider code 4. No media phase ran. The diagnostic result is INCONCLUSIVE; M2A and M2B remain BLOCKED.**

The two owned fixture users were created, verified and subsequently hard-deleted by the existing watchdog cleanup. The owned call is confirmed absent. The shared call-type configuration hash is unchanged. The execution allowance is consumed; there was no creation retry or replacement experiment.

## 1. Authorization, manifest and local preflight

The project owner directly answered **"Re-approve the exact Stage B experiment"** to the chat question naming staging app **1731011, Betweener Staging**, experiment `connect-m2a-media-truth-21`, the exact manifest hash, at most two owned users and one synthetic VOICE call, and scoped cleanup. This resolved the earlier approval-review block.

The original [manifest](stream-staging-connect-media-truth-proposal.json) remains unchanged. Its verified SHA-256 is:

```text
7ba4fb47c2a6008c30a19cd19e5edac35729e7165ba3b406b6d71ff86086f957
```

The approval record was refreshed from the direct chat instruction at **2026-10-29T13:56:00.604Z**, expiring **2026-10-29T14:56:00.604Z**. It retains the previously unused approval ID `media-truth-stage-b-db499dbe-0c50-4458-b8a3-19f2ac5fa379`, records execution count one and replacements zero, and passes the existing authorization guard. The earlier approval record is preserved locally; no timestamp was backdated.

Fresh local validation at **13:56:00.608Z** confirmed the exact manifest hash, all **30 preparation source hashes**, byte-identical canonical/working readiness receipts, Stage A preparation PASS, no existing execution ledger and no baseline source/configuration changes. [Report 21](21-connect-v1-media-truth-preparation.md) and its [readiness receipt](stream-staging-connect-media-truth-preparation.json) were read. The prepared runner, provider implementation, manifest and classifier were not edited.

The unchanged guarded runner was invoked once:

```text
node scripts/test-connect-media-truth.cjs --execute --approval tmp/connect-media-truth-stage-b/owner-approval.json
```

Two earlier launch submissions had been rejected before process creation. Those did not execute an experiment or consume a ledger. Their status receipt and the earlier report version remain under `tmp/connect-media-truth-stage-b/`; they are historical records superseded by this execution result.

## 2. Evidence and runtime provenance

The [retained Stage B evidence](stream-staging-connect-media-truth-stage-b-evidence.json) contains the approval, ownership ledger, unmodified runner evidence, cleanup receipt, source hashes and original artifact hashes. Its SHA-256 is `0a56f8e0b2958eeb0983861026d26a7d5db08c0b8586101d15deea8dae517ac0`. It contains no credentials, JWTs, SDP or personal audio.

Actual provider runtime reports **Deno 2.5.4**, pinned **Stream server SDK 0.7.63**, and parent **Node v24.18.0**. Source hashing before execution and in the runner's final provenance both confirm the same 30 prepared files. The preparation records Chrome **155.0.8059.86**, Playwright **1.64.1** and generated Stream client protocol **1.62.0**; no browser/raw SFU peer started during this provider run, so those media runtimes were not exercised here.

Original artifacts are retained under `tmp/connect-media-truth-execution/`, with stem `approval-media-truth-stage-b-db499dbe-0c50-4458-b8a3-19f2ac5fa379.json`:

| Artifact | SHA-256 |
|---|---|
| Ownership ledger, stem above | `9b335d7f2436393c6d6799fbcc4e879d6000852ded6cb9f4e53c320ed934bf1d` |
| Same stem + `.evidence.json` | `7789072d1891683c8324248f7a71634aada750fddcbfd0c4bdcb9168360b9b62` |
| Same stem + `.cleanup.json` | `3c29d7b24c14ab192754d9ba72ef3367d8c2c496944b0630d0d700717a4bce74` |

The single cleanup slot `.cleanup-attempt-1` exists. No second cleanup slot or emergency-cleanup receipt exists. The runner exited **1** with `result=INCOMPLETE`, `cleanupErrors=[]` and `phases=[]`.

## 3. Provider preflight and owned resources

The source-hashed provider validator successfully checked staging application identity, authentication/permission checks enabled, the existing `betweener_connect` type and required policy, and notifications disabled. It verified that the exact reserved user IDs were absent and that the owned call GET returned HTTP 404 / code 16 before mutation. The full raw app/type payload is not retained; the successful validator operation and its request timings are retained.

The preflight captured this shared call-type baseline hash:

```text
12e74f5fca79a1dea2b48a8c950bbc3a2189a3ffdf9e04ccb43d28c4e4533a7e
```

Ownership was reserved in the exclusive single-use ledger **before any provider mutation**:

| Resource | Exact owned identifier | Outcome |
|---|---|---|
| Fixture user A / intended creator | `mt21_d20e023d-bad0-4bde-82cd-26dfa7f41400_a` | Created with fixture marker; ownership readback passed; hard-deleted |
| Fixture user B | `mt21_d20e023d-bad0-4bde-82cd-26dfa7f41400_b` | Created with fixture marker; ownership readback passed; hard-deleted |
| Reserved call ID | `17b3303d-3a49-4de4-b619-524e56e5610d` | One creation POST rejected; subsequent GETs confirm absent |
| Intended CID | `betweener_connect:17b3303d-3a49-4de4-b619-524e56e5610d` | No join or media session |
| Ownership marker | `d20e023d-bad0-4bde-82cd-26dfa7f41400` | Used only for these owned fixture resources |

The runner submitted the approved per-call overrides without changes, using the first fixture member as creator and existing `connect_voice` member roles. Because call creation failed, there is no successful effective-call-settings readback. No shared role definition or global user role was changed.

## 4. Execution and cleanup timeline

All UTC timestamps below are **2026-10-29**. HTTP response timestamps identify response-header receipt, not an invented server commit time. Parent and provider monotonic origins remain separate in the receipt.

| UTC time | Retained observation |
|---|---|
| **13:56:14.201** | Exclusive ownership ledger reserved |
| **13:56:17.087-17.253** | Provider startup staging-app GET, HTTP 200 |
| **13:56:17.266-17.490** | Parent provider-preflight bracket, successful |
| **13:56:17.386-17.402** | Preflight owned-call GET, HTTP 404; absence accepted only with provider code 16 |
| **13:56:17.496-17.574** | Parent create-users operation, successful, including ownership readback |
| **13:56:17.506-17.548** | Single two-user upsert POST, HTTP 201 |
| **13:56:17.549-17.572** | Fixture-user ownership query, HTTP 200 |
| **13:56:17.577-17.600** | Parent create-call operation, unsuccessful |
| **13:56:17.586-17.598** | Only owned-call creation POST, HTTP 400 |
| **13:56:17.599** | Provider failure decoded: code 4, `provider_operation_failed` |
| **13:56:17.600** | Experiment stopped; local measurement cleanup/completion recorded; no peers existed |
| **13:56:17.669** | Independent watchdog cleanup started, reason `experiment-finally` |
| **13:56:18.181-18.255** | Cleanup owned-call GET, HTTP 404 / code 16; no call end/delete needed |
| **13:56:18.256-18.283** | Owned-user query before deletion, HTTP 200; ownership checks passed |
| **13:56:18.284-18.309** | Hard-delete request for owned fixture identities, HTTP 201 |
| **13:56:18.310-18.942** | Cleanup task polling; successful completion before absence verification |
| **13:56:18.943-18.960** | Final owned-call GET, HTTP 404 / code 16 |
| **13:56:18.960-18.976** | Final owned-user query, HTTP 200; zero owned users remain |
| **13:56:18.977-18.994** | Shared call-type readback, HTTP 200; hash equals baseline |
| **13:56:19.075** | Watchdog cleanup completed with no errors |

The ledger hard deadline was **13:59:14.204Z**. Cleanup completed about **4.874 seconds after ledger reservation**, with its own recorded monotonic duration about **1.406 seconds**. Both the 180-second experiment deadline and 60-second cleanup budget were respected. No timer or backend observation window began or was extended.

## 5. Media evidence, error and diagnostic classification

| Required evidence | Actual result |
|---|---|
| Positive bidirectional synthetic audio / independently decoded control frames | NOT RUN; Stage A local controls do not substitute for provider calibration |
| Coordinator admission / raw SFU join ACK | NONE; creation failed first |
| Provider session ID, session start or 60-second timer deadline | NONE |
| First completed provider GET with `ended=true` | NONE |
| New post-ended 128-bit nonce and source scheduling | NONE |
| Qualified independent remote nonce detection | NO MEASUREMENT; this is not a finding of non-delivery |
| Per-SSRC RTP, receiver timestamps, jitter-buffer or source-liveness samples | NONE |
| SFU signaling/end events or connected raw PeerConnections | NONE |
| Explicit backend `mark_ended`, ACK and separate post-ACK challenge | NOT SENT; no owned call existed to end |
| Timer/backend comparison and measured cutoff interval | INCONCLUSIVE; both phases absent |

The retained error is **HTTP 400 / provider code 4** from the owned-call creation POST. The bridge reported `child_operation_failed` and preserved the typed status/code and HTTP timing. Its existing sanitizer did not retain the provider's descriptive error text or rejected field. **The exact call-creation validation rule or field is UNKNOWN.** This report does not infer a media-security failure, timer behavior or incorrect provider permission from this error.

There was one call-creation request and no retry. The runner stopped immediately after the failure, closed its provider process and requested existing watchdog cleanup. The classifier was unchanged; with `phases=[]`, there is no phase observation to classify as FAIL or OBSERVED_CUTOFF. The overall diagnostic is **INCONCLUSIVE because call setup failed**.

## 6. Cleanup, preservation and isolation

Cleanup used one owned-resource attempt, with no errors. It confirmed `callAbsent=true`, `usersAbsent=true` and `sharedUnchanged=true`. The final shared hash is exactly `12e74f5fca79a1dea2b48a8c950bbc3a2189a3ffdf9e04ccb43d28c4e4533a7e`. No cleanup retry, replacement fixture, broad deletion or manual provider operation occurred.

`CONNECT_PROVIDER_CLEANUP=PASS` means executed scoped cleanup plus real-provider absence verification. `CONNECT_SHARED_CONFIG_UNCHANGED=PASS` is scoped to the before/after canonical `listCallTypes().call_types` hash; it is not an attestation of every global provider setting or concurrent external activity. The only successful provider mutations in this run were creation and deletion of the two owned fixture users. The call-creation mutation was rejected. No media was captured or published.

The fresh repository preservation comparison found **all 254 baseline entries unchanged**, including unrelated Live/Circle/Studio/package work, earlier reports, retained receipts and the pre-existing absent migration. The manifest and all 30 preparation hashes remain unchanged. The original boundary receipt still has SHA-256 `8c1d82141a5c5140c94ac2b65e2b09dca42ebbe1f0f8c87b852d6dacdffa501d`.

This report was updated and the sanitized Stage B receipt added; ignored local approval/status/execution files were also written. No executable source, historical migration or existing provider evidence was edited. No Supabase access, database change, deployment, build, OTA, production change, native-device validation or calling enablement occurred.

Live isolation PASS means unchanged Live sources, no shared policy writes and an unchanged shared call-type readback. It does not mean a fresh full Live regression/device run. The prepared source was not changed, so no new unit-test run was needed for this execution-only task. Stage A test results remain historical local evidence.

## 7. Remaining limits and next engineering action

The post-timer fresh-audio question remains unanswered. This run establishes no media cutoff interval, revocation latency, absolute SFU lease, timer-reset behavior, provider-internal root cause or native calling readiness. A cleanup success or configuration hash is not media-enforcement evidence.

The minimum next engineering action is an offline investigation of the exact call-creation request against the pinned SDK/API schema, followed by a narrowly reviewed diagnostic correction that preserves safe error details without credentials. The retained status/code alone cannot identify the rejected field. Any changed manifest or harness requires refreshed local preparation/provenance; a later provider execution requires a separate explicit authorization. **The current single-use ledger must remain consumed and must not be reset, deleted or reused for another fixture.** No further run or source repair was performed under this execution authorization.

## 8. Final declarations

```text
CONNECT_MEDIA_TRUTH_EXPERIMENT = INCONCLUSIVE
CONNECT_TIMER_FRESH_AUDIO_DELIVERY = INCONCLUSIVE
CONNECT_EXPLICIT_END_MEDIA_CUTOFF = INCONCLUSIVE
CONNECT_PROVIDER_CLEANUP = PASS
CONNECT_SHARED_CONFIG_UNCHANGED = PASS
CONNECT_LIVE_ISOLATION = PASS
CONNECT_M2A_SECURITY_GATE = BLOCKED
CONNECT_M2B_READY = BLOCKED
PRODUCTION_MODIFICATIONS = NONE
```

PASS declarations are scoped to cleanup, the retained configuration comparison and isolation as described above. **EXPERIMENT_EXECUTIONS=1; CALL_CREATION_REQUESTS=1; CREATION_RETRIES=0; REPLACEMENT_EXPERIMENTS=0; MEDIA_PHASES_EXECUTED=0.**
