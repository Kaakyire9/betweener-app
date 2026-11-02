# Connect V1 forensic defect remediation

Date: 2026-10-29. Scope: local repair of AD-1 and DB-1 from [report 19](19-connect-v1-independent-forensic-audit.md). **Both defects are repaired and locally verified. Real calling remains disabled; M2A and M2B remain BLOCKED.**

No Stream requests, provider writes, shared database modifications, deployment, build, OTA or native-device work were performed. The forward migration was applied only inside disposable local test databases. These results do not establish a fix for timer-ended calls continuing to receive RTP.

## 1. Root causes and reproduced failures

**AD-1:** `media()` previously discarded observations without a session and derived permanent termination solely from `session.ended_at`. Consequently:

- `call.ended_at` with `session=null` produced no reconciliation; the sync job completed successfully.
- `call.ended_at` with a retained non-ended session reconciled `ended=false`.
- Session-only termination could incorrectly become permanent call termination.

The new adapter/worker regressions were written and run before implementation. The normalized initial run had **11 tests: 3 passed, 8 failed**, including both forensic counterexamples. An additional focused regression later reproduced another occurrence of the same defect: an ended `getOrCreate` result was acknowledged as successful provisioning. That test failed with actual `{success:true}` before adding the terminal guard.

**DB-1:** `rpc_connect_admission` ran `connect_expire`, then raised an uncaught exception for the terminal result. The exception rolled back the newly created terminal state and end job. The initial disposable database run had **10 groups: 2 passed, 8 failed**. Separate committed-state reads, before any `get_call` or sweep, showed:

```json
{
  "admissionRejected": true,
  "raised": true,
  "committed": {
    "state": "ACCEPTED",
    "ended": false,
    "endJobs": 0,
    "occupancy": 2
  }
}
```

The deadline, expired-grant, revoked-grant and expired-source cases exposed this rollback. A rejected RPC response alone was not accepted as persistence evidence. PostgreSQL documents that an ordinary uncaught exception aborts the transaction; returning a denial value allows the successful RPC transaction to commit its invalidation. [PostgreSQL exception semantics](https://www.postgresql.org/docs/current/plpgsql-errors-and-messages.html).

## 2. Code and migration changes

| File | Change |
|---|---|
| `supabase/functions/_shared/connect-stream-adapter.ts:10` | Adds `ConnectProviderObservation` with nullable real session ID, actual observed users, separate call/session ended flags and confirmed missing-call flag. |
| Same adapter, `provision`, `credentials`, `media` | Reads call-level `ended_at`; rejects ended results before successful provision ACK or member promotion/token minting. A terminal call remains observable without a session. Confirmed missing means SDK HTTP 404 **and** provider code 16; auth/network/ambiguous errors remain retryable. |
| `supabase/functions/_shared/connect-provider-worker.ts:37` | Syncs RINGING/ACCEPTED as well as connecting/active/reconnecting calls. Always reconciles a valid observation. Maps permanent call end/missing to `ended=true`; session-only end supplies an empty live roster instead. Completion follows successful reconciliation. |
| `supabase/functions/_shared/connect-credential-issuance.ts:17` | Shared, testable credential orchestration. Requires strict `admitted === true`, correct user/call/type/media and an allowed state at **both** admission fences. Rejects missing/mismatched snapshots and changed media. |
| `supabase/functions/connect-credentials/index.ts:20` | Uses that orchestration. Initial denial performs no provider credential work. Post-mint denial suppresses the response. Existing safe HTTP 403 translation and bearer/body validation remain. |
| `supabase/migrations/20261029081013_connect_forensic_repair_1.sql:4` | Forward-only replacement of admission with committed structured denials. Preserves actor/pair/device/flag checks, function signature, SECURITY DEFINER and fixed search path. |
| Same migration, `rpc_connect_reconcile_media` at line 34 | Permanent call end takes precedence over absent, ended or mismatched session metadata. Nullable session is supported without fabricating an ID. An active call without an observed session moves to RECONNECTING. Existing terminal absorption and membership/session identity guards remain. |
| `scripts/lib/connect-test-database.cjs` | Applies the new migration to every disposable Connect schema clone, so existing suites exercise the repaired definitions. |
| `scripts/lib/connect-stream-closure-worker.ts:89` | Uses the same two-fence credential orchestration, preventing its old exception-only handling from bypassing structured denial. This fixture was not executed against Stream. |
| `scripts/test-connect-security.cjs`; `scripts/test-connect-revocation.cjs`; `scripts/test-connect-consent-stream.cjs` | Adapt admission negatives to structured denial and positives to explicit approval. No authorization assertion was replaced with mere HTTP success. |
| `scripts/test-connect-revocation-boundary.cjs`; `scripts/test-connect-video-stream.cjs` | SQL bridge quoting preserves an actual null session rather than the string `'null'`. Neither provider driver was run. |
| `scripts/prepare-connect-edge-check.cjs` | Includes the new credential module in strict isolated Edge checks. |
| `__tests__/connect-foundation.regression.test.ts` | Updates the existing observation expectation to the explicit call/session contract. Original suite count stays 87. |
| `__tests__/connect-provider-observation.regression.test.ts`; `__tests__/connect-credential-issuance.regression.test.ts` | Adds 14 adapter/worker and 14 credential-fence regressions. |
| `scripts/test-connect-forensic-repair.cjs` | Adds committed-state, HTTP, concurrency, retry and real adapter/worker/SQL integration coverage: 18 passing groups. |

The migration file was generated with the repository wrapper, `scripts\supabase.cmd migration new connect_forensic_repair_1`, using CLI 2.121.0. No historical migration was edited. The new migration changes only the two existing functions and their explicit grants; it introduces no table, data backfill, scheduler, provider policy or enabled feature flag.

## 3. Updated contracts and lifecycle meaning

The adapter returns:

```ts
interface ConnectProviderObservation {
  session: string | null;
  users: string[];
  callEnded: boolean;
  sessionEnded: boolean;
  missing: boolean;
}
```

These flags describe observed provider control state. They do not certify that media stopped. `session=null` means no session was returned; `sessionEnded=false` in that case does not prove an active session.

| Provider observation | Worker/SQL result |
|---|---|
| Call ended, session absent | Terminal application call; end job queued; occupancy retained; no invented session ID |
| Call ended, retained active/ended/different session | Permanent call termination takes precedence; last real stored session ID preserved |
| Active call, active matching session and both users | Existing ACTIVE reconciliation |
| Session ended, call not ended | No permanent call-end assertion; previously ACTIVE call moves to RECONNECTING under existing recovery deadline |
| Active call, no current session | Previously ACTIVE call moves to RECONNECTING; accepted/ringing call is not falsely marked active or permanently ended |
| Confirmed provider 404/code16 | Application call becomes terminal and queues end; observation alone does not release occupancy |
| Timeout, auth denial, non-404 code16 or other ambiguous error | Sync fails and remains retryable |
| Application row absent or already terminal | Existing safe skip/terminal guards; no recreated call or late ACTIVE resurrection |

The existing reconciliation RPC signature remains `rpc_connect_reconcile_media(uuid,text,uuid[],boolean)`. Its `p_ended` now explicitly means **permanent call termination or confirmed absence**, not session-only completion. Worker normalization preserves this distinction; a session-only end is represented by the real session ID and no live users. No media-verification field or successful received-media claim is manufactured.

Admission keeps its `(uuid,uuid) -> jsonb` signature. Successful authorization adds the mandatory discriminator:

```json
{
  "admitted": true,
  "id": "<call-id>",
  "user_id": "<authenticated-user>",
  "media": "voice",
  "call_type": "betweener_connect",
  "state": "<allowed-call-state>"
}
```

Expected denial returns normally:

```json
{"admitted":false,"error":"connect_unavailable"}
```

Device/feature denials use `connect_device_conflict` or `connect_disabled`. Denials contain no user ID, token or admission payload. Missing/unrelated calls and unauthenticated actors still raise before any call invalidation. Unexpected SQL failures still propagate; no broad exception handler disguises database faults.

The direct SQL/PostgREST admission RPC therefore returns HTTP 200 for a structured expected denial so its transaction can commit. The product-facing credentials Edge interprets that result and returns safe HTTP 403. Neither HTTP 200 nor the presence of an identity field is an authorization signal; only a fully validated affirmative result proceeds. The post-mint check is enforced equally. Already-performed provider side effects cannot be rolled back atomically with PostgreSQL; the existing durable end obligation remains necessary.

## 4. Permanent tests and fresh results

All results below were executed during this repair. Logs are under `tmp/connect-forensic-repair-1/`; retained historical provider evidence was not regenerated.

| Check | Before / after result | Evidence |
|---|---|---|
| Original offline Connect regressions | 87/87 before; all 87 included and passing afterward | `connect-before.log`; `offline-final.log` |
| Initial adapter/worker counterexamples | Initial 11: 3 pass / 8 fail; both forensic cases fail before correction | `adapter-before-normalized.log` |
| Provision-ended regression | Fails before the additional AD-1 guard, then passes | `provision-before.log`; `offline-final.log` |
| Final new adapter/worker tests | **14/14 PASS** | `connect-provider-observation.regression.test.ts`; `offline-final.log` |
| New credential-fence tests | **14/14 PASS** | `connect-credential-issuance.regression.test.ts`; `offline-final.log` |
| Relationship command regressions | **5/5 PASS**; combined offline run **120/120 PASS** | `offline-final.log` |
| Initial SQL reproduction | 10 groups: **2 pass / 8 fail** | `database-before.log` |
| Repaired SQL + adapter/worker integration | Same 10 groups pass; 8 additional integration groups pass: **18/18 PASS** | `database-after.log` |
| M1/M2 SQL authority, races and HTTP | **67/67 PASS**, including 6 separate-connection races, 6 HTTP cases and 15 ACL assertions | `authorization-final.log` |
| Consent revocation and lease concurrency | **20/20 PASS**, including 4 separate-connection race cases | `revocation-final.log` |
| Relationship security | **88 assertions, 6 races and 4 HTTP cases PASS**; also replays 9 historical vulnerability assertions before M0 repair | `relationship-after.log` |
| Relationship compatibility with repaired Connect installed | **88/88 PASS** during disposable Connect setup | Forensic/authorization/revocation/advisor run logs |
| App TypeScript | **PASS**, `tsc -p tsconfig.json --noEmit`, exit 0 after final adapter change | `typescript-final.log` |
| Strict Deno | **4/4 entrypoints PASS**, with `@ts-nocheck` removed in generated copies, cached Deno 2.5.4, no runtime execution | `deno-final.log` |
| Targeted ESLint | **PASS**, zero warnings; Edge files explicitly checked with `--no-ignore` | `lint-final.log`; `edge-lint.log`; `adapter-final-lint.log` |
| Environment isolation | Live, EAS project and Android variant checks **PASS** | `live-isolation.log`; `eas-isolation.log`; `android-isolation.log` |
| Live regressions | Before **504/508**, after **504/508**; exact same four failing test names | `live-before.log`; `live-after.log` |
| Supabase security advisor on disposable clone | Executed successfully; **zero Connect findings**. Full inherited schema is not clean: 32 WARN and 1 ERROR | `advisors-run.log`; `advisors-output.log` |

The advisor's ERROR is the inherited PostGIS `public.spatial_ref_sys` table without RLS. The other findings concern unrelated inherited objects. The corrected Connect functions have explicit execute restrictions and `search_path=pg_catalog`, verified by actual SQL assertions. No unrelated advisor finding was changed or represented as a whole-application security PASS. Supabase's function guidance supports fixed search paths and explicit privileges for privileged functions. [Supabase database functions](https://supabase.com/docs/guides/database/functions).

### What the new database tests prove

`scripts/test-connect-forensic-repair.cjs:45` reads committed state through a new connection **before** another expiry/get/sweep can repair it. After each expired/revoked denial, it verifies terminality, exactly one pending end job and two retained occupancy rows. Repeated denial does not increment terminal version or duplicate the job. Deadline expiry yields FAILED; lost consent/source eligibility yields ENDED.

The suite also checks concurrent admission/revoke, unsuccessful provider cleanup, stale completion rejection, null/wrong devices, explicit positive admission, ACLs/search paths, genuine database error propagation and PostgREST persistence. Its second half runs the **actual adapter and actual worker with actual SQL reconciliation**, using only mocked provider reads. It verifies both forensic cases, active/session-ended/both-ended/absent/missing states, call-end priority over a changed session, duplicate terminal events, late ACTIVE evidence and a failed reconciliation followed by retry with a new lease. All terminal cases retain occupancy pending end ACK and preserve the last real session identifier.

The relationship runner was executed from a temporary copy with only repository-root resolution and log destination adjusted; its assertions and SQL were unchanged. New output went to this repair's directory instead of overwriting `tmp/relationship-security/database-regression.log`.

The first authorization run encountered an existing test-timing failure: 20 separate Docker calls straddled the rate limiter's minute bucket, so the next call was not necessarily the 21st in one bucket. The test now sends the burst in one authenticated connection, catches only the expected 21st-call error in a subtransaction and commits the 20 successes. **No production throttle function or limit changed.** The final complete authorization run passes all 67 cases; the failed intermediate receipt is preserved in `authorization-after.log`.

### Live baseline comparison

The fresh before and after runs contain exactly these four failures, matching the documented baseline:

- `live-auth-recovery.regression.test.ts`: Live catalogue waits for real auth and reloads after auth recovery.
- `live-fullscreen-stage.regression.test.ts`: screen-only Program output follows the selected canvas and offers a focused view.
- `live-phase10g-studio-database.regression.test.ts`: audience Program output exposes no Studio access or private matching data.
- `live-room-safety.regression.test.ts`: standard Room Pulse keeps a curated, readable note preview.

Comparison ignores elapsed time but compares complete failing names and counts. Current unrelated worktree changes were present in **both** fresh runs. Live isolation PASS means no changed Live behaviour or new regression demonstrated by these checks; it does not mean the full Live suite is green.

## 5. Adjacent inspection and preserved boundaries

All Connect `connect_expire` call sites in the historical foundation migration were reviewed:

| Path | Finding |
|---|---|
| `rpc_connect_admission` | Confirmed write-then-raise defect; replaced in the new migration. Expected device/flag denials also return normally after expiry. |
| Idempotent `rpc_connect_create_call` branch | Expires then returns a snapshot; no later rejection rolls back newly discovered terminality. |
| `rpc_connect_act` | After expiry, returns terminal/ENDING snapshot **before** later version/device/action exceptions. Those later branches do not follow a new expiry transition. |
| `rpc_connect_get_call`; `rpc_connect_worker_snapshot` | Return after expiry rather than deliberately raising for its terminal result. |
| Reconcile / job completion / sweep | Retain their terminal guards and transactional worker semantics; no matching expected-denial rollback found. Arbitrary genuine database faults still roll back their transactions and require retry. |

The additional ended-result guards in credential issuance and provisioning close the same AD-1 observation problem. The fixture's old ignored post-admission return had to be corrected as part of DB-1's response-contract change. These changes are necessary to avoid introducing a denial bypass or acknowledging a permanently ended provider call as fresh creation.

Independent mutual relationship proof, directional consent, video-specific permission, account/block checks, dedicated provider roles/type, exact membership checks and webhook invalidation/signature handling are unchanged. Pair locking, device fencing, versioned actions, terminal absorption, durable end leases and explicit ACK checks remain. No occupancy-release SQL was relaxed. RLS/table permissions were not broadened; authenticated users still cannot invoke trusted reconciliation or claim worker jobs.

Existing uncertainties from report 19 remain outside this repair: deployed worker scheduling/liveness; strict Supabase session-revocation semantics; the end adapter's pre-existing code16 idempotency classification; alternative credentials during failed provider termination; and the distinction between a control ACK and actual SFU cessation. No speculative provider/SFU or native changes were made.

## 6. Rollback and future deployment considerations

**Nothing was deployed.** The historical migrations remain intact. A future release must coordinate the forward migration with updated credential and worker code while calling remains disabled.

In particular, do not run an old exception-only post-mint caller against the new structured-denial RPC. It would ignore a returned denial. Updated credential code against the old RPC fails closed because the old affirmative response lacks `admitted:true`; that is the safe compatibility direction. Deploying/reverting only half of the contract is not a safe enablement procedure.

Prefer a further corrective migration over editing/reversing established history. If rollback is needed, keep credential issuance disabled and keep affirmative validation in place. Preserve durable jobs and occupancy; do not delete them or restore the original rollback defect as a cleanup shortcut. No provider configuration rollback is needed because none changed.

## 7. Isolation, preservation and limitations

The baseline covered 228 existing modified/untracked files. Exactly 12 existing Connect implementation/test files changed intentionally; the other **216 baseline files are unchanged**, including unrelated Live/Circle/Studio/package work and report 19. Five implementation/test files plus this report were added. The new migration is the only migration added by this repair; historical M0/M1/M2A migration hashes are unchanged.

Retained provider receipts and proposals were preserved. The original boundary receipt still has SHA-256 `8c1d82141a5c5140c94ac2b65e2b09dca42ebbe1f0f8c87b852d6dacdffa501d`. No raw SFU experiment, provider fixture, cleanup script against Stream or shared database migration was run. The source DB was used only through the existing local fixture helper's schema-only cloning/preflight; all test mutations targeted explicitly named disposable databases. All test runs report successful database/REST teardown, and a final Docker check found no matching disposable REST containers.

A separate final original-app-database catalogue read was **rejected by automatic approval review** because it exceeded the disposable-test scope. It did not execute and was not retried indirectly. Accordingly, this report relies on executed test cleanup receipts and isolated-container checks, and makes no fresh post-run original-database catalogue attestation. No additional approval is needed to complete these source repairs.

Hosted Edge endpoints were not invoked. Native media, device audio routing and real-provider behaviour were not tested. The timer receipt still establishes increasing receiving counters after timer-ended metadata, with its internal cause unknown. Fixing observation/transaction semantics neither revokes an already admitted SFU peer by itself nor proves a timer is an enforceable media lease.

## 8. Final declarations

PASS below is scoped to these local defects, their regressions and isolation checks. It is not a release or SFU-security approval.

```text
CONNECT_ADAPTER_TERMINAL_STATE = PASS
CONNECT_SYNC_RECONCILIATION = PASS
CONNECT_ADMISSION_ATOMIC_CLEANUP = PASS
CONNECT_AUTHORISATION_REGRESSION = PASS
CONNECT_LIVE_ISOLATION = PASS
CONNECT_TIMER_MEDIA_BOUNDARY = UNVERIFIED
CONNECT_M2A_SECURITY_GATE = BLOCKED
CONNECT_M2B_READY = BLOCKED
PROVIDER_WRITES = NONE
SHARED_DATABASE_MODIFICATIONS = NONE
PRODUCTION_MODIFICATIONS = NONE
```
